# MediaSpace handoff

## DevOps disaster recovery handoff — 2026-10-13

The owner requests backup and tested replacement-computer recovery within the
next few days (target 2–3 focused working days). Exclude the Jellyfin video/movie
library; include its torrent files, download-client state, Jellyfin configuration
and database, mail, other essential server state, and MediaSpace data/media.
Library re-download is not guaranteed and is outside the restore acceptance test.
Cloud backups are not configured yet. Read
[the implementation proposal](docs/operations/disaster-recovery-proposal.md)
for inventory, daily plan, access prerequisites, and required restore evidence.
The cloud provider remains provisional pending actual size/cost and owner approval.

## Active work — 2026-10-10

October 12 completion: the authorized 90-second tunnel interruption test passed.
A fresh browser without service workers received the branded HTTP 530 outage
screen and playable/range-capable fallback video. After the tunnel restarted,
Try again returned to `/photos`, which also returned HTTP 200 independently.
The Cloudflare fallback task is complete; the tunnel is active. See the newest
PROJECT_STATUS.md entry for evidence and rollback instructions. Pending test
notes below describe earlier checkpoints.

October 12 deployment checkpoint: `mediaspace-fallback` is now published and
attached to `hymecymeyseh.fun/*`. Normal-page, branded 404, fallback-asset,
video-range, and browser Go home checks passed. Next: agree on a short live
tunnel interruption window and verify first-visit outage recovery/reconnect.
See PROJECT_STATUS.md for version and rollback instructions. Earlier route
access/publication blockers below are resolved.

October 12 checkpoint: Cloudflare account/zone/routes/scripts access is now
verified with a privately stored account API token. Fallback tests and deployment
dry run pass. Publication and route attachment remain pending; see the newest
PROJECT_STATUS.md entry. The access blocker described below is resolved.

The tested error screens and cached offline fallback are deployed to production
as `20261011T011349405759Z-f175ad25`. Cloudflare Worker upload succeeded but route
attachment failed: the configured identity sees no zones. Obtain access to the
account owning `hymecymeyseh.fun`, then attach and verify the fallback route.
Do not treat first-visit/tunnel-1033 protection as live yet. Mux is out of scope;
historical webhook tasks below are not active requirements. See PROJECT_STATUS.md
for validation and rollback details. Maildev handles email-delivery diagnostics.

## Latest checkpoint — 2026-10-04

Pending development changes are saved in Git. See the October 4 section in
[PROJECT_STATUS.md](PROJECT_STATUS.md) for scope, current validation, and release
limitations. Production was not changed. The older handoff below is historical;
the protected Cloudflare gateway has since been deployed. The next active
product milestone is Site Analytics Day 4 browser collection in its separate repo.

## Current objective

Complete Phase 2 catalog reliability and finish the Ubuntu local-storage rollout. Database-first reads, explicit Blob reconciliation, cursor pagination, provider-neutral storage records, and local uploads/playback are implemented. Verified Mux webhook finalization is implemented locally on `codex/mux-webhook` and awaits configuration and an end-to-end test.

## Decisions

- Mux webhook requests are authenticated with the endpoint-specific signing secret rather than an administrator session.
- The browser may observe upload status, but the verified webhook is responsible for publishing a completed Mux asset.

- The target public path is `example.com` -> protected gateway -> MediaSpace on the private home server -> authorized local media delivery.
- The design is specific to MediaSpace and does not depend on Jellyfin.
- The home server is intended to store the larger video catalog.
- Mux, Vercel Blob, Neon, and Vercel remain supported during a staged transition; none should be removed prematurely.
- Media records need a provider-neutral way to distinguish Mux delivery from home delivery.
- The public gateway must not expose the router, administration interfaces, raw storage paths, or unrelated home services.

## Checks

- `npm run test:storage` passes all 8 storage tests.
- `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass. Lint reports only the existing `<img>` performance warnings in the photo viewer and video thumbnail components.
- The admin page now receives the initial NextAuth session from the server, and a stalled client session check offers a retry instead of waiting indefinitely.
- Development host allowlisting is configured through `MEDIA_DEV_ORIGINS` rather than hard-coded machine addresses.
- A direct signature check accepted a correctly signed payload and rejected the same signature after body tampering.
- Local route smoke checks confirmed anonymous upload creation and status requests return `401`, while the webhook returns `503` until its signing secret is configured.
- Hover previews and touch-and-hold previews are implemented in `VideoThumbnail`.
- No production database migration, Mux configuration, stored-media change, or live upload was executed.

## Unresolved work

- Configure `MUX_WEBHOOK_SECRET` and point Mux to `https://YOUR_DOMAIN/api/webhooks/mux`.
- Run an end-to-end upload and verify ready/errored event handling before production release.
- Add finalized-media duplicate protection after checking production for existing duplicate hashes.

- The local upload/playback smoke test passed: public video range delivery returned `206`, and anonymous private-media delivery returned `404`.
- Install the missing Ubuntu Chromium libraries if browser automation is needed.

- Select and document the protected gateway technology and threat model.
- Design signed local-media authorization and HTTP range delivery.
- Design the database migration and provider-selection controls.
- Define backups, monitoring, bandwidth limits, offline behavior, staged rollout, and rollback.

## Next step

Configure the protected Ubuntu gateway and Mux webhook, then run the Mux end-to-end test before public rollout.
