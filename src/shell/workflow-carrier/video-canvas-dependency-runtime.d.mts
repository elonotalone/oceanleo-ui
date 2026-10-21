export interface VideoCanvasArtifactIdentity {
  artifactId: string;
  revisionId: string;
}

export interface VideoCanvasSourceDependency {
  assetId: string;
  artifactId: string;
  revisionId: string;
  path: string;
  sha256: string;
  mediaType: string;
  byteSize: number;
}

export interface VideoCanvasDependencyGrant extends VideoCanvasSourceDependency {
  accessUrl: string;
  expiresAt: string;
  gatewayOrigin?: string;
}

export function normalizeVideoCanvasIdentity(
  value: unknown,
): VideoCanvasArtifactIdentity | null;

export function normalizeVideoCanvasDependencyPath(value: unknown): string;

export function videoCanvasDependencyGrantPath(
  identity: VideoCanvasArtifactIdentity,
  path: string,
): string;

export function extractVideoCanvasSourceDependencies(
  value: unknown,
  identity: VideoCanvasArtifactIdentity,
): VideoCanvasSourceDependency[];

export function qualifyVideoCanvasGrantUrl(
  value: unknown,
  gatewayBase: string,
): string;

export function validateVideoCanvasDependencyGrant(
  value: unknown,
  expected: VideoCanvasSourceDependency,
  gatewayBase: string,
  now?: number,
): VideoCanvasDependencyGrant;

export function validateVideoCanvasDependencyBytes(
  input: { blob: Blob; contentType: string; sha256: string },
  expected: VideoCanvasSourceDependency,
): Blob;
