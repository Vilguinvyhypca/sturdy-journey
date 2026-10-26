# Production release — 2026-10-26

Owner authorization: merge the pending code, update the repository and deploy.
Application source commit: `315f826c27ef2517cf42e93461870f3019629164`.
Release: `20261026T002940452940Z-315f826c` (identifier uses UTC).
Live site: https://hymecymeyseh.fun.
Rollback target: `20261018T170511790687Z-e8155951`.

## Included work

The tested feature-branch chain was reviewed and fast-forwarded into main,
then pushed to origin before deployment. This includes the accumulated upload/
catalog reliability work, administrator rate limits, origin validation, bounded
media/profile/theme edit JSON, security headers, private thumbnail/list caching,
polling backoff, regression coverage and browser-review records. No redesign,
provider migration or Cloudflare Worker deployment was included.

The report email's full-URL/count table is now tracked on main. Its existing
schedule, recipients and private configuration remain unchanged.

## Release checks

- All 132 Node regressions passed.
- Six deployment/rollback tests and three traffic-email tests passed.
- TypeScript and diff checks passed.
- Full ESLint: zero errors, five existing warnings (font placement and img use).
- Production canonical origin confirmed as https://hymecymeyseh.fun; local data
  and media directories remain isolated from development. No credentials logged.
- `npm run deploy:prod` installed locked dependencies and built in a new release
  directory. It validated the release on the temporary server before activation,
  then repeated checks after restarting production. Both passes validated pages,
  API and all 371 JS/CSS assets, including retained assets for older browser tabs.
- Production current points to the new release; previous points to the rollback
  release. No data/schema migration was required.

## Live HTTPS verification

The public health endpoint reported the expected release. Homepage, photo/video
lists and the owner's existing public share link returned 200. The media list
returned public items with private/no-store. Public converted video supported a
206 range response and its thumbnail returned 200.

A sampled existing private video's original, playback, thumbnail and page denied
signed-out requests with 404. The profiles API denied signed-out access with 401.
The nosniff, strict-origin-when-cross-origin and SAMEORIGIN headers were present.

A temporary production administrator session was authenticated through NextAuth.
Malformed media/theme/profile edits returned 400; an oversized profile request
returned 413; an untrusted-origin media mutation returned 403. These requests were
intentionally invalid and did not change production content. The session was
signed out afterward. No production media was uploaded, edited or deleted for
these checks.

## Remaining work

This release does not close the broader security audit, full form interaction,
iPhone/Safari checks, administrator-mode clarity, maintenance/logging work or
DevOps backup/restore acceptance. Desktop photo/video workflow evidence remains
in the earlier development browser-review documents.

Rollback if needed: run `npm run rollback:prod` from the development checkout;
this restores the previous validated application release, not historical data.
These release notes are a subsequent documentation-only commit; production remains
built from `315f826` and does not need another build for the notes.
