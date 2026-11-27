# Fashion Centre on Cloudflare

The Worker serves the built React storefront and routes every /api request. Web and native share the merchant directory. D1 stores merchant publication state, customer identities, expiring sessions and single-use authentication grants. Basket contents stay on the client. Shopify handles payment, tax, delivery options and final inventory checks separately for each basket.

## Development and deployment

From the repository root, run the following commands with Node.js 24.

```sh
npm ci
npm run build
cd cloudflare
npm ci
npx wrangler d1 migrations apply fashion-centre --local
npm test
npm run dev
```

For deployment, verify the team identity with `npx wrangler whoami`, apply pending D1 migrations with `--remote`, then run `npm run deploy`. Build the web assets again after web changes. Set EXPO_PUBLIC_API_URL in mobile/.env.local or the native build environment to the public HTTPS origin and restart Expo. Local Worker secrets belong in .dev.vars. Use Wrangler secrets for production.

## Provider setup

- Set AUTH_PUBLIC_ORIGIN to the exact HTTPS Worker origin. Register its /api/auth/sign-in/google/callback URL with Google and configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the Worker.
- For Sign in with Apple, register the Worker hostname and `/api/auth/sign-in/apple/callback` return URL under the team's Apple Services ID. Associate that Services ID with the app and create a Sign in with Apple key. Configure `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` on the Worker. Apply the D1 migrations before deploying. The web and native clients show the Apple option when the Worker reports that these credentials and the public origin are configured. Apple uses the same shopper session and a separate identity from Google and phone sign-in. [Apple setup documentation](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple)
- Create the Shopify app in the team Dev Dashboard. Use its client ID and public origin to generate the CLI configuration with `AUTH_PUBLIC_ORIGIN=... SHOPIFY_CLIENT_ID=... node shopify-config.mjs`. Configure SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET on the Worker. Review and deploy the generated Shopify app configuration using the team's Shopify CLI. Test installation on a development store before applying for multi-merchant distribution.
- A store owner opens **For stores**, authorizes their shop, then publishes the storefront. The public directory includes published stores. The catalogue reads products available through Shopify’s Storefront API. The current first page contains up to 48 products and 100 variants per product. Signed uninstall and shop erasure events remove the store and invalidate its owner sessions.
- WhatsApp authentication needs OTP_SECRET, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID and WHATSAPP_TEMPLATE. WHATSAPP_LANGUAGE is optional. Try-on needs PRUNA_API_KEY, the IMAGES binding and the private PHOTOS R2 binding. Account photos use the private fashion-centre-private-photos bucket. The Worker validates and re-encodes uploads through IMAGES, then serves them through authenticated account routes. Keep public bucket access disabled.

## Verification

Check /api/integrations/shopify/status for the public directory and /api/merchant/shopify/readiness for provider configuration. An anonymous request to /api/auth/me returns 401. Worker tests run against ephemeral local D1. They verify publication, basket isolation, signed Apple and Google identity exchange, private photo upload, and try-on result ownership. A live installation, authenticated provider round trip and test checkout require provider configuration and a development store.

The marketplace directory includes Mock Shop and Elysian Thread preview collections. Their bundled product and variant snapshots come from the public GraphQL endpoints at mock.shop/api and apparel.mock.shop/api. The preview flag makes both visible on first launch. Their baskets use the local demo checkout.
