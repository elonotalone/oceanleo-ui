import { normalizeImageEditorSnapshot, type ImageEditorSnapshot } from "./image-document-contract";

export const IMAGE_SCENE_SOURCE_SCHEMA = "oceanleo.image-scene.v1";
export const IMAGE_SCENE_GRAPH_SCHEMA = "oceanleo.fabric-scene.v1";
export const IMAGE_DEPENDENCY_CLOSURE_SCHEMA =
  "oceanleo.image-dependency-closure.v1";
export const IMAGE_SCENE_SOURCE_FORMAT = "oceanleo-scene+json";
export const IMAGE_SCENE_ENTRYPOINT = "scene.oceanleo-scene_json";

const SHA256_RE = /^[0-9a-f]{64}$/;
const MAX_DEPENDENCIES = 500;

export type ImageDependencyRenditionPurpose =
  | "source"
  | "full"
  | "preview"
  | "thumbnail";

export interface ImageSceneDependency {
  id: string;
  kind: "image";
  required: true;
  url: string;
  digest: string;
  artifactId?: string;
  revisionId?: string;
  renditionPurpose?: ImageDependencyRenditionPurpose;
  expiresAt?: string | null;
}

export interface ImageSceneSource {
  schema: typeof IMAGE_SCENE_SOURCE_SCHEMA;
  version: 1;
  artifactType: "composite_image";
  revision: number;
  revisionDigest: string;
  updatedAt: string;
  baseArtifact: {
    artifactId: string;
    revisionId: string;
  };
  sceneGraph: {
    schema: typeof IMAGE_SCENE_GRAPH_SCHEMA;
    revision: number;
    snapshot: ImageEditorSnapshot;
  };
  dependencyClosure: {
    schema: typeof IMAGE_DEPENDENCY_CLOSURE_SCHEMA;
    revision: number;
    digest: string;
    dependencies: ImageSceneDependency[];
  };
}

export type ImageSceneDiagnosticCode =
  | "invalid-scene"
  | "revision-mismatch"
  | "revision-digest-mismatch"
  | "missing-dependency"
  | "orphan-dependency"
  | "dependency-digest-mismatch"
  | "temporary-dependency"
  | "expired-dependency"
  | "cross-origin-dependency"
  | "dependency-unavailable";

export class ImageSceneSourceError extends Error {
  readonly code: ImageSceneDiagnosticCode;
  readonly dependencyId?: string;

  constructor(
    code: ImageSceneDiagnosticCode,
    message: string,
    dependencyId?: string,
  ) {
    super(message);
    this.name = "ImageSceneSourceError";
    this.code = code;
    this.dependencyId = dependencyId;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizedDigest(value: unknown): string {
  const digest = boundedText(value, 80).toLowerCase().replace(/^sha256:/, "");
  return SHA256_RE.test(digest) ? digest : "";
}

function stableJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ImageSceneSourceError(
        "invalid-scene",
        "图片 scene 含有非有限数字。",
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  const object = record(value);
  if (!object) {
    throw new ImageSceneSourceError(
      "invalid-scene",
      "图片 scene 含有不可序列化字段。",
    );
  }
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

export async function sha256Bytes(bytes: BufferSource): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new ImageSceneSourceError(
      "invalid-scene",
      "当前运行环境不支持 SHA-256，不能安全保存分层工程。",
    );
  }
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function utf8Bytes(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value);
  const bytes = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  bytes.set(encoded);
  return bytes;
}

export async function sha256Text(value: string): Promise<string> {
  return sha256Bytes(utf8Bytes(value));
}

export async function sha256Blob(blob: Blob): Promise<string> {
  return sha256Bytes(await blob.arrayBuffer());
}

function normalizeDependency(
  value: unknown,
  index: number,
): ImageSceneDependency {
  const candidate = record(value);
  const id = boundedText(candidate?.id, 300);
  const url = boundedText(candidate?.url, 3_000);
  const digest = normalizedDigest(candidate?.digest);
  const artifactId = boundedText(candidate?.artifactId, 300);
  const revisionId = boundedText(candidate?.revisionId, 300);
  const renditionPurpose = boundedText(candidate?.renditionPurpose, 40);
  const expiresAt =
    candidate?.expiresAt === null
      ? null
      : boundedText(candidate?.expiresAt, 100) || undefined;
  if (
    !candidate ||
    !id ||
    candidate.kind !== "image" ||
    candidate.required !== true ||
    !url ||
    !digest
  ) {
    throw new ImageSceneSourceError(
      "missing-dependency",
      `图片 scene dependency[${index}] 缺少 id、URL 或 SHA-256。`,
      id || undefined,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ImageSceneSourceError(
      "dependency-unavailable",
      `图层依赖 ${id} 的 URL 无效。`,
      id,
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ImageSceneSourceError(
      "temporary-dependency",
      `图层依赖 ${id} 仍是临时地址，不能作为分层工程依赖。`,
      id,
    );
  }
  if (Boolean(artifactId) !== Boolean(revisionId)) {
    throw new ImageSceneSourceError(
      "missing-dependency",
      `图层依赖 ${id} 的 artifact/revision identity 不完整。`,
      id,
    );
  }
  if (
    renditionPurpose &&
    !["source", "full", "preview", "thumbnail"].includes(renditionPurpose)
  ) {
    throw new ImageSceneSourceError(
      "invalid-scene",
      `图层依赖 ${id} 的 rendition purpose 无效。`,
      id,
    );
  }
  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
    throw new ImageSceneSourceError(
      "expired-dependency",
      `图层依赖 ${id} 的过期时间无效。`,
      id,
    );
  }
  return {
    id,
    kind: "image",
    required: true,
    url,
    digest,
    ...(artifactId ? { artifactId, revisionId } : {}),
    ...(renditionPurpose
      ? {
          renditionPurpose:
            renditionPurpose as ImageDependencyRenditionPurpose,
        }
      : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };
}

function sortedDependencies(
  dependencies: readonly ImageSceneDependency[],
): ImageSceneDependency[] {
  return [...dependencies].sort(
    (left, right) =>
      left.id.localeCompare(right.id) ||
      left.digest.localeCompare(right.digest) ||
      left.url.localeCompare(right.url),
  );
}

function cloneSnapshot(snapshot: ImageEditorSnapshot): ImageEditorSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as ImageEditorSnapshot;
}

function walkObjects(
  value: unknown,
  visit: (object: Record<string, unknown>, path: string) => void,
  path = "objects",
): void {
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    const object = record(entry);
    if (!object) return;
    const objectPath = `${path}[${index}]`;
    visit(object, objectPath);
    walkObjects(object.objects, visit, `${objectPath}.objects`);
  });
}

function isExternalImageObject(object: Record<string, unknown>): boolean {
  const src = boundedText(object.src, 3_000);
  if (!src || src.startsWith("data:")) return false;
  const type = boundedText(object.type, 80).toLowerCase();
  return (
    type.includes("image") ||
    object.oceanleoKind === "image" ||
    object.oceanleoKind === "signature"
  );
}

function snapshotDependencies(
  snapshot: ImageEditorSnapshot,
): {
  snapshot: ImageEditorSnapshot;
  dependencies: ImageSceneDependency[];
} {
  const durable = cloneSnapshot(snapshot);
  const dependencies: ImageSceneDependency[] = [];
  const ids = new Set<string>();
  walkObjects(durable.json.objects, (object, path) => {
    if (!isExternalImageObject(object)) return;
    const id = boundedText(object.oceanleoId, 300);
    if (!record(object.oceanleoDependency)) {
      throw new ImageSceneSourceError(
        "missing-dependency",
        `图片图层 ${id || path} 缺少 durable dependency metadata。`,
        id || path,
      );
    }
    const dependency = normalizeDependency(object.oceanleoDependency, dependencies.length);
    if (!id || dependency.id !== id) {
      throw new ImageSceneSourceError(
        "missing-dependency",
        `图片图层 ${id || path} 没有与对象 identity 一致的依赖记录。`,
        id || path,
      );
    }
    if (ids.has(id)) {
      throw new ImageSceneSourceError(
        "invalid-scene",
        `图片 scene 含有重复图层 identity：${id}。`,
        id,
      );
    }
    ids.add(id);
    object.src = dependency.url;
    object.oceanleoDependency = dependency;
    dependencies.push(dependency);
  });
  return { snapshot: durable, dependencies: sortedDependencies(dependencies) };
}

async function dependencyClosureDigest(
  revision: number,
  dependencies: readonly ImageSceneDependency[],
): Promise<string> {
  return sha256Text(
    `${stableJson({
      schema: IMAGE_DEPENDENCY_CLOSURE_SCHEMA,
      revision,
      dependencies: sortedDependencies(dependencies),
    })}\n`,
  );
}

function revisionPayload(
  source: Omit<ImageSceneSource, "revisionDigest">,
): Omit<ImageSceneSource, "revisionDigest"> {
  return source;
}

async function imageSceneRevisionDigest(
  source: Omit<ImageSceneSource, "revisionDigest">,
): Promise<string> {
  return sha256Text(`${stableJson(revisionPayload(source))}\n`);
}

export async function createImageSceneSource(input: {
  snapshot: ImageEditorSnapshot;
  revision: number;
  artifactId: string;
  baseRevisionId: string;
  updatedAt?: string;
}): Promise<ImageSceneSource> {
  const snapshot = normalizeImageEditorSnapshot(input.snapshot);
  const revision = Math.trunc(input.revision);
  const artifactId = input.artifactId.trim();
  const baseRevisionId = input.baseRevisionId.trim();
  if (
    !snapshot ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !artifactId ||
    !baseRevisionId
  ) {
    throw new ImageSceneSourceError(
      "invalid-scene",
      "图片 scene 缺少有效 snapshot、revision 或 artifact identity。",
    );
  }
  const collected = snapshotDependencies(snapshot);
  if (collected.dependencies.length > MAX_DEPENDENCIES) {
    throw new ImageSceneSourceError(
      "invalid-scene",
      `图片 scene 依赖超过 ${MAX_DEPENDENCIES} 项安全上限。`,
    );
  }
  const closureDigest = await dependencyClosureDigest(
    revision,
    collected.dependencies,
  );
  const sourceWithoutDigest: Omit<ImageSceneSource, "revisionDigest"> = {
    schema: IMAGE_SCENE_SOURCE_SCHEMA,
    version: 1,
    artifactType: "composite_image",
    revision,
    updatedAt: input.updatedAt || new Date().toISOString(),
    baseArtifact: { artifactId, revisionId: baseRevisionId },
    sceneGraph: {
      schema: IMAGE_SCENE_GRAPH_SCHEMA,
      revision,
      snapshot: collected.snapshot,
    },
    dependencyClosure: {
      schema: IMAGE_DEPENDENCY_CLOSURE_SCHEMA,
      revision,
      digest: closureDigest,
      dependencies: collected.dependencies,
    },
  };
  return {
    ...sourceWithoutDigest,
    revisionDigest: await imageSceneRevisionDigest(sourceWithoutDigest),
  };
}

export async function parseImageSceneSource(
  value: unknown,
): Promise<ImageSceneSource> {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new ImageSceneSourceError(
        "invalid-scene",
        "图片 scene 不是有效 JSON。",
      );
    }
  }
  const source = record(parsed);
  const baseArtifact = record(source?.baseArtifact);
  const sceneGraph = record(source?.sceneGraph);
  const closure = record(source?.dependencyClosure);
  const revision = source?.revision;
  const snapshot = normalizeImageEditorSnapshot(sceneGraph?.snapshot);
  if (
    !source ||
    source.schema !== IMAGE_SCENE_SOURCE_SCHEMA ||
    source.version !== 1 ||
    source.artifactType !== "composite_image" ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !boundedText(source.updatedAt, 100) ||
    !baseArtifact ||
    !boundedText(baseArtifact.artifactId, 300) ||
    !boundedText(baseArtifact.revisionId, 300) ||
    sceneGraph?.schema !== IMAGE_SCENE_GRAPH_SCHEMA ||
    sceneGraph.revision !== revision ||
    !snapshot ||
    closure?.schema !== IMAGE_DEPENDENCY_CLOSURE_SCHEMA ||
    closure.revision !== revision ||
    !Array.isArray(closure.dependencies) ||
    closure.dependencies.length > MAX_DEPENDENCIES
  ) {
    throw new ImageSceneSourceError(
      "revision-mismatch",
      "图片 scene schema、snapshot 或 revision 不一致。",
    );
  }
  const dependencies = sortedDependencies(
    closure.dependencies.map((entry, index) => normalizeDependency(entry, index)),
  );
  const ids = new Set<string>();
  for (const dependency of dependencies) {
    if (ids.has(dependency.id)) {
      throw new ImageSceneSourceError(
        "invalid-scene",
        `图片 scene dependency identity 重复：${dependency.id}。`,
        dependency.id,
      );
    }
    ids.add(dependency.id);
  }
  const collected = snapshotDependencies(snapshot);
  const declaredById = new Map(
    dependencies.map((dependency) => [dependency.id, dependency]),
  );
  for (const dependency of collected.dependencies) {
    const declared = declaredById.get(dependency.id);
    if (!declared) {
      throw new ImageSceneSourceError(
        "missing-dependency",
        `图片 scene 依赖闭包缺少图层 ${dependency.id}。`,
        dependency.id,
      );
    }
    if (stableJson(declared) !== stableJson(dependency)) {
      throw new ImageSceneSourceError(
        "dependency-digest-mismatch",
        `图片 scene 图层 ${dependency.id} 与依赖闭包不一致。`,
        dependency.id,
      );
    }
  }
  const usedIds = new Set(
    collected.dependencies.map((dependency) => dependency.id),
  );
  const orphan = dependencies.find((dependency) => !usedIds.has(dependency.id));
  if (orphan) {
    throw new ImageSceneSourceError(
      "orphan-dependency",
      `图片 scene 声明了未被任何图层引用的依赖 ${orphan.id}。`,
      orphan.id,
    );
  }
  const expectedClosureDigest = await dependencyClosureDigest(
    revision,
    dependencies,
  );
  if (
    !normalizedDigest(closure.digest) ||
    normalizedDigest(closure.digest) !== expectedClosureDigest
  ) {
    throw new ImageSceneSourceError(
      "dependency-digest-mismatch",
      "图片 scene dependency closure digest 不一致。",
    );
  }
  const normalizedWithoutDigest: Omit<ImageSceneSource, "revisionDigest"> = {
    schema: IMAGE_SCENE_SOURCE_SCHEMA,
    version: 1,
    artifactType: "composite_image",
    revision,
    updatedAt: boundedText(source.updatedAt, 100),
    baseArtifact: {
      artifactId: boundedText(baseArtifact.artifactId, 300),
      revisionId: boundedText(baseArtifact.revisionId, 300),
    },
    sceneGraph: {
      schema: IMAGE_SCENE_GRAPH_SCHEMA,
      revision,
      snapshot: collected.snapshot,
    },
    dependencyClosure: {
      schema: IMAGE_DEPENDENCY_CLOSURE_SCHEMA,
      revision,
      digest: expectedClosureDigest,
      dependencies,
    },
  };
  const expectedRevisionDigest = await imageSceneRevisionDigest(
    normalizedWithoutDigest,
  );
  if (normalizedDigest(source.revisionDigest) !== expectedRevisionDigest) {
    throw new ImageSceneSourceError(
      "revision-digest-mismatch",
      "图片 scene revision digest 与结构化 source 不一致。",
    );
  }
  return {
    ...normalizedWithoutDigest,
    revisionDigest: expectedRevisionDigest,
  };
}

export function serializeImageSceneSource(source: ImageSceneSource): string {
  return `${stableJson(source)}\n`;
}

export function imageSceneDependencyRevisionIds(
  source: ImageSceneSource,
): string[] {
  return [
    ...new Set(
      source.dependencyClosure.dependencies.flatMap((dependency) =>
        dependency.revisionId ? [dependency.revisionId] : [],
      ),
    ),
  ].sort();
}

export async function artifactSceneClosureDigest(
  sourceDigest: string,
): Promise<string> {
  const digest = normalizedDigest(sourceDigest);
  if (!digest) {
    throw new ImageSceneSourceError(
      "invalid-scene",
      "图片 scene source digest 无效。",
    );
  }
  return sha256Text(
    `${stableJson({
      entrypoint: IMAGE_SCENE_ENTRYPOINT,
      dependencies: [
        {
          path: IMAGE_SCENE_ENTRYPOINT,
          sha256: digest,
          mediaType: "application/json",
        },
      ],
    })}\n`,
  );
}

export interface ImageSceneRevisionBundle {
  source: ImageSceneSource;
  sourceText: string;
  sourceDigest: string;
  artifactClosureDigest: string;
  dependencyRevisionIds: string[];
}

export interface ImageSceneArtifactRevisionIdentity {
  artifactId: string;
  revisionId: string;
}

/**
 * Produces the exact content-addressed payload used by the artifact commit.
 * Keeping this pure lets save/reopen verification exercise the same bytes as
 * the network persistence path without weakening the atomic publish boundary.
 */
export async function createImageSceneRevisionBundle(input: {
  snapshot: ImageEditorSnapshot;
  revision: number;
  artifactId: string;
  baseRevisionId: string;
  updatedAt?: string;
}): Promise<ImageSceneRevisionBundle> {
  const source = await createImageSceneSource(input);
  const sourceText = serializeImageSceneSource(source);
  const sourceDigest = await sha256Text(sourceText);
  return {
    source,
    sourceText,
    sourceDigest,
    artifactClosureDigest: await artifactSceneClosureDigest(sourceDigest),
    dependencyRevisionIds: imageSceneDependencyRevisionIds(source),
  };
}

/**
 * Repin a validated local scene after an explicit current-head lookup.
 *
 * This is intentionally not an automatic merge or publish operation. The
 * caller owns conflict review, then must persist the returned source through a
 * fresh CAS using `currentHead.revisionId`.
 */
export async function rebaseImageSceneSourceToCurrent(
  value: unknown,
  staleBase: ImageSceneArtifactRevisionIdentity,
  currentHead: ImageSceneArtifactRevisionIdentity,
): Promise<ImageSceneSource> {
  const source = await parseImageSceneSource(value);
  const staleArtifactId = staleBase.artifactId.trim();
  const staleRevisionId = staleBase.revisionId.trim();
  const currentArtifactId = currentHead.artifactId.trim();
  const currentRevisionId = currentHead.revisionId.trim();
  if (
    !staleArtifactId ||
    !staleRevisionId ||
    !currentArtifactId ||
    !currentRevisionId ||
    staleArtifactId !== currentArtifactId ||
    staleRevisionId === currentRevisionId ||
    source.baseArtifact.artifactId !== staleArtifactId ||
    source.baseArtifact.revisionId !== staleRevisionId
  ) {
    throw new ImageSceneSourceError(
      "revision-mismatch",
      "图片 scene 只能从精确 stale base 显式 rebase 到同一 root 的不同 current revision。",
    );
  }
  const rebasedWithoutDigest: Omit<ImageSceneSource, "revisionDigest"> = {
    schema: source.schema,
    version: source.version,
    artifactType: source.artifactType,
    revision: source.revision,
    updatedAt: source.updatedAt,
    baseArtifact: {
      artifactId: currentArtifactId,
      revisionId: currentRevisionId,
    },
    sceneGraph: source.sceneGraph,
    dependencyClosure: source.dependencyClosure,
  };
  return {
    ...rebasedWithoutDigest,
    revisionDigest: await imageSceneRevisionDigest(rebasedWithoutDigest),
  };
}

export function imageSceneWithResolvedDependencies(
  source: ImageSceneSource,
  dependencies: readonly ImageSceneDependency[],
  canvasUrls: ReadonlyMap<string, string> = new Map(),
): ImageEditorSnapshot {
  const byId = new Map(dependencies.map((dependency) => [dependency.id, dependency]));
  const snapshot = cloneSnapshot(source.sceneGraph.snapshot);
  walkObjects(snapshot.json.objects, (object) => {
    if (!isExternalImageObject(object)) return;
    const id = boundedText(object.oceanleoId, 300);
    const dependency = byId.get(id);
    if (!dependency) {
      throw new ImageSceneSourceError(
        "missing-dependency",
        `重开图片 scene 时缺少图层依赖 ${id || "unknown"}。`,
        id || undefined,
      );
    }
    object.src = canvasUrls.get(id) || dependency.url;
    object.oceanleoDependency = dependency;
  });
  return snapshot;
}

export function isLikelyExpiringUrl(url: string): boolean {
  try {
    const keys = [...new URL(url).searchParams.keys()].map((key) =>
      key.toLowerCase(),
    );
    return keys.some((key) =>
      [
        "expires",
        "expires_at",
        "expiry",
        "se",
        "x-amz-date",
        "x-amz-expires",
        "x-amz-signature",
        "x-oss-date",
        "x-oss-expires",
        "x-oss-signature",
        "ossaccesskeyid",
        "signature",
        "token",
      ].includes(key),
    );
  } catch {
    return false;
  }
}

export function imageDependencyNeedsRefresh(
  dependency: ImageSceneDependency,
  now = Date.now(),
  skewMs = 60_000,
): boolean {
  if (dependency.expiresAt) {
    const expires = Date.parse(dependency.expiresAt);
    if (Number.isFinite(expires)) return expires <= now + skewMs;
  }
  return isLikelyExpiringUrl(dependency.url) && !dependency.expiresAt;
}

export function assertImageDependencyAccess(
  dependency: ImageSceneDependency,
  isTrustedUrl: (url: string) => boolean,
  now = Date.now(),
): void {
  if (
    imageDependencyNeedsRefresh(dependency, now) &&
    (!dependency.artifactId || !dependency.revisionId)
  ) {
    throw new ImageSceneSourceError(
      "expired-dependency",
      `图层依赖 ${dependency.id} 使用已过期或不可续签的 URL。`,
      dependency.id,
    );
  }
  if (!isTrustedUrl(dependency.url)) {
    throw new ImageSceneSourceError(
      "cross-origin-dependency",
      `图层依赖 ${dependency.id} 指向未托管的跨域资源。`,
      dependency.id,
    );
  }
}
