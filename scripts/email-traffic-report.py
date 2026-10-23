#!/usr/bin/env python3
"""Summarize a complete Eastern calendar day; preview unless --send is supplied."""
import argparse
import collections
import datetime as dt
from email.message import EmailMessage
import json
import html
from urllib.parse import urlsplit
from pathlib import Path
import subprocess
from zoneinfo import ZoneInfo


def summarize(directory, day, timezone):
    events = []
    start = dt.datetime.combine(day, dt.time(), timezone).astimezone(dt.timezone.utc)
    end = dt.datetime.combine(day + dt.timedelta(days=1), dt.time(), timezone).astimezone(dt.timezone.utc)
    cursor = start.date()
    while cursor <= end.date():
        path = directory / f"{cursor.isoformat()}.jsonl"
        if path.exists():
            for line in path.read_text().splitlines():
                try:
                    event = json.loads(line)
                    at = dt.datetime.fromisoformat(event['at'].replace('Z', '+00:00'))
                    if start <= at < end:
                        events.append(event)
                except (ValueError, KeyError, TypeError):
                    continue
        cursor += dt.timedelta(days=1)
    views = [event for event in events if event['name'] == 'page_view']
    loads = [event['loadMs'] for event in events if event['name'] == 'page_load' and isinstance(event.get('loadMs'), (int, float))]
    return dict(sessions=len({event['sessionId'] for event in events}), views=len(views),
                actions=collections.Counter(event['name'] for event in events),
                pages=collections.Counter(event['path'] for event in views),
                sources=collections.Counter(event.get('source') or event.get('referrerHost') or 'Direct / unknown' for event in views),
                load=sum(loads) / len(loads) / 1000 if loads else None)


SITE_ORIGIN = "https://hymecymeyseh.fun"


def page_url(path):
    # Analytics paths are untrusted input; never turn them into external links.
    if not isinstance(path, str) or not path.startswith('/') or path.startswith('//') or "\\" in path or any(ord(c) < 33 for c in path):
        return None
    parsed = urlsplit(path)
    if parsed.scheme or parsed.netloc:
        return None
    return SITE_ORIGIN + path


def page_sections(pages):
    plain = []
    rows = []
    for path, count in pages.most_common(5):
        url = page_url(path)
        label = url or str(path)
        plain.append(f"  {label} [{count}]")
        safe_label = html.escape(label, quote=True)
        link = f'<a href="{safe_label}">{safe_label}</a>' if url else safe_label
        rows.append(f"<tr><td>{link}</td><td>{count}</td></tr>")
    if not plain:
        return "  No recorded page views.", "<p>No recorded page views.</p>"
    table = '<table cellpadding="8" border="1" cellspacing="0"><tr><th>URL</th><th>Times visited</th></tr>' + ''.join(rows) + '</table>'
    return '\n'.join(plain), table


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, required=True)
    parser.add_argument('--to', action='append', default=[])
    parser.add_argument('--sender', default='vilguinvyhypca@hymecymeyseh.fun')
    parser.add_argument('--timezone', default='America/New_York')
    parser.add_argument('--date', type=dt.date.fromisoformat)
    parser.add_argument('--send', action='store_true')
    parser.add_argument('--scheduled', action='store_true', help='Cover the interval since the previous Monday/Wednesday at 6 PM')
    args = parser.parse_args()
    timezone = ZoneInfo(args.timezone)
    day = args.date or (dt.datetime.now(timezone).date() - dt.timedelta(days=1))
    directory = args.data_dir / 'experience'
    if not directory.is_dir():
        parser.error(f'Analytics directory is missing: {directory}')
    today = summarize(directory, day, timezone)
    previous = summarize(directory, day - dt.timedelta(days=1), timezone)
    period = str(day)
    if args.scheduled:
        end = dt.datetime.now(timezone)
        day = end.date()
        start = dt.datetime.combine(end.date(), dt.time(18), timezone)
        if start.weekday() in (0, 2) or start >= end:
            start -= dt.timedelta(days=1)
        while start.weekday() not in (0, 2):
            start -= dt.timedelta(days=1)
        # Read both UTC files at each local-day boundary and retain exact timestamps.
        events = []
        cursor = start.astimezone(dt.timezone.utc).date()
        while cursor <= end.astimezone(dt.timezone.utc).date():
            path = directory / f'{cursor.isoformat()}.jsonl'
            if path.exists():
                for line in path.read_text().splitlines():
                    try:
                        event = json.loads(line)
                        at = dt.datetime.fromisoformat(event['at'].replace('Z', '+00:00'))
                        if start <= at < end:
                            events.append(event)
                    except (ValueError, KeyError, TypeError):
                        continue
            cursor += dt.timedelta(days=1)
        views = [e for e in events if e['name'] == 'page_view']
        loads = [e['loadMs'] for e in events if e['name'] == 'page_load' and isinstance(e.get('loadMs'), (int, float))]
        today = dict(sessions=len({e['sessionId'] for e in events}), views=len(views),
                     actions=collections.Counter(e['name'] for e in events),
                     pages=collections.Counter(e['path'] for e in views),
                     sources=collections.Counter(e.get('source') or e.get('referrerHost') or 'Direct / unknown' for e in views),
                     load=sum(loads)/len(loads)/1000 if loads else None)
        period = f'{start:%b %d, %I:%M %p} to {end:%b %d, %I:%M %p %Z}'
    actions = today['actions']
    lines = [f'MediaSpace traffic for {period} ({args.timezone})', '',
             f"Tracked sessions: {today['sessions']}" + ('' if args.scheduled else f" (previous day: {previous['sessions']})"),
             f"Page views: {today['views']}" + ('' if args.scheduled else f" (previous day: {previous['views']})"),
             f"Video starts: {actions['video_start']}",
             f"Video completions: {actions['video_complete']}",
             f"Browser/video errors: {actions['client_error'] + actions['video_error']}",
             f"Average recorded page load: {today['load']:.2f} seconds" if today['load'] is not None else 'Average recorded page load: unavailable',
             '', 'Most visited pages:']
    page_text, page_table = page_sections(today['pages'])
    lines.append(page_text)
    lines.extend(['', 'Sources (page views):'])
    lines.extend(f'  {source}: {count}' for source, count in today['sources'].most_common(10))
    lines.extend(['', 'Sessions identify browser tabs, not unique people. Tracking blockers may hide visits.',
                  'Administrator sessions are excluded. Zero recorded errors does not prove there were no errors.'])
    body = '\n'.join(lines) + '\n'
    if not args.send:
        print(body, end='')
        return
    if not args.to or any(c in ''.join(args.to) + args.sender for c in '\r\n'):
        parser.error('A valid recipient and sender are required for delivery')
    message = EmailMessage()
    message['From'] = args.sender
    message['To'] = ', '.join(args.to)
    message['Subject'] = f'MediaSpace traffic report — {day}'
    message.set_content(body)
    before, after = body.split(page_text, 1)
    message.add_alternative('<!doctype html><html><body><pre>' + html.escape(before) + '</pre>'
                            + page_table + '<pre>' + html.escape(after) + '</pre></body></html>', subtype='html')
    subprocess.run(['/usr/sbin/sendmail', '-i', '-f', args.sender, '--', *args.to], input=message.as_bytes(), check=True)
    print(f'Report for {day} submitted to the email relay.')


if __name__ == '__main__':
    main()
