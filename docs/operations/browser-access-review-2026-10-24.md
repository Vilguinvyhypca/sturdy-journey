# Development browser access review — October 24, 2026

Tested source: `e6667df`, branch `codex/v1-browser-access-review`.
Target: http://100.75.180.84:3001, health response release `development`.
Environment: fresh agent-browser desktop Chromium session. Chrome required the
host-compatible `--no-sandbox` option. This is not an iPhone/Safari result.

## Observed results

The initial signed-out gallery returned an empty NextAuth session, displayed 12
successfully loaded images, and had no file-upload input or management controls
in its accessibility snapshot.

Using the development-only administrator credential through NextAuth CSRF and
credentials endpoints in the browser session, uploaded a generated one-second
160x120 blue H.264 MP4. Upload returned 201 with private visibility. Only this
disposable item was edited and deleted; existing development and production
media were not changed. Fixture ID:
`local:e8114212-7ffb-4818-b5c8-a811a312b484` (now deleted).

| Fixture state / browser session | Original / playback range GET | Thumbnail GET | Individual page | In session's media list |
| --- | --- | --- | --- | --- |
| Private, administrator | 206 / 206, 32 bytes each | 200 | 200 | Yes, administrator list |
| Private, signed out | 404 / 404 | 404 | 404 | No |
| Unlisted, signed out | 206 / 206, 32 bytes each | 200 | 200 | No |
| Public, signed out | 206 / 206, 32 bytes each | 200 | 200 | Yes |
| Deleted, signed out | 404 / 404 | 404 | 404 | No |

Original, playback, and thumbnail HEAD requests returned 200 with zero bytes
when accessible and 404 with zero bytes when denied/deleted. These exercised the
running Next server's explicit/automatic HEAD behavior. Every media byte response
and media-list response inspected carried `Cache-Control: private, no-store`.

On the public individual-video page, the actual video element played muted in
the signed-out browser: readyState 4, duration 1 second, currentTime advanced by
more than 0.1 second, and media error was null. This verifies basic decoding and
playback, not slow-network startup or broader autoplay reliability.

Visibility changes returned 200. Deletion returned 200/deleted true. After
sign-out, all fixture URLs and its individual page returned 404 and it was absent
from the visitor's list. The review browser ended signed out.

## Limits and remaining acceptance

This was a real browser → API → development catalog/storage → response check,
using browser fetch for authentication and mutations. It was not a click-through
test of the login/upload/edit/delete forms. It did not exercise a signed-in member
account, photo upload/detail workflows, profile creation/editing, sound, feed
swiping, poor connections, or iPhone Safari. Public profile isolation and the
member authorization matrix retain their separate automated evidence.

No full release build, merge, production deployment, or production outage was
performed. The security checklist remains open for the remaining audit and
acceptance work. This evidence-only commit needs diff review; it changes no
runtime code and does not require repeating the unchanged Node suite.
