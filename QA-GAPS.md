# Comprehensive local completion pass

Source reviewed: Fashion_Centre_Platform_Team_Brief(1).docx (Library version 1, 16 October 2026). The brief distinguishes shopper discovery/brand isolation from real merchant authorization, catalogue publication, generation, and checkout. No live integration is implied by this pass.

Priorities identified by independent focused reviews:
1. Preserve valid records when storage is malformed; prevent stale tabs silently overwriting orders; use stable variant keys for cart changes; reject invalid price and brand relationships.
2. Validate catalogue responses; recover from malformed/unknown routes; make empty/failed/disabled brand states explicit.
3. Improve shopper search/filter/sort, saved/followed management, keyboard navigation and responsive states without inventing catalogue metadata.
4. Harden backend response bounds and identity validation; expand OAuth/CSRF/state regression coverage while keeping runtime disabled.
5. Verify photo privacy and OTP simulation, run full suites, inspect screenshots, replace outdated readiness summaries.

No new push is authorized. Live auth, durable multi-user data, merchant installs, provider activation, payments and deployment remain outside this local pass.

## Resolution

All five local priorities above have implementation and regression coverage. Recovery exports deliberately exclude photo and OTP data. Catalogue descriptions are rendered as text; newest sorting only uses supplied creation dates. Source combined listings may share identical variants across products, but conflicting definitions and duplicates within one product fail closed. Cart operations retain product context and stable variant IDs.

Public catalogue verification found and resolved an overly strict combined-listing identity check. Screenshot verification was repeated after scrolling to load off-screen images. Current evidence and exact commands are in [VALIDATION.md](VALIDATION.md).

The remaining work is real-service implementation and operational readiness, detailed in [READINESS.md](READINESS.md), plus actual-device and assistive-technology testing. Passing automated local tests does not establish production readiness.

## Adversarial follow-up

| Reproduced gap | Fix and regression |
| --- | --- |
| Transient failed read followed by a successful write could overwrite unread records. | Writes require a successful read baseline; parser failure preserves raw recovery data. Tests include failed legacy migration and failed backup/write. |
| Another tab could disable a store while stale checkout still placed an order. | Related storage uses one Web Lock; add/checkout validate store baseline inside that lock. Two browser tests verify ordinary and explicitly queued races retain cart and create no order. |
| Refreshed variant/store names remained stale in order snapshots; malformed explicit historical currency could become AUD. | Snapshot current source labels; only truly missing legacy currency can migrate to AUD. Invalid explicit metadata is retained in recovery, not relabelled. |
| OAuth ownership could be revoked during exchange; saved scope metadata was not authenticated. | Recheck ownership after exchange and bind immutable granted scopes into versioned AES-GCM AAD; reject blank CSRF/malformed identities and sanitize repository/ownership failures. |
| PNG animation could pass still-photo preflight; picker focus disappeared after state changes. | Reject animation/chunk framing before decode; keep picker mounted and restore visible focus. Deferred-decoder tests cover replacement/cancellation and URL release. |
| Viewer requested all 40 fixture images on open and lacked explicit keyboard wrapping. | Render only selected/adjacent images; regression verifies at most 3 initial requests, orientation-size preservation, keyboard wrapping and reduced motion. |
| Browser tests silently depended on a manually running Java API. | Playwright manages readiness for both required local servers; CI configuration builds the JAR before browser checks. |

No new runtime, dependency, provider account, credential or production integration was installed or activated. Remaining independent code work is listed separately from external permissions in READINESS.md.
