# MediaSpace project status

Last updated: 2026-09-03

## Live in production

- Next.js media gallery deployed through Vercel, with Neon Postgres storing media details, albums, fingerprints, visibility, and theme settings.
- Public visitors can browse public media and albums without signing in.
- The administrator can sign in through GitHub OAuth. Password administration remains available while `ADMIN_PASSWORD` is configured.
- The administrator can upload, edit, organize, scan, theme, and delete media.
- Albums can be created, edited, deleted, and assigned media without deleting their photos or videos.
- The gallery supports photo, video, and album filtering; sorting; library totals; tracked storage; and incremental loading.
- Multi-file uploads include progress, elapsed time, estimated time remaining, metadata extraction, and exact duplicate detection.
- Photos use Vercel Blob and optimized gallery thumbnails. Videos use Mux for upload, processing, thumbnails, and playback.
- Mux capacity is read directly from the Mux API, displayed to the administrator, and enforced before video uploads.
- Videos and photos have unique, shareable detail-page URLs.

## Privacy and protected delivery

- Media supports `public`, `unlisted`, and `private` visibility.
- Public media appears in listings. Unlisted media is accessible through its direct MediaSpace link. Private media is restricted to the administrator.
- Newly uploaded protected videos use signed Mux playback when the signing-key variables are configured.
- Newly uploaded photos use the separate private Vercel Blob store when its OIDC variables are configured.
- Private Blob photos are delivered through an authenticated application route instead of exposing a permanent public Blob URL.
- Existing legacy media keeps its original delivery configuration until a deliberate migration is performed.

## Production verification completed

- GitHub OAuth and administrator access work after configuring `NEXTAUTH_SECRET` for Production and Preview.
- Existing media records load from the production Neon database.
- Private photo upload and authenticated delivery work in deployed environments.
- Unique photo share links work.
- Public, unlisted, and private visibility behavior has been tested.
- New photo uploads complete successfully. The gallery currently requires a manual refresh when private-photo processing finishes.

## Next build phase

1. Add search across titles, descriptions, dates, albums, and extracted metadata.
2. Add optional album cover images.

## Backlog

- Automatically refresh the gallery after a private photo finishes processing, with a temporary processing state while it becomes available.
- Standardize the Vercel Neon connection variable to `DATABASE_URL` after confirming that every deployed environment uses the same name.
- Migrate existing protected photos and videos from legacy public delivery without breaking current public media or links.
- Add explicit delivery conversion when protected media is intentionally made public.
- Add hover or press-and-hold muted video previews.
- Improve adaptive video streaming as the library grows.
- Add optional location metadata with privacy controls.
- Add an iCloud import workflow.
- Plan the eventual MediaSpace product rename and custom production, preview, and staging domains.

## Release checklist

- Run `npm run build`.
- Review `git diff origin/main..HEAD`.
- Push the documentation or feature branch to GitHub.
- Wait for Vercel deployment to become Ready.
- Test as both a public visitor and the admin account.
