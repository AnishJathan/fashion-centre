# Try-on provider boundary

Implemented on 18 October 2026. Production is disabled: no HTTP transport, API key configuration, uploads, generation calls or generated feed results exist. `GET /api/try-on/status` reports disabled and an empty result list; `POST /api/try-on/jobs` returns 501 without binding a request body. Existing catalogue photography must never be presented as a user's generated try-on.

`TryOnProvider` separates provider-independent requests/jobs from `PrunaTryOnProvider`. The public adapter constructor always rejects submission/polling. Its package-private constructor accepts an injected fake transport for tests only; no Spring provider bean or enablement setting exists. Test fixtures contain invented `.invalid` image references and a synthetic delivery URL; neither is fetched.

## Contract verified

The [official P-Image-Try-On guide](https://docs.api.pruna.ai/guides/models/p-image-try-on) specifies a person image URL plus garment image URLs. The implementation limits garments to six as an application policy, requests JPEG output, and uses the dedicated model, not generic P-Image/Edit.

The [API reference](https://docs.api.pruna.ai/apis) and its [OpenAPI download](https://docs.api.pruna.ai/openapi.yaml) define asynchronous creation at `POST /v1/predictions`, a `Model: p-image-try-on` header, an `apikey` authentication header and JSON `input.person_image` / `input.garment_images`. Polling uses `GET /v1/predictions/status/{id}`. States map from starting, processing, succeeded, failed and canceled; successful delivery uses `generation_url`. The adapter constructs the status path from a validated ID and ignores response `get_url`.

There is no credential value or credential loader. A future transport must inject a server-held key and enforce its supplied ten-second timeout; this boundary also detects elapsed deadlines after a response. It never automatically retries creation, to avoid duplicate billing. Polling is caller-driven, at least two seconds apart, at most 30 attempts and two minutes per job, with sanitized errors. In-memory capacity is 128 jobs and intentionally rejects further work rather than silently evicting records. This is a contract scaffold, not a production job queue.

Images require an exact configured HTTPS host and reject credentials, ports, query strings, fragments and path traversal. Query-bearing signed references are deliberately unsupported until an approved storage design exists. Successful result URLs require Pruna's exact delivery host/path and a still-image extension. No URLs or image payloads are logged; response/request debug strings redact them. Transport errors and provider messages are not echoed to users. No result is downloaded or exposed through the runtime endpoint.

## Required before live use

- Explicit provider and paid-call approval, agreed cost limits, server-side secret management and a real bounded HTTP transport with redirect blocking, response-size limits, retries restricted to safe reads and network policy.
- Confirm current contractual privacy terms, no-training commitments, retention of inputs/outputs/logs/backups, deletion guarantees, subprocessors, processing regions and applicable data agreement. Documentation about temporary upload expiry is not evidence of comprehensive deletion or no training.
- User consent for processing the person's photo, rights to garment imagery, revocation/deletion controls, appropriate access restrictions and an approved secure storage lifecycle. Do not infer consent from browsing or a simulated login.
- Authenticated ownership of opaque image references and jobs; explicit merchant/variant binding; approved upload size, MIME/content checks and input validation. The current URL host restriction alone does not establish image ownership or consent.
- Durable job persistence, admission/rate limits, expiry cleanup, cancellation semantics, timeout reconciliation and recovery after uncertain submission. A local timeout does not prove provider cancellation.
- Private backend retrieval/verification of output bytes and safe owned storage delivery. Never put API keys or provider delivery links into browser state, logs or a public feed. Only verified actual completed results may populate the user's still-photo feed.
- Authorized end-to-end tests with non-sensitive permitted test images and the selected account, including provider failure, billing, deletion and ownership isolation. Mock tests do not establish quality, privacy compliance, actual billing or live compatibility.

## Validation

Run from `backend`: `mvn -Dmaven.repo.local=.m2 -o -B -Dtest=TryOnTest test`.
Tests use an injected fake transport and controlled clock, covering exact request mapping, fixed polling path, successful still-image completion, disabled/empty HTTP endpoints, invalid inputs/results, poll limits and expiry, throttling, auth/rate-limit/upstream failures, malformed IDs and response deadline detection. No test contacts Pruna or uploads any files. Integrated suite results are recorded in the repository validation report.
