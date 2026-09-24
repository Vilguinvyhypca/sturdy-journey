#!/usr/bin/env python3
"""Copy production's local media dataset into isolated development paths."""
import argparse
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()
PRODUCTION_DATA = HOME / "deployments/mediaspace/shared/data"
PRODUCTION_STORAGE = HOME / "media-storage"
DEVELOPMENT_DATA = HOME / "media-dev-data"
DEVELOPMENT_STORAGE = HOME / "media-dev-storage"
DATA_FILES = ("media.json", "profiles.json", "site-settings.json")

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="replace the development dataset")
    args = parser.parse_args()
    media_file = PRODUCTION_DATA / "media.json"
    if not media_file.is_file() or not PRODUCTION_STORAGE.is_dir():
        raise SystemExit("Production local data or storage is unavailable")
    records = json.loads(media_file.read_text())
    if not isinstance(records, list):
        raise SystemExit("Production media.json must contain an array")
    storage_bytes = sum(path.stat().st_size for path in PRODUCTION_STORAGE.iterdir() if path.is_file())
    print(f"Production dataset: {len(records)} media records and {storage_bytes:,} storage bytes.")
    print(f"Development targets: {DEVELOPMENT_DATA} and {DEVELOPMENT_STORAGE}")
    if not args.apply:
        print("Dry run only. Re-run with --apply to copy the dataset.")
        return 0
    DEVELOPMENT_DATA.mkdir(parents=True, exist_ok=True)
    DEVELOPMENT_STORAGE.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    for name in DATA_FILES:
        source = PRODUCTION_DATA / name
        if not source.is_file():
            continue
        destination = DEVELOPMENT_DATA / name
        if destination.exists():
            shutil.copy2(destination, DEVELOPMENT_DATA / f"{name}.before-prod-sync-{stamp}.bak")
        shutil.copy2(source, destination)
    subprocess.run(["rsync", "--archive", "--delete", f"{PRODUCTION_STORAGE}/", f"{DEVELOPMENT_STORAGE}/"], check=True)
    print(f"Development data synchronized. Backup suffix: {stamp}.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
