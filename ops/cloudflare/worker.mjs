const ASSET_PATHS = new Set([
  '/offline.html', '/offline-video.mp4', '/fonts/monofett.ttf', '/offline-sw.js',
]);

async function videoAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  const range = request.headers.get('range');
  if (request.method !== 'GET' || !range || response.status !== 200) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  // Ignore malformed and multipart ranges, as allowed by HTTP.
  if (!match || (!match[1] && !match[2])) return response;
  const bytes = await response.arrayBuffer();
  const size = bytes.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    headers.set('Content-Range', `bytes */${size}`);
    headers.delete('Content-Length');
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

function isPageRequest(request) {
  const url = new URL(request.url);
  return ['GET', 'HEAD'].includes(request.method)
    && !url.pathname.startsWith('/api/')
    && !url.pathname.startsWith('/_next/')
    && request.headers.get('rsc') !== '1'
    && (request.headers.get('sec-fetch-dest') === 'document'
      || request.headers.get('accept')?.includes('text/html'));
}

export function createHandler({ fetchOrigin = fetch, timeoutMs = 8000 } = {}) {
  async function fallback(request, env, status) {
    const url = new URL('/offline.html', request.url);
    const asset = await env.ASSETS.fetch(new Request(url, { method: request.method }));
    if (!asset.ok) {
      return new Response(request.method === 'HEAD' ? null : 'A little pause. Please try again shortly.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    const headers = new Headers(asset.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-MediaSpace-Fallback', 'cloudflare');
    headers.set('X-Robots-Tag', 'noindex');
    headers.delete('ETag');
    headers.delete('Content-Length');
    if (status >= 500) headers.set('Retry-After', '30');
    const html = request.method === 'HEAD' ? null : (await asset.text()).replace('<html lang="en">', `<html lang="en" data-failure-status="${status}">`);
    return new Response(html, { status, headers });
  }

  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (['GET', 'HEAD'].includes(request.method) && ASSET_PATHS.has(url.pathname)) {
        if (url.pathname === '/offline-video.mp4') return videoAsset(request, env);
        return env.ASSETS.fetch(request);
      }
      // workers.dev and local previews never proxy to the authenticated app.
      if (url.host !== env.SITE_HOST) return fallback(request, env, 200);

      // Keep uploads, media streams, APIs, RSC, and redirects intact.
      if (!isPageRequest(request)) return fetchOrigin(request);

      const controller = new AbortController();
      let timeout;
      try {
        const response = await Promise.race([
          fetchOrigin(request, { signal: controller.signal, redirect: 'manual' }),
          new Promise((_, reject) => {
            timeout = setTimeout(() => {
              controller.abort();
              reject(new Error('Origin navigation timed out'));
            }, timeoutMs);
          }),
        ]);
        if (response.status < 400) return response;
        // Do not replace interactive Cloudflare security challenges.
        if (response.headers.get('cf-mitigated') === 'challenge') return response;
        if (response.body) await response.body.cancel();
        return fallback(request, env, response.status);
      } catch {
        return fallback(request, env, 503);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export default createHandler();
