# Cart, sample orders and demo profile

## This increment

The React screens use the existing Java-backed catalogue. `commerce.ts` defines cart lines, order snapshots, profile preferences, a pure transaction reducer and a browser-storage repository. `CommerceScreens.tsx` provides Cart, separate brand checkout review, sample order list/detail/status, and Profile. No dependencies were added.

Cart lines are keyed by product and size. Repeated additions merge the same size up to nine pieces; different sizes remain separate. Clothing uses XS–XL; the sample sneaker uses EU sizes. Quantity must be an integer from 1 through 9, enforced in the UI and reducer. Invalid changes leave the previous quantity unchanged. Remove is explicit, rather than treating zero as deletion.

Each brand has its own subtotal and demo checkout. A review screen explains the simulation before completion. Completing it snapshots the selected brand's items/prices into a **local demo order**, then removes only those items. The reducer applies both changes as one state transition; a repeated completion with an empty brand cart creates no duplicate order. No inventory is reserved, purchase made, shipping calculated or payment collected.

The confirmation action is explicitly **Place demo order**. A synchronous submission latch blocks immediate repeat clicks, in addition to reducer-level protection. Orders retain the full UUID-based identifier, ISO timestamp, brand and item snapshots (size, quantity, unit price, colour, name and image). The detail view immediately shows a local-demo confirmation, full ID, creation timestamp and link to all orders. An order-type filter separates **Your demo orders** from **Sample examples**. Existing records are preserved. Cancellation does not dispatch any state change.

Orders includes three labelled fixtures plus locally created demo-checkout records. Records are grouped by brand and filterable by brand/status. Detail shows a static illustrative progress sequence and item summary. A Shopify redirect would not automatically populate this history. Statuses are not live or automatically advanced. Local demo data is not a receipt.

Profile contains a guest identity, links/counts for sample orders, saved items and cart, followed brands, local style/fit preferences and access to the existing WhatsApp OTP simulation. The new-arrival checkbox is a UI preference only: no notification service or catalogue personalisation is connected. No name, address or other personal information is requested.

## Persistence and boundaries

Cart, sample orders and preferences use `fc.commerce.v1` in localStorage. Saved/followed data retain their existing keys. Invalid stored cart quantities/products/sizes are discarded; malformed storage falls back safely. Storage failure shows an in-visit-only message. Browser data is not shared across devices or accounts and clearing storage resets the demo.

The Java API continues to serve the public demo catalogue. This increment does not add unauthenticated server-side carts or shopper records. There is no Node application backend. Before a live implementation, replace `localCommerceRepository` and demo checkout with authenticated Java services: enforce shopper ownership, validate publication/variants/availability and current prices server-side, and use durable idempotency for checkout initiation. Order ingestion must be separately authorised, reconciled and scoped to the correct shopper and brand. Local values and the WhatsApp UI demo must never serve as authentication or authoritative prices.

## Design scope

These are new responsive application screens using the existing white/violet design language. No Figma files were edited; the Figma quota limitation did not block app implementation.
