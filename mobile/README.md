# Fashion Centre mobile

This Expo / React Native client supports Android and iOS. It includes a custom vision module for pose and image quality checks, so use a native development build. Use Node.js 24, JDK 17 and the Android SDK for Android. Use Xcode on macOS for iOS.

## Run on Android over USB

1. From the repository root, package and start the credential-free API.
   ```sh
   mvn -B -f backend/pom.xml package
   npm run dev:api
   ```
2. Connect and unlock the phone. Enable USB debugging, accept the trust prompt, and confirm that `adb devices` lists the phone as `device`.
3. Set the API origin in `mobile/.env.local`. If the file already exists, update just this setting.
   ```dotenv
   EXPO_PUBLIC_API_URL=http://127.0.0.1:8082
   ```
4. From a separate terminal in the repository root, install and run the mobile client.
   ```sh
   adb reverse tcp:8082 tcp:8082
   cd mobile
   npm ci
   npm run android -- --device
   ```
   Keep Metro, the demo API, and USB connected. Re-run the port forwarding command after reconnecting if needed.
5. Choose **Continue as guest** on the sign-in screen, then open **Choose a demo store**. Enable **Mock Shop** or **Elysian Thread** to populate the catalogue.

For iOS, configure a reachable API origin and run `npm run ios` on a Mac with Xcode. A physical iPhone requires signing configuration. For live account features on either platform, set `EXPO_PUBLIC_API_URL` to the configured backend HTTPS origin and restart Metro. This value is public and bundled with the app. Keep all secrets on the server. [Full backend setup](../backend/README.md)

The [design guide](../docs/design.md) describes the shared tokens, navigation and discovery controls.

## Code map

| Area | Files |
| --- | --- |
| App shell and deep links | [App.tsx](App.tsx), [navigation.ts](src/navigation.ts), [NavBar.tsx](src/NavBar.tsx) |
| Shopping and profile | [ShoppingScreens.tsx](src/ShoppingScreens.tsx), [CommerceHome.tsx](src/CommerceHome.tsx), [PersonalProfile.tsx](src/PersonalProfile.tsx), [SettingsScreens.tsx](src/SettingsScreens.tsx) |
| Data and storage | [state.tsx](src/state.tsx), [core/](src/core/) |
| Sign-in and photo flows | [AccountScreens.tsx](src/AccountScreens.tsx), [photo/](src/photo/), [image validation](src/photo/validation.ts) |
| Native vision | [Android ML Kit and iOS Apple Vision](modules/fashion-vision/) |

The demo keeps shoppers, carts, orders, and preferences on device. Camera readiness analysis runs on device. Account photo upload and provider jobs are separate actions that require a configured backend. Live sign-in, saved-photo delivery, and paid generation require their own device verification.

## Verify

```sh
npm run verify
npm run test:native-quality
```

Use `npm run android -- --device` or `npm run ios` to verify the generated native app on hardware. Check camera permissions, capture and cancellation, zoom, photo orientation, and app backgrounding on the device. See the [feature inventory](PARITY.md) and [original migration notes](../docs/history/NATIVE-MIGRATION.md) for context.
