# Fashion Centre API

The Spring Boot app serves public demo catalogues, shopper authentication, account photo storage, and the shopper try-on flow. Use JDK 17 and Maven 3.9+.

```sh
mvn -B package
```

For credential-free browsing, use `npm run dev:api` from the repository root after packaging. It starts the existing demo controllers on loopback port 8082. The public sample shops require no Shopify credentials. The demo starts without the MySQL, account, R2, and Pruna components.

## Full local API

Provision a separate MySQL database and user before first start. For the local JDBC defaults, create the `fashion_centre` database and provision the `fashion` user. Supply configuration in your shell or in the ignored `backend/secrets.properties` using Spring property names. [Application configuration](src/main/resources/application.properties)

| Setting | Purpose |
| --- | --- |
| `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `DB_PASSWORD` | MySQL connection and credentials |
| `AUTH_CODE_PEPPER` | Secret used when hashing one-time codes |
| `PRUNA_API_KEY` | Server-side try-on provider access |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Private account photo storage |

From `backend/`, run:

```sh
java -jar target/fashion-centre-api-0.1.0.jar --server.address=127.0.0.1
```

The packaged app listens on port 8081 by default. Secure session cookies require HTTPS for real device testing. For isolated local login testing, set `SPRING_PROFILES_ACTIVE=local-auth` and `AUTH_EXPOSE_DEV_CODE=true` with the API bound to loopback. The development response contains the one-time code and the server keeps it out of logs. Outside this mode, code requests return 503 until a real WhatsApp transport is configured. Demo purchases and merchant installation are disabled.

When a signed-in shopper starts a try-on using their saved photo, the API records an opaque prediction ID for that account before returning it. Status and result requests check the same account before reaching Pruna. The `V2__saved_photo_predictions.sql` migration creates this mapping. Jobs started by older versions have no recorded account ownership and their results are unavailable through the updated API. The legacy direct provider upload and submission endpoints have been removed.

Before serving real shoppers, validate the forward migration on MySQL, provider limits and result delivery against a test account, and the operational controls for retries, retention, and deletion. A provider acceptance followed by a lost response or failed local write is still an ambiguous submission. Automatic resubmission can incur another charge.

## Google and Shopify sign-in

Serve the web app and its `/api/` routes at the same public HTTPS origin. Set `AUTH_PUBLIC_ORIGIN` on the full backend and `EXPO_PUBLIC_API_URL` on the mobile app to that origin. The credential-free catalogue server supports the login UI and offline OTP preview. Provider login requires the full backend and the V3 Flyway migration.

Use the team account, `sattva.tech.team@gmail.com`, to manage the provider registrations. Substitute your HTTPS origin for `https://fashion.example` in the callback URLs below.

| Provider | Backend environment | Provider configuration |
| --- | --- | --- |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Create a **Web application** OAuth client, configure its consent audience and test accounts, and register `https://fashion.example/api/auth/sign-in/google/callback` as an authorized redirect URI. |
| Shopify | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | Configure a standalone Shopify app with the `read_products` scope, a permitted development store and the allowed redirect URL `https://fashion.example/api/auth/sign-in/shopify/callback`. The merchant enters the original `.myshopify.com` domain. |

The server exchanges provider codes. Web clients receive a secure HttpOnly session cookie. The iOS and Android clients open the system browser and return to `fashioncentre://auth/complete`. The app has 90 seconds to exchange the single-use grant with the verifier held by the initiating app. Restart sign-in if the app was closed during consent. Only the public origin goes in the mobile environment.

Google identifies shoppers by their verified subject. Returning Google sign-ins reuse the same account. Phone accounts retain their existing IDs and photos. Linking an independently created phone account to Google requires a separate account-linking flow. Shopify uses an online grant to identify the acting store user. The server discards the Shopify access token and issues a store-specific merchant session bounded by the grant expiry. Catalogue import requires the separate store installation flow, which is currently disabled.

To check a configured deployment, sign in, reload the account page, and sign out on each platform. Repeat Google sign-in to confirm the shopper's saved photo belongs to the same account. For Shopify, verify the domain on the dashboard and cancel a second attempt to check the return path. [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) · [Shopify standalone app authorization](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps) · [Expo WebBrowser](https://docs.expo.dev/versions/latest/sdk/webbrowser/)

## Code and data

- [auth/](src/main/java/com/fashioncentre/auth/) owns OTP and session state. [photo/](src/main/java/com/fashioncentre/photo/) owns account uploads and the shopper try-on API.
- [shopify/](src/main/java/com/fashioncentre/shopify/) maps the allowlisted public sources. [merchant/](src/main/java/com/fashioncentre/merchant/) contains installation readiness and inactive OAuth infrastructure.
- [tryon/](src/main/java/com/fashioncentre/tryon/) contains the separate private job foundation. That worker and its repository require explicit runtime wiring.
- [Flyway migrations](src/main/resources/db/migration/) apply automatically to MySQL. The [experimental H2 schemas](src/main/resources/db/manual/) are used explicitly in tests. Verify forward migrations on a development MySQL database before deployment.

Run `mvn -B package` for the Java suite. It uses H2 and mocked external clients. It does not validate production provider credentials or a MySQL migration against a live database.
