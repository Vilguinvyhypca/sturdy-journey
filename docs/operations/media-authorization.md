# Local-media authorization regression matrix

Branch `codex/v1-media-authorization-matrix` is stacked on `885e4d3`.
This checkpoint adds isolated route/page tests; it changes no application policy.

## Expected access

| Surface | Anonymous visitor | Signed-in non-administrator | Administrator |
| --- | --- | --- | --- |
| Public original, playback and thumbnail | Allow | Allow | Allow |
| Unlisted original, playback and thumbnail by direct URL | Allow | Allow | Allow |
| Private original, playback and thumbnail | 404 | 404 | Allow |
| Public photo/video page | Allow | Allow | Allow |
| Unlisted photo/video page | Allow, noindex | Allow, noindex | Allow, noindex |
| Private photo/video page | Not found | Not found | Allow, noindex |
| Public profile/gallery preview | Public items only | Public items only | Public items only |
| Administrator profile API and upload/edit/delete | 401 | 401 | Existing validation applies |

Unlisted is discoverability control, not authentication. Anyone with the direct
link can view it. Private media requires an administrator session.

## New evidence

`tests/media-authorization-matrix.test.mjs` executes the real local-original,
playback, and thumbnail route handlers with disposable in-memory catalog/session
fixtures. For each role and visibility it checks denial before storage lookup or
byte-delivery calls, the correct original/playback key when allowed, and the
private/no-store policy at the response boundary. Missing/overlong identifiers,
wrong media types, wrong storage providers and missing playback copies fail
closed. The explicit original-file HEAD handler uses the same role rules.

Photo/video page functions and metadata generators are exercised for all roles
and visibility states, including missing items. Unauthorized private titles,
descriptions and preview images do not enter returned metadata. Authorized private
pages have no public preview images and are noindex. React caching and JSX are
stubbed for isolated tests; this does not verify Next's runtime cache behavior.

The real public-list helper is tested for profile isolation, public-only filtering
and removal of original filenames. Since this helper does not consult the session,
its output remains public-only during administrator preview. Related profile
and media-list tests verify the route filtering and session-dependent list output.

Anonymous and signed-in member sessions are rejected before origin checks, body
parsing, quota use or writes for profile GET/POST/PATCH, local upload POST, and
media PATCH/DELETE. Existing related regressions cover permitted administrator
writes and JSON/origin/quota rejection; administrator status alone never bypasses
those validations.

## Verification limits and next review

Delivery functions are stubbed here to prove that unauthorized requests cannot
reach storage. Existing local-storage tests separately exercise actual temporary
files, byte ranges, cache headers and thumbnail delivery. These tests do not read
or mutate production files, authenticate through a real browser, verify automatic
Next HEAD handling for playback/thumbnail routes, or certify all legacy providers.

Browser acceptance remains required: use disposable development media to exercise
public/unlisted/private transitions in separate visitor, member (if available)
and administrator sessions. Confirm private URLs fail after signing out; confirm
unlisted direct links work while staying out of profile previews. Test iPhone and
desktop, and record the checked-out commit. Never reuse production content for
destructive testing. The broader input/cache audit remains open.

Validation: 19 focused regressions passed across the new matrix, profile gallery,
theme/cache, administrator origins, bounded JSON, polling/deletion, and sign-in/
upload quotas. ESLint for the new test and diff checks passed. The full 128-test
suite passed at parent `885e4d3`; this test/documentation-only checkpoint did not
repeat the unrelated FFmpeg suite or a production build.
