import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { generatePlayback } from '../scripts/local-thumbnail.mjs';
const exec = promisify(execFile);

test('upload and import conversion produce 8-bit H.264 and AAC-LC playback', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'playback-test-'));
  const previous = process.env.MEDIA_STORAGE_ROOT;
  process.env.MEDIA_STORAGE_ROOT = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.MEDIA_STORAGE_ROOT;
    else process.env.MEDIA_STORAGE_ROOT = previous;
    await rm(directory, { recursive: true, force: true });
  });
  const source = await readFile(new URL('../src/lib/local-storage.ts', import.meta.url), 'utf8');
  await writeFile(join(directory, 'storage.cjs'), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  const storage = createRequire(import.meta.url)(join(directory, 'storage.cjs'));
  for (const pixelFormat of ['yuv444p', 'yuv420p']) {
    const key = '11111111-1111-4111-8111-111111111111.mov';
    const original = join(directory, key);
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '0.3', '-c:v', 'libx264', '-pix_fmt', pixelFormat, '-c:a', 'pcm_s16le', '-y', original]);
    for (const convert of [() => storage.generateLocalPlayback(key), () => generatePlayback(original)]) {
      await convert();
      const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', `${original}.web.mp4`]);
      const streams = JSON.parse(stdout).streams;
      const video = streams.find((s) => s.codec_type === 'video');
      const audio = streams.find((s) => s.codec_type === 'audio');
      assert.equal(video.codec_name, 'h264');
      assert.equal(video.pix_fmt, 'yuv420p');
      assert.equal(audio.codec_name, 'aac');
      assert.equal(audio.profile, 'LC');
      const response = await storage.localMediaResponse(`${key}.web.mp4`, new Request('http://test/', { headers: { Range: 'bytes=0-15' } }));
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('Content-Type'), 'video/mp4');
      await response.arrayBuffer();
    }
  }
});
