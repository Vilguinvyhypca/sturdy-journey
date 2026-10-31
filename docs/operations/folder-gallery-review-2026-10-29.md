# Folder upload and gallery review — October 29, 2026

Branch `codex/v1-folder-gallery-acceptance`, based on `a30b99c`.
Desktop Chromium at http://100.75.180.84:3001 with an isolated temporary profile.
Production was not changed.

## Browser results

| Check | Result |
| --- | --- |
| Actual Upload photo folder input, root and nested directory | All 13 distinct PNGs imported privately into the correct profile |
| Text and video files inside photo folder | Skipped; UI reported “13 photos selected; skipped 2 unsupported files.” |
| Initial page after reload | 12 of 13 photos |
| Load more | All 13 unique cards, no duplicate URLs |
| Filename search, including a nested file | Correct single result |
| Title search with uppercase query | Correct single result |
| Description search with uppercase and surrounding spaces | Correct single result |
| Nonmatching query | Empty-state message, no cards |
| Actual Clear button | Restored first page and full count |
| Videos/Photos links after adding two test videos | Two video cards; photo page showed 12 of 13 photos |
| Private/public visibility filters | Correct zero, private-only and public-only results |
| Upload a nonmatching video during a search, after fix | Upload saved; search remained one matching card / one result |
| Upload a private photo with Public filter active, after fix | Upload saved; public gallery remained one public card / one result |

The restart interrupted preparation before the profile or upload had been
created; persisted state was checked before resuming. The folder input needed a
retry after client hydration. The automation's empty-string fill did not clear
the controlled search input, so the actual Clear button was used and passed.
These automation details are not application defects.

## Defect found and fixed

Previously the upload-completion handler prepended every uploaded item to the
currently displayed list and increased counts based only on media type. A new
video therefore appeared inside a nonmatching description search, and analogous
visibility-filter pollution was possible.

The handler now inserts and counts only uploads matching the active type,
visibility and search. Search uses the same title/description/original-filename
matching helper and 200-character query bound as the API. The files still upload
successfully when excluded by the current filters; clearing/changing filters
reveals them. Existing pagination cursors are retained. No public server-side
access rule, upload provider or page design was changed.

`tests/upload-gallery-filters.test.mjs` invokes the real upload handler supplied
to the upload control with isolated React-state/network fixtures. Cases cover
nonmatching search, matching title/description/original filename, case/whitespace,
the API's query bound, private/public/unlisted selection, type mismatch and
unfiltered uploads. It verifies visible IDs, summary counts/storage and retention
of the existing cursor while the upload still succeeds. Browser tests above
exercise the actual development upload path and rendered results.

## Cleanup and remaining acceptance

All 16 disposable media records (14 photos and two videos), their originals and
derivatives were deleted. The empty temporary profile was removed under the
shared writer lock; original profiles exactly matched the pre-test baseline.
The browser ended signed out. No existing media was edited.

iPhone/Safari, sound and the wider input/cache audit remain open. This review does
not certify every sort order, concurrent pagination edits, every image format or
large-folder behavior. The fix is on a pushed feature branch for review; no merge,
release build or production deployment is included.

Validation: all 135 Node regression tests passed on the final change, along with
targeted ESLint, TypeScript and diff checks. No production build/deploy was run.
