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

## Code and data

- [auth/](src/main/java/com/fashioncentre/auth/) owns OTP and session state. [photo/](src/main/java/com/fashioncentre/photo/) owns account uploads and the shopper try-on API.
- [shopify/](src/main/java/com/fashioncentre/shopify/) maps the allowlisted public sources. [merchant/](src/main/java/com/fashioncentre/merchant/) contains installation readiness and inactive OAuth infrastructure.
- [tryon/](src/main/java/com/fashioncentre/tryon/) contains the separate private job foundation. That worker and its repository require explicit runtime wiring.
- [Flyway migrations](src/main/resources/db/migration/) apply automatically to MySQL. The [experimental H2 schemas](src/main/resources/db/manual/) are used explicitly in tests. Verify forward migrations on a development MySQL database before deployment.

Run `mvn -B package` for the Java suite. It uses H2 and mocked external clients. It does not validate production provider credentials or a MySQL migration against a live database.
