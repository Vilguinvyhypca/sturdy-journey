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
