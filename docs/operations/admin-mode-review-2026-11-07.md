# Administrator mode clarity review — November 7, 2026

Source branch: `codex/admin-mode-indicator`, based on main `4717446f`.

## Changes

- Added an `Admin mode · managing` banner on the administrator dashboard,
  profile settings, profile management, album management, and visitor reports.
- Added a separate `Public preview · admin session active` notice on the public
  gallery and public profile pages when the administrator is still signed in.
  The notice links back to that profile's management page. Public media and
  management permissions are unchanged; management controls remain hidden in
  public preview.
- Grouped the gallery management actions and added a distinct header treatment.
- Used the site theme variables for the mode notice so the current midnight
  theme keeps readable foreground/background contrast.

## Browser acceptance

On local development, the signed-in administrator view was checked at Chromium
viewports 320×480, 390×667, and 1280×720. The preview and management links fit
without document-level horizontal scrolling. Keyboard Tab from the page start
focuses the `View public page` link. The visitor preview shows its distinct
status and a `Manage this profile` link, while the management view shows the
grouped controls and upload inputs.

A separate signed-out browser opened the same public profile. Its accessible
page contains no admin-mode notice, management link, management-control group,
or upload input. The admin browser was signed out and both browser sessions were
closed. These are Chromium viewport checks, not a physical iPhone/Safari test.

The first visual check also caught low contrast in the midnight theme. The mode
banner and its action now use the theme palette; the grouped-controls label uses
the theme-aware foreground color.

## Validation and limits

- `npx eslint` on the changed TSX files — passed.
- `npm run build` — passed, including TypeScript and static page generation.
- `git diff --check` — passed after this record was added.

Production was not changed. The administrator clarity checklist is complete for
the checked routes and viewport sizes; broader v1 device acceptance remains
open.
