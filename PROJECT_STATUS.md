# MediaSpace project status

Last updated: 2026-08-15

## Live today

- Public Next.js media site deployed on Vercel.
- Public photo and video delivery through Vercel Blob.
- GitHub sign-in; only `Vilguinvyhypca` can upload or delete media.
- Photo viewer, video playback, generated video previews, and file-name-free cards.
- Public visitors can browse media without signing in.

## Ready locally, awaiting publish

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

## Next build phase

1. Add optional album cover images.
2. Add a public-facing media detail page with a shareable link.

## Backlog

- Standardize the Vercel Neon connection variable from `DATABASE_URL_DATABASE_URL` to `DATABASE_URL` after confirming the live database connection.
- Hover/press-and-hold muted video previews.
- Optional location handling with privacy controls.
- iCloud import workflow (deferred for now).

## Release checklist

- Run `npm run build`.
- Review `git diff origin/main..HEAD`.
- Push changes with `& "C:\Program Files\Git\cmd\git.exe" push`.
- Wait for Vercel deployment to become Ready.
- Test as both a public visitor and the admin account.
