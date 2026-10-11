# Cloudflare tunnel fallback

`ops/cloudflare/worker.mjs` runs on a Worker Route in front of the existing
`hymecymeyseh.fun` tunnel. DNS and the tunnel destination remain unchanged.
The Worker forwards requests to that existing origin using `fetch(request)`.
For full-page GET/HEAD requests, HTTP 400–599 responses, fetch failures, and
an eight-second origin timeout produce the branded video page stored with
the Worker. This covers fresh browsers without a service worker or cache,
including tunnel error 1033 returned with HTTP status 530.

The fallback retains an origin error's HTTP status. A 404 uses the missing-page
message and Go home link; other failures offer Try again. Recovery responses
include noindex instructions. Connection failures and
timeouts return 503. Fallback responses are not cached, so Try again can reach
the recovered app. Redirects and successful pages retain their response and
session cookies. Cloudflare challenges remain interactive. APIs, uploads,
Next.js RSC payloads, and media streams are passed through without the page
timeout or HTML replacement; the app handles their recovery UI.

The HTML, MP4, font, and offline service worker are copied from `public/` to an
ignored staging directory. Only those four public files are uploaded, not the
app, credentials, catalog, or user media. Matching assets are served from Cloudflare without needing the tunnel. The
video goes through the Worker for explicit byte-range support and seeking;
other matching assets use direct static serving. Non-production hosts are fallback previews only and do not proxy the
authenticated app. workers.dev publishing is disabled; the account does not
have a registered workers.dev subdomain. Preview on the live domain at
`/offline.html` after deployment.

## Install, preview, and publish

From the development checkout:

```bash
npm ci --prefix ops/cloudflare
npm run test:cloudflare
npm run cloudflare:preview -- --local --ip 127.0.0.1 --port 8787
```

Open `http://127.0.0.1:8787/` for the preview. The video and local font must
load. Check a Range request to `/offline-video.mp4` returns 206 with the
requested bytes. This local preview never requires the physical server.

Authenticate with `npm run cloudflare:login` in a terminal on this server,
or provide a scoped `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` through
the deployment environment. Keep tokens out of chat and Git. Deployment needs
Workers Scripts edit permission for the account, Workers Routes edit permission
for the zone, and the account/zone read permissions needed by Wrangler.

```bash
# Build and inspect without changing Cloudflare:
npm run cloudflare:prepare
npm --prefix ops/cloudflare exec -- wrangler deploy --config ops/cloudflare/wrangler.jsonc --env production --dry-run

# Upload assets and attach the Worker to the public domain:
npm run cloudflare:deploy
```

The deploy command uploads the page and assets automatically. No manual file
upload is required. The base Wrangler configuration has no production routes;
only `--env production` attaches `hymecymeyseh.fun/*`.

After deployment verify normal home/gallery navigation, sign-in redirects,
media playback, and the fallback preview at `/offline.html`. Verify a missing
page has branded HTML and no-store headers. A real disconnected-tunnel test
requires an agreed interruption; do not stop the live tunnel just to test.
Until this is published and verified, the live site has no confirmed Worker
fallback. Remove the Worker Route in Cloudflare to bypass this Worker without
changing the tunnel. Removing the route also removes first-visit protection.

## Limits

The free Workers quota counts requests running the script, including proxied
app requests. Direct static asset requests are free and unlimited; video range handling
invokes the Worker and counts toward its quota. Quota exhaustion,
security rules that run before the Worker, Cloudflare platform outages, and
browser DNS/TLS failures are outside this fallback's coverage.

References: [Worker Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/),
[Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
