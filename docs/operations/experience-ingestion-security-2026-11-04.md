# Visitor-event ingestion security — November 4, 2026

Branch `codex/v1-experience-request-security` originally started from `c92ee71`.
It now includes main `0c61f94`, which merged photo-validation PR #22. Its two
documentation conflicts were resolved by retaining both checkpoints in date
order. Deployment remains a separate step.

## Findings and behavior

`POST /api/experience` previously compared submitted origins with request/forwarded
host headers, did not compare schemes and permitted missing origin information.
Its process-local session quota could be bypassed with new client-selected session
IDs; the map had no firm bound on active entries. This does not establish observed
traffic manipulation.

Events now share the administrator configured-origin helper: `NEXTAUTH_URL`, or
`NEXT_PUBLIC_SITE_URL` as fallback, supplies the canonical origin;
`MEDIA_ADMIN_ORIGINS` supplies additional exact origins. Scheme, host and port must
match. Request/forwarded hosts grant no permission. An absent Origin requires an
allowed Referer; cross-site Fetch Metadata is rejected. Invalid configuration fails
closed with 503. Development aliases need explicit configuration. Existing
administrator callers retain `validateAdminOrigin`; the generic export is
`validateRequestOrigin`.

The endpoint requires exactly the application/json media type (case/parameters
allowed), valid UTF-8, the existing event allowlist and at most 4,096 actual streamed
bytes. A large Content-Length is rejected early; absent or smaller lengths cannot
bypass the stream limit. Failed/oversized reads cancel where possible and release
the reader. Handled ingestion/report responses use private, no-store and nosniff;
GET reports remain administrator-only. Client fetch/keepalive and JSON sendBeacon
payloads are unchanged, and telemetry failures remain nonblocking to visitors.

## Shared rolling quotas and limits

Validated attempts reserve allowance before log insertion: **60 events per session
and 1,200 overall per rolling minute**. Changing session IDs or forwarding/IP headers
cannot bypass the overall allowance. The state file
`MEDIA_DATA_DIR/rate-limits/experience.json` holds at most 1,200 timestamp/session
pairs, using Linux flock, a one-second lock wait, atomic replacement and mode 0600.
Workers/restarts sharing the directory retain the same allowance. No IP address or
additional browser identity is stored. Expired entries disappear on successful
reservation; the event log's existing 90-day retention is unchanged.

429 includes Retry-After for the applicable windows. Unavailable locking/storage or
corrupt state returns 503/Retry-After 10; corrupt state is retained for inspection.
Failed log writes still consume their reservation. Bursts or abuse can omit events,
so reports describe recorded activity rather than every actual visit.

Direct clients can forge browser headers and exhaust the global allowance. These
controls bound accepted persistence, not all incoming connections/CPU work, and do
not replace Cloudflare/proxy protection or establish DDoS protection. Separate hosts
with separate data directories do not share quotas. No production configuration,
event data, report schedule, recipients or emails are changed by this checkpoint.

## Verification

`tests/experience-ingestion.test.mjs` covers origin forgery, scheme/port mismatches,
referrer fallback, media-type boundaries, malformed/split UTF-8, exact 4 KiB input,
oversized/failed streams, quota-before-write ordering, log errors and authenticated
report access. Real filesystem/flock tests cover overlapping independently loaded
limiters, restart persistence, both windows, session rotation, bounded state,
permissions, retry delays and fail-closed corrupt state.

All 141 Node regressions passed. After refining Retry-After when both limits are
full, all seven focused ingestion/origin/aggregation tests passed again. Targeted
ESLint, TypeScript and the final production-mode development build passed.
An isolated production-mode localhost server with disposable data verified valid
ingestion, forged-origin and media-type rejection, anonymous report denial (401),
password-authenticated reporting (200), both quotas (429), and expired-window
recovery. Its four fixture events, quota files and test credentials were removed
with the temporary directory after stopping the server. No real reports were seeded.

The broader endpoint/cache review and iPhone/Safari/sound acceptance remain open.

## Follow-up after PR #22 merged

The combined photo-validation and visitor-event source passed all 145 Node
regressions and a fresh production-mode development build. The isolated built-app
HTTP smoke check passed again: valid ingestion, forged-origin/media-type rejection,
anonymous report 401, authenticated report 200, session/global 429 responses and
expired-window recovery. Its temporary server, four accepted fixture events,
quota state and credentials were removed. Resolving these documentation conflicts
does not merge PR #23 into main or deploy a release.
