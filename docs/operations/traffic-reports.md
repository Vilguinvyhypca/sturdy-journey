# Traffic report email format

The report's “Most visited pages” section lists the top five recorded page paths,
ordered by page-view count, as full URLs under https://hymecymeyseh.fun.
HTML email readers show a clickable URL / Times visited table. The plain-text
alternative shows `https://hymecymeyseh.fun/videos [2]`. Counts include repeat
views; they are not unique visitor counts. Empty periods display an explicit
no-recorded-views message. Untrusted paths are escaped and cannot create links
to other domains.

The existing user systemd traffic-report service runs
`scripts/email-traffic-report.py` from this checkout. Its Monday/Wednesday 6 PM
Eastern schedule and recipients are unchanged. Formatting changes therefore apply
to the next scheduled report without an application deployment. No extra email
is sent by previewing or testing the script.

Preview a single day's report with:

```sh
python3 scripts/email-traffic-report.py --data-dir /path/to/data --date 2026-10-21
```

`--scheduled` previews the interval since the previous scheduled boundary.
Actual delivery requires `--send` and explicit recipients. Tests use temporary
analytics data and a mocked sendmail call:

```sh
python3 -m unittest discover -s tests -p test_traffic_report.py
```

This branch is stacked on origin-validation commit `f343368`; the report script
was previously present on the server but untracked. It is now included in version
control with its format tests. Application main and the production release are
unchanged by this report update.
