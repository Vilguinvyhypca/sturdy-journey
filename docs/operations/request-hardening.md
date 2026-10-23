# Request and response hardening — first pass

Development branch: `codex/v1-request-hardening`, based on the still-pending
`codex/v1-poll-delete-limits` commit `e8dfc1b`. Neither branch is merged or deployed
by this checkpoint. Review the hardening diff against its parent branch to keep
the changes distinguishable.

## Findings addressed

| Finding | Change | Evidence |
| --- | --- | --- |
| Malformed JSON, null, or primitive/array bodies could make media PATCH throw before validation | Return a private/no-store HTTP 400 response after administrator authorization; valid edits retain their existing path | Route tests reject malformed, null, array, string, numeric, and boolean bodies with no catalog writes, accept a normal edit, and reject signed-out access before parsing |
| Local video thumbnails used a one-day private browser-cache lifetime | Thumbnail bytes now use private/no-store, matching the local original/playback policy | Storage test reads a disposable thumbnail and verifies body, caching, and nosniff headers |
| Public legacy video JSON-LD used raw JSON serialization in an HTML script | Escape `<` so user-controlled titles/descriptions cannot close the JSON-LD script; existing profile JSON-LD already does this | Render test with closing-script and event-handler payloads confirms no literal `<`, round-trip JSON values, and no script on unlisted/private video items |
| Baseline page/API response headers were not configured consistently | Next config adds nosniff, strict-origin-when-cross-origin referrer policy, and SAMEORIGIN frame restrictions | Development `/api/health` returned HTTP 200 with all three headers |

The referrer policy limits outbound cross-origin path disclosure. SAMEORIGIN
allows same-origin framing but disallows other sites framing application pages;
direct links and normal gallery/video navigation remain supported. No global
Content Security Policy or HTTPS-only HSTS policy was introduced in this pass.
Existing local media CSP/range delivery behavior is unchanged.

Thumbnail no-store applies to new responses. It does not retract downloaded bytes
or purge browser caches populated by older versions. No production cache purge or
visibility/content changes were performed.

## Still open

This is a concrete-fix checkpoint, not a completed security audit. Continue reviewing
origin/proxy trust, mutation request/body size limits, remaining active input paths,
and session-dependent response caching. Complete the planned authorization matrix
for original bytes, converted playback, thumbnails, pages, and administrator writes.
Do not infer full endpoint coverage from these focused regression tests.

The local-storage v1 scope remains separate from renewed Mux adoption; the JSON-LD
fix safely hardens retained legacy rendering without making Mux rollout a blocker.

Validation: all 120 Node regression tests, targeted ESLint, TypeScript, and diff
checks passed. The development health endpoint confirmed the live header
configuration. No production build or production deployment was performed in
this checkpoint; final release and authenticated browser acceptance remain open.

## Bounded administrator JSON follow-up

Branch `codex/v1-bounded-admin-json` is stacked on hardening commit `b68a4c9`.
Media PATCH and profile POST/PATCH now use a shared streaming JSON-object reader
*after* administrator authorization. The maximum request body is 64 KiB (65,536
bytes), including JSON syntax and UTF-8 encoding; exactly the limit is accepted.
This limit applies to edit/profile JSON, not uploaded media files.

The reader requires application/json (charset parameters are allowed), checks a
large declared Content-Length before reading, and enforces the same cap against
actual chunks even when the length is absent or understated. It stops/cancels
oversized streams, rejects invalid UTF-8 and non-object JSON, and preserves valid
Unicode split across chunks. Responses are 400 for invalid objects/encoding,
413 for too-large bodies, and 415 for unsupported content type, with
private/no-store caching. Existing field-level validators remain in place.

Tests exercise the exact byte boundary, streamed overflow/cancellation, misleading
length headers, multibyte byte counts, split Unicode, malformed bodies, wrong
content types, rejection before writes, accepted media/profile operations, and
unauthorized access before parsing. This follow-up remains unmerged and undeployed.
Origin/proxy trust and the full authorization/caching matrix remain open; no new
CSRF or trusted-proxy guarantees are being claimed by a body-size parser.

The bounded-JSON follow-up passed all 122 Node regression tests, targeted ESLint,
TypeScript, and diff checks. No production deployment was performed. Before a
manual test, record the checked-out development commit: the shared development
server can contain newer stacked branches than an earlier emailed procedure.

## Exact administrator origins

Branch `codex/v1-origin-validation` builds on bounded-JSON commit `a5371d9`.
Authenticated local uploads, media PATCH/DELETE, profile POST/PATCH, theme PATCH,
album POST/PATCH/DELETE, and legacy fingerprint POST reject untrusted browser
origins before reading bodies, consuming quotas, or writing storage. Signed-out
requests still return 401 first. Public reads are unaffected.

Trust comes from `NEXTAUTH_URL` (or `NEXT_PUBLIC_SITE_URL` if absent), plus optional
comma-separated full origins in `MEDIA_ADMIN_ORIGINS`. Scheme, host, and port
must match. Request URLs, Host, Forwarded, X-Forwarded-Host, Cloudflare headers,
and bare `MEDIA_DEV_ORIGINS` entries do not grant administrator write access.
Missing/invalid canonical configuration or malformed extra origins fail closed
with 503. Denials return 403 and private/no-store. An explicit Origin must be
valid; a trusted Referer is accepted only when Origin is absent. Requests marked
Sec-Fetch-Site: cross-site are denied. Scripts using these endpoints must send a
configured Origin along with their existing administrator authentication.

For phone development using the HTTPS Tailscale alias, add
`MEDIA_ADMIN_ORIGINS=https://hymecymeyseh.tailcc86a8.ts.net:8443` to the development
environment and restart the dev service. Keep the existing canonical development
NEXTAUTH_URL. This checkpoint does not change environment files or production.
The hostname-only Next development allowlist remains a separate setting.

NextAuth callbacks and signed provider upload/webhook routes retain their own
validation and are outside this guard; a full audit remains open. Other remaining
work includes remaining body limits and the authorization/cache matrix.

Developer review: sign in at the configured development origin and use disposable
media to upload, edit a title/profile/theme, and delete. Repeat an authenticated
mutation with an untrusted Origin: expect 403 and no changes. Spoofed forwarded
hosts must not bypass denial. Confirm public browsing and sign-in still work.
Check the development commit before following an emailed test procedure because
these branches are stacked. Do not use production content for destructive tests.

Validation for the origin checkpoint: all 126 Node regression tests, targeted
ESLint, TypeScript, and diff checks passed. Authenticated browser acceptance and
release build/deployment remain pending. No production changes were made.
