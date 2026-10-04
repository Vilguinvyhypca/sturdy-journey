# Visitor experience reporting

MediaSpace records first-party, session-level usage events so the administrator can see how visitors arrive and which parts of the site they use. Reports are available at `/admin/experience` after administrator sign-in.

The tracker records page visits and page duration, the first page's load time, referrer host or campaign tags, searches by query length and result count, selected filters, media opens, video starts/completions/errors, external-link clicks, shares, and browser or gallery errors. The report groups actions into common visit sequences and shows where a profile visit had no media open or a video open had no play/completion event. These are session-level patterns; they show where activity stopped, not the visitor's reason. Search text, IP addresses, full referrer URLs, form contents, and session replays are not recorded. Administrator sessions and `/admin` pages are excluded.

Each browser tab receives a random pseudonymous ID kept only in `sessionStorage`. It groups that tab's events into a visit and is discarded when the tab session ends. Events are stored as daily JSON Lines files in `MEDIA_DATA_DIR/experience/` (or `data/experience/` when no data directory is configured), with restrictive file permissions. Files older than 90 days are removed during event writes. The report summarizes the latest 30 days.

## Attribute incoming links

The admin report includes a tracked-link builder. Create a separate link for each place or campaign where you share a profile, photo, or video page. For example:

```text
https://hymecymeyseh.fun/p/sabaideesana?utm_source=instagram&utm_medium=social&utm_campaign=profile-launch
```

When a visitor follows it, MediaSpace records the source and campaign on the landing page. If a link has no campaign tags, the browser's referrer hostname is used when available; some apps and privacy settings omit it.

The report shows counts and patterns, not the visitor's reason for leaving. A page exit without a playback event indicates where activity stopped, but cannot explain why.
