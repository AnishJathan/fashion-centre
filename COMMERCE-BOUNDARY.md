# Local commerce boundary
Current cart lines carry merchant/source ID, scoped product and variant keys, variant title and quantity. Fetched availability controls additions and checkout. Browser-only demo checkout snapshots actual selected variant price/currency and product metadata. It clears only that store's selected cart after an idempotent local transition. No API writes or public cart mutations occur.

Fresh orders are empty. Migration preserves prior user-created DEMO records and all compatible cart references, even when products are gone. Earlier seeded SAMPLE records remain archived and excluded from visible history. The original v1 storage value is untouched; v2 is the current repository. Disable/re-enable of a store never deletes commerce records. Unavailable items remain visible and block checkout for their group.

Each store must have available lines in one currency to check out. Known amounts are shown by currency; no conversion or combined CAD/USD total exists. Local order statuses say Recorded locally, without fake tracking progression. Legacy user snapshots are explicitly historical. Profile displays browser state and no invented identity.

Production requirements remain authenticated shopper ownership, authorized merchant connections, authoritative variant/price validation, real Storefront checkout and secure server-side order linkage. Phone/email equality or untrusted cart attributes alone must not assign orders. Webhook HMAC alone is insufficient: durable delivery deduplication, transactional state updates, authorization, replay handling and reconciliation are still required before receiving events. All live Shopify routes remain disabled.

See ONBOARDED-CATALOGUE.md and SHOPIFY-FOUNDATION.md for source limits and authorization prerequisites.
