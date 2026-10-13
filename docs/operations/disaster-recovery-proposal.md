# Ubuntu server disaster recovery proposal and implementation brief

Prepared: October 13, 2026

Audience: DevOps team

Status: proposed work; cloud backups and whole-server restoration are not implemented

## Latest owner decisions and delivery plan — October 13

The Jellyfin movie/video library is excluded from cloud backups. Preserve its
configuration, databases, metadata, library paths, torrent files, and download
client configuration/state so the owner can attempt to download missing movies
again. Torrent availability is not guaranteed; downloading the library is outside
the backup completion criterion. MediaSpace media remains in scope unless the
owner explicitly excludes it separately.

The owner wants delivery within the next few days. Target 2–3 focused working
days for an encrypted backup, scheduled operation, and demonstrated restoration:

- Day 1: finalize inventory/exclusions, locate torrent and download-client state,
  confirm provider/costs, establish independent recovery access, and complete the
  first encrypted backup.
- Day 2: configure scheduling/alerts, implement the restore entrypoint, and run
  an isolated restoration on compatible Ubuntu.
- Day 3: repair discovered issues, validate application/mail state and accounts,
  and deliver the recovery kit, evidence, and documented manual steps.

Prerequisites: administrator access, owner-provided cloud credentials/budget,
and an isolated VM or spare computer. This is a target, not a guaranteed deadline.
Fully unattended recovery on arbitrary hardware and durable mail reception during
long outages may require additional work. Report those separately rather than
claiming a backup also provides mail continuity. Sign-off requires demonstrated
restoration; do not substitute installed tooling for completion.

## Objective

Protect the owner's Ubuntu server against hardware failure, theft, fire, accidental
deletion, and prolonged outages. The owner must be able to purchase a replacement
computer, install compatible Ubuntu, obtain the recovery kit, and run a documented
restore command to recover applications and data.

Prioritize low ongoing cost, straightforward operation, and recovery access that
does not depend on the original server or its email services. Use a backup provider
separate from Cloudflare. Preserve working services during implementation and
demonstrate recovery before declaring completion.

## Current environment and verified facts

| Item | Observed state |
| --- | --- |
| Operating system | Ubuntu 26.04.1 LTS |
| System storage | Approximately 81 GB used on a 108 GB root filesystem; LVM root, separate boot and EFI partitions |
| Jellyfin media disk | Approximately 1.8 TB capacity, NTFS; not mounted during inventory. Owner identifies it as Jellyfin video storage and expects mounting after restart. Used space and mount behavior remain unverified. |
| MediaSpace media | Approximately 6.6 GB at `/home/mediaspacedev/media-storage` |
| MediaSpace production data | Approximately 1.6 MB at `/home/mediaspacedev/deployments/mediaspace/shared/data` |
| MediaSpace source | `/home/mediaspacedev/projects/sturdy-journey` |
| MediaSpace production releases | `/home/mediaspacedev/deployments/mediaspace/releases`; selected through `current` |
| MediaSpace configuration | `/home/mediaspacedev/.config/mediaspace` |
| Jellyfin state | `/var/lib/jellyfin` and `/etc/jellyfin`; protected by service-account permissions |
| Running services observed | Jellyfin, Cloudflare Tunnel, Postfix, Samba, SSH, Tailscale, and user application services |
| Other accounts | Multiple user home directories; complete data inventory requires administrator access |
| Existing backup tooling | No Restic or rclone executable found during initial inventory; no automated cloud backup verified |

Cloudflare's MediaSpace fallback is deployed and passed a real tunnel-interruption
test. It serves the branded outage page and fallback video; it does not host or
restore application data. Mailbridge includes a Cloudflare inbound Worker, but its
durable storage and retry behavior during a home-server outage are not established.

## Recommended approach and cost decision

Use Backblaze B2 as the proposed cloud destination and Restic for encrypted,
incremental, versioned backups. Final provider selection requires owner agreement
after the full data inventory and cost estimate. Do not provision paid resources
or enable billing without an agreed budget.

At the time of drafting, B2 advertises $6.95 per TB-month, the first 10 GB free,
and download allowance up to three times stored data. Confirm current rates,
taxes, operation charges, region, and billing details before provisioning.

The excluded Jellyfin media disk must not be included in the cloud cost estimate.
Measure the remaining data and expected version growth; 81 GB used on root also
includes reproducible files that may be excluded. Do not promise a free backup
based on MediaSpace's 6.6 GB alone.

Sources:

- [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing)
- [Restic repository configuration](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)
- [Backblaze two-factor recovery options](https://help.backblaze.com/hc/en-us/articles/217666588-Two-Factor-Verification)

## Scope

Include all essential server applications and their recoverable state:

- MediaSpace originals, generated delivery files, catalog, profiles, albums,
  settings, source, Git history, and unpublished work.
- Jellyfin configuration, databases, users, metadata, plugins, library path/mount
  definitions, torrent files, and download-client configuration/state. Exclude
  downloaded library media, including copies found outside the main media disk.
- Mailboxes, attachments, mail databases, Mailbridge state, mail service
  configuration, and delivery queues where their recovery is supported.
- Relevant user home directories, projects, documents, scripts, scheduled tasks,
  service definitions, and application configuration.
- Package/version manifests, account IDs and groups, file ownership, permissions,
  ACLs where needed, mount definitions, disk inventory, and boot/network inventory.
- Secrets needed for recovery, encrypted before leaving the machine, with
  deliberate decisions about credentials to reissue on replacement hardware.

Inventory other disks, network shares, bind mounts, external databases, cloud
objects, and external repositories. Explicitly document anything not covered.
Exclude virtual filesystems and disposable caches/build output using reviewed
rules. Do not silently exclude irreplaceable data because it is large or protected.

The baseline is application-aware file backup plus automated reconstruction on a
fresh OS. It is not a claim of a bootable disk image or a universal unattended
bare-metal restore. If image-based recovery is required, propose and test it as
an additional deliverable.

## Proposed service targets

These are planning defaults, not measured guarantees:

| Requirement | Proposed target |
| --- | --- |
| Backup frequency | Nightly, plus a checkpoint before significant migrations |
| Maximum data loss for ordinary application state | 24 hours, subject to owner acceptance |
| Retention | 30 daily and 12 monthly recovery points |
| Integrity checking | Scheduled metadata checks and a rotating data-read check, with a documented full-check interval |
| Recovery rehearsal | Initial isolated restore and quarterly rehearsals thereafter |
| Recovery time | Measure application/state restoration in rehearsal; library re-download time is excluded |
| Failure alerting | Alert after a failed/missed backup to a channel independent of the Ubuntu mail server |

Mail accepted during an outage needs its own durability and retention targets.
An overnight server backup does not protect messages accepted elsewhere after
the most recent snapshot.

## Implementation instructions

### 1. Inventory and validate storage

Use administrator access to record services, accounts, filesystem paths, package
versions, scheduled jobs, application dependencies, data volumes, and remote data.
Record filenames and metadata needed for recovery without publishing secrets.

Inspect Jellyfin's configured library paths and its expected mount. Verify disk
identity, filesystem health, actual used space, and `/etc/fstab` or equivalent
mount units. Do not reboot or mount an unverified device without reviewing the
impact with the owner.

Document the media volume identity and expected mount for restoration; ensure
application startup cannot silently use an empty directory as a replacement
library. The excluded movie disk being absent should not block backups of the
remaining server state. If torrent files or other required state are located on
that disk, move or separately capture that state deliberately and verify access;
a missing required backup source must cause a failure/alert.

Deliver a complete inventory and expected initial/steady-state storage estimate
before selecting the final retention and budget.

### 2. Establish independent recovery access

Create a private backup bucket and appropriate scoped credentials after budget
approval. Choose a region and document the reasoning. Enable account two-factor
authentication and save recovery codes. Use an account email that remains
accessible without this Ubuntu server.

Create an off-server recovery kit containing:

- Provider/account identifiers, bucket, region, and repository address.
- Account credentials and two-factor recovery codes.
- Recovery access keys with the capabilities needed to read and restore backups.
- Restic repository password; it is required even if provider login is recovered.
- Restore instructions and a verified copy of the bootstrap script.

Keep the kit in the owner's password manager and an independent secure copy,
such as sealed recovery records or encrypted storage at another physical site.
Record how to unlock that copy without relying on the failed server. Do not store
the only encryption password inside the encrypted repository it unlocks.

Test restoring with the saved recovery credentials independently of an existing
dashboard session. Document account suspension, billing, revoked credentials,
and lost-key limitations; no provider guarantees access without usable recovery
credentials. An off-site external-drive copy is an optional additional protection
against cloud account loss.

### 3. Implement backup capture

Install pinned or documented backup tooling and create root-owned configuration
with restrictive file permissions. Keep secrets out of Git, command arguments,
logs, and shell history. Use a dedicated backup service account or root execution
where full-system file access requires it.

Define consistency procedures separately for each application. Jellyfin databases,
mail databases/queues, and MediaSpace catalogs must not be treated as arbitrary
files that are always safe to copy during writes. Use supported database exports,
application quiescing, or appropriate filesystem snapshots. A live `restic backup`
alone does not guarantee database or cross-file consistency.

Agree any service interruptions with the owner. Make restart cleanup reliable
even if capture fails. Where practical, capture consistent state quickly and
resume applications before the long cloud upload. Never leave a service stopped
because an upload is slow or unsuccessful.

Preserve ownership and supported metadata, label snapshots, prevent overlapping
runs, record completion and exit codes, and distinguish complete from failed
backups. Avoid backing up mounted remote destinations recursively.

### 4. Schedule, monitor, and protect history

Provide systemd service/timer units, scheduling documentation, bandwidth/resource
limits, and status commands. Implement alerts for failed runs, missed runs,
missing mounts, repository checks, and unexpectedly large storage growth.

Apply retention only to the intended repository and snapshot group. Verify
pruning rules on test data before enabling automatic deletion. Evaluate restricted
upload credentials, separate maintenance credentials, provider version history,
or immutable retention to protect against a compromised server deleting backups.
Test compatibility with Restic locking/pruning rather than blindly applying
object lifecycle expiration or lock rules.

### 5. Implement replacement-computer restoration

Deliver a version-controlled entrypoint such as `restore-server.sh` and a
nontechnical companion runbook. The first phase must verify the target environment,
credentials, available space, and selected snapshot; default to inspection or
staging before modifying the replacement system.

The restore flow must:

1. Install documented runtime and backup dependencies on compatible Ubuntu.
2. Retrieve a selected snapshot and restore initially into a staging location.
3. Recreate users/groups with compatible numeric ownership and restore permissions.
4. Reinstall packages or provide documented alternatives for unavailable versions.
5. Restore application state and configuration with per-service validation.
6. Recreate storage mounts for replacement disks. Adapt UUIDs, EFI/boot layout,
   hardware drivers, network interfaces, host identity, and Tailscale enrollment
   deliberately; do not overwrite these blindly from the old computer.
7. Rebuild MediaSpace through its supported release workflow and restore Jellyfin
   and mail service state using validated procedures.
8. Validate applications locally before enabling mail delivery or public traffic.
9. Reconnect Cloudflare and DNS where needed, prevent both old/new machines from
   operating simultaneously under conflicting identities, and resume backups.

The source recovery script must be available off-server before a disaster.
Record its version/checksum and keep an offline copy. Restoring onto different
hardware may require explicit manual steps; document them honestly.

### 6. Verify prolonged mail-outage behavior

Trace the actual inbound route: DNS/MX, Cloudflare routing/Worker, any storage or
queue, forwarding destination, local import, and mailbox delivery. Establish where
a message becomes durably stored and what acknowledgement is returned to its
sender. Do not assume that a successful Worker invocation means local delivery
or that the upstream retains a recoverable copy.

Provide either a verified durable off-server receiving/queueing path or a
documented hosted mailbox destination with tested replay/import. Agree retention
long enough for the desired outage duration, capacity bounds, alerting, and
deduplication. Verify attachments and delivery metadata survive replay.

SMTP senders generally retry temporary delivery failures; the standard recommends
a retry lifetime generally at least 4–5 days, but implementations vary. Sender
retry behavior is not a guaranteed long-outage storage solution. Once a system
accepts a message, verify it can deliver, retain, or report failure appropriately.
Reference: [RFC 5321](https://www.rfc-editor.org/rfc/rfc5321.html).

Coordinate mail-specific implementation with Maildev. Do not change Mailbridge,
MX records, production mail routing, or interrupt mail service without an approved
change window and rollback plan. This brief does not authorize messages to third
parties on the owner's behalf.

## Acceptance tests

Complete these tests and attach evidence before sign-off:

1. First cloud backup succeeds and contains every approved inventory item;
   snapshot size/count and excluded paths are documented.
2. Backup integrity checks pass and actual restored file hashes match originals
   for representative critical data and a documented media sample.
3. Excluded Jellyfin library files are absent from snapshots, while torrent files
   and required download-client state are present. Missing required backup sources
   cause failure and an independent alert; the excluded disk alone does not.
4. A failed/interrupted backup does not leave applications stopped and does not
   destroy the last good snapshot.
5. Deleted/changed test files can be restored from an earlier snapshot.
6. The recovery kit can restore from another machine without using original-server
   credentials or an existing logged-in session.
7. On an isolated VM or spare computer, restore MediaSpace, Jellyfin, relevant
   mail state, accounts, and service setup. Validate sign-in, permissions,
   profile data, playback/ranges, attachments, and user access.
8. Rehearsal restores must not send real queued mail, claim production network
   identities, or expose production services before deliberate cutover.
9. Simulated local mail unavailability confirms new accepted mail is retained
   off-server and replayed without lost messages or duplicate delivery.
10. Retention, job status, failure alerts, and cost reporting work as documented.

Record timing and transfer volume for the first backup and restore. Account for
internet bandwidth and backed-up data size when agreeing the recovery-time target.

## Deliverables and sign-off

- Complete inventory with backup coverage and explicit exclusions.
- Provider/budget proposal and independent recovery-access plan.
- Backup configuration, scripts, schedules, monitoring, and retention policy.
- Whole-server restore entrypoint and replacement-hardware runbook.
- Mail continuity design and tested recovery/import procedure.
- Secure recovery kit delivered directly to the owner.
- Restore rehearsal report with actual results, costs, timing, and limitations.
- Operations handoff stating who checks alerts, rotates credentials, maintains
  recovery copies, tests restoration, and handles incidents.

The owner approves the provider budget, recovery targets, maintenance windows,
and final acceptance evidence. Completion requires a verified off-server backup
and successful isolated restoration, not merely installed software or a timer.
