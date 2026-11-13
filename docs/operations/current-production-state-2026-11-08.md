# Production configuration and reporting check — November 8, 2026

Read-only verification on the `mediaspacedev` host. No production files,
configuration, releases, messages, or traffic reports were changed or sent.

## Application and source of truth

- Production is the active isolated release
  `20261106T225749970236Z-4717446f`, served by `mediaspace.service` behind the
  Cloudflare tunnel. The current-release symlink resolved to that release.
- The server-side production configuration has `MEDIA_UPLOAD_PROVIDER=local`,
  `MEDIA_DATA_DIR=/home/mediaspacedev/deployments/mediaspace/shared/data`, and
  `MEDIA_STORAGE_ROOT=/home/mediaspacedev/media-storage`.
- No `DATABASE_URL`/`POSTGRES_URL`, private Blob, or Mux configuration was
  present. Production media metadata is sourced from `media.json`; profiles and
  theme settings use `profiles.json` and `site-settings.json`. Experience events
  are date-partitioned JSONL files under `experience/`. Media files live under
  the configured storage root. Existing records may still point to external
  URLs.
- Database, Neon, Blob, and Mux adapters remain in the source as optional or
  legacy provider paths. The Neon branch uses the `@neondatabase/serverless`
  client and runtime SQL in `src/lib/database.ts`. `prisma/schema.prisma`
  documents those relational tables; it is not the active production catalog or
  the deployment migration runner. Database-backed album APIs are unavailable
  while database mode is disabled.
- Media/profile JSON writers use atomic file replacement and the cooperative
  `.catalog-write.lock` protocol documented in
  [catalog writer operations](catalog-writes.md). Manual edits and older
  scripts that ignore this lock are outside that guarantee.
- Vercel remains connected to GitHub and creates pull-request previews. The
  checks on PRs #27 and #28 completed successfully; those previews are separate
  from the self-hosted production service.

## Traffic report schedule and delivery

The installed user timer is `mediaspace-traffic-report.timer`:

- Schedule: Mondays and Wednesdays at 6:00 PM America/New_York; `Persistent=true`.
- The last observed successful runs were November 2 and November 4 at 6:00 PM.
  The November 4 service exited successfully at 6:00:18 PM. The next scheduled
  run after the November 4 Wednesday report is Monday, November 9 at 6:00 PM.
- The service runs `scripts/email-traffic-report.py` with `--scheduled --send`
  against the production shared data directory.
- From: `vilguinvyhypca@hymecymeyseh.fun`.
- To: `hymecymeyseh@proton.me`, `cks11211982@aol.com`, and
  `vilguinvyhypca@hymecymeyseh.fun`.
- The local mail queue was empty at the time of this check.

“Submitted to the email relay” in the service log means the report script handed
the message to `/usr/sbin/sendmail`; systemd success and an empty local queue do
not prove that each recipient's inbox accepted or displayed it. Check the
SMTP2GO message activity/delivery status for recipient-level confirmation.

Operator checks (run as `mediaspacedev`):

```sh
systemctl --user list-timers --all
systemctl --user status mediaspace-traffic-report.timer mediaspace-traffic-report.service
journalctl --user -u mediaspace-traffic-report.service --since "7 days ago" --no-pager
postqueue -p
```

Previewing a report does not send it; see [traffic report format and safe
preview](traffic-reports.md). Do not add `--send` to a test command or manually
trigger the scheduled service as a delivery test.

## Application log finding and remaining work

The production app journal recorded two `ERR_INVALID_STATE` uncaught exceptions
on November 8 at 11:35:24 and 11:35:28 AM Eastern:
`TypeError: Invalid state: Controller is already closed`. The app service was
still active when checked. The journal did not include a useful stack trace, so
the source and user impact are not identified by this observation.

At the time of this November 8 check, application failures were available
through the systemd journal, but the app did not yet have a structured
administrator audit trail or contextual JSONL failure records. The follow-up
implementation is documented in [application logs and audit](application-logs-and-audit.md);
it adds app-managed 90-day records, but production still needs an approved merge
and deployment before it uses them. The host's journal retention limits were not
verified in this check and should be confirmed by DevOps. Never log passwords,
session tokens, private file contents, or private-media URLs as a workaround.
