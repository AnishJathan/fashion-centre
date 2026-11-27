# Verification

The [GitHub workflow](../.github/workflows/verify.yml) runs independent web, Java, Cloudflare and mobile jobs on pushes to `main` and pull requests. The jobs use pinned lockfiles, Node.js 24, and JDK 17. They require no application credentials.

Run from the repository root:

```sh
npm ci
npm run build
npm run check:bundle
npm test
npx playwright install chromium
npm run test:ui
mvn -B -f backend/pom.xml package
npm ci --prefix cloudflare
npm test --prefix cloudflare

cd mobile
npm ci
npm run verify
npm run test:native-quality
```

| Check | What it covers |
| --- | --- |
| Web build and bundle check | Type checking and production compilation within the aggregate gzip budgets |
| Node tests | Catalogue, routing, storage, commerce, and local photo preparation |
| Playwright | Browser interactions with Vite on port 5174 and a read-only fixture on 18082. Specs supply catalogue, auth, photo, and provider responses. Captures go to the ignored `test-results/` directory. |
| Maven | Java tests and packaging. Most integration tests use H2 and mocked providers. CI also checks an upgrade from V3 on a disposable MySQL 8.4 database, including legacy accounts, saved photos and merchant registration. |
| Cloudflare | Local D1, session handling, provider callbacks, store publication, photo storage, and try-on fixtures. |
| Demo API smoke check | A standalone Spring Boot preview starts on port 8082 without account, storage, or try-on service credentials. |
| Mobile verification | Type checking, runtime and component tests, both Metro exports, and the pure Java image quality tests |

The browser imports existing shopping records into an IndexedDB snapshot on first load. Store and checkout changes check that snapshot while holding the same Web Lock. The local storage mirror supports existing backups and tab notifications. A failed save keeps the previous basket, and startup preserves a recovery copy before repairing a divergent mirror.

Use a physical-device build for camera, file access, and app lifecycle changes. Check the target Flyway history before deploying migrations. An installation that applied the conflicting merchant versions from the short-lived V2–V6 ordering needs a separately validated reconciliation. The upgrade test covers databases using the original V1–V3 ordering. To run it locally, set `FASHION_TEST_MYSQL_URL` to an empty loopback MySQL database named `fashion_migration_test` and supply the test user and password through `FASHION_TEST_MYSQL_USER` and `FASHION_TEST_MYSQL_PASSWORD`. Real WhatsApp delivery, R2, paid Pruna jobs, and merchant installation require their own test environment and authorized test data.

Earlier reports are in the [history folder](history/README.md). Check CI on the commit you intend to merge.

### Contributor build notifications

Every completed verification run posts its available iOS Simulator, web and Android downloads in the [build thread](https://github.com/AnishJathan/fashion-centre/issues/7). The workflow mentions GitHub accounts listed as human contributors and the author of an associated pull request. Comma-separated account IDs in the repository Actions variable `BUILD_EXCLUDED_ACCOUNT_IDS` apply to both contributor and pull request mentions. GitHub handles private email addresses. Contributors choose email delivery for participating and mentions in their [notification settings](https://github.com/settings/notifications). People whose commits are unlinked can subscribe to the thread or associate their commit email with their GitHub account.

Anyone with a download link can retrieve the file directly. The notification workflow verifies the Actions artifact digest, unwraps the Android APK and iOS Simulator ZIP, and publishes each file to a preview release. The dedicated Cloudflare download Worker streams those files as attachments. Each URL identifies a build and attempt. Deploy changes to the download handler with `wrangler deploy --config cloudflare/downloads/wrangler.jsonc` from the repository root.

To retry a missed announcement, run **Notify contributors of builds** on the default branch and enter its verification run ID. An already announced attempt is skipped.
