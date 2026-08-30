import { neon } from "@neondatabase/serverless";
import type { MediaItem, MediaVisibility } from "./media";
import { isSiteTheme, type SiteTheme } from "./theme";

export type Album = {
  id: string;
  name: string;
  description: string;
  mediaCount: number;
  createdAt: string;
};

export type { SiteTheme } from "./theme";

// Marketplace integrations may namespace the connection string with their chosen prefix.
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_DATABASE_URL ??
  process.env.POSTGRES_URL;
export const usesDatabase = Boolean(databaseUrl);

function sql() {
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  return neon(databaseUrl);
}

let schemaPromise: Promise<void> | undefined;

export function ensureDatabase() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = sql();
      await db.query(`
        CREATE TABLE IF NOT EXISTS albums (
          id UUID PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS media (
          id TEXT PRIMARY KEY,
          storage_url TEXT NOT NULL,
          media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
          caption TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          captured_at TIMESTAMPTZ,
          duration_seconds INTEGER,
          file_size_bytes BIGINT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.query("ALTER TABLE media ADD COLUMN IF NOT EXISTS content_hash TEXT");
      await db.query("ALTER TABLE media ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT");
      await db.query("ALTER TABLE media ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''");
      await db.query("ALTER TABLE media ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'");
      await db.query("ALTER TABLE media DROP CONSTRAINT IF EXISTS media_visibility_check");
      await db.query("ALTER TABLE media ADD CONSTRAINT media_visibility_check CHECK (visibility IN ('public', 'unlisted', 'private'))");
      await db.query("DROP INDEX IF EXISTS media_content_hash_unique");
      await db.query("CREATE INDEX IF NOT EXISTS media_content_hash_index ON media (content_hash) WHERE content_hash IS NOT NULL");
      await db.query(`
        CREATE TABLE IF NOT EXISTS media_albums (
          media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
          album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
          PRIMARY KEY (media_id, album_id)
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS site_settings (
          setting_key TEXT PRIMARY KEY,
          setting_value TEXT NOT NULL
        )
      `);
    })();
  }
  return schemaPromise;
}

export async function getSiteTheme(): Promise<SiteTheme> {
  if (!usesDatabase) return "indigo";
  await ensureDatabase();
  const rows = await sql().query("SELECT setting_value FROM site_settings WHERE setting_key = 'theme'");
  return isSiteTheme(rows[0]?.setting_value) ? rows[0].setting_value : "indigo";
}

export async function saveSiteTheme(theme: SiteTheme) {
  await ensureDatabase();
  await sql().query(
    `INSERT INTO site_settings (setting_key, setting_value) VALUES ('theme', $1)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [theme],
  );
}

export async function saveMedia(item: Pick<MediaItem, "id" | "url" | "type" | "title" | "contentHash" | "capturedAt" | "durationSeconds" | "fileSizeBytes" | "visibility">) {
  await ensureDatabase();
  await sql().query(
    `INSERT INTO media (id, storage_url, media_type, caption, content_hash, captured_at, duration_seconds, file_size_bytes, visibility)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET storage_url = EXCLUDED.storage_url, media_type = EXCLUDED.media_type, content_hash = COALESCE(media.content_hash, EXCLUDED.content_hash), captured_at = COALESCE(media.captured_at, EXCLUDED.captured_at), duration_seconds = COALESCE(media.duration_seconds, EXCLUDED.duration_seconds), file_size_bytes = COALESCE(media.file_size_bytes, EXCLUDED.file_size_bytes)`,
    [item.id, item.url, item.type, item.title, item.contentHash ?? null, item.capturedAt ?? null, item.durationSeconds ?? null, item.fileSizeBytes ?? null, item.visibility ?? "private"],
  );
}

export async function updateMediaDetails(id: string, title: string, description: string, visibility?: MediaVisibility) {
  await ensureDatabase();
  const rows = await sql().query(
    `UPDATE media SET caption = $2, description = $3, visibility = COALESCE($4, visibility) WHERE id = $1
     RETURNING id, storage_url, media_type, caption, description, created_at, captured_at, duration_seconds, file_size_bytes, visibility`,
    [id, title, description, visibility],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id), title: String(row.caption), description: String(row.description ?? ""),
    type: String(row.media_type) as MediaItem["type"], url: String(row.storage_url),
    createdAt: new Date(String(row.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    album: "Uploads", albumIds: [],
    capturedAt: row.captured_at ? new Date(String(row.captured_at)).toISOString() : null,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    fileSizeBytes: row.file_size_bytes === null ? undefined : Number(row.file_size_bytes),
    visibility: String(row.visibility) as MediaVisibility,
  } satisfies MediaItem;
}

export async function findMediaByHash(contentHash: string) {
  await ensureDatabase();
  const rows = await sql().query("SELECT id FROM media WHERE content_hash = $1 LIMIT 1", [contentHash]);
  return rows.length > 0;
}

export async function deleteMediaRecord(id: string) {
  await ensureDatabase();
  await sql().query("DELETE FROM media WHERE id = $1", [id]);
}

export async function getMediaAlbumDetails() {
  await ensureDatabase();
  const rows = await sql().query(
    `SELECT m.id, m.caption, m.description, m.captured_at, m.duration_seconds, m.file_size_bytes, m.visibility, COALESCE(array_agg(a.id) FILTER (WHERE a.id IS NOT NULL), ARRAY[]::uuid[]) AS album_ids,
            COALESCE(array_agg(a.name) FILTER (WHERE a.id IS NOT NULL), ARRAY[]::text[]) AS album_names
     FROM media m
     LEFT JOIN media_albums ma ON ma.media_id = m.id
     LEFT JOIN albums a ON a.id = ma.album_id
     GROUP BY m.id`,
  );
  return new Map(rows.map((row) => [String(row.id), {
    title: String(row.caption),
    description: String(row.description ?? ""),
    albumIds: Array.isArray(row.album_ids) ? row.album_ids.map(String) : [],
    album: Array.isArray(row.album_names) && row.album_names.length > 0 ? String(row.album_names[0]) : "Uploads",
    capturedAt: row.captured_at ? new Date(String(row.captured_at)).toISOString() : null,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    fileSizeBytes: row.file_size_bytes === null ? undefined : Number(row.file_size_bytes),
    visibility: String(row.visibility) as MediaVisibility,
  }]));
}

export async function listDatabaseMedia(includeNonPublic = false): Promise<MediaItem[]> {
  await ensureDatabase();
  const rows = await sql().query(
    `SELECT m.id, m.storage_url, m.media_type, m.caption, m.description, m.created_at, m.captured_at, m.duration_seconds, m.file_size_bytes, m.visibility,
       COALESCE(array_agg(a.id) FILTER (WHERE a.id IS NOT NULL), ARRAY[]::uuid[]) AS album_ids,
       COALESCE(array_agg(a.name) FILTER (WHERE a.id IS NOT NULL), ARRAY[]::text[]) AS album_names
     FROM media m
     LEFT JOIN media_albums ma ON ma.media_id = m.id
     LEFT JOIN albums a ON a.id = ma.album_id
     WHERE ($1::boolean OR m.visibility = 'public')
     GROUP BY m.id
     ORDER BY m.created_at DESC`,
    [includeNonPublic],
  );
  return rows.map((row) => ({
    id: String(row.id), title: String(row.caption), description: String(row.description ?? ""), type: String(row.media_type) as MediaItem["type"], url: String(row.storage_url),
    createdAt: new Date(String(row.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    album: Array.isArray(row.album_names) && row.album_names.length ? String(row.album_names[0]) : "Uploads",
    albumIds: Array.isArray(row.album_ids) ? row.album_ids.map(String) : [],
    capturedAt: row.captured_at ? new Date(String(row.captured_at)).toISOString() : null,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    fileSizeBytes: row.file_size_bytes === null ? undefined : Number(row.file_size_bytes),
    visibility: String(row.visibility) as MediaVisibility,
  }));
}
export async function listMuxMedia(includeNonPublic = false): Promise<MediaItem[]> {
  await ensureDatabase();
  const rows = await sql().query(
    `SELECT m.id, m.storage_url, m.media_type, m.caption, m.description, m.created_at, m.captured_at, m.duration_seconds, m.file_size_bytes, m.visibility,
       COALESCE(array_agg(a.id) FILTER (WHERE a.id IS NOT NULL), ARRAY[]::uuid[]) AS album_ids,
       COALESCE(array_agg(a.name) FILTER (WHERE a.id IS NOT NULL), ARRAY[]::text[]) AS album_names
     FROM media m
     LEFT JOIN media_albums ma ON ma.media_id = m.id
     LEFT JOIN albums a ON a.id = ma.album_id
     WHERE m.id LIKE 'mux:%' AND ($1::boolean OR m.visibility = 'public')
     GROUP BY m.id
     ORDER BY m.created_at DESC`,
    [includeNonPublic],
  );
  return rows.map((row) => ({
    id: String(row.id), title: String(row.caption), description: String(row.description ?? ""), type: String(row.media_type) as MediaItem["type"], url: String(row.storage_url),
    createdAt: new Date(String(row.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    album: Array.isArray(row.album_names) && row.album_names.length ? String(row.album_names[0]) : "Uploads",
    albumIds: Array.isArray(row.album_ids) ? row.album_ids.map(String) : [],
    capturedAt: row.captured_at ? new Date(String(row.captured_at)).toISOString() : null,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    fileSizeBytes: row.file_size_bytes === null ? undefined : Number(row.file_size_bytes),
    visibility: String(row.visibility) as MediaVisibility,
  }));
}

export async function getMuxVideo(id: string, includePrivate = false): Promise<MediaItem | null> {
  await ensureDatabase();
  const rows = await sql().query(
    `SELECT m.id, m.storage_url, m.media_type, m.caption, m.description, m.created_at, m.captured_at, m.duration_seconds, m.file_size_bytes, m.visibility,
       COALESCE(array_agg(a.id) FILTER (WHERE a.id IS NOT NULL), ARRAY[]::uuid[]) AS album_ids,
       COALESCE(array_agg(a.name) FILTER (WHERE a.id IS NOT NULL), ARRAY[]::text[]) AS album_names
     FROM media m
     LEFT JOIN media_albums ma ON ma.media_id = m.id
     LEFT JOIN albums a ON a.id = ma.album_id
     WHERE (m.id = $1 OR m.storage_url = $1)
       AND m.id LIKE 'mux:%'
       AND m.media_type = 'video'
       AND (m.visibility <> 'private' OR $2::boolean)
     GROUP BY m.id
     LIMIT 1`,
    [id, includePrivate],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id), title: String(row.caption), description: String(row.description ?? ""), type: "video", url: String(row.storage_url),
    createdAt: new Date(String(row.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    album: Array.isArray(row.album_names) && row.album_names.length ? String(row.album_names[0]) : "Uploads",
    albumIds: Array.isArray(row.album_ids) ? row.album_ids.map(String) : [],
    capturedAt: row.captured_at ? new Date(String(row.captured_at)).toISOString() : null,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    fileSizeBytes: row.file_size_bytes === null ? undefined : Number(row.file_size_bytes),
    visibility: String(row.visibility) as MediaVisibility,
  };
}

export async function setMediaAlbums(mediaId: string, albumIds: string[]) {
  await ensureDatabase();
  const db = sql();
  await db.query("DELETE FROM media_albums WHERE media_id = $1", [mediaId]);
  for (const albumId of albumIds) {
    await db.query("INSERT INTO media_albums (media_id, album_id) VALUES ($1, $2)", [mediaId, albumId]);
  }
}

export async function addMediaToAlbum(mediaIds: string[], albumId: string) {
  await ensureDatabase();
  if (mediaIds.length === 0) return;
  await sql().query(
    `INSERT INTO media_albums (media_id, album_id)
     SELECT media_id, $2::uuid FROM unnest($1::text[]) AS media_id
     ON CONFLICT DO NOTHING`,
    [mediaIds, albumId],
  );
}

export async function listAlbums(includeNonPublic = false): Promise<Album[]> {
  await ensureDatabase();
  const rows = await sql().query(
    `SELECT a.id, a.name, a.description, a.created_at,
       COUNT(ma.media_id) FILTER (WHERE $1::boolean OR m.visibility = 'public')::int AS media_count
     FROM albums a
     LEFT JOIN media_albums ma ON ma.album_id = a.id
     LEFT JOIN media m ON m.id = ma.media_id
     GROUP BY a.id
     ORDER BY a.created_at DESC`,
    [includeNonPublic],
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    mediaCount: Number(row.media_count),
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}

export async function createAlbum(id: string, name: string, description: string): Promise<Album> {
  await ensureDatabase();
  const rows = await sql().query(
    "INSERT INTO albums (id, name, description) VALUES ($1, $2, $3) RETURNING id, name, description, created_at",
    [id, name, description],
  );
  const row = rows[0];
  return { id: String(row.id), name: String(row.name), description: String(row.description), mediaCount: 0, createdAt: new Date(String(row.created_at)).toISOString() };
}

export async function updateAlbum(id: string, name: string, description: string): Promise<Album | null> {
  await ensureDatabase();
  const rows = await sql().query(
    "UPDATE albums SET name = $2, description = $3 WHERE id = $1 RETURNING id, name, description, created_at",
    [id, name, description],
  );
  const row = rows[0];
  if (!row) return null;
  const countRows = await sql().query("SELECT COUNT(*)::int AS media_count FROM media_albums WHERE album_id = $1", [id]);
  return { id: String(row.id), name: String(row.name), description: String(row.description), mediaCount: Number(countRows[0].media_count), createdAt: new Date(String(row.created_at)).toISOString() };
}

export async function deleteAlbum(id: string) {
  await ensureDatabase();
  const result = await sql().query("DELETE FROM albums WHERE id = $1 RETURNING id", [id]);
  return result.length > 0;
}

export async function getAlbum(id: string, includeNonPublic = false): Promise<{ album: Album; media: MediaItem[] } | null> {
  await ensureDatabase();
  const db = sql();
  const albumRows = await db.query("SELECT id, name, description, created_at FROM albums WHERE id = $1", [id]);
  const albumRow = albumRows[0];
  if (!albumRow) return null;
  const mediaRows = await db.query(
    `SELECT m.id, m.storage_url, m.media_type, m.caption, m.description, m.created_at, m.captured_at, m.duration_seconds, m.file_size_bytes, m.visibility
     FROM media m
     INNER JOIN media_albums ma ON ma.media_id = m.id
     WHERE ma.album_id = $1 AND ($2::boolean OR m.visibility = 'public')
     ORDER BY m.created_at DESC`,
    [id, includeNonPublic],
  );
  const media = mediaRows.map((row) => ({
    id: String(row.id),
    title: String(row.caption),
    description: String(row.description ?? ""),
    type: String(row.media_type) as MediaItem["type"],
    url: String(row.storage_url),
    createdAt: new Date(String(row.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    album: String(albumRow.name),
    albumIds: [id],
    capturedAt: row.captured_at ? new Date(String(row.captured_at)).toISOString() : null,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    fileSizeBytes: row.file_size_bytes === null ? undefined : Number(row.file_size_bytes),
    visibility: String(row.visibility) as MediaVisibility,
  }));
  return {
    album: { id: String(albumRow.id), name: String(albumRow.name), description: String(albumRow.description), mediaCount: media.length, createdAt: new Date(String(albumRow.created_at)).toISOString() },
    media,
  };
}
