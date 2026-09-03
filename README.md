# POZR Video Rotate

Extract calibrated frames from one complete turn and keep image orientation synchronized with a 3D model.

## Commands

```sh
npm install
npm run extract -- --input input2.mp4 --count 96 --start 0 --end 8 --prefix frame --force
npm run dev
```

The extractor treats `--start` as the calibrated first pose and `--end` as the exclusive point where that pose completes one full turn. It writes `rotation.json` beside the images with the exact timestamp and model yaw for every frame.
For videos that ease or pause during the turn, pass one comma-separated `--timestamps` value per output frame. This overrides even-time sampling while retaining evenly spaced angles in `rotation.json`.

## Shoulder calibration

1. Find the timestamp where the shoulders are square to camera. Use that as `--start` and define it as the model's `0` degree yaw.
2. Find the same shoulder pose after exactly one complete turn. Use that timestamp as `--end`; do not include it as a duplicate final frame.
3. Choose a frame count divisible by every stop count used in the UI. For `8`, `12`, `24`, and `48` stops, use `96` source frames. Avoid `48` UI stops when only `24` source frames exist.
4. Set `--direction counterclockwise` if increasing model yaw turns opposite to the source video.

For `input2.mp4`, the clip is 8 seconds at 24 fps and contains 192 unique source frames. This command captures every other source frame for a maximum orientation error below one source-frame interval:

```sh
npm run extract -- --input input2.mp4 --count 96 --start 0 --end 8 --start-angle 0 --direction clockwise --format webp --width 640 --force
```

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
  startAngle={0}
  rotationDirection="clockwise"
  onRotationChange={({ angle }) => {
    model.rotation.y = angle * Math.PI / 180;
  }}
  releaseGlideFrames={4}
  releaseGlideMs={180}
  smoothDrag
/>
```

Use `totalFrames` for the number of extracted files available, and `rotationSteps` for the smaller number of positions the drag/swipe interaction should expose.
`onRotationChange` reports the angle of the source image actually being displayed, including nearest-frame quantization. Use that value for the model instead of calculating yaw from the drag position.
Use `dragDirection={1}` for the current horizontal direction, or `dragDirection={-1}` to flip back to the original direction.
Use `dragPixelsPerFrame`, `smoothing`, `releaseGlideFrames`, `releaseGlideMs`, `maxReleaseFrames`, and `smoothDrag` to tune how quickly the image follows the pointer and how softly it stops after a drag or mobile swipe.