import type {
  Model3DDirectorCamera,
  Model3DMotionKeyframe,
  Model3DVector3,
} from "./model3d-director";

export interface Model3DDirectorRuntimeFrame {
  timeMs: number;
  position: Model3DVector3;
  target: Model3DVector3;
  fovDegrees: number;
  apertureFStop: number;
  easing: Model3DMotionKeyframe["easing"];
}

export interface Model3DBokehSettings {
  apertureFStop: number;
  focus: number;
  aperture: number;
  maxBlur: number;
}

export const RECORDER_MIME_CANDIDATES: readonly string[];

export function model3DRuntimeError(
  code: string,
  message: string,
  retryable?: boolean,
): Error & { code: string; retryable: boolean };

export function model3DRecorderMime(
  MediaRecorderClass?: typeof MediaRecorder,
): string;

export function model3DDepthOfFieldRuntimeCapability(input: {
  webgl2: boolean;
  renderableHalfFloatColorBuffer: boolean;
}): Readonly<{ enabled: boolean; reason?: string }>;

export function model3DPlayblastRuntimeCapability(input: {
  canvasCaptureStream: boolean;
  mediaRecorder: boolean;
}): Readonly<{ enabled: boolean; reason?: string }>;

export function model3DBokehSettings(
  apertureFStop: number,
  focusDistance: number,
): Readonly<Model3DBokehSettings>;

export function model3DDirectorFrameAt(
  camera: Readonly<Model3DDirectorCamera>,
  motionPath: readonly Readonly<Model3DMotionKeyframe>[],
  timeMs: number,
): Readonly<Model3DDirectorRuntimeFrame>;
