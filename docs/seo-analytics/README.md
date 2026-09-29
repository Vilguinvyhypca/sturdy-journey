# SEO and visitor analytics plan

Status: planned; implementation has not started.

Working branch: `feat/seo-visitor-analytics`. PR target: `main`.

## Objective

Improve discovery of public MediaSpace pages in search engines and measure how visitors use the gallery: visits, media opens, meaningful clicks, and scrolling. Search visibility is an outcome to measure, not a guaranteed ranking or certification.

## Findings from the source review

- Individual photo and video pages already have metadata, canonical links, and indexing restrictions for non-public media.
- The sitemap lists database-backed Mux videos only and returns no URLs when the database is disabled.
- The homepage metadata is generic; album pages lack dedicated metadata.
- Video structured data and social preview thumbnails currently target Mux media rather than local videos.
- No site-wide visitor analytics integration was found.
- Gallery media opens in overlays, and the video feed uses its own scrolling container. Page-view tracking alone will miss these interactions.

These are source-code findings. Production configuration, rendered output, and actual search indexing still need verification.

## Planned SEO work

- [ ] Confirm the public domain and preferred site name; use consistent canonical URLs and metadata.
- [ ] Expand sitemap coverage to eligible public pages, profiles, photos, videos, and albums supported by each storage mode. Exclude private and unlisted media.
- [ ] Improve homepage, listing, and album titles and descriptions; add canonical links where appropriate.
- [ ] Review server-rendered content, media links, and pagination so public content can be discovered beyond the initial gallery batch.
- [ ] Add appropriate structured data and stable previews for eligible local media, using actual available metadata rather than invented dates or attributes.
- [ ] Verify admin and non-public indexing restrictions while preserving authorization and media visibility rules.
- [ ] Check image delivery, mobile layout, and loading performance; address issues supported by measurements.

## Planned visitor analytics work

- [ ] Choose the analytics service or self-hosted approach, dashboard location, retention period, and consent behavior before enabling collection.
- [ ] Track initial visits and client-side route changes without duplicate page-view events.
- [ ] Track public photo/video opens, album/profile navigation, sharing, and relevant gallery controls with explicit event names.
- [ ] Track scroll milestones for regular pages and the video feed's scrolling container; define how dynamically loaded content affects those milestones.
- [ ] Exclude admin activity and protected content from public engagement tracking. Avoid collecting credentials, form contents, sensitive query parameters, or media access tokens.
- [ ] Document configuration, event definitions, dashboard access, and how to disable collection.

Session recordings and heatmaps are optional and require a separate decision about the service, masking, consent, and retention. Browser analytics cannot guarantee capture of every visitor: blockers, disabled JavaScript, and consent choices can prevent events. Crawler requests require a separate server or gateway log review; they are not human click or scroll events.

## Decisions still needed

- Public production domain and preferred public-facing brand/name.
- Analytics hosting/provider preference and any budget constraint.
- Aggregate event reporting versus individual session replay.
- Desired retention and applicable audience/consent requirements.
- Whether crawler reporting should be included in the first release.

## Verification and delivery

- [ ] Read the installed Next.js documentation required by `AGENTS.md` before implementation.
- [ ] Add focused checks for sitemap visibility, metadata, and analytics behavior where meaningful.
- [ ] Run lint, TypeScript checks, applicable regression tests, and a development build.
- [ ] Verify rendered pages and tracking in a browser, including route changes, overlays, scrolling, and disabled tracking.
- [ ] Keep production credentials, catalogs, uploads, and existing releases separate from development as required by `AGENTS.md` and `docs/deployments.md`.
- [ ] Update this document as implementation progresses, recording configuration and any deferred work.
- [ ] Include this document and its root README link in the implementation PR targeting `main`.
- [ ] After merge, verify both files exist in `main`. Retain this document as implementation history and operational guidance rather than deleting it when the checklist is complete.

Committing this document on the feature branch makes it part of the PR's file changes; merging the PR into `main` carries the file and README link into `main`, including with a squash merge. A merge alone does not deploy production. Production rollout follows the repository's isolated release workflow.
