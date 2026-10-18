import {defineConfig} from '@playwright/test';
const ci=!!process.env.CI;
export default defineConfig({testDir:'./e2e',workers:1,timeout:60000,forbidOnly:ci,retries:0,use:{baseURL:'http://127.0.0.1:5173',channel:ci?'chromium':'chrome',headless:true,trace:'retain-on-failure'},webServer:[{command:'npm run dev -- --port 5173 --strictPort',url:'http://127.0.0.1:5173',reuseExistingServer:!ci},{command:'java -jar backend/target/fashion-centre-api-0.1.0.jar',url:'http://127.0.0.1:8081/api/merchant/shopify/readiness',reuseExistingServer:!ci,timeout:60000}],reporter:'list'});
