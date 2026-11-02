# Local upload boundary and administrator caching — November 1, 2026

Branch: `codex/v1-local-upload-boundary`, based on main `240dc48`.
This is a development checkpoint, not a production deployment or completed audit.

## Finding and change

The UI correctly uses `/api/local-upload` when MEDIA_UPLOAD_PROVIDER=local, but
the retained `/api/upload` multipart endpoint still accepted administrator
uploads through the legacy demo fallback. That fallback writes into a public
`/uploads/` directory and does not use the private local pipeline's origin checks,
quota, server-side video processing or streaming-size enforcement. Its file-size
check occurs after multipart parsing. This was an alternate authenticated write
path, not a demonstrated anonymous upload or known exploitation.

`/api/upload` now returns private/no-store 503 immediately in local mode, before
body parsing, session lookup, cloud SDK handling, catalog access or storage writes.
The message tells a stale client to refresh and use Upload media. This also blocks
the route when local mode is combined with accidentally retained Blob settings.
Normal `/api/local-upload` behavior remains supported. Retained nonlocal provider
callbacks and demo mode keep their previous behavior; these are not being newly
enabled, migrated, or certified for production by this fix.

A read-only production-catalog inspection found 679 entries and no `/uploads/`
URLs at review time. No production uploads or data changes were performed. This
is not a historical filesystem/exposure audit and does not retroactively change
old files, bookmarks or previously downloaded content.

## Cache policy follow-up

Every handled response from local upload POST, media PATCH/DELETE and theme PATCH
now carries Cache-Control: private, no-store. This includes success, validation,
authorization, throttling, disabled configuration and handled storage failures.
Existing status codes and Retry-After behavior are preserved. Unknown exceptions
that escape to Next's error handler are outside these response wrappers.

Upload-configuration GET and administrator Mux-usage GET now use the same policy
for denial, success, disabled-provider and handled-provider-error responses.
This does not enable Mux. Public theme GET is unchanged. Profile API, media-list
GET and protected local byte delivery already had their own no-store policy.
No cache purge or claim of an observed cache leak is made.

## Evidence

Tests execute the actual handlers with isolated auth/body/provider/storage
fixtures. They verify local-mode rejection before all side effects for JSON and
multipart inputs, even with Blob configured; preserve nonlocal callback/demo
behavior; reject anonymous and non-administrator mutation access; and assert
cache headers across allowed, denied, invalid and disabled/error responses.
The existing successful local-upload regression additionally checks no-store on
its 201 playback-ready response. Real upload cleanup/concurrency/video tests remain
part of the full suite.

Live development requests confirmed legacy upload 503 and normal local upload
401 while signed out, plus private/no-store on rejected media/theme/config/usage
requests. Requests were intentionally unauthenticated/invalid and made no writes.
No files, media, profiles, configuration or production releases were changed.

## Remaining review

The security milestone remains open. Continue active image-content validation,
experience-event origin/body/rate-limit review, remaining session-dependent page
caching and the final acceptance matrix. Retained cloud/album routes need separate
review before enabling those provider configurations. iPhone/Safari, sound and
owner acceptance remain separate outstanding checks.

Validation: all 139 Node regressions passed on the runtime changes. A final
nine-test focused run, including the additional successful-upload cache assertion,
passed. Targeted ESLint, TypeScript and diff checks passed. No release build or
production deployment was performed.
