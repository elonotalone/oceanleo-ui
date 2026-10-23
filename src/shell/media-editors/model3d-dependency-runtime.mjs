const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const ACCESS_PATH_RE = /^\/v1\/artifact-renditions\/access\/[^/?#]+$/;

function text(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function normalizeModel3DArtifactIdentity(value) {
  if (!value || typeof value !== "object") return null;
  const artifactId = text(value.artifactId, value.artifact_id);
  const revisionId = text(value.revisionId, value.revision_id);
  if (!artifactId && !revisionId) return null;
  if (!UUID_RE.test(artifactId) || !UUID_RE.test(revisionId)) {
    throw new Error("3D source is missing a valid artifact/revision identity");
  }
  const sourceDigest = text(value.sourceDigest, value.source_digest).toLowerCase();
  if (sourceDigest && !SHA256_RE.test(sourceDigest)) {
    throw new Error("3D source digest is invalid");
  }
  return { artifactId, revisionId, sourceDigest };
}

/** Locator hint only: authentication and immutable identity are checked again
 * by the server. Never treat an expired/signed payload as authorization. */
export function model3DIdentityFromAccessUrl(value, gatewayBase, expectedArtifactId) {
  const qualified = qualifyModel3DGrantUrl(value, gatewayBase);
  if (!qualified || !UUID_RE.test(expectedArtifactId || "")) return null;
  try {
    const token = new URL(qualified).pathname.split("/access/")[1];
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
    const payload = JSON.parse(atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.v !== 1 || payload.purpose !== "source" || payload.mode !== "source" ||
      payload.artifact !== expectedArtifactId || !UUID_RE.test(payload.revision || "") || payload.dependencyPath) return null;
    return { artifactId: payload.artifact, revisionId: payload.revision, sourceDigest: "" };
  } catch { return null; }
}

export function model3DSourceGrantPath(identity) {
  const normalized = normalizeModel3DArtifactIdentity(identity);
  if (!normalized) throw new Error("3D artifact identity is required");
  return (
    `/v1/artifacts/${encodeURIComponent(normalized.artifactId)}/source` +
    `?revisionId=${encodeURIComponent(normalized.revisionId)}`
  );
}

export function model3DDependencyPath(uri) {
  const raw = text(uri);
  if (!raw || raw.startsWith("data:")) {
    throw new Error("3D dependency path is empty or embedded");
  }
  if (
    raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.startsWith("blob:") ||
    /^[a-z][a-z0-9+.-]*:/i.test(raw) ||
    /[?#]/.test(raw)
  ) {
    throw new Error(`3D artifact dependency must be a relative closure path: ${raw}`);
  }
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new Error(`3D artifact dependency path is malformed: ${raw}`);
  }
  if (
    !decoded ||
    decoded.startsWith("/") ||
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`3D artifact dependency path is unsafe: ${raw}`);
  }
  // The persisted closure key is the canonical decoded POSIX path. Encode its
  // segments only when constructing the HTTP route so FastAPI receives the
  // same value that reviewed-catalog ingestion stored.
  return decoded;
}

export function model3DDependencyGrantPath(identity, uri) {
  const normalized = normalizeModel3DArtifactIdentity(identity);
  if (!normalized) throw new Error("3D artifact identity is required");
  const dependencyPath = model3DDependencyPath(uri);
  const encodedPath = dependencyPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return (
    `/v1/artifacts/${encodeURIComponent(normalized.artifactId)}` +
    `/revisions/${encodeURIComponent(normalized.revisionId)}` +
    `/source-dependencies/${encodedPath}`
  );
}

export function qualifyModel3DGrantUrl(value, gatewayBase) {
  const candidate = text(value);
  if (!candidate) return "";
  try {
    const gateway = new URL(gatewayBase);
    const parsed = new URL(candidate, `${gateway.origin}/`);
    return parsed.origin === gateway.origin &&
      ACCESS_PATH_RE.test(parsed.pathname) &&
      !parsed.search &&
      !parsed.hash
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}

export function validateModel3DGrant(
  value,
  identity,
  gatewayBase,
  expectedDependencyPath = "",
  now = Date.now(),
) {
  const normalized = normalizeModel3DArtifactIdentity(identity);
  if (!normalized || !value || typeof value !== "object") {
    throw new Error("3D source grant response is invalid");
  }
  const artifactId = text(value.artifactId, value.artifact_id);
  const revisionId = text(value.revisionId, value.revision_id);
  const purpose = text(value.purpose);
  const mode = text(value.mode);
  const dependencyPath = text(value.dependencyPath, value.dependency_path);
  const expectedPath = expectedDependencyPath
    ? model3DDependencyPath(expectedDependencyPath)
    : "";
  const expiresAtValue = text(value.expiresAt, value.expires_at);
  const expiresAt = Date.parse(expiresAtValue);
  const url = qualifyModel3DGrantUrl(
    value.accessUrl ?? value.access_url,
    gatewayBase,
  );
  if (
    artifactId !== normalized.artifactId ||
    revisionId !== normalized.revisionId ||
    purpose !== "source" ||
    mode !== "source" ||
    dependencyPath !== expectedPath ||
    !url ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now
  ) {
    throw new Error(
      expectedPath
        ? `3D dependency grant is not pinned to ${expectedPath}`
        : "3D source grant is not pinned to the requested artifact revision",
    );
  }
  return {
    artifactId,
    revisionId,
    dependencyPath,
    url,
    expiresAt: new Date(expiresAt).toISOString(),
    format: text(value.format).toLowerCase(),
    mediaType: text(value.mediaType, value.media_type)
      .toLowerCase()
      .split(";", 1)[0],
  };
}

/** Parallel dependency fetches per model; small enough not to stampede the gateway. */
export const MODEL3D_DEPENDENCY_CONCURRENCY = 3;

/**
 * An HTTP failure that keeps its status, so the retry policy can tell an expired
 * signed URL (410) or a restarting gateway (502/503) from a deterministic 404.
 */
export class Model3DHttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "Model3DHttpError";
    this.status = status;
  }
}

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function isAbort(error) {
  return Boolean(error) && error.name === "AbortError";
}

/**
 * `fetch()` rejects with a bare TypeError ("Failed to fetch") when the gateway
 * restarts or the socket drops; 410 means the 5-minute signed URL expired and a
 * fresh grant fixes it. Everything else (401/403/404, validation) is
 * deterministic and MUST surface at once.
 */
export function isTransientModel3DError(error) {
  if (!error || isAbort(error)) return false;
  if (error instanceof Model3DHttpError) {
    return error.status === 410 || TRANSIENT_STATUS.has(error.status);
  }
  return error instanceof TypeError;
}

function abortError() {
  return typeof DOMException === "function"
    ? new DOMException("Aborted", "AbortError")
    : Object.assign(new Error("Aborted"), { name: "AbortError" });
}

function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Re-runs `task` (grant + download together, so a 410 re-issues the grant) on
 * transient failures with exponential backoff: 0.5s, 1s, 2s, 4s by default,
 * enough to ride out a gateway restart. A 410 retries immediately.
 */
export async function withModel3DRetry(task, options = {}) {
  const {
    attempts = 5,
    baseDelayMs = 500,
    maxDelayMs = 4000,
    signal,
    sleep = defaultSleep,
  } = options;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted) throw abortError();
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientModel3DError(error)) throw error;
      const expired = error instanceof Model3DHttpError && error.status === 410;
      const delay = expired
        ? 0
        : Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      if (delay > 0) await sleep(delay, signal);
    }
  }
  throw lastError;
}

export async function materializeModel3DGltfDependencies(
  document,
  resolveDependency,
  objectUrlApi = URL,
  { concurrency = MODEL3D_DEPENDENCY_CONCURRENCY } = {},
) {
  if (typeof resolveDependency !== "function") {
    throw new TypeError("resolveDependency must be a function");
  }
  if (
    typeof objectUrlApi?.createObjectURL !== "function" ||
    typeof objectUrlApi?.revokeObjectURL !== "function"
  ) {
    throw new TypeError("object URL API is unavailable");
  }
  const cloned = JSON.parse(JSON.stringify(document));
  const byUri = new Map();
  const objectUrls = [];
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    for (const url of objectUrls) objectUrlApi.revokeObjectURL(url);
  };
  try {
    const entries = [];
    const pending = [];
    for (const key of ["buffers", "images"]) {
      for (const entry of Array.isArray(cloned[key]) ? cloned[key] : []) {
        const uri = typeof entry?.uri === "string" ? entry.uri.trim() : "";
        if (!uri || uri.startsWith("data:")) continue;
        if (uri.startsWith("blob:")) {
          throw new Error("glTF dependency cannot reuse another browser session");
        }
        entries.push([entry, uri]);
        if (!pending.includes(uri)) pending.push(uri);
      }
    }
    // Bounded pool, in document order (buffers first). The first failure stops
    // new work; in-flight workers settle before we release object URLs.
    let next = 0;
    let failure = null;
    const worker = async () => {
      while (!failure && next < pending.length) {
        const uri = pending[next];
        next += 1;
        try {
          const blob = await resolveDependency(uri);
          if (!(blob instanceof Blob) || !blob.size) {
            throw new Error(`3D dependency is empty: ${uri}`);
          }
          const objectUrl = objectUrlApi.createObjectURL(blob);
          byUri.set(uri, objectUrl);
          objectUrls.push(objectUrl);
        } catch (error) {
          failure ||= { error };
        }
      }
    };
    const width = Math.max(1, Math.min(Math.trunc(concurrency) || 1, pending.length));
    await Promise.all(Array.from({ length: width }, worker));
    if (failure) throw failure.error;
    for (const [entry, uri] of entries) {
      const objectUrl = byUri.get(uri);
      entry.uri = objectUrl;
    }
    return {
      document: cloned,
      objectUrls: [...objectUrls],
      release,
    };
  } catch (error) {
    release();
    throw error;
  }
}
