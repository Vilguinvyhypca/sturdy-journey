const CACHE = "mediaspace-offline-v6";
const NAVIGATION_TIMEOUT_MS = 10000;
const ASSETS = ["/offline.html", "/offline-video.mp4", "/fonts/monofett.ttf"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("mediaspace-offline-") && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function offlineAsset(request, pathname) {
  const cache = await caches.open(CACHE);
  const response = await cache.match(pathname);
  if (!response) return fetch(request);
  const range = request.headers.get("range");
  if (!range || pathname !== "/offline-video.mp4") return response;
  const bytes = await response.arrayBuffer();
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return response;
  const start = match[1] ? Number(match[1]) : Math.max(0, bytes.byteLength - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.byteLength) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.byteLength}` } });
  }
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`,
      "Content-Length": String(end - start + 1),
    },
  });
}

async function navigate(request) {
  const controller = new AbortController();
  let timeout;
  try {
    const response = await Promise.race([
      fetch(request, { signal: controller.signal }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("Navigation timed out"));
        }, NAVIGATION_TIMEOUT_MS);
      }),
    ]);
    if (response.status < 400) return response;
    if (response.headers.get("cf-mitigated") === "challenge") return response;
    const cache = await caches.open(CACHE);
    const fallback = await cache.match("/offline.html");
    if (!fallback) return response;
    if (response.body) await response.body.cancel();
    return failureResponse(fallback, response.status);
  } catch {
    const cache = await caches.open(CACHE);
    const fallback = await cache.match("/offline.html");
    return fallback ? failureResponse(fallback, 503) : Response.error();
  } finally {
    clearTimeout(timeout);
  }
}

async function failureResponse(cached, status) {
  const html = (await cached.text()).replace('<html lang="en">', `<html lang="en" data-failure-status="${status}">`);
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(offlineAsset(request, url.pathname));
  } else if (request.mode === "navigate") {
    event.respondWith(navigate(request));
  }
});
