"use client";

import {
  createArtifactRevision,
  forkArtifact,
  getCurrentArtifactItem,
} from "./artifact-client";
import {
  fetchMediaBlob,
  isFirstPartyMediaUrl,
  unwrapMediaProxyUrl,
} from "../lib/media-proxy";
import { uploadFile } from "../lib/database";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "./library-data";

export const DESIGN_SOURCE_FORMAT = "oceanleo.design-document.v1";
export const DESIGN_SCENE_SCHEMA = "oceanleo.design-scene.v1";
const DESIGN_DEPENDENCY_SCHEMA = "oceanleo.dependency-manifest.v1";
const DESIGN_HISTORY_SCHEMA = "oceanleo.design-history.v1";
const MAX_DEPENDENCIES = 1_024;
const MAX_DESIGN_ELEMENTS = 100_000;
const MAX_DURABLE_MEDIA_URL_LENGTH = 4_096;
const MAX_INLINE_IMAGE_SOURCE_LENGTH = 20_000_000;

type JsonRecord = Record<string, unknown>;

export type DesignCompositeSourceKind =
  | "canonical"
  | "flat-template"
  | "published-package";
export type DesignCompositeSourceMode = "layered" | "flattened";
export type DesignCompositeRecovery =
  | "none"
  | "retry"
  | "reload-current-revision";

export class DesignCompositeCommitError extends Error {
  readonly code: string;
  readonly currentRevisionId?: string;
  readonly recovery: DesignCompositeRecovery;
  readonly recoverable: boolean;

  constructor(
    message: string,
    code = "design-commit-failed",
    currentRevisionId?: string,
    recovery?: DesignCompositeRecovery,
  ) {
    super(message);
    this.name = "DesignCompositeCommitError";
    this.code = code;
    this.currentRevisionId = currentRevisionId;
    this.recovery =
      recovery ||
      (currentRevisionId
        ? "reload-current-revision"
        : [
              "network-error",
              "revision-conflict-unresolved",
              "transient-persistence-failed",
            ].includes(code)
          ? "retry"
          : "none");
    this.recoverable = this.recovery !== "none";
  }
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown, maximum = 3_000): string {
  return typeof value === "string" && value.trim().length <= maximum
    ? value.trim()
    : "";
}

function normalizedDigest(value: string): string {
  return value.trim().toLowerCase().replace(/^sha256:/, "");
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const first = [...new Set(left)].sort();
  const second = [...new Set(right)].sort();
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function expiringUrl(value: string): boolean {
  try {
    const keys = [...new URL(value).searchParams.keys()].map((key) =>
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
        "x-oss-signature",
        "ossaccesskeyid",
        "signature",
        "token",
      ].includes(key),
    );
  } catch {
    return true;
  }
}

export function isDurableFirstPartyMediaUrl(value: string): boolean {
  // Runtime canvas may hold gateway /v1/media/proxy?url=… wrappers; durable
  // identity always evaluates the nested first-party source (design-deco OSS,
  // gateway assets, supabase public), never the proxy hop itself.
  const candidate = unwrapMediaProxyUrl(value);
  if (!candidate || candidate.length > 4_096 || expiringUrl(candidate)) {
    return false;
  }
  try {
    const parsed = new URL(candidate);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash &&
      (!parsed.port || parsed.port === "443") &&
      isFirstPartyMediaUrl(parsed.toString())
    );
  } catch {
    return false;
  }
}

export function isFirstPartyHttpsMediaUrl(value: string): boolean {
  const candidate = unwrapMediaProxyUrl(value);
  if (!candidate || candidate.length > 4_096) return false;
  try {
    const parsed = new URL(candidate);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash &&
      (!parsed.port || parsed.port === "443") &&
      isFirstPartyMediaUrl(parsed.toString())
    );
  } catch {
    return false;
  }
}

interface DesignDependencyReference {
  id: string;
  url: string;
  sourceArtifactId?: string;
  sourceRevisionId?: string;
}

function validInlineImageDataUrl(value: string): boolean {
  if (
    !value.toLowerCase().startsWith("data:image/") ||
    value.length > MAX_INLINE_IMAGE_SOURCE_LENGTH
  ) {
    return false;
  }
  const comma = value.indexOf(",");
  if (comma <= "data:image/".length || comma > 512 || comma === value.length - 1) {
    return false;
  }
  const header = value.slice(0, comma);
  return /^data:image\/[a-z0-9.+-]+(?:;[^,\r\n]*)?$/i.test(header);
}

function designImageSource(value: unknown, label: string): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") {
    throw new DesignCompositeCommitError(
      `design ${label} 图片引用不是字符串。`,
      "design-source-invalid-structure",
    );
  }
  const candidate = unwrapMediaProxyUrl(value);
  if (!candidate) return "";
  if (candidate.toLowerCase().startsWith("data:")) {
    if (!validInlineImageDataUrl(candidate)) {
      throw new DesignCompositeCommitError(
        `design ${label} 包含无效或过大的内联图片。`,
        "design-source-invalid-structure",
      );
    }
    return candidate;
  }
  if (candidate.length > MAX_DURABLE_MEDIA_URL_LENGTH) {
    throw new DesignCompositeCommitError(
      `design ${label} 图片引用超过安全长度。`,
      "design-source-invalid-structure",
    );
  }
  if (candidate.startsWith("blob:")) return candidate;
  if (!isDurableFirstPartyMediaUrl(candidate)) {
    throw new DesignCompositeCommitError(
      `design ${label} 图片引用不是受信任的耐久 URL。`,
      "invalid-dependency",
    );
  }
  return candidate;
}

function alternateDurableImageSource(
  value: unknown,
  label: string,
): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") {
    throw new DesignCompositeCommitError(
      `design ${label} 的 alternate source 不是字符串。`,
      "design-source-invalid-structure",
    );
  }
  const candidate = unwrapMediaProxyUrl(value);
  if (!candidate) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate) && !candidate.startsWith("/")) {
    // Legacy metadata may contain a human-readable source label such as
    // "provider"; it is not an alternate media reference.
    return "";
  }
  if (
    candidate.length > MAX_DURABLE_MEDIA_URL_LENGTH ||
    !isDurableFirstPartyMediaUrl(candidate)
  ) {
    throw new DesignCompositeCommitError(
      `design ${label} 的 alternate source 不是受信任的耐久 URL。`,
      "invalid-dependency",
    );
  }
  return candidate;
}

function designImageDependency(
  id: string,
  rawUrl: unknown,
  rawMetadata: unknown,
): DesignDependencyReference | null {
  const metadata =
    rawMetadata === undefined || rawMetadata === null
      ? null
      : record(rawMetadata);
  if (rawMetadata !== undefined && rawMetadata !== null && !metadata) {
    throw new DesignCompositeCommitError(
      `design dependency ${id} 的 metadata 结构无效。`,
      "design-source-invalid-structure",
    );
  }
  const sourceArtifactId = text(metadata?.sourceArtifactId, 300);
  const sourceRevisionId = text(metadata?.sourceRevisionId, 300);
  if (Boolean(sourceArtifactId) !== Boolean(sourceRevisionId)) {
    throw new DesignCompositeCommitError(
      `design dependency ${id} 的 artifact/revision identity 不完整。`,
      "invalid-dependency",
    );
  }
  const renderSource = designImageSource(rawUrl, id);
  const renderSourceKind = renderSource.slice(0, 5).toLowerCase();
  const durableSource =
    renderSource &&
    renderSourceKind !== "data:" &&
    renderSourceKind !== "blob:"
      ? renderSource
      : alternateDurableImageSource(metadata?.source, id);
  if (renderSourceKind === "blob:" && !durableSource) {
    throw new DesignCompositeCommitError(
      `design dependency ${id} 只有临时 blob 且没有耐久引用。`,
      "invalid-dependency",
    );
  }
  if (!durableSource) {
    // Empty image slots are legitimate placeholders and data URLs are
    // self-contained. Neither creates an external dependency closure entry.
    return null;
  }
  return {
    id,
    url: durableSource,
    ...(sourceArtifactId ? { sourceArtifactId } : {}),
    ...(sourceRevisionId ? { sourceRevisionId } : {}),
  };
}

function designDocumentDependencies(
  value: unknown,
  prefix: string,
): DesignDependencyReference[] {
  const document = record(value);
  const documentId = text(document?.id, 300);
  if (!document || !documentId) {
    throw new DesignCompositeCommitError(
      `design ${prefix} document 缺少 identity。`,
      "invalid-source",
    );
  }
  const dependencies: DesignDependencyReference[] = [];
  const add = (id: string, rawUrl: unknown, rawMetadata?: unknown) => {
    const dependency = designImageDependency(id, rawUrl, rawMetadata);
    if (dependency) dependencies.push(dependency);
  };
  const collectElements = (rawElements: unknown, path: string) => {
    if (rawElements === undefined) return;
    if (
      !Array.isArray(rawElements) ||
      rawElements.length > MAX_DESIGN_ELEMENTS
    ) {
      throw new DesignCompositeCommitError(
        `design ${path} 不是有界、可恢复的 element 列表。`,
        "invalid-source",
      );
    }
    const ids = new Set<string>();
    for (const [index, rawElement] of rawElements.entries()) {
      const element = record(rawElement);
      const id = text(element?.id, 300);
      const type = text(element?.type, 80);
      const props = record(element?.props);
      if (!element || !id || !type || !props || ids.has(id)) {
        throw new DesignCompositeCommitError(
          `design ${path}[${index}] element 结构或 identity 无效。`,
          "invalid-source",
        );
      }
      ids.add(id);
      if (type === "image") {
        add(`${path}:${id}`, props.src, element.metadata);
      }
    }
  };
  const background = record(document.background);
  add(`${prefix}:background`, background?.image);
  collectElements(document.elements, `${prefix}:element`);
  if (
    document.components !== undefined &&
    !Array.isArray(document.components)
  ) {
    throw new DesignCompositeCommitError(
      `design ${prefix} components 无效。`,
      "invalid-source",
    );
  }
  for (const [index, rawComponent] of (
    Array.isArray(document.components) ? document.components : []
  ).entries()) {
    const component = record(rawComponent);
    const componentId = text(component?.id, 300);
    if (!component || !componentId) {
      throw new DesignCompositeCommitError(
        `design ${prefix} component[${index}] 缺少 identity。`,
        "invalid-source",
      );
    }
    collectElements(
      component.elements,
      `${prefix}:component:${componentId}`,
    );
  }
  if (document.artboards !== undefined && !Array.isArray(document.artboards)) {
    throw new DesignCompositeCommitError(
      `design ${prefix} artboards 无效。`,
      "invalid-source",
    );
  }
  for (const [index, rawArtboard] of (
    Array.isArray(document.artboards) ? document.artboards : []
  ).entries()) {
    const artboard = record(rawArtboard);
    const artboardId = text(artboard?.id, 300);
    if (!artboard || !artboardId) {
      throw new DesignCompositeCommitError(
        `design ${prefix} artboard[${index}] 缺少 identity。`,
        "invalid-source",
      );
    }
    add(
      `${prefix}:artboard:${artboardId}:background`,
      record(artboard.background)?.image,
    );
    collectElements(
      artboard.elements,
      `${prefix}:artboard:${artboardId}:element`,
    );
  }
  return dependencies;
}

interface NormalizedDesignCompositeEnvelope {
  envelope: JsonRecord;
  sourceKind: DesignCompositeSourceKind;
  sourceMode: DesignCompositeSourceMode;
  revision: number;
}

function declaredDesignRevision(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new DesignCompositeCommitError(
      `design ${label} revision 不是非负安全整数。`,
      "design-source-revision-mismatch",
    );
  }
  return value;
}

function flatDesignRevision(
  source: JsonRecord,
  document: JsonRecord,
): number {
  const data = record(source.data);
  const meta = record(source.meta);
  const declarations = [
    declaredDesignRevision(source.revision, "source"),
    declaredDesignRevision(data?.revision, "data"),
    declaredDesignRevision(meta?.design_document_revision, "meta"),
    declaredDesignRevision(meta?.editor_revision, "editor"),
    declaredDesignRevision(document.revision, "document"),
  ].filter((value): value is number => value !== undefined);
  const unique = [...new Set(declarations)];
  if (unique.length > 1) {
    throw new DesignCompositeCommitError(
      "design flat template 的 revision 声明互相冲突。",
      "design-source-revision-mismatch",
    );
  }
  return unique[0] ?? 0;
}

function assertFlatDesignDocument(value: JsonRecord): DesignCompositeSourceMode {
  const id = text(value.id, 300);
  const title = text(value.title, 300);
  const width = value.width;
  const height = value.height;
  const updatedAt = text(value.updatedAt, 100);
  const background = record(value.background);
  const sourceMode = value.sourceMode ?? "layered";
  if (
    !id ||
    !title ||
    typeof width !== "number" ||
    !Number.isFinite(width) ||
    width <= 0 ||
    width > 100_000 ||
    typeof height !== "number" ||
    !Number.isFinite(height) ||
    height <= 0 ||
    height > 100_000 ||
    !updatedAt ||
    !Number.isFinite(Date.parse(updatedAt)) ||
    !background ||
    (sourceMode !== "layered" && sourceMode !== "flattened")
  ) {
    throw new DesignCompositeCommitError(
      "design flat template 缺少有效的 id、尺寸、背景、时间或 sourceMode。",
      "design-source-invalid-structure",
    );
  }
  const assertElements = (raw: unknown, path: string) => {
    if (!Array.isArray(raw) || raw.length > MAX_DESIGN_ELEMENTS) {
      throw new DesignCompositeCommitError(
        `design flat template ${path} 不是有界 element 列表。`,
        "design-source-invalid-structure",
      );
    }
    const ids = new Set<string>();
    for (const [index, rawElement] of raw.entries()) {
      const element = record(rawElement);
      const elementId = text(element?.id, 300);
      const elementType = text(element?.type, 80);
      const props = record(element?.props);
      if (
        !element ||
        !elementId ||
        !elementType ||
        !props ||
        ids.has(elementId) ||
        !["x", "y", "w", "h", "rotation"].every(
          (key) =>
            typeof element[key] === "number" &&
            Number.isFinite(element[key] as number),
        )
      ) {
        throw new DesignCompositeCommitError(
          `design flat template ${path}[${index}] 结构或 identity 无效。`,
          "design-source-invalid-structure",
        );
      }
      ids.add(elementId);
    }
  };
  assertElements(value.elements, "elements");
  if (value.components !== undefined) {
    if (!Array.isArray(value.components)) {
      throw new DesignCompositeCommitError(
        "design flat template components 不是列表。",
        "design-source-invalid-structure",
      );
    }
    for (const [index, rawComponent] of value.components.entries()) {
      const component = record(rawComponent);
      if (!component || !text(component.id, 300)) {
        throw new DesignCompositeCommitError(
          `design flat template component[${index}] 缺少 identity。`,
          "design-source-invalid-structure",
        );
      }
      assertElements(component.elements, `component[${index}].elements`);
    }
  }
  if (value.artboards !== undefined) {
    if (!Array.isArray(value.artboards)) {
      throw new DesignCompositeCommitError(
        "design flat template artboards 不是列表。",
        "design-source-invalid-structure",
      );
    }
    for (const [index, rawArtboard] of value.artboards.entries()) {
      const artboard = record(rawArtboard);
      if (
        !artboard ||
        !text(artboard.id, 300) ||
        !record(artboard.background)
      ) {
        throw new DesignCompositeCommitError(
          `design flat template artboard[${index}] 结构无效。`,
          "design-source-invalid-structure",
        );
      }
      assertElements(artboard.elements, `artboard[${index}].elements`);
    }
  }
  return sourceMode;
}

function normalizeDesignCompositeEnvelope(
  source: JsonRecord,
): NormalizedDesignCompositeEnvelope {
  if (source.schema === DESIGN_SOURCE_FORMAT) {
    const scene = record(source.sceneGraph);
    const revision = declaredDesignRevision(source.revision, "source");
    const sourceMode = scene?.sourceMode;
    if (
      revision === undefined ||
      (sourceMode !== "layered" && sourceMode !== "flattened")
    ) {
      throw new DesignCompositeCommitError(
        "design canonical source 缺少 revision 或有效 sourceMode。",
        "design-source-revision-mismatch",
      );
    }
    return {
      envelope: source,
      sourceKind: "canonical",
      sourceMode,
      revision,
    };
  }
  if (source.schema !== undefined) {
    throw new DesignCompositeCommitError(
      "design source schema 不受支持。",
      "design-source-invalid-structure",
    );
  }
  const data = record(source.data);
  const document =
    record(source.document) ||
    record(data?.document) ||
    (data && text(data.id, 300) ? data : null) ||
    (text(source.id, 300) ? source : null);
  if (!document) {
    throw new DesignCompositeCommitError(
      "design source 不是可规范化的 flat template document。",
      "design-source-invalid-structure",
    );
  }
  const sourceMode = assertFlatDesignDocument(document);
  const revision = flatDesignRevision(source, document);
  const historyEntries = [document];
  const references = [
    ...designDocumentDependencies(document, "scene"),
    ...designDocumentDependencies(document, "history:0"),
  ];
  const dependencies = references.map((dependency) => ({
    id: dependency.id,
    kind: "image",
    required: true,
    url: dependency.url,
    ...(dependency.sourceArtifactId
      ? { sourceArtifactId: dependency.sourceArtifactId }
      : {}),
    ...(dependency.sourceRevisionId
      ? { sourceRevisionId: dependency.sourceRevisionId }
      : {}),
  }));
  return {
    envelope: {
      schema: DESIGN_SOURCE_FORMAT,
      version: 1,
      updatedAt: document.updatedAt,
      revision,
      artifactType: "composite_image",
      sceneGraph: {
        schema: DESIGN_SCENE_SCHEMA,
        revision,
        documentId: document.id,
        sourceMode,
      },
      dependencyManifest: {
        schema: DESIGN_DEPENDENCY_SCHEMA,
        revision,
        sceneGraphFormat: DESIGN_SOURCE_FORMAT,
        dependencies,
      },
      history: {
        schema: DESIGN_HISTORY_SCHEMA,
        entries: historyEntries,
        index: 0,
      },
      document,
    },
    sourceKind: "flat-template",
    sourceMode,
    revision,
  };
}

async function sha256Hex(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new DesignCompositeCommitError(
      "当前环境不支持 SHA-256，无法提交 design revision。",
      "digest-unavailable",
    );
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyDesignCompositeSourceDigest(
  sourceBlob: Blob,
  expectedDigest: string,
): Promise<string> {
  const expected = normalizedDigest(expectedDigest);
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    throw new DesignCompositeCommitError(
      "design source revision 缺少有效 SHA-256 digest。",
      "design-source-digest-mismatch",
    );
  }
  const actual = normalizedDigest(await sha256Hex(sourceBlob));
  if (actual !== expected) {
    throw new DesignCompositeCommitError(
      "design source 实际字节与 revision digest 不一致。",
      "design-source-digest-mismatch",
    );
  }
  return actual;
}

function imageSignature(
  blob: Blob,
  bytes: Uint8Array,
  suffix: Uint8Array,
): "png" | "jpeg" | "webp" | null {
  const png =
    blob.size >= 24 &&
    bytes.length >= 16 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    ) &&
    String.fromCharCode(...bytes.subarray(12, 16)) === "IHDR";
  const jpeg =
    blob.size >= 4 &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    suffix.length === 2 &&
    suffix[0] === 0xff &&
    suffix[1] === 0xd9;
  const webpChunk =
    bytes.length >= 16
      ? String.fromCharCode(...bytes.subarray(12, 16))
      : "";
  const declaredWebpSize =
    bytes.length >= 8
      ? bytes[4] |
        (bytes[5] << 8) |
        (bytes[6] << 16) |
        (bytes[7] << 24)
      : -1;
  const webp =
    blob.size >= 20 &&
    bytes.length >= 16 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(webpChunk) &&
    declaredWebpSize + 8 === blob.size;
  const kind = png ? "png" : jpeg ? "jpeg" : webp ? "webp" : null;
  const mime = blob.type.split(";")[0].trim().toLowerCase();
  if (!kind || !mime) return kind;
  return (
    (kind === "png" && mime === "image/png") ||
    (kind === "jpeg" && (mime === "image/jpeg" || mime === "image/jpg")) ||
    (kind === "webp" && mime === "image/webp")
  )
    ? kind
    : null;
}

function publishedPackageEvidence(source: JsonRecord): {
  dependencyDigests: string[];
  revision: number;
  sourceMode: DesignCompositeSourceMode;
} {
  const document = record(source.document);
  const width = document?.width;
  const height = document?.height;
  const elements = document?.elements;
  if (
    source.schema !== DESIGN_SOURCE_FORMAT ||
    source.sceneGraph !== undefined ||
    !document ||
    typeof width !== "number" ||
    !Number.isFinite(width) ||
    width <= 0 ||
    width > 100_000 ||
    typeof height !== "number" ||
    !Number.isFinite(height) ||
    height <= 0 ||
    height > 100_000 ||
    !Array.isArray(elements) ||
    elements.length > MAX_DESIGN_ELEMENTS
  ) {
    throw new DesignCompositeCommitError(
      "published design package 的 document/尺寸/elements 结构无效。",
      "design-source-invalid-structure",
    );
  }
  const ids = new Set<string>();
  const dependencyDigests: string[] = [];
  for (const [index, rawElement] of elements.entries()) {
    const element = record(rawElement);
    const id = text(element?.id, 300);
    const type = text(element?.type, 80);
    const props = record(element?.props);
    if (!element || !id || !type || !props || ids.has(id)) {
      throw new DesignCompositeCommitError(
        `published design package element[${index}] 结构或 identity 无效。`,
        "design-source-invalid-structure",
      );
    }
    ids.add(id);
    if (type !== "image") continue;
    const path = text(props.src, MAX_DURABLE_MEDIA_URL_LENGTH);
    const digest = normalizedDigest(text(props.sha256, 100));
    const relativePackagePath =
      Boolean(path) &&
      !path.startsWith("/") &&
      !path.includes("\\") &&
      !path.includes("?") &&
      !path.includes("#") &&
      !path.split("/").some((segment) => segment === ".." || !segment) &&
      !/^[a-z][a-z0-9+.-]*:/i.test(path);
    if (
      (!relativePackagePath && !isDurableFirstPartyMediaUrl(path)) ||
      !/^[0-9a-f]{64}$/.test(digest)
    ) {
      throw new DesignCompositeCommitError(
        `published design package image ${id} 缺少安全路径或 SHA-256。`,
        "invalid-dependency",
      );
    }
    dependencyDigests.push(digest);
  }
  if (dependencyDigests.length > MAX_DEPENDENCIES) {
    throw new DesignCompositeCommitError(
      "published design package dependency 超过安全上限。",
      "invalid-dependency",
    );
  }
  const declaredMode = document.sourceMode;
  if (
    declaredMode !== undefined &&
    declaredMode !== "layered" &&
    declaredMode !== "flattened"
  ) {
    throw new DesignCompositeCommitError(
      "published design package sourceMode 无效。",
      "design-source-invalid-structure",
    );
  }
  return {
    dependencyDigests: [...new Set(dependencyDigests)],
    revision: flatDesignRevision(source, document),
    sourceMode:
      declaredMode === "flattened" ? "flattened" : "layered",
  };
}

export interface DesignCompositeSourceEvidence {
  sourceDigest: string;
  closureDigest: string;
  dependencyRevisionIds: string[];
  sourceFormat: typeof DESIGN_SOURCE_FORMAT;
  sceneSchema: typeof DESIGN_SOURCE_FORMAT;
  revision: number;
  sourceKind: DesignCompositeSourceKind;
  sourceMode: DesignCompositeSourceMode;
  closureEvidence: "source-closure" | "scene-projection" | "candidate";
}

export interface DesignCompositeCommitEvidence
  extends DesignCompositeSourceEvidence {
  previewDigest: string;
}

export async function designArtifactClosureDigest(
  sourceDigest: string,
): Promise<string> {
  const digest = normalizedDigest(sourceDigest);
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new DesignCompositeCommitError(
      "design source digest 无效。",
      "invalid-source",
    );
  }
  const entrypoint = `scene.${DESIGN_SOURCE_FORMAT}`;
  const closureText =
    `{"dependencies":[{"mediaType":"application/json","path":${JSON.stringify(
      entrypoint,
    )},"sha256":${JSON.stringify(digest)}}],"entrypoint":${JSON.stringify(
      entrypoint,
    )}}\n`;
  return normalizedDigest(
    await sha256Hex(new Blob([closureText], { type: "application/json" })),
  );
}

function projectedDesignOpenClosure(
  item: LibraryItem,
  sourceDigest: string,
  declaredDependencyRevisionIds: readonly string[],
  declaredDependencyDigests: readonly string[] = [],
  requireSourceClosure = false,
): Pick<
  DesignCompositeSourceEvidence,
  "closureDigest" | "dependencyRevisionIds" | "closureEvidence"
> {
  if (!isDurableLibraryItem(item)) {
    throw new DesignCompositeCommitError(
      "design open closure 缺少 durable artifact identity。",
      "invalid-artifact",
    );
  }
  const source = item.artifact.renditions.source;
  const scene = item.artifact.scene;
  const sourceClosure = item.artifact.sourceClosure;
  const sceneClosureDigest = normalizedDigest(scene?.closureDigest || "");
  if (
    source?.revisionId !== item.revisionId ||
    normalizedDigest(source?.digest || "") !== sourceDigest ||
    scene?.sceneRevisionId !== item.revisionId ||
    scene.closureStatus !== "complete" ||
    !/^[0-9a-f]{64}$/.test(sceneClosureDigest) ||
    (declaredDependencyRevisionIds.length > 0 &&
      !sameStringSet(
        declaredDependencyRevisionIds,
        scene.dependencyRevisionIds,
      ))
  ) {
    throw new DesignCompositeCommitError(
      "design source bytes、revision 或 scene closure 与当前 artifact 投影不一致。",
      "incomplete-dependency-closure",
    );
  }
  if (!sourceClosure) {
    if (requireSourceClosure) {
      throw new DesignCompositeCommitError(
        "published design package 缺少服务端 source closure，不能验证相对依赖。",
        "incomplete-dependency-closure",
      );
    }
    return {
      closureDigest: sceneClosureDigest,
      dependencyRevisionIds: [...scene.dependencyRevisionIds].sort(),
      closureEvidence: "scene-projection",
    };
  }
  const dependencyDigests = [
    ...new Set([sourceDigest, ...declaredDependencyDigests]),
  ];
  if (
    sourceClosure.revisionId !== item.revisionId ||
    sourceClosure.status !== "complete" ||
    !sourceClosure.firstParty ||
    normalizedDigest(sourceClosure.sourceDigest || "") !== sourceDigest ||
    normalizedDigest(sourceClosure.digest || "") !== sceneClosureDigest ||
    !sameStringSet(
      sourceClosure.dependencyRevisionIds,
      scene.dependencyRevisionIds,
    ) ||
    !sourceClosure.dependencyDigests.includes(sourceDigest) ||
    ((requireSourceClosure || declaredDependencyDigests.length > 0) &&
      !sameStringSet(sourceClosure.dependencyDigests, dependencyDigests))
  ) {
    throw new DesignCompositeCommitError(
      "design source closure 未把 source bytes、依赖与当前 scene 固定在同一 revision。",
      "incomplete-dependency-closure",
    );
  }
  return {
    closureDigest: sceneClosureDigest,
    dependencyRevisionIds: [...scene.dependencyRevisionIds].sort(),
    closureEvidence: "source-closure",
  };
}

export async function validateDesignCompositeSource(
  sourceBlob: Blob,
  item: LibraryItem,
  options: {
    requireBaseIdentity?: boolean;
    requireBaseRevision?: boolean;
    validation?: "open" | "commit";
  } = {},
): Promise<DesignCompositeSourceEvidence> {
  if (
    !isDurableLibraryItem(item) ||
    item.artifactType !== "composite_image" ||
    item.artifact.artifactType !== "composite_image" ||
    item.artifact.editorCapability !== "design-canvas" ||
    item.artifact.sourceFormat !== DESIGN_SOURCE_FORMAT ||
    !item.artifact.integrity.ok
  ) {
    throw new DesignCompositeCommitError(
      "design source 缺少完整的 durable composite artifact identity。",
      "invalid-artifact",
    );
  }
  if (sourceBlob.size <= 0 || sourceBlob.size > 20_000_000) {
    throw new DesignCompositeCommitError(
      "design source 大小无效或超过 20MB。",
      "design-source-invalid-structure",
    );
  }
  const sourceMime = sourceBlob.type.split(";")[0].trim().toLowerCase();
  if (
    sourceMime &&
    sourceMime !== "application/json" &&
    !sourceMime.endsWith("+json")
  ) {
    throw new DesignCompositeCommitError(
      "design source 的 Content-Type 不是 JSON。",
      "design-source-invalid-json",
    );
  }
  let parsedSource: JsonRecord | null = null;
  try {
    parsedSource = record(JSON.parse(await sourceBlob.text()) as unknown);
  } catch {
    throw new DesignCompositeCommitError(
      "design source 不是有效 JSON。",
      "design-source-invalid-json",
    );
  }
  if (!parsedSource) {
    throw new DesignCompositeCommitError(
      "design source JSON 顶层不是对象。",
      "design-source-invalid-json",
    );
  }
  const sourceDigest = normalizedDigest(await sha256Hex(sourceBlob));
  if (
    options.validation === "open" &&
    parsedSource.schema === DESIGN_SOURCE_FORMAT &&
    parsedSource.sceneGraph === undefined
  ) {
    const published = publishedPackageEvidence(parsedSource);
    const closure = projectedDesignOpenClosure(
      item,
      sourceDigest,
      [],
      published.dependencyDigests,
      true,
    );
    return {
      sourceDigest,
      ...closure,
      sourceFormat: DESIGN_SOURCE_FORMAT,
      sceneSchema: DESIGN_SOURCE_FORMAT,
      revision: published.revision,
      sourceKind: "published-package",
      sourceMode: published.sourceMode,
    };
  }
  const normalized = normalizeDesignCompositeEnvelope(parsedSource);
  const source = normalized.envelope;
  const scene = record(source.sceneGraph);
  const manifest = record(source.dependencyManifest);
  const history = record(source.history);
  const document = record(source.document);
  const baseArtifact = record(source.baseArtifact);
  const dependencies = Array.isArray(manifest?.dependencies)
    ? manifest.dependencies
    : null;
  const historyEntries = Array.isArray(history?.entries)
    ? history.entries
    : null;
  const revision = normalized.revision;
  const historyIndex = history?.index;
  const updatedAt = text(source.updatedAt, 100);
  const baseArtifactId = text(baseArtifact?.artifactId, 300);
  const baseRevisionId = text(baseArtifact?.revisionId, 300);
  const hasBaseIdentity = Boolean(baseArtifactId || baseRevisionId);
  if (
    hasBaseIdentity &&
    (baseArtifactId !== item.artifactId || !baseRevisionId)
  ) {
    throw new DesignCompositeCommitError(
      "design source base artifact 与当前 artifact identity 不一致。",
      "design-source-artifact-mismatch",
    );
  }
  if (options.requireBaseIdentity !== false && !hasBaseIdentity) {
    throw new DesignCompositeCommitError(
      "design source 缺少提交所需的 base artifact identity。",
      "design-source-stale-revision",
    );
  }
  if (
    options.requireBaseRevision !== false &&
    baseRevisionId !== item.revisionId
  ) {
    throw new DesignCompositeCommitError(
      `design source base revision 已过期（expected ${item.revisionId}，received ${
        baseRevisionId || "missing"
      }）。`,
      "design-source-stale-revision",
      item.revisionId,
    );
  }
  if (
    scene &&
    manifest &&
    (scene.revision !== revision || manifest.revision !== revision)
  ) {
    throw new DesignCompositeCommitError(
      "design source、scene 与 dependency manifest revision 不一致。",
      "design-source-revision-mismatch",
    );
  }
  if (
    source.schema !== DESIGN_SOURCE_FORMAT ||
    source.version !== 1 ||
    source.artifactType !== "composite_image" ||
    !updatedAt ||
    !Number.isFinite(Date.parse(updatedAt)) ||
    scene?.schema !== DESIGN_SCENE_SCHEMA ||
    scene.sourceMode !== normalized.sourceMode ||
    !document ||
    !text(document.id, 300) ||
    scene.documentId !== document.id ||
    (document.sourceMode !== undefined &&
      document.sourceMode !== normalized.sourceMode) ||
    manifest?.schema !== DESIGN_DEPENDENCY_SCHEMA ||
    manifest.sceneGraphFormat !== DESIGN_SOURCE_FORMAT ||
    !dependencies ||
    dependencies.length > MAX_DEPENDENCIES ||
    history?.schema !== DESIGN_HISTORY_SCHEMA ||
    !historyEntries?.length ||
    !Number.isSafeInteger(historyIndex) ||
    Number(historyIndex) < 0 ||
    Number(historyIndex) >= historyEntries.length
  ) {
    throw new DesignCompositeCommitError(
      "design source 的 schema、history、scene 或 document 结构无效。",
      "design-source-invalid-structure",
    );
  }
  const expected = [
    ...designDocumentDependencies(document, "scene"),
    ...historyEntries.flatMap((entry, index) =>
      designDocumentDependencies(entry, `history:${index}`),
    ),
  ];
  if (expected.length > MAX_DEPENDENCIES) {
    throw new DesignCompositeCommitError(
      `design dependency closure 超过 ${MAX_DEPENDENCIES} 项安全上限。`,
      "invalid-dependency",
    );
  }
  const expectedById = new Map<string, DesignDependencyReference>();
  for (const dependency of expected) {
    if (expectedById.has(dependency.id)) {
      throw new DesignCompositeCommitError(
        `design dependency identity ${dependency.id} 重复。`,
        "invalid-dependency",
      );
    }
    expectedById.set(dependency.id, dependency);
  }
  const declaredById = new Map<string, DesignDependencyReference>();
  const dependencyRevisionIds: string[] = [];
  const enforceDependencyClosure = options.validation !== "open";
  for (const [index, value] of dependencies.entries()) {
    const dependency = record(value);
    const id = text(dependency?.id, 300);
    const url = alternateDurableImageSource(
      dependency?.url,
      `dependency[${index}]`,
    );
    const sourceArtifactId = text(dependency?.sourceArtifactId, 300);
    const sourceRevisionId = text(dependency?.sourceRevisionId, 300);
    if (
      !dependency ||
      !id ||
      dependency.kind !== "image" ||
      dependency.required !== true ||
      !url ||
      !isDurableFirstPartyMediaUrl(url) ||
      Boolean(sourceArtifactId) !== Boolean(sourceRevisionId) ||
      declaredById.has(id)
    ) {
      throw new DesignCompositeCommitError(
        `design dependency[${index}] 缺失、重复、跨域、会过期或 identity 不完整。`,
        "invalid-dependency",
      );
    }
    const expectedDependency = expectedById.get(id);
    if (
      enforceDependencyClosure &&
      expectedDependency?.sourceArtifactId &&
      (sourceArtifactId !== expectedDependency.sourceArtifactId ||
        sourceRevisionId !== expectedDependency.sourceRevisionId)
    ) {
      throw new DesignCompositeCommitError(
        `design dependency[${index}] 的 source artifact revision 不一致。`,
        "incomplete-dependency-closure",
      );
    }
    declaredById.set(id, {
      id,
      url,
      ...(sourceArtifactId ? { sourceArtifactId } : {}),
      ...(sourceRevisionId ? { sourceRevisionId } : {}),
    });
    if (sourceRevisionId) dependencyRevisionIds.push(sourceRevisionId);
  }
  if (!enforceDependencyClosure) {
    for (const dependency of expectedById.values()) {
      if (dependency.sourceRevisionId) {
        dependencyRevisionIds.push(dependency.sourceRevisionId);
      }
    }
  }
  const missing = [...expectedById].find(
    ([id, dependency]) => declaredById.get(id)?.url !== dependency.url,
  );
  if (enforceDependencyClosure && missing) {
    throw new DesignCompositeCommitError(
      `design dependency closure 缺少图层资源 ${missing[0]}。`,
      "incomplete-dependency-closure",
    );
  }
  const orphan = [...declaredById].find(
    ([id, dependency]) => expectedById.get(id)?.url !== dependency.url,
  );
  if (
    enforceDependencyClosure &&
    (orphan || declaredById.size !== expectedById.size)
  ) {
    throw new DesignCompositeCommitError(
      `design dependency closure 含未引用资源 ${orphan?.[0] || "unknown"}。`,
      "incomplete-dependency-closure",
    );
  }
  const closure =
    options.validation === "open"
      ? projectedDesignOpenClosure(
          item,
          sourceDigest,
          dependencyRevisionIds,
        )
      : {
          closureDigest: await designArtifactClosureDigest(sourceDigest),
          dependencyRevisionIds: [...new Set(dependencyRevisionIds)].sort(),
          closureEvidence: "candidate" as const,
        };
  return {
    sourceDigest,
    ...closure,
    sourceFormat: DESIGN_SOURCE_FORMAT,
    sceneSchema: DESIGN_SOURCE_FORMAT,
    revision,
    sourceKind: normalized.sourceKind,
    sourceMode: normalized.sourceMode,
  };
}

export async function validateDesignCompositeCommit(
  sourceBlob: Blob,
  previewBlob: Blob,
  item: LibraryItem,
): Promise<DesignCompositeCommitEvidence> {
  const sourceEvidence = await validateDesignCompositeSource(
    sourceBlob,
    item,
  );
  const [previewPrefixBuffer, previewSuffixBuffer] = await Promise.all([
    previewBlob.slice(0, 32).arrayBuffer(),
    previewBlob.slice(Math.max(0, previewBlob.size - 2)).arrayBuffer(),
  ]);
  const previewPrefix = new Uint8Array(previewPrefixBuffer);
  const previewSuffix = new Uint8Array(previewSuffixBuffer);
  if (
    previewBlob.size <= 0 ||
    previewBlob.size > 32_000_000 ||
    !imageSignature(previewBlob, previewPrefix, previewSuffix)
  ) {
    throw new DesignCompositeCommitError(
      "design preview 不是可验证的 PNG/JPEG/WebP 图片。",
      "invalid-preview",
    );
  }
  return {
    ...sourceEvidence,
    previewDigest: normalizedDigest(await sha256Hex(previewBlob)),
  };
}

export interface DesignCompositeCommitMessage {
  url: string;
  previewUrl?: string;
  revision?: number | string;
  meta?: Record<string, unknown>;
}

export interface DesignCompositeCommitDependencies {
  fetchBlob: typeof fetchMediaBlob;
  fork: typeof forkArtifact;
  publish: typeof createArtifactRevision;
  uploadSource: (blob: Blob, target: LibraryItem) => Promise<string>;
  resolveCurrentRevisionId: (artifactId: string) => Promise<string | undefined>;
}

async function resolveCurrentCompositeRevisionId(
  artifactId: string,
): Promise<string | undefined> {
  const current = await getCurrentArtifactItem(artifactId);
  if (
    !current.ok ||
    !current.data ||
    !isDurableLibraryItem(current.data) ||
    current.data.artifactId !== artifactId ||
    current.data.artifactType !== "composite_image" ||
    current.data.artifact.editorCapability !== "design-canvas" ||
    current.data.artifact.sourceFormat !== DESIGN_SOURCE_FORMAT ||
    !current.data.artifact.integrity.ok
  ) {
    return undefined;
  }
  return current.data.revisionId;
}

async function uploadRebasedDesignSource(
  blob: Blob,
  target: LibraryItem,
): Promise<string> {
  if (!isDurableLibraryItem(target)) {
    throw new DesignCompositeCommitError(
      "无法上传没有 durable identity 的 design source。",
      "invalid-artifact",
    );
  }
  const digest = await sha256Hex(blob);
  const result = await uploadFile(
    new File(
      [blob],
      `design-${target.artifactId}-${target.revisionId}.${DESIGN_SOURCE_FORMAT}.json`,
      { type: "application/json" },
    ),
    {
      siteId: "oceanleo",
      title: `${target.title} design source`,
      registerAsset: false,
      idempotencyKey: `design-source:${target.artifactId}:${target.revisionId}:${digest}`,
    },
  );
  const url = result.data?.file.url;
  if (!result.ok || !url || !isFirstPartyHttpsMediaUrl(url)) {
    throw new DesignCompositeCommitError(
      result.error || "design fork source 上传失败或返回了非 first-party URL。",
      "source-upload-failed",
    );
  }
  return url;
}

const DEFAULT_COMMIT_DEPENDENCIES: DesignCompositeCommitDependencies = {
  fetchBlob: fetchMediaBlob,
  fork: forkArtifact,
  publish: createArtifactRevision,
  uploadSource: uploadRebasedDesignSource,
  resolveCurrentRevisionId: resolveCurrentCompositeRevisionId,
};

async function rebaseDesignCompositeSource(
  sourceBlob: Blob,
  base: LibraryItem,
  target: LibraryItem,
  mode: "fork" | "cas-rebase",
): Promise<Blob> {
  if (
    !isDurableLibraryItem(base) ||
    !isDurableLibraryItem(target) ||
    base.artifactType !== "composite_image" ||
    target.artifactType !== "composite_image"
  ) {
    throw new DesignCompositeCommitError(
      "design source 无法 rebase 到非 durable composite artifact。",
      "invalid-artifact",
    );
  }
  if (
    (mode === "cas-rebase" &&
      (base.artifactId !== target.artifactId ||
        base.revisionId === target.revisionId)) ||
    (mode === "fork" && base.artifactId === target.artifactId)
  ) {
    throw new DesignCompositeCommitError(
      mode === "cas-rebase"
        ? "design CAS rebase 需要同一 root 的不同 current revision。"
        : "design fork rebase 必须切换到新的私有 artifact root。",
      "invalid-rebase-target",
    );
  }
  let parsedSource: JsonRecord;
  try {
    const parsed = record(JSON.parse(await sourceBlob.text()) as unknown);
    if (!parsed) throw new Error("not-object");
    parsedSource = parsed;
  } catch {
    throw new DesignCompositeCommitError(
      "design source rebase 前 JSON 无效。",
      "invalid-source",
    );
  }
  const source = normalizeDesignCompositeEnvelope(parsedSource).envelope;
  const previousBase = record(source.baseArtifact);
  const previousArtifactId = text(previousBase?.artifactId, 300);
  const previousRevisionId = text(previousBase?.revisionId, 300);
  if (
    (previousArtifactId || previousRevisionId) &&
    (previousArtifactId !== base.artifactId ||
      previousRevisionId !== base.revisionId)
  ) {
    throw new DesignCompositeCommitError(
      "design source 的 declared base 与 rebase 起点不一致。",
      "design-source-stale-revision",
      target.revisionId,
    );
  }
  if (
    mode === "cas-rebase" &&
    (!previousArtifactId || !previousRevisionId)
  ) {
    throw new DesignCompositeCommitError(
      "design CAS rebase 拒绝没有精确 declared base 的 source。",
      "design-source-stale-revision",
      target.revisionId,
    );
  }
  source.baseArtifact = {
    artifactId: target.artifactId,
    revisionId: target.revisionId,
  };
  return new Blob([`${JSON.stringify(source)}\n`], {
    type: "application/json",
  });
}

/**
 * Repin an already-validated local design source after the caller explicitly
 * fetched and reviewed the authoritative current head. This does not merge or
 * publish; callers must rehydrate/merge first and run commit validation again.
 */
export async function rebaseDesignCompositeSourceToCurrent(
  sourceBlob: Blob,
  staleBase: LibraryItem,
  currentHead: LibraryItem,
): Promise<Blob> {
  return rebaseDesignCompositeSource(
    sourceBlob,
    staleBase,
    currentHead,
    "cas-rebase",
  );
}

function assertDesignCommitReceipt(
  next: LibraryItem,
  target: LibraryItem & {
    artifactId: string;
    revisionId: string;
  },
  evidence: DesignCompositeCommitEvidence,
): void {
  if (!isDurableLibraryItem(next)) {
    throw new DesignCompositeCommitError(
      "design 提交回执缺少 durable artifact identity。",
      "invalid-commit-receipt",
    );
  }
  const source = next.artifact.renditions.source;
  const preview = next.artifact.renditions.preview;
  const full = next.artifact.renditions.full;
  const scene = next.artifact.scene;
  const sourceClosure = next.artifact.sourceClosure;
  if (
    next.artifactId !== target.artifactId ||
    next.revisionId === target.revisionId ||
    next.artifactType !== "composite_image" ||
    next.artifact.artifactType !== "composite_image" ||
    next.artifact.editorCapability !== "design-canvas" ||
    next.artifact.sourceFormat !== evidence.sourceFormat ||
    !next.artifact.integrity.ok ||
    !next.artifact.access.canEdit ||
    next.artifact.owner.visibility === "public" ||
    source?.revisionId !== next.revisionId ||
    !isFirstPartyHttpsMediaUrl(source?.url || "") ||
    normalizedDigest(source?.digest || "") !== evidence.sourceDigest ||
    preview?.revisionId !== next.revisionId ||
    !isFirstPartyHttpsMediaUrl(preview?.url || "") ||
    normalizedDigest(preview?.digest || "") !== evidence.previewDigest ||
    full?.revisionId !== next.revisionId ||
    !isFirstPartyHttpsMediaUrl(full?.url || "") ||
    normalizedDigest(full?.digest || "") !== evidence.previewDigest ||
    scene?.schema !== evidence.sceneSchema ||
    scene.sceneRevisionId !== next.revisionId ||
    scene.closureStatus !== "complete" ||
    normalizedDigest(scene.closureDigest || "") !== evidence.closureDigest ||
    !sameStringSet(
      scene.dependencyRevisionIds,
      evidence.dependencyRevisionIds,
    ) ||
    (sourceClosure !== undefined &&
      sourceClosure !== null &&
      (sourceClosure.revisionId !== next.revisionId ||
        sourceClosure.status !== "complete" ||
        !sourceClosure.firstParty ||
        normalizedDigest(sourceClosure.sourceDigest || "") !==
          evidence.sourceDigest ||
        normalizedDigest(sourceClosure.digest || "") !==
          evidence.closureDigest ||
        !sourceClosure.dependencyDigests.includes(evidence.sourceDigest) ||
        !sameStringSet(
          sourceClosure.dependencyRevisionIds,
          evidence.dependencyRevisionIds,
        )))
  ) {
    throw new DesignCompositeCommitError(
      "design 提交回执的 source/preview digest、scene closure 或新 head identity 不一致。",
      "invalid-commit-receipt",
    );
  }
}

export async function persistDesignCompositeCommit(
  item: LibraryItem,
  message: DesignCompositeCommitMessage,
  dependencyOverrides: Partial<DesignCompositeCommitDependencies> = {},
): Promise<LibraryItem> {
  const dependencies = {
    ...DEFAULT_COMMIT_DEPENDENCIES,
    ...dependencyOverrides,
  };
  const meta = message.meta || {};
  const editorProjectUrl = text(meta.editor_project_url);
  const designDocumentUrl = text(meta.design_document_url);
  const sourceUrl = editorProjectUrl || designDocumentUrl;
  const previewUrl = text(message.previewUrl);
  const artifactId = text(meta.artifact_id, 300);
  const artifactRevisionId = text(meta.artifact_revision_id, 300);
  const expectedRevisionId = text(
    meta.expected_artifact_revision_id,
    300,
  );
  if (
    !isDurableLibraryItem(item) ||
    meta.requires_typed_artifact_commit !== true ||
    !sourceUrl ||
    !previewUrl ||
    text(message.url) !== previewUrl ||
    (editorProjectUrl &&
      designDocumentUrl &&
      editorProjectUrl !== designDocumentUrl) ||
    !isFirstPartyHttpsMediaUrl(sourceUrl) ||
    !isFirstPartyHttpsMediaUrl(previewUrl) ||
    artifactId !== item.artifactId ||
    (meta.artifact_revision_id !== undefined &&
      artifactRevisionId !== item.revisionId) ||
    expectedRevisionId !== item.revisionId ||
    meta.artifact_type !== "composite_image" ||
    meta.editor_project_schema !== DESIGN_SOURCE_FORMAT ||
    meta.source_format !== DESIGN_SOURCE_FORMAT
  ) {
    throw new DesignCompositeCommitError(
      "design 保存缺少受控 source/preview URL、精确 base identity 或 typed commit 声明。",
      "invalid-commit-request",
    );
  }
  const [sourceBlob, previewBlob] = await Promise.all([
    dependencies.fetchBlob(sourceUrl, { maxBytes: 20_000_000 }),
    dependencies.fetchBlob(previewUrl, { maxBytes: 32_000_000 }),
  ]);
  let evidence = await validateDesignCompositeCommit(
    sourceBlob,
    previewBlob,
    item,
  );
  if (
    (message.revision !== undefined &&
      message.revision !== evidence.revision) ||
    meta.design_document_revision !== evidence.revision ||
    meta.preview_revision !== evidence.revision ||
    meta.preview_static_frame !== "final"
  ) {
    throw new DesignCompositeCommitError(
      "design source 与 save/preview revision 声明不一致。",
      "invalid-commit-request",
    );
  }
  let target = item;
  const requiresFork =
    item.artifact.owner.visibility === "public" ||
    !item.artifact.access.canEdit;
  if (requiresFork) {
    if (!item.artifact.access.canFork) {
      throw new DesignCompositeCommitError(
        "当前 design artifact 不可编辑且不允许安全 fork。",
        "unauthorized",
      );
    }
    const forked = await dependencies.fork(item);
    if (!forked.ok || !forked.data || !isDurableLibraryItem(forked.data)) {
      throw new DesignCompositeCommitError(
        forked.error || "无法为 design 模板创建私有 artifact root。",
        forked.code || "fork-failed",
      );
    }
    target = forked.data;
  }
  if (
    !isDurableLibraryItem(target) ||
    !target.artifact.access.canEdit ||
    target.artifact.owner.visibility === "public" ||
    target.artifactType !== "composite_image" ||
    target.artifact.editorCapability !== "design-canvas" ||
    target.artifact.sourceFormat !== DESIGN_SOURCE_FORMAT ||
    !target.artifact.integrity.ok ||
    (requiresFork && target.artifactId === item.artifactId)
  ) {
    throw new DesignCompositeCommitError(
      "design 保存没有私有、完整、可编辑的 artifact root。",
      "invalid-artifact",
    );
  }
  let commitSourceUrl = sourceUrl;
  if (requiresFork) {
    const rebasedSource = await rebaseDesignCompositeSource(
      sourceBlob,
      item,
      target,
      "fork",
    );
    commitSourceUrl = await dependencies.uploadSource(rebasedSource, target);
    if (!isFirstPartyHttpsMediaUrl(commitSourceUrl)) {
      throw new DesignCompositeCommitError(
        "design fork source 上传返回了非 first-party URL。",
        "source-upload-failed",
      );
    }
    const persistedSource = await dependencies.fetchBlob(commitSourceUrl, {
      maxBytes: 20_000_000,
    });
    evidence = await validateDesignCompositeCommit(
      persistedSource,
      previewBlob,
      target,
    );
  }
  const committed = await dependencies.publish(target.artifactId, {
    expectedRevisionId: target.revisionId,
    artifactType: "composite_image",
    source: {
      format: evidence.sourceFormat,
      url: commitSourceUrl,
      digest: evidence.sourceDigest,
    },
    renditions: [
      {
        purpose: "preview",
        url: previewUrl,
        digest: evidence.previewDigest,
      },
      {
        purpose: "full",
        url: previewUrl,
        digest: evidence.previewDigest,
      },
    ],
    scene: {
      schema: evidence.sceneSchema,
      closureDigest: evidence.closureDigest,
      dependencyRevisionIds: evidence.dependencyRevisionIds,
    },
    provenance: {
      editor: "design-canvas",
      source_artifact_id: item.artifactId,
      source_revision_id: item.revisionId,
      commit_base_artifact_id: target.artifactId,
      commit_base_revision_id: target.revisionId,
      design_revision: evidence.revision,
      preview_source_digest: evidence.sourceDigest,
      preview_digest: evidence.previewDigest,
      preview_static_frame: "final",
    },
  });
  if (!committed.ok || !committed.data || !isDurableLibraryItem(committed.data)) {
    let currentRevisionId: string | undefined;
    if (committed.code === "revision-conflict") {
      try {
        currentRevisionId = await dependencies.resolveCurrentRevisionId(
          target.artifactId,
        );
      } catch {
        currentRevisionId = undefined;
      }
    }
    const conflictCode =
      committed.code === "revision-conflict" && !currentRevisionId
        ? "revision-conflict-unresolved"
        : committed.code || "revision-commit-failed";
    const detail =
      committed.error || "design typed artifact revision 提交失败。";
    throw new DesignCompositeCommitError(
      committed.code === "revision-conflict"
        ? currentRevisionId
          ? `${detail} 云端 current revision 已是 ${currentRevisionId}；未覆盖远端内容，请重新载入并显式 rebase。`
          : `${detail} 未覆盖远端内容，但无法取得 authoritative current revision。`
        : detail,
      conflictCode,
      currentRevisionId,
    );
  }
  assertDesignCommitReceipt(
    committed.data,
    target,
    evidence,
  );
  return committed.data;
}
