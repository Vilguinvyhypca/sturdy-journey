# MediaSpace project status

Last updated: 2026-09-05

## Live today

- Public Next.js media site deployed on Vercel.
- Public media delivery through Vercel Blob and Mux, with signed delivery for newly uploaded protected media.
- GitHub sign-in; only `Vilguinvyhypca` can upload or delete media.
- Photo viewer, video playback, generated video previews, and file-name-free cards.
- Public visitors can browse media without signing in.
- Public, unlisted, and private visibility enforced across listings, individual pages, APIs, metadata, and the sitemap.
- Individual photo and video pages, including protected-photo share links.

- Local media deletion: delete removes both the local file and its local catalog entry.
- Neon database tables for media, albums, and the media-to-album links are created automatically when the database is connected.
- New uploads create both a Blob file and a matching database media record.
- The Albums page now reads from the database and lets the administrator create albums.
- The administrator can assign a photo or video to one or more albums from its viewer.
- Album cards open public album pages that show their assigned media.
- The main library can be filtered by album, photos, or videos.
- The administrator can edit album details or delete an album without deleting its media files.
- The upload control supports selecting multiple photos and videos at once, with upload progress.
- Multi-file uploads show a progress overlay with file count, elapsed time, and an estimated time remaining.
- New uploads save file size, video duration, and a photo's original date when readable from its metadata; these details appear in the viewer.
- New uploads are checked for exact duplicate file content before they are stored.
- One administrator scan can save fingerprints, file size, and readable photo dates for earlier Blob uploads without changing or deleting any files.
- The main gallery shows library totals and storage tracked from media metadata, and initially renders 48 files at a time with a Load more control.
- Gallery photos use Vercel image optimization and caching to deliver smaller thumbnail-sized images.
- Production uploads go directly from the browser to Vercel Blob while the app still verifies the administrator, blocks exact duplicates, and saves media details. Files up to 500 MB are accepted by this upload flow.
- Public and administrator gallery reads now use Neon as the primary catalog instead of listing and reconciling Vercel Blob on every request.

## Recommended development order

### Phase 1: Finish public discovery and routing

- [x] Make `/videos` show videos and `/photos` show photos instead of rendering the unfiltered general feed.
- [x] Repair or remove the nonfunctional `/upload` route.
- [x] Make media cards link to their individual photo or video pages while preserving the enhanced viewer experience.
- [x] Server-render the initial public library results so visitors and search crawlers receive useful media content before client hydration.

### Phase 2: Improve catalog reliability and scale

- [x] Make public catalog reads database-first instead of listing Blob storage and synchronizing records during every gallery request.
- [x] Move Blob reconciliation to upload completion or an explicit administrator/background scan.
- [x] Add database-driven cursor pagination for media and albums.
- [ ] Replace browser-dependent Mux finalization polling with verified Mux webhooks and authoritative processed-asset metadata.
- [ ] Add database-level duplicate protection and use transactions or bulk operations where appropriate.

Database-driven cursor pagination means Neon returns the first group of media records plus a cursor identifying the last record. When a visitor selects **Load more**, MediaSpace sends that cursor to Neon and requests the next group instead of downloading the entire catalog during the initial page load. The visual behavior remains the same, but this improves page speed, network usage, and memory use as the library grows to hundreds or thousands of files.

### Phase 3: Harden security and maintenance

1. Add rate limiting to sign-in, upload creation, polling, and destructive endpoints.
2. Add security headers, safer JSON-LD serialization, explicit private-response caching rules, and stronger upload validation.
3. Add audit records and operational error monitoring.
4. Add automated authorization tests covering anonymous, administrator, public, unlisted-link, and private access.
5. Choose one database schema strategy and remove drift between the Prisma representation and runtime SQL migrations.

### Phase 4: Add subscriber accounts and entitlements

1. Add normal customer accounts alongside the existing administrator identity.
2. Add plans, subscriptions, payment events, and entitlement records.
3. Introduce subscriber-only media visibility and enforce it in pages, APIs, Mux token issuance, and protected-photo delivery.
4. Add account, subscription-status, renewal, cancellation, and failed-payment screens.

### Phase 5: Add crypto subscription billing

1. Start with a hosted USDC checkout on Base rather than maintaining custom payment contracts.
2. Activate or extend access only from verified, idempotent provider webhooks.
3. Prefer automatic recurring wallet authorization when a suitable provider and business account are available; otherwise begin with explicit monthly renewal.
4. Test billing and entitlement changes in a provider sandbox before accepting live payments.

Crypto billing is a planned product direction, not the next implementation milestone. The account and entitlement model should remain provider-neutral so another payment rail can be added later without rewriting media authorization.

## Backlog

- Automatically refresh the gallery after a private photo finishes processing, with a temporary processing state while it becomes available.
- Standardize the Vercel Neon connection variable from `DATABASE_URL_DATABASE_URL` to `DATABASE_URL` after confirming the live database connection.
- Add optional album cover images.
- Hover/press-and-hold muted video previews.
- Adaptive video streaming for large or high-resolution videos, with automatic quality changes on slower connections.
- Optional location handling with privacy controls.
- iCloud import workflow (deferred for now).

## Release checklist

- Run `npm run build`.
- Review `git diff origin/main..HEAD`.
- Push changes with `& "C:\Program Files\Git\cmd\git.exe" push`.
- Wait for Vercel deployment to become Ready.
- Test as both a public visitor and the admin account.
