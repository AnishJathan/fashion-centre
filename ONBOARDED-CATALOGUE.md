# Onboarded catalogue migration
## Current behavior
No runtime brand/product arrays, supplied sample orders, fabricated counts, default profile identity, unrelated campaign/editorial photography or simulated try-on photo feed remain in displayed content. Shop-by-vibe and New-arrival claims were removed because the fetched data does not substantiate them. Category circles, product cards, store cards and featured catalogue imagery use fetched products. Missing imagery has an honest text state, never an unrelated photo fallback.

A fresh browser has no onboarded stores and no orders. The server allowlists two documented public sources as onboarding choices. Onboarding is a browser-local registration, NOT OAuth, a real merchant connection or tenant authentication. Canonical source IDs (`mock`, `apparel`) scope every product/variant ID and cart group. Names/category fields come from Storefront `shop.name` and `productType`, without category inference.

Java accepts only the fixed public catalogue query to exact configured endpoints. Static `/api/brands` and `/api/products` routes return 410. Runtime fixture-source requests return 400. The JSON fixture was moved from main resources to test resources. Mock Shop requests are read-only GraphQL queries even though its protocol uses POST. No public mutation is sent.

## Preservation and disabling
`fc.stores.v1` stores explicit local onboarding state and timestamp. Disable changes only enabled=false; re-enable refetches. No delete-all/remove-store action exists. Cart records survive and become unavailable. Source data is not silently cached as live stock. Prices must be present in the current loaded catalogue for checkout.

`fc.commerce.v1` is read only for migration and never overwritten. V2 preserves compatible cart entries without demanding their IDs exist in the new catalogue. Existing user DEMO records retain snapshots and are marked historical; previous AUD is made explicit for the known old schema. Seeded SAMPLE records are archived rather than shown as user orders. Cart quantities, preferences, saved/followed IDs and user orders survive reloads and store disabling. Removing an individual cart line remains an explicit user action.

Unavailable saved references are counted separately and retained. Order snapshots remain available even with no onboarded store; historical source images are not rendered. Current demo order snapshots use the fetched product imagery and price/currency at placement. There is no fabricated shipment progression.

## Limitations
- Read-only bounded catalogue preview, not full synchronization: max 48 products/store and 100 variants/product. Pagination flags disclose omissions; no automatic full crawl.
- No market conversion, stock reservation, tax/shipping calculation, cross-currency total, live checkout, real merchant or shopper authentication.
- All orders are local simulation records. Active currency is taken from selected fetched variant. Mixed-currency lines in one store fail closed.
- Store registrations are browser-local. Changing browsers does not carry them or order history.
- The public service and its remote images require connectivity. Errors and empty states are visible; no invented fallback.
- Pruna is not connected. See PRUNA-BOUNDARY.md for mock versus implemented behavior and live prerequisites.
- Official public data source: https://shopify.dev/docs/storefronts/headless/mock-shop. Its catalogue is fictional and checkout cannot create a real order. Image redistribution rights were not established; images are remote references, not bulk downloads.

## Review
The static-fixture browser scenarios were replaced with onboarding-aware lifecycle tests, not skipped. Fixture data is confined to test files and routed test responses. Actual public catalogue smoke checks are separate from deterministic tests. See the latest section in VALIDATION.md.
