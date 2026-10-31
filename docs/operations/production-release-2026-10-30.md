# PR #20 production release — October 30, 2026

Application source: `e4a17b4a74611c69f9a9b7b4abe3943178714db7`, merged PR #20.
Release: `20261031T031826605888Z-e4a17b4a` (UTC identifier; October 30 Eastern).
Rollback: `20261026T002940452940Z-315f826c`.
Site: https://hymecymeyseh.fun.

The owner merged PR #20 and authorized continuing with deployment. Local main
was fast-forwarded to origin/main and the managed `npm run deploy:prod` process
built and activated a fresh isolated release. No existing release was rebuilt.

## What changed

Completed uploads now enter the active gallery and its counts only when matching
the selected search, visibility and media type. Uploads still save successfully
when hidden by those filters. The merged branch also includes desktop administrator,
profile, avatar and folder/gallery acceptance records and regression tests.
No video conversion policy, existing media, catalog or Cloudflare Worker was changed
by this deployment. The previously optimized single-video playback file remains
4,207,743 bytes; its original upload and repair backup were not changed.

## Validation

- Application/tests match the previously checked `59a8e4f` exactly: all 135 Node
  tests, targeted ESLint and TypeScript passed for that source before merge.
- Fresh run: six deployment/rollback tests and four focused gallery-search/avatar
  regression tests passed.
- Production build succeeded. Temporary-server and activated-production smoke
  checks both passed, including pages/API and all 395 JavaScript/CSS assets.
- Live HTTPS health identified the new release. Homepage, photo/video lists,
  existing public video page, public media list, converted playback range (206),
  and thumbnail delivery passed. Private/no-store and security headers were present.
- A sampled private video's original/playback/thumbnail/page denied signed-out
  access (404); profiles API denied signed-out access (401).
- A temporary administrator session verified malformed input (400), oversized
  profile JSON (413) and an untrusted-origin mutation (403) are rejected. No valid
  content mutation was submitted; the session was signed out afterward.
- Disk after deployment: approximately 15 GiB free, 86% used. The earlier obsolete
  release cleanup was preserved; the new rollback target is the previous live release.

## Limits and rollback

No production fixture upload/delete or complete browser form walkthrough was
performed during this release verification; those retain development evidence.
iPhone/Safari, sound and remaining v1 audit/acceptance work are still open.
This is not overall project completion.

If required, `npm run rollback:prod` restores the previous validated application
release, not historical user data. The subsequent release-record commit changes
only documentation; production remains built from `e4a17b4`.
