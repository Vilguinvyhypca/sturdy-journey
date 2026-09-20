# MediaSpace handoff

## Current objective

Complete Phase 2 catalog reliability. Database-first reads, explicit Blob reconciliation, and cursor pagination are shipped. Verified Mux webhook finalization is implemented locally on `codex/mux-webhook` and awaits configuration and an end-to-end test.

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

- Targeted ESLint and `npm run build` passed; the build generated `/api/webhooks/mux`.
- A direct signature check accepted a correctly signed payload and rejected the same signature after body tampering.
- Local route smoke checks confirmed anonymous upload creation and status requests return `401`, while the webhook returns `503` until its signing secret is configured.
- Repository-wide `npm run lint` still fails on two pre-existing `react-hooks/immutability` errors in `ThemeSettings.tsx`; targeted lint for this branch passes.
- No production database migration, Mux configuration, stored-media change, or live upload was executed.

## Unresolved work

- Configure `MUX_WEBHOOK_SECRET` and point Mux to `https://YOUR_DOMAIN/api/webhooks/mux`.
- Run an end-to-end upload and verify ready/errored event handling before production release.
- Add finalized-media duplicate protection after checking production for existing duplicate hashes.

- Select and document the protected gateway technology and threat model.
- Design signed local-media authorization and HTTP range delivery.
- Design the database migration and provider-selection controls.
- Define backups, monitoring, bandwidth limits, offline behavior, staged rollout, and rollback.

## Next step

Review and configure the webhook branch, perform an end-to-end upload, and then ship it before continuing the self-hosted service design.
