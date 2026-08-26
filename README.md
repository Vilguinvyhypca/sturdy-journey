# MediaSpace

MediaSpace is a public photo and video gallery with a private administration area. Visitors can browse the gallery, albums, and individual video pages. An administrator can upload, organize, edit, scan, theme, and delete media.

## How everything works

![MediaSpace architecture and media flow](docs/mediaspace-architecture.svg)

1. The administrator opens `/admin` and signs in with the configured GitHub account or admin password.
2. The browser validates selected files and checks their metadata before upload.
3. Photos upload directly to Vercel Blob. Videos upload directly to Mux, where they are processed into streaming video and thumbnails.
4. Neon Postgres stores the media record: its URL or Mux playback ID, title, description, date, fingerprint, and album relationships.
5. The Next.js app reads those records and renders the public gallery, albums, filters, media viewer, and searchable video pages.
6. Public visitors can view media but cannot see or use the administration controls.

Direct browser uploads keep large video files out of the Vercel application function. Vercel hosts the app and its API endpoints; Mux handles video ingestion, processing, thumbnails, and playback; Vercel Blob serves photos; Neon stores structured application data.

## Local and production storage

| Content | Local fallback | Production |
| --- | --- | --- |
| Photos | `public/uploads/` | Vercel Blob |
| Videos | Local upload fallback, or Mux when configured | Mux Video |
| Media details | `data/media.json` | Neon Postgres |
| Albums, fingerprints, and theme | Available when the database is configured | Neon Postgres |

Local JSON records are an array of media objects. Production data uses relational database tables so media can be connected to albums and extended without duplicating records.

## Administrator and public access

- `/` is the public gallery.
- `/videos/[id]` gives a video its own shareable and search-engine-friendly page.
- `/albums` displays albums.
- `/admin` is the private entry point for administration.
- Upload, edit, delete, organize, scanning, and theme controls require an authenticated administrator session.

Hiding controls is only a user-interface improvement. The API routes also verify the administrator session before allowing changes.

## Configuration

The deployed app uses these services and environment variables:

- Authentication: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, plus either `ADMIN_PASSWORD` or `GITHUB_ID`, `GITHUB_SECRET`, and `ADMIN_GITHUB_LOGIN`.
- Database: `DATABASE_URL` (the app also recognizes Vercel/Neon aliases used by existing deployments).
- Photos: a connected Vercel Blob store using `BLOB_STORE_ID`/OIDC or the legacy `BLOB_READ_WRITE_TOKEN`.
- Videos: `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`.

Never commit real credentials or `.env.local` to GitHub.

## Run locally

Install dependencies and start the development server:

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use [http://localhost:3000/admin](http://localhost:3000/admin) for administration.

## Verification

```powershell
npm run build
```

The production deployment is managed by Vercel from the connected GitHub repository.

## MediaSpace backlog

- Add search across titles, descriptions, dates, albums, and extracted metadata.
- Add adaptive video streaming improvements as the video library grows.
