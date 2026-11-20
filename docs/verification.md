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

### Contributor build emails

After each completed **Verify Fashion Centre** run, **Email contributor builds** sends one message from sattva.tech.team@gmail.com with links to the iOS Simulator app, web distribution and Android APK. Failed and cancelled builds include any available downloads and a link to the logs. GitHub sign-in and repository access are required for downloads.

In Settings → Secrets and variables → Actions, set the repository secret `BUILD_MAIL_RECIPIENTS` to the contributor mailing list or comma-separated email addresses. Maintain this list when the team changes. Set `BUILD_MAIL_PASSWORD` to a Gmail app password for the sender. The notification workflow runs from the default branch, including when the build originated on a pull request. A delivery failure appears as a separate failed notification run.
