import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/offline-sw.js', import.meta.url), 'utf8');
function worker(fetch, cached = true) {
  const handlers = {};
  const context = vm.createContext({
    self: { location: { origin: 'https://hymecymeyseh.fun' }, addEventListener: (type, fn) => { handlers[type] = fn; } },
    URL, Response, AbortController, fetch,
    caches: { open: async () => ({ match: async () => cached ? new Response('offline') : undefined }) },
    setTimeout: (fn) => setTimeout(fn, 10), clearTimeout,
  });
  vm.runInContext(source, context);
  return async () => {
    let response;
    handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://hymecymeyseh.fun/videos/example' }, respondWith: (value) => { response = value; } });
    return response;
  };
}
for (const status of [500, 502, 503, 504, 521, 522, 523, 524, 530]) {
  test(`HTTP ${status} shows cached offline page`, async () => {
    const response = await worker(async () => new Response('server error', { status }))();
    assert.equal(await response.text(), 'offline');
  });
}
for (const status of [200, 401, 403, 404, 429]) {
  test(`HTTP ${status} preserves original response`, async () => {
    const original = new Response('original', { status });
    assert.equal(await worker(async () => original)(), original);
  });
}
test('connection failure shows cached page', async () => {
  const response = await worker(async () => { throw new Error('unreachable'); })();
  assert.equal(await response.text(), 'offline');
});
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
