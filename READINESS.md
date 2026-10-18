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
