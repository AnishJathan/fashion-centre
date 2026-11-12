# Native migration handover

11 November 2026

## Deliverable

The new `mobile/` directory contains a React Native/Expo iOS and Android client. Existing web and Java backend source is retained unchanged. Start with `mobile/README.md` for configuration and feature coverage.

The source snapshot was materialized from public repository `AnishJathan/fashion-centre`, revision `f0406c8518de4c6ac8b22a4129c171b0e78f24d5`. Historical screenshot files are not part of this source archive. No branch was pushed, PR opened or deployment performed for this source revision. Native implementation work ran in the cloud; the separate local web demo is unchanged by this UI revision.

## Verified

- Native TypeScript check: passed.
- Native pure/mock tests: 97 passed. These cover commerce, currency semantics, catalogue parsing and independent failures, storage queue/recovery, navigation, photo validation, bounded polling, duplicate-request reservation, route parity, automatic capture, cancellation cleanup permission-sheet handling, mobile layout/contrast, real-screen mocked callbacks, settings choices, OTP simulation, cancelled upload confirmations, refocus completion and shared UI component behavior.
- Pure Java image-quality algorithm: 28 synthetic assertions passed.
- Local native module autolinking: iOS and Android discovered successfully.
- Expo native project generation: iOS and Android passed (`--no-install`, not native compilation).
- iOS Metro/Hermes bundle export: passed.
- Android Metro/Hermes bundle export: passed.
- Existing web TypeScript/Vite production build: passed.
- Existing web gzip budget: passed (140,503 JavaScript bytes / 160,000 budget; 11,498 CSS bytes / 12,000 budget).
- Existing web unit tests: 35 passed.

## Not verified or blocked

- iOS/Android native compilation, installation and physical-device interaction were not run. Exported JavaScript is not an APK or IPA.
- Browser interaction suite could not start a browser in this cloud environment. The original Chrome target was unavailable; the installed Chromium launch failed with `socket() failed: Operation not permitted`. No browser interaction pass is claimed.
- Backend Maven tests were not run because Maven is not installed here. Backend source is unchanged.
- Live account transport, cookie persistence, authenticated photo display, photo upload, R2 storage and paid Pruna generation were not exercised. Test data was synthetic; no personal photo was uploaded.
- Camera auto-capture, pose, brightness and sharpness implementations are now present, but their Swift/Kotlin compilation and physical-device behavior are unverified. Apple Vision and ML Kit confidence/resampling differ from web MediaPipe; thresholds require real device calibration. Expo Go does not contain the custom module.
- Server-side try-on idempotency across app restarts, native download redirects, accessibility and release performance still require work/testing.

## Mobile UI revision

All 17 native route families received consistent mobile layouts, larger accessible controls, icon navigation, keyboard-aware forms, responsive catalogue/preview sizing and clearer feedback. `mobile/UI-REFINEMENT.md` inventories the changes. Native pixel rendering, physical-device accessibility and performance have not been certified; the UI checks are layout calculations and mocked component interactions.

## Package versions

Expo `~58.0.23`, React `19.3.0`, React Native `0.88.1`, TypeScript `~6.0.3`. Versions were taken from the current official Expo TypeScript template and Expo's bundled compatibility table. `mobile/package-lock.json` pins the resolved dependency graph.

Every original client route family has a native implementation; `mobile/PARITY.md` inventories the behavior and test coverage. This does not claim every device flow has passed.

The next useful step is to build this source on an authorized iOS/Android development machine, connect it to the existing HTTPS test backend, and execute the device checklist in `mobile/README.md`. Keep live merchant installation, purchases and provider spending separate from migration verification.
