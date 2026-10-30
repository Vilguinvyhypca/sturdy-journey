# MediaSpace v1 completion checklist

Audited: 2026-10-18. This is the working completion plan for the current
self-hosted application. It supersedes the ordering of historical phases in
`PROJECT_STATUS.md`; it does not certify unchecked work or authorize deployment.

## Current release status — 2026-10-26

The owner approved merging/deploying the accumulated work through `315f826`.
It is now on main and active in production release
`20261026T002940452940Z-315f826c`. References below to development-only or pending
branches describe their earlier checkpoints; the runtime changes are now deployed.
See [release validation and remaining work](operations/production-release-2026-10-26.md).
This release does not certify completion of the unchecked milestones or DevOps
recovery acceptance.

## Finish line

One administrator can manage profiles and their local photos/videos. Visitors
can browse public profiles and play published media without signing in. Private
media stays administrator-only; unlisted media works by direct link and stays
out of public discovery. Uploads, edits, visibility changes, and deletion behave
reliably, and failures provide useful feedback. The release has recorded security,
browser, and deployment evidence and no unresolved defects that block these flows.

Application completion and DevOps recovery acceptance are separate sign-offs.
New optional features do not extend this checklist automatically.

## Existing implementation and evidence

These are starting points, not a fresh certification of every workflow:

| Area | Evidence | Remaining verification |
| --- | --- | --- |
| Profile galleries and administration | `docs/operations/profile-galleries.md`, `src/lib/profiles.ts`, profile routes | Final public/admin walkthrough, including profile isolation |
| Visibility and public filtering | `tests/profile-gallery.test.mjs`, local-media/playback/thumbnail authorization | Complete route-level access matrix below |
| Catalog writes | `src/lib/db.ts`: serialized writes, atomic replacement, and per-profile duplicate check inside insertion; concurrency regression tests | App and maintained import commands now share a cross-process writer lock in development; see `operations/catalog-writes.md` |
| Upload size and duration | Streaming 500 MB limit and FFprobe duration checks in `src/lib/local-storage.ts` | Development now rejects unreadable durations and files without real video tracks; browser processing failures are handled below |
| Local playback and thumbnails | Converted playback copies, faststart, byte-range and playback tests; browser uploads now require successful nonempty conversion in development | Final new-upload and phone walkthrough; maintenance imports retain their separately documented original/retry behavior |
| Provider records | `src/lib/media-storage.ts`, database storage transaction tests | Existing implementation supersedes the old task to design a record from scratch; database-backed profiles remain explicitly unsupported |
| Recovery screens | Offline and Cloudflare regression suites; historical live outage evidence in project status | Final regression pass; do not repeat a live outage without an agreed window |
| Branded video loader | Commit `e815595`, production release `20261018T170511790687Z-e8155951`; browser checks and user iPhone review | Include gallery and profile feed in final acceptance |
| Releases and rollback | `docs/deployments.md`, six deployment tests, validated isolated loader release | Record final release identity and acceptance results |

## Remaining application milestones, in order

### 1. Catalog and upload correctness

- [x] Make duplicate checking and insertion atomic for participating app processes in the current local catalog,
  retaining the existing per-profile duplicate policy. Two concurrent uploads of
  identical content to one profile must produce one record and a clear duplicate
  response; the rejected upload must not leave stored files behind. Verified by
  `tests/local-upload-concurrency.test.mjs` using overlapping route requests, the
  real catalog implementation, and disposable original/thumbnail/playback files.
  Storage tests also cover concurrent duplicates, cross-profile reuse, legacy
  default profiles, and successful writes after rejection. Implemented in
  development; not yet deployed. Validation: all 105 tests in
  `npm run test:storage`, targeted ESLint, TypeScript, and `git diff --check` passed.
  Cross-process protection was added in development on 2026-10-20; see the writer
  coordination item below. Older production code does not yet participate.
- [x] Test overlapping uploads, edits, imports, and deletion against the supported
  writer model. App media/profile writers, imports, profile assignment, and
  playback backfills now share a Linux flock before reading their mutable snapshot.
  Separate-process tests cover app edits/deletion/insertion alongside a real
  direct import, duplicate rejection, profile writes, contention, exceptions, and
  killed writers. See [writer rules and limitations](operations/catalog-writes.md).
  This is implemented in development only and is not a crash-safe multi-file
  transaction; old/custom writers must not bypass the protocol.
- [x] Resolve invalid-video acceptance for browser uploads: reject corrupt or
  unreadable files, absent/cover-art-only video tracks, and unknown/nonpositive
  duration; enforce the five-minute boundary and clean up rejected files before
  catalog insertion. Real-file route tests cover corrupt bytes, audio-only files,
  301-second videos, empty files, and acceptance at exactly 300 seconds. Probe
  edge-case tests cover unknown duration, cover art, and validator outages;
  existing storage tests cover streaming size limits and abort cleanup.
  Implemented in development only. This is metadata validation, not proof of
  successful full decoding; browser conversion failures are handled in the next
  checklist item. The folder importer retains originals under its existing behavior. Validation:
  all 111 Node regressions, targeted ESLint, TypeScript, and diff checks passed.
- [x] Make browser-upload playback-conversion failures visible and recoverable:
  a successful nonempty playback copy is now required before catalog insertion.
  Failure returns a clear retryable HTTP 503 instead of saving the original as
  ready. Conversion/probe/thumbnail/HEIC processes have bounded runtimes; temporary
  and unaccepted files are cleaned up. An optional thumbnail failure does not
  reject a playable video and is logged. Recheck cancellation before insertion;
  cleanup failures are explicitly reported and logged for the administrator.
  Tests cover failed/empty/missing/killed converters, retry success, thumbnail
  failure, invalid HEIC cleanup, cancellation after processing, catalog-write
  failure, cleanup failure, and preservation of existing files. Implemented in
  development only. Maintenance imports retain originals privately, log processing
  failures, exit nonzero, and retry conversion on rerun; these commands have not
  been changed into the browser upload's reject-and-remove workflow. All 112 Node
  regressions, targeted ESLint, TypeScript, and diff checks passed.

### 2. Access control and security

- [x] Add bounded application-level rate limits for administrator sign-in,
  local upload creation, private-photo status polling, and media/album deletion. Test rejection, recovery,
  trusted client identity behind Cloudflare, and normal administrator use.
  The experience-event endpoint already has a per-session limiter; this does not
  establish coverage of administrator routes.
  Development now limits login attempts to 10/minute and authenticated local
  uploads to 120/minute with persistent shared quotas. See
  [administrator request limits](operations/admin-rate-limits.md) for the global
  policy, proxy-header tradeoff, and tests. The follow-up feature branch adds
  private-photo status polling (600/minute), a shared media/album deletion allowance
  (60/minute), and client Retry-After handling. These additions remain unmerged and
  undeployed. All 118 Node regressions, targeted lint, TypeScript, and diff checks
  passed. The general endpoint-security review below still covers other mutation
  paths; inactive legacy cloud-upload creation is not a new local v1 blocker.
- [ ] Audit request origins, input/file validation, response caching, security
  headers, and JSON-LD serialization for the active local-storage paths. Record
  fixes and regression evidence; local media already has private/no-store and
  several security headers, so preserve existing protections.
  The first hardening pass on `codex/v1-request-hardening` fixes malformed media
  edit JSON, thumbnail cache lifetime, legacy video JSON-LD escaping, and baseline
  response headers. See [findings and open review work](operations/request-hardening.md).
  The follow-up `codex/v1-bounded-admin-json` branch adds a 64 KiB streaming
  JSON-object limit and content-type/UTF-8 validation to media PATCH and profile
  POST/PATCH after authorization. The pending origin-validation branch restricts
  administrator mutations to exact configured origins without trusting forwarded
  hosts. The theme-input/media-cache follow-up applies the JSON limit to theme
  PATCH and private/no-store to all handled media-list GET responses. See the
  findings document for tests and remaining scope. The broader input/cache review
  and route authorization matrix remain open; this audit item stays unchecked.
- [ ] Add route-level authorization tests for anonymous, administrator, and
  authenticated non-administrator sessions across media lists, individual pages,
  original bytes, converted playback, thumbnails, profile updates, uploads,
  edits, and deletion. Cover public, unlisted, and private visibility; test that
  public previews remain public-only even during an administrator session.
  The pending `codex/v1-media-authorization-matrix` branch adds isolated original,
  playback, thumbnail, photo/video page and metadata role/visibility matrices,
  public-list isolation, and anonymous/member mutation-denial tests. See
  [coverage and limits](operations/media-authorization.md). The final browser
  walkthrough and runtime cache/HEAD checks are still pending; keep this item
  open until the remaining acceptance evidence is recorded.
  A [desktop browser review on October 24](operations/browser-access-review-2026-10-24.md)
  verified disposable-video visibility transitions, sign-out denial, byte ranges,
  runtime HEAD responses, basic playback and deletion against development source
  `e6667df`. Photo workflows, form interaction and iPhone acceptance remain open.

### 3. Administrator clarity

- [ ] Complete the explicit task in `docs/backlog.md`: distinguish administration
  from public preview with an Admin mode indicator, a distinct header, grouped
  management controls, and a clear profile context. Verify phone and desktop
  layouts and keyboard access; public visitors must not receive management UI.

### 4. Application maintenance and documentation

- [ ] Record administrator changes and important application failures with enough
  context to diagnose them, without logging passwords, session tokens, or private
  file contents. Define retention and how the operator reviews failures.
- [ ] Document the local catalog as the current production source of truth,
  its supported writer model, and the supported storage/provider combinations.
  Reconcile Prisma/runtime SQL documentation for retained legacy support; a Neon
  migration is not required to finish the local-storage application.
- [ ] Update README and project status to reflect local production and the
  current release workflow; mark historical Vercel/Mux instructions explicitly.
  Confirm the active traffic-report schedule/recipients and diagnostics in the
  operator documentation without bundling unrelated email-service changes.

### 5. Final acceptance and application sign-off

- [ ] Run applicable Node, Python, lint, TypeScript, and production build checks.
  Record results and distinguish any accepted existing warnings from failures.
- [ ] Walk through profile creation/editing, upload, duplicate rejection, media
  edits, visibility transitions, search/filter/pagination, sharing, and deletion
  using disposable development data as administrator and public visitor.
- [ ] Verify photo viewing and video startup, buffering, pause/resume, sound,
  swiping, and loader behavior on the user's iPhone and a desktop browser.
  Document observed loading behavior; adaptive streaming is not a v1 promise.
- [ ] Deploy the approved application changes through the isolated release
  process, verify public pages/API/media and private-access denial, and record
  the release/commit and rollback target. Destructive tests use disposable data.
- [ ] Record owner acceptance of the core workflows and any explicit nonblocking
  limitations. No unresolved data-loss, unauthorized-access, or broken-core-flow
  defects may be silently moved into the optional backlog.

## DevOps handoff — separate owner

Server snapshots, backup transfer/integrity, restore testing, recovery machines,
host accounts/firewall/tunnel administration, and infrastructure monitoring belong
to DevOps, per the user's direction. DevOps should provide its recovery sign-off;
application work must not claim a successful restore without that evidence.
See the existing operations proposals for the historical recovery scope.

## Outside this v1 finish line

- Social notification monitoring, automated retrieval, and import review queues.
- Subscriber accounts, paid plans, and billing.
- Mux webhook rollout or renewed Mux adoption (explicitly out of current scope).
- Adaptive streaming, optional album covers, location features, and iCloud imports.
- Migration to Neon/Vercel or new provider-selection policies.

Required fixes discovered during acceptance remain required. Changes to product
scope should be recorded explicitly rather than inferred from the optional backlog.

## Latest development acceptance evidence

[October 25 photo browser review](operations/photo-browser-review-2026-10-25.md):
disposable PNG upload, duplicate rejection, private/unlisted/public transitions,
signed-out image rendering and deletion/file cleanup passed on source `3c1cf76`.
iPhone/Safari and click-through administrator forms remain pending; this does not
close the broader audit or authorize a merge/deployment.

[October 27 administrator form review](operations/admin-form-review-2026-10-27.md):
real desktop sign-in, photo/video file-input uploads, detail/visibility forms,
delete controls and sign-out passed on development source `7e74b08`. Both fixtures
and their stored files were removed. See the record for native-confirmation
handling limits. iPhone, profile-management and remaining acceptance work stay open.

[October 28 profile form review](operations/profile-form-review-2026-10-28.md):
desktop creation, duplicate-URL and HTTPS-link validation, editing with a fixed
URL, public-preview isolation and signed-out rendering passed on source `d8764b1`.
The empty temporary profile was removed under the writer lock and the original
profiles were verified unchanged. Actual avatar selection and iPhone checks stay open.

[October 29 profile-photo review](operations/avatar-review-2026-10-29.md):
selection offered only a public photo belonging to the profile; private and
other-profile API assignments were rejected. Public rendering fell back to
initials when the selected photo became private, moved or was deleted, and
restored the image when eligible again. New avatar regression tests cover these
rules. All temporary media/profiles were removed; production was unchanged.

[October 29 folder/gallery review](operations/folder-gallery-review-2026-10-29.md):
nested photo-folder import, unsupported-file skipping, load-more pagination,
search and type/visibility controls passed on desktop development. A real issue
was found: completed uploads polluted active search/visibility results and counts.
`codex/v1-folder-gallery-acceptance` fixes insertion/counting to respect the active
filters and adds upload-handler regressions. The fix remains unmerged/undeployed;
iPhone and broader acceptance remain open. All temporary files/profile were removed.
