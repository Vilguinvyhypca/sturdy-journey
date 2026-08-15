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

## Next build phase

1. Add filtering from the main library by album.
2. Read useful metadata from uploaded media, beginning with date taken and video duration.

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
