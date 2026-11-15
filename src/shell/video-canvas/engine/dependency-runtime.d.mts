/** Typed boundary for the plain-JS dependency loader shared with its focused tests. */
export function readBoundedResponse(response: Response, maximumBytes: number): Promise<Blob>;
export function materializeDependencyPairs<T>(
  dependencies: T[],
  loadOne: (dependency: T, signal: AbortSignal) => Promise<{ assetId: string; url: string }>,
  options?: { signal?: AbortSignal; revoke?: (url: string) => void },
): Promise<Record<string, string>>;
export function commitDependencyLoadIfCurrent(options: {
  generation: number;
  currentGeneration: number;
  signal?: AbortSignal;
  runtimeUrls: Record<string, string>;
  commit: () => void;
  revoke?: (url: string) => void;
}): boolean;
