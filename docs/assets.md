# Asset provenance

The discovery cover uses an original generated editorial photograph in `mobile/assets/editorial/field.jpg`. The wide crop retains the subject’s face on phones. The two other edits use the original fictional product concepts described in [the concept artwork notes](../public/images/AI-ASSETS.md). The two renderers share these image files. Live catalogue cards use the corresponding merchant product image.

DM Serif Text is bundled for headings. Its license is in [the font directory](../mobile/assets/fonts/). Primary navigation icons are drawn from the shared paths in [primaryNavigation.ts](../mobile/src/primaryNavigation.ts).

The web camera loads the pinned [Google Pose Landmarker Lite model](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker#models). The Vite build includes the WebAssembly binaries from the installed MediaPipe package. Both live under `/vision/` on the same origin as the app.

## Archived prototype artwork

The files below are in [the design archive](history/prototype-images/) and sit outside the production web assets.

`campaign.png`, `denim.png`, and `discover.svg`, `brands.svg`, `try.svg`, `saved.svg`, `profile.svg` were downloaded directly from the approved Figma frames using returned asset links. The design task identified Who What Wear and Sassafras as the original sample photo sources. These files are retained for this local design prototype only; commercial image permission is not established. Replace with merchant-approved assets before public release.

Additional local demo photos were downloaded from images.unsplash.com with 1100px width and quality 80:

| Local file | Unsplash photo identifier |
| --- | --- |
| editorial.jpg, casual.jpg | photo-1483985988355-763728e1935b |
| street.jpg | photo-1516257984-b1b4d707412e |
| dress.jpg | photo-1515372039744-b8f02a3ae446 |
| shoes.jpg | photo-1549298916-b41d501d3772 |
| evening.jpg | photo-1539008835657-9e8e9680c956 |

These are illustrative fashion photos, not actual catalogue or generated try-on results. They do not imply photographer/model endorsement, merchant participation or product ownership. Asset licensing must be reviewed for any production reuse. No image contains a user's uploaded personal photo.
