# Administrator changes and application failures

Implemented in development on `codex/admin-operation-logging`; deployment is a
separate step. Local media creation, detail/visibility/profile edits and deletion,
profile creation/edits, and local theme saves now emit structured operation
records. Records are written after the catalog/settings write succeeds; failed
writes and file-deletion failures use `outcome: failed`. Missing targets and
expected duplicate/profile-input rejections do not produce successful records.

## What is recorded

- Generated event UUID and UTC timestamp; known operation and saved/failed outcome.
- SHA-256 of a media/profile identifier, where applicable, to correlate objects
  without recording names, raw identifiers, filenames, URLs or content.
- Field names supplied in an edit and old/new visibility for a visibility edit.
  These indicate submitted fields, not a before/after diff of private values.
- Allowlisted error types/codes and up to five bounded source/built-server
  locations, without the Error message, raw stack, command output or file paths
  outside those code locations. The release ID is included when configured by
  the release workflow.
- Next's Node request-error hook supplies the HTTP method and a known route
  template, such as `/photos/[id]`. Actual request paths, parameters, headers,
  cookies, bodies and IP addresses are not logged.

Handled upload conversion/thumbnail/cleanup/save failures, original/playback/
thumbnail delivery failures and experience-write failures use the same safe sink.
Next's request hook records additional errors that Next captures. It does not
promise to capture arbitrary process crashes, every stream failure, errors Next
does not capture, or independent logs emitted by Next/FFmpeg/other libraries.
Existing raw Error logging was removed from these handled application paths.

There is one administrator, so no account/session identity is retained. Catalog
callers can also include maintained code using these app functions; the records
are not proof of a specific person or a security-grade sign-in ledger. Direct
maintenance scripts that write JSON independently do not automatically gain
logging. This milestone covers the active local application, not inactive cloud
provider mutations.

## Storage, retention and failure behavior

Files live outside public assets under `MEDIA_DATA_DIR/operations/YYYY-MM-DD.jsonl`.
New directories use mode 0700; new log files use 0600 and no-follow opens.
Append operations use a process queue and the shared Linux flock primitive to
coordinate app processes. Logs are newline-delimited JSON, not HTML.

Each daily file is capped at **5 MiB**, with **30 UTC calendar dates** retained
(today plus the previous 29). Expired date-named log files are removed on the
next log write; unrelated files and the lock file are preserved. When no events
occur, old files remain until the next write. The cap bounds these dated files
to roughly 150 MiB during normal logging, excluding directory/lock overhead.

Saved changes are best-effort audited: catalog and log writes are not one
transaction. A crash between them can leave a missing event, and concurrent
callers can record events in a different order from commits. Logging uses a
one-second flock timeout; request latency can include queued logging work. No
successful upload/delete is reported as failed solely because logging failed.

Failure events also go to stderr for the service journal. If file logging is
full, unwritable or unavailable, the sanitized event goes to stderr with
`logStorageUnavailable: true`. It still resolves so the original operation's
outcome is preserved. Journal retention follows host journald policy, separately
managed by DevOps; the application does not change or certify that policy.
Logging is diagnostic evidence, not a backup or a tamper-proof audit system.

## Operator review

Run as `mediaspacedev`. Production records will exist only after this feature is
deployed and an operation emits them:

```bash
tail -n 30 ~/deployments/mediaspace/shared/data/operations/$(date -u +%F).jsonl
journalctl --user -u mediaspace.service --since "24 hours ago" --no-pager
```

Look for `outcome: failed`, the operation, error code, release and code locations.
Check `logStorageUnavailable` before assuming that the file contains all events.
For `ENOSPC`, check capacity; for `EACCES`/`EROFS`, check host ownership/mounts;
for `CATALOG_BUSY`, identify a competing writer. `ERR_INVALID_STATE` identifies
the error class without exposing an error message. Do not fix missing context by
adding credentials, full request objects, media bodies or private URLs to logs.

To correlate a known catalog ID locally, hash it rather than searching private
titles or URLs in the journal:

```bash
node -e 'console.log(require("node:crypto").createHash("sha256").update(process.argv[1]).digest("hex"))' 'local:your-media-id'
```

Development uses its separate `MEDIA_DATA_DIR`. Keep both environments' logs out
of Git and do not copy production secrets into development for diagnostics.

## Verification

`tests/operation-log.test.mjs` exercises real files, privacy redaction, file modes,
retention, a full file, symlink rejection, separate-process appends, committed and
failed catalog mutations, profile/theme logging, and the error hook's selection
of safe context. Existing route tests use a no-op logging sink to retain their
authorization/input focus; upload-processing tests assert structured failure
actions. The built-app check additionally exercises actual administrator edits,
profile creation/update, theme save, PNG upload/deletion, a handled delivery error,
and Next's unhandled request-error hook, all with disposable data. It inspects the
resulting files for sensitive values.

Validation on the isolated branch `codex/operation-logging-review`, based on
current `main`:

- All 153 Node regressions and 12 Python tests passed.
- `npm run test:deployment` passed all 6 release-workflow tests.
- `npm run lint` passed with zero errors and five existing font/raw-image warnings.
- `npm run build` passed, including TypeScript and static-page generation.
- On the original development checkpoint based on parent `7508ed8`, an expanded
  isolated HTTP check passed 185 checks, including saved operations,
  handled file-delivery failure, Next's request-error hook and sensitive-value
  exclusion. It confirmed its temporary server stopped and data was removed.
  Its reported `sourceCommit` is the parent because implementation changes were
  uncommitted during verification; the build and tests used the logging changes.
  That expanded HTTP check was not repeated on the isolated branch.

Sandbox subprocess stdout suppression affected the initial runs; the verified
full Node suite, build and HTTP test ran outside that sandbox. A prior full-suite
assertion expected the old free-form upload error text; it now verifies the
structured failure actions. The current isolated-branch full suite passed.

No production deployment or production media changes were made in this checkpoint.
