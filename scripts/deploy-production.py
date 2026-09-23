#!/usr/bin/env python3
"""Build isolated releases; never build inside the running production directory."""
import argparse
import concurrent.futures
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

SOURCE = Path(__file__).resolve().parents[1]
ROOT = Path.home() / "deployments/mediaspace"
CONFIG = Path.home() / ".config/mediaspace/production.env"
SERVICE = "mediaspace.service"


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def output(args, **kwargs):
    return subprocess.check_output(args, **kwargs).decode().strip()


def atomic_link(target, link):
    temporary = link.with_name(link.name + ".pending")
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    temporary.replace(link)


def release_path(root, name):
    releases = (root / "releases").resolve()
    candidate = (releases / name).resolve()
    if candidate.parent != releases or not (candidate / "release.json").is_file():
        raise RuntimeError("Not a managed release")
    metadata = json.loads((candidate / "release.json").read_text())
    if not metadata.get("ready"):
        raise RuntimeError("Release did not pass validation")
    return candidate


def environment(release):
    # Parse dotenv with the same Node runtime used by Next.js, without shell evaluation.
    values = json.loads(output([
        "node", "-e",
        "const fs=require('node:fs'); const {parseEnv}=require('node:util');"
        "process.stdout.write(JSON.stringify(parseEnv(fs.readFileSync(process.argv[1],'utf8'))))",
        str(release / ".env.local"),
    ]))
    env = {key: os.environ[key] for key in ("PATH", "HOME", "USER", "LANG", "TMPDIR") if key in os.environ}
    env.update(values)
    env.update(NODE_ENV="production", NEXT_DIST_DIR=".next", NEXT_TELEMETRY_DISABLED="1")
    return env


def request(base, path):
    # Ignore proxy environment settings for loopback checks.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(base + path, timeout=10) as response:
        if response.status != 200:
            raise RuntimeError(f"{path}: HTTP {response.status}")
        return response.read()


def check(base, release, timeout=45):
    expected = release.name
    deadline = time.monotonic() + timeout
    while True:
        try:
            health = json.loads(request(base, "/api/health"))
            if health.get("release") != expected:
                raise RuntimeError("Server is not serving the expected release")
            break
        except Exception:
            if time.monotonic() >= deadline:
                raise
            time.sleep(1)
    for path in ("/", "/photos", "/api/media?limit=1"):
        request(base, path)
    assets = list((release / ".next/static").rglob("*.js"))
    assets += list((release / ".next/static").rglob("*.css"))
    if not assets:
        raise RuntimeError("No production assets were built")
    def verify_asset(asset):
        path = "/_next/static/" + urllib.parse.quote(str(asset.relative_to(release / ".next/static")))
        if hashlib.sha256(request(base, path)).digest() != hashlib.sha256(asset.read_bytes()).digest():
            raise RuntimeError(f"Asset content mismatch: {path}")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(verify_asset, assets))
    print(f"Validated {expected}: pages, API, and {len(assets)} JavaScript/CSS files", flush=True)


def smoke(release):
    with (release / "smoke.log").open("ab") as log:
        process = subprocess.Popen([
            "node", "node_modules/next/dist/bin/next", "start",
            "--hostname", "127.0.0.1", "--port", "3100",
        ], cwd=release, env=environment(release), stdout=log, stderr=log, start_new_session=True)
        try:
            check("http://127.0.0.1:3100", release)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()


def snapshot(source, release):
    files = subprocess.check_output([
        "git", "ls-files", "-z", "--cached", "--others", "--exclude-standard",
    ], cwd=source).decode().split("\0")
    for name in set(filter(None, files)):
        relative = Path(name)
        if any(part.startswith(".env") for part in relative.parts) or relative.parts[0] in (
            "node_modules", "data", ".git",
        ) or relative.parts[0].startswith(".next") or name.startswith("public/uploads/"):
            continue
        origin = source / relative
        if origin.is_symlink():
            raise RuntimeError(f"Source symlinks are not allowed in releases: {name}")
        if not origin.is_file():
            continue  # A tracked file may have been deleted in the working tree.
        destination = release / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origin, destination)


def prepare(working_tree):
    if not CONFIG.is_file():
        raise RuntimeError(f"Missing production configuration: {CONFIG}")
    dirty = output(["git", "status", "--porcelain"], cwd=SOURCE)
    if dirty and not working_tree:
        raise RuntimeError("Commit changes first, or explicitly use --working-tree to snapshot local changes")
    commit = output(["git", "rev-parse", "HEAD"], cwd=SOURCE)
    name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + "-" + commit[:8]
    release = ROOT / "releases" / name
    release.mkdir(parents=True, mode=0o700)
    snapshot(SOURCE, release)
    shutil.copyfile(CONFIG, release / ".env.local")
    with (release / ".env.local").open("a") as file:
        file.write(f"\nMEDIA_RELEASE_ID={name}\nNEXT_DIST_DIR=.next\n")
    (release / ".env.local").chmod(0o600)
    metadata = {"id": name, "commit": commit, "workingTree": bool(dirty), "ready": False}
    (release / "release.json").write_text(json.dumps(metadata, indent=2) + "\n")
    env = environment(release)
    print(f"Building isolated release {release}", flush=True)
    # Dependencies are installed in each release; never symlink the dev node_modules.
    run(["npm", "ci", "--include=dev", "--no-audit", "--no-fund"], cwd=release, env=env)
    run(["npm", "run", "build", "--", "--webpack"], cwd=release, env=env)
    if not (release / ".next/BUILD_ID").is_file():
        raise RuntimeError("Build did not produce BUILD_ID")
    # Preserve hashed assets used by browsers that still have the previous page open.
    current = ROOT / "current"
    if current.is_symlink():
        for asset in (current.resolve() / ".next/static").rglob("*"):
            if asset.is_file():
                destination = release / ".next/static" / asset.relative_to(current.resolve() / ".next/static")
                if not destination.exists():
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(asset, destination)
    smoke(release)
    metadata["ready"] = True
    (release / "release.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"Prepared release: {name}", flush=True)
    return release


def promote(root, release, restart, validate):
    current = root / "current"
    old = current.resolve() if current.is_symlink() else None
    atomic_link(release, current)
    try:
        restart()
        validate(release)
    except BaseException:
        if old is not None:
            print("Activation failed; restoring previous release", flush=True)
            atomic_link(old, current)
            restart()
            validate(old)
        else:
            current.unlink(missing_ok=True)
        raise
    if old and old != release:
        atomic_link(old, root / "previous")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--prepare", action="store_true", help="Build and validate without changing production")
    group.add_argument("--activate", metavar="RELEASE", help="Validate and activate a prepared release")
    group.add_argument("--rollback", action="store_true", help="Restore the previous validated release")
    parser.add_argument("--working-tree", action="store_true", help="Explicitly include uncommitted source changes")
    args = parser.parse_args()
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (ROOT / "deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.rollback:
            release = release_path(ROOT, (ROOT / "previous").resolve().name)
        elif args.activate:
            release = release_path(ROOT, args.activate)
        else:
            release = prepare(args.working_tree)
        if args.prepare:
            return
        if args.activate or args.rollback:
            smoke(release)
        promote(ROOT, release,
                lambda: run(["systemctl", "--user", "restart", SERVICE]),
                lambda target: check("http://127.0.0.1:3000", target))
        print(f"Production active: {release.name}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Deployment failed: {error}", file=sys.stderr)
        sys.exit(1)
