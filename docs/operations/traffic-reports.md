# Traffic report email format

The report's “Most visited pages” section lists the top five recorded page paths,
ordered by page-view count, as full URLs under https://hymecymeyseh.fun.
HTML email readers show a clickable URL / Times visited table. The plain-text
alternative shows `https://hymecymeyseh.fun/videos [2]`. Counts include repeat
views; they are not unique visitor counts. Empty periods display an explicit
no-recorded-views message. Untrusted paths are escaped and cannot create links
to other domains.

The installed user systemd timer runs `scripts/email-traffic-report.py` from this
checkout on Mondays and Wednesdays at 6 PM Eastern. It sends through
`/usr/sbin/sendmail` to the Proton, AOL, and server mailboxes. Its exact current
configuration, last successful runs, and delivery-status limits are recorded in
[the November 8 production check](current-production-state-2026-11-08.md).
Formatting changes therefore apply to the next scheduled report without an
application deployment. No extra email is sent by previewing or testing the script.

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

The service log reports when the script submits a message to the local relay; it
does not certify recipient inbox delivery. Use SMTP2GO's message activity for
recipient-level status. `postqueue -p` only checks the local mail queue. Never use
`--send` as a test; previewing requires no message relay.
