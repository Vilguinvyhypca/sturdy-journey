import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
const source = await readFile(new URL('../src/components/ShareMediaButton.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
async function run(navigator) {
  const state = []; let index = 0;
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(code, { exports, navigator, URL, Error, window: { location: { origin: 'https://example.test' }, setTimeout: () => {} }, require: name => {
    if (name === 'react') return { useState: initial => { const key = index++; state[key] ??= initial; return [state[key], value => { state[key] = value; }]; } };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === './ExperienceTracker') return { trackExperience: () => {} };
    throw new Error(name);
  }});
  const tree = exports.ShareMediaButton({ mediaId: 'local:id', href: '/videos/local%3Aid', title: 'Video title' });
  await tree.props.children[0].props.onClick();
  return state;
}
test('native share receives the video page, with no clipboard write', async () => {
  let payload;
  const state = await run({ share: async data => { payload = data; }, clipboard: { writeText: () => assert.fail('Unexpected clipboard access') } });
  assert.equal(payload.url, 'https://example.test/videos/local%3Aid');
  assert.equal(payload.title, 'Video title');
  assert.equal(state[1], '');
});
test('clipboard fallback reports successful copying', async () => {
  let copied;
  const state = await run({ clipboard: { writeText: async url => { copied = url; } } });
  assert.equal(copied, 'https://example.test/videos/local%3Aid');
  assert.equal(state[0], 'Link copied');
});
test('missing or denied browser APIs expose the link for manual sharing', async () => {
  for (const navigator of [{}, { clipboard: { writeText: async () => { throw new Error('Denied'); } } }, { share: async () => { throw new Error('Not allowed'); } }]) {
    const state = await run(navigator);
    assert.equal(state[1], 'https://example.test/videos/local%3Aid');
    assert.equal(state[0], '');
  }
});
test('dismissing native sharing does not copy or show a fallback', async () => {
  const state = await run({ share: async () => { throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }); }, clipboard: { writeText: () => assert.fail('Unexpected copy') } });
  assert.equal(state[1], '');
});
