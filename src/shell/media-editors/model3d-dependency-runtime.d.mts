export interface Model3DArtifactIdentity {
  artifactId: string;
  revisionId: string;
  sourceDigest?: string;
}

export interface Model3DValidatedGrant {
  artifactId: string;
  revisionId: string;
  dependencyPath: string;
  url: string;
  expiresAt: string;
  format: string;
  mediaType: string;
}

export function normalizeModel3DArtifactIdentity(
  value: unknown,
): Model3DArtifactIdentity | null;
export function model3DIdentityFromAccessUrl(value: string, gatewayBase: string, expectedArtifactId: string): Model3DArtifactIdentity | null;

export function model3DSourceGrantPath(
  identity: Model3DArtifactIdentity,
): string;

export function model3DDependencyPath(uri: string): string;

export function model3DDependencyGrantPath(
  identity: Model3DArtifactIdentity,
  uri: string,
): string;

export function qualifyModel3DGrantUrl(
  value: unknown,
  gatewayBase: string,
): string;

export function validateModel3DGrant(
  value: unknown,
  identity: Model3DArtifactIdentity,
  gatewayBase: string,
  expectedDependencyPath?: string,
  now?: number,
): Model3DValidatedGrant;

export function materializeModel3DGltfDependencies(
  document: Record<string, unknown>,
  resolveDependency: (uri: string) => Promise<Blob>,
  objectUrlApi?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">,
  options?: { concurrency?: number },
): Promise<{
  document: Record<string, unknown>;
  objectUrls: string[];
  release: () => void;
}>;

export const MODEL3D_DEPENDENCY_CONCURRENCY: number;

export class Model3DHttpError extends Error {
  constructor(message: string, status: number);
  status: number;
}

export function isTransientModel3DError(error: unknown): boolean;

export function withModel3DRetry<T>(
  task: (attempt: number) => Promise<T>,
  options?: {
    attempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    signal?: AbortSignal;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  },
): Promise<T>;
