import { neon } from "@neondatabase/serverless";
import type { MediaItem } from "./media";

export type Album = {
  id: string;
  name: string;
  description: string;
  mediaCount: number;
  createdAt: string;
};

// Marketplace integrations may namespace the connection string with their chosen prefix.
const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_DATABASE_URL;
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
          captured_at TIMESTAMPTZ,
          duration_seconds INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS media_albums (
          media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
          album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
          PRIMARY KEY (media_id, album_id)
        )
      `);
    })();
  }
  return schemaPromise;
}

export async function saveMedia(item: Pick<MediaItem, "id" | "url" | "type" | "title">) {
  await ensureDatabase();
  await sql().query(
    `INSERT INTO media (id, storage_url, media_type, caption)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET storage_url = EXCLUDED.storage_url, media_type = EXCLUDED.media_type`,
    [item.id, item.url, item.type, item.title],
  );
}

export async function deleteMediaRecord(id: string) {
  await ensureDatabase();
  await sql().query("DELETE FROM media WHERE id = $1", [id]);
}

export async function getMediaAlbumDetails() {
  await ensureDatabase();
  const rows = await sql().query(
    `SELECT m.id, COALESCE(array_agg(a.id) FILTER (WHERE a.id IS NOT NULL), ARRAY[]::uuid[]) AS album_ids,
            COALESCE(array_agg(a.name) FILTER (WHERE a.id IS NOT NULL), ARRAY[]::text[]) AS album_names
     FROM media m
     LEFT JOIN media_albums ma ON ma.media_id = m.id
     LEFT JOIN albums a ON a.id = ma.album_id
     GROUP BY m.id`,
  );
  return new Map(rows.map((row) => [String(row.id), {
    albumIds: Array.isArray(row.album_ids) ? row.album_ids.map(String) : [],
    album: Array.isArray(row.album_names) && row.album_names.length > 0 ? String(row.album_names[0]) : "Uploads",
  }]));
}

export async function setMediaAlbums(mediaId: string, albumIds: string[]) {
  await ensureDatabase();
  const db = sql();
  await db.query("DELETE FROM media_albums WHERE media_id = $1", [mediaId]);
  for (const albumId of albumIds) {
    await db.query("INSERT INTO media_albums (media_id, album_id) VALUES ($1, $2)", [mediaId, albumId]);
  }
}

export async function listAlbums(): Promise<Album[]> {
  await ensureDatabase();
  const rows = await sql().query(
    `SELECT a.id, a.name, a.description, a.created_at, COUNT(ma.media_id)::int AS media_count
     FROM albums a
     LEFT JOIN media_albums ma ON ma.album_id = a.id
     GROUP BY a.id
     ORDER BY a.created_at DESC`,
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

export async function getAlbum(id: string): Promise<{ album: Album; media: MediaItem[] } | null> {
  await ensureDatabase();
  const db = sql();
  const albumRows = await db.query("SELECT id, name, description, created_at FROM albums WHERE id = $1", [id]);
  const albumRow = albumRows[0];
  if (!albumRow) return null;
  const mediaRows = await db.query(
    `SELECT m.id, m.storage_url, m.media_type, m.caption, m.created_at
     FROM media m
     INNER JOIN media_albums ma ON ma.media_id = m.id
     WHERE ma.album_id = $1
     ORDER BY m.created_at DESC`,
    [id],
  );
  const media = mediaRows.map((row) => ({
    id: String(row.id),
    title: String(row.caption),
    type: String(row.media_type) as MediaItem["type"],
    url: String(row.storage_url),
    createdAt: new Date(String(row.created_at)).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    album: String(albumRow.name),
    albumIds: [id],
  }));
  return {
    album: { id: String(albumRow.id), name: String(albumRow.name), description: String(albumRow.description), mediaCount: media.length, createdAt: new Date(String(albumRow.created_at)).toISOString() },
    media,
  };
}
