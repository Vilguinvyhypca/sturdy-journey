# MediaSpace project status

Last updated: 2026-10-18

## Feature-branch workflow — 2026-10-21

The owner requires changes to be committed and pushed to a feature branch before
review and merge into main. This rule is recorded in AGENTS.md. The accumulated
v1 completion/backlog documentation and upload/catalog reliability work are being
saved on `codex/v1-upload-reliability`; see that branch's commit history for the
checkpoint. Earlier sections describe the local development state at each step.
This checkpoint does not merge main or deploy production. The unrelated local
email-report script is excluded.

## Polling and deletion limits — development checkpoint

`codex/v1-poll-delete-limits` adds independent persistent quotas for private-photo
upload-status checks (600/minute) and media/album deletion (60/minute shared).
Authorization and input checks precede quota use, and quota rejection precedes
lookups or destructive side effects. The pending-photo checker respects retry
headers and retains its cooldown across changes to pending items. All 118 Node regressions, targeted lint, TypeScript, and diff checks passed.
These changes are saved on the feature branch, without merge or production deployment.
No live media deletion or production quota exhaustion was performed.

## Administrator sign-in and local-upload limits — 2026-10-22

Security work is on `codex/v1-auth-upload-limits`, stacked on the unmerged
reliability checkpoint `06e49a1`. Shared persistent rolling-window quotas cap
sign-in attempts at 10/minute and authenticated local uploads at 120/minute.
The policy deliberately ignores client-supplied forwarding headers. Quota
rejections include Retry-After, and NextAuth-compatible credentials responses
allow the administrator form to explain the wait. Session/CSRF/signout/OAuth
callback flows are not charged. Polling/destructive-action limits remain open.
See [operator notes and tradeoffs](docs/operations/admin-rate-limits.md).

The full suite passed 115 tests; targeted tests check concurrency, persistence,
expiry, state corruption, encoded paths, NextAuth response compatibility, and
rejection before upload storage. This checkpoint remains development-only;
main has not been merged and production has not been deployed.

## Browser-upload processing failures — development checkpoint

Video uploads now require a successful nonempty converted playback copy before
catalog insertion. Failed conversion returns a clear retryable HTTP 503 and
removes unaccepted originals and derivatives. Conversion, metadata probes,
thumbnail generation, and HEIC conversion have bounded subprocess runtimes.
Thumbnail failure remains optional when playback succeeds. Requests are checked
for cancellation before saving; cleanup failures are explicitly reported/logged.

All 112 Node regression tests, targeted ESLint, TypeScript, and diff checks passed.
New tests simulate converter failure, missing tools, empty output, and process
termination while using real storage/cleanup; successful FFmpeg codec/range tests
also passed. Tests cover successful retry, optional thumbnail failure, late
cancellation, catalog-write failure, cleanup failure, invalid HEIC cleanup, and
preservation of existing files. This remains local development work; no commit,
push, or deployment was made. Maintenance imports retain their separate private
original/log/nonzero-exit/retry behavior.

## Browser-upload video validation — development checkpoint

Local browser uploads now require FFprobe to identify a real video track and a
positive finite duration no longer than five minutes. Corrupt, audio-only,
cover-art-only, and unknown-duration files are rejected before processing/catalog
insertion. Missing/inaccessible or timed-out validators return temporary-unavailable
errors. The existing upload failure path deletes rejected files.

Real-file route tests cover corrupt bytes, audio-only content, empty uploads,
301-second rejection, exactly-300-second acceptance, and absence of rejected files
or saved records. Probe tests cover duration edge cases, cover art, and validator
outages. All 111 Node regression tests, targeted ESLint, TypeScript, and diff checks
passed. Changes are development only. Full decoding/conversion failures and the
folder importer's original-retention behavior remain separate work; existing media
was not modified or revalidated.

## Catalog writer coordination — development checkpoint

Development now uses a shared Linux flock for media/profile mutations, folder
imports, profile assignment, and playback backfills. Writers acquire it before
reading their mutable catalog snapshot; local deletion resolves its record and
removes files under the same lock. API lock contention returns retryable HTTP
503 responses. Playback backfills now honor MEDIA_DATA_DIR; profile assignment
replaces each JSON file atomically. See
[writer rules and limitations](docs/operations/catalog-writes.md).

Separate-process tests cover an app edit/delete/insert overlapping a real import,
duplicate protection across app processes, profile creation, lock contention,
exception release, and release after a killed writer. All 109 Node regressions,
three Python import-runner tests, targeted lint, TypeScript, and a separate
production-mode build passed. These
changes are local development work; no commit, push, or production deployment
has been performed for this checkpoint. Production remains on the loader release.

## Current completion plan — 2026-10-18

Use [MediaSpace v1 completion](docs/v1-completion.md) for the current finish line,
evidence audit, ordered remaining application milestones, and acceptance checks.
The older development phases below are historical and contain tasks already
implemented or outside the active local-storage scope. Backup and restore testing
are assigned to DevOps separately. The audit is not a fresh full-system test pass.

The transparent animated Hymecymeyseh video loader and autoplay fallback were
committed as `e815595` and deployed in isolated release
`20261018T170511790687Z-e8155951`. Build, TypeScript, six deployment tests,
pre/post-activation page/API/asset checks, and live browser playback/loader checks
passed. The user reviewed the design on iPhone before deployment.

## Administrator-only profile navigation — 2026-10-13

Commit `5d6a45bb` hides the gallery's All profiles link unless the session has
the administrator flag, including on public profile pages. Direct profile and
directory URLs remain available as agreed. Published isolated release
`20261013T120557272858Z-5d6a45bb` from a clean temporary worktree. Targeted lint,
TypeScript, all six deployment tests, production build, and pre/post-activation
page/API/326 asset checks passed. Unrelated untracked email-report code was not
included in the release.

## Cloudflare fallback deployed — 2026-10-12

Authorized live outage test completed at approximately 02:27–02:29 UTC on
October 13 (October 12 local time). The administrator scheduled a 90-second
systemd restart before stopping `cloudflared.service`. While the service was
inactive, a fresh browser with zero service-worker registrations and no
controller loaded `/photos` as the branded outage screen, preserving HTTP 530
with `X-MediaSpace-Fallback: cloudflare`, `no-store`, `noindex`, and Retry-After.
The fallback video played (readyState 4, paused false, no reported error); a
100-byte range request returned HTTP 206. The tunnel returned to active state,
and Try again restored the original `/photos` gallery. An independent curl
request then returned HTTP 200. First-visit tunnel outage recovery is verified.

Published `mediaspace-fallback` to account `9afebf2e437a76d70fa9a90d9ca6a9d1`,
version `7577aebe-98e1-4668-93ac-0418094c741f`, and attached route
`hymecymeyseh.fun/*` to zone `d45d1b3edd1a8a0e25177191d5e849dd`.
The existing `mailbridge-inbound` Worker was not modified.

Curl checks returned HTTP 200 for home, photos, videos, profiles, admin,
anonymous session reads, and all non-video fallback assets. A missing document
returned branded HTTP 404 with `X-MediaSpace-Fallback: cloudflare`, `no-store`,
and `noindex`. The fallback video returned HTTP 206 for bytes 100–199 with a
100-byte body. Browser verification rendered the missing-page message, loaded
the video to readyState 4 without a reported media error, and confirmed Go home
returns to the normal MediaSpace gallery. Initial Python HTTP requests received
403 responses; curl and browser checks subsequently verified the live route.

The live tunnel interruption and reconnect test subsequently passed as recorded
above. To bypass the fallback,
remove only the `hymecymeyseh.fun/*` route for `mediaspace-fallback`; DNS and
the tunnel destination do not need changing. The production app release is
unchanged.

## Cloudflare access restored — 2026-10-12

A privately stored account API token now returns HTTP 200 for the configured
account, zone, Worker routes, and Worker scripts. The zone currently has no
Worker routes; the account contains only `mailbridge-inbound`. The fallback
regression command and production deployment dry run passed after refreshing
the staged assets. No Worker was published and no route was attached during
these checks. Next: deploy `mediaspace-fallback`, verify normal public requests
and fallback responses, then arrange the live tunnel interruption test.

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
