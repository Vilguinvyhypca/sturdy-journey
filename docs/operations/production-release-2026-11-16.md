# Production release and access verification — November 16, 2026

The approved `main` release was built and activated through the repository's
self-hosted release workflow. No application data or media was changed during
deployment or verification.

## Release evidence

- Release ID: `20261117T032302835328Z-8b9ef6fb` (UTC timestamp in the release ID)
- Source commit: `8b9ef6fb2d9ab6682b9502b8771310edb14899b6`
- Release metadata: `ready: true`, `workingTree: false`
- Rollback target: `20261114T180120188442Z-bc058954`
- `npm run test:deployment`: all 6 release-workflow tests passed.
- The release workflow's production build, isolated smoke test and activation
  validation passed. It verified the release identity, homepage, photo listing,
  media API and the bytes of 555 JavaScript/CSS assets.

## Public access and private-media denial

Read-only HTTPS checks against `https://hymecymeyseh.fun` after activation:

- `/`, `/photos`, `/videos`, `/api/health` and `/api/media`: HTTP 200.
- `/api/health` reported the new release ID.
- For an existing private local video, anonymous requests to the original,
  playback and thumbnail endpoints all returned HTTP 404 with `private, no-store`
  caching. The public media list did not contain its ID or title, and denial
  responses exposed neither value.

The private media was not modified; the checks only attempted unauthenticated
reads. Production traffic remains on the self-hosted Ubuntu server behind
Cloudflare. DevOps backup/restore acceptance remains separate.

## Follow-up on the active release — November 26, 2026

Read-only checks against the active release `20261125T231917135343Z-eebe6d1c`
(source `eebe6d1c780e8c20d15139d624f1d2a643e62886`) confirmed:

- `/`, `/photos`, `/videos`, `/api/health`, and `/api/media` returned HTTP 200.
- `/api/health` reported the active release ID.
- An existing private local video was absent from the public media list. Anonymous
  requests to its original, playback, and thumbnail endpoints returned HTTP 404
  with `private, no-store`; its individual video page also returned HTTP 404.
- The release's previous rollback target is
  `20261125T223021881610Z-8bd3b1fe`.

No production records or media were modified. These checks close the access-check
gap for the current release noted in the v1 checklist. They do not provide DevOps
backup/restore sign-off.
