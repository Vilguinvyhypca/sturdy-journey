# Local catalog writer coordination

Implemented in development on 2026-10-20; not deployed to production yet.

The local JSON catalog is shared by app requests and maintenance processes.
Atomic file replacement keeps readers from seeing partial JSON, but by itself
does not prevent one writer from overwriting another writer's newer snapshot.

## Writer contract

Every participating media/profile writer acquires the same exclusive Linux
`flock` on `MEDIA_DATA_DIR/.catalog-write.lock` **before reading the snapshot it
will modify**, and holds it until its writes finish. Each app process also keeps
its existing request queue. Readers continue to use atomic file snapshots; media
cache signatures refresh after external replacements.

Covered paths:

- App media insertion, edit, and deletion (`src/lib/db.ts`). Local deletion
  resolves the current record and removes files inside the writer lock.
- App profile creation and updates (`src/lib/profiles.ts`).
- Folder imports (`scripts/import-local-media.mjs`, apply mode).
- Profile assignment (`scripts/assign-media-profile.mjs`, apply mode).
- Playback backfills (`scripts/backfill-local-playback.mjs`), now using the
  configured `MEDIA_DATA_DIR` instead of a hard-coded working-directory catalog.

The shared helper is `src/lib/catalog-lock.cjs`. It uses the installed `flock`
executable to lock an inherited descriptor. The parent retains that descriptor
through the mutation. Closing the descriptor or terminating its process releases
the OS lock. No PID-based stale-lock takeover is needed. The empty lock file
remains permanently: **do not delete or replace it to clear contention**.

The default acquisition timeout is ten seconds. Media upload/edit/delete and
profile write routes return HTTP 503 with `Retry-After: 10` when the catalog is
busy. Uploads clean up their unaccepted files; local deletion must acquire the
lock before touching media files. Retry after maintenance finishes; investigate
the active writer if contention persists. A missing `flock` executable is a host
dependency error, not an invitation to write without a lock.

## Maintenance and release boundaries

Continue using `run-folder-import.py` / the documented Windows import workflow.
It takes the existing import/deployment coordination lock, stops the selected
service, runs the import, and restarts the service even after failure. The new
catalog lock is an additional guard for direct commands and separate processes;
it does not replace service lifecycle or deployment locking. A long direct import
or backfill can make app writes time out, so schedule it as maintenance.

Locks apply only when all writers use this protocol and the same local data
directory/filesystem. Older production code and hand-written scripts do not
participate. Do not run the new maintenance commands against an older running
release and assume they provide coordination. Manual edits, old import commands,
and unsupported network filesystem locking remain outside this guarantee.

Each JSON file is replaced atomically. This is not a transaction spanning media
bytes and multiple JSON files: a crash after deleting a file or between media and
profile replacements can still require recovery. Keep maintenance backups and
the DevOps recovery plan. Do not advertise crash-safe multi-file transactions.

## Evidence

`tests/catalog-writers.test.mjs` uses disposable directories and independent Node
processes to verify app writes overlapping a real direct folder import,
cross-process duplicate rejection and profile creation, timeout before mutation,
release after exceptions, and release after killing a writer. Storage tests also
check that failed file-removal callbacks preserve the catalog entry.

Validation: all 109 Node regression tests, three Python import-runner tests,
targeted ESLint, TypeScript, whitespace checks, and a production-mode build
in the development checkout’s separate `.next` directory passed. Tests used
disposable directories; no production imports or service interruptions were run.
