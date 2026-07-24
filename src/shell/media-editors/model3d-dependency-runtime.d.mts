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
): Promise<{
  document: Record<string, unknown>;
  objectUrls: string[];
  release: () => void;
}>;
