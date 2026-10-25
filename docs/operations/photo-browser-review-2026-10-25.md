# Development photo browser review — October 25, 2026

Source: `3c1cf76`; evidence branch `codex/v1-photo-browser-review`.
Target: http://100.75.180.84:3001, release `development`.
Desktop Chromium, existing isolated review session, real NextAuth credentials
and browser fetch requests; development credentials were never printed.

Uploaded a generated 64x64 PNG (1623 bytes) as the administrator. Upload returned
201/private. Reuploading its exact bytes returned 409 with the duplicate message;
only one matching content-hash record existed afterward.

| State / session | Original GET | HEAD | Photo page | Public list |
| --- | --- | --- | --- | --- |
| Private / administrator | 200 | 200, empty | 200 | Absent |
| Private / signed out | 404 | 404, empty | 404 | Absent |
| Unlisted / signed out | 200 | 200, empty | 200 | Absent |
| Public / signed out | 200 | 200, empty | 200 | Present |
| Deleted / signed out | 404 | 404, empty | 404 | Absent |

Original responses consistently carried private/no-store. Accessible originals
had image/png content type. The unlisted image decoded successfully. The public
photo detail page rendered the actual image with natural dimensions 64x64 in a
signed-out browser. Visibility edits returned 200.

Fixture `local:47ff8c8c-c9e4-4586-b88d-fe612ba89088` was deleted through the admin
API (200/deleted true). Confirmed its catalog record and original file no longer
existed, and its page/original GET/HEAD returned 404 after sign-out. Existing media
was not edited. The browser ended signed out. Production was unchanged.

This verifies real browser/API/catalog/storage behavior, not click-through use
of upload/edit forms. iPhone/Safari, folder uploads, other image formats, profile
management and broader input/cache review remain pending. No runtime code changed;
no release build or unchanged regression-suite rerun was needed for this evidence
commit. Diff checks passed.
