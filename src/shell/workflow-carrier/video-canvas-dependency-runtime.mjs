const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const ACCESS_PATH_RE = /^\/v1\/artifact-renditions\/access\/[^/?#]+$/;
const VIDEO_V1_SCHEMA = "oceanleo.video-canvas.v1";
const VIDEO_V2_SCHEMA = "oceanleo.video.project.v2";

function text(value, maximum = 4_096) {
  return typeof value === "string" && value.trim().length <= maximum
    ? value.trim()
    : "";
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

export function normalizeVideoCanvasIdentity(value) {
  const source = record(value);
  if (!source) return null;
  const artifactId = text(source.artifactId ?? source.artifact_id, 128);
  const revisionId = text(source.revisionId ?? source.revision_id, 128);
  if (!artifactId && !revisionId) return null;
  if (!UUID_RE.test(artifactId) || !UUID_RE.test(revisionId)) {
    throw new Error("Video canvas artifact/revision identity is invalid.");
  }
  return { artifactId, revisionId };
}

export function normalizeVideoCanvasDependencyPath(value) {
  const raw = text(value, 1_024);
  if (
    !raw ||
    raw.startsWith("/") ||
    raw.startsWith("\\") ||
    raw.startsWith("//") ||
    raw.startsWith("blob:") ||
    raw.startsWith("data:") ||
    /^[a-z][a-z0-9+.-]*:/i.test(raw) ||
    /[?#%\\\0]/.test(raw)
  ) {
    throw new Error("Video canvas dependency path is not a canonical relative path.");
  }
  const parts = raw.split("/");
  if (
    parts[0] !== "assets" ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Video canvas dependency path must be under assets/.");
  }
  return raw;
}

export function videoCanvasDependencyGrantPath(identity, path) {
  const normalized = normalizeVideoCanvasIdentity(identity);
  if (!normalized) throw new Error("Video canvas artifact identity is required.");
  const dependencyPath = normalizeVideoCanvasDependencyPath(path);
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

function normalizedDigest(value) {
  const candidate = text(value, 80).toLowerCase().replace(/^sha256:/, "");
  if (!SHA256_RE.test(candidate)) {
    throw new Error("Video canvas dependency SHA-256 is missing or malformed.");
  }
  return candidate;
}

function normalizedMediaType(value) {
  const candidate = text(value, 120).toLowerCase().split(";", 1)[0];
  if (!/^(?:image|video|audio)\/[a-z0-9.+-]+$/.test(candidate)) {
    throw new Error("Video canvas dependency media type is invalid.");
  }
  return candidate;
}

function normalizedDependency(value, artifactId, defaultRevisionId, assetId) {
  const source = record(value);
  if (!source) throw new Error(`Video canvas asset ${assetId} has no dependency record.`);
  const dependencyArtifactId = text(source.artifactId ?? source.artifact_id, 128);
  const revisionId = text(source.revisionId ?? source.revision_id, 128) || defaultRevisionId;
  const path = normalizeVideoCanvasDependencyPath(source.path ?? source.dependencyPath);
  const sha256 = normalizedDigest(source.sha256 ?? source.contentDigest);
  const mediaType = normalizedMediaType(source.mediaType ?? source.mime);
  const byteSize = Number(source.byteSize ?? source.bytes);
  if (
    dependencyArtifactId !== artifactId ||
    !UUID_RE.test(revisionId) ||
    !Number.isSafeInteger(byteSize) ||
    byteSize <= 0
  ) {
    throw new Error(`Video canvas asset ${assetId} dependency identity or size is invalid.`);
  }
  return {
    assetId,
    artifactId: dependencyArtifactId,
    revisionId,
    path,
    sha256,
    mediaType,
    byteSize,
  };
}

/**
 * Read only stable dependency references from a verified project document.
 * For v1, dependency paths are taken from the selected source nodes and bound
 * to the asset's declared digest/media/size; guesses and basename matching are
 * intentionally rejected.
 */
export function extractVideoCanvasSourceDependencies(
  value,
  identityValue,
) {
  const identity = normalizeVideoCanvasIdentity(identityValue);
  if (!identity) throw new Error("Video canvas artifact identity is required.");
  const document = record(value);
  if (!document) throw new Error("Video canvas source is not a JSON object.");

  if (document.schemaVersion === VIDEO_V1_SCHEMA) {
    const assets = document.assets;
    const versions = document.versions;
    const headVersionId = text(document.headVersionId, 128);
    if (
      !Array.isArray(assets) ||
      assets.length > 4_999 ||
      !Array.isArray(versions) ||
      !headVersionId
    ) {
      throw new Error("Versioned v1 video source is missing its asset/head closure.");
    }
    const heads = versions.filter((entry) => record(entry)?.id === headVersionId);
    const graph = record(record(heads[0])?.graph);
    if (heads.length !== 1 || !Array.isArray(graph?.nodes)) {
      throw new Error("Versioned v1 video source has no unique selected graph.");
    }
    const refs = [];
    const seenAssetIds = new Set();
    const seenPaths = new Set();
    for (const candidate of assets) {
      const asset = record(candidate);
      const assetId = text(asset?.id, 256);
      if (!assetId || seenAssetIds.has(assetId)) {
        throw new Error("Versioned v1 video source has a duplicate or invalid asset ID.");
      }
      seenAssetIds.add(assetId);
      const nodes = graph.nodes.filter((rawNode) => {
        const node = record(rawNode);
        return node?.assetId === assetId || node?.id === assetId;
      });
      const paths = new Set(
        nodes
          .map((rawNode) => record(record(rawNode)?.params)?.path)
          .filter((path) => typeof path === "string"),
      );
      if (paths.size !== 1) {
        throw new Error(`Versioned v1 asset ${assetId} has no unique source path.`);
      }
      const path = normalizeVideoCanvasDependencyPath([...paths][0]);
      if (seenPaths.has(path)) {
        throw new Error("Versioned v1 video assets share an ambiguous source path.");
      }
      seenPaths.add(path);
      refs.push(
        normalizedDependency(
          {
            artifactId: identity.artifactId,
            revisionId: identity.revisionId,
            path,
            sha256: asset?.sha256,
            mediaType: asset?.mediaType,
            byteSize: asset?.byteSize,
          },
          identity.artifactId,
          identity.revisionId,
          assetId,
        ),
      );
    }
    return refs;
  }

  if (document.schema !== VIDEO_V2_SCHEMA) {
    throw new Error("Video canvas source schema is unsupported for dependency grants.");
  }
  const assets = record(document.assets);
  if (!assets || Object.keys(assets).length > 4_999) {
    throw new Error("Video project assets are malformed or exceed the closure limit.");
  }
  const refs = [];
  const seenPaths = new Set();
  for (const [assetId, rawAsset] of Object.entries(assets)) {
    const asset = record(rawAsset);
    if (!asset) throw new Error(`Video project asset ${assetId} is malformed.`);
    if (asset.sourceDependency !== undefined) {
      const ref = normalizedDependency(
        asset.sourceDependency,
        identity.artifactId,
        identity.revisionId,
        assetId,
      );
      if (
        normalizedDigest(asset.contentDigest) !== ref.sha256 ||
        normalizedMediaType(asset.mime) !== ref.mediaType ||
        (asset.url !== undefined && asset.url !== "") ||
        (asset.previewUrl !== undefined && asset.previewUrl !== "")
      ) {
        throw new Error(`Video project asset ${assetId} conflicts with its stable dependency reference.`);
      }
      if (seenPaths.has(ref.path)) {
        throw new Error("Video project contains duplicate source dependency paths.");
      }
      seenPaths.add(ref.path);
      // The durable project may point at the historical revision from which
      // this dependency was first pinned. Grants, however, must be minted
      // against the exact currently opened revision's complete closure.
      refs.push({ ...ref, revisionId: identity.revisionId });
      continue;
    }
    if (
      !text(asset.url, 4_096) &&
      !text(asset.previewUrl, 4_096) &&
      typeof asset.inlineText !== "string"
    ) {
      throw new Error(`Video project asset ${assetId} has no stable source reference.`);
    }
  }
  return refs;
}

export function qualifyVideoCanvasGrantUrl(value, gatewayBase) {
  const candidate = text(value);
  if (!candidate) return "";
  try {
    const gateway = new URL(gatewayBase);
    const parsed = new URL(candidate, `${gateway.origin}/`);
    return parsed.origin === gateway.origin &&
      parsed.protocol === "https:" &&
      ACCESS_PATH_RE.test(parsed.pathname) &&
      !parsed.search &&
      !parsed.hash &&
      !parsed.username &&
      !parsed.password
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}

export function validateVideoCanvasDependencyGrant(
  value,
  expected,
  gatewayBase,
  now = Date.now(),
) {
  const grant = record(value);
  const artifactId = text(grant?.artifactId ?? grant?.artifact_id, 128);
  const revisionId = text(grant?.revisionId ?? grant?.revision_id, 128);
  const path = normalizeVideoCanvasDependencyPath(
    grant?.dependencyPath ?? grant?.dependency_path,
  );
  const purpose = text(grant?.purpose, 40);
  const expiresAtValue = text(grant?.expiresAt ?? grant?.expires_at, 100);
  const expiresAt = Date.parse(expiresAtValue);
  const accessUrl = qualifyVideoCanvasGrantUrl(
    grant?.accessUrl ?? grant?.access_url,
    gatewayBase,
  );
  if (
    !expected ||
    artifactId !== expected.artifactId ||
    revisionId !== expected.revisionId ||
    path !== expected.path ||
    purpose !== "source" ||
    !accessUrl ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now + 1_000
  ) {
    throw new Error("Video canvas dependency grant is not pinned to the requested source.");
  }
  return { ...expected, accessUrl, expiresAt: new Date(expiresAt).toISOString() };
}

export function validateVideoCanvasDependencyBytes(
  input,
  expected,
) {
  const blob = input?.blob;
  const contentType = text(input?.contentType, 160).toLowerCase().split(";", 1)[0];
  const sha256 = normalizedDigest(input?.sha256);
  if (
    !(blob instanceof Blob) ||
    blob.size !== expected?.byteSize ||
    contentType !== expected?.mediaType ||
    sha256 !== expected?.sha256
  ) {
    throw new Error("Video canvas dependency bytes failed size, media, or SHA-256 verification.");
  }
  return blob;
}
