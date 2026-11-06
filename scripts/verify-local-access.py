#!/usr/bin/env python3
"""Verify a built local app using disposable media/data and fixture-only credentials.

Requires npm run build, Node/Sharp, FFmpeg and Linux flock. Never starts or changes
production services. Every fixture is held in an automatically removed temporary
directory. Uses a random localhost port and stops its child app on exit.
"""
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

repo = Path(__file__).resolve().parents[1]
if not __debug__:
    raise SystemExit('Run without -O/PYTHONOPTIMIZE so access assertions remain enabled.')
if not (repo / '.git').exists() or (repo / 'release.json').exists():
    raise SystemExit('Run this check from a development Git checkout, not a deployment release.')
if not (repo / '.next/BUILD_ID').is_file():
    raise SystemExit('Build the development checkout first with npm run build.')
source_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
build_id = (repo / '.next/BUILD_ID').read_text().strip()
with tempfile.TemporaryDirectory(prefix='mediaspace-access-http-') as temporary:
    root = Path(temporary)
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    password = secrets.token_urlsafe(24)
    env = dict(os.environ, NODE_ENV='production', NEXT_DIST_DIR='.next',
               NEXTAUTH_URL=base, NEXT_PUBLIC_SITE_URL=base, MEDIA_ADMIN_ORIGINS='',
               NEXTAUTH_SECRET=secrets.token_urlsafe(32), ADMIN_PASSWORD=password,
               DATABASE_URL='', DATABASE_URL_DATABASE_URL='', POSTGRES_URL='',
               MEDIA_DATA_DIR=str(root / 'data'), MEDIA_STORAGE_ROOT=str(root / 'media'),
               MEDIA_UPLOAD_PROVIDER='local', BLOB_READ_WRITE_TOKEN='', BLOB_STORE_ID='',
               PRIVATE_BLOB_READ_WRITE_TOKEN='', PRIVATE_BLOB_STORE_ID='')
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(jar))
    def call(path, payload=None, headers=None):
        req = urllib.request.Request(base + path, data=payload, headers=headers or {})
        try:
            response = opener.open(req, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()
    (root / 'data').mkdir()
    (root / 'media').mkdir()
    subprocess.run(['node', '-e', "const sharp=require('sharp');Promise.all([sharp({create:{width:8,height:8,channels:3,background:'#4466aa'}}).png().toFile(process.argv[1]),sharp({create:{width:8,height:8,channels:3,background:'#4466aa'}}).jpeg().toFile(process.argv[2])]).catch(()=>process.exit(1))", str(root / 'fixture.png'), str(root / 'fixture.jpg')], cwd=repo, check=True, timeout=15)
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32:r=10', '-t', '0.2', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-y', str(root / 'fixture.mp4')], check=True, timeout=30)
    records = []
    for visibility in ['public', 'unlisted', 'private']:
        for kind in ['photo', 'video']:
            key = str(uuid.uuid4()) + ('.png' if kind == 'photo' else '.mp4')
            identity = 'local:' + key.rsplit('.', 1)[0]
            stored = {'provider': 'local', 'objectKey': key, 'playbackId': None, 'access': 'private'}
            (root / 'media' / key).write_bytes((root / ('fixture.png' if kind == 'photo' else 'fixture.mp4')).read_bytes())
            if kind == 'video':
                stored['playbackObjectKey'] = key + '.web.mp4'
                (root / 'media' / stored['playbackObjectKey']).write_bytes((root / 'fixture.mp4').read_bytes())
                (root / 'media' / (key + '.jpg')).write_bytes((root / 'fixture.jpg').read_bytes())
            records.append({'id': identity, 'title': 'fixture-' + visibility + '-' + kind, 'description': 'fixture-description-' + visibility + '-' + kind, 'type': kind, 'url': '/api/local-media?id=' + urllib.parse.quote(identity), 'visibility': visibility, 'createdAt': 'Just now', 'album': 'Uploads', 'storage': stored})
    (root / 'data/media.json').write_text(json.dumps(records))
    log = open(root / 'server.log', 'w+')
    server = subprocess.Popen(['node', 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', str(port)], cwd=repo, env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        for attempt in range(100):
            if server.poll() is not None:
                log.seek(0)
                raise RuntimeError(log.read())
            try:
                if call('/api/health')[0] == 200:
                    break
            except OSError:
                pass
            time.sleep(0.2)
        else:
            raise RuntimeError('Fixture server did not become ready')
        checks = 0
        def login():
            csrf = json.loads(call('/api/auth/csrf')[2])['csrfToken']
            form = urllib.parse.urlencode({'csrfToken': csrf, 'password': password, 'callbackUrl': base + '/admin', 'json': 'true'}).encode()
            assert call('/api/auth/callback/credentials', form, {'Content-Type': 'application/x-www-form-urlencoded', 'Origin': base})[0] == 200
        def signout():
            csrf = json.loads(call('/api/auth/csrf')[2])['csrfToken']
            form = urllib.parse.urlencode({'csrfToken': csrf, 'callbackUrl': base, 'json': 'true'}).encode()
            assert call('/api/auth/signout', form, {'Content-Type': 'application/x-www-form-urlencoded', 'Origin': base})[0] == 200
        def fetch(path, method='GET', headers=None, payload=None):
            req = urllib.request.Request(base + path, headers=headers or {}, data=payload, method=method)
            try:
                response = opener.open(req, timeout=15)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                return response.status, response.headers, response.read()
        for phase in ['anonymous', 'member', 'administrator', 'signed-out-after-admin']:
            if phase == 'member':
                token = subprocess.check_output(['node', '-e', "require('next-auth/jwt').encode({secret:process.env.NEXTAUTH_SECRET,token:{sub:'fixture-member',name:'Fixture member',isAdmin:false}}).then(value=>process.stdout.write(value))"], cwd=repo, env=env, timeout=10).decode()
                opener.addheaders = [('Cookie', 'next-auth.session-token=' + token)]
                session = json.loads(call('/api/auth/session')[2])
                assert session['user']['isAdmin'] is False
            if phase == 'administrator':
                opener.addheaders = []
                jar.clear()
                login()
            if phase == 'signed-out-after-admin': signout()
            admin = phase == 'administrator'
            for surface in ['/api/profiles', '/api/upload-config', '/api/experience']:
                status, headers, body = fetch(surface)
                assert status == (200 if admin else 401), (phase, surface, status)
                cache_policy = headers.get('Cache-Control', '')
                assert 'no-store' in cache_policy and 'public' not in cache_policy, (phase, surface, cache_policy)
                if admin and surface == '/api/upload-config': assert json.loads(body)['local'] is True
                checks += 1
            if not admin:
                for surface, method in [('/api/local-upload', 'POST'), ('/api/media', 'PATCH'), ('/api/profiles', 'POST')]:
                    status, headers, body = fetch(surface, method, {'Origin': base, 'Content-Type': 'application/json'}, b'{')
                    assert status == 401, (phase, surface, method, status)
                    assert headers.get('Cache-Control') == 'private, no-store'
                    checks += 1
            for item in records:
                allowed = admin or item['visibility'] != 'private'
                encoded = urllib.parse.quote(item['id'])
                path = ('/photos/' if item['type'] == 'photo' else '/videos/') + encoded
                status, headers, body = fetch(path)
                html = body.decode()
                if allowed:
                    assert status == 200, (phase, path, status)
                assert (item['title'] in html) == allowed, (phase, path, status, 'title authorization')
                assert (item['description'] in html) == allowed, (phase, path, status, 'description authorization')
                assert 'no-store' in headers.get('Cache-Control', ''), (path, headers.get('Cache-Control'))
                if item['visibility'] != 'public': assert 'noindex' in html
                checks += 1
                surfaces = ['/api/local-media?id=' + encoded]
                if item['type'] == 'video': surfaces += ['/api/local-playback?id=' + encoded, '/api/local-thumbnail?id=' + encoded]
                for surface in surfaces:
                    for method in ['GET', 'HEAD']:
                        status, headers, body = fetch(surface, method)
                        assert status == (200 if allowed else 404), (phase, surface, method, status)
                        assert headers.get('Cache-Control') == 'private, no-store'
                        if method == 'HEAD': assert body == b''
                        if allowed:
                            assert headers.get('X-Content-Type-Options') == 'nosniff'
                            assert headers.get('Cross-Origin-Resource-Policy') == 'same-origin'
                            assert int(headers['Content-Length']) > 0
                            if method == 'GET': assert len(body) == int(headers['Content-Length'])
                        checks += 1
                    if allowed and 'thumbnail' not in surface:
                        status, headers, body = fetch(surface, headers={'Range': 'bytes=0-3'})
                        assert status == 206 and len(body) == 4
                        assert headers['Content-Range'].startswith('bytes 0-3/')
                        assert headers.get('Cache-Control') == 'private, no-store'
                        checks += 1
            status, headers, body = fetch('/api/media?limit=50')
            listing = json.loads(body)['media']
            expected_ids = {item['id'] for item in records if admin or item['visibility'] == 'public'}
            assert {item['id'] for item in listing} == expected_ids, (phase, 'listing authorization')
            assert headers.get('Cache-Control') == 'private, no-store'
            status, headers, body = fetch('/p/hymecymeyseh')
            html = body.decode()
            assert status == 200
            for item in records:
                assert (item['title'] in html) == (item['visibility'] == 'public'), (phase, item['title'], 'public profile filter')
            checks += 2
        result = {'runtimeChecks': checks, 'roles': ['anonymous', 'member', 'administrator', 'signed-out-after-admin'], 'fixtures': 6, 'administratorApiGates': 'passed', 'pageMetadataAndCache': 'passed', 'originalPlaybackThumbnailGetHeadRange': 'passed', 'listingAndPublicProfileFiltering': 'passed', 'isolatedTemporaryData': True, 'sourceCommit': source_commit, 'buildId': build_id}
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
        log.close()
print(json.dumps({**result, 'serverStopped': True, 'temporaryDataRemoved': not root.exists()}))
