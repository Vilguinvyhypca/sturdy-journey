# Development and production

These are separate self-hosted deployments on `hymecymeyseh`, managed by the
`mediaspacedev` user's systemd services. Cloudflare forwards public traffic only
to production on `127.0.0.1:3000`.

| Resource | Development | Production |
| --- | --- | --- |
| URL | `http://100.75.180.84:3001` (Tailscale) | `https://hymecymeyseh.fun` |
| Source | `/home/mediaspacedev/projects/sturdy-journey` | `/home/mediaspacedev/deployments/mediaspace/releases/<release>` |
| Build | `.next-dev` in the checkout | `.next` in each release |
| Dependencies | Checkout's `node_modules` | Separate `npm ci` per release |
| Environment | Checkout's `.env.local` | `.config/mediaspace/production.env`, snapshotted per release |
| Catalog/settings | `/home/mediaspacedev/media-dev-data` | `/home/mediaspacedev/deployments/mediaspace/shared/data` |
| Media | `/home/mediaspacedev/media-dev-storage` | `/home/mediaspacedev/media-storage` |
| Service | `mediaspace-dev.service` | `mediaspace.service` |

Development uses its own session secret and does not receive production API or
database credentials. Its startup guard rejects paths outside the designated
development data/media directories and rejects remote storage credentials.
Next.js refuses to rebuild a completed production release in place. Both services
still share the host and Unix account; these are deployment/configuration boundaries,
not an OS security sandbox. User-service filesystem restrictions were not enforced
on this host, so they are not relied upon. This does not protect against host failure
or deliberate changes by the account owner.

## Publish a release

Run as `mediaspacedev`, from the development checkout:

```bash
npm run test:deployment
npm run deploy:prod
```

By default, commit changes before deployment. To explicitly deploy a snapshot of
uncommitted work, use `npm run deploy:prod -- --working-tree`. Snapshotting does
not commit, reset, or modify those changes. Avoid editing the checkout while its
snapshot is being copied.

The deploy command locks against concurrent deployments, copies source into a
new release directory, installs its own locked dependencies, builds, and starts
a temporary server bound to `127.0.0.1:3100`. It verifies the release identity,
homepage, photo listing, media API, and the bytes of every JavaScript/CSS asset.
Only a validated build can become `current`. Production then restarts and the
same checks run again. Failed activation switches back to the previous release
and restarts it. Build failures leave the running release untouched.

The previous release is retained for rollback. Hashed static assets from the
current release are copied into the next release for already-open browser tabs.
There is a short interruption during the service restart; this is not a
zero-downtime, multi-server deployment.

To build without switching production:

```bash
npm run deploy:prod -- --prepare
npm run deploy:prod -- --activate <release-id>
```

To roll back without rebuilding:

```bash
npm run rollback:prod
```

Rollback changes application code/configuration, not user data. Schema changes
must remain compatible with the previous release. Never run a build or dependency
install inside `current` or an existing release. Never point production at the
development checkout. A plain `npm run build` in the checkout is only a local
build and cannot change production.

## Configuration and operations

Edit `~/.config/mediaspace/production.env` for a future production release; edit
the checkout's `.env.local` for development. Do not copy production credentials
back into the development environment. Release environment snapshots are private
files, excluded from Git. Keep production data and media paths absolute.

```bash
systemctl --user status mediaspace.service mediaspace-dev.service
journalctl --user -u mediaspace.service -n 60 --no-pager
curl http://127.0.0.1:3000/api/health
readlink -f ~/deployments/mediaspace/current
```

These commands must run in the `mediaspacedev` user session, not `auroraixion`'s
user session. Unit definitions are checked into `ops/`; installed copies live in
`~/.config/systemd/user/`. After editing a unit, use `systemctl --user daemon-reload`
and restart the affected service.

Release directories are retained deliberately. Failed releases have `ready: false`
in `release.json`; smoke-test logs are in `smoke.log`. Review disk usage periodically
and remove only releases that are neither `current` nor `previous`. Keep at least
one validated rollback release. Back up the production environment, shared catalog,
and media separately from source control.
