import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("deploy", Path(__file__).resolve().parents[1] / "scripts/deploy-production.py")
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class DeploymentSafetyTests(unittest.TestCase):
    def test_next_refuses_in_place_rebuild_before_touching_existing_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copy2(deploy.SOURCE / "next.config.ts", root / "next.config.ts")
            (root / "node_modules").symlink_to(deploy.SOURCE / "node_modules", target_is_directory=True)
            (root / "release.json").write_text(json.dumps({"ready": True}))
            asset = root / ".next/static/existing.js"
            asset.parent.mkdir(parents=True)
            asset.write_text("live asset")
            result = subprocess.run([
                "node", str(deploy.SOURCE / "node_modules/next/dist/bin/next"), "build", "--webpack",
            ], cwd=root, env={**os.environ, "NEXT_TELEMETRY_DISABLED": "1"}, capture_output=True, text=True, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Published releases cannot be rebuilt in place", result.stdout + result.stderr)
            self.assertEqual(asset.read_text(), "live asset")

    def test_build_failure_never_switches_the_live_release(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old = root / "old"
            old.mkdir()
            (root / "current").symlink_to(old)
            config = root / "production.env"
            config.write_text("MEDIA_UPLOAD_PROVIDER=local\n")
            def command(args, **kwargs):
                if args[:3] == ["npm", "run", "build"]:
                    raise RuntimeError("build failed")
            with patch.object(deploy, "ROOT", root), patch.object(deploy, "CONFIG", config), \
                 patch.object(deploy, "output", side_effect=["", "abcdef1234"]), \
                 patch.object(deploy, "snapshot"), patch.object(deploy, "environment", return_value={}), \
                 patch.object(deploy, "run", side_effect=command):
                with self.assertRaisesRegex(RuntimeError, "build failed"):
                    deploy.prepare(False)
            self.assertEqual((root / "current").resolve(), old)
            self.assertFalse((root / "previous").exists())

    def test_failed_activation_restores_previous_target_and_restarts_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old, new = root / "old", root / "new"
            old.mkdir()
            new.mkdir()
            (root / "current").symlink_to(old)
            starts = []
            def restart():
                starts.append((root / "current").resolve())
            def validate(target):
                if target == new:
                    raise RuntimeError("missing chunk")
            with self.assertRaisesRegex(RuntimeError, "missing chunk"):
                deploy.promote(root, new, restart, validate)
            self.assertEqual((root / "current").resolve(), old)
            self.assertEqual(starts, [new, old])

    def test_success_retains_previous_release_for_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old, new = root / "old", root / "new"
            old.mkdir()
            new.mkdir()
            (root / "current").symlink_to(old)
            deploy.promote(root, new, lambda: None, lambda _: None)
            self.assertEqual((root / "current").resolve(), new)
            self.assertEqual((root / "previous").resolve(), old)

    def test_unvalidated_and_external_releases_cannot_be_activated(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            release = root / "releases/broken"
            release.mkdir(parents=True)
            (release / "release.json").write_text(json.dumps({"ready": False}))
            with self.assertRaisesRegex(RuntimeError, "validation"):
                deploy.release_path(root, "broken")
            with self.assertRaisesRegex(RuntimeError, "managed release"):
                deploy.release_path(root, "../../outside")

    def test_snapshot_excludes_secrets_builds_and_data_and_copies_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, release = root / "source", root / "release"
            source.mkdir()
            release.mkdir()
            subprocess.run(["git", "init", "-q", str(source)], check=True)
            for name in ("app.ts", ".env.local", ".next/static/chunk.js", "data/media.json", "node_modules/pkg/index.js"):
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("original")
            deploy.snapshot(source, release)
            (source / "app.ts").write_text("changed in dev")
            self.assertEqual((release / "app.ts").read_text(), "original")
            self.assertEqual([p.name for p in release.iterdir()], ["app.ts"])


if __name__ == "__main__":
    unittest.main()
