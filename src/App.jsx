import { useState } from 'react';
import { FrameRotator } from './FrameRotator.jsx';

const sourceFrameCount = 48;
const rotationOptions = [5, 8, 12, 24, 48];

export default function App() {
  const [rotationSteps, setRotationSteps] = useState(sourceFrameCount);

  return (
    <main className="app-shell">
      <section className="workbench" aria-label="Video frame rotator">
        <div className="toolbar">
          <div>
            <p className="eyebrow">POZR</p>
            <h1>Frame Rotate</h1>
          </div>

          <div className="segmented-control" aria-label="Rotation frame count">
            {rotationOptions.map((option) => (
              <button
                className={option === rotationSteps ? 'is-active' : ''}
                key={option}
                onClick={() => setRotationSteps(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <FrameRotator
          className="hero-rotator"
          dragDirection={1}
          fileExtension="jpg"
          filePrefix="frame"
          releaseGlideFrames={4}
          releaseGlideMs={180}
          rotationSteps={rotationSteps}
          smoothDrag
          totalFrames={sourceFrameCount}
        />

        <div className="status-row" aria-live="polite">
          <span>{rotationSteps} stops</span>
          <span>{sourceFrameCount} source frames</span>
        </div>
      </section>
    </main>
  );
}