import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/offline-sw.js', import.meta.url), 'utf8');
function worker(fetch, cached = true, html = 'offline') {
  const handlers = {};
  const context = vm.createContext({
    self: { location: { origin: 'https://hymecymeyseh.fun' }, addEventListener: (type, fn) => { handlers[type] = fn; } },
    URL, Response, AbortController, fetch,
    caches: { open: async () => ({ match: async () => cached ? new Response(html) : undefined }) },
    setTimeout: (fn) => setTimeout(fn, 10), clearTimeout,
  });
  vm.runInContext(source, context);
  return async (request = {}) => {
    let response;
    handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://hymecymeyseh.fun/videos/example', ...request }, respondWith: (value) => { response = value; } });
    return response;
  };
}
for (const status of [400, 401, 403, 404, 408, 429, 500, 502, 503, 504, 521, 522, 523, 524, 530]) {
  test(`HTTP ${status} shows cached offline page`, async () => {
    const response = await worker(async () => new Response('server error', { status }))();
    assert.equal(await response.text(), 'offline');
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
}
for (const status of [200, 201, 302]) {
  test(`HTTP ${status} preserves original response`, async () => {
    const original = new Response('original', { status });
    assert.equal(await worker(async () => original)(), original);
  });
}
test('connection failure shows cached page', async () => {
  const response = await worker(async () => { throw new Error('unreachable'); })();
  assert.equal(await response.text(), 'offline');
  assert.equal(response.status, 503);
});

test('Cloudflare security challenges are not replaced by cached HTML', async () => {
  const challenge = new Response('challenge', { status: 403, headers: { 'cf-mitigated': 'challenge' } });
  assert.equal(await worker(async () => challenge)(), challenge);
});

test('cached missing-page recovery carries 404 into the Go home screen', async () => {
  const html = readFileSync(new URL('../public/offline.html', import.meta.url), 'utf8');
  const response = await worker(async () => new Response('missing', { status: 404 }), true, html)();
  assert.equal(response.status, 404);
  assert.match(await response.text(), /data-failure-status="404"/);
});

for (const [range, status, text] of [
  ['bytes=1-3', 206, 'ffl'],
  ['bytes=-2', 206, 'ne'],
  ['bytes=4-', 206, 'ine'],
  ['bytes=99-', 416, ''],
  ['bytes=-0', 416, ''],
  ['bytes=9007199254740993-', 416, ''],
]) {
  test(`cached video supports ${range}`, async () => {
    const response = await worker(() => { throw new Error('must use cache'); })({
      url: 'https://hymecymeyseh.fun/offline-video.mp4', mode: 'cors', headers: new Headers({ range }),
    });
    assert.equal(response.status, status);
    assert.equal(await response.text(), text);
  });
}
test('hanging navigation is aborted and shows cached page', async () => {
  let signal;
  const response = await worker((_, options) => { signal = options.signal; return new Promise(() => {}); })();
  assert.equal(signal.aborted, true);
  assert.equal(await response.text(), 'offline');
});
test('missing cache preserves server error', async () => {
  const original = new Response('server error', { status: 503 });
  assert.equal(await worker(async () => original, false)(), original);
});
test('missing cache and connection failure returns network error', async () => {
  const response = await worker(async () => { throw new Error('unreachable'); }, false)();
  assert.equal(response.type, 'error');
});

for (const request of [
  { mode: 'cors', url: 'https://hymecymeyseh.fun/api/media' },
  { method: 'POST' },
  { url: 'https://other.example/page' },
]) {
  test(`does not intercept ${JSON.stringify(request)}`, async () => {
    const response = await worker(() => { throw new Error('must not fetch'); })(request);
    assert.equal(response, undefined);
  });
}
