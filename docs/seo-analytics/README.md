# SEO and visitor analytics plan

Status: Fullstory selected; initial browser integration is in development and disabled by default. SEO implementation remains planned.

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

- [x] Choose Fullstory as the hosted analytics and replay service. Use explicit visitor opt-in for the initial integration. Confirm account retention before enabling collection.
- [ ] Track initial visits and client-side route changes without duplicate page-view events.
- [ ] Track public photo/video opens, album/profile navigation, sharing, and relevant gallery controls with explicit event names.
- [ ] Track scroll milestones for regular pages and the video feed's scrolling container; define how dynamically loaded content affects those milestones.
- [ ] Exclude admin activity and protected content from public engagement tracking. Avoid collecting credentials, form contents, sensitive query parameters, or media access tokens.
- [ ] Document configuration, event definitions, dashboard access, and how to disable collection.

Session recordings and heatmaps are optional and require a separate decision about the service, masking, consent, and retention. Browser analytics cannot guarantee capture of every visitor: blockers, disabled JavaScript, and consent choices can prevent events. Crawler requests require a separate server or gateway log review; they are not human click or scroll events.

## Decisions still needed

- Public production domain and preferred public-facing brand/name.
- Fullstory public organization ID and account configuration; use the free plan where its limits meet actual traffic.
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

## Fullstory configuration

The official `@fullstory/browser` SDK is loaded only after an anonymous visitor opts in on an eligible public gallery page. Fullstory hosts the dashboard and recording storage; no additional analytics database or Node.js service is required here.

Configure these **before building** the release (Next.js embeds public variables in the browser bundle):

```dotenv
NEXT_PUBLIC_FULLSTORY_ENABLED=false
NEXT_PUBLIC_FULLSTORY_ORG_ID=
```

Copy the public organization ID from the Fullstory project's setup instructions (`orgId` or `_fs_org`). This is not an API key. Set enabled to `true` only after configuring the correct project and reviewing recording/privacy settings. An empty ID or any enabled value other than `true` leaves the integration off. Keep development and production projects/configuration separate.

The initial capture scope is `/`, `/photos`, `/videos`, `/feed`, `/albums`, and `/p/<slug>` for anonymous visitors. Individual photo/video/album pages, admin/upload/auth routes, and unknown routes are excluded. Detail pages need a server-verified public-visibility boundary before replay can be expanded to them. URLs with fragments or query parameters other than `type=photo` or `type=video` are not eligible; this includes legacy `?media=` sharing links.

Visitors can allow or decline recording and later turn it off using the on-page analytics control. The preference is stored under `mediaspace:analytics-consent:v1` in browser local storage. If storage is unavailable, capture stays off. Signed-in users are excluded; once a document has held a signed-in session, recording will not start in that document after sign-out. Reloading while anonymous establishes a fresh eligibility decision.

Text is masked using `fs-mask`; excluded page content and the consent interface use `fs-exclude`. Console capture is disabled. No names, emails, or custom identity calls are sent by this integration. Before production activation, configure Fullstory's privacy rules to exclude sensitive URL components (including media access tokens), retain form masking, and leave request/response body and header capture disabled. DOM masking does not replace URL/network privacy rules. Restrict capture to the production domain in Fullstory settings.

Fullstory's automatic capture supplies the initial click/scroll/replay data. Named media events, custom scroll milestones, and verified dashboard reports remain follow-up work; they are not implemented by this initial SDK integration. Browser and dashboard verification must include gallery overlays and the feed's internal scroll container. No live dashboard delivery can be confirmed until a project ID is supplied.

To disable collection for a future release, set `NEXT_PUBLIC_FULLSTORY_ENABLED=false` and rebuild/deploy. To stop already loaded clients centrally, disable domain capture in Fullstory as well. Turning off recording does not delete previously collected sessions; manage those and retention in Fullstory.

References: [Browser SDK](https://github.com/fullstorydev/fullstory-browser-sdk), [capture controls](https://developer.fullstory.com/browser/fullcapture/capture-data/), [privacy settings](https://help.fullstory.com/hc/en-us/articles/34807885576215-Privacy-Settings-in-Fullstory).

### Initial verification (September 29, 2026)

- Route-policy tests pass for eligible gallery routes, excluded admin/detail routes, and sensitive query/fragment cases.
- ESLint passes with existing unrelated warnings; changed integration files pass without warnings.
- Next.js route type generation, TypeScript checking, and the production build pass. An explicit `.js` extension on the existing `next/constants` configuration import was needed with the compiler fallback on this Ubuntu development account.
- Headless-browser verification was attempted with Fullstory requests blocked, but navigation timed out while the development page compiled. Consent UI, navigation lifecycle, and actual replay delivery still require browser verification before activation.
- No real organization ID has been configured and no production deployment has been performed.
