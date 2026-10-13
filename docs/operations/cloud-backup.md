# MediaSpace cloud backup and disaster recovery

Status: initial inventory complete; cloud destination, credentials, encryption
setup, first backup, scheduling, and restore rehearsal are pending. No cloud
backup exists as a result of this document. The owner expanded scope on October
13 to whole-server disaster recovery, including Jellyfin and all essential
applications, with a restore entrypoint for a replacement computer.

Latest owner clarification: exclude the Jellyfin movie/video library from cloud
backups. Include torrent files and download-client configuration/state, Jellyfin
configuration/database, and the remaining essential server state. MediaSpace
media remains included. Library re-download depends on source availability and
is outside the restore acceptance criterion. Target 2–3 focused working days;
the detailed scope, schedule, prerequisites, and acceptance tests are in
[the DevOps proposal](disaster-recovery-proposal.md).

## Whole-server scope

Observed system: Ubuntu 26.04.1 LTS, root filesystem approximately 81 GB used
of 108 GB. EFI and boot use separate partitions and root uses LVM. A separate
1.8 TB NTFS partition was detected but is not mounted; its contents are not yet
inventoried or backed up. The owner identifies it as Jellyfin library storage and
has now excluded the downloaded media from backups; preserve its mount definitions
and any required torrent/client state separately.

Running services include Jellyfin, Cloudflare Tunnel, Postfix, Samba, SSH,
Tailscale, and user services. Home directories belong to multiple accounts;
system-level backup access is required to cover their data and protected
Jellyfin configuration/database. Preserve numeric ownership and permissions,
package manifests, service definitions, boot/storage inventory, and recoverable
application data. Exclude virtual filesystems, temporary files, and reproducible
caches only after reviewing the complete inventory.

Proposed recovery method: install compatible Ubuntu on replacement hardware,
then run an administrator restore entrypoint to retrieve encrypted snapshots,
recreate accounts and packages, restore files and service configuration, and
validate services before enabling traffic. Do not blindly overwrite boot,
storage, network, or machine identity configuration from the old computer.
Bootstrap instructions and recovery secrets must be available off-server.
Database consistency and the needed service stop/snapshot procedure remain to
be designed and approved; no services were stopped during this inventory.

## Recovery inventory

The October 13 inventory found approximately 6.6 GB in production media storage
and 1.6 MB in the production data directory. Source dependency folders and old
builds can be regenerated and should not consume backup storage.

| Resource | Location | Recovery purpose |
| --- | --- | --- |
| Production media | `/home/mediaspacedev/media-storage` | Original media and generated delivery files |
| Production data | `/home/mediaspacedev/deployments/mediaspace/shared/data` | Catalog, profiles, site settings, and associated records |
| Application source and Git history | `/home/mediaspacedev/projects/sturdy-journey` | Rebuild the application and preserve unpublished development work |
| Production configuration | `/home/mediaspacedev/.config/mediaspace` | Authentication, service configuration, and Cloudflare API access; encrypted backup only |
| User service definitions | `/home/mediaspacedev/.config/systemd/user` | Recreate application services and timers |
| Cloudflare Worker configuration | `ops/cloudflare` in the source checkout | Rebuild and publish outage recovery |
| Tunnel and host setup | System-managed Cloudflare and Ubuntu configuration | Inventory through administrator access; recreate tunnel connectivity and required packages |

Development data and media, import staging directories, and other projects must
be inventoried separately before deciding whether to include them. Do not assume
the production media folder contains every original elsewhere on the host.

## Implementation requirements

- Use a private cloud repository with client-side encryption and versioned
  snapshots, rather than a mirror that immediately propagates deletions.
- Keep repository credentials and encryption secrets out of source control,
  shell history, chat, and logs.
- Keep an independent copy of the decryption password and cloud recovery access
  in the owner's password manager or other secure off-server location. A password
  stored only on the destroyed server cannot recover the backup.
- Capture application databases, catalogs, and included media consistently. Agree on a maintenance window or an
  appropriate snapshot mechanism before stopping services for backup.
- Proposed initial schedule: nightly, retaining 30 daily and 12 monthly recovery
  points. Confirm retention, costs, and acceptable data loss with the owner.
- Record backup success/failure and configure a destination for failure alerts.
- Verify repository integrity and perform an isolated restore before describing
  the system as protected. Never restore over the live catalog during rehearsal.
- Consider protection against deletion using compromised server credentials;
  encryption alone does not prevent deletion of cloud backup objects.

## Replacement-server recovery outline

1. Obtain the cloud credentials and decryption password from off-server storage.
2. Install a supported Ubuntu environment and required runtime/media tools.
3. Restore into isolated directories and verify media/catalog references and
   file integrity before switching any public traffic.
4. Restore application source, production configuration, and service definitions;
   adjust machine-specific paths and permissions deliberately.
5. Build a new production release through the documented deployment workflow.
6. Recreate the Cloudflare tunnel connection and verify its ingress target;
   retain the existing public domain and fallback configuration where possible.
7. Verify administrator sign-in, public/private visibility, media playback and
   ranges, uploads, profiles, and fallback/reconnect behavior.
8. Enable traffic only after verification, then reinstate backups and alerts.

Record actual restoration time after rehearsal before promising a recovery-time
target. Cloudflare fallback provides an outage page, not the restored library.
