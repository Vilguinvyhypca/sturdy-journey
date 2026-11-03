# Browser photo content validation — November 2, 2026

Branch `codex/v1-image-content-validation`, based on merged PR #21 / main
`c92ee71`. This checkpoint is development only. Production still runs the
October 30 release; neither PR #21 nor this follow-up is deployed by this work.

## Finding and behavior

Local browser uploads previously selected a photo extension from the declared
Content-Type without decoding ordinary photo bytes. Non-image content, corrupt
images or mismatched formats could therefore be saved as private photos. HEIC/HEIF
was converted, but its original container was not independently checked first.
This finding does not establish an anonymous upload or observed exploitation.

Before catalog insertion, supported photo uploads now pass an isolated image
validator. It checks detected format against the declared type, valid dimensions,
a 64,000,000-pixel cap and first-frame decoding for JPEG, PNG, GIF, WebP and AVIF.
AVIF requires HEIF/AV1; HEIC requires HEIF/HEVC. Generic HEIF permits those image
compressions. SVG or a different image format renamed/redeclared as an allowed
photo is rejected. The existing 500 MB streamed file-size limit is unchanged.

HEVC HEIF is inspected for its container/dimensions first, then follows the
existing bounded FFmpeg-to-JPEG conversion. The resulting JPEG must also decode
before saving. This preserves HEIC support where bundled libvips can inspect
HEVC metadata but lacks a HEVC decoder. AV1 HEIF is decoded and then converted by
the same existing HEIF path. Conversion/validation failure removes unaccepted
files; cancellation after validation also prevents insertion and cleans up.

Ordinary accepted photo bytes are not resized or rewritten. The validator's tiny
decode result is discarded. GIF/WebP originals retain their animation. HEIC/HEIF
keeps its pre-existing JPEG conversion policy; no video quality/encoding setting
or existing media is changed.

## Runtime bounds and failures

`scripts/validate-local-image.cjs` runs in a separate Node process. It uses Sharp
0.35.3, now an explicit required dependency at the same version already in the
lockfile. There is no codec-version upgrade. The worker disables its cache, uses
one libvips processing thread, keeps decoder safety settings, uses strict warning
handling, and requests only the first page/frame. Native processing gets a
15-second timeout; the parent enforces a 30-second worker lifetime with SIGKILL,
128 MiB V8 heap setting and bounded diagnostic output. Existing HEIF conversion
retains its own separate 60-second limit.

Invalid/mislabeled photos or excessive dimensions return 422. Oversized dimensions
have a clear 64-megapixel message. Missing, killed or unavailable validation returns
503 with Retry-After through the existing upload error handler. Handled responses
remain private/no-store. Cleanup failures remain explicitly reported by the
existing route. No record is inserted until all applicable checks pass.

These are guardrails, not an OS sandbox or a hard total native-memory cap. Pixel
checks depend on decoder metadata. Only the first animated frame is decoded; this
is not proof that every later frame is valid, a malware scan or a completed codec
security audit. See the [Sharp input policy](https://sharp.pixelplumbing.com/api-constructor/)
for decoder option behavior.

## Validation evidence

Generated fixtures cover JPEG/PNG/GIF/WebP/AVIF and two-frame GIF/WebP. Tests verify
accepted bytes are unchanged; corrupt bytes, SVG disguised as PNG, format mismatch,
truncated JPEG, HEIC/AVIF mismatch and excessive declared PNG dimensions are
rejected with cleanup before insertion. A generic AV1 HEIF fixture exercises real
FFmpeg conversion and final JPEG decoding. Mock-worker checks cover the exact
pixel boundary, HEIC conversion requirement, strict decoder options and failure
classification. Further route checks cover unavailable validation, failed
converted-JPEG validation, cancellation, cleanup and subsequent valid uploads.

All 143 Node regressions passed on the runtime changes. An additional four-test
image run passed after adding converted-JPEG/cancellation cleanup assertions.
Targeted ESLint, TypeScript, lockfile dry-run install and the production-mode build
in the development checkout's separate .next directory passed. No production
release was built or activated.

Live development API checks rejected corrupt PNG and PNG declared as JPEG (422),
accepted a generated PNG (201) with byte-for-byte delivery preservation, and
accepted a HEIC sample through the existing conversion (201/JPEG, 1280x854).
The HEIC check used the [libheif public example](https://github.com/strukturag/libheif/blob/master/examples/example.heic),
not a user's photo; the sample is not committed. Both private temporary records
and all generated stored files were deleted. The browser ended signed out.

## Remaining scope

This applies to browser and browser-folder uploads via /api/local-upload. The SSH
folder importer retains its separately documented behavior. Existing catalogs and
files are not rescanned. Traffic-event origin/body/rate-limit review, remaining
cache/page checks, iPhone/Safari and sound acceptance are still open.
