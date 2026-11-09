# Fashion Centre: combined merchant and account application

This integrates `feature/shopify-foundation` with main's existing login, saved-photo storage and Pruna try-on code. It does not configure or deploy those services.

## Local development

Requires Node.js 24, JDK 17+, Maven 3.9+, and Chrome for browser tests.

- `npm ci`
- `npm run build`
- `node scripts/check-bundle.mjs`
- `npm test`
- From `backend`: `mvn -B package`
- `npm run test:ui`

The browser suite starts isolated loopback servers on 5174 and 8082. Its API is an explicit test fixture, not the production Java API. Catalogue, auth, photo and generation responses in browser tests are mocked. Real combined-controller and persistence contracts are exercised by the Java suite using an in-memory test database and mocked provider clients. No real OTP delivery, personal-photo upload or paid generation is validated by these checks.

For normal development, `npm run dev` serves http://127.0.0.1:5173. It proxies `/api` to http://localhost:8081 (override with `API_PROXY_TARGET` for a separate development API). Start the packaged Java app only after configuring main's existing MySQL/auth/Pruna/R2 requirements. Do not invent placeholder credentials or treat the test fixture as a live service. Never expose secrets through `VITE_*` variables.

## Navigation

- **For brands** / `/#/owner`: Shopify-domain format check and blocked installation readiness.
- **Demo stores** / `/#/merchant`: explicitly onboard allowlisted fictional public catalogues. No merchant ownership or Shopify authorization is granted.
- **Profile > Sign in or manage account** / `/#/login`: existing account verification and saved-photo flow; requires configured backend services.
- **Profile > Preview WhatsApp OTP login** / `/#/login-demo`: separate local simulation, no messages or account.
- Product > **Try on with my saved photo**: existing account-photo/Pruna flow. Requires sign-in, saved photo, and configured services.
- **Prepare a try-on photo** / `/#/try`: separate local-only photo preparation. It never uploads or generates.

Merchant shopping retains brand context, themes, recoverable local cart/order/preferences, and demo checkout. Real account identity does not grant merchant administration. Merchant Connect remains disabled.

## Database safety

Main's existing MySQL Flyway `V1__auth_tables.sql` is unchanged. Merchant H2-only experimental scripts are under `backend/src/main/resources/db/manual/`, not Flyway's automatic migration path. No merchant schema is automatically installed on an existing database. See `backend/PERSISTENCE.md` for boundaries. This integration did not modify any deployed database or credentials.

## Verification limits

The real production app still needs main's external service configuration. Camera permission/device behavior, real OTP transport, R2, real provider generation and end-to-end production database operation are not certified by mocked tests. No deployment is included.

Account/camera analysis code is lazy-loaded. The combined gzip budget is 160 KB total JavaScript and 12 KB CSS; the storefront entry remains about 92 KB gzip. This includes main's previously added MediaPipe dependency in the separate account chunk.

## Earlier design and implementation records

`HANDOVER.md`, `READINESS.md`, `AUTH-BOUNDARY.md`, `PRUNA-BOUNDARY.md`, `VALIDATION.md` and related notes record their original branch state. Their older global statements that authentication, uploads and live-provider code do not exist apply to that earlier merchant-only branch, not this combined source tree. Its merchant OAuth and private-job pipeline remain gated; main's separately implemented account/photo/provider endpoints remain present.
