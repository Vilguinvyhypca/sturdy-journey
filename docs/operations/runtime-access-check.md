# Repeatable local runtime access check

Run from the development Git checkout with Node dependencies, Python 3, FFmpeg
with libx264, and Linux flock installed:

```sh
npm run build
python3 scripts/verify-local-access.py
```

Build first after switching branches or changing application code. The script
uses `.next`, while the normal development server uses `.next-dev`. It reports
the checked-out source commit and build ID for evidence; it does not independently
prove that an existing build matches the checkout. It refuses deployment releases
and folders without a Git checkout. Do not run Python with assertions disabled.

The script starts a temporary production-mode app on a random localhost port
with an isolated data/storage directory, random administrator password and random
authentication secret. Database and Blob settings are disabled. No production
configuration, credentials, catalog, service or media are used. Six generated
fixtures cover public/unlisted/private photos and videos, including playback
copies and thumbnails. All fixtures and credentials live in the temporary
directory/process environment and are removed after the child server stops.

## Coverage

- Anonymous, signed-in member, password administrator and signed-out-after-admin
  requests against the same running app and URLs.
- Administrator-only profile/configuration/report GETs, non-administrator
  upload/edit/profile mutation denial, and no-store API response policy. The
  report's existing no-store policy is accepted without requiring the additional
  private directive introduced by the separate visitor-event security PR.
- Photo/video HTML, title/description visibility, noindex for nonpublic/not-found pages, and
  no-store page headers. Streaming not-found pages may use HTTP 200, so denied
  pages must omit the unique fixture title rather than merely match a status.
- GET/HEAD originals, playback and thumbnails: private media denied to visitors
  and members; public/unlisted direct links allowed; bodyless HEAD, byte lengths,
  private/no-store, nosniff and same-origin resource policy.
- GET byte ranges for allowed original/playback URLs: 206, four bytes and correct
  Content-Range; thumbnails retain their full-response behavior.
- Exact media-list identifiers per role and public-only profile HTML, including
  while previewing as administrator.
- Real administrator sign-in/sign-out and subsequent repeated anonymous access,
  warming the same private URLs as administrator before checking denial again.

The member fixture is a JWT signed with the disposable server's random secret,
with isAdmin false, and checked through the real session endpoint. This verifies
runtime session authorization, not a member registration or external OAuth flow.

The script prints a JSON result only after a successful run and teardown. A failed
assertion exits nonzero and still stops the server/removes temporary data. It
does not send email or write traffic events to the real reporting directory.

## Limits

This is a localhost HTTP/runtime test. It does not execute client-side JavaScript,
prove browser decoding/autoplay, test upload/edit forms, emulate iPhone/Safari,
exercise Cloudflare/CDN caches, or certify inactive database/Blob/Mux providers.
Real-device playback/sound and browser interaction acceptance remain required.

## November 5, 2026 evidence

Passed 176 runtime checks on application source
`0c61f9457cbbf372dc45d66ae2a1d74c8a1acdec` (main after photo-validation PR #22),
fresh build `XFs6idXCsmpF44ZeTF9TE`. All four roles and six generated fixtures
passed; the result confirmed serverStopped and temporaryDataRemoved. The build,
Python compilation and diff checks also passed. No application code, production
service or production data was changed by this test/documentation checkpoint.
