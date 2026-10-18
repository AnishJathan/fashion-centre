# Local photo preparation

This increment is local only and has not been pushed. Open a fetched product and choose **Prepare a try-on photo**, or use Try on and select an onboarded garment.

## What is implemented
- Personal JPEG/PNG/WebP selection and transient object-URL preview. MIME must match file signature; browser decoding must succeed. Local application limits: non-empty, at most 10 MiB, at most 12,000 pixels per edge and 40 megapixels. The short-edge 768-pixel warning is guidance only, not a provider minimum or a quality score.
- Readable pixel dimensions, original catalogue garment reference and its loaded dimensions. The current catalogue adapter supplies one featured image; no HD URL rewriting, upscale or invented detail is used. No alternate image chooser is shown because no additional references are supplied by this adapter.
- Framing, lighting, clean-background and unobstructed-garment guidance; explicit distinction between technical checks and unavailable person/pose/body/garment analysis. No measurements or physical size/fit guarantee.
- Replace/remove/cancel and route-unmount cleanup. All object URLs are revoked; pending asynchronous validation is invalidated so a late decode cannot restore a canceled photo. Consent state resets with the photo or garment.
- Explicit rights and future-transfer understanding checkboxes followed by local review. This is a consent UI preview, NOT current or standing authorization to upload. Generation remains disabled regardless of these choices.

## Privacy boundary
Personal file bytes are read only by the browser for signature/decode checks. The app does not log filenames/payloads, persist photos in browser storage, send them to Java/Pruna/other services, or create jobs. File controls and object URLs release references on replace/remove/cancel/unmount. Reload starts without a photo. Memory release is best-effort browser resource management, not a claim of secure RAM erasure. Catalogue images still load normally from their existing source; those are not personal-photo uploads.

The existing disabled Java provider is unchanged. Only actual verified completed results may populate a future still-photo feed; local preview is never represented as generated output.

## Official requirements checked on 2026-10-18
The [Pruna P-Image-Try-On guide](https://docs.api.pruna.ai/guides/models/p-image-try-on) requires a person image URL and an array of garment reference URLs, recommends up to six garment references and supports up to eleven. It describes optional guidance for non-flatlay garments and preservation of input resolution. The guide does not specify a minimum HD resolution. Its output formats do not establish input-format guarantees; the browser preview's accepted formats and size limits are our local policy.

## Before controlled real evaluation
Approve provider/costs and permitted non-sensitive test photos; verify person/garment image rights and explicit per-upload consent. Resolve retention, no-training, deletion, processing regions and subprocessors. Implement authenticated photo/job ownership, secure short-lived storage, server-side validation/metadata handling and private result delivery. Verify provider input-format/size restrictions with the selected service and evaluate actual output quality using permitted samples. Keep upload authorization separate from this local checklist. See PRUNA-BOUNDARY.md for transport/job requirements. No real evaluation has occurred.
