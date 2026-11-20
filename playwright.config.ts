import { defineConfig } from '@playwright/test';

const webUrl = 'http://127.0.0.1:5174';
const apiPort = 18082;
const apiUrl = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
    testDir: './e2e',
    workers: 1,
    timeout: 60_000,
    forbidOnly: Boolean(process.env.CI),
    use: {
        baseURL: webUrl,
        channel: 'chromium',
        trace: 'retain-on-failure',
    },
    webServer: [
        {
            command: 'npm run dev -- --port 5174 --strictPort',
            url: webUrl,
            env: { API_PROXY_TARGET: apiUrl },
            reuseExistingServer: false,
        },
        {
            command: `node scripts/e2e-api.mjs ${apiPort}`,
            url: `${apiUrl}/api/merchant/shopify/readiness`,
            reuseExistingServer: false,
        },
    ],
    reporter: 'list',
});
