# iOS implementation and verification

`FashionVisionModule` exposes `FashionVision.analyze(uri, sampleSide)` through
Expo Modules Core. Only `320` and `512` are accepted. It returns oriented source
`width` / `height`, `brightness`, `sharpness`, nine named `landmarks` (or an empty
array when no person is found), and `engine: "apple-vision"`.

Image bytes stay on device. Only regular files under this app's canonical cache,
documents, and temporary directories are read. The reader rejects network URLs,
query strings, fragments, and symlinks resolving outside those directories. It
reads at most 10 MiB + one rejection byte. Metadata must be at most 40 million
pixels and 12000 pixels per side before decoding. No output photo is written;
the caller remains responsible for deleting its temporary source file.

ImageIO creates bounded, EXIF-transformed thumbnails (maximum 1280 for pose,
320/512 for quality). Original dimensions are swapped for EXIF orientations 5–8.
Vision sees the transformed thumbnail with `.up` orientation. The result changes
Vision's bottom-left coordinates to top-left coordinates with `y = 1 - y`.
Coordinates are intentionally not clamped, allowing the JS border check to fail.
Only one skeleton, the observation with the highest confidence, is evaluated.

The grayscale coefficients, Float32 intermediate storage, four-neighbor
Laplacian, and population variance follow the web implementation. Apple image
resampling/color conversion can differ from browser Canvas. Vision confidence
is not MediaPipe visibility; the models and their scores are not numerically
interchangeable. Validate and tune thresholds with representative consented
photos before release. This is real on-device inference, not a placeholder or
a remote provider, but is not a promise of identical detections to MediaPipe.

## Verification boundary

The Linux workspace has no Swift compiler, Xcode, CocoaPods, or Apple SDK. Swift
and podspec were reviewed against installed Expo 58 module sources and Apple's
API documentation, but have **not** been compiled or run on an iOS device.
The app must use a native development/release build, not Expo Go. Deployment
minimum 16.4 matches Expo 58; Vision APIs used here are available from iOS 14.

Before release, run `npx expo run:ios` on an Xcode-capable machine and verify:

- All eight EXIF orientations, particularly mirrored portrait images, preserve
  dimensions and put nose/ankles in the correct normalized vertical positions.
- Valid JPEG/PNG/HEIC photos; no person; partial body; two people (no merged pose).
- Uniform black/gray/white fixtures have expected brightness and zero variance;
  a sharp checkerboard has higher variance than a blurred copy.
- Compare 320 and 512 samples with the browser on opaque fixture images and
  assess threshold sensitivity rather than requiring identical resampling.
- Malformed files, >10 MiB, >40 MP, >12000 pixels/side, directory inputs, network
  URLs, traversal paths and symlinks outside allowed folders reject safely.
- Repeated live capture, permission interruption, and leaving the camera do not
  retain temporary images or produce stale UI updates (caller responsibility).

## Primary references

- https://developer.apple.com/documentation/vision/detecting-human-body-poses-in-images
- https://developer.apple.com/documentation/vision/vndetecthumanbodyposerequest
- https://developer.apple.com/documentation/vision/vndetecthumanbodyposerequestrevision1
- https://developer.apple.com/documentation/vision/vnhumanbodyposeobservation
- https://developer.apple.com/documentation/imageio/kcgimagesourcecreatethumbnailwithtransform
- https://developer.apple.com/documentation/imageio/kcgimagesourcethumbnailmaxpixelsize
