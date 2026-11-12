# Fashion Centre for iOS and Android

A React Native client for the existing Fashion Centre application. The original Vite web client and Java backend remain unchanged in the repository root and `backend/`.

This includes native implementations of the retained client route families, including on-device pose/quality checks and automatic capture. It is **not a device-certified or store-ready release**: the Swift/Kotlin integrations still require compilation and device validation. See `PARITY.md` for the flow-by-flow inventory and the verification limits below.

## Start

Requirements: Node.js 24, npm, and a custom development/release build compatible with Expo SDK 58. Expo Go cannot run the custom native vision module. iOS requires macOS/Xcode (deployment target 16.4+); Android requires its SDK/toolchain.

```sh
cd mobile
npm ci
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your existing backend HTTPS origin.
npm run android  # Or npm run ios on a Mac with Xcode
```

Use an HTTPS origin reachable by the phone, such as `https://your-api.example`. A phone's `localhost` is the phone itself. HTTP loopback is permitted by the client only during development; the backend's Secure authentication cookie still requires a suitable HTTPS deployment for account flows. Production builds reject insecure API origins. Rebuild/restart Metro after changing public environment variables.

`EXPO_PUBLIC_API_URL` is public and bundled into the app. Do not put Pruna, Shopify, R2, database, auth, signing or payment secrets in any `EXPO_PUBLIC_*` variable. All existing service credentials remain on the backend.

```sh
npm run android     # Generate/build locally with Android SDK available
npm run ios         # Generate/build locally on macOS with Xcode available
npm run typecheck
npm test
npm run export      # iOS and Android Metro/Hermes bundles, not APK/IPA packages
```

No developer account, signing certificate, deployment or EAS service is configured. `com.fashioncentre.preview` is a provisional development identifier; choose owned release identifiers before publishing. The existing root web app remains the web implementation; this native package deliberately does not add a React Native Web preview dependency.

## Mobile UI

The thin glass-style floating capsule has four destinations: Home, Try On, Bag and You. Bag includes the functional Orders view. A separate colourful orb opens a clearly labelled, local rule-based style helper using only loaded catalogue data. It does not contact an AI service, upload photos or generate results.

Home uses small circular brand links with original monograms, names below and adjacent Discover, an expandable search icon beside category and filter controls, electric ocean blue, citrus, coral and mint colours on crisp light or deep-ink surfaces and product rails. The search-row Try On shortcut and promotional home carousel are removed; product and storefront Try On remain. Each store keeps its own themed UI and scoped shopping flows. SVG icons avoid missing-font squares.

You is a personal profile with a gallery of genuine successful try-ons from the verified account’s current app session. The backend has no historical list endpoint, so older account history is not claimed. The top gear opens retained settings. Failed identity checks hide private results; the session index clears on logout/account changes or process exit. Server-side ownership/privacy hardening is still needed for production.

Wishlist UI and save actions remain removed; stored saved-product records and backup data are unchanged. Saved account photos and Try On are separate. Window resizing and safe-area layouts cover narrow and unfolded windows, but physical hinge detection and real-device certification are not implemented. See `EXPERIENCE-REDESIGN.md` for boundaries.

## Implemented client flows

- Explicit public demo-store onboarding, enable/disable, independent directory/catalogue loading, retry and empty states.
- Product search, store/category filters, sorting, Brand Centres and brand-scoped navigation.
- Variants, followed stores, catalogue photo browsing and unavailable reference preservation.
- Per-store demo cart and checkout, quantity bounds, currency-aware amounts, durable local order snapshots, all-store history.
- Personal profile, separate settings, light/dark/device appearance, private backup sharing and malformed-record recovery.
- Real backend account/WhatsApp OTP interface, saved-photo upload/replace and logout, separate from a no-network OTP simulation.
- Camera/library selection, type/size/dimension checks, local-only preparation with garment readiness and both acknowledgements.
- Native full-body, exposure and sharpness analysis, with sustained-good-pose automatic camera capture. Apple Vision and bundled Android ML Kit keep inference on the device. Custom native module availability is checked explicitly.
- Explicitly confirmed saved-photo try-on with the existing provider endpoints, bounded polling and protection against concurrent duplicate submissions within one app process.
- Merchant domain validation and readiness. Real merchant installation and purchases remain disabled, as in the existing backend.
- Native stack navigation, back handling, safe areas and `fashioncentre://` deep links. Brand context is carried in route parameters.

The app never sends OTP messages, uploads photos, submits a try-on or starts merchant authorization simply because it launches. Catalogue/readiness reads use only the configured backend. Photo and generation actions require deliberate interaction in their separate screens.

## Native vision module

`npm run android` / `npm run ios` generates the native projects and links the local module. Both platform implementations accept only bounded files inside the app sandbox. They correct orientation, downsample before inference, calculate image quality and return normalized body landmarks. The camera checks one frame at a time, waits for several good observations over at least 1.4 seconds, captures and checks a full-resolution photo, and removes abandoned frames. No person image is sent to a remote inference service by the scanner.

No microphone recording is requested. Backgrounding or leaving the scanner cancels its JavaScript session; late captures are discarded. System permission sheets are handled separately from a true background transition.

## Important remaining work

1. **Native build and vision calibration:** `modules/fashion-vision` contains actual Swift/Apple Vision and Kotlin/bundled ML Kit implementations. Expo discovers both, and native project generation succeeds, but Xcode/Android SDK compilation and camera/device inference were not available here. Models, confidence semantics and resampling differ from browser MediaPipe. Validate the retained thresholds (brightness 50–220, sharpness 40 live/120 final, nine joints >0.5 and inside frame margins) with consented device photos before release. Missing native modules fail closed for account-photo checks; Expo Go is not a fallback for them.
2. **Real device validation:** camera permission/revocation, photo formats/orientation, iOS/Android multipart transport, authenticated image loading, Secure HttpOnly cookie persistence and logout need device tests. Session cookies are not copied into AsyncStorage; native cookie behavior is not certified by bundle export.
3. **Provider reliability:** an uncertain request is locked against repeat submission for that garment during the current app process. Process death loses that lock. The existing backend needs server-side idempotency and a recoverable private-job API before duplicate-billing safety can be guaranteed. Leaving/backgrounding stops polling, not an already accepted provider job. Native download redirect behavior also needs device validation/hardening.
4. **Server readiness:** conversion does not configure WhatsApp transport, MySQL, R2, Pruna, merchant OAuth or production hosting. Existing backend authorization/privacy and readiness limitations remain. No real OTP, personal-photo upload or paid generation was used for verification.
5. **Release QA:** native builds, installation, accessibility/screen-reader and performance checks, store signing/review and production end-to-end testing are still required.

Browser-local records are not automatically transferred to native storage. Existing keys and backup format are retained, but this port does not claim cloud sync or add a backup-import feature absent from the original client. Temporary previews are cleared on navigation; originals in the photo library are not deleted.

## Structure

- `App.tsx`: native navigation and app shell.
- `src/ShoppingScreens.tsx`: catalogue, product, cart, demo checkout, orders and photos.
- `src/SettingsScreens.tsx`: settings, appearance and merchant readiness.
- `src/PersonalProfile.tsx` and `src/profileSession.ts`: account-verified session gallery.
- `src/StyleAssistant.tsx` and `src/styleAssistant.ts`: local-only catalogue chat helper.
- `src/AccountScreens.tsx`: account, isolated simulation, preparation and provider workflow.
- `src/state.tsx`: durable app state and independent catalogue loading.
- `src/core/`: native-safe domain/reducer/validation/storage/API helpers. No runtime imports from the browser client.
- `src/photo/`: automatic scanner, native bridge, bounded image handling, validation, local preparation, polling and request reservation.
- `modules/fashion-vision/`: Swift/Apple Vision and Kotlin/ML Kit modules plus pure Java quality metrics.
- `tests/native-java/`: synthetic pixel tests of the Android quality algorithm (`npm run test:native-quality` with a JDK).
- `tests/`: pure/mock tests that do not send real OTPs, upload personal photos or invoke providers.

Core logic was ported from source revision `f0406c8518de4c6ac8b22a4129c171b0e78f24d5` of `AnishJathan/fashion-centre`. Currency minor units are a generated ICU table so missing `Intl.supportedValuesOf` support cannot prevent Hermes startup.

## Verification performed

See `../NATIVE-MIGRATION.md` for the exact verification outcome and limits. Passing unit tests or Metro exports is not evidence that a native app has been installed or that live services work.
