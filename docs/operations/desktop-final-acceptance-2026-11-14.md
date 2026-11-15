# Desktop acceptance — November 14, 2026

Source `ddd801f` on evidence branch `codex/v1-desktop-final-acceptance`, using the
existing fresh build `DinumrJAf2BQXJ2L37c5S`. Chrome for Testing
154.0.8037.57, desktop viewport 1440×1000 (initial interactions at 1280×577).

Story: an administrator creates/edits a profile, uploads/edits/shares its media,
checks visitor access, searches/paginates galleries and deletes test uploads.
UI actions must produce the expected saved state and visitor behavior.

## Isolation

A separate Next production-mode process listened on `127.0.0.1:40447`, with a
temporary catalog/storage directory and randomly generated administrator password
and session secret. Database, Blob and Mux configuration were explicitly disabled.
Thirty generated PNG records populated the default profile for pagination. A
generated 128×96 PNG and two-second 160×120 H.264/AAC video were uploaded to a
new disposable profile. No real production or normal development catalog/media
was used or edited. Separate administrator and signed-out browser sessions were
used. The host required Chrome's `--no-sandbox` launch flag; no host sandbox
configuration was changed.

## Flow evidence

| Boundary | Result | Evidence |
| --- | --- | --- |
| Sign-in UI → session | Passed | Filled the real password input and submitted Sign in; administrator dashboard and management navigation appeared |
| Profile form → API/catalog → gallery | Passed | Created `desktop-acceptance` with name, handle, biography and HTTPS link; management gallery opened. Edited display name/biography, observed “Profile saved” and updated heading; URL input remained read-only |
| File input → upload → private cards | Passed | Selected generated PNG/MP4 through the actual multi-file input. Two cards appeared, both private, and the saved catalog contained the correct profile ID |
| Duplicate input → rejection | Passed | Selecting the same PNG again showed “already been uploaded”; catalog remained 32 records: 30 seeds plus two uploaded fixtures |
| Detail form → saved photo/video edits | Passed | Updated titles/descriptions and private/unlisted/public visibility through each viewer's Edit details form; viewer/card/catalog and visitor access reflected changes |
| Visitor reads → authorization | Passed | Initial private original/playback returned 404 and public profile listing was empty. Unlisted links worked but stayed out of discovery. Public items appeared only in their intended profile. Returning items to private revoked new visitor access |
| Individual pages → actual decoding | Passed | Visitor photo page rendered the edited title and decoded at 128×96. Unlisted video page decoded at 160×120 and included noindex. Four-byte playback range returned 206 |
| Video player → keyboard/playback state | Passed | Video started and reached its end. Keyboard replay/pause/resume produced paused=true at ~0.103 seconds, then playing=true; 25 rendered frames and 41,833 decoded audio bytes observed. Escape closed the video dialog |
| Share → feedback | Partial external verification | Photo/video Share controls reported “Link copied”. Independent clipboard read was denied by Chromium permissions; exact clipboard contents and native OS sharing are not certified |
| Profile switching/preview → isolation | Passed | Default profile showed only seeded media. New profile showed only its uploads. Public preview during administrator sign-in displayed the public photo, excluded the private video, and exposed no upload input |
| Gallery pagination → appended cards | Passed | Loaded 12 → 24 → 30 seeded photo links using the real Load more buttons; all 30 links were distinct and the final loaded/total counts matched |
| Search/filter → results | Passed | Search for “Seed photo 30” found the last-page item as one result. Private visibility produced an empty result. Clearing search/restoring public results worked. Videos showed zero files in the photo-only profile; Photos restored the first 12 |
| Delete UI → cancellation/persistence | Passed with dialog limitation | An exact-prompt handler returned false for the first photo deletion; its card and record remained. It then returned true for the photo and video Delete controls; both records/cards and all corresponding original/derivative files were removed |
| Mutation → audit records | Passed | Temporary operation logs contained profile create/update and media create/update/delete; two successful deletion records matched the two deleted uploads |
| Sign-out → denial | Passed | Real Sign out cleared `/api/auth/session`; `/api/profiles` returned 401 and upload inputs were absent |

New private video requests were explicitly checked against original, playback and
thumbnail endpoints (all 404) and its page (no private fixture title). The photo
was also returned to private and denied before deletion. Existing downloaded
bytes or a previously rendered page are not recalled by a visibility edit.

## Automation findings and limits

- Initial profile-submit and video-card mouse actions missed controls outside
  the viewport or did not activate them. Explicit scrolling and keyboard
  activation succeeded. No application defect was demonstrated by those misses.
- The tool's URL-glob wait timed out after a successful profile navigation;
  subsequent checks used rendered state and saved catalog evidence.
- The first pagination expectation assumed 24 items. The configured page size
  is 12; expectations were corrected before checking the actual 12/24/30 flow.
- Native delete dialogs were not manually clicked. The temporary handler accepted
  only the exact “Delete this media permanently?” message and was restored after
  three prompts (one cancellation and two accepted fixture deletions).
- No uncaught administrator page errors were reported. Expected unauthorized
  requests and the clipboard-read permission denial are not application failures.
- This was desktop Chromium, not Safari or an iPhone. Decoded audio bytes do not
  prove audible sound. Physical-device playback/sound, swipe behavior, native
  sharing/clipboard, real native confirmation and constrained-network buffering
  remain for final device/owner acceptance. These results do not close that item.

## Teardown and status

After UI deletion, the temporary catalog and storage contained exactly the 30
seed records/files; neither uploaded UUID had remaining original/derivative files.
The administrator signed out, both browser sessions closed, and the temporary
server stopped. Its entire fixture directory and state file (including generated
credentials, profiles and operation logs) were verified absent afterward.

Production and normal development services remained active. Production health
still reported `20261114T180120188442Z-bc058954`. No application source changed,
so the already-passing 153 Node/12 Python/build/TypeScript checks were not repeated
for this documentation-only checkpoint. Diff whitespace checks passed. No merge
or production deployment was performed.
