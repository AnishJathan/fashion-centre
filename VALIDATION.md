# Current validation — 18 October 2026

This report covers the quality/adversarial passes (`ba5c424`, `c7ff0cb`), storage foundation (`70c20bf`) and subsequent durable private-job/worker increment. The earlier published foundation was `53ffdbc`; subsequent push and CI status are reported separately. Earlier evidence is preserved in [VALIDATION-HISTORY.md](VALIDATION-HISTORY.md). These results establish a working local demo and tested unwired foundations, not production readiness.

## Reproducible checks

Hosted CI follow-up: the authorized feature-branch push at `382fc7e` passed Linux build, bundle budgets, frontend unit and backend checks. Its browser run passed 42/47 tests and exposed test timing assumptions around asynchronous saves, photo cleanup and concurrent clicks. The tests now wait for committed quantity/save state and revoked previews, poll recovery evidence, and hold the shared Web Lock until both concurrent writes are queued. Assertions remain intact; no application behavior was changed. Hosted rerun results are reported with the final delivery commit.

| Command | Verified result |
| --- | --- |
| `npm run build` | TypeScript check and Vite production build passed. JavaScript 288.23 kB / 89.72 kB gzip; CSS 45.99 kB / 10.39 kB gzip. |
| `node scripts/check-bundle.mjs` | JavaScript 89,723 bytes gzip below 110,000; CSS 10,387 bytes below 12,000. |
| `npm test` | 35 passed; zero failed/skipped. |
| `npm run test:ui` | 47 passed in installed Chrome (2.3 minutes); zero failed/skipped, including complete walkthroughs, four navigation viewport checks, seven theme tests two common-home scenarios and two persistent-brand scenarios. |
| `mvn '-Dmaven.repo.local=.m2' -o -B package` from `backend` | 104 passed; zero failures/errors/skips; runnable Spring Boot JAR packaged successfully offline. |
| `npm audit --json` | Zero reported vulnerabilities in the installed npm dependency graph at check time. Not a Java advisory audit or security certification. |
| `node scripts/public-smoke.mjs` | Read-only public catalogue browser smoke; see public evidence below. Requires both local servers and network access. |

Frontend unit coverage includes variant identity, quantity limits, currency precision/overflow, malformed-record recovery, stale-write guards, combined listings, API validation and encoded photo dimensions. Browser coverage includes mobile/desktop onboarding, filters, store isolation, saves/follows, demo checkout, quota failure, simultaneous tabs, migration, export, invalid routes, image fallback, vertical still-photo viewing, keyboard focus, OTP simulation and local photo lifecycle. Synthetic photo tests check no upload/persistence and released previews; encoded oversized PNG is rejected before native decode.

Java tests cover source contracts and metadata, identical versus conflicting shared variants, response size/deadline cancellation, OAuth principal/session/CSRF/state expiry/scopes and disabled try-on metadata expiry. External credential exchanges and provider jobs use test doubles only.

The second pass adds failed-read/failed-write recovery, malformed historical currencies, updated variant labels, disabled-store historical orders, cross-tab store-disable/checkout ordering, late photo-decoder replacement/cancellation, APNG rejection, modal keyboard wrapping, resize preservation and three-image viewer bounds. OAuth regressions cover ownership revocation during token exchange, tampered scope metadata, spoofed identity/blank CSRF, repository failure and immutable token-record data.

Initial full browser execution found two owner-dashboard failures while the API was intentionally stopped for packaging. This exposed an implicit test dependency. Playwright now starts/waits for both the frontend and packaged API when absent. The CI workflow is syntax-checked and uses immutable action pins; GitHub execution remains unverified and unpushed. See [CI.md](CI.md).

After the final 30-test browser pass, the API was stopped deliberately and `npx playwright test e2e/merchant.spec.ts` passed all 3 checks. Playwright started the absent API, waited for readiness and cleaned up its temporary process. The normal local API was then restarted for the preview. This verifies cold API startup on this Windows laptop; it does not establish hosted Linux CI execution.

## Mobile floating navigation

The requested capsule shape applies only at widths up to 700 pixels. Fashion Centre icons, labels, routes and logo are preserved. Desktop retains its prior 460-pixel-wide navigation with 20-pixel corner radii. Mobile navigation has fully rounded ends, 12-pixel side insets, a violet selected-item pill and bottom clearance including the CSS safe-area inset.

The first capsule increment passed 36 browser tests. The subsequent theme increment reduces mobile height from 76 to 60 pixels while retaining at least 44-pixel touch targets. The four navigation viewport checks cover 320, 390, 430 and 1440 pixels, unchanged destinations, selected state, keyboard navigation, no horizontal overflow and footer clearance. A simulated 34-pixel safe-area inset moves the navigation to 46 pixels above the viewport bottom and increases content padding to 130 pixels. Physical iPhone safe-area behavior remains unverified.

All five screenshots in `screenshots/navigation/` were visually inspected: the four viewport captures and `nav-390-safe-area-focus.png`. They use a synthetic test catalogue and show the mobile capsule, selected pill, visible keyboard focus, safe-area spacing and unchanged desktop geometry.

## Light and Dark appearance

Theme controls are available only in **Profile > Appearance**, with Light, Dark and Use device radio controls. The former page-global shortcut has been removed. A missing preference follows the current system setting and responds to subsequent system changes. An explicit selection persists under `fc.theme.v1`, independently of shopping records. Storage uses the existing read baseline, lock and recovery-copy protections. Failed reads/writes preserve existing data and display an explicit tab-only message. Cross-tab storage events synchronize appearance.

`public/theme-init.js` runs in the document head before body parsing, with critical light/dark backgrounds in `index.html`. It reads without writing; unit checks verify agreement with the runtime resolver for valid, absent, malformed and blocked storage. This avoids waiting for React before applying the preferred background.

Seven additional browser tests cover keyboard radio switching, reload persistence, device changes, cross-tab updates, original-byte recovery, blocked reads/writes and both themes across shopper, brand, owner, demo management, profile, product, cart, checkout, order, login, populated photo preparation and full-screen photo views. Dark text on tested solid surfaces is checked at 4.5:1; disabled controls and photographic gradients are excluded. This is a focused contrast check, not a complete accessibility certification. Photos are asserted to have no CSS filter; only navigation SVGs are recoloured.

Screenshots in `screenshots/themes/` include both themes at 320, 390, 430 and 1440 pixels, plus screen-by-screen mobile/desktop captures. Both-theme home/nav captures and representative profile, owner, management, preparation, product, checkout, order, login and photo screens were visually inspected. Visual review corrected low-contrast small labels, pale order metadata and the login badge; browser checks also caught and resolved delayed controlled-radio updates. Java/backend code and dependencies are unchanged; the 104 Java results above remain from the preceding integration pass.

## Common homepage and settings-only theme

Fashion Centre home combines all enabled onboarded catalogues under the shared Fashion Centre heading. Its store dropdown, sort dropdown, filter panel and sorting action are removed. Simple search, photographic category browsing, product source labels and links to distinct Brand Centres remain. Home explicitly ignores store-filter and sort state from other screens; navigation also resets search/category controls. Saved-page store filtering and Brand Centre sorting remain available. Product identities and original currencies are unchanged.

Two new browser scenarios cover no stores, one store, two stores, returning from either restricted Brand Centre, returning from a restricted Saved page, searching the combined catalogue, disabling either/both stores and changing/reloading themes through Profile. The fixture stores deliberately use distinct CAD/USD prices. Both-theme screenshots at 390 and 1440 pixels in `screenshots/common-home-*.png` were visually inspected. The existing theme/navigation matrix still covers 320 and 430 pixels. Test fixtures are isolated; the actual app still displays only onboarded fetched data and does not seed sample products. Live source availability and the existing 48-products-per-store bound remain limitations.

## Persistent Brand Centre mode

`navigationScope.ts` resolves brand context from the hash URL. Brand/product/photo/checkout identity wins over a conflicting query parameter. Other shopping routes carry `?brand=<store-key>`; explicit Fashion Centre and brand-chooser links clear context. Normal browser history restores the context in each entry. No business records are copied or rewritten when changing brands.

The active store scopes catalogue/saved products, cart views/counts and try-on garment selection. Checkout dispatch still uses the complete protected commerce repository and retains other stores' carts. Orders remain global historical snapshots with an explicit all-store label; Profile explains shared settings/follows/history and scoped cart/saved counts. Disabled/unavailable stores show no other store's products and preserve unavailable cart records. The merchant name is supplied metadata; no logo or brand colour has been fabricated.

Two navigation unit tests cover explicit exits, URL persistence, malformed input and conflicting ownership. Two mobile/desktop browser scenarios cover brand identity across routes, direct product entry, refresh/back/forward, switching, CAD/USD cart isolation, checkout/history retention, photo preparation cancellation, shared theme settings, disabled stores and common discovery on exit. Brand screenshots in both themes at 390 and 1440 pixels were inspected. Full regressions found an ambiguous test locator after headers became branded and a long-name footer overflow at 320 pixels; both were corrected. Backend code and the preceding 104-test Java evidence are unchanged.

## Storage foundation evidence

The prior storage-foundation package run passed 66 tests: the earlier 39, 14 actual merchant JDBC file-backed integration tests and 13 private-job domain tests. Merchant JDBC tests exercise process halt/reopen, competing shop claims, row-lock ordering, revoked/expired identities, rollback after mutations, uncommitted-data isolation, ambiguous commit acknowledgement and schema refusal/recovery boundaries. The original job-domain tests use an in-memory adapter; the subsequent increment adds the durable coverage below.

This increment resolved one new dependency from Maven Central: H2 2.5.252, test scope only (approximately 2.7 MB). Final checks use the local offline Maven cache. No database server/runtime, production datasource, actual photos, persistent service credentials or real encryption keys were configured. Full implementation guarantees and remaining limitations are in [PERSISTENCE.md](PERSISTENCE.md).

The storage classes are not Spring beans and migrations are not run at startup. H2 and crash-test helpers belong only to the test classpath.

## Durable private-job evidence

The final package run passed 104 tests: the prior 66 plus 23 file-backed private-job integration tests, 11 worker tests and 4 runtime configuration/application tests. Package inspection confirms `JdbcPrivateJobs`, `PrivateJobWorker`, `TryOnRuntimeConfiguration` and the V2 SQL are included; the H2 driver, child-process test helpers and test classes are excluded.

The new JDBC suite uses temporary file databases and synthetic session/reference authorities. Coverage includes owner-scoped idempotency, concurrent reservations and independent worker sessions, stale lease fencing, cancellation during a blocked provider poll, receipt recovery through a fresh repository/worker, reference expiry before commit, shared-reference retention and orphaned-result deletion queues. A child JVM halts after simulated provider acceptance but before storing its receipt; recovery does not submit again. Merchant behavior is checked after the explicit V2 migration.

Worker tests use mocked provider/storage ports to exercise intent-before-submission, ambiguous responses, lost receipts, delayed bounded polling, deletion retry/acknowledgement and authority loss between deletions. A final READY claim cannot spend a submission with no remaining poll budget. These tests do not contact Pruna, upload photos or delete actual objects.

The expanded run caught a nondeterministic queue fixture: identical timestamps allowed random UUID ordering to place the healthy job first. The fixture now gives the invalid head an earlier timestamp. Review also added a visibility recheck before returning an idempotent reservation and prevented owner mutations from bypassing a worker fence during polling backoff.

A final regression reproduced a backward clock adjustment making retry metadata unreadable. Retry and reference-triggered cancellation now preserve nondecreasing update timestamps; the regression reopens the database after both operations.

Application-context tests verify that the runtime has no datasource, worker bean or multipart resolver, returns disabled/empty try-on status and refuses job requests. The reserved enable flag fails startup when set to true. This verifies fail-closed configuration, not a production authentication or object-storage integration.

The final 30-test Chrome run passed with the packaged API initially stopped; Playwright started and cleaned up its own API process. The normal preview API was then restarted. Live checks returned HTTP 200 for the frontend and try-on status, with `Cache-Control: no-store`, `enabled: false`, no configured adapters/results, and disconnected merchant readiness with zero connections. A changed-file credential-pattern scan found no matches; this is not a security certification.

The development policy has only three total claims (normally one submit and at most two polls). A real provider needs a practical bounded polling/cost policy. Expiry hides job rows and queues eligible opaque objects for deletion; metadata tombstones are retained, not physically erased. See [PERSISTENCE.md](PERSISTENCE.md) for exact guarantees and missing production work.

## Final clean-checkout integration pass

All four local implementation commits after `53ffdbc` were reviewed together. A separate local clone at `c2e55d3` was created without hardlinks; the final two-case walkthrough test was copied into it. No existing `node_modules`, build output or target directory was copied. Dependency caches were reused explicitly, avoiding new downloads:

```powershell
npm ci --offline --no-audit --no-fund --cache <existing-npm-cache>
npm run build
node scripts/check-bundle.mjs
npm test
# From the clone's backend directory:
mvn '-Dmaven.repo.local=<existing-maven-cache>' -o -B package
# Back at the clone root, with both original preview servers stopped:
npm run test:ui
```

The clean copy passed TypeScript/Vite build, unchanged gzip budgets, 31 frontend unit tests, 104 Java tests and all 32 browser tests. Playwright started both the clean copy's frontend and freshly packaged API, waited for readiness, and cleaned up its own processes. The documented `powershell -File scripts/start-local.ps1` then restored the main workspace preview. Tests did not use the user's browser profile.

The new complete navigation tests use synthetic catalogue/readiness responses at 390px and 1440px. They cover onboarding, brand follow, save, cart cancellation, refresh, demo order persistence, browser Back, photo-preparation cancellation and keyboard domain checking, with zero page errors or mutation requests. Other owner tests use the actual disabled API. Public upstream/image fetching was not redundantly repeated in this pass; earlier read-only evidence remains below.

The concrete handover issue found was setup documentation: a fresh checkout needs `npm ci`, a network-capable first Maven build (or an explicitly populated cache), and backend packaging before browser tests. README and CI.md now give that order. No runtime `.env` or sample credentials are required; committed server configuration is loopback-only with multipart parsing disabled. Existing application tests verify no datasource/worker/multipart resolver, blocked generation and disabled merchant connection behavior.

CI YAML was parsed again with duplicate-key rejection. Workflow scripts match package.json, Node 24, Maven packaging and the Java 17 compiler target. Local execution uses JDK 19; generated classes use Java 17 bytecode. Actual Linux/Java 17/hosted Chromium execution remains unverified until an authorized CI run. No runtime/browser install or remote push occurred.

Read-only `git ls-remote` confirmed feature branch `53ffdbc4fb8d6da4ba19c86701b3a63940a5c263` and main `dd75322a1471a522c065b3bafaecff74811af0a5` on 18 October 2026. [HANDOVER.md](HANDOVER.md) records reviewed commits, exact click paths and prioritized implementation versus account prerequisites.

## Public source evidence

The rebuilt local API returned 29 Mock Shop products (28 nonempty descriptions, 29 source dates) and 30 Elysian Thread products (30 descriptions and dates). An initial Mock Shop502 exposed identical shared merchandise in combined listings. The mapper and frontend now accept consistent shared variants, reject within-product duplicates/conflicts, and retain product context in cart operations. Both catalogue endpoints subsequently returned successfully.

The two-store Chrome smoke passed at 390px and 1440px: 59 combined products, 29 in Mock Shop's isolated store, successful return to the combined catalogue, zero failed photos, zero horizontal overflow and zero page errors. Screenshots in `screenshots/quality` show public source imagery and were visually inspected. The capture script scrolls to load off-screen images before full-page capture. Browser contexts are isolated and do not change the user's browser or existing shopping data.

## Run and inspect

- Shopper: http://127.0.0.1:5173
- Demo-store setup: http://127.0.0.1:5173/#/merchant
- Owner dashboard: http://127.0.0.1:5173/#/owner
- API: http://127.0.0.1:8081

First visit: explicitly onboard one or both public demo stores. Follow [README.md](README.md) to rebuild/start. Process IDs are recorded only in ignored `local-processes.json`.

## Limits

No live authentication, WhatsApp message, merchant install, payment, Pruna generation, real personal-photo upload or deployment was performed. No further Git push is included in this pass. Real touch hardware, Safari/Firefox, screen-reader workflows, production load, production multi-user persistence and production security assessment remain unverified. See [READINESS.md](READINESS.md) for external prerequisites and work that still requires implementation.
