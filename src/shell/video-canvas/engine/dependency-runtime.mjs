/** Read a response stream while enforcing the caller's byte limit before buffering. */
export async function readBoundedResponse(response, maximumBytes) {
  if (
    !response?.body ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes <= 0
  ) {
    throw new Error("Dependency response or byte limit is invalid.");
  }
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredSize) && declaredSize > maximumBytes) {
    throw new Error("Dependency response exceeds its declared byte limit.");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("Dependency response exceeded its byte limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, { type: response.headers.get("content-type") || "" });
}

/** Resolve a complete dependency set or revoke every URL created by the failed set. */
export async function materializeDependencyPairs(
  dependencies,
  loadOne,
  { signal, revoke = (url) => URL.revokeObjectURL(url) } = {},
) {
  if (signal?.aborted) throw new Error("Dependency materialization was aborted.");
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  signal?.addEventListener("abort", abortFromParent, { once: true });
  const createdUrls = new Set();
  try {
    const settled = await Promise.allSettled(dependencies.map(async (dependency) => {
      try {
        const result = await loadOne(dependency, controller.signal);
        const url = result?.url;
        if (typeof url !== "string" || !url) {
          throw new Error("Dependency materializer returned no runtime URL.");
        }
        if (controller.signal.aborted) {
          revoke(url);
          throw new Error("Dependency materialization was aborted.");
        }
        createdUrls.add(url);
        return [result.assetId, url];
      } catch (error) {
        controller.abort();
        throw error;
      }
    }));
    const failed = settled.find((result) => result.status === "rejected");
    if (signal?.aborted || failed) {
      for (const url of createdUrls) revoke(url);
      throw failed?.reason || new Error("Dependency materialization was aborted.");
    }
    return Object.fromEntries(settled.map((result) => result.value));
  } finally {
    signal?.removeEventListener("abort", abortFromParent);
  }
}

/** Commit a loaded project only if it is still the newest non-aborted open. */
export function commitDependencyLoadIfCurrent({
  generation,
  currentGeneration,
  signal,
  runtimeUrls,
  commit,
  revoke = (url) => URL.revokeObjectURL(url),
}) {
  if (signal?.aborted || generation !== currentGeneration) {
    for (const url of Object.values(runtimeUrls || {})) revoke(url);
    return false;
  }
  commit();
  return true;
}
