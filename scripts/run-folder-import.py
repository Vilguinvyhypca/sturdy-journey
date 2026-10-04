#!/usr/bin/env python3
"""Run an SSH-uploaded batch against an explicitly selected local catalog."""
import argparse
import base64
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

APP = Path(__file__).resolve().parents[1]
HOME = Path.home()


def checked(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def configuration(encoded):
    cfg = json.loads(base64.b64decode(encoded, validate=True))
    if cfg.get('target') not in ('Production', 'Development'):
        raise ValueError('Choose Production or Development.')
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', cfg['profile']) or len(cfg['profile']) > 60:
        raise ValueError('Invalid profile URL name.')
    source = Path(cfg['source']).resolve(strict=True)
    if not source.is_dir():
        raise ValueError('Source must be an uploaded directory.')
    return cfg, source


def run(encoded, apply):
    cfg, source = configuration(encoded)
    production = cfg['target'] == 'Production'
    release = (HOME / 'deployments/mediaspace/current').resolve() if production else APP
    if not (release / 'src/app/admin/profiles/[slug]/page.tsx').is_file():
        raise RuntimeError('The selected app does not support profiles yet. Deploy the profile-gallery changes first, or use -Target Development.')
    env_file = release / '.env.local'
    service = 'mediaspace.service' if production else 'mediaspace-dev.service'
    # Use the same Node binary as the service, independent of noninteractive SSH PATH.
    command = subprocess.check_output(['systemctl', '--user', 'show', service, '-p', 'ExecStart', '--value'], text=True)
    match = re.search(r'path=([^ ;]+)', command)
    if not match:
        raise RuntimeError('Could not locate the app service Node executable.')
    node = match.group(1)
    environment = dict(os.environ)
    # Do not inherit accidental catalog/credential overrides from the SSH session.
    for key in list(environment):
        if key.startswith(('MEDIA_', 'DATABASE_', 'POSTGRES_', 'BLOB_', 'MUX_', 'PRIVATE_BLOB_')):
            del environment[key]
    environment['PATH'] = str(Path(node).parent) + os.pathsep + environment.get('PATH', '/usr/bin:/bin')
    for tool in ('ffmpeg', 'ffprobe'):
        if not shutil.which(tool, path=environment['PATH']):
            raise RuntimeError(f'{tool} must be installed before importing.')
    # Require explicit, environment-specific managed paths before stopping anything.
    expected_data = HOME / ('deployments/mediaspace/shared/data' if production else 'media-dev-data')
    expected_storage = HOME / ('media-storage' if production else 'media-dev-storage')
    check = "const fs=require('node:fs');for(const [k,v] of Object.entries(JSON.parse(process.argv[1]))){if(!process.env[k]||fs.realpathSync(process.env[k])!==fs.realpathSync(v))throw Error('Unexpected '+k)}"
    checked([node, f'--env-file={env_file}', '-e', check, json.dumps({'MEDIA_DATA_DIR': str(expected_data), 'MEDIA_STORAGE_ROOT': str(expected_storage)})], env=environment)
    args = [node, f'--env-file={env_file}', str(APP / 'scripts/import-local-media.mjs'), '--source', str(source), '--profile', cfg['profile']]
    checked(args, cwd=APP, env=environment)
    if not apply:
        return
    lock_path = HOME / 'deployments/mediaspace/deploy.lock' if production else HOME / 'media-dev-data/import.lock'
    with lock_path.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Recheck after taking the deployment lock.
        if production and (HOME / 'deployments/mediaspace/current').resolve() != release:
            raise RuntimeError('Production changed during preflight; rerun the import.')
        if subprocess.run(['systemctl', '--user', 'is-active', '--quiet', service]).returncode:
            raise RuntimeError('The app service is not active; refusing to change its catalog.')
        print(f'Pausing {service} for catalog import and processing.', flush=True)
        try:
            checked(['systemctl', '--user', 'stop', service])
            checked(args + ['--apply'], cwd=APP, env=environment)
        finally:
            checked(['systemctl', '--user', 'start', service])
            checked(['systemctl', '--user', 'is-active', '--quiet', service])
            print(f'{service} restarted.', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--launch', action='store_true')
    parser.add_argument('--apply', action='store_true')
    opts = parser.parse_args()
    cfg, source = configuration(opts.config)
    if opts.launch:
        run(opts.config, False)
        unit = 'mediaspace-import-' + source.parent.name
        if not re.fullmatch(r'[a-zA-Z0-9-]+', unit):
            raise ValueError('Invalid batch directory name.')
        log = source.parent / 'import.log'
        checked(['systemd-run', '--user', '--collect', f'--unit={unit}',
                 f'--property=StandardOutput=append:{log}', f'--property=StandardError=append:{log}',
                 sys.executable, '-u', str(Path(__file__).resolve()), '--config', opts.config, '--apply'])
        print(f'Import started in background. Log: {log}', flush=True)
        print(f'Status: systemctl --user status {unit}', flush=True)
    else:
        run(opts.config, opts.apply)
        print('Import completed.' if opts.apply else 'Preflight passed.', flush=True)


if __name__ == '__main__':
    main()
