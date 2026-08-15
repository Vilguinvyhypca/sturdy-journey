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
- Neon database driver is installed and ready for album and media-detail work.

## Next build phase

1. Create the Neon database tables for albums and media details.
2. Add admin album creation and album assignment.
3. Add public album browsing and filtering.
4. Read useful metadata from uploaded media, beginning with date taken and video duration.

## Backlog

- Hover/press-and-hold muted video previews.
- Optional location handling with privacy controls.
- iCloud import workflow (deferred for now).

## Release checklist

- Run `npm run build`.
- Review `git diff origin/main..HEAD`.
- Push changes with `& "C:\Program Files\Git\cmd\git.exe" push`.
- Wait for Vercel deployment to become Ready.
- Test as both a public visitor and the admin account.
