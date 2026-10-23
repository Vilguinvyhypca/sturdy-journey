# Offline page

The root layout registers `/offline-sw.js`. Once its installation has cached
`/offline.html` and `/offline-video.mp4`, a connection loss takes the visitor to
the standalone offline page. The retry link returns to their original URL.
Failed full-page navigations, server errors (HTTP 500–599, including Cloudflare
errors), and navigations that take more than 10 seconds also fall back to the
cached page. All navigation HTTP errors (400–599) use the cached fallback. Successful
responses and sign-in redirects are preserved. API responses are not replaced
with HTML. An already-open page redirects on a browser offline event or an uncaught
JavaScript error/rejection. Server outages are detected on navigation or reload.
Fallback responses preserve the original HTTP error status; connection failures
and timeouts return 503. Cloudflare security challenges pass through intact.
Missing-page fallbacks show “Page not found” with a Go home link.
React rendering and root-layout failures use custom error boundaries; missing
routes use a custom not-found screen with a Go home link. These share the
branded video experience and do not display exception details. Handled form
and upload errors keep their existing recovery messages.

The video plays muted on a loop, with native controls for sound and seeking.
Reduced-motion visitors must start playback manually; native video controls stay
visible, and autoplay starts only after checking the motion preference. The service worker serves
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

The app cannot replace browser-owned DNS/TLS errors on an uncached first visit.
The Cloudflare Worker fallback for new visitors is prepared separately; see
[Cloudflare fallback](cloudflare-fallback.md) for deployment and verification.
It is active only after publishing the Worker Route.

## Development verification — October 10, 2026

All 33 offline regression cases and 41 Cloudflare Worker cases passed. On the
HTTPS development host, browser checks confirmed offline video byte ranges
(100 requested bytes returned with HTTP 206), reconnect to the original photo
gallery, uncaught-runtime-error recovery, missing-page navigation, visible
paused controls under reduced motion, and normal video playback. A 390-pixel
phone viewport had no horizontal overflow. Temporary server-page and root-layout
failure triggers verified both React error boundaries and were removed.
Cloudflare deployment dry run passed. These checks do not establish live Worker
deployment or first-visit protection on the production domain.

Administrator writes through the HTTPS development alias also require the exact
origin in `MEDIA_ADMIN_ORIGINS=https://hymecymeyseh.tailcc86a8.ts.net:8443`.
See [administrator origin validation](operations/request-hardening.md#exact-administrator-origins).
