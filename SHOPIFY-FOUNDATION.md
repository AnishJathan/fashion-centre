# Shopify foundation — local development only

Branch: `feature/shopify-foundation`. No new GitHub push or deployment.

## Implemented

- Java Storefront catalogue mapping preserves decimal amount, currency, selected variant options, availability and product/variant Shopify GIDs. Identity keys include the source shop. Products and variant pages explicitly report truncation; this is a six-product/20-variant preview, not a full sync.
- Two immutable, server-owned public sample endpoints: `https://mock.shop/api` and `https://apparel.mock.shop/api`. A user selects an enum key, never a URL. Fixed read-only GraphQL query, no redirects, no credentials, bounded response size, connection/request timeouts. No user data goes to either endpoint. Images are loaded directly from Shopify CDN without referrer; no bulk image downloads or redistribution licence claims.
- Deterministic local fixture adapter by default. Public reads happen only when the preview source is explicitly selected. Shopper demo catalogue, cart and orders remain separate. Fixtures have CAD prices; public sources retain whatever currency they supply. No cross-currency total or conversion.
- `/#/merchant` shows disconnected state, source/shop selection, loading, error/retry and read-only variants. Connect is disabled. This is not an authenticated merchant dashboard.
- Pure cartCreate request builder validates same-shop variant keys, availability, quantities and duplicates. Checkout response parser rejects GraphQL/user errors and unexpected hosts. These contracts run against synthetic responses in tests only; no runtime cart mutation is sent, including to public Mock Shop.
- Pure HMAC SHA256 verifier checks raw bytes with constant-time comparison. No enabled webhook receiver or order processor. Signature verification alone does not establish customer/order ownership, replay protection, subscription correctness or durable processing.
- POST connect/cart/sync/webhooks routes return 501. No Admin token, OAuth callback, customer account session or live transport exists. Adding a real domain is intentionally insufficient to activate live access.

## API

`GET /api/integrations/shopify/status` reports connected=false.

`GET /api/integrations/shopify/catalogue/{mock|apparel}?source={fixture|public}` returns bounded catalogue snapshots. Unknown keys/sources return 400. Upstream errors return a sanitized 502; upstream messages/secrets are not reflected. Public GraphQL uses HTTP POST but only the hard-coded query, never a mutation. Public sample service version headers are not treated as real-version validation; the pure adapter validates provided version metadata for a future merchant transport.

## Before one authorized development-store end-to-end test

1. Select an owned/authorized Shopify development store and confirm its canonical `*.myshopify.com` host, merchant owner and Fashion Centre brand mapping. No production store/customer data. Approve use of the development store explicitly.
2. Choose app distribution for the business model before configuring it: custom distribution has merchant/organization restrictions; independent merchants normally need the appropriate public distribution route. Register the app and exact HTTPS callback URLs only after approval. An external standalone merchant app uses the authorization-code flow; own-organization client credentials are not a substitute for arbitrary merchant consent.
3. Implement authenticated merchant membership/authorization and server-owned connection records keyed by immutable shop identity and brand. Enforce unique binding and tenant isolation on every read/write. Complete OAuth callback HMAC validation, one-use expiring state tied to the initiating merchant/session, exact redirect URI, code exchange, token encryption, rotation/uninstall/revocation and least-privilege scopes. Never return Admin/private Storefront tokens to React or log them.
4. Grant only the required Storefront catalogue/cart permissions and publish synthetic products/variants to the intended storefront channel. Confirm actual API version headers, complete pagination, inventory context, currency/market, throttling and refresh policy against the real store. Admin order scopes and any protected customer data access require separate review; no phone/email lookup is required for this prototype.
5. Implement real server-side cart transport with approved exact hosts, no redirects, current price/availability revalidation and one-shop carts. Preserve Shopify checkoutUrl as opaque data after validated HTTPS host policy; authorize custom checkout domains explicitly rather than suffix guessing. Do not silently retry cart creation after ambiguous network outcomes. Use only Shopify test payment facilities with explicit approval; no real payment details.
6. Before order linkage, implement authenticated shopper identities and server-side cart ownership. Generate a high-entropy correlation record bound to shopper, shop and Shopify cart. Client-controlled attributes or phone/email equality alone must never claim an order. Verify authoritative Shopify order/cart linkage via the approved server API before attaching an order to a user. This exact linkage must be validated against the chosen integration and dev store before implementation is considered complete.
7. Configure HTTPS webhook subscriptions only with approval. Verify raw-byte HMAC before parsing; resolve an active authorized shop connection; validate expected topic/version. Use durable unique `(shop identity, X-Shopify-Webhook-Id)` delivery receipts and correlate related deliveries with `X-Shopify-Event-Id`, transactional inbox/queue and idempotent order transitions. Duplicate deliveries must be harmless; failed work remains retryable. Handle out-of-order updates with authoritative reconciliation. Do not mark an event complete before its state update commits. Process no customer data until ownership and access controls are in place.
8. Test install/revoke, two-shop isolation, currency/stock changes, cart errors, test checkout, signed webhook delivery, replay/duplicate/out-of-order events, ownership denial and order-status reconciliation. Synthetic signatures are not proof of actual Shopify subscriptions. Mock Shop cannot validate payments, real orders or Customer Account API.

## Current official references (reviewed 2026-10-18)

- [Mock Shop usage and limitations](https://shopify.dev/docs/storefronts/headless/mock-shop): credential-free fictional storefronts; mocked checkout takes no payment and creates no order; Customer Account API unsupported.
- [API versioning](https://shopify.dev/docs/api/usage/versioning): target pinned contract 2026-10; future real transport must check response version.
- [Standalone app authentication](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps) and [distribution](https://shopify.dev/docs/apps/launch/distribution): select merchant authorization/distribution before live implementation.
- [cartCreate](https://shopify.dev/docs/api/storefront/latest/mutations/cartCreate) and [webhook verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries).
- [Development stores](https://shopify.dev/docs/apps/build/stores/development-stores).

No credentials, account creation, approvals, real checkout, webhook subscription, production data, deployment or push were performed in this increment.
