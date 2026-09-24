# Profile galleries

MediaSpace uses one application with a separate public route for each profile:

```text
https://hymecymeyseh.fun/p/<profile-slug>
```

The Ubuntu local catalog stores profile records in `profiles.json` beside the
local media catalog. Existing media without a profile assignment belongs to the
initial `hymecymeyseh` profile. Media files stay in the configured local storage
directory; adding a profile does not copy or move files.

The existing production catalog can be assigned to Minami Gessel with the
reversible migration script. Run it from the production environment directory
with the production `MEDIA_DATA_DIR`; it performs a dry run first and creates
timestamped backups before writing:

```bash
node scripts/assign-media-profile.mjs
node scripts/assign-media-profile.mjs --apply
```

## Administration

Sign in at `/admin`, then open `/admin/profiles`. Each profile has a management
page at `/admin/profiles/<profile-slug>`. Uploads from that page carry the
selected profile ID and are private by default. The profile page can edit its
display name, stable URL slug, biography, handle, social links, and public local
avatar photo.

Profile URLs cannot be changed after creation because social links and search
results may already reference them. A profile slug uses lowercase letters,
numbers, and single hyphens.

## Public pages and search

Public profile pages include the profile name and biography in server-rendered
HTML, a canonical URL, Open Graph metadata, and `ProfilePage`/`Person` structured
data. Private and unlisted media remain excluded from the public gallery. The
existing individual photo and video pages continue to provide stable media URLs.

The current profile implementation is for the local Ubuntu catalog and storage
path. Database-backed profiles are intentionally rejected until the provider
neutral schema is designed; this prevents the admin UI from implying that a
profile filter is active when media is still in a different catalog.

## Verification

From the development checkout:

```bash
npx tsc --noEmit
npx next build --webpack
npm run lint
```

For a local route smoke test, run the app on an unused port and request
`/p/hymecymeyseh`, `/api/media?profile=hymecymeyseh`, and `/admin/profiles`.
The last route should redirect to `/admin` unless an administrator session is
present.
