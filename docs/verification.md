# Verification

The [GitHub workflow](../.github/workflows/verify.yml) runs independent web, backend, and mobile jobs on pushes to `main` and pull requests. The jobs use pinned lockfiles, Node.js 24, and JDK 17. They require no application credentials.

Run from the repository root:

```sh
npm ci
npm run build
npm run check:bundle
npm test
npx playwright install chromium
npm run test:ui
mvn -B -f backend/pom.xml package

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
| Maven | Java tests and packaging. Integration tests use H2 databases and mocked providers. |
| Demo API smoke check | A standalone Spring Boot preview starts on port 8082 without account, storage, or try-on service credentials. |
| Mobile verification | Type checking, runtime and component tests, both Metro exports, and the pure Java image quality tests |

Use a physical-device build for camera, file access, and app lifecycle changes. Test Flyway on a disposable MySQL instance before deploying a migration. Real WhatsApp delivery, R2, paid Pruna jobs, and merchant installation require their own test environment and authorized test data.

Earlier reports are in the [history folder](history/README.md). Check CI on the commit you intend to merge.

### Contributor build notifications

Every completed verification run posts its available iOS Simulator, web and Android downloads in the [build thread](https://github.com/AnishJathan/fashion-centre/issues/7). The workflow mentions GitHub accounts listed as human contributors and the author of an associated pull request. Comma-separated account IDs in the repository Actions variable `BUILD_EXCLUDED_ACCOUNT_IDS` apply to both contributor and pull request mentions. GitHub handles private email addresses. Contributors choose email delivery for participating and mentions in their [notification settings](https://github.com/settings/notifications). People whose commits are unlinked can subscribe to the thread or associate their commit email with their GitHub account.

Anyone with a download link can retrieve the file directly. The notification workflow verifies the Actions artifact digest, unwraps the Android APK and iOS Simulator ZIP, and publishes each file to a preview release. The dedicated Cloudflare download Worker streams those files as attachments. Each URL identifies a build and attempt. Deploy changes to the download handler with `wrangler deploy --config cloudflare/downloads/wrangler.jsonc` from the repository root.

To retry a missed announcement, run **Notify contributors of builds** on the default branch and enter its verification run ID. An already announced attempt is skipped.
