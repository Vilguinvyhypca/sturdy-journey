import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import path from "node:path";

// Run the actual application SQL against ephemeral PostgreSQL. Only Neon's HTTP
// transport is replaced; query parameters and transaction boundaries are preserved.
async function loadDatabase(pg) {
  const adapter = {
    query(sql, params) {
      return { sql, params, then(resolve, reject) {
        return pg.query(sql, params).then((result) => result.rows).then(resolve, reject);
      } };
    },
    transaction(queries) {
      return pg.transaction(async (tx) => {
        const results = [];
        for (const query of queries) results.push((await tx.query(query.sql, query.params)).rows);
        return results;
      });
    },
  };
  const unexpectedLocalAccess = () => { throw new Error("Database mode must not access local settings."); };
  const modules = new Map([
    ["@neondatabase/serverless", { neon: () => adapter }],
    ["path", { default: path }],
    ["fs/promises", Object.fromEntries(["mkdir", "readFile", "rename", "writeFile"].map((name) => [name, unexpectedLocalAccess]))],
  ]);
  for (const name of ["media-storage", "theme", "database"]) {
    const source = await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    const require = (name) => {
      assert.ok(modules.has(name), `Unexpected dependency: ${name}`);
      return modules.get(name);
    };
    // Inject a fake configuration without reading or modifying real credentials.
    new Function("require", "exports", "process", compiled)(require, exports, {
      env: { DATABASE_URL: "postgresql://test:test@unused.test/test" },
      cwd: () => "/unused-test-directory",
    });
    modules.set(`./${name}`, exports);
  }
  return modules.get("./database");
}

test("database storage migration and persistence", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  // Existing catalog shape before the additive storage table.
  await pg.exec(`CREATE TABLE media (
    id TEXT PRIMARY KEY, storage_url TEXT NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
    caption TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'public', content_hash TEXT,
    captured_at TIMESTAMPTZ, duration_seconds INTEGER, file_size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const legacy = [
    ["mux:asset-public", "mux:play-public", "video", "public"],
    ["mux:asset-signed", "mux-signed:play-signed", "video", "private"],
    ["media/photo.jpg", "https://store.public.blob.vercel-storage.com/media/photo.jpg", "photo", "unlisted"],
    ["protected-media/photo.jpg", "https://store.private.blob.vercel-storage.com/protected-media/photo.jpg", "photo", "private"],
    ["local", "/uploads/demo.mp4", "video", "private"],
    ["external", "https://example.com/cover.jpg", "photo", "public"],
  ];
  for (const row of legacy) {
    await pg.query("INSERT INTO media (id, storage_url, media_type, visibility, caption) VALUES ($1, $2, $3, $4, 'Keep this caption')", row);
  }
  const original = (await pg.query(`SELECT id, storage_url, media_type, caption, description, visibility,
    content_hash, captured_at, duration_seconds, file_size_bytes, created_at FROM media ORDER BY id`)).rows;
  let db = await loadDatabase(pg);

  await t.test("backfills every legacy provider without altering catalog rows", async () => {
    await db.ensureDatabase();
    assert.deepEqual((await pg.query(`SELECT id, storage_url, media_type, caption, description, visibility,
      content_hash, captured_at, duration_seconds, file_size_bytes, created_at FROM media ORDER BY id`)).rows, original);
    assert.equal((await pg.query("SELECT * FROM media_storage")).rows.length, legacy.length);
    assert.deepEqual(await db.getMediaStorage("mux:asset-signed"), {
      provider: "mux", objectKey: "asset-signed", playbackId: "play-signed", access: "signed",
    });
    assert.equal((await db.getMediaStorage("media/photo.jpg")).access, "public");
    assert.equal((await db.getMediaStorage("protected-media/photo.jpg")).access, "private");
    assert.equal((await db.getMediaStorage("local")).access, "public");
    assert.equal((await db.getMediaStorage("external")).provider, "external");
  });

  await t.test("restarts preserve explicit records and album relationships", async () => {
    await pg.exec(`INSERT INTO albums (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Original album');
      INSERT INTO media_albums (media_id, album_id) VALUES ('local', '00000000-0000-4000-8000-000000000001');
      UPDATE media_storage SET object_key = 'preserved-key' WHERE media_id = 'local'`);
    db = await loadDatabase(pg);
    await db.ensureDatabase();
    assert.equal((await db.getMediaStorage("local")).objectKey, "preserved-key");
    assert.equal((await pg.query("SELECT * FROM media_albums")).rows.length, 1);
    assert.deepEqual((await pg.query(`SELECT id, storage_url, media_type, caption, description, visibility,
      content_hash, captured_at, duration_seconds, file_size_bytes, created_at FROM media ORDER BY id`)).rows, original);
    assert.equal((await pg.query("SELECT * FROM media_storage")).rows.length, legacy.length);
  });

  const item = { id: "new-local", url: "/api/future/new-local", type: "video", title: "New video", originalFileName: "[date_2026-07-16] clip.mp4", visibility: "private" };
  const storage = { provider: "local", objectKey: "videos/new.mp4", playbackId: null, access: "private" };
  await t.test("saves explicit storage atomically and keeps it out of media responses", async () => {
    await db.saveMedia(item, storage);
    assert.deepEqual(await db.getMediaStorage(item.id), storage);
    const saved = await db.getMediaById(item.id);
    assert.equal(saved.url, item.url);
    assert.equal(saved.visibility, "private");
    assert.equal("storage" in saved, false);
    await db.updateMediaDetails(item.id, "Edited", "Retain metadata", "unlisted");
    await db.saveMedia(item, storage);
    const replayed = await db.getMediaById(item.id);
    assert.equal(replayed.title, "Edited");
    assert.equal(replayed.visibility, "unlisted");
    const filenameSearch = await db.listDatabaseMediaPage({ includeNonPublic: true, search: "2026" });
    assert.equal(filenameSearch.totalCount, 1);
    assert.equal(filenameSearch.media[0].title, "Edited");
    assert.equal(filenameSearch.media[0].originalFileName, item.originalFileName);
    assert.deepEqual(await db.getMediaStorage(item.id), storage);
  });

  await t.test("invalid storage rolls back inserts and updates", async () => {
    await assert.rejects(db.saveMedia({ ...item, id: "failed" }, { ...storage, provider: "invalid" }));
    assert.equal(await db.getMediaById("failed"), null);
    assert.equal(await db.getMediaStorage("failed"), null);
    await assert.rejects(db.saveMedia({ ...item, url: "/changed" }, { ...storage, access: "invalid" }));
    assert.equal((await db.getMediaById(item.id)).url, item.url);
    assert.deepEqual(await db.getMediaStorage(item.id), storage);
  });

  await t.test("catalog deletion cascades and orphan storage is rejected", async () => {
    await db.deleteMediaRecord(item.id);
    assert.equal(await db.getMediaStorage(item.id), null);
    await assert.rejects(pg.query("INSERT INTO media_storage (media_id, provider, object_key, access) VALUES ('missing', 'local', 'missing.mp4', 'private')"));
    assert.equal((await db.getMediaStorage("mux:asset-public")).playbackId, "play-public");
  });
});
