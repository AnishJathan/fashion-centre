# Interface design

Fashion Centre uses a warm paper background, russet actions and charcoal text in light mode. Dark mode uses espresso surfaces, cream text and clay accents. The browser can follow the system or save an appearance preference. The native preference is device-local.

| Change | Source |
| --- | --- |
| Colour, radii, spacing, motion durations | [Shared design tokens](../mobile/src/design.ts). Vite injects the tokens before the first paint. Expo reads the same values. |
| Navigation order, labels and icon paths | [Primary navigation](../mobile/src/primaryNavigation.ts), [native dock](../mobile/src/NavBar.tsx), [web shell](../src/App.tsx) |
| Theme and responsive layouts | [Web styles](../src/style.css), [catalogue](../src/catalogue.css), [native components](../mobile/src/ui.tsx) |
| Discovery photography, copy and actions | [Shared copy](../mobile/src/editorial.ts), [web cover](../src/EditorialCover.tsx), [native cover](../mobile/src/EditorialCover.tsx) |
| Native shopping filters and category layout | [CommerceHome](../mobile/src/CommerceHome.tsx) |

Use DM Serif Text for editorial and page headings. Use Inter for body copy, product information, buttons, inputs, and navigation. Both clients load the same local font assets. In native screens, import Text and TextInput from Typography to preserve the shared weight mapping and system text scaling.

Use 16 units for phone gutters and 24 on larger screens. Use 8 between related controls, 16 between groups and 24 for sections and card corners. Use 12-unit corners for buttons and fields, 6 for checkbox indicators, and pills for the bottom navigation dock, its selected indicator, and compact badges. Home leads with search, categories and store entrances. Inside a store, keep its name visible alongside marketplace navigation. Reserve at least 48 units for touch controls. Let labels wrap when system text grows.

For web layouts at least 1024 CSS pixels wide with a fine pointer and hover, [desktop styles](../src/desktop.css) place shopping filters and store entrances beside the collection. Profile and try-on panels use two columns. Keep the catalogue reading order usable when these columns collapse.

Place Back and store-return controls in the second row beneath the screen title. Omit this row on root screens without a return destination.

The navigation footer has four equal destinations. A sand oval identifies the current icon. A tinted glass pill floats over scrolling content. Supported iPhones use the system Liquid Glass material. Android blurs the viewport behind the dock on API 31 and later. The web selection lens slides between destinations, while native selections expand into a softly lit capsule. The selected tab stretches briefly and settles. Both renderers reserve the dock height and system inset at the end of the scroll area. Reduced transparency uses a solid surface. On cold launch, two fine elliptical lines settle around the app monogram while the interface initializes. Reduced motion shows the static mark. The native style helper opens from the header. On Discover, the category chips have their own horizontally scrollable row below search and filters.

Respect the system reduced-motion setting for page transitions, cover changes and tab feedback. Let the outer card clip its thumbnail. Use a centered cover crop and apply padding to the caption. Full-screen catalogue photos and personal photo reviews show the complete image. Keep product and editorial images separate so a styling suggestion never substitutes for the selected product. Run [verification](verification.md) after changing either renderer.

## App icon

The header and launcher use the same [DM Serif Text F outline](../mobile/src/brandIcon.ts). Android applies the device mask to the transparent foreground and uses its alpha channel for themed icons. iOS applies its own mask to the opaque 1024-pixel light, dark and tinted images. The browser uses a theme-aware SVG favicon and an Apple touch icon. After editing the mark or brand colours, run `node scripts/generate-app-icons.mjs` from the root with Playwright Chromium installed, then sync the native resources with `npm run prebuild -- --no-clean` in `mobile/`.

## Release verification

The shopper screen offers Google and WhatsApp with a searchable country-code picker. The merchant dashboard uses Shopify Admin sign-in. Web, iOS and Android use the same country choices and calling-code validation. The credential-free demo exposes sample catalogues and local shopping. For live sign-in, configure the [provider callbacks](../backend/README.md#google-and-shopify-sign-in) and verify account access with the intended services. Store installation, Apple sign-in and physical-device camera acceptance still require separate release work.

## Try On studio

The studio shows up to 16 recently opened products and stores in each browser or app installation. Product detail visits also count toward the owning store. Reopening a piece moves it to the front. The studio resolves saved IDs against the current catalogue and store scope before displaying them. A recent piece opens its garment review. A store opens its collection. The account check reads photo status without downloading the image. Upload and generation require separate actions.

## Shopper profile

Profile brings together the shopper’s account, shopping shortcuts, try-on photo, followed stores, preferences and help. Name edits go to the signed-in account. Local orders, bags, follows, preferences and backups use device storage. Store checkouts collect delivery addresses and payment details. The shared FAQ lives in `mobile/src/core/profileOptions.ts`.
