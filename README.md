# Fashion Centre

Fashion Centre is a multi-store Shopify marketplace. The React web app and Expo apps share a Cloudflare Worker API. Each participating store publishes its own catalogue and handles its own checkout, delivery and payment methods. Shopping preferences and baskets stay on the device. The Spring Boot API remains available for local demos.

[Open the marketplace](https://fashion-centre.fashion-centre-cloudflare.workers.dev) · [Cloudflare setup and merchant onboarding](cloudflare/README.md)

## Run the demo

Use Node.js 24, JDK 17, and Maven 3.9+. From the repository root on macOS, Linux, or WSL:

```sh
npm ci
mvn -B -f backend/pom.xml package
npm run dev:api
```

The credential-free API runs at `http://127.0.0.1:8082`. Reuse it if it is already running, or set `FASHION_DEMO_API_PORT` and use the same port in the client configuration. In another terminal, start the web client:

```sh
API_PROXY_TARGET=http://127.0.0.1:8082 npm run dev
```

Open [Fashion Centre](http://127.0.0.1:5173/), go to **Demo stores**, and onboard **Mock Shop** or **Elysian Thread**. The API reads the public sample catalogues, so product browsing requires internet access. For a physical phone, follow the [mobile setup](mobile/README.md#run-on-android-over-usb).

The demo supports catalogue browsing, local checkout, simulated OTP, and local photo preparation. Real account sign-in, photo storage, and provider try-on use the [full backend](backend/README.md). Vite proxies to the full backend on port 8081 by default.

## Find the code

| Area | Start here |
| --- | --- |
| Web | [Bootstrap](src/main.tsx), [app shell](src/App.tsx), [catalogue](src/CatalogueBrowser.tsx), [account](src/AccountScreen.tsx), [commerce](src/commerce.ts), [persistence](src/browserStorage.ts) |
| Mobile | [App entry](mobile/App.tsx), [navigation](mobile/src/navigation.ts), [state and storage](mobile/src/state.tsx), [photo pipeline](mobile/src/photo/), [native vision module](mobile/modules/fashion-vision/) |
| API | [Spring entry](backend/src/main/java/com/fashioncentre/Application.java), [public Shopify catalogue](backend/src/main/java/com/fashioncentre/shopify/), [account](backend/src/main/java/com/fashioncentre/auth/), [account photos and try-on](backend/src/main/java/com/fashioncentre/photo/) |
| Test and preview tools | [Unit tests](tests/), [browser tests](e2e/), [local scripts](scripts/), [CI workflow](.github/workflows/verify.yml) |

Add tests alongside the area you change. Run the checks in the [verification guide](docs/verification.md). For layout, theming and navigation, start with the [design guide](docs/design.md). [Asset provenance](docs/assets.md) records artwork and font sources. Earlier specifications are in the [historical notes](docs/history/README.md).
