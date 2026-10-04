import base64
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('folder_import', Path(__file__).resolve().parents[1] / 'scripts/run-folder-import.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class ImportRunnerTests(unittest.TestCase):
    def test_service_restarts_after_failed_import_and_holds_catalog_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            app = home / 'app'
            (app / 'src/app/admin/profiles/[slug]').mkdir(parents=True)
            (app / 'src/app/admin/profiles/[slug]/page.tsx').touch()
            (home / 'media-dev-data').mkdir()
            source = home / 'staging'
            source.mkdir()
            config = base64.b64encode(json.dumps({'source': str(source), 'profile': 'test', 'target': 'Development'}).encode()).decode()
            calls = []

            def checked(args, **kwargs):
                calls.append(args)
                if '--apply' in args:
                    import fcntl
                    with (home / 'media-dev-data/import.lock').open('a') as lock:
                        with self.assertRaises(BlockingIOError):
                            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    raise subprocess.CalledProcessError(3, args)

            with patch.object(runner, 'HOME', home), patch.object(runner, 'APP', app), patch.object(runner, 'checked', side_effect=checked), patch.object(runner.subprocess, 'check_output', return_value='{ path=/usr/bin/node ; }'), patch.object(runner.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)), patch.object(runner.shutil, 'which', return_value='/usr/bin/ffmpeg'):
                with self.assertRaises(subprocess.CalledProcessError):
                    runner.run(config, True)
            self.assertIn(['systemctl', '--user', 'stop', 'mediaspace-dev.service'], calls)
            self.assertIn(['systemctl', '--user', 'start', 'mediaspace-dev.service'], calls)
            self.assertEqual(calls[-1], ['systemctl', '--user', 'is-active', '--quiet', 'mediaspace-dev.service'])

    def test_bad_profile_rejected_before_commands(self):
        config = base64.b64encode(json.dumps({'source': '/tmp', 'profile': 'x; touch /tmp/bad', 'target': 'Production'}).encode()).decode()
        with patch.object(runner, 'checked') as checked:
            with self.assertRaises(ValueError):
                runner.run(config, True)
            checked.assert_not_called()

    def test_unreleased_profile_support_blocks_import(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            config = base64.b64encode(json.dumps({'source': directory, 'profile': 'test', 'target': 'Production'}).encode()).decode()
            with patch.object(runner, 'HOME', home), patch.object(runner, 'checked') as checked:
                with self.assertRaisesRegex(RuntimeError, 'Deploy the profile-gallery changes first'):
                    runner.run(config, True)
                checked.assert_not_called()


if __name__ == '__main__':
    unittest.main()
