# Android photo analysis

`FashionVision.analyze(uri, sampleSide)` runs off the UI/JS threads and serializes
native allocations. `sampleSide` is 320 (capture feedback) or 512 (upload check).
Only absolute paths / file URIs under this application's canonical cache or files
directory are accepted. Picker content URIs must first be copied there by the app.
No image upload, network model fetch or extra Internet permission is implemented.
ML Kit's pose model is bundled in the APK. Its SDK may collect diagnostic/usage
telemetry; this module does not promise the entire app/SDK is network-silent.

Limits: 10 MiB compressed, 40 million source pixels, 12000 pixels per axis. Header
bounds are checked before allocation; decoding is subsampled, EXIF orientations
1–8 are applied, pose input is at most 1280 pixels per side and quality input at
most the requested sample side. Returned dimensions describe the oriented source.
Landmarks have normalized top-left coordinates; out-of-frame coordinates are not
clamped (the JS framing policy must reject them). No detected person gives an empty
landmark list. Errors reject rather than returning artificial passing scores.

The numerical quality formula preserves Float32 grayscale storage followed by
double arithmetic, including interior-only population variance of the four-neighbor
Laplacian. Android bitmap resampling is not pixel-identical to browser canvas
resampling. ML Kit confidence is in-frame likelihood, not MediaPipe visibility;
thresholds must be calibrated using consented device testing before production.

Dependencies verified from official documentation:
- `com.google.mlkit:pose-detection-accurate:18.0.0-beta5`:
  https://developers.google.com/ml-kit/vision/pose-detection/android
- `androidx.exifinterface:exifinterface:1.4.2`:
  https://developer.android.com/jetpack/androidx/releases/exifinterface

SDK versions inherit the installed Expo module Gradle plugin (SDK 58 defaults:
compile SDK 36 and minimum SDK 24); there is no independently pinned Android toolchain.

Run pure-Java checks from the mobile root: `sh tests/native-java/run.sh`.
A JDK on PATH or JAVA_HOME is required. Tests use synthetic pixels only. They do
not establish that Kotlin compiles or validate bitmap EXIF transforms, ML Kit
inference, linking, ABI compatibility or resource cleanup on physical devices.
Those require an Android SDK build and emulator/device testing before release.
