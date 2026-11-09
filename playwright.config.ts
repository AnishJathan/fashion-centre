import {defineConfig} from '@playwright/test';
const ci=!!process.env.CI;
export default defineConfig({testDir:'./e2e',workers:1,timeout:60000,forbidOnly:ci,retries:0,use:{baseURL:'http://127.0.0.1:5174',channel:ci?'chromium':'chrome',headless:true,trace:'retain-on-failure'},webServer:[{command:'npm run dev -- --port 5174 --strictPort',url:'http://127.0.0.1:5174',env:{API_PROXY_TARGET:'http://127.0.0.1:8082'},reuseExistingServer:false},{command:'node scripts/e2e-api.mjs',url:'http://127.0.0.1:8082/api/merchant/shopify/readiness',reuseExistingServer:false}],reporter:'list'});
