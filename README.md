# Fashion Centre
Responsive React/TypeScript frontend with a loopback Java Spring Boot backend. White/violet design and navigation remain; displayed business content now comes only from explicitly onboarded public demo stores.

Start with [HANDOVER.md](HANDOVER.md) for exact click paths, what works today, and the prioritized remaining work.

## Run locally
Prerequisites: Node.js 24, JDK 17 or newer, Maven 3.9, and installed Google Chrome for local browser tests. This laptop uses Node 24 and JDK 19; Java sources compile with `--release 17`. CI targets Linux, Node 24 and Java 17, but has not run remotely yet.

For a fresh checkout, run these commands in order from this directory. Initial dependency resolution needs network access; no credentials or environment file is required.
```powershell
npm ci
npm run build
node scripts/check-bundle.mjs
npm test
Push-Location backend
mvn -B package
Pop-Location
npm run test:ui
```

`test:ui` starts the frontend and the **already built** API when absent, then cleans up the processes it started. It uses isolated Chrome contexts, not your personal browser profile. Do not run it before packaging the backend.

To leave the preview running, use two terminals. In the first, from this directory:
```powershell
java -jar backend/target/fashion-centre-api-0.1.0.jar
```
In the second, from the same directory: `npm run dev`.
Or, after building, `powershell -File scripts/start-local.ps1` starts both hidden processes if ports are free.

Open http://127.0.0.1:5173. Java listens only at http://127.0.0.1:8081. Existing Node/JDK/Maven and installed Chrome are used; no browser or runtime installation was needed.

After dependencies have been cached, use `mvn -o -B package` from `backend`. On this development workspace, prior verification used a project-local cache instead: `mvn '-Dmaven.repo.local=.m2' -o -B package`. That ignored cache is **not included in a clone**. To reuse a known cache from a separate checkout, pass its absolute path with `-Dmaven.repo.local=...`. Similarly, `npm ci --offline --cache <existing-cache>` works only when every locked package is cached; do not expect an empty machine to build offline.

The committed `backend/src/main/resources/application.properties` contains only local server settings and disables multipart parsing. There is no required `.env` or sample credential. Never put secrets in Vite `VITE_*` variables: those values are exposed to browser code. The reserved `fashion-centre.try-on.enabled=true` flag rejects startup; supplying credentials does not activate generation.

## First visit
Open **Manage demo stores**, then explicitly onboard Mock Shop and/or Elysian Thread. This browser stores the choice. The Java API fetches the allowlisted public fictional catalogue. No products or stores are automatically onboarded, and network failure never falls back to invented inventory. Disable a store to hide its products; re-enable to fetch again without deleting cart, orders or saved references.

Store names, categories, imagery, products, variants, prices and availability come from fetched data. Up to 48 products and 100 variants/product are loaded; truncation is disclosed. Counts describe loaded records. Currency remains CAD/USD as supplied. The sample source directory is server configuration, not a list of already connected merchants.

## Local-only commerce and identity
Select an actual fetched variant, add it to the local cart, and place a **demo order** per store. This creates a browser record only; no public cart mutation, reservation, payment or merchant order is sent. Unavailable/disabled items stay visible in the cart and cannot check out. Totals are separated by currency.

Orders start empty. Existing user-created demo orders are preserved as historical snapshots. Old seeded SAMPLE records remain archived, excluded from order history. The original `fc.commerce.v1` value is retained; migration writes `fc.commerce.v2`. User preferences, saved and followed references remain. No fake profile identity exists.

Try-on is empty until actual verified results exist. No catalogue photo is presented as the user's generated image. The Pruna boundary is disabled and has no live transport or credentials. OTP remains a clearly labelled local UI simulation.

## Architecture and evidence
- `src/domain.ts`: scoped API mapping and catalogue types; no runtime product fixtures.
- `src/main.tsx`: local onboarding, fetch lifecycle, discovery/store/product/saved/empty states.
- `src/commerce.ts`: preserved-data migration and currency/variant-aware local transactions.
- `backend/.../shopify`: fixed read-only public endpoints, validation and mapping; no arbitrary host proxy.
- `backend/.../tryon`: disabled provider interface and mocked Pruna contract.
- [ONBOARDED-CATALOGUE.md](ONBOARDED-CATALOGUE.md), [COMMERCE-BOUNDARY.md](COMMERCE-BOUNDARY.md), [PRUNA-BOUNDARY.md](PRUNA-BOUNDARY.md), [VALIDATION.md](VALIDATION.md).
- Deterministic fictional records live only in tests. Legacy design images remain in source history/assets but are not selected as business content by runtime UI. Navigation SVGs remain design assets.

No real auth, merchant installation, AI generation, payment, personal-photo upload or deployment is enabled.

## Prepare a try-on photo locally

Open a fetched product and select **Prepare a try-on photo**, or select a garment in **Try on**. JPEG/PNG/WebP checks and previews run only in browser memory. Replace/remove/cancel/navigation releases previews; nothing is uploaded or persisted. Read the capture guidance and consent preview; generation is disabled. See [TRY-ON-PREPARATION.md](TRY-ON-PREPARATION.md). See [READINESS.md](READINESS.md) for current pilot prerequisites.

## Current quality and data safety

Brand owners: http://127.0.0.1:5173/#/owner. Demo-store onboarding: http://127.0.0.1:5173/#/merchant.

The local app now validates source responses, preserves recovery copies of malformed records, serializes same-origin writes with Web Locks, and blocks stale tabs from replacing newer data. Reload when the app reports a conflict. Profile offers a private local-data export; it is not cloud backup or an automated restore tool. The browser must support Web Locks (current Chrome on localhost is verified).

Store/search/category filters and currency-grouped sorting use fetched metadata. Full-screen catalogue photos support vertical scrolling and keyboard navigation; they are explicitly not generated try-on results. Unknown routes and failed images have recovery states.

See [VALIDATION.md](VALIDATION.md) for current evidence, [READINESS.md](READINESS.md) for verified local behavior versus external prerequisites, and [QA-GAPS.md](QA-GAPS.md) for the review priorities. Earlier implementation evidence is retained in [VALIDATION-HISTORY.md](VALIDATION-HISTORY.md).

The second adversarial pass adds failed-read preservation, a shared app-state lock across store changes and checkout, current-source order labels, still-PNG checks, bounded photo-viewer loading and OAuth ownership/scope-integrity regressions. [CI.md](CI.md) documents the local-only verification workflow; no GitHub run or push is implied.

[PERSISTENCE.md](PERSISTENCE.md) describes the JDBC tenancy/encrypted-token repository, durable private-job repository, explicit V1/V2 migrations and file-backed durability/concurrency tests. The worker uses injected recoverable-provider and private-storage ports tested with synthetic adapters. H2 is a test-only dependency; no runtime database, authentication, provider or storage adapter is configured. Generation remains disabled, multipart upload parsing is disabled, and setting `fashion-centre.try-on.enabled=true` deliberately rejects startup until production integration is implemented. There is no automatic migration or worker activation.
