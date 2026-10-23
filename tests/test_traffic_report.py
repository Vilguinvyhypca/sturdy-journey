import collections
from email import policy
from email.parser import BytesParser
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('traffic_report', Path(__file__).resolve().parents[1] / 'scripts/email-traffic-report.py')
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


class TrafficReportTests(unittest.TestCase):
    def test_page_urls_and_counts(self):
        pages = collections.Counter({'/': 22, '/videos/local%3Atest': 3})
        text, markup = report.page_sections(pages)
        self.assertIn('https://hymecymeyseh.fun/ [22]', text)
        self.assertIn('https://hymecymeyseh.fun/videos/local%3Atest [3]', text)
        self.assertIn('<th>URL</th><th>Times visited</th>', markup)
        self.assertIn('href="https://hymecymeyseh.fun/videos/local%3Atest"', markup)
        self.assertIn('<td>22</td>', markup)

    def test_untrusted_paths_are_escaped_and_never_external_links(self):
        for path in ['https://evil.test', '//evil.test', '/\\evil.test', '/bad\npath', 'javascript:alert(1)']:
            self.assertIsNone(report.page_url(path))
        _, markup = report.page_sections(collections.Counter({'/<script>"': 2}))
        self.assertNotIn('<script>', markup)
        self.assertIn('&lt;script&gt;&quot;', markup)
        self.assertIn('No recorded page views', report.page_sections(collections.Counter())[0])

    def test_sent_email_has_plain_and_html_versions(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory) / 'experience'
            data.mkdir()
            (data / '2026-10-21.jsonl').write_text(json.dumps({
                'at': '2026-10-21T12:00:00Z', 'name': 'page_view',
                'path': '/videos', 'sessionId': 'test',
            }) + '\n')
            args = ['report', '--data-dir', directory, '--date', '2026-10-21', '--send', '--to', 'tester@example.test']
            with patch('sys.argv', args), patch.object(report.subprocess, 'run') as send, patch('sys.stdout', new_callable=io.StringIO):
                report.main()
            message = BytesParser(policy=policy.default).parsebytes(send.call_args.kwargs['input'])
            self.assertEqual(message['To'], 'tester@example.test')
            self.assertIn('https://hymecymeyseh.fun/videos [1]', message.get_body(preferencelist=('plain',)).get_content())
            self.assertIn('<a href="https://hymecymeyseh.fun/videos">', message.get_body(preferencelist=('html',)).get_content())


if __name__ == '__main__':
    unittest.main()
