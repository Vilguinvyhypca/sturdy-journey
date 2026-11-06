# Production release — November 6, 2026

Site: https://hymecymeyseh.fun.
Source: `4717446f53bc781265c21759dca3dee4486abf6f` (merged main).
Release: `20261106T225749970236Z-4717446f`.
Rollback: `20261031T031826605888Z-e4a17b4a`.

The owner authorized deploying the merged changes. The managed `npm run deploy:prod`
process built a fresh isolated release, validated it, switched current, restarted
production and validated it again. No existing release was rebuilt. The service
is active and public HTTPS health identifies the new release.

## Included changes

- PR #21 blocks the legacy public upload fallback in local mode and makes handled
  upload/media/theme mutations and administrator config/usage responses private/no-store.
- PR #22 validates photo format, dimensions and first-frame decoding before browser
  uploads enter the catalog, with a 64-megapixel limit. Ordinary accepted originals
  retain their bytes/quality. HEIC/HEIF keeps its existing JPEG conversion with
  container/result checks. Existing media was not rescanned.
- PR #23 uses configured origins, strict streamed JSON/UTF-8 and shared rolling
  visitor-event quotas (60/session/minute and 1,200 overall/minute), with retry
  responses and private report headers. Reporting schedules/recipients are unchanged.
- PR #24 bounds album JSON and makes handled album responses private/no-store.
  Database albums remain disabled; no cloud provider was enabled.
- PR #25 adds repeatable isolated built-app access verification and documentation.

## Validation

- Merged main passed 147 Node regressions and six deployment/rollback tests.
- A fresh development build and all 176 runtime access checks passed at `4717446`,
  build `P18Ehv6PTVT916b4mnH7d`. Four roles and six generated fixtures covered page
  privacy, administrator APIs, exact listings, public-only profiles, GET/HEAD/ranges
  and sign-out denial. The temporary server stopped and its fixtures were removed.
- The isolated production build passed. Both temporary-server and activated-service
  checks validated pages, media API and all 417 JavaScript/CSS files.
- Live HTTPS checks passed for release identity/security headers, home/photo/video
  lists, a current public video page, public media filtering, playback range (206)
  and thumbnail delivery (200).
- A sampled private video's original/playback/thumbnail/page denied anonymous
  access (404). Administrator profile/config/report APIs denied anonymous requests
  (401), with private/no-store. Local album listing remained empty.
- The legacy upload fallback returned 503; invalid event origin/type returned
  403/415 without recording test events. A temporary administrator session verified
  malformed input (400), oversized profile JSON (413) and an untrusted-origin
  mutation (403), then signed out. No valid production content mutation or fixture
  upload/delete was submitted.
- Disk after activation: approximately 12 GiB available, 89% used. No user media
  or obsolete releases were deleted. The previous live release is retained.

## Remaining acceptance and rollback

iPhone/Safari, browser decoding/autoplay/sound, browser form interaction, CDN/browser
cache acceptance and the remaining endpoint audit stay open. Automated HTTP checks
do not establish overall v1 completion or DDoS protection.

`npm run rollback:prod` restores the previous application/configuration release,
not historical user data. This subsequent release-record commit changes only
documentation; production remains built from `4717446`.
