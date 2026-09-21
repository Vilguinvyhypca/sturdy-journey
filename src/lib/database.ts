import { inferMediaStorage, type MediaStorageRecord } from "./media-storage";
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

export type MediaPage = {
  media: MediaItem[];
  nextCursor: string | null;
  totalCount: number;
  photoCount: number;
  videoCount: number;
  knownSizeCount: number;
  knownStorageBytes: number;
};

export type AlbumPage = { albums: Album[]; nextCursor: string | null; totalCount: number };

export type MuxUploadIntent = {
  id: string;
  status: "pending" | "ready" | "errored";
  assetId: string | null;
  errorMessage: string | null;
};

type NewMuxUploadIntent = {
  id: string;
  title: string;
  contentHash: string;
  capturedAt: string | null;
  durationSeconds: number;
  fileSizeBytes: number;
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
      await db.query(`
        CREATE TABLE IF NOT EXISTS media_storage (
          media_id TEXT PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
          provider TEXT NOT NULL CHECK (provider IN ('mux', 'vercel-blob', 'local', 'external')),
          object_key TEXT NOT NULL,
          playback_id TEXT,
          access TEXT NOT NULL CHECK (access IN ('public', 'signed', 'private', 'unknown'))
        )
      `);
      const legacyMedia = await db.query(`
        SELECT m.id, m.storage_url FROM media m
        WHERE NOT EXISTS (SELECT 1 FROM media_storage s WHERE s.media_id = m.id)
      `);
      for (const row of legacyMedia) {
        const storage = inferMediaStorage({ id: String(row.id), url: String(row.storage_url) });
        await db.query(
          `INSERT INTO media_storage (media_id, provider, object_key, playback_id, access)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (media_id) DO NOTHING`,
          [row.id, storage.provider, storage.objectKey, storage.playbackId, storage.access],
        );
      }
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
      await db.query(`
        CREATE TABLE IF NOT EXISTS mux_uploads (
          id UUID PRIMARY KEY,
          mux_upload_id TEXT UNIQUE,
          mux_asset_id TEXT UNIQUE,
          title TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          captured_at TIMESTAMPTZ,
          client_duration_seconds INTEGER NOT NULL,
          file_size_bytes BIGINT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'errored')),
          error_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.query("CREATE UNIQUE INDEX IF NOT EXISTS mux_uploads_pending_hash_unique ON mux_uploads (content_hash) WHERE status = 'pending'");
      await db.query(`
        CREATE TABLE IF NOT EXISTS mux_webhook_events (
          event_id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
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

export async function saveMedia(item: Pick<MediaItem, "id" | "url" | "type" | "title" | "contentHash" | "capturedAt" | "durationSeconds" | "fileSizeBytes" | "visibility">, storage: MediaStorageRecord = inferMediaStorage(item)) {
  await ensureDatabase();
  const db = sql();
  await db.transaction([db.query(
    `INSERT INTO media (id, storage_url, media_type, caption, content_hash, captured_at, duration_seconds, file_size_bytes, visibility)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET storage_url = EXCLUDED.storage_url, media_type = EXCLUDED.media_type, content_hash = COALESCE(media.content_hash, EXCLUDED.content_hash), captured_at = COALESCE(media.captured_at, EXCLUDED.captured_at), duration_seconds = COALESCE(media.duration_seconds, EXCLUDED.duration_seconds), file_size_bytes = COALESCE(media.file_size_bytes, EXCLUDED.file_size_bytes)`,
    [item.id, item.url, item.type, item.title, item.contentHash ?? null, item.capturedAt ?? null, item.durationSeconds ?? null, item.fileSizeBytes ?? null, item.visibility ?? "private"],
  ), db.query(
    `INSERT INTO media_storage (media_id, provider, object_key, playback_id, access)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (media_id) DO UPDATE SET provider = EXCLUDED.provider,
       object_key = EXCLUDED.object_key, playback_id = EXCLUDED.playback_id, access = EXCLUDED.access`,
    [item.id, storage.provider, storage.objectKey, storage.playbackId, storage.access],
  )]);
}

/** Server-side lookup; storage keys are intentionally absent from MediaItem responses. */
export async function getMediaStorage(id: string): Promise<MediaStorageRecord | null> {
  await ensureDatabase();
  const rows = await sql().query(
    "SELECT provider, object_key, playback_id, access FROM media_storage WHERE media_id = $1",
    [id],
  );
  const row = rows[0];
  return row ? {
    provider: row.provider as MediaStorageRecord["provider"],
    objectKey: String(row.object_key),
    playbackId: row.playback_id === null ? null : String(row.playback_id),
    access: row.access as MediaStorageRecord["access"],
  } : null;
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

export async function createMuxUploadIntent(intent: NewMuxUploadIntent) {
  await ensureDatabase();
  await sql().query(
    `INSERT INTO mux_uploads (id, title, content_hash, captured_at, client_duration_seconds, file_size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [intent.id, intent.title, intent.contentHash, intent.capturedAt, intent.durationSeconds, intent.fileSizeBytes],
  );
}

export async function attachMuxUploadId(intentId: string, uploadId: string) {
  await ensureDatabase();
  await sql().query("UPDATE mux_uploads SET mux_upload_id = $2, updated_at = NOW() WHERE id = $1", [intentId, uploadId]);
}

export async function markMuxUploadErrored(intentId: string, message: string) {
  await ensureDatabase();
  await sql().query(
    "UPDATE mux_uploads SET status = 'errored', error_message = $2, updated_at = NOW() WHERE id = $1",
    [intentId, message.slice(0, 500)],
  );
}

export async function getMuxUploadIntent(intentId: string): Promise<MuxUploadIntent | null> {
  await ensureDatabase();
  const rows = await sql().query(
    "SELECT id, status, mux_asset_id, error_message FROM mux_uploads WHERE id = $1 LIMIT 1",
    [intentId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    status: String(row.status) as MuxUploadIntent["status"],
    assetId: row.mux_asset_id ? String(row.mux_asset_id) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
  };
}

export async function finalizeMuxUpload({
  intentId,
  assetId,
  playbackId,
  signed,
  durationSeconds,
}: {
  intentId: string;
  assetId: string;
  playbackId: string;
  signed: boolean;
  durationSeconds: number;
}) {
  await ensureDatabase();
  const rows = await sql().query(
    `SELECT title, content_hash, captured_at, file_size_bytes
     FROM mux_uploads WHERE id = $1 LIMIT 1`,
    [intentId],
  );
  const row = rows[0];
  if (!row) return null;
  const media: MediaItem = {
    id: `mux:${assetId}`,
    title: String(row.title),
    type: "video",
    url: `${signed ? "mux-signed:" : "mux:"}${playbackId}`,
    createdAt: "Just now",
    album: "Uploads",
    contentHash: String(row.content_hash),
    capturedAt: row.captured_at ? new Date(String(row.captured_at)).toISOString() : null,
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    fileSizeBytes: Number(row.file_size_bytes),
    visibility: "private",
  };
  await saveMedia(media);
  await sql().query(
    `UPDATE mux_uploads
     SET status = 'ready', mux_asset_id = $2, error_message = NULL, updated_at = NOW()
     WHERE id = $1`,
    [intentId, assetId],
  );
  return media;
}

export async function recordMuxWebhookEvent(eventId: string, eventType: string) {
  await ensureDatabase();
  await sql().query(
    `INSERT INTO mux_webhook_events (event_id, event_type) VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId, eventType],
  );
}

export async function getMediaById(id: string): Promise<MediaItem | null> {
  await ensureDatabase();
  const rows = await sql().query(
    `SELECT id, storage_url, media_type, caption, description, created_at, captured_at, duration_seconds, file_size_bytes, visibility
     FROM media WHERE id = $1 LIMIT 1`,
    [id],
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
  };
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

type MediaCursor = { createdAt: string; id: string };

function encodeMediaCursor(cursor: MediaCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeMediaCursor(cursor?: string | null): MediaCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<MediaCursor>;
    if (typeof parsed.createdAt !== "string" || Number.isNaN(Date.parse(parsed.createdAt)) || typeof parsed.id !== "string" || !parsed.id) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export async function listDatabaseMediaPage({
  includeNonPublic = false,
  cursor,
  limit = 48,
  type,
  visibility,
  search,
}: {
  includeNonPublic?: boolean;
  cursor?: string | null;
  limit?: number;
  type?: MediaItem["type"];
  visibility?: MediaVisibility;
  search?: string;
} = {}): Promise<MediaPage> {
  await ensureDatabase();
  const pageSize = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const decodedCursor = decodeMediaCursor(cursor);
  const db = sql();
  const [rows, summaryRows] = await Promise.all([
    db.query(
      `SELECT m.id, m.storage_url, m.media_type, m.caption, m.description, m.created_at, m.captured_at, m.duration_seconds, m.file_size_bytes, m.visibility,
         COALESCE(array_agg(a.id) FILTER (WHERE a.id IS NOT NULL), ARRAY[]::uuid[]) AS album_ids,
         COALESCE(array_agg(a.name) FILTER (WHERE a.id IS NOT NULL), ARRAY[]::text[]) AS album_names
       FROM media m
       LEFT JOIN media_albums ma ON ma.media_id = m.id
       LEFT JOIN albums a ON a.id = ma.album_id
       WHERE ($1::boolean OR m.visibility = 'public')
         AND ($2::text IS NULL OR m.media_type = $2)
         AND ($3::text IS NULL OR m.visibility = $3)
         AND ($4::text IS NULL OR m.caption ILIKE '%' || $4 || '%' OR m.description ILIKE '%' || $4 || '%')
         AND ($5::timestamptz IS NULL OR (m.created_at, m.id) < ($5::timestamptz, $6::text))
       GROUP BY m.id
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $7`,
      [includeNonPublic, type ?? null, visibility ?? null, search ?? null, decodedCursor?.createdAt ?? null, decodedCursor?.id ?? "", pageSize + 1],
    ),
    db.query(
      `SELECT COUNT(*)::int AS total_count,
         COUNT(*) FILTER (WHERE media_type = 'photo')::int AS photo_count,
         COUNT(*) FILTER (WHERE media_type = 'video')::int AS video_count,
         COUNT(file_size_bytes)::int AS known_size_count,
         COALESCE(SUM(file_size_bytes), 0)::bigint AS known_storage_bytes
       FROM media
       WHERE ($1::boolean OR visibility = 'public')
         AND ($2::text IS NULL OR media_type = $2)
         AND ($3::text IS NULL OR visibility = $3)
         AND ($4::text IS NULL OR caption ILIKE '%' || $4 || '%' OR description ILIKE '%' || $4 || '%')`,
      [includeNonPublic, type ?? null, visibility ?? null, search ?? null],
    ),
  ]);
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const lastRow = pageRows.at(-1);
  const summary = summaryRows[0];
  return {
    media: pageRows.map((row) => ({
      id: String(row.id), title: String(row.caption), description: String(row.description ?? ""), type: String(row.media_type) as MediaItem["type"], url: String(row.storage_url),
      createdAt: new Date(String(row.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      album: Array.isArray(row.album_names) && row.album_names.length ? String(row.album_names[0]) : "Uploads",
      albumIds: Array.isArray(row.album_ids) ? row.album_ids.map(String) : [],
      capturedAt: row.captured_at ? new Date(String(row.captured_at)).toISOString() : null,
      durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
      fileSizeBytes: row.file_size_bytes === null ? undefined : Number(row.file_size_bytes),
      visibility: String(row.visibility) as MediaVisibility,
    })),
    nextCursor: hasMore && lastRow ? encodeMediaCursor({ createdAt: new Date(String(lastRow.created_at)).toISOString(), id: String(lastRow.id) }) : null,
    totalCount: Number(summary?.total_count ?? 0),
    photoCount: Number(summary?.photo_count ?? 0),
    videoCount: Number(summary?.video_count ?? 0),
    knownSizeCount: Number(summary?.known_size_count ?? 0),
    knownStorageBytes: Number(summary?.known_storage_bytes ?? 0),
  };
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

export async function listAlbumsPage({ includeNonPublic = false, cursor, limit = 24 }: { includeNonPublic?: boolean; cursor?: string | null; limit?: number } = {}): Promise<AlbumPage> {
  await ensureDatabase();
  const pageSize = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const decodedCursor = decodeMediaCursor(cursor);
  const cursorId = decodedCursor && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decodedCursor.id) ? decodedCursor.id : null;
  const [rows, countRows] = await Promise.all([
    sql().query(
      `SELECT a.id, a.name, a.description, a.created_at,
         COUNT(ma.media_id) FILTER (WHERE $1::boolean OR m.visibility = 'public')::int AS media_count
       FROM albums a
       LEFT JOIN media_albums ma ON ma.album_id = a.id
       LEFT JOIN media m ON m.id = ma.media_id
       WHERE ($2::timestamptz IS NULL OR (a.created_at, a.id) < ($2::timestamptz, $3::uuid))
       GROUP BY a.id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $4`,
      [includeNonPublic, cursorId ? decodedCursor?.createdAt ?? null : null, cursorId ?? "00000000-0000-0000-0000-000000000000", pageSize + 1],
    ),
    sql().query("SELECT COUNT(*)::int AS total_count FROM albums"),
  ]);
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const lastRow = pageRows.at(-1);
  return {
    albums: pageRows.map((row) => ({ id: String(row.id), name: String(row.name), description: String(row.description), mediaCount: Number(row.media_count), createdAt: new Date(String(row.created_at)).toISOString() })),
    nextCursor: hasMore && lastRow ? encodeMediaCursor({ createdAt: new Date(String(lastRow.created_at)).toISOString(), id: String(lastRow.id) }) : null,
    totalCount: Number(countRows[0]?.total_count ?? 0),
  };
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
