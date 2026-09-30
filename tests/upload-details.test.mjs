import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

test('video metadata timeout and errors allow upload with unknown duration', async () => {
  const source = await readFile(new URL('../src/lib/upload-details.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const scenario of ['timeout', 'error', 'metadata', 'abort']) {
    let timeout;
    let revoked = 0;
    const video = { remove() {}, removeAttribute() {}, load() {} };
    const exports = {};
    vm.runInNewContext(code, {
      exports, require: () => ({}),
      document: { createElement: () => video },
      URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => revoked++ },
      setTimeout: (callback, delay) => { assert.equal(delay, 10_000); timeout = callback; return 1; },
      clearTimeout() {},
    });
    const controller = new AbortController();
    const result = exports.readUploadDetails({ type: 'video/mp4', size: 123 }, controller.signal);
    if (scenario === 'timeout') timeout();
    if (scenario === 'error') video.onerror();
    if (scenario === 'metadata') { video.duration = 12; video.onloadedmetadata(); }
    if (scenario === 'abort') controller.abort();
    assert.equal((await result).durationSeconds, scenario === 'metadata' ? 12 : null);
    timeout();
    assert.equal(revoked, 1);
    assert.equal(video.onloadedmetadata, null);
    assert.equal(video.onerror, null);
  }
});
