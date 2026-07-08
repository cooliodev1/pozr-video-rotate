import { useEffect, useMemo, useRef, useState } from 'react';

function wrapIndex(index, length) {
  return ((index % length) + length) % length;
}

function clampIndex(index, length) {
  return Math.min(Math.max(index, 0), length - 1);
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getFrameNumber(stepIndex, totalFrames, rotationSteps) {
  return Math.floor((stepIndex * totalFrames) / rotationSteps) + 1;
}

function buildFrameUrls({ basePath, fileExtension, filePrefix, totalFrames, rotationSteps }) {
  const digits = Math.max(2, String(totalFrames).length);

  return Array.from({ length: rotationSteps }, (_, index) => {
    const frameNumber = getFrameNumber(index, totalFrames, rotationSteps);
    const paddedFrame = String(frameNumber).padStart(digits, '0');

    return `${basePath}/${filePrefix}-${paddedFrame}.${fileExtension}`;
  });
}

export function FrameRotator({
  alt = 'Rotatable video frame',
  basePath = '/frames',
  className = '',
  dragDirection = 1,
  dragPixelsPerFrame = 16,
  fileExtension = 'jpg',
  filePrefix = 'frame',
  frameUrls,
  loop = true,
  maxReleaseFrames = 12,
  releaseGlideFrames = 4,
  releaseGlideMs = 180,
  rotationSteps = 8,
  smoothing = 0.22,
  smoothDrag = true,
  totalFrames = 24,
}) {
  const frames = useMemo(
    () => (frameUrls?.length
      ? frameUrls
      : buildFrameUrls({ basePath, fileExtension, filePrefix, totalFrames, rotationSteps })),
    [basePath, fileExtension, filePrefix, frameUrls, rotationSteps, totalFrames],
  );
  const [frameIndex, setFrameIndex] = useState(0);
  const animationFrame = useRef(null);
  const displayPosition = useRef(0);
  const dragState = useRef({ active: false, lastTime: 0, lastX: 0, releaseDirection: 0, startPosition: 0, startX: 0, velocity: 0 });
  const targetPosition = useRef(0);
  const frameCount = frames.length;

  useEffect(() => {
    frames.forEach((src) => {
      const image = new Image();
      image.src = src;
    });

    targetPosition.current = loop ? targetPosition.current : clampIndex(targetPosition.current, frameCount);
    displayPosition.current = targetPosition.current;
    setFrameIndex(resolveIndex(Math.round(displayPosition.current)));

    return () => {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }
    };
  }, [frames, frameCount]);

  function resolveIndex(index) {
    return loop ? wrapIndex(index, frameCount) : clampIndex(index, frameCount);
  }

  function setFrameFromPosition(position) {
    const nextIndex = resolveIndex(Math.round(position));

    setFrameIndex((currentIndex) => (currentIndex === nextIndex ? currentIndex : nextIndex));
  }

  function animateTowardTarget() {
    const distance = targetPosition.current - displayPosition.current;

    if (Math.abs(distance) < 0.01) {
      displayPosition.current = targetPosition.current;
      setFrameFromPosition(displayPosition.current);
      animationFrame.current = null;
      return;
    }

    displayPosition.current += distance * smoothing;
    setFrameFromPosition(displayPosition.current);
    animationFrame.current = requestAnimationFrame(animateTowardTarget);
  }

  function moveToPosition(position, immediate = false) {
    targetPosition.current = loop ? position : clampIndex(position, frameCount);

    if (immediate || !smoothDrag) {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }

      displayPosition.current = targetPosition.current;
      setFrameFromPosition(displayPosition.current);
      return;
    }

    if (animationFrame.current === null) {
      animationFrame.current = requestAnimationFrame(animateTowardTarget);
    }
  }

  function updateFromClientX(clientX) {
    const delta = clientX - dragState.current.startX;
    const frameDelta = delta / dragPixelsPerFrame;

    moveToPosition(dragState.current.startPosition + frameDelta * dragDirection);
  }

  function updateSwipeVelocity(clientX, timeStamp) {
    const deltaX = clientX - dragState.current.lastX;
    const elapsed = Math.max(timeStamp - dragState.current.lastTime, 16);

    if (Math.abs(deltaX) < 0.5) {
      return;
    }

    dragState.current.velocity = deltaX / elapsed;
    dragState.current.releaseDirection = Math.sign(deltaX * dragDirection);
    dragState.current.lastX = clientX;
    dragState.current.lastTime = timeStamp;
  }

  function applyReleaseGlide() {
    const maxGlideFrames = Math.min(maxReleaseFrames, Math.max(2, frameCount * 0.3));
    const velocityFrames = Math.abs((dragState.current.velocity * releaseGlideMs) / dragPixelsPerFrame);
    const releaseDirection = dragState.current.releaseDirection;

    if (releaseDirection === 0) {
      return;
    }

    const glideFrames = clampValue(
      releaseDirection * Math.max(releaseGlideFrames, velocityFrames),
      -maxGlideFrames,
      maxGlideFrames,
    );

    if (Math.abs(glideFrames) < 0.1) {
      return;
    }

    moveToPosition(targetPosition.current + glideFrames);
  }

  function handlePointerDown(event) {
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }

    targetPosition.current = displayPosition.current;
    dragState.current = {
      active: true,
      lastTime: event.timeStamp,
      lastX: event.clientX,
      releaseDirection: 0,
      startX: event.clientX,
      startPosition: displayPosition.current,
      velocity: 0,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!dragState.current.active) {
      return;
    }

    updateSwipeVelocity(event.clientX, event.timeStamp);
    updateFromClientX(event.clientX);
  }

  function handlePointerUp(event) {
    if (!dragState.current.active) {
      return;
    }

    dragState.current.active = false;
    applyReleaseGlide();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveToPosition(targetPosition.current - 1, true);
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveToPosition(targetPosition.current + 1, true);
    }
  }

  return (
    <div
      aria-label={alt}
      aria-valuemax={frameCount}
      aria-valuemin={1}
      aria-valuenow={frameIndex + 1}
      className={`frame-rotator ${className}`}
      onKeyDown={handleKeyDown}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="slider"
      tabIndex={0}
    >
      <img draggable="false" src={frames[frameIndex]} alt={alt} />
    </div>
  );
}