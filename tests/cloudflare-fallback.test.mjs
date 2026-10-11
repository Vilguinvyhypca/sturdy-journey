import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHandler } from '../ops/cloudflare/worker.mjs';

const html = readFileSync(new URL('../public/offline.html', import.meta.url), 'utf8');
const env = {
  SITE_HOST: 'hymecymeyseh.fun',
  ASSETS: { fetch: async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }) },
};
function page(path = '/videos/example?sort=new', init = {}) {
  return new Request(`https://hymecymeyseh.fun${path}`, { headers: { accept: 'text/html' }, ...init });
}

for (const status of [400, 401, 403, 404, 429, 500, 502, 503, 504, 521, 522, 523, 524, 530]) {
  test(`navigation HTTP ${status} uses independently hosted fallback`, async () => {
    const handler = createHandler({ fetchOrigin: async () => new Response('Cloudflare/origin error', { status }) });
    const response = await handler.fetch(page(), env);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-mediaspace-fallback'), 'cloudflare');
    assert.match(await response.text(), /A little pause/);
  });
}

test('missing pages carry their status into the Go home recovery screen', async () => {
  const handler = createHandler({ fetchOrigin: async () => new Response('missing', { status: 404 }) });
  const response = await handler.fetch(page('/missing'), env);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  assert.match(await response.text(), /data-failure-status="404"/);
});

test('a fresh visitor receives the page when tunnel fetch throws', async () => {
  const handler = createHandler({ fetchOrigin: async () => { throw new Error('tunnel down'); } });
  const response = await handler.fetch(page(), env);
  assert.equal(response.status, 503);
  assert.match(await response.text(), /offline-video.mp4/);
});

test('stalled navigation is aborted and falls back', async () => {
  let signal;
  const handler = createHandler({ timeoutMs: 5, fetchOrigin: async (_, options) => {
    signal = options.signal;
    return new Promise(() => {});
  } });
  assert.equal((await handler.fetch(page(), env)).status, 503);
  assert.equal(signal.aborted, true);
});

for (const status of [200, 302, 307]) {
  test(`successful page / redirect ${status} is passed through`, async () => {
    const original = new Response('app', { status, headers: { 'Set-Cookie': 'test=session', Location: '/api/auth/signin' } });
    let received;
    let options;
    const handler = createHandler({ fetchOrigin: async (request, init) => { received = request; options = init; return original; } });
    const request = page();
    assert.equal(await handler.fetch(request, env), original);
    assert.equal(received, request);
    assert.equal(options.redirect, 'manual');
  });
}

for (const request of [
  page('/api/auth/signin'),
  page('/_next/static/app.js'),
  page('/videos', { headers: { accept: 'text/x-component', rsc: '1' } }),
  page('/api/upload', { method: 'POST', body: 'upload bytes' }),
  page('/api/local-playback?id=private', { headers: { range: 'bytes=100-199', cookie: 'session=private' } }),
]) {
  test(`preserves ${request.method} ${new URL(request.url).pathname} without navigation timeout`, async () => {
    const original = new Response('original', { status: 503 });
    const handler = createHandler({ fetchOrigin: async (received, options) => {
      assert.equal(received, request);
      assert.equal(options, undefined);
      return original;
    } });
    assert.equal(await handler.fetch(request, env), original);
  });
}

for (const path of ['/offline.html', '/offline-video.mp4', '/fonts/monofett.ttf', '/offline-sw.js']) {
  test(`${path} never needs the tunnel`, async () => {
    const handler = createHandler({ fetchOrigin: () => { throw new Error('must not reach origin'); } });
    const request = page(path);
    const asset = new Response('cached asset');
    assert.equal(await handler.fetch(request, { ...env, ASSETS: { fetch: async received => {
      assert.equal(received, request);
      return asset;
    } } }), asset);
  });
}

for (const [range, status, expected] of [
  ['bytes=2-4', 206, '234'],
  ['bytes=7-', 206, '789'],
  ['bytes=-3', 206, '789'],
  ['bytes=8-99', 206, '89'],
  ['bytes=99-', 416, ''],
  ['bytes=5-2', 416, ''],
  ['bytes=-0', 416, ''],
  ['bytes=invalid', 200, '0123456789'],
]) {
  test(`video range ${range} is served without origin`, async () => {
    const handler = createHandler({ fetchOrigin: () => { throw new Error('must not reach origin'); } });
    const response = await handler.fetch(page('/offline-video.mp4', { headers: { range } }), {
      ...env,
      ASSETS: { fetch: async () => new Response('0123456789', { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '10' } }) },
    });
    assert.equal(response.status, status);
    assert.equal(await response.text(), expected);
    if (status === 206) assert.equal(response.headers.get('content-length'), String(expected.length));
    if (status === 416) assert.equal(response.headers.get('content-range'), 'bytes */10');
  });
}

test('Cloudflare challenge remains interactive', async () => {
  const challenge = new Response('challenge', { status: 403, headers: { 'cf-mitigated': 'challenge' } });
  assert.equal(await createHandler({ fetchOrigin: async () => challenge }).fetch(page(), env), challenge);
});

test('preview host does not expose or proxy the app', async () => {
  const handler = createHandler({ fetchOrigin: () => { throw new Error('must not reach origin'); } });
  const response = await handler.fetch(new Request('https://mediaspace-fallback.example.workers.dev/'), env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /A little pause/);
});

test('HEAD failure has no body', async () => {
  const handler = createHandler({ fetchOrigin: async () => new Response(null, { status: 530 }) });
  const response = await handler.fetch(page('/', { method: 'HEAD', headers: { accept: 'text/html' } }), env);
  assert.equal(response.status, 530);
  assert.equal(await response.text(), '');
});

test('missing asset still has a readable recovery response', async () => {
  const handler = createHandler({ fetchOrigin: async () => { throw new Error('down'); } });
  const response = await handler.fetch(page(), { ...env, ASSETS: { fetch: async () => new Response(null, { status: 404 }) } });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /try again/);
});
