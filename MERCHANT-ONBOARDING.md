# Merchant onboarding boundary

Open http://127.0.0.1:5173/#/owner through **For brands**. Existing demo onboarding remains http://127.0.0.1:5173/#/merchant. These are hash routes.

Implemented: responsive dashboard, strict canonical shop-domain validation, read-only server readiness, Java authorization URL/callback protocol with random 256-bit state, five-minute expiry, session/owner/shop binding, membership recheck, duplicate-query rejection, HMAC verification, timestamp checks, single-use state, fixed Shopify token endpoint, required-scope checks, and AES-GCM token encryption with tenant-bound authenticated data. Tokens and provider errors are not returned to the browser. Tests inject token exchange, ownership and persistence; no live OAuth exchange is implemented or called.

Runtime is deliberately unconfigured: POST install returns 401 without a server-authenticated owner; callback returns 503. Test-only constructor injection cannot be enabled by environment flags. Dashboard cannot report connection success. Demo shopper OTP/localStorage identity is never merchant authorization. No account, credentials, installation or deployment was created.

## Required before live connection

1. A Shopify developer organization and registered app controlled by the user. For multiple independent merchants choose public distribution; Shopify approval is required for public distribution. Custom distribution is limited to its supported single-merchant/Plus-organization cases. Development-store testing is distinct from public approval.
2. User-approved HTTPS app URL and exact allowlisted callback URL, client ID and secret delivered through a server-side secret manager, not browser storage, chat or git. The read_products scope used in protocol tests is illustrative; finalize least-privilege scopes against the actual catalogue synchronization design.
3. Real owner authentication, server sessions with secure HttpOnly/SameSite cookies, session rotation and CSRF issuance, verified brand membership and authorization. No client-supplied owner ID is trusted.
4. Durable atomic state storage and a tenant database enforcing unique shop/brand connection ownership, authenticated key management, encrypted token persistence, rotation/revocation and Shopify token expiry/refresh handling. Current in-memory state and repository interfaces are scaffolding, not production persistence. Add bounded HTTPS token transport and validate Shopify responses before wiring runtime.
5. Uninstall and applicable compliance webhooks, retention/deletion policy, privacy disclosures, abuse/rate controls, audit logging without secrets/query strings, review requirements and reconciliation of product synchronization. None are implied by the OAuth protocol tests.
6. Explicit authorization for an owned development-store installation, followed by review of the actual Shopify permissions screen. Do not install or transmit credentials as part of local testing.

Official references checked 18 October 2026:
- https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps
- https://shopify.dev/docs/apps/launch/distribution
- https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices

## Validation commands

From app: npm run build; npm test; npm run test:ui.
From backend: mvn -Dmaven.repo.local=.m2 -o -B package.
Start backend: java -jar target/fashion-centre-api-0.1.0.jar. Frontend: npm run dev.

Automated browser tests use installed Chrome in isolated contexts, not the user's existing browser session. Current CUA inventory contains no browser surfaces. Screenshot evidence: test-results/merchant-390.png and merchant-1440.png (generated, gitignored).

Validated locally: TypeScript/Vite production build passed; 12 frontend unit tests passed; offline Maven package passed with 23 Java tests; all 10 Playwright scenarios passed, including 390px/1440px merchant navigation, domain validation, blocked connection, unavailable readiness, existing onboarding/checkout/migration and local photo preparation. Screenshots visually inspected. No real Shopify authorization, token exchange, merchant ownership, persistence or catalogue synchronization was exercised.
