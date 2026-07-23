const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, Number(value)));

const RECORDER_MIME_CANDIDATES = Object.freeze([
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
]);

export function model3DRuntimeError(code, message, retryable = false) {
  const error = new Error(message);
  error.name = "Model3DRuntimeCapabilityError";
  error.code = code;
  error.retryable = retryable === true;
  return error;
}

export function model3DRecorderMime(MediaRecorderClass = globalThis.MediaRecorder) {
  if (typeof MediaRecorderClass !== "function") return "";
  if (typeof MediaRecorderClass.isTypeSupported !== "function") return "";
  for (const mimeType of RECORDER_MIME_CANDIDATES) {
    try {
      if (MediaRecorderClass.isTypeSupported(mimeType)) return mimeType;
    } catch {
      // Continue to the next standards-based candidate.
    }
  }
  return "";
}

export function model3DDepthOfFieldRuntimeCapability({
  webgl2,
  renderableHalfFloatColorBuffer,
}) {
  if (!webgl2) {
    return Object.freeze({
      enabled: false,
      reason: "Depth of field requires WebGL2",
    });
  }
  if (!renderableHalfFloatColorBuffer) {
    return Object.freeze({
      enabled: false,
      reason:
        "Depth of field requires a renderable half-float color buffer",
    });
  }
  return Object.freeze({ enabled: true });
}

export function model3DPlayblastRuntimeCapability({
  canvasCaptureStream,
  mediaRecorder,
}) {
  if (!canvasCaptureStream) {
    return Object.freeze({
      enabled: false,
      reason: "This browser does not expose HTMLCanvasElement.captureStream",
    });
  }
  if (!mediaRecorder) {
    return Object.freeze({
      enabled: false,
      reason: "This browser does not expose MediaRecorder",
    });
  }
  return Object.freeze({ enabled: true });
}

export function model3DBokehSettings(apertureFStop, focusDistance) {
  const fStop = clamp(apertureFStop, 0.7, 64);
  const relativeOpening = (2.8 / fStop) ** 2;
  return Object.freeze({
    apertureFStop: fStop,
    focus: clamp(focusDistance, 0.001, 1_000_000),
    aperture: clamp(0.000025 * relativeOpening, 0.000001, 0.0005),
    maxBlur: clamp(0.008 * Math.sqrt(relativeOpening), 0.0005, 0.025),
  });
}

function easingProgress(value, easing) {
  const t = clamp(value, 0, 1);
  if (easing === "ease-in") return t * t;
  if (easing === "ease-out") return 1 - (1 - t) ** 2;
  if (easing === "ease-in-out") {
    return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
  }
  return t;
}

const vector = (value, fallback) => [
  Number(value?.[0] ?? fallback[0]),
  Number(value?.[1] ?? fallback[1]),
  Number(value?.[2] ?? fallback[2]),
];

const mix = (left, right, progress) =>
  left + (right - left) * clamp(progress, 0, 1);

const mixVector = (left, right, progress) => [
  mix(left[0], right[0], progress),
  mix(left[1], right[1], progress),
  mix(left[2], right[2], progress),
];

function frameFromCamera(camera) {
  return {
    timeMs: 0,
    position: vector(camera?.transform?.position, [0, 1.5, 5]),
    target: vector(camera?.target, [0, 0, 0]),
    fovDegrees: clamp(camera?.fovDegrees ?? 45, 1, 179),
    apertureFStop: clamp(camera?.apertureFStop ?? 2.8, 0.7, 64),
    easing: "linear",
  };
}

function frameFromKeyframe(keyframe, camera) {
  const fallback = frameFromCamera(camera);
  return {
    timeMs: Math.max(0, Number(keyframe?.timeMs || 0)),
    position: vector(keyframe?.transform?.position, fallback.position),
    target: vector(keyframe?.target, fallback.target),
    fovDegrees: clamp(
      keyframe?.fovDegrees ?? fallback.fovDegrees,
      1,
      179,
    ),
    apertureFStop: clamp(
      keyframe?.apertureFStop ?? fallback.apertureFStop,
      0.7,
      64,
    ),
    easing: String(keyframe?.easing || "linear"),
  };
}

/**
 * Resolve one immutable director camera frame. The shot camera is inserted at
 * t=0 when the take has no explicit zero-time keyframe; after the last
 * keyframe, the final camera is held.
 */
export function model3DDirectorFrameAt(camera, motionPath, timeMs) {
  const base = frameFromCamera(camera);
  const keyframes = (Array.isArray(motionPath) ? motionPath : [])
    .map((entry) => frameFromKeyframe(entry, camera))
    .sort((left, right) => left.timeMs - right.timeMs);
  const frames =
    keyframes[0]?.timeMs === 0 ? keyframes : [base, ...keyframes];
  const time = Math.max(0, Number(timeMs || 0));
  const rightIndex = frames.findIndex((entry) => entry.timeMs >= time);
  if (rightIndex === 0) return Object.freeze({ ...frames[0] });
  if (rightIndex < 0) {
    return Object.freeze({ ...frames[frames.length - 1] });
  }
  const left = frames[rightIndex - 1];
  const right = frames[rightIndex];
  const span = Math.max(1, right.timeMs - left.timeMs);
  const progress = easingProgress((time - left.timeMs) / span, right.easing);
  return Object.freeze({
    timeMs: time,
    position: Object.freeze(mixVector(left.position, right.position, progress)),
    target: Object.freeze(mixVector(left.target, right.target, progress)),
    fovDegrees: mix(left.fovDegrees, right.fovDegrees, progress),
    apertureFStop: mix(
      left.apertureFStop,
      right.apertureFStop,
      progress,
    ),
    easing: right.easing,
  });
}

export { RECORDER_MIME_CANDIDATES };
