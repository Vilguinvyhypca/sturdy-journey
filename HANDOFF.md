# MediaSpace handoff

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
