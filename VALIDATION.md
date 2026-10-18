# Current validation — 18 October 2026

This report covers the local quality pass after previously pushed commit `53ffdbc`. Earlier evidence is preserved in [VALIDATION-HISTORY.md](VALIDATION-HISTORY.md). These results establish a working local demo, not production readiness.

## Reproducible checks

| Command | Verified result |
| --- | --- |
| `npm run build` | TypeScript check and Vite production build passed. JavaScript 282.95 kB / 87.83 kB gzip; CSS 40.07 kB / 9.11 kB gzip. |
| `npm test` | 22 passed; zero failed/skipped. |
| `npm run test:ui` | 26 passed in installed Chrome; zero failed/skipped. |
| `mvn '-Dmaven.repo.local=.m2' -o -B package` from `backend` | 34 passed; zero failures/errors/skips; runnable Spring Boot JAR packaged. No dependency downloads. |
| `npm audit --json` | Zero reported vulnerabilities in the installed npm dependency graph at check time. Not a Java advisory audit or security certification. |
| `node scripts/public-smoke.mjs` | Read-only public catalogue browser smoke; see public evidence below. Requires both local servers and network access. |

Frontend unit coverage includes variant identity, quantity limits, currency precision/overflow, malformed-record recovery, stale-write guards, combined listings, API validation and encoded photo dimensions. Browser coverage includes mobile/desktop onboarding, filters, store isolation, saves/follows, demo checkout, quota failure, simultaneous tabs, migration, export, invalid routes, image fallback, vertical still-photo viewing, keyboard focus, OTP simulation and local photo lifecycle. Synthetic photo tests check no upload/persistence and released previews; encoded oversized PNG is rejected before native decode.

Java tests cover source contracts and metadata, identical versus conflicting shared variants, response size/deadline cancellation, OAuth principal/session/CSRF/state expiry/scopes and disabled try-on metadata expiry. External credential exchanges and provider jobs use test doubles only.

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
