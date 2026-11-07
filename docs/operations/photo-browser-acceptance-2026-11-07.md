# Photo browser acceptance — November 7, 2026

Source: `codex/v1-photo-browser-acceptance`, based on main `4717446f`.

## Fix

The photo viewer card used `max-h-full` with `overflow-visible`. When the share
fallback opened in a 1280×577 browser viewport, the card's Close button extended
to y=751.75 and the Edit and Delete controls extended to y=671.75. Those
controls were outside the viewport and could not be reached by scrolling.

The card now has a viewport-based maximum height, vertical scrolling, and
contained scroll chaining. The share panel and footer controls can be brought
into view on desktop and narrow/tall viewports. This changes viewer layout only;
it does not change media authorization, files, or image quality.

## Browser checks

Using disposable development uploads on source `4717446f`:

- Uploaded a PNG through the administrator's profile form, decoded it in the
  browser at 128×96, edited its title and description, and saved private,
  unlisted, and public visibility states.
- In a separate anonymous browser, confirmed unlisted media returns 200 and
  decodes but is absent from the public profile list. Public media returns 200,
  decodes, appears in the profile, and its detail page decodes. Private media
  returns 404, does not decode or list, and is absent from the anonymous
  profile.
- Confirmed the anonymous profile exposes no upload input or edit controls.
- The insecure development origin used the expected share-link fallback URL.
  Clipboard and native share behavior were unavailable over HTTP and are not
  claimed as verified.
- After opening the share panel, scrolled to and clicked its close control at
  Chromium viewport sizes 1280×577, 390×667, and 320×480. At each size, the
  control was inside the viewport, hit-testable, and closed the panel.
- The real upload form rejected a duplicate with HTTP 409 and a corrupt PNG
  with HTTP 422; a JPEG upload returned HTTP 201 and decoded at 96×64.
- Deleted both disposable photos through the viewer's delete handler. The
  browser test temporarily auto-accepted only the exact delete confirmation;
  native confirmation interaction was not tested.

The development media catalog, storage filename set, and profile file matched
their exact pre-test snapshots after cleanup. The administrator browser was
signed out and both temporary browser sessions were closed.

## Checks and remaining coverage

- `node --test tests/share-media.test.mjs tests/media-authorization-matrix.test.mjs` — 2 test files passed.
- `npx eslint src/components/PhotoViewer.tsx` — no errors; one existing Next.js `<img>` optimization warning.
- `npm run build` — passed, including TypeScript and static page generation.
- `git diff --check` — passed before this note was added.

These were desktop Chromium viewport checks, not tests on an iPhone or Safari.
Native share/clipboard, physical-device scrolling, and the native delete
confirmation remain for device acceptance. Production was not changed; it
remains on the November 6 release until the branch is reviewed and a separate
production release is authorized.
