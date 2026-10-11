import { copyFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const assets = new URL('ops/cloudflare/assets/', root);
await mkdir(new URL('fonts/', assets), { recursive: true });
for (const name of ['offline.html', 'offline-video.mp4', 'offline-sw.js', 'fonts/monofett.ttf']) {
  await copyFile(new URL(`public/${name}`, root), new URL(name, assets));
}
console.log('Prepared Cloudflare fallback HTML, video, font, and service worker.');
