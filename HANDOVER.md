# Fashion Centre local handover

18 October 2026. Preview: http://127.0.0.1:5173. This is a working local demo with tested backend foundations, not a production pilot.

## What works today

- Browse explicitly onboarded public demo catalogues, open a distinct Brand Centre, follow a store, inspect product variants and return to the combined catalogue.
- Save items and use a per-store demo cart/checkout. Cancelling keeps the cart; placing a demo order creates a browser record only. Saves, follows and orders survive refresh in that browser.
- View full-screen vertical **catalogue photos**, with keyboard navigation and Close. They are not generated try-on results.
- Prepare a photo locally in browser memory, replace/remove/cancel it, and read capture guidance. Generation remains disabled; no photo is uploaded or stored by the app.
- Use the owner dashboard to validate a Shopify domain's syntax and inspect setup blockers. Domain validation does not verify ownership; Connect remains disabled.
- Use a clearly labelled OTP simulation. No message or authenticated account is created.
- Switch between Light and Dark only in **Profile > Appearance > Light / Dark / Use device**. The initial setting follows the device; an explicit choice persists in this browser and synchronizes across its tabs. Photos retain their original colours. Mobile navigation is a slimmer 60-pixel capsule with at least 44-pixel touch targets.

Browser-local data does not sync between devices. Profile offers a local export for manual recovery. No real purchase, merchant installation, authentication or AI generation is enabled.

Selecting a brand now keeps its supplied name in the header, announcement and footer across product, saved, cart, checkout, photo preparation and profile routes. Catalogue, cart counts and garment choices stay scoped to that store. Shared settings/follows and all-store order history are explicitly labelled; historical records are never reassigned or removed. Context lives in the URL, so refresh, copied links and browser history work without a hidden global preference. Product links select their owning store. Disabled stores retain unavailable cart records and clear exits. No verified logo or brand colour metadata is supplied, so the app uses the actual store name with the existing palette rather than inventing assets.

## Click-through guide

| Goal | Exact path and expected result |
| --- | --- |
| Start with a catalogue | **For brands → Explore demo stores → Onboard Mock Shop → Browse onboarded stores**. Public source availability requires network access; failures show a retry state. Elysian Thread is another optional demo source. |
| Enter and leave a brand | **Brands → store** opens its Brand Centre. Brand mode persists across shopping routes. **Discover** returns to that brand; **Back to Fashion Centre** returns to combined discovery, and **Switch brand** opens the brand chooser. |
| Follow and save | In a Brand Centre, **Follow store → product → Save piece**. **Profile** shows followed stores; **Saved** shows saved products. |
| View vertical photos | **Product → View catalogue photos full screen**. Scroll vertically, use **Next photo**, or focus the photo area and use arrow keys. Escape closes the viewer. |
| Try demo checkout | **Product → choose an available variant → Add to demo cart → View your cart → Demo checkout**. **Cancel and keep shopping** preserves the cart. **Place demo order** creates only a local record. |
| Review an order | **Profile → Your demo orders**. Refresh preserves the order; browser Back returns to Profile. |
| Cancel photo preparation | **Saved → product → Prepare a try-on photo → Cancel preparation**. The app returns to the empty try-on results view. No generation is implied. |
| Inspect merchant setup | **For brands → Shopify store domain → Check domain → Refresh readiness**. Keyboard users can focus the domain field, type, Tab to **Check domain**, then Enter. Connect stays blocked. |

The complete click-through regression runs at 390px and 1440px with synthetic catalogue/readiness responses, refresh, browser Back, cancellation and keyboard checks. It asserts no page errors or POST/PUT/PATCH/DELETE requests. Separate owner tests use the actual disabled local API. These are isolated Chrome tests, not physical-phone or screen-reader certification.

## Changes reviewed together

| Local commit | Outcome |
| --- | --- |
| `ba5c424` | Hardened shopping data, recovery, variants, filters and photo interactions. |
| `c7ff0cb` | Added adversarial storage/OAuth regressions and a read-only CI verification workflow. |
| `70c20bf` | Added encrypted merchant connection persistence, explicit schema and private-job contracts. |
| `c2e55d3` | Added durable job recovery, worker fencing, cancellation, retry and retention/deletion metadata. |

The persistence/worker code is packaged but unwired. Only synthetic test authorities, objects and provider responses are used. No migration runs at startup. The three-claim development worker budget is not a practical live-provider policy; expired jobs retain metadata tombstones rather than physically purging them.

The final handover pass fixes fresh-checkout instructions and adds the complete navigation regressions. See [README.md](README.md) for install/build/start commands and [VALIDATION.md](VALIDATION.md) for exact final checks.

## Prioritized remaining work

| Priority | Engineering still required | Account decision or approval needed |
| --- | --- | --- |
| 1 — Identity and durable runtime | Verified identity/session adapter, endpoint authorization, administrative memberships, production datasource/migrations, backups and recovery. Test identity rows are not a login system. | Choose identity provider, database/hosting and secret management; authorize configuration work. |
| 2 — Real merchant onboarding | Wire OAuth storage and key lifecycle; implement reinstall/uninstall, publication selection, catalogue pagination/sync and privacy webhooks. | Owned Shopify app/development store, exact HTTPS callbacks, scopes, merchant permission and distribution review. |
| 3 — Purchase handoff | Implement brand checkout destinations and revalidate actual variants, price and availability. Local orders do not reserve stock. | Confirm brand-owned Shopify checkout and authorize store integration. |
| 4 — Private try-on | Authenticated private uploads/results/deletion, object storage, recoverable provider transport, result validation/materialization, scheduling, practical bounded polling/cost policy, reconciliation and metadata compaction. | Provider/model terms, image rights and explicit consent, regions, retention policy, spending cap and secure service setup. |
| 5 — Release operations | Execute CI, configure deployment/monitoring, test production database/load/recovery, and check real devices and assistive technology. | Deployment approval and operating owners. |

Credentials alone do not complete these implementation tasks. No account setup, provider call, paid generation, personal-photo upload, installation, deployment or push was performed in this handover pass.

## Repository state

The reviewed implementation branch is `feature/shopify-foundation`. A read-only remote check on 18 October 2026 returned:

- Remote feature branch: `53ffdbc4fb8d6da4ba19c86701b3a63940a5c263`.
- Remote main: `dd75322a1471a522c065b3bafaecff74811af0a5`.

These hashes record the pre-push baseline. The user subsequently authorized pushing completed commits to this feature branch. The completion report supplies the verified final local/remote hash and actual CI status; a CI pass is not assumed. The laptop runs Java 19 while compiling Java 17 bytecode.
