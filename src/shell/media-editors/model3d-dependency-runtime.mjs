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

export async function materializeModel3DGltfDependencies(
  document,
  resolveDependency,
  objectUrlApi = URL,
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
    for (const key of ["buffers", "images"]) {
      for (const entry of Array.isArray(cloned[key]) ? cloned[key] : []) {
        const uri = typeof entry?.uri === "string" ? entry.uri.trim() : "";
        if (!uri || uri.startsWith("data:")) continue;
        if (uri.startsWith("blob:")) {
          throw new Error("glTF dependency cannot reuse another browser session");
        }
        let objectUrl = byUri.get(uri);
        if (!objectUrl) {
          const blob = await resolveDependency(uri);
          if (!(blob instanceof Blob) || !blob.size) {
            throw new Error(`3D dependency is empty: ${uri}`);
          }
          objectUrl = objectUrlApi.createObjectURL(blob);
          byUri.set(uri, objectUrl);
          objectUrls.push(objectUrl);
        }
        entry.uri = objectUrl;
      }
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
