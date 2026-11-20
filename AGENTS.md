# Working in Fashion Centre

Read [README.md](README.md) for setup and the code map. Use Node.js 24 and JDK 17. The root and `mobile/` have separate npm lockfiles. Use `npm ci` in the package you are changing.

- Run `npm test`, `npm run build`, and `npm run check:bundle` for web changes. Run `npm run test:ui` for browser interactions after installing Playwright Chromium.
- Run `mvn -B -f backend/pom.xml package` for backend changes. Add schema changes as a new forward Flyway migration. Experimental H2 scripts in `db/manual/` belong outside automatic MySQL migrations.
- Run `npm run typecheck` and `npm test` in `mobile/` for mobile changes. Run `npm run verify` when changing dependencies, imports, or bundling. An Expo export does not check native compilation or camera behavior.
- Web and mobile keep their own implementations of the API and commerce contracts. When a shared contract changes, check both clients and any stored data they already read.
- Use the local demo API for manual browsing and the isolated Playwright fixture for browser tests. Tests use synthetic data. Keep provider keys, database credentials, phone numbers, and personal photos outside committed files and client environment variables.
- Write browser test captures with `testInfo.outputPath()`. Historical screenshots and validation reports are reference material. Update current behavior in the root or component guides.

See the [verification guide](docs/verification.md) for commands, reserved ports, and coverage limits.
