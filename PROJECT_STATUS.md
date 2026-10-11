# MediaSpace project status

Last updated: 2026-10-11

## Cloudflare access follow-up — 2026-10-11

The user identified zone `d45d1b3edd1a8a0e25177191d5e849dd` in account
`9afebf2e437a76d70fa9a90d9ca6a9d1`. Production Wrangler configuration now targets
those IDs explicitly. The current OAuth login returned HTTP 403 for the zone,
its Worker routes, and that account's scripts. Authentication with access to
the supplied account is required before publishing the fallback there. The
production app and Mailbridge configuration were not changed by these checks.

## Production deployment — 2026-10-10

Commit `f175ad25` is deployed as `20261011T011349405759Z-f175ad25` (UTC
release timestamp). Deployment safety tests passed (6 cases); the release passed
page/API and all 304 JavaScript/CSS asset checks before and after activation.
Previous release `20261008T155856178054Z-358c9880` is retained for rollback.

Public-domain checks passed for home, photos, videos, profiles, admin sign-in,
anonymous session reads, the 404 recovery screen, fallback assets, and HTTP 206
byte-range delivery for fallback and public local videos. The production browser
installed `mediaspace-offline-v6` and rendered the branded missing-page screen.
With network disabled only in the test browser, cached video delivered 100 bytes
with HTTP 206, and reconnect/Try again returned to the original `/photos` route.

Cloudflare Worker upload succeeded, version `ca6f3968-7449-427e-87b5-621ceae7d3a4`.
Route attachment failed: Wrangler could not find the `hymecymeyseh.fun` zone.
The configured OAuth identity lists zero accessible zones. The public 404
response has no `X-MediaSpace-Fallback` header. First-visit/tunnel-1033 protection
remains blocked until the owning zone account grants route access; no tunnel
interruption test was performed. Earlier Worker version
`51dac19e-5762-4e7c-a38e-06d9e091f837` remains available as a rollback reference.

## Active scope — 2026-10-10

Mux is out of scope. Historical Mux webhook tasks below are not current work or
release blockers. Current development focuses on local media delivery and the
pending error screens, cached offline recovery, and Cloudflare fallback.
At the start of verification, production was `20261008T155856178054Z-358c9880`;
see the deployment record above for the current release.

The development fallback now preserves HTTP error status, distinguishes missing
pages with a Go home action, preserves Cloudflare challenges, and leaves manual
video controls visible for reduced-motion visitors. All 33 offline and 41 Worker
regression cases pass. TypeScript passes; lint has five existing warnings and
the changed React files lint cleanly. The production build passed outside the
sandbox; the sandbox attempt failed to parse TypeScript subprocess output.

Browser verification on the HTTPS development host confirmed cached offline
recovery, 206 video ranges, reconnect to the original gallery, uncaught runtime
error recovery, missing-page actions, reduced-motion controls, normal playback,
and a phone viewport without horizontal overflow. Temporary page and root-layout
failure triggers confirmed both React boundaries and were removed afterward.
Cloudflare assets were refreshed and its deployment dry run passed. No production
app or Cloudflare deployment was performed; live first-visit fallback remains
unverified until publication.

The user also confirmed the Firefox/Windows 10 manual checks: reduced motion
kept playback paused, missing-page navigation returned home, and offline video
playback/seeking plus reconnect returned to the photo gallery.

## Development checkpoint — 2026-10-04

The pending development work is saved together because gallery, upload, and
visitor-tracking changes share components and media contracts. This checkpoint
includes profile administration and public browsing, filename search, local
catalog caching, folder imports and playback retries, HEIC/HEIF upload conversion,
private-photo processing cards, and the visitor-experience report.

Validation on October 4: all 18 Node regression tests and all 3 Python folder-import
runner tests passed; TypeScript passed; ESLint passed with five existing warnings.
The Node suite required execution outside the sandbox for FFmpeg subprocesses.
Changed files were reviewed for credential patterns, with no candidates found.

This is a development checkpoint, not a release certification. No production build
or new browser walkthrough was run today. The previously reported Next.js build
failure needs rechecking before deployment. Windows PowerShell transfer and real
HEIC conversion still need end-to-end verification. Production was not changed.
Two rough `media-import-plan.txt` notes remain local and untracked.

Site Analytics is the intended long-term home for visitor-event storage and
reporting. Its Day 3 backend is saved separately; Day 4 browser collection is next.
Plan replacement of MediaSpace's tracker during integration to avoid collecting
visits twice. Older sections below describe historical milestones and backlog;
they are not a current deployment inventory.

## Deployment update — 2026-09-23

Production now runs on the home server behind Cloudflare, from versioned releases
outside the development checkout. Development remains on Tailscale port 3001;
production listens on loopback port 3000. Source/builds, dependencies, environment
files, catalogs, and upload directories are separated. Production uses the local
catalog and local media storage. Older Vercel-era status details below describe
available integrations rather than the current production configuration.

`npm run deploy:prod` builds and validates a new release before switching the
production service, with automatic rollback on failed activation. Completed
releases reject in-place builds. See [deployment operations](docs/deployments.md).

## Agreed strategic direction

The planned production architecture is self-hosted: the public domain reaches the MediaSpace web application on the private home server through a protected outbound tunnel or isolated reverse proxy, and MediaSpace authorizes each local media stream or download. The home network, administration interfaces, and storage paths must not be exposed directly.

Local storage will hold the larger video catalog. Mux remains available for a limited set of selected or higher-traffic videos, Vercel Blob can continue serving photos, Neon can remain the authoritative catalog, and Vercel can continue providing preview deployments during the transition. This is a MediaSpace-specific service and does not depend on Jellyfin.

## Live today

- Public Next.js media site deployed on Vercel.
- Public media delivery through Vercel Blob and Mux, with signed delivery for newly uploaded protected media.
- GitHub sign-in; only `Vilguinvyhypca` can upload or delete media.
- Photo viewer, video playback, generated video previews, and file-name-free cards.
- Public visitors can browse media without signing in.
- Public, unlisted, and private visibility enforced across listings, individual pages, APIs, metadata, and the sitemap.
- Individual photo and video pages, including protected-photo share links.

- Local media deletion: delete removes both the local file and its local catalog entry.
- Neon database tables for media, albums, and the media-to-album links are created automatically when the database is connected.
- New uploads create both a Blob file and a matching database media record.
- The Albums page now reads from the database and lets the administrator create albums.
- The administrator can assign a photo or video to one or more albums from its viewer.
- Album cards open public album pages that show their assigned media.
- The main library can be filtered by album, photos, or videos.
- The administrator can edit album details or delete an album without deleting its media files.
- The upload control supports selecting multiple photos and videos at once, with upload progress.
- Multi-file uploads show a progress overlay with file count, elapsed time, and an estimated time remaining.
- New uploads save file size, video duration, and a photo's original date when readable from its metadata; these details appear in the viewer.
- New uploads are checked for exact duplicate file content before they are stored.
- One administrator scan can save fingerprints, file size, and readable photo dates for earlier Blob uploads without changing or deleting any files.
- The main gallery shows library totals and storage tracked from media metadata, and initially renders 48 files at a time with a Load more control.
- Gallery photos use Vercel image optimization and caching to deliver smaller thumbnail-sized images.
- Production uploads go directly from the browser to Vercel Blob while the app still verifies the administrator, blocks exact duplicates, and saves media details. Files up to 500 MB are accepted by this upload flow.
- Public and administrator gallery reads now use Neon as the primary catalog instead of listing and reconciling Vercel Blob on every request.

## Recommended development order

### Architecture transition: design before migration

- [x] Agree on the single-domain request path: public domain -> protected gateway -> home-hosted MediaSpace -> authorized media delivery.
- [ ] Define the home-server threat model, tunnel/reverse-proxy choice, TLS termination, firewall boundaries, and emergency shutdown procedure.
- [ ] Design a provider-neutral video record and migration for `mux` and `home` without breaking existing playback IDs or links.
- [x] Specify the authenticated local-media contract, including visibility checks, HTTP range requests, thumbnails, and offline responses. Signed expiry and a dedicated web-server handoff remain future work.
- [ ] Define storage directories, least-privilege service accounts, backups, monitoring, upload-bandwidth limits, and recovery procedures.
- [ ] Build and test the home delivery service privately before pointing the public domain at it.
- [ ] Run a staged public rollout and retain a documented rollback path to the current Vercel deployment.

### Phase 1: Finish public discovery and routing

- [x] Make `/videos` show videos and `/photos` show photos instead of rendering the unfiltered general feed.
- [x] Repair or remove the nonfunctional `/upload` route.
- [x] Make media cards link to their individual photo or video pages while preserving the enhanced viewer experience.
- [x] Server-render the initial public library results so visitors and search crawlers receive useful media content before client hydration.

### Phase 2: Improve catalog reliability and scale

- [x] Make public catalog reads database-first instead of listing Blob storage and synchronizing records during every gallery request.
- [x] Move Blob reconciliation to upload completion or an explicit administrator/background scan.
- [x] Add database-driven cursor pagination for media and albums.
- [ ] Deploy and configure the locally implemented verified Mux webhook finalization flow, then confirm it with a real test upload. The code is on `codex/mux-webhook`; production still needs `MUX_WEBHOOK_SECRET` and the Mux endpoint configuration.
- [ ] Add database-level duplicate protection and use transactions or bulk operations where appropriate.

Database-driven cursor pagination means Neon returns the first group of media records plus a cursor identifying the last record. When a visitor selects **Load more**, MediaSpace sends that cursor to Neon and requests the next group instead of downloading the entire catalog during the initial page load. The visual behavior remains the same, but this improves page speed, network usage, and memory use as the library grows to hundreds or thousands of files.

### Phase 3: Harden security and maintenance

1. Add rate limiting to sign-in, upload creation, polling, and destructive endpoints.
2. Add security headers, safer JSON-LD serialization, explicit private-response caching rules, and stronger upload validation.
3. Add audit records and operational error monitoring.
4. Add automated authorization tests covering anonymous, administrator, public, unlisted-link, and private access.
5. Choose one database schema strategy and remove drift between the Prisma representation and runtime SQL migrations.

### Future product direction: administrator-managed social profiles

MediaSpace will have one administrator account. The administrator manages the
public-facing profiles, their photos and videos, and each profile's public
details. Subscriber accounts, paid plans, entitlements, and subscription billing
are not part of the current product plan.

The next product work after core reliability is improving the administrator
dashboard and building an import workflow for tracked creators' social updates:

1. Improve the dashboard for managing profiles, their media, visibility, and
   import status from one place.
2. Track configured social accounts and receive new-post notifications at a
   dedicated email address. The separately developed C email service
   ([MAGURO-045](https://github.com/ShizukoFujiki/MAGURO-045)) is intended to
   provide this receiver. Its current v1 is a private HTTP message/file API and
   does not yet receive email or read a mailbox, so inbound email support is a
   prerequisite for monitoring TikTok notifications.
3. Match each notification to the correct MediaSpace profile and create an
   import item with the source post, account, media type, and detected date.
4. Retrieve media through an authorized, supported source and show the result in
   an administrator review queue.
5. Let the administrator assign or confirm the profile, edit details, and publish
   the imported photo or video to that profile on hymecymeyseh.fun.

Keep notification monitoring, media retrieval, and publishing as separate steps
so a missing or unusable source file does not create a broken public post. Once
the email receiver is identified, integrate through its documented API or
standard IMAP; do not assume the current MAGURO-045 message API provides inbox
access. Select the supported media-retrieval method during feature design, and
keep account-to-profile matching independent of a particular social platform.

## Backlog

- Set up encrypted scheduled backups to a separate remote computer over Tailscale or SSH, including media storage, the catalog, service and tunnel configuration, restore instructions, integrity checks, and completion-time email notifications.
- [x] Show a temporary processing card for private photos and refresh it automatically when the upload callback saves the photo to the catalog.
- Standardize the Vercel Neon connection variable from `DATABASE_URL_DATABASE_URL` to `DATABASE_URL` after confirming the live database connection.
- Add optional album cover images.
- Hover/press-and-hold muted video previews. (Implemented in `VideoThumbnail`; needs a browser smoke test.)
- Adaptive video streaming for large or high-resolution videos, with automatic quality changes on slower connections.
- Optional location handling with privacy controls.
- iCloud import workflow (deferred for now).
- Decide which videos remain on Mux using an explicit administrator choice or a traffic-based policy instead of upload order alone.

## Release checklist

- Run `npm run build`.
- Review `git diff origin/main..HEAD`.
- Push changes with `& "C:\Program Files\Git\cmd\git.exe" push`.
- Wait for Vercel deployment to become Ready.
- Test as both a public visitor and the admin account.
