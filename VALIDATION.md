# Validation — 18 October 2026

## Passed

- `npm run build`: TypeScript check and Vite production build. Final bundle: 263.65 kB JS / 81.47 kB gzip, 30.01 kB CSS / 7.06 kB gzip. Log: `frontend-build.log`.
- `npm test`: 8/8 passing. Existing domain checks plus cart merging/variant separation and maximum quantities, invalid quantities, repeat removal, per-brand checkout isolation, duplicate-checkout prevention, price snapshots, storage round trips and malformed-storage handling. Log: `unit-verification.log`.
- `mvn "-Dmaven.repo.local=.m2" -o -B test package` from `backend`: BUILD SUCCESS. 3/3 JUnit tests, zero failures/errors/skips. Report: `backend/target/surefire-reports/com.fashioncentre.CatalogueTest.txt`; log: `backend/build-verification.log`.
- Java regression rerun: `mvn "-Dmaven.repo.local=.m2" -o -B test` passed all 3 tests; log: `backend/regression-verification.log`. The Java API source and catalogue contract were unchanged by the commerce extension.
- `npm run test:ui`: 7/7 passing using installed Chrome, with shopping, commerce and complete checkout lifecycle at 390×844 and 1440×1000 and OTP simulation at 390×844, against the running Java-connected preview. Final run 49.7 seconds; log: `browser-verification.log`.
- Dedicated checkout lifecycle checks: empty checkout has no submit action; two sizes and repeated quantities appear in review; cancel leaves all persisted state unchanged; reloading review retains items; two immediate submit clicks create exactly one order; full UUID/timestamp/brand/size/quantity/colour/price snapshots are persisted; another brand's cart remains; order reload and Back/Forward create no duplicate; order-type filters distinguish user-created demos from supplied examples; a second brand checkout creates a different order and empties the remaining cart. No POST/PUT/PATCH/DELETE requests occurred during this journey.
- Commerce browser checks: initial/removed cart empty states; repeated adds; selected size; invalid zero quantity rejection; quantity increase and reload persistence; cross-brand cart grouping; separate checkout review and Back/Forward; local order completion/reload; repeat-checkout empty state; preservation of another brand's cart; removal/reload; sample order brand/status filters and empty state; profile preferences saved repeatedly and restored after reload; profile/order navigation; no horizontal overflow.
- OTP simulation checks: invalid phone, delivery failure, wrong code, expiry, resend cooldown, change number, demo success, cancellation, zero `/api/auth` requests, and no phone/OTP/token/session keys in browser storage. Phone and code remain only in component memory. OTP screenshots were visually inspected.
- Browser checks: all images decoded; no horizontal overflow; save/unsave/save; saved-item reload persistence; two-product brand scope; following; product open/close; Back/Forward; returning to six-product discovery; switching to a second brand; absence of video; keyboard vertical photo-feed scrolling; returning from try-on to the originating brand.
- Live read-only HTTP checks: `/api/health` returns `{"demo":true,"status":"ok"}`. Vite proxy `/api/products?brandId=violet` returns only `p1` and `p4`, at A$119 and A$79.
- Visually inspected phone discovery, brand storefront and try-on screenshots, plus desktop discovery. Exact approved campaign/denim images and navigation SVGs are local files and render successfully.
- Visually inspected new phone Cart, Orders, order detail and Profile screenshots, plus desktop Cart. Quantity buttons have 44px touch dimensions and totals explicitly use A$. New screens were implemented in the app; no Figma updates were made.
- Final runtime checks: frontend returned HTTP 200 at `http://127.0.0.1:5173`; Java health returned `demo: true, status: ok` at port 8081.

## Runtime

- Frontend: http://127.0.0.1:5173
- Java API: http://127.0.0.1:8081
- Both bind to loopback only. Started as hidden local processes; current PIDs are in ignored `local-processes.json`. Restart using `scripts/start-local.ps1` after stopping these specific processes, or use the individual commands in README.

## Limits and resolved issues

- A first sandbox build failed because esbuild could not read ancestor directory metadata. Scoped execution outside that restriction succeeded.
- After the user approved the newer Figma designs, old heading assertions were updated to check the new visible header identity. Navigation continued to work.
- One desktop attempt timed out during Chrome context startup, before page execution. A 60-second test allowance and a rerun passed both viewports.
- The photo feed uses browser-native touch scrolling and scroll snapping. Keyboard scrolling is automated; real phone gestures, Safari, Firefox, screen-reader traversal and broader accessibility audits were not tested.
- The earlier Library image could not be materialized because the supported helper required an unavailable Python runtime. The newer approved Figma screenshots and full design context were inspected and used. This responsive implementation extends those fixed frames; exact pixel identity is not claimed.
- Original photo commercial permissions are not established. Demo catalogue, profile, prices and try-on results remain illustrative. No real AI generation, payment, authentication, WhatsApp message, personal-photo upload or external service integration occurred.

## Screenshots

`screenshots/home-390.png`, `home-1440.png`, `brand-390.png`, `brand-1440.png`, `try-on-390.png`, `try-on-1440.png`, `otp-code-390.png`, `otp-success-390.png`.

Commerce: `cart-390.png`, `cart-1440.png`, `orders-390.png`, `orders-1440.png`, `order-detail-390.png`, `order-detail-1440.png`, `profile-390.png`, `profile-1440.png`, all inside `screenshots/`.

Checkout: `checkout-review-390.png`, `checkout-review-1440.png`, `checkout-confirmation-390.png`, `checkout-confirmation-1440.png`. Phone review and confirmation were visually inspected. Reference attachment `libfile_6fc0f1762c148191a41506f339f2841c` was read for extracted text. The supported materialization route returned a download transfer, but the required helper could not run because `py -0` confirmed no installed Python runtime. Reference pixels were not inspected; app screenshots were inspected instead.

## Commerce scope limits

Cart, sample orders and preferences persist only in this browser. Completing demo checkout is a local state transition, not a payment, reservation or real order. Shipping, taxes, live inventory, merchant checkout, order sync and tracking remain unconnected. Profile is a guest demo with no personal-data fields. The Java-backed demo catalogue remains in use; future authenticated commerce endpoints are documented in `COMMERCE-BOUNDARY.md`. Existing real-device/browser/accessibility limitations still apply.
