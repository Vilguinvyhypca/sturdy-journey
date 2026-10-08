# Offline page

The root layout registers `/offline-sw.js`. Once its installation has cached
`/offline.html` and `/offline-video.mp4`, a connection loss takes the visitor to
the standalone offline page. The retry link returns to their original URL.
Failed full-page navigations, server errors (HTTP 500–599, including Cloudflare
errors), and navigations that take more than 10 seconds also fall back to the
cached page. Successful responses and client errors such as 401, 403, and 404
are preserved. An already-open page does not automatically detect a server
outage; the fallback applies on a full-page navigation or reload.

The video plays muted on a loop, with native controls for sound and seeking.
Reduced-motion visitors must start playback manually. The service worker serves
byte ranges from the cached MP4 so playback and seeking work without a network.
Only the offline page, video, and local Monofett font are cached, not authenticated
pages or API data.

Offline support requires HTTPS (or localhost), a completed online visit, and
browser storage. A first visit made entirely offline cannot install the cache.
The static page can be previewed directly at `/offline.html`.

For phone testing, the development server is also available over Tailscale at
`https://hymecymeyseh.tailcc86a8.ts.net:8443`. Include
`hymecymeyseh.tailcc86a8.ts.net` in `MEDIA_DEV_ORIGINS` in `.env.local`
and restart `mediaspace-dev.service` after changing it. Otherwise Next.js blocks
the app's JavaScript through this hostname, preventing offline registration.

When changing the offline HTML, video, or font, increment `CACHE` in
`public/offline-sw.js` so existing visitors receive the new assets.

Verification: open the app online, wait for `navigator.serviceWorker.controller`,
then set the browser network to offline. Check the redirect, video playback,
seeking, and reload. Restore the connection and click Try again to return.
