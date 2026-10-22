# Administrator request limits

Development implementation on `codex/v1-auth-upload-limits`, based on the unmerged
`codex/v1-upload-reliability` checkpoint. No production rollout is implied.

| Action | Shared rolling-minute quota | Applied before |
| --- | --- | --- |
| Credentials login submissions and provider sign-in starts | 10 | Calling NextAuth |
| Authenticated local upload requests | 120 | Reading/storing upload bytes and launching media processing |

Limits apply across the one administrator's tabs, sessions, and participating app
processes. Every admitted attempt consumes quota, including an incorrect password
or invalid upload. Rejected requests do not extend the rolling window. Upload
requests without administrator authorization return 401 before consuming quota.
Session reads, CSRF-token reads, the sign-in landing page, sign-out, and OAuth
callbacks are not charged to the login quota.

The auth wrapper uses the same decoded route parameters as NextAuth. Encoded
provider names and appended unused segments cannot bypass the credentials limit.
Throttled credentials responses retain NextAuth's expected URL field, allowing the
administrator form to display its wait message correctly.

## Storage, failure behavior, and client identity

`src/lib/rate-limit.ts` persists only admitted-attempt timestamps, in bounded
`signin.json` and `upload.json` arrays under `MEDIA_DATA_DIR/rate-limits`. Entries
outside the last minute are discarded on the next admitted write. Files have
0600 permissions, are replaced atomically, and use a separate shared flock from
media/catalog writes. Restarting the app or changing tabs does not reset quota.
No passwords, tokens, client IPs, or request bodies are stored by this limiter.

HTTP 429 responses include `Retry-After` and private/no-store caching headers.
The sign-in form explains the one-minute wait; upload UI already displays server
error messages. Unavailable/corrupt limiter state returns retryable HTTP 503 and
is logged rather than silently bypassing protection. Investigate the cause before
removing state; deleting quota files resets protection. Do not delete lock files.

The initial policy is deliberately service-wide for the single-administrator app.
It ignores `CF-Connecting-IP`, `X-Forwarded-For`, cookies, and client-selected IDs
as quota identities. Header rotation therefore cannot bypass it, and no unverified
proxy trust is introduced. The tradeoff is that one caller can temporarily consume
the shared sign-in allowance and delay other legitimate attempts. A sustained
caller can keep exhausting that allowance; this is a request cap, not per-client
isolation or DDoS protection.
If per-client limits are added later, verify the trusted ingress path first and
retain a service-wide ceiling.

The local shared filesystem is required for coordination. This does not implement
a distributed limiter across machines or protect unsupported older releases.
Legacy cloud-upload endpoints, polling, destructive operations, network filtering,
and upload-processing concurrency are separate follow-up work. Normal local batches
can submit 120 upload attempts per minute; review observed use before tuning.

## Verification

`tests/admin-rate-limit.test.mjs` checks concurrent quota admission, module reload
persistence, exact expiry/recovery, independent quotas, bounded private state,
corruption handling, encoded login routing, NextAuth response compatibility,
unrestricted session/signout/CSRF/OAuth callbacks, and authorization/throttling
before local upload storage. Existing multi-process lock tests cover the underlying
OS synchronization. The full regression suite passed 115 tests before the final
NextAuth response/UI adjustment; targeted checks cover that final adjustment.
