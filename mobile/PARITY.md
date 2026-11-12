# Client conversion inventory

The retained original client route families have native source implementations. Wishlist was removed by request; its stored data is preserved. This is an implementation inventory, not a claim of installed-device certification. The Java backend remains a backend; its existing disabled/live boundaries are unchanged.

| Original flow                  | Native implementation                                                                                        | Checks included                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Common discovery home          | `home`, all enabled catalogues, search/categories, catalogue order                                           | Home ignores stale store/sort restrictions; independent directory/catalogue failures                         |
| Brand chooser and Brand Centre | `brands`, `brand`, followed stores, route-owned brand scope                                                  | Encoded deep links and store scope tests                                                                     |
| Demo-store onboarding          | `stores`, explicit add/enable/disable                                                                        | Retained records; unknown/malformed catalogue rejection; cancellation guards                                 |
| Brand-owner readiness          | `owner`, domain validation, readiness/retry                                                                  | Invalid/ready responses fail closed; installation remains disabled                                           |
| Product details                | `product`, available-first variant, cart, photos, preparation/try-on links                              | Default variant, stock/currency/quantity validation, cart feedback                                           |
| Catalogue photo viewer         | `photos`, full-screen vertical paging, close/previous/next, resizing                                         | Initial product retained; deterministic product return; device gestures still untested                       |
| Saved products                 | Removed from UI/navigation; existing records and backup support retained                                                 | UI absence, storage and retained-reference tests                                                                         |
| Cart                           | `cart`, grouped per store, variant-key edits, unavailable line retention                                     | Bounded quantities, currency safety, disabled store protections                                              |
| Demo checkout                  | `checkout`, current catalogue revalidation and durable order snapshot                                        | Duplicate actions, persistence errors, focus/session navigation gate; no real payments                       |
| Orders                         | `orders`/`order`, global historical snapshots and optional store filter                                      | Snapshot/currency/legacy record preservation                                                                 |
| Profile                        | `profile`, scoped cart count, global orders/follows, preferences                                      | Scope selector tests; backup whitelist; theme persistence                                                    |
| Local backup/recovery          | Native file/share sheet, raw malformed-record recovery                                                       | Queue, uncertain write, stale baseline, private-data exclusion tests                                         |
| Real account OTP               | `login`, request/verify/resend/change-number, account photo, logout                                          | Backend contracts retained; real transport/cookies require device verification                               |
| OTP presentation simulation    | `login-demo`, sample number, attempts/expiry/failure/restart                                                 | No network or account; distinct from real login                                                              |
| Account photo selection        | Native gallery, normalized temporary JPEG, local checks, separate upload confirmation                        | Header/size/dimension limits and privacy cleanup; backend upload untested                                    |
| Automatic body scan            | Native camera + nine-joint pose, brightness/sharpness, sustained-ready capture                               | Threshold/gate tests, final validation, cancellation/late-frame cleanup, permission-sheet handling           |
| iOS pose/quality               | Swift Expo module, Apple Vision, orientation-aware bounded ImageIO decode                                    | Autolinking/project generation; static API review, **not compiled or device-run**                            |
| Android pose/quality           | Kotlin Expo module, bundled ML Kit, bounded EXIF-aware decode                                                | Autolinking/project generation; 28 pure Java synthetic assertions, **native module not compiled/device-run** |
| Local try-on preparation       | `prepare`, always-available scoped garment chooser, garment decode/dimension feedback, both acknowledgements | Missing/broken garment blocks review; replacing garment resets personal preview; no upload                   |
| Saved-photo generation         | `try-on`, separate consent, saved-photo checks, one submission, bounded polling/result                       | Mocked actual coordinator tests for terminal retry vs uncertain locks; no paid calls                         |
| Appearance                     | Light/dark/device; photographs unchanged                                                                     | Native theme provider and Expo system UI configuration; screen-reader/device appearance tests pending        |
| Interrupted navigation         | Native back/focus handling, transient-photo teardown, stale result suppression                               | Pure focus/capture/polling tests; full UI device walkthrough pending                                         |

The mobile UI refinement is documented in `UI-REFINEMENT.md`, including the retained route families and the device-verification boundary.

## Intentional platform adaptations

- Browser hash history becomes native stacks and `fashioncentre://` deep links. Browser keyboard shortcuts are replaced by accessible native controls and system back handling.
- Browser local storage/Web Locks become queued AsyncStorage operations. Browser records do not silently migrate or sync to phones.
- Browser file downloads become a native share sheet. Local photo object URLs become owned temporary files.
- Browser MediaPipe is replaced by on-device Apple Vision/ML Kit. Their model confidence and image resampling are not numerically identical; retain and calibrate the original thresholds with physical-device examples.
- The original web client remains available separately. This package targets iOS and Android.

## Release/device checklist still required

1. Compile and install both generated apps. Confirm `FashionVision` resolves in each custom build.
2. Exercise first camera permission, denial/revocation, permission sheet, background/foreground, back, rapid reopen and repeated capture. Check orientation, memory, preview framing and original-photo preservation.
3. Use consented bright/dark/blurry/cropped/full-body photos, varied clothing and skin tones, and multiple devices to calibrate model thresholds. Check false rejections and capture latency.
4. Confirm account cookies, OTP transport, signed-in photo refresh, multipart upload, logout and session expiry against a configured HTTPS test backend.
5. Run shopping/checkout/history/theme/backup flows with offline transitions, disabled stores, repeated taps and failed storage. Check VoiceOver/TalkBack and font scaling.
6. Test provider work separately with an explicitly authorized budget; add server idempotency/recoverable jobs before relying on process-restart duplicate protection.

Nothing in these checks authorizes enabling real merchant installation, purchases or paid generation automatically.
