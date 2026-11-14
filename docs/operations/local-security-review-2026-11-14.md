# Active local-storage security review — November 14, 2026

Reviewed application source `bc058954` (with documentation-only edits during this
review). Scope: the local JSON catalog, local byte delivery and administrator
workflow. This is a bounded code and regression review, not a penetration test or
acceptance of every retained cloud provider. No media visibility was changed and
no new bulk-private feature was implemented.

## Route inventory and findings

| Surface | Reviewed behavior | Regression evidence |
| --- | --- | --- |
| NextAuth credentials | Password comparison is timing-safe; administrator claim is assigned server-side; login submission/provider-start quotas are shared and persistent. NextAuth retains its CSRF/session handling. | `admin-rate-limit.test.mjs`; built-app sign-in, member JWT and sign-out checks |
| Media PATCH/DELETE | Administrator check precedes exact configured-origin validation. PATCH has a 64 KiB streaming JSON-object limit and field/type limits. DELETE uses the shared deletion quota and locked local catalog mutation. Handled responses are private/no-store. | `admin-origin`, `bounded-admin-json`, `poll-delete-limits`, `local-upload-boundary`, `catalog-writers` suites |
| Profile POST/PATCH | Administrator-only, configured origins, bounded JSON, slug/name/link limits and HTTPS-only social links without embedded credentials. Avatar assignment requires a public local photo owned by that profile; public rendering rechecks eligibility. | `bounded-admin-json`, `admin-origin`, `profile-avatar-access` suites |
| Theme PATCH | Administrator-only, configured origins, bounded JSON and an allowlisted theme. Handled writes use private/no-store; GET contains only public theme settings. | `theme-input-media-cache.test.mjs` |
| Local upload POST | Administrator and origin checks precede quota/storage. Supported MIME allowlist, streaming 500 MiB cap, actual image validation (64 megapixels), real video-track/duration checks and required nonempty browser playback. Uploads start private. Cancellation, conversion failure and rejected duplicates clean up unaccepted files. | Local storage/image/video/upload-processing/concurrency suites |
| Local original/playback/thumbnail GET/HEAD | Catalog authorization precedes file lookup. Public and unlisted direct links work; private files require administrator access. UUID-based object-key allowlist, outside-repository storage and no-follow file opens constrain delivery. Responses use private/no-store, nosniff and same-origin resource policy; originals/playback also use a restrictive CSP. | `media-authorization-matrix`, `local-storage`, `local-playback`; built-app access matrix |
| Media lists and individual photo/video pages | Visitors and members cannot discover private/unlisted items in public lists. Direct unlisted pages are noindex. Private page metadata is denied to visitors; public previews stay public-only during an administrator session. Session-dependent list responses are private/no-store. | `profile-gallery`, `media-social-cards`, `media-authorization-matrix`, `theme-input-media-cache`; built-app checks |
| JSON-LD and response headers | Profile/video structured JSON escapes `<` before HTML insertion. Baseline headers set nosniff, SAMEORIGIN and strict-origin-when-cross-origin. | `request-hardening.test.mjs`; source review of profile structured data |
| Experience POST/GET | Configured origins, streamed 4 KiB JSON/UTF-8 limit, validated event fields, shared session/global quotas, administrator-only reports and private/no-store responses. | `experience-ingestion`, `experience` suites |
| Upload configuration and health | Configuration is administrator-only and private/no-store. Health exposes status/release identity with no-store. | `local-upload-boundary.test.mjs`; built-app checks |
| Legacy upload/albums/cloud routes in local mode | `/api/upload` fails before body parsing or public-file writes. Database-only albums and unconfigured cloud handlers fail closed. Their configured cloud-upload/callback behavior is not certified by this local review. | `local-upload-boundary`, `album-input-cache`, `admin-origin` suites |
| Standalone public avatar | `/hymecymeyseh.fun.png` intentionally permits cross-origin display. It is an owner-published static copy, independent of catalog visibility; the old avatar URL redirects to it. This exception does not relax local-media headers. | November 14 public URL/body/header verification; `public-profile-picture.md` |

No additional application-code fix was identified in these reviewed paths. Earlier
hardening fixes are present in this source; the historical branch/deployment
statements in older checkpoint reports describe their state at the time, not
today's source status.

## Remaining boundaries

- Structured administrator audit records, contextual application failure records,
  retention and operator review remain an open v1 maintenance task.
- Full browser workflow sign-off and physical iPhone/Safari playback, audio,
  native sharing and clipboard acceptance remain open. Local HTTP tests do not
  substitute for browser interaction or CDN/browser-cache testing.
- Inactive configured database/Blob/Mux workflows need their own review before
  renewed production use. Local v1 completion does not authorize enabling them.
- This checkpoint does not authorize a production deployment, storage migration,
  visibility change, live outage, or deletion of production content.

## Fresh validation

- `npm run test:storage`: 147 tests passed, zero failures/skips (142 top-level
  cases plus five database subtests).
- `python3 -m unittest discover -s tests -p 'test_*.py'`: 12 tests passed.
- `npm run lint`: exit 0, zero errors and five existing warnings: custom font
  usage in `layout.tsx`, one raw-image warning in `PhotoViewer.tsx`, and three
  raw-image warnings in `VideoThumbnail.tsx`. These are recorded rendering/lint
  advisories, not newly introduced changes or a claim of performance acceptance.
- `npm run build`: passed compilation, TypeScript, static generation and traces.
- `python3 scripts/verify-local-access.py`: 176 runtime checks passed on source
  `bc058954016898e2a49d2f861dcec6195a61a2cf`, fresh build
  `odpFHejZ8b5l_gnE5U4E5`. Six generated fixtures and all four roles passed API
  gates, metadata/cache, original/playback/thumbnail GET/HEAD/range checks and
  public-profile filtering. The initial sandbox attempt could not create a
  socket; the successful run used an approved localhost-capable execution.
  The test confirmed its server stopped and temporary data was removed.
- `git diff --check`: passed.

The bounded local input/cache/header review and automated route authorization
matrix can now be marked complete. Final interactive/device acceptance and the
maintenance logging milestone remain open. This checkpoint changes documentation
only and requires no application deployment.
