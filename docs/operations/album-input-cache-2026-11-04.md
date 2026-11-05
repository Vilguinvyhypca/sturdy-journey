# Album JSON and cache boundary — November 4, 2026

Branch `codex/v1-album-input-cache` starts from main `c92ee71`, independently of
photo-validation PR #22 and visitor-event PR #23. This is a retained database-mode
API review, not an activation of database albums or a production deployment.

Album POST/PATCH previously parsed the whole request with request.json before
checking short name/description limits. They now use the existing administrator
JSON reader: exact application/json media type, strict UTF-8, a JSON object and at
most 64 KiB of actual streamed input. A larger declared length is rejected early;
smaller/absent lengths do not bypass the byte limit. Bad input returns 400, 413 or
415 before any database mutation. Authentication, configured origin and database
availability are checked before reading the body. Name/description limits,
trimming, conflict responses, create/edit behavior and deletion quotas remain.

All handled album list/detail/create/edit/delete responses now explicitly use
Cache-Control: private, no-store, including local-mode empty lists and errors.
Existing public-versus-administrator filtering and private-photo delivery URL
mapping are retained. This establishes explicit response policy; no prior shared
cache disclosure is established by the finding.

Tests in `tests/album-input-cache.test.mjs` exercise malformed, oversized, forged
length, streamed and invalid-UTF-8 inputs; valid create/edit; conflicts and missing
records; authorization/configuration before body parsing; list/detail filtering
arguments, private-photo URLs, disabled database behavior and deletion throttling.
Database functions are isolated doubles here; existing database regression tests
exercise database behavior. No live database albums are created by these checks.

All 141 Node regressions, targeted ESLint, TypeScript, diff checks and the
production-mode build in the development checkout passed. An isolated built-app
HTTP check confirmed empty local album lists (200), disabled details (503),
anonymous creation rejection (401), authenticated disabled creation (503 before
parsing malformed JSON), and cross-origin rejection (403), with private/no-store
response headers. Its temporary server, data and credentials were removed.

Read-only configuration inspection confirmed production uses local storage with
database, Blob and Mux disabled. Its active release remained
`20261031T031826605888Z-e4a17b4a`. No configuration or production data was changed.
The wider callback/API/page cache review and real-device acceptance remain open.
