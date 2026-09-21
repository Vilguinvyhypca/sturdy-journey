# Import a Windows media folder into the Ubuntu MediaSpace catalog

Use this for an existing Windows collection, especially files too large for browser upload. The transfer uses SSH rather than the public website. The importer copies the files into MediaSpace storage and registers them as private items; the Windows originals stay in place. Folder names do not automatically become albums.

## 1. Copy from Windows

In PowerShell, substitute the actual Windows folder path:

```powershell
scp -r "C:\Users\YOUR_NAME\Pictures\YOUR_MEDIA_FOLDER" SERVER_USER@SERVER_LAN_IP:~/MediaSpace-import
```

Wait for the command to finish. Do not start the importer while the transfer is still running. For later batches, use a new staging folder name rather than copying into an old one.

## 2. Make the staging folder readable by the MediaSpace account

On Ubuntu, first check that the intended folder exists and contains the expected files:

```bash
ls -lah /home/SERVER_USER/MediaSpace-import
```

For the first batch, move it into the MediaSpace account and give that account ownership:

```bash
sudo mv /home/SERVER_USER/MediaSpace-import /home/mediaspacedev/media-import
sudo chown -R mediaspacedev:mediaspacedev /home/mediaspacedev/media-import
```

If `/home/mediaspacedev/media-import` already exists, stop before running `mv`; use a new destination name so one batch does not get nested inside another.

## 3. Dry run, then import

Run these as `mediaspacedev` from the repository directory. The dry run counts candidate files without changing the catalog or storage. Stop the MediaSpace user service before applying the import: the current JSON catalog only supports one writer at a time.

```bash
cd /home/mediaspacedev/projects/sturdy-journey
node --env-file=.env.local scripts/import-local-media.mjs --source /home/mediaspacedev/media-import
systemctl --user stop mediaspace.service
node --env-file=.env.local scripts/import-local-media.mjs --source /home/mediaspacedev/media-import --apply
systemctl --user start mediaspace.service
```

If the import command fails, start the service before investigating. The script backs up an existing `data/media.json` before it writes, saves catalog updates atomically, and can be rerun: content already imported is skipped by SHA-256 hash. It does not delete the source folder. Keep the staging copy until the items appear and play correctly in MediaSpace.

While it runs, the terminal shows the current filename, overall bytes and percentage, and an estimated time remaining. It prints an imported/duplicate/failed result for each file. A private JSON-lines log with a start, result, and final summary for every file is saved under `data/imports/`; the command prints its exact path. The ETA is approximate and improves as more bytes are processed.

The importer accepts JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, and MOV by filename extension. It does not transcode video or read photo dates and video durations. Browser playback still depends on the file's codec. Imported files can exceed the browser's 500 MB file limit and five-minute video limit, but disk capacity and browser codec support still apply. Edit titles, descriptions, and visibility in MediaSpace after import. Album editing currently requires the database-backed catalog and is unavailable in the local JSON fallback.

The importer is for the current local JSON catalog. It refuses to run when `DATABASE_URL` is configured. A database-backed import needs a separate workflow so catalog writes remain consistent.
