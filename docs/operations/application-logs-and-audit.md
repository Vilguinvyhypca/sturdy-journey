# Application failures and administrator audit

The app records administrator changes and operational failures in
`MEDIA_DATA_DIR/operations/YYYY-MM-DD.jsonl` (UTC dates). Files and their
directory are created with owner-only permissions. Records older than 90 days
are removed during the next log write. Each JSON line is one event. Application
failures are also emitted as JSON to stderr, which the `mediaspace.service`
systemd journal captures.

## Recorded events and privacy limits

Administrator audit events cover successful local media uploads, edits,
deletions and album assignments; profile creation and edits; and site-theme
changes. They identify the actor as `administrator`, record an action and
resource type, and store a one-way shortened hash of the resource ID. Media
edits include changed field names and visibility transitions. They do not store
titles, descriptions, original filenames, social-link values, media URLs,
session identifiers, credentials, or client IP addresses.

Operational failure events cover upload processing and cleanup, media metadata
and theme/profile mutations, local media/playback/thumbnail delivery, experience
event storage, and administrator/experience rate-limit storage. Optional
database-only album creation/deletion, Mux and Blob provider workflows, and the
legacy fingerprint scanner are outside the current local-production audit scope.

Failure events record a fixed route and operation name, error class/code, and
up to six stack frames with configured data/storage roots redacted. Exception
messages and request bodies are omitted. Uncaught Node exceptions and unhandled
rejections are observed through Next.js Node instrumentation; the monitor does
not suppress Node's normal failure behavior. If the log write itself fails, a
small `operational_log_write_failed` event is emitted to stderr.

These are operational records, not tamper-proof security logs: an administrator
with host access can alter files. The `operations` directory is in the shared
application data directory alongside the catalog. DevOps must confirm that the
server backup process includes it and should set/verify systemd journal retention
separately. The app's JSONL retention is 90 days regardless of the journal's
retention policy.

## Operator review

Inspect audit and failure events from the server account that runs the service:

```sh
tail -n 100 /home/mediaspacedev/deployments/mediaspace/shared/data/operations/$(date -u +%F).jsonl
journalctl --user -u mediaspace.service --since "24 hours ago" --no-pager
```

Search the JSONL output for `"kind":"application_failure"`,
`"kind":"administrator_change"`, or `"kind":"operational_log_write_failed"`.
The journal command is useful for correlating errors with service starts and
stops. A journal entry proves only that stderr output was observed by journald;
the JSONL record is the app-managed 90-day copy. Never paste full logs into
public tickets without reviewing them first.

## Evidence and known limits

`tests/operational-logging.test.mjs` verifies event allowlisting, redaction,
hashed resource references, the runtime-failure monitor's synchronous write,
and expiry of records older than the 90-day window. Stack frames improve error
triage but may not identify the affected request for a process-level exception.
The November 8 observation of `ERR_INVALID_STATE` therefore remains unresolved
until an occurrence includes actionable app frames or can be reproduced.
