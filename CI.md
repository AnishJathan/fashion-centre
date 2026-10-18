# Verification workflow

`.github/workflows/verify.yml` is a local, unpushed GitHub Actions configuration. It has not executed on GitHub. It runs frontend build/unit checks, gzip regression budgets, Java tests/package, and Playwright browser regressions. It contains no deployment, publication, provider setup, production credentials, or public-catalogue smoke step.

The workflow uses read-only repository permission, disables persisted checkout credentials, pins official actions to commit IDs, cancels superseded runs, and has a 15-minute timeout. Pull-request code runs without repository secrets; it does not use `pull_request_target`. Node 24 and Java 17 match the project's supported build targets. CI installs Chromium into the isolated hosted runner; the laptop continues using its existing Chrome installation with no browser download.

Local equivalents:

```powershell
npm run build
node scripts/check-bundle.mjs
npm test
npm run test:ui
```

From `backend`: `mvn '-Dmaven.repo.local=.m2' -o -B package`.

Build the backend JAR before the browser suite. Playwright starts the frontend and packaged loopback API when they are absent and waits for the readiness endpoint before testing. Local runs may reuse the existing app processes; CI never reuses an unrelated server. Most browser scenarios stub catalogue responses; owner-dashboard checks exercise the real disabled readiness API. The suite does not need live provider credentials or public catalogue network access.

CI runs `npm ci` against the committed lockfile and resolves Maven dependencies on the hosted runner. Local Maven verification uses the existing offline cache. The workflow YAML was parsed using the existing cached SnakeYAML library with duplicate keys rejected. This is syntax validation, not evidence of successful GitHub execution. Linux/Java 17/CI Chromium remain to be verified by an authorized future push and actual run.

The JavaScript gzip budget is 110,000 bytes and CSS budget 12,000 bytes, measured from built assets. These guard accidental bundle growth; they do not measure real-user loading speed, remote image latency, device memory, or a production performance SLA. Browser regressions separately bound viewer image requests, preserve the selected photo on viewport resize, and verify modal keyboard/reduced-motion behavior. They are targeted accessibility checks, not a WCAG certification or screen-reader audit.

Action references were resolved from official public repositories on 18 October 2026. Configuration follows the [official Playwright CI guidance](https://playwright.dev/docs/ci), [setup-node](https://github.com/actions/setup-node), [setup-java](https://github.com/actions/setup-java), and [checkout](https://github.com/actions/checkout) interfaces.
