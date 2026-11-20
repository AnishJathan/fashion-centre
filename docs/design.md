# Interface design

Fashion Centre uses a warm paper background, russet actions and charcoal text in light mode. Dark mode uses espresso surfaces, cream text and clay accents. The browser can follow the system or save an appearance preference. The native preference is device-local.

| Change | Source |
| --- | --- |
| Colour, radii, spacing, motion durations | [Shared design tokens](../mobile/src/design.ts). Vite injects the tokens before the first paint. Expo reads the same values. |
| Navigation order, labels and icon paths | [Primary navigation](../mobile/src/primaryNavigation.ts), [native dock](../mobile/src/NavBar.tsx), [web shell](../src/App.tsx) |
| Theme and responsive layouts | [Web styles](../src/style.css), [catalogue](../src/catalogue.css), [native components](../mobile/src/ui.tsx) |
| Discovery photography, copy and actions | [Shared copy](../mobile/src/editorial.ts), [web cover](../src/EditorialCover.tsx), [native cover](../mobile/src/EditorialCover.tsx) |
| Native shopping filters and category layout | [CommerceHome](../mobile/src/CommerceHome.tsx) |

Use 16 units for phone gutters and 24 on larger screens. Use 8 between related controls, 16 between groups and 24 for sections and card corners. Chips, buttons and the navigation bar are pill shaped. Reserve at least 48 units for touch controls. Let labels wrap when system text grows.

The navigation footer has four equal destinations. A sand oval identifies the current icon. The opaque surface retains contrast over either theme. The scrolling viewport ends above the footer, which owns its safe-area inset. The native style helper opens from the header. On Discover, the category chips have their own horizontally scrollable row below search and filters.

Respect the system reduced-motion setting for page transitions, cover changes and tab feedback. Keep product and editorial images separate so a styling suggestion never substitutes for the selected product. Run [verification](verification.md) after changing either renderer.

## App icon

The header and launcher use the same [DM Serif Text F outline](../mobile/src/brandIcon.ts). Android applies the device mask to the transparent foreground and uses its alpha channel for themed icons. iOS applies its own mask to the opaque 1024-pixel light, dark and tinted images. The browser uses a theme-aware SVG favicon and an Apple touch icon. After editing the mark or brand colours, run `node scripts/generate-app-icons.mjs` from the root with Playwright Chromium installed, then sync the native resources with `npm run prebuild -- --no-clean` in `mobile/`.

## Release verification

The local demo exposes sample Shopify catalogues and local shopping. Production phone sign-in, account-photo storage and Pruna jobs require the configured HTTPS backend. Live Shopify installation and Google/Apple sign-in are outside the current client integration. Before store submission, verify the live account, merchant and photo flows with the intended services, complete consented physical-device camera checks, and build with the distribution identities and backend origin for that release.
