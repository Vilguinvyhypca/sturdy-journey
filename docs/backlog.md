# MediaSpace backlog

The ordered v1 requirements and acceptance criteria are maintained in
[v1-completion.md](v1-completion.md). This file retains individual feature tasks;
its order alone does not define the release finish line.

## Administration

- [ ] Make admin mode visually distinct from public browsing with CSS: add a clear Admin mode indicator, a distinct header treatment, and grouped management controls. Make it clear when an administrator is managing a profile versus previewing its public page, including when the administrator session remains active during public-page viewing.

## Uploads

- [x] Finish server-side video validation for browser uploads: FFprobe now requires a real video track and a positive readable duration of at most five minutes. Corrupt, audio-only/cover-art-only, and unknown-duration files are rejected with useful errors and cleanup before catalog insertion. A missing, inaccessible, or timed-out validator returns a temporary-unavailable response. Implemented in development; not deployed. See v1 milestone 1. Folder-import validation remains separate follow-up work.

- [x] Require a successful nonempty browser playback copy before accepting a video upload. Failed conversion returns a retryable error and cleans unaccepted files; cancellation is rechecked before catalog insertion. Optional thumbnail failures remain playable and are logged. Cleanup failures are reported explicitly. Implemented in development; not deployed. See v1 milestone 1 for tests and the separate maintenance-import behavior.

## Visitor experience and engagement — 2026-10-19

These are prioritized improvement experiments, not additional v1 release blockers.
The audience is small, so measure results before assuming an improvement works.

### Evidence and reporting limits

The emailed report for October 14 at 6 PM through October 19 at 6 PM Eastern
recorded 73 browser-tab sessions, 84 page views, 81 video starts, 21 completion
events, and a 2.49-second average recorded page load. Instagram-associated sources
accounted for 40 page views and Facebook for 9; the homepage received 43 views.

Sessions are not unique people. Report periods overlap and must not be summed or
compared as equal-duration periods. Autoplay/repeated starts and inconsistent feed
completion tracking prevent treating completions divided by starts as a reliable
completion rate. Page-load timing does not measure the wait for video playback.
These observations motivate the work below; they do not prove visitor abandonment
or the cause of a slow start.

### 1. Measure video startup and viewing consistently

- [ ] Measure time from opening/activating a video to its first rendered frame
  where supported, with a documented fallback. Distinguish initial loading,
  buffering, browser autoplay blocking, user pause, and playback failure. Compare
  typical and slower starts on iPhone and desktop rather than only the average.
- [ ] Record actual watch time and consistent completion events across gallery
  players, individual pages, and profile feeds. Define a playback attempt and how
  looping, replaying, seeking, and switching videos affect the counts. Keep
  watch time separate from elapsed tab-open time and identify autoplay starts.
- [ ] Show these measures in reports using clearly labeled, non-overlapping
  comparison periods. Preserve administrator exclusion and existing privacy and
  retention rules; account for missing or blocked tracking.

Acceptance: controlled playback, pause, seek, loop, blocked-autoplay, buffering,
and navigation checks produce the documented counts and timings. Reports do not
present the current event ratio as a verified completion rate. Coordinate with
the planned Site Analytics integration to avoid duplicate collection.

### 2. Link social posts to the matching video or profile

- [ ] Document a repeatable sharing workflow using existing public video/profile
  URLs with consistent source, medium, and campaign tags. Prefer the matching
  content over the homepage when a post promotes a specific video or creator.
- [ ] Verify tagged links open the correct content from Instagram/Facebook on
  iPhone and desktop, preserve visibility rules, and produce the expected source
  attribution. Audit existing sharing behavior before adding new UI.

Why: social links supplied 49 of the 84 recorded page views. A relevant landing
page can reduce the steps required to reach the content being promoted.
Acceptance: representative links reach the intended published content and report
their campaign correctly; private items are never made public by sharing.

### 3. Reduce measured video startup delays

- [ ] Use the startup measurements to identify slow files and distinguish
  server response, transfer/bitrate, and browser playback preparation delays.
- [ ] Trial smaller browser-ready playback copies for representative slow videos,
  preserving originals, permissions, thumbnails, and byte-range seeking. Evaluate
  bounded next-video preloading only if measurements justify the bandwidth cost.
  Adaptive streaming remains a separately scoped option, not an assumed solution.

Acceptance: record before/after startup timing and transferred bytes under the
same device/network conditions, review visual quality, and verify playback,
seeking, sound, and visibility. The loader must never artificially delay playback.

### 4. Provide a clear next video from the same profile

- [ ] Audit individual video pages for an existing continuation action, then add
  or improve a clear “Watch more from this profile” link into the correct profile
  feed, with a useful return path.

Acceptance: public visitors reach only the intended profile's published videos,
including when the administrator has an active session. Unknown/deleted profiles
have a useful fallback. Verify mobile layout, keyboard access, and navigation.
Measure continuation clicks without assuming that more starts mean more watching.

### 5. Let administrators lead with selected content

- [ ] Design optional per-profile featured video or curated ordering controls.
  Keep stable pagination and a predictable default order; do not infer the best
  content from raw autoplay counts.

Acceptance: administrators can select, change, and clear the feature/order;
public galleries and feeds follow the documented behavior. Private, unlisted,
deleted, or moved items cannot leak through a stale feature selection. Validate
the usefulness of the feature with engagement measurements before expanding it.
