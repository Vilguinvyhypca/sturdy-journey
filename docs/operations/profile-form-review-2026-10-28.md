# Profile form acceptance — October 28, 2026

Development source: `d8764b1`. Evidence branch:
`codex/v1-profile-form-acceptance`. Target:
http://100.75.180.84:3001. Desktop Chromium; actual administrator form sign-in,
Create profile, Edit profile details, Save profile and Sign out controls.
Production was not changed. No runtime defect was demonstrated.

## Observed results

| Check | Result |
| --- | --- |
| Create with an existing profile URL | Rejected: “That profile URL is already in use.” |
| Create with an HTTP social link | Rejected: “Social links must be complete HTTPS URLs without credentials.” |
| Create with a unique URL and HTTPS link | Created and opened the correct management gallery |
| URL stability during editing | Profile URL input was read-only |
| Empty profile photo selection | Only “Use initials” offered; no other profile's photos offered |
| Edit display name, handle, biography and social link | “Profile saved.” shown; values persisted and public page reflected them |
| Public preview while administrator signed in | No upload file inputs; no media cards from other profiles |
| Public profile while signed out | Empty session; saved name/bio/handle/social link visible; no upload controls or media cards |
| Cleanup | Empty test profile removed; original three profiles unchanged; removed public URL returned 404 |

Temporary profile URL: `/p/dev-form-check-20261028` (now removed).
Only this generated profile was edited. No existing profile or media was modified.

There is no profile-delete API/UI in the current scope. Test cleanup used a
one-off development maintenance command holding the shared catalog writer lock.
It verified that the test profile owned no media, matched the captured fixture
ID and slug, and that all retained profiles exactly matched the pre-test snapshot.
It atomically replaced only the development profile catalog. This is fixture
cleanup, not a newly implemented product deletion feature.

## Limits and follow-up

A navigation immediately after sign-out raced the redirect and reported
ERR_ABORTED in the automation. Retrying after the redirect completed loaded the
public profile correctly. The browser finished signed out.

This covers desktop create/edit and validation, not avatar selection with actual
public/private/moved photos, every validation limit, or iPhone/Safari. Media access
and upload/delete evidence remains in the preceding review records. Broader input/
cache audit, folder uploads, search/filter/pagination, sound and owner acceptance
remain open. No full release build or unchanged automated-suite rerun was needed
for this evidence-only commit. Diff checks passed.
