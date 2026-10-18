# Fashion Centre — local prototype

Independent React + TypeScript frontend with Vite and a Java/Spring Boot demo API. No DAT assessment files were used or changed.

## Run on this laptop

From this directory:

```powershell
npm ci --cache .npm-cache
npm run dev
```

Open http://127.0.0.1:5173. In another terminal:

```powershell
cd backend
mvn "-Dmaven.repo.local=.m2" test package
java -jar target/fashion-centre-api-0.1.0.jar
```

Java API: http://127.0.0.1:8081/api/health. The frontend calls `/api/products` through Vite's development proxy, falling back to the bundled demo catalogue if the API is unavailable. Both modes use fictional demo data; the desktop announcement reports which mode loaded. `npm run preview` serves the built frontend at http://127.0.0.1:4173 with the same bundled fallback.

The current verified preview can be restarted with `powershell -File scripts/start-local.ps1` after stopping the specific processes listed in `local-processes.json`. See `VALIDATION.md` for final results and limitations, and `AUTH-BOUNDARY.md` for the latest outbound WhatsApp OTP direction.

## Implemented

- Responsive discovery, search, category/vibe filters, photographic banners and category circles.
- Three fictional brand storefronts with separate product scope, identity colours, follow state, and return/switch controls.
- Product detail, demo size selection, reversible saved items and followed brands in browser localStorage.
- Full-height, vertically snapping **still-photo** inspiration feed. Touch scrolling and keyboard arrows; no video, personal uploads or generated results.
- Hash navigation supports browser Back/Forward and direct URLs. Product detail is a page, not a modal; Escape returns to browsing.
- Empty states and storage-unavailable feedback. Profile clearly states that no account or cloud sync exists.
- Outbound WhatsApp OTP **UI simulation** from Profile: phone/code forms, resend cooldown, change number, invalid/expired code, simulated delivery failure, cancellation and demo success. No message, authentication request, account or session is created. Use the displayed demo code only to review screen transitions.
- Cart with product/size variants, repeated-add merging, bounded quantity editing, remove/empty states, browser persistence and brand-separated subtotals/checkouts.
- Explicit demo checkout review creates a local sample order and clears only the selected brand's cart. No payment or store redirection occurs.
- Orders list grouped by brand, brand/status filters, empty states and sample order details with illustrative progress. Includes three fixtures and local demo checkout records.
- Redesigned guest Profile with cart/orders/saved counts, followed brands and local style/fit preferences. No personal details are collected or transmitted.

## Validation commands

```powershell
npm run build
npm test
npm run test:ui
cd backend
mvn "-Dmaven.repo.local=.m2" test package
```

Browser tests use the laptop's installed Chrome; no Playwright browser download is required. Screenshots are written to `screenshots/`. Tests cover 390×844 and 1440×1000 layouts, image loading, horizontal overflow, repeated saves, persistence, following, brand isolation, product navigation, Back/Forward and keyboard photo scrolling. Real-device touch behaviour and other browsers require separate validation.

Commerce tests additionally cover repeated cart actions, size variants, invalid quantities, brand-separated demo checkout, repeat-checkout protection, sample orders and filters, empty states, reload and Profile preference persistence. New screens: `/#/cart`, `/#/orders`, `/#/profile`; add to cart from a product detail page.

To place a demo order: open a product, select its size, **Add to cart**, open **Bag**, choose that brand's **Demo checkout**, review the items, then select **Place demo order**. The order detail opens immediately with a full unique ID and timestamp. **View all orders** opens history; choose **Your demo orders** to hide the supplied sample examples. Only that brand's cart items are cleared. Cancelling leaves the cart unchanged. No payment details, Shopify requests or personal information are involved.

## Architecture and next integration boundaries

`src/domain.ts` defines Brand, Product, CatalogueGateway, demo/http catalogue adapters and an explicitly simulated TryOnResult. `src/main.tsx` owns the shopper UI; `src/approved.css` translates approved Figma frames into responsive layouts. `backend/` is Spring Boot 3.5.16, compiled for Java 17 and verified with installed JDK 19/Maven 3.9.11. Spring's official requirements: https://docs.spring.io/spring-boot/3.5/system-requirements.html. Prefer an LTS JDK for subsequent production work; none was installed for this prototype.

API routes: GET `/api/health`, `/api/brands`, `/api/products?brandId=violet`, `/api/products/{id}`. Unknown brands/products return 404; filtering is enforced by the server. There is no Node application backend: Vite only serves frontend development assets and proxies to Java. The API is loopback-bound, read-only and deliberately unauthenticated because every record is public fictional demo data.

Future backend work: verified merchant catalogue ingestion, server-side publication/tenant rules, authenticated shopper persistence, variant/price revalidation, private photo storage and consent, bounded asynchronous try-on jobs, and provider secrets stored only on the server. No integration readiness or production security is claimed by this demo.

## Design and assets

Approved Figma baseline: https://www.figma.com/design/QRfAgtOkBDGTbgmwtjDljZ?node-id=11-34 (Discover 11:35; Brand Centre 11:78; storefront 11:122; photo feed 11:168). Downloaded actual campaign/denim imagery and five navigation icons from the design. Responsive adaptation omits fake phone status bars, adds real controls and demo disclosures, and extends discovery below the first screen for categories, vibes and additional products. It is not a pixel-perfect implementation of fixed-size Figma frames.

The older Library brief was read. The original approved Library image could not be materialized because its supported metadata helper needs Python, unavailable on this laptop. The later user-approved Figma screenshots and full design context were inspected instead.

See `ASSETS.md` for provenance and `COMMERCE-BOUNDARY.md` for cart/order/profile behaviour and future Java boundaries. All prices, inventory, labels, order statuses and try-on photos are illustrative. No live checkout, authentication, Shopify, Pruna, WhatsApp, database, paid service, deployment, or personal-photo handling is connected. New Cart, Orders and Profile screens were implemented in the application; no Figma updates are claimed.
