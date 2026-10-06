# Offline page

The root layout registers `/offline-sw.js`. Once its installation has cached
`/offline.html` and `/offline-video.mp4`, a connection loss takes the visitor to
the standalone offline page. The retry link returns to their original URL.
Failed full-page navigations also fall back to the cached page.

The video plays muted on a loop, with native controls for sound and seeking.
Reduced-motion visitors must start playback manually. The service worker serves
byte ranges from the cached MP4 so playback and seeking work without a network.
Only the offline page and video are cached, not authenticated pages or API data.

Offline support requires HTTPS (or localhost), a completed online visit, and
browser storage. A first visit made entirely offline cannot install the cache.
The static page can be previewed directly at `/offline.html`.

When changing the offline HTML or video, increment `CACHE` in
`public/offline-sw.js` so existing visitors receive the new assets.

Verification: open the app online, wait for `navigator.serviceWorker.controller`,
then set the browser network to offline. Check the redirect, video playback,
seeking, and reload. Restore the connection and click Try again to return.
