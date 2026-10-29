# Profile-photo acceptance — October 29, 2026

Development source: `bc1fdfe`. Branch `codex/v1-avatar-acceptance`.
Desktop Chromium at http://100.75.180.84:3001. Production was unchanged.
No runtime defect was demonstrated; this checkpoint adds regression evidence.

## Browser and API results

Created two temporary development profiles and three generated 72x72 PNGs using
administrator-authenticated browser requests. Profile A owned a public and a
private photo; profile B owned a different public photo. The actual profile-photo
form was used to select and save A's eligible public photo.

| Check | Result |
| --- | --- |
| Profile A's photo picker | Only Use initials and A's public photo offered |
| Submit A's private photo directly to the profile API | 400; selection rejected |
| Submit B's public photo to A's profile API | 400; selection rejected |
| Save A's public photo through the form | Rendered public profile avatar decoded at 72x72 |
| Make selected photo private | Public page rendered initials, not the photo |
| Restore public visibility | Eligible avatar appeared again |
| Move selected public photo to B | A's public page rendered initials |
| Move the photo back to A | Eligible avatar appeared again |
| Delete selected photo | Public page rendered initials without an avatar image |

The public page was freshly navigated after each transition. These are browser
rendering checks during an administrator session; the public avatar lookup does
not use administrator privilege. Signed-out public-profile behavior retains the
separate October 28 evidence. Media/profile setup and transition writes used the
API; picker selection and saving used the actual UI.

## Regression tests

`tests/profile-avatar-access.test.mjs` adds route-level cases for private,
unlisted, missing, other-profile, wrong-type and non-local avatar candidates,
assignment during creation, valid selection and clearing to initials. Rejected
candidates do not reach profile persistence. Public-page rendering tests recheck
eligibility after private/unlisted/ownership/type/deletion changes and restoration.

These tests stub storage/session boundaries; the browser checks above exercise
the development catalog and real rendering. No deployment or full unchanged
video-processing-suite rerun is required for a test/documentation-only change.

## Cleanup and remaining work

All three generated media records and their original/derivative files were
removed. Both empty test profiles were removed under the shared catalog writer
lock. Retained profiles exactly matched the pre-test baseline; no existing media
or profile was edited. The browser ended signed out.

Remaining acceptance includes iPhone/Safari, folder uploads, search/filter/
pagination, sound and the wider input/cache audit. This evidence does not close
all v1 milestones or authorize a new production deployment.

Validation: all 13 selected regressions passed across avatar access, profile
list isolation, media authorization, bounded JSON and administrator origins.
ESLint for the new test and diff checks passed.
