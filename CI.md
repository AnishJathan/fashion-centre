# Combined verification workflow

CI builds TypeScript/Vite, checks gzip budgets, runs Node domain tests, packages/tests Java, and runs isolated Playwright browser tests. It needs no real service credentials and performs no deployment.

Browser tests start Vite on 5174 and the explicit read-only test fixture on 8082. The fixture supplies only directory/readiness responses and rejects writes; individual cases mock catalogue/auth/photo/provider responses. This is frontend contract coverage, not real external-service validation. Java integration tests exercise the actual combined application with in-memory H2 and mocked external clients; MySQL Flyway migrations are not run against a real database.

The private-job merchant H2 migrations remain manual and separate from main's MySQL auth migration. Production startup still requires existing configuration; do not use fake credentials to bypass startup.

Run locally: `npm ci`, `npm run build`, `node scripts/check-bundle.mjs`, `npm test`, `mvn -B package` in backend, then `npm run test:ui`. Chrome is used locally; CI installs isolated Chromium.

Remote CI must be checked against the exact pushed commit before claiming it passed.
