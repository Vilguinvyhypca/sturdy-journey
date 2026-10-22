# Import a Windows folder over SSH

For a smaller batch that should be uploaded through the browser, sign in and open the profile's management page (for example `/admin/profiles/sabaideesana`) and choose **Upload photo folder**. Select the folder containing the photos; supported JPEG, PNG, GIF, WebP, and AVIF files in its subfolders are queued one by one, assigned to the open profile, and imported as private. The existing upload progress and cancel control apply to the whole batch. Browser uploads use the normal per-file upload size limit, so use the SSH workflow below for large collections or files that exceed it.

Run `scripts/Import-Media.ps1` in **Windows PowerShell 5.1 or PowerShell 7**, not inside an Ubuntu SSH terminal. Windows OpenSSH Client (`ssh` and `scp`) must be installed. Connect to Tailscale when using the example address. SSH uses your normal password or key; the script does not need an app API key.

The Ubuntu helper and importer must exist in `/home/mediaspacedev/projects/sturdy-journey/scripts`. The account must have its user services installed, Node supporting `--env-file`, Python 3, FFmpeg, and ffprobe. The selected app must already support profile galleries. Production uses the current release's environment and shared catalog; development uses its own environment and catalog. No existing release source is edited.

## Copy the script to Windows

In Windows PowerShell:

```powershell
scp mediaspacedev@100.75.180.84:/home/mediaspacedev/projects/sturdy-journey/scripts/Import-Media.ps1 "$HOME\Downloads\Import-Media.ps1"
```

Preview the inputs without connecting or changing anything:

```powershell
& "$HOME\Downloads\Import-Media.ps1" `
  -Source 'C:\Users\Josh Lau\Pictures\Instagram Backup\sabaideesana' `
  -Destination '/home/mediaspacedev/media-imports' `
  -Server 'mediaspacedev@100.75.180.84' `
  -DryRun
```

Remove `-DryRun` to transfer and import into **production**. Use `-Target Development` to import into the separate development app instead. If Windows blocks a trusted downloaded script, use `Unblock-File` on that file; organizational execution policies may require administrator assistance.

Optional parameters:

| Parameter | Default | Purpose |
| --- | --- | --- |
| `-Source` | Required | Windows folder; subfolders are included |
| `-Destination` | `/home/mediaspacedev/media-imports` | Ubuntu staging root |
| `-Server` | `mediaspacedev@100.75.180.84` | SSH user and hostname/IPv4 address |
| `-Profile` | Lowercase source folder name | Existing profile URL name, or a new profile to create |
| `-Target` | `Production` | `Production` or `Development` |
| `-Port` | `22` | SSH port |
| `-IdentityFile` | SSH's normal key selection | Local SSH private-key path; never sent to Ubuntu |
| `-DryRun` | Off | Print planned settings only; no SSH or writes |

Profile names must use lowercase letters, numbers, and single hyphens, up to 60 characters. If the source folder has spaces or other characters in its name, supply `-Profile`. Existing profile names, biographies, and other settings are preserved; new profiles initially use the URL name as their display name. Edit the display name in Manage profiles afterward.

## What happens

1. Validate the local folder and Ubuntu app configuration. Links/junctions are rejected so a transfer cannot accidentally follow another directory.
2. Copy the folder to `<destination>/<profile>/<unique-batch>/source` using SCP. A failed transfer never starts an import. Repeated transfers use separate batch directories.
3. Start an independent Ubuntu user-systemd job. It survives closing PowerShell or losing SSH after the job has started. The script prints the log and unit name; this means **started**, not completed.
4. Lock against another import (and production deployment), pause the selected app service, and import into its explicit catalog/storage paths. The app is unavailable throughout import and conversion. Avoid starting a separate manual importer, backfill, or service restart at this time.
5. Back up the catalog, create or reuse the selected profile, copy supported media into managed storage, and register items as **private**. Generate JPEG thumbnails and MP4 playback copies with H.264 video and AAC audio. H.264 video is remuxed; other codecs are transcoded.
6. Restart the app even if the import command fails, then print `Import completed.` only for a successful import and restart.

The Windows originals and staging folder remain intact. No source deletion is performed. Supported extensions: JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, MOV. Other files may be transferred but are not imported. Keep enough free disk space for the staging copy, managed originals, and playback copies. SCP retries recopy the source folder; catalog import skips matching SHA-256 hashes **within the selected profile**. The same file in a different profile is imported independently and never moved out of that profile. A retry also retries missing video playback conversions for duplicate records.

## Progress and review

The script prints a command like:

```powershell
ssh mediaspacedev@100.75.180.84 'tail -f /home/mediaspacedev/media-imports/sabaideesana/BATCH/import.log'
```

Use the actual batch path printed by your run. Ctrl+C exits the log viewer without stopping the import. Per-file JSON logs and catalog backups are also stored in the selected catalog directory's `imports` folder and catalog root respectively. A failed conversion produces an explicit failure and a nonzero job result; its original remains imported. Fix the reported cause and rerun the same Windows command to retry.

After `Import completed.`, sign in and open `/admin/profiles/sabaideesana`. Review playback and change visibility when ready. Private items do not appear on the public profile page.

If the server reboots, the job is killed, or the restart itself fails, inspect the log and `systemctl --user status mediaspace.service` (or `mediaspace-dev.service`). Once no import is running, restart that service and rerun the batch. This is not a transactional rollback of all imported media: successfully registered items remain, and retries skip them.

## Manual importer

The low-level importer supports `--source`, `--profile`, and `--apply`. Without `--apply` it only lists candidate counts. It respects `MEDIA_DATA_DIR` and `MEDIA_STORAGE_ROOT`, refuses database-backed configurations, and requires a separate source, repository, and managed storage location. When running it manually, the operator is responsible for preventing concurrent catalog writers and restarting the service. Prefer the Windows script and Ubuntu helper for normal imports.

## Catalog coordination

Development now includes a shared catalog writer lock for app mutations and
maintenance commands. Continue using the runner's stop/import/restart workflow.
See [catalog writer rules](catalog-writes.md) for supported commands, retryable
contention, and the boundary with older production releases. Do not remove the
persistent `.catalog-write.lock` file to clear a busy writer.
