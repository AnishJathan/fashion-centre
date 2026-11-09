# Readiness: local demo, not a production pilot

This pass follows the supplied Fashion Centre Platform Team Brief (16 October 2026), preserving the approved white/violet direction. Source catalogue content must be explicitly onboarded. No invented inventory, orders, merchant connections or generated results are used.

## Implemented locally

| Area | Current behavior |
| --- | --- |
| Discovery and brand spaces | Source-scoped products, fetched photography, plain-text descriptions, category/store/search filters, currency-grouped price sorting, and newest sorting when source dates exist. Clear brand switching and isolated filters. Source brand styling is not invented when no approved brand configuration is supplied. |
| Variants and commerce | Stable variant IDs, availability checks, minor-unit-aware prices, separate currencies, one-store demo checkout, idempotent order creation and immutable historical snapshots. No real purchase is sent. |
| Saves and follows | Persisted in this browser; unavailable references remain visible and can be explicitly removed. |
| Data safety | Web Locks serialize local writes, stale tabs cannot replace newer records, malformed records are isolated and original raw data is copied before repaired writes. Export for manual recovery is available in Profile. There is no automated import/restore or cloud backup. |
| Photos | Local JPEG/PNG/still-WebP checks, encoded dimension checks before decoding plus decoded limits, ephemeral previews and consent preview. Full-screen vertically scrollable catalogue photography has keyboard/Close controls and is explicitly not generated try-on. |
| Profile and login | Local preferences and WhatsApp OTP simulation only; no message, identity or authenticated account is created. |
| Merchant | Discoverable owner dashboard, strict domain checks, honest readiness and a tested OAuth/encryption protocol boundary. Runtime connection stays disabled. |
| Resilience | Recoverable invalid routes, failed catalogue/image states, loading/empty messages, keyboard focus, selected-state semantics and narrow-screen layouts. |
| Java | Fixed upstream destinations, bounded response bytes and full-body deadline, validated product/variant identity including consistent combined listings, bounded money, expanded OAuth/CSRF/state tests, bounded disabled-provider metadata. |

## External prerequisites before a real pilot

1. **Choose authentication and infrastructure**: hosting, real owner/shopper identity, database, private object storage, secret manager and job queue. Browser-local records are not multi-user persistence. Code wiring, access-control tests, migrations, monitoring and recovery drills remain required after those choices.
2. **Authorize Shopify setup**: an owned developer organization/app, public distribution for independent merchants, exact HTTPS app/callback URLs and minimum scopes. Enter secrets through secure server configuration. Approve one owned development-store install separately; public distribution requires Shopify review. Complete publication selection, pagination/sync, uninstall/compliance webhooks and reconciliation before listing real stores.
3. **Decide purchase model**: the brief recommends the brand's own Shopify checkout. This app's shared cart/order flow is an explicitly local demo. Real product/variant destinations and availability revalidation must be implemented against an authorized store before purchases.
4. **Authorize a bounded try-on evaluation**: confirm Pruna service/model terms, processing regions, retention/deletion, catalogue image rights, consenting test photos and a spending cap. Only then implement authenticated private uploads, jobs, per-user result access, retries/cost controls and deletion. Current photo preparation does not authorize future uploads.
5. **Set operating policy**: initial brands, allowance/billing owner, privacy wording, support owner and performance goals. Approved brand logos/colours and collections must come from merchants rather than guessed metadata.

No account access, credentials, merchant installation, paid generation, real personal-photo upload, deployment or further Git push was performed by this pass. Previously pushed commit remains 53ffdbc until a new push is authorized.

## Verification boundaries

Automated tests use synthetic records/photos and isolated Chrome sessions. The public-catalogue smoke check is separate and read-only. The user's browser session was not modified. Real phone gestures, Safari/Firefox, assistive-technology testing and a production security assessment remain unverified. Encoded image checks reduce obvious allocation risks; they are not a guarantee against every malformed native-decoder input.

## Second adversarial pass: code versus external setup

Independently implementable safeguards completed without credentials: failed-read/parse recovery, store-dependent checkout under a shared transaction lock, current-source order snapshots, OAuth ownership recheck after exchange, sanitized ownership/repository failures, scope-bound encryption, bounded identifiers/CSRF, APNG rejection, deferred-photo race regressions, bounded viewer image loading, resize/focus regressions, and a pinned read-only CI workflow with bundle budgets. The workflow remains local and has not run on GitHub.

| Remaining area | Code still missing (credentials alone do not complete it) | External decision or authorization |
| --- | --- | --- |
| Durable tenancy and connections | JDBC repository and explicit V1 schema now implement atomic membership checks, exclusive shop binding, encrypted reads and local membership revocation. Real file-backed restart/halt/concurrency/rollback tests are implemented. Still missing: runtime datasource wiring, administrative membership provisioning, deployment migration runner, token decryption/key-version/rotation/remote-revocation lifecycle and production backup/recovery. | Choose production database/hosting and secure key management. H2 is verified in tests only; another database needs dialect adaptation and actual-driver integration tests. |
| Authentication | Validated provider session adapter, session expiry/logout/rotation, membership administration and endpoint authorization integration. Protocol tests inject trusted identities; user headers do not establish authentication. | Choose identity provider and approve account/configuration work. |
| Merchant catalogue lifecycle | Publication selection, pagination/sync reconciliation, uninstall/privacy webhook handling and durable lifecycle state. Existing fixed public demo reads are not merchant synchronization. | Owned development store/app, scopes, callback URLs, merchant permission, public distribution review. |
| Purchase | Brand checkout destination integration and current-variant availability/price revalidation at handoff. Browser-local demo orders remain noncommercial records. | Confirm the purchase model and authorize store integration. |
| Private try-on | JDBC jobs and V2 schema implement transactional session/reference authority, owner-scoped idempotency, fenced leases, cancellation, conservative retry bounds, retention tombstones and deletion queue metadata. Worker/provider/storage coordination is tested with synthetic adapters. Still missing: verified runtime authentication, production datasource, actual private storage and result materialization, authenticated upload/result/delete endpoints, recoverable provider transport, scheduler, practical provider polling policy and cost controls. No generation is performed. | Storage/queue choice, provider/model terms, rights/consent, region/retention policy, secure credentials and spending cap. |
| Release operations | Actual CI execution, deployment configuration, monitoring, load testing, recovery drills and real-device/assistive-technology checks. Local tests do not prove these. | Authorized push/deployment and operating owners. |

The concrete JDBC and private-worker foundations are documented in [PERSISTENCE.md](PERSISTENCE.md). File-backed H2 integration tests use only temporary synthetic data and test keys. No runtime datasource, test login, worker scheduler or provider/storage adapter is wired into the app. The try-on status endpoint reports no configured adapters. Multipart parsing is disabled, and requesting generation activation through `fashion-centre.try-on.enabled=true` fails startup. Authentication, private storage and provider adapters still need implementation; their credentials alone will not complete them.
