export type DetectedSourceFormat =
  | "unknown"
  | "json"
  | "svg"
  | "mp4"
  | "webm"
  | "mp3"
  | "wav"
  | "flac"
  | "ogg"
  | "aac"
  | "pdf"
  | "glb"
  | "gltf"
  | "video-project"
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "avif";

export type ExpectedSourceKind =
  | "video"
  | "audio"
  | "image"
  | "pdf"
  | "model3d"
  | "video-project";

export function binarySourceFormat(
  value: ArrayBuffer | ArrayBufferView,
  totalBytes?: number,
): DetectedSourceFormat;

export function sourceFormatForBlob(
  blob: Blob,
): Promise<DetectedSourceFormat>;

export function assertBlobSource(
  blob: Blob,
  expected: ExpectedSourceKind,
): Promise<DetectedSourceFormat>;

export function parseGltfDocument(text: string): Record<string, unknown>;

export function parseVideoProjectEnvelope(
  text: string,
  expectedSchema?: string,
): unknown;

export function gltfDependencyUris(
  document: Record<string, unknown>,
): string[];

export function rewriteGltfDependencyUris<T extends Record<string, unknown>>(
  document: T,
  sourceUrl: string,
  safeUrl: (url: string) => string,
): T;
