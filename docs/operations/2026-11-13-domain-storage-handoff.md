# November 13, 2026 — domain and storage handoff

## Completed

- Fixed `www.hymecymeyseh.fun` through the Cloudflare dashboard: a proxied
  CNAME targets `hymecymeyseh.fun`, and a Single Redirect sends www requests to
  the HTTPS apex with status 301, preserving paths and query strings.
  Verified `/p/hymecymeyseh?www_check=1` redirects to the matching apex URL;
  the apex returned HTTP 200. No application deployment was needed.
- Wrangler OAuth could read the zone but could not access DNS records. The
  separately supplied API token failed Cloudflare verification as invalid.
  Its temporary file was removed, and the user cleared their shell variable.
  No credential values are recorded in this report.
- Cleared npm's download cache, recovering about 1 GB.
- Removed four old production releases, retaining both the active validated
  release `20261112T222749809859Z-c1ecc5f3` and rollback release
  `20261112T204655847820Z-4c96a35a`. The host cleanup record is
  `~/deployments/mediaspace/prune-records/storage-cleanup-20261113T232403Z.json`.
  This recovered about 3.2 GB. Production media and shared data were preserved.
- Stopped the development service, removed generated `.next`, `.next-dev`,
  and `.next-recovery` directories, and restarted development. This recovered
  about 2.2 GB; generated files will grow again during development.
- Compared staged import files with production media by size and SHA-256.
  Removed only 304 staged MP4 files after rechecking their identical production
  copies immediately before deletion: 1,141,226,983 bytes recovered.
  Preserved 441 unmatched files (60,573,995 bytes), including audio, metadata,
  and import logs. The detailed comparison report remains at
  `/tmp/mediaspace-import-duplicate-audit.json` and is temporary.
- After release/build cleanup, both application services were active and the
  production health endpoint reported the expected release. No source code,
  catalog, or production media changes were made by these cleanup operations.

## Capacity and corrected drive diagnosis

The root filesystem started at 100% usage with 532 MB available. The final
check after import cleanup showed 8.0 GB available and 93% usage on the 108 GB
filesystem. Cleanup recovered approximately 7.5 GB overall; rounding and live
filesystem activity affect these figures.

The external NTFS drive has about 291 GB available. **It is mounted read/write
on the host.** Earlier read-only observations were caused by the agent's sandbox,
not a failed host mount. An administrator's mount check and an agent check
outside the sandbox confirmed `rw`; the supplied kernel logs showed no drive
I/O errors. Do not attempt filesystem repair or remounting based on the earlier
read-only diagnosis.

The actual access constraint is ownership: the NTFS mount uses Jellyfin's
UID/GID `104:108` and `umask=0022`. `mediaspacedev` is not in that group and
cannot write to the drive root. Broadening these mount permissions could expose
Jellyfin files to modification. No drive permissions or mount settings changed.

## Resume tomorrow

1. Monitor free space; 8.0 GB provides temporary headroom, but 93% usage remains
   high. Development build output can regrow. Establish warning/critical
   thresholds and measure growth before adding more media.
2. Review whether `~/jf-restore-test-10c` (about 1.3 GB) is still needed as a
   restore-test/backup artifact. It was preserved. Jellyfin's main service is
   active, but complete reference and backup checks are still needed before
   deleting this folder. Keep the unmatched import files until their purpose
   and backup coverage are established.
3. If more capacity is needed, investigate isolated access to a dedicated
   MediaSpace folder on the existing external drive, preserving Jellyfin's
   permissions. No storage migration is approved or implemented yet. Any move
   needs verified copies, mount/access checks, service coordination, and rollback.
4. Correct future storage advice to distinguish sandbox restrictions from host
   filesystem state. The MediaSpace account cannot run sudo; administrator-only
   host diagnostics must be performed from the administrator account.

This report documents operational changes; it does not require deployment.
