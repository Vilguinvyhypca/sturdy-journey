# MediaSpace handoff

## Current objective

Document the newly agreed self-hosted production strategy before implementing another feature.

## Decisions

- The target public path is `example.com` -> protected gateway -> MediaSpace on the private home server -> authorized local media delivery.
- The design is specific to MediaSpace and does not depend on Jellyfin.
- The home server is intended to store the larger video catalog.
- Mux, Vercel Blob, Neon, and Vercel remain supported during a staged transition; none should be removed prematurely.
- Media records need a provider-neutral way to distinguish Mux delivery from home delivery.
- The public gateway must not expose the router, administration interfaces, raw storage paths, or unrelated home services.

## Checks

- Documentation-only change; no application behavior or deployment configuration changed.

## Unresolved work

- Select and document the protected gateway technology and threat model.
- Design signed local-media authorization and HTTP range delivery.
- Design the database migration and provider-selection controls.
- Define backups, monitoring, bandwidth limits, offline behavior, staged rollout, and rollback.

## Next step

Review the architecture wording with the user, then turn the design checklist into a concrete implementation plan before writing the home-server service.
