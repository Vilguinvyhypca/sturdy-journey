import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

test('new private uploads immediately return the converted playback URL', async () => {
  const source = await readFile(new URL('../src/app/api/local-upload/route.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let saved;
  const id = 'local:11111111-1111-4111-8111-111111111111';
  const key = '11111111-1111-4111-8111-111111111111.mp4';
  const mocks = {
    "@/lib/rate-limit": { limitAdminAction: async () => null },
    '@/lib/profile-types': { defaultProfileId: 'default', mediaProfileId: () => 'default' },
    '@/lib/profiles': { getProfile: async () => ({ id: 'default' }) },
    'next-auth': { getServerSession: async () => ({ user: { isAdmin: true } }) },
    '@/lib/auth': { authOptions: {}, isAdmin: () => true },
    '@/lib/db': { DuplicateMediaError: class extends Error {}, readMedia: async () => [], addMedia: async (media, storage) => { saved = { media, storage }; } },
    '@/lib/database': { usesDatabase: false },
    '@/lib/media': { normalizeOriginalFileName: (value) => value },
    '@/lib/local-storage': {
      usesLocalStorage: true, maximumLocalUploadBytes: 500 * 1024 * 1024,
      storeLocalUpload: async () => ({ id, url: `/api/local-media?id=${encodeURIComponent(id)}`, contentHash: 'hash', size: 123, storage: { provider: 'local', objectKey: key, access: 'private' } }),
      probeLocalVideoDuration: async () => 5,
      generateLocalThumbnail: async () => {},
      generateLocalPlayback: async () => `${key}.web.mp4`,
    },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => { assert.ok(name in mocks, name); return mocks[name]; }, Response, URL, console, process });
  const response = await exports.POST(new Request('http://localhost/api/local-upload', { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-Media-Name': 'test.mp4' }, body: 'fixture' }));
  assert.equal(response.status, 201);
  const { media } = await response.json();
  assert.equal(media.url, `/api/local-playback?id=${encodeURIComponent(id)}`);
  assert.equal(media.visibility, 'private');
  assert.equal(saved.media.visibility, 'private');
  assert.equal(saved.storage.playbackObjectKey, `${key}.web.mp4`);
});
