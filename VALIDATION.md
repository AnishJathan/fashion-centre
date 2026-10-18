# Current validation — 18 October 2026

This report covers the quality/adversarial passes (`ba5c424`, `c7ff0cb`) and the subsequent storage-foundation increment. The previously pushed commit remains `53ffdbc`. Earlier evidence is preserved in [VALIDATION-HISTORY.md](VALIDATION-HISTORY.md). These results establish a working local demo and tested unwired foundations, not production readiness.

## Reproducible checks

| Command | Verified result |
| --- | --- |
| `npm run build` | TypeScript check and Vite production build passed. JavaScript 284.54 kB / 88.40 kB gzip; CSS 40.07 kB / 9.11 kB gzip. |
| `node scripts/check-bundle.mjs` | JavaScript 88,397 bytes gzip below 110,000; CSS 9,110 bytes below 12,000. |
| `npm test` | 31 passed; zero failed/skipped. |
| `npm run test:ui` | 30 passed in installed Chrome; zero failed/skipped. |
| `mvn '-Dmaven.repo.local=.m2' -o -B package` from `backend` | 66 passed; zero failures/errors/skips; runnable Spring Boot JAR packaged successfully offline. |
| `npm audit --json` | Zero reported vulnerabilities in the installed npm dependency graph at check time. Not a Java advisory audit or security certification. |
| `node scripts/public-smoke.mjs` | Read-only public catalogue browser smoke; see public evidence below. Requires both local servers and network access. |

Frontend unit coverage includes variant identity, quantity limits, currency precision/overflow, malformed-record recovery, stale-write guards, combined listings, API validation and encoded photo dimensions. Browser coverage includes mobile/desktop onboarding, filters, store isolation, saves/follows, demo checkout, quota failure, simultaneous tabs, migration, export, invalid routes, image fallback, vertical still-photo viewing, keyboard focus, OTP simulation and local photo lifecycle. Synthetic photo tests check no upload/persistence and released previews; encoded oversized PNG is rejected before native decode.

Java tests cover source contracts and metadata, identical versus conflicting shared variants, response size/deadline cancellation, OAuth principal/session/CSRF/state expiry/scopes and disabled try-on metadata expiry. External credential exchanges and provider jobs use test doubles only.

The second pass adds failed-read/failed-write recovery, malformed historical currencies, updated variant labels, disabled-store historical orders, cross-tab store-disable/checkout ordering, late photo-decoder replacement/cancellation, APNG rejection, modal keyboard wrapping, resize preservation and three-image viewer bounds. OAuth regressions cover ownership revocation during token exchange, tampered scope metadata, spoofed identity/blank CSRF, repository failure and immutable token-record data.

Initial full browser execution found two owner-dashboard failures while the API was intentionally stopped for packaging. This exposed an implicit test dependency. Playwright now starts/waits for both the frontend and packaged API when absent. The CI workflow is syntax-checked and uses immutable action pins; GitHub execution remains unverified and unpushed. See [CI.md](CI.md).

After the final 30-test browser pass, the API was stopped deliberately and `npx playwright test e2e/merchant.spec.ts` passed all 3 checks. Playwright started the absent API, waited for readiness and cleaned up its temporary process. The normal local API was then restarted for the preview. This verifies cold API startup on this Windows laptop; it does not establish hosted Linux CI execution.

## Storage foundation evidence

The latest Java package run passed 66 tests: the prior 39, 14 actual JDBC file-backed integration tests and 13 private-job domain tests. JDBC tests exercise process halt/reopen, competing shop claims, row-lock ordering, revoked/expired identities, rollback after mutations, uncommitted-data isolation, ambiguous commit acknowledgement and schema refusal/recovery boundaries. Job tests use an in-memory test adapter for state/idempotency/CAS and authorization races; they do not establish durable job storage.

This increment resolved one new dependency from Maven Central: H2 2.5.252, test scope only (approximately 2.7 MB). Final checks use the local offline Maven cache. No database server/runtime, production datasource, actual photos, persistent service credentials or real encryption keys were configured. Full implementation guarantees and remaining limitations are in [PERSISTENCE.md](PERSISTENCE.md).

The packaged JAR was inspected: it includes `JdbcConnections`, the private-job domain and the V1 migration, and excludes the H2 driver, crash-test writer and test classes. The new storage classes are not Spring beans and the migration is not run at startup.

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

No live authentication, WhatsApp message, merchant install, payment, Pruna generation, real personal-photo upload or deployment was performed. No further Git push is included in this pass. Real touch hardware, Safari/Firefox, screen-reader workflows, production load, durable multi-user persistence and production security assessment remain unverified. See [READINESS.md](READINESS.md) for external prerequisites and work that still requires implementation.
