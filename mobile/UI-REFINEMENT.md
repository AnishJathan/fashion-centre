# Mobile UI refinement

The React Native client now uses one mobile layout system across the retained route families. This revision changes native source only. The existing web client and Java backend are unchanged.

## Shared interface

- Cream/plum identity retained, with complete light/dark palettes and consistent type, spacing, cards and controls.
- Icon-and-label bottom navigation, bounded cart badges, compact store switching and native detail headers. Tab switches replace the root destination instead of building a history of tabs.
- Keyboard-aware scrollable forms, appropriate keyboard types and OTP autofill. Safe-area padding covers content, photo viewers and loading states.
- Controls use targets of at least 48 logical pixels. Text retains system scaling. Small screens and larger text use stacked controls or a single product column.
- Normal text contrast is checked against 4.5:1; input boundaries are checked against 3:1. Decorative separators remain subtle.
- Long options use the measured parent width. The selected option scrolls into view. Large global notices are scrollable so they cannot consume the entire content region.
- Image loading, retry, unavailable, error and empty states are explicit. Tappable product cards do not contain nested retry buttons.

## Screen coverage

| Route              | Mobile treatment                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Discover           | Compact measured product grid, search and category controls; normal phones use two columns where space permits |
| Stores             | Photo-led store cards and clear follow/explore actions                                                         |
| Brand Centre       | Store-scoped catalogue and collapsible filtering                                                               |
| Demo stores        | Clear enabled/disabled state and separate add/explore controls                                                 |
| Product            | Responsive main photo, grouped variant/price/actions, separate description and try-on sections                 |
| Saved              | Same responsive grid and retained unavailable selections                                                       |
| Cart               | Compact thumbnail rows, accessible quantity controls and per-store totals                                      |
| Demo checkout      | Readable item review, clear simulation boundary and guarded confirmation                                       |
| Orders             | Compact history and store filtering                                                                            |
| Order record       | Grouped immutable snapshot detail                                                                              |
| Profile            | Inset settings groups, compact counts, followed-store rows and expandable preferences                          |
| Brand owner        | Domain field, readiness feedback and explicitly disabled Shopify connection                                    |
| Account            | Focused phone/OTP forms, account status and saved-photo actions                                                |
| OTP simulation     | Separate no-network flow, attempt/expiry feedback and restart                                                  |
| Photo preparation  | Horizontal garment chooser, bounded previews and large consent rows                                            |
| Catalogue photos   | Full-screen paging with measured normal-flow controls and safe-area-aware empty states                         |
| Saved-photo try-on | Clear preparation/consent/progress/result sections and explicit retry restrictions                             |

Camera scanning is part of the account photo flow. Its framing area is responsive; instructions and cancellation remain reachable. On-device analysis and automatic-capture logic are preserved.

## Interrupted actions

The refinement also checks leaving, returning and repeating actions. A retained upload-confirmation callback cannot start an upload after its editor has unmounted. Checkout/add callbacks suppress stale navigation while allowing a still-mounted screen to leave its busy state after the operation finishes. Existing uncertain paid-job locks and temporary-photo cleanup remain intact.

## Validation boundary

Final checks passed: TypeScript, 97 pure/mocked tests, iOS/Android Metro/Hermes exports, native project generation/autolinking, and 28 synthetic Java quality assertions. Tests include layout/contrast calculations, shared UI components and real-screen coordinator callbacks. These do **not** certify native rendering. No phone/emulator screenshots, VoiceOver/TalkBack walkthrough, actual keyboard/permission-sheet test, frame-rate measurement or native Swift/Kotlin compilation was performed in this cloud workspace.

The catalogue is bounded by the existing backend but its grid is not virtualized. Profile scrolling, image memory use and responsiveness with full catalogues should be measured on target phones before release. Font/icon loading should also be checked offline in an installed build.

Run the device checklist in `PARITY.md` and `README.md`, including 320–390 logical-pixel phones, a tablet, large system text, both appearance modes, keyboard entry, safe areas, interrupted upload/checkout and repeated navigation. Configure a custom native build; Expo Go does not provide the camera-analysis module. The current localhost web preview does not display this native UI revision.
