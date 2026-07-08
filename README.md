# POZR Video Rotate

Extract evenly spaced frames from a video and rotate through a limited set of those frames in a Vite React component.

## Commands

```sh
npm install
npm run extract -- --input input.mp4 --count 48 --prefix frame --force
npm run dev
```

The extractor writes frames to `public/frames` by default. The demo component expects `frame-01.jpg` through `frame-48.jpg`, then maps those source frames down to 5, 8, 12, 24, or 48 drag positions. The 48-frame setting gives the smoother rotation mode enough source images to feel less stepped.

## Extractor examples

```sh
npm run extract -- --input input.mp4 --count 8 --prefix frame --force
npm run extract -- --input ./videos/product-spin.mp4 --output public/frames --count 36 --width 1200 --format webp --force
```

## Component usage

```jsx
import { FrameRotator } from './FrameRotator.jsx';

<FrameRotator
  basePath="/frames"
  filePrefix="frame"
  fileExtension="jpg"
  dragDirection={1}
  totalFrames={48}
  rotationSteps={48}
  releaseGlideFrames={4}
  releaseGlideMs={180}
  smoothDrag
/>
```

Use `totalFrames` for the number of extracted files available, and `rotationSteps` for the smaller number of positions the drag/swipe interaction should expose.
Use `dragDirection={1}` for the current horizontal direction, or `dragDirection={-1}` to flip back to the original direction.
Use `dragPixelsPerFrame`, `smoothing`, `releaseGlideFrames`, `releaseGlideMs`, `maxReleaseFrames`, and `smoothDrag` to tune how quickly the image follows the pointer and how softly it stops after a drag or mobile swipe.