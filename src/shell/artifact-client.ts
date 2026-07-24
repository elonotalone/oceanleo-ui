"use client";

import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";
import {
  ARTIFACT_TYPES,
  ARTIFACT_CONTEXT_MISSING_MESSAGE,
  artifactContextsEqual,
  artifactDownloadPlanFor,
  artifactUserFacingDownloadHint,
  isEditorProjectDownloadMedia,
  artifactHasExactContext,
  artifactIsVisible,
  isEnsureableTransient,
  normalizeArtifactContextRef,
  artifactSourceTreeRelativePath,
  isArtifactSourceTreeUrl,
  normalizeArtifactProjection,
  normalizeArtifactProjectionResult,
  type ArtifactApiErrorCode,
  type ArtifactCardAction,
  type ArtifactContextRef,
  type ArtifactProjection,
  type ArtifactRendition,
  type ArtifactRenditionPurpose,
  type ArtifactType,
  type TransientGenerationResult,
} from "./artifact-contract";
import {
  artifactProjectionToLibraryItem,
  isDurableLibraryItem,
  type LibraryItem,
} from "./library-data";

export interface ArtifactApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: ArtifactApiErrorCode;
  status?: number;
  retryable?: boolean;
}

export interface ArtifactSearchResult {
  items: LibraryItem[];
  nextCursor: string | null;
  total: number | null;
  ownerPrincipalId?: string | null;
  /** Internal row-level degradation evidence; never render these codes. */
  diagnostics?: {
    omittedCount: number;
    reasons: string[];
  };
}

export interface ArtifactDownloadResult {
  artifactId: string;
  revisionId: string;
  purpose: ArtifactRenditionPurpose;
  mode: "source" | "export";
  url: string;
  filename: string;
  mediaType: string;
  expiresAt: string;
}

export interface ArtifactDownloadEvidence {
  visible: boolean;
  available: boolean;
  reason: string;
  purpose: ArtifactRenditionPurpose | null;
  mode: "source" | "export" | null;
}

export const ARTIFACT_LIBRARY_CHANGE_EVENT =
  "oceanleo:artifact-library-change";

export interface ArtifactEditDecision {
  available: boolean;
  reason: string;
  editorCapability: string | null;
  item: LibraryItem;
}

export interface ArtifactRevisionCommit {
  expectedRevisionId: string;
  artifactType: ArtifactType;
  source: {
    format: string;
    url?: string;
    blobId?: string;
    digest: string;
  };
  renditions: Array<{
    purpose: "thumbnail" | "preview" | "full" | "editor_manifest";
    url?: string;
    blobId?: string;
    digest: string;
  }>;
  scene?: {
    schema: string;
    closureDigest: string;
    dependencyRevisionIds: string[];
  };
  provenance?: Record<string, unknown>;
}

interface ArtifactRequestOptions extends RequestInit {
  auth?: "required" | "optional";
  timeoutMs?: number;
}

const ENSURE_PENDING = new Map<
  string,
  {
    digest: string;
    promise: Promise<ArtifactApiResult<LibraryItem>>;
  }
>();

const ARTIFACT_LIBRARY_MAX_LIMIT = 100;
const ARTIFACT_LIBRARY_MAX_OFFSET = 100_000;
export const ARTIFACT_EDITABLE_SHELF_PER_TYPE = 5;

function boundedLibraryLimit(value: number | undefined): string {
  const requested =
    typeof value === "number" && Number.isFinite(value)
      ? Math.trunc(value)
      : 60;
  return String(Math.min(Math.max(requested, 1), ARTIFACT_LIBRARY_MAX_LIMIT));
}

function boundedLibraryOffset(value: number | string | undefined): number {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : 0;
  if (!Number.isFinite(raw)) return 0;
  return Math.min(Math.max(Math.trunc(raw), 0), ARTIFACT_LIBRARY_MAX_OFFSET);
}

function setTrimmedParam(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
): void {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}

function trustedHttpsUrl(value: unknown): string {
  const candidate = String(value || "").trim();
  if (!candidate || candidate.length > 4_096) return "";
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

const ARTIFACT_ACCESS_PATH = /^\/v1\/artifact-renditions\/access\/[^/?#]+$/;
const PUBLIC_ARTIFACT_ACCESS_PATH =
  "/v1/artifact-renditions/access/public";
const ARTIFACT_URL_FIELDS = new Set([
  "url",
  "accessUrl",
  "access_url",
  "signedUrl",
  "signed_url",
]);

/**
 * Browser-safe gateway-relative identities that may be absolutized against
 * GATEWAY_BASE. Auth-gated source-tree paths are intentionally excluded —
 * absolutizing them yields anonymous HTTPS GETs that return HTTP 401.
 */
function isGatewayRelativeArtifactAccessUrl(value: string): boolean {
  if (ARTIFACT_ACCESS_PATH.test(value)) return true;
  try {
    const parsed = new URL(value, "https://gateway.invalid");
    const keys = [...new Set(parsed.searchParams.keys())].sort();
    return (
      value.startsWith("/") &&
      !parsed.hash &&
      parsed.pathname === PUBLIC_ARTIFACT_ACCESS_PATH &&
      keys.join(",") === "artifactId,purpose,revisionId" &&
      Boolean(parsed.searchParams.get("artifactId")) &&
      Boolean(parsed.searchParams.get("revisionId")) &&
      ["thumbnail", "preview"].includes(
        parsed.searchParams.get("purpose") || "",
      )
    );
  } catch {
    return false;
  }
}

function digestField(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
}

function sameRenditionDigest(left: unknown, right: unknown): boolean {
  const a = digestField(left);
  const b = digestField(right);
  return Boolean(a && b && a === b);
}

function isOpaqueAccessUrl(value: string): boolean {
  if (ARTIFACT_ACCESS_PATH.test(value)) return true;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      ARTIFACT_ACCESS_PATH.test(parsed.pathname) &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

function trustedGatewayArtifactAccessUrl(value: unknown): string {
  const candidate = trustedHttpsUrl(value);
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    const gateway = new URL(GATEWAY_BASE);
    return parsed.origin === gateway.origin &&
      ARTIFACT_ACCESS_PATH.test(parsed.pathname) &&
      !parsed.search &&
      !parsed.hash
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
}

function safeAttachmentFilename(value: unknown): string {
  const leaf = String(value || "")
    .trim()
    .split(/[\\/]/)
    .pop() || "";
  return leaf
    .replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, "-")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 180);
}

const MEDIA_TYPE_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  "application/json": "json",
  "application/pdf": "pdf",
  "application/rtf": "rtf",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt",
  "application/msword": "doc",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/zip": "zip",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/tiff": "tiff",
  "image/webp": "webp",
  "model/gltf+json": "gltf",
  "model/gltf-binary": "glb",
  "text/csv": "csv",
  "text/html": "html",
  "text/markdown": "md",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
});

const EXTENSION_MEDIA_TYPES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(MEDIA_TYPE_EXTENSIONS).map(([mediaType, extension]) => [
      extension,
      mediaType,
    ]),
  ),
);

const GENERIC_BINARY_MEDIA_TYPES = new Set([
  "",
  "application/download",
  "application/octet-stream",
  "application/x-download",
  "binary/octet-stream",
]);

const FORMAT_EXTENSION_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  jpeg: "jpg",
  markdown: "md",
  text: "txt",
  "svg+xml": "svg",
});

function normalizedMediaType(value: unknown): string {
  const mediaType = String(value || "")
    .trim()
    .toLowerCase()
    .split(";", 1)[0]!;
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mediaType)
    ? mediaType
    : "";
}

function attachmentExtension(
  formatValue: unknown,
  mediaTypeValue: unknown,
  purpose: ArtifactRenditionPurpose,
): string {
  const mediaType = normalizedMediaType(mediaTypeValue);
  if (purpose === "editor_manifest") return "";
  if (MEDIA_TYPE_EXTENSIONS[mediaType]) {
    return MEDIA_TYPE_EXTENSIONS[mediaType];
  }
  if (!GENERIC_BINARY_MEDIA_TYPES.has(mediaType)) return "";
  const format = String(formatValue || "").trim().toLowerCase();
  const canonical = FORMAT_EXTENSION_ALIASES[format] || format;
  return EXTENSION_MEDIA_TYPES[canonical] ? canonical : "";
}

function attachmentMediaType(value: unknown, extension: string): string {
  const mediaType = normalizedMediaType(value);
  if (MEDIA_TYPE_EXTENSIONS[mediaType] === extension) return mediaType;
  if (GENERIC_BINARY_MEDIA_TYPES.has(mediaType)) {
    return EXTENSION_MEDIA_TYPES[extension] || "";
  }
  return "";
}

function attachmentFilename(
  title: unknown,
  supplied: unknown,
  extension: string,
): string {
  const suppliedName = safeAttachmentFilename(supplied);
  const fallbackName = safeAttachmentFilename(title) || "artifact";
  const suppliedIsGeneric = /^artifact(?:\.[a-z0-9]{1,12})?$/i.test(
    suppliedName,
  );
  let stem = suppliedName && !suppliedIsGeneric ? suppliedName : fallbackName;
  if (!extension) return stem;
  const suffix = `.${extension}`;
  if (stem.toLowerCase().endsWith(suffix)) return stem;
  if (suppliedName && /\.[a-z0-9]{1,12}$/i.test(stem)) {
    stem = stem.slice(0, stem.lastIndexOf(".")) || "artifact";
  }
  return `${stem.slice(0, Math.max(1, 180 - suffix.length))}${suffix}`;
}

function qualifyUrlField(entry: string): string {
  // Never absolutize auth-gated source-tree paths for anonymous browser GETs.
  const sourceTreeRelative = artifactSourceTreeRelativePath(entry);
  if (sourceTreeRelative) return sourceTreeRelative;
  if (!isGatewayRelativeArtifactAccessUrl(entry)) return entry;
  const qualified = new URL(
    entry,
    `${GATEWAY_BASE.replace(/\/+$/, "")}/`,
  ).toString();
  return trustedHttpsUrl(qualified) || entry;
}

function rewriteSourceTreeUrlsInProjection(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(rewriteSourceTreeUrlsInProjection);
  }
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    next[key] = rewriteSourceTreeUrlsInProjection(entry);
  }

  const source =
    next.source && typeof next.source === "object" && !Array.isArray(next.source)
      ? (next.source as Record<string, unknown>)
      : null;
  const full =
    next.full && typeof next.full === "object" && !Array.isArray(next.full)
      ? (next.full as Record<string, unknown>)
      : null;
  if (source && typeof source.url === "string" && isArtifactSourceTreeUrl(source.url)) {
    const accessCandidate =
      (typeof source.accessUrl === "string" && source.accessUrl) ||
      (typeof source.access_url === "string" && source.access_url) ||
      "";
    let opaque = "";
    if (isOpaqueAccessUrl(accessCandidate)) {
      opaque = qualifyUrlField(accessCandidate);
    } else if (
      full &&
      typeof full.url === "string" &&
      isOpaqueAccessUrl(full.url) &&
      sameRenditionDigest(source.digest, full.digest)
    ) {
      opaque = qualifyUrlField(full.url);
    }
    if (opaque && isOpaqueAccessUrl(opaque)) {
      next.source = {
        ...source,
        url: opaque,
        accessUrl: opaque,
        access_url: opaque,
      };
    } else {
      const relative = artifactSourceTreeRelativePath(source.url);
      next.source = {
        ...source,
        url: relative || source.url,
        ...(typeof source.accessUrl === "string" &&
        isArtifactSourceTreeUrl(source.accessUrl)
          ? {
              accessUrl:
                artifactSourceTreeRelativePath(source.accessUrl) ||
                source.accessUrl,
            }
          : {}),
        ...(typeof source.access_url === "string" &&
        isArtifactSourceTreeUrl(source.access_url)
          ? {
              access_url:
                artifactSourceTreeRelativePath(source.access_url) ||
                source.access_url,
            }
          : {}),
      };
    }
  }
  return next;
}

function qualifyArtifactAccessUrls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(qualifyArtifactAccessUrls);
  if (!value || typeof value !== "object") return value;
  const qualified = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (ARTIFACT_URL_FIELDS.has(key) && typeof entry === "string") {
        return [key, qualifyUrlField(entry)];
      }
      return [key, qualifyArtifactAccessUrls(entry)];
    }),
  );
  return rewriteSourceTreeUrlsInProjection(qualified);
}

/**
 * Edit mounts must not hand browsers a naked source-tree API URL. Prefer an
 * already-issued opaque access URL; otherwise mint a source grant (Bearer).
 */
async function upgradeSourceTreeForEditor(
  projection: ArtifactProjection,
  signal?: AbortSignal,
): Promise<ArtifactProjection> {
  const source = projection.renditions.source;
  if (!source?.url || !isArtifactSourceTreeUrl(source.url)) {
    return projection;
  }
  const full = projection.renditions.full;
  if (
    full?.url &&
    isOpaqueAccessUrl(full.url) &&
    sameRenditionDigest(source.digest, full.digest)
  ) {
    const opaque = trustedHttpsUrl(full.url) || full.url;
    if (isOpaqueAccessUrl(opaque)) {
      return {
        ...projection,
        renditions: {
          ...projection.renditions,
          source: { ...source, url: opaque },
        },
      };
    }
  }
  const grant = await artifactRequest<unknown>(
    `/v1/artifacts/${encodeURIComponent(
      projection.artifactId,
    )}/revisions/${encodeURIComponent(
      projection.revisionId,
    )}/renditions/source?mode=source`,
    { signal },
  );
  if (!grant.ok || !grant.data || typeof grant.data !== "object") {
    // Leave relative source-tree; never absolutize into an anonymous 401 URL.
    return projection;
  }
  const raw = grant.data as Record<string, unknown>;
  const rawGrantUrl = String(
    raw.accessUrl || raw.access_url || raw.url || "",
  ).trim();
  // Grants commonly return gateway-relative opaque paths; absolutize before trust.
  const grantUrl =
    trustedGatewayArtifactAccessUrl(rawGrantUrl) ||
    (isOpaqueAccessUrl(rawGrantUrl) ? qualifyUrlField(rawGrantUrl) : "") ||
    trustedGatewayArtifactAccessUrl(qualifyUrlField(rawGrantUrl));
  if (!grantUrl || !isOpaqueAccessUrl(grantUrl)) return projection;
  return {
    ...projection,
    renditions: {
      ...projection.renditions,
      source: { ...source, url: grantUrl },
    },
  };
}

function apiErrorCode(value: unknown, status?: number): ArtifactApiErrorCode {
  const envelope =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const detail =
    envelope.detail &&
    typeof envelope.detail === "object" &&
    !Array.isArray(envelope.detail)
      ? (envelope.detail as Record<string, unknown>)
      : {};
  const raw = String(
    envelope.code ||
      envelope.error_code ||
      detail.code ||
      detail.error_code ||
      "",
  )
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
  const known = new Set<ArtifactApiErrorCode>([
    "unauthorized",
    "not-found",
    "unsupported-type",
    "missing-source",
    "license-restricted",
    "revision-conflict",
    "invalid-binding",
    "integrity-failed",
    "transient-persistence-failed",
    "network-error",
    "invalid-response",
    "unknown",
  ]);
  if (known.has(raw as ArtifactApiErrorCode)) {
    return raw as ArtifactApiErrorCode;
  }
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not-found";
  if (status === 409) return "revision-conflict";
  return "unknown";
}

function errorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const detail =
    raw.detail && typeof raw.detail === "object" && !Array.isArray(raw.detail)
      ? (raw.detail as Record<string, unknown>)
      : null;
  for (const candidate of [
    detail?.message,
    detail?.error,
    typeof raw.detail === "string" ? raw.detail : null,
    raw.message,
    raw.error,
  ]) {
    if (
      (typeof candidate === "string" || typeof candidate === "number") &&
      String(candidate).trim()
    ) {
      return String(candidate).trim();
    }
  }
  return fallback;
}

async function artifactRequest<T>(
  path: string,
  options: ArtifactRequestOptions = {},
): Promise<ArtifactApiResult<T>> {
  const {
    auth = "required",
    timeoutMs = 20_000,
    signal: callerSignal,
    ...init
  } = options;
  let token: string | null;
  try {
    token = await accessToken();
  } catch (error) {
    if (auth === "optional") {
      token = null;
    } else {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "无法读取当前登录凭据。",
        code: "network-error",
        status: 0,
        retryable: true,
      };
    }
  }
  if (auth === "required" && !token) {
    return {
      ok: false,
      error: "登录后才能访问素材库。",
      code: "unauthorized",
      status: 401,
      retryable: false,
    };
  }
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abort();
  else callerSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort("timeout");
  }, timeoutMs);
  try {
    const response = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
    let payload: unknown = null;
    try {
      payload = qualifyArtifactAccessUrls(await response.json());
    } catch (error) {
      if (controller.signal.aborted) throw error;
      payload = null;
    }
    if (!response.ok) {
      const code = apiErrorCode(payload, response.status);
      return {
        ok: false,
        error: errorMessage(payload, `HTTP ${response.status}`),
        code,
        status: response.status,
        retryable:
          response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500,
      };
    }
    return { ok: true, data: payload as T, status: response.status };
  } catch (error) {
    const callerAborted = callerSignal?.aborted === true;
    return {
      ok: false,
      error: callerAborted
        ? "素材请求已取消。"
        : timedOut
          ? "素材请求超时，请重试。"
          : error instanceof Error
            ? error.message
            : "无法连接素材服务。",
      code: "network-error",
      status: 0,
      retryable: !callerAborted,
    };
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abort);
  }
}

function projectionsFromPayload(
  payload: unknown,
  options: { allowInvalidItems?: boolean } = {},
): {
  ok: boolean;
  projections: ArtifactProjection[];
  nextCursor: string | null;
  total: number | null;
  invalidCount: number;
  error: string;
  responseContext: ArtifactContextRef | null;
  responseContextPresent: boolean;
  responseContextId: string | null;
  scope: string;
  ownerPrincipalId: string | null;
} {
  const envelope =
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  if (!envelope || !Array.isArray(envelope.items)) {
    return {
      ok: false,
      projections: [],
      nextCursor: null,
      total: null,
      invalidCount: 0,
      error: "素材服务响应缺少 v1 items envelope。",
      responseContext: null,
      responseContextPresent: false,
      responseContextId: null,
      scope: "",
      ownerPrincipalId: null,
    };
  }
  const rawItems = envelope.items;
  const normalizedItems = rawItems.map(normalizeArtifactProjectionResult);
  const projections = normalizedItems.flatMap((result) =>
    result.ok && result.data ? [result.data] : [],
  );
  const computedInvalidCount = normalizedItems.length - projections.length;
  const rawDeclaredInvalidCount =
    envelope.invalidCount ?? envelope.invalid_count;
  const invalidCountPresent =
    Object.prototype.hasOwnProperty.call(envelope, "invalidCount") ||
    Object.prototype.hasOwnProperty.call(envelope, "invalid_count");
  if (
    invalidCountPresent &&
    (typeof rawDeclaredInvalidCount !== "number" ||
      !Number.isFinite(rawDeclaredInvalidCount) ||
      rawDeclaredInvalidCount < 0)
  ) {
    return {
      ok: false,
      projections: [],
      nextCursor: null,
      total: null,
      invalidCount: 1,
      error: "素材服务 invalidCount 字段无效。",
      responseContext: null,
      responseContextPresent: false,
      responseContextId: null,
      scope: String(envelope.scope || "").trim().toLowerCase(),
      ownerPrincipalId: null,
    };
  }
  const declaredInvalidCount =
    typeof rawDeclaredInvalidCount === "number" &&
    Number.isFinite(rawDeclaredInvalidCount) &&
    rawDeclaredInvalidCount >= 0
      ? Math.trunc(rawDeclaredInvalidCount)
      : 0;
  const responseContextPresent = Object.prototype.hasOwnProperty.call(
    envelope,
    "context",
  );
  const responseContext = normalizeArtifactContextRef(envelope.context);
  const rawNextCursor =
    envelope.nextOffset ??
    envelope.next_offset ??
    envelope.nextCursor ??
    envelope.next_cursor;
  const nextCursor =
    typeof rawNextCursor === "number" &&
    Number.isFinite(rawNextCursor) &&
    rawNextCursor >= 0
      ? String(Math.trunc(rawNextCursor))
      : typeof rawNextCursor === "string" &&
          /^\d+$/.test(rawNextCursor.trim())
        ? rawNextCursor.trim()
        : null;
  const rawResponseContextId = envelope.contextId ?? envelope.context_id;
  const rawOwner =
    envelope.owner &&
    typeof envelope.owner === "object" &&
    !Array.isArray(envelope.owner)
      ? (envelope.owner as Record<string, unknown>)
      : {};
  const rawOwnerPrincipalId =
    envelope.ownerPrincipalId ??
    envelope.owner_principal_id ??
    rawOwner.principalId ??
    rawOwner.principal_id;
  const rawTotal = envelope.total;
  const total =
    typeof rawTotal === "number" &&
    Number.isFinite(rawTotal) &&
    rawTotal >= 0
      ? Math.trunc(rawTotal)
      : null;
  const invalidReason = normalizedItems.find((result) => !result.ok)?.error;
  const invalidCount = computedInvalidCount + declaredInvalidCount;
  if (invalidCount > 0 && !options.allowInvalidItems) {
    return {
      ok: false,
      projections: [],
      nextCursor: null,
      total,
      invalidCount,
      error:
        invalidReason ||
        `素材服务声明 ${declaredInvalidCount} 条无效 projection。`,
      responseContext,
      responseContextPresent,
      responseContextId:
        typeof rawResponseContextId === "string" &&
        rawResponseContextId.trim()
          ? rawResponseContextId.trim()
          : null,
      scope: String(envelope.scope || "").trim().toLowerCase(),
      ownerPrincipalId:
        typeof rawOwnerPrincipalId === "string" &&
        rawOwnerPrincipalId.trim()
          ? rawOwnerPrincipalId.trim()
          : null,
    };
  }
  if (total === null) {
    return {
      ok: false,
      projections: [],
      nextCursor: null,
      total: null,
      invalidCount: 0,
      error: "素材服务 items envelope 缺少权威 total。",
      responseContext,
      responseContextPresent,
      responseContextId:
        typeof rawResponseContextId === "string" &&
        rawResponseContextId.trim()
          ? rawResponseContextId.trim()
          : null,
      scope: String(envelope.scope || "").trim().toLowerCase(),
      ownerPrincipalId:
        typeof rawOwnerPrincipalId === "string" &&
        rawOwnerPrincipalId.trim()
          ? rawOwnerPrincipalId.trim()
          : null,
    };
  }
  if (total !== null && total < rawItems.length) {
    return {
      ok: false,
      projections: [],
      nextCursor: null,
      total,
      invalidCount: 0,
      error: "素材服务 total 小于当前页 items 数量。",
      responseContext,
      responseContextPresent,
      responseContextId:
        typeof rawResponseContextId === "string" &&
        rawResponseContextId.trim()
          ? rawResponseContextId.trim()
          : null,
      scope: String(envelope.scope || "").trim().toLowerCase(),
      ownerPrincipalId:
        typeof rawOwnerPrincipalId === "string" &&
        rawOwnerPrincipalId.trim()
          ? rawOwnerPrincipalId.trim()
          : null,
    };
  }
  return {
    ok: true,
    projections,
    nextCursor,
    total,
    invalidCount,
    error:
      invalidCount > 0
        ? invalidReason ||
          `素材服务声明 ${declaredInvalidCount} 条无效 projection。`
        : "",
    responseContext,
    responseContextPresent,
    responseContextId:
      typeof rawResponseContextId === "string" && rawResponseContextId.trim()
        ? rawResponseContextId.trim()
        : null,
    scope: String(envelope.scope || "").trim().toLowerCase(),
    ownerPrincipalId:
      typeof rawOwnerPrincipalId === "string" &&
      rawOwnerPrincipalId.trim()
        ? rawOwnerPrincipalId.trim()
        : null,
  };
}

function artifactItemFromProjection(
  projection: ArtifactProjection,
  options: { forEdit?: boolean } = {},
): LibraryItem {
  const item = artifactProjectionToLibraryItem(projection, options);
  const href = new URL("https://asset.oceanleo.com/materials");
  href.searchParams.set("artifactId", projection.artifactId);
  href.searchParams.set("revisionId", projection.revisionId);
  href.searchParams.set("taxonomy", projection.artifactType);
  return {
    ...item,
    meta: {
      ...item.meta,
      ...(options.forEdit && projection.renditions.source
        ? { editor_source_url: projection.renditions.source.url }
        : {}),
      ...(projection.owner.visibility === "public"
        ? { asset_page_url: href.toString() }
        : {}),
    },
  };
}

async function itemResult(
  result: ArtifactApiResult<unknown>,
  expected?: { artifactId: string; revisionId?: string },
  signal?: AbortSignal,
): Promise<ArtifactApiResult<LibraryItem>> {
  if (!result.ok) return result as ArtifactApiResult<LibraryItem>;
  const normalized = normalizeArtifactProjectionResult(result.data);
  let projection = normalized.data;
  if (!normalized.ok || !projection) {
    return {
      ok: false,
      error:
        normalized.error ||
        "素材服务返回了无效的 artifact/revision 投影。",
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  if (
    !artifactIsVisible(projection) ||
    (expected &&
      (projection.artifactId !== String(expected.artifactId ?? "").trim() ||
        (expected.revisionId &&
          projection.revisionId !==
            String(expected.revisionId ?? "").trim())))
  ) {
    return {
      ok: false,
      error:
        "素材服务响应未固定到请求的 artifact/revision，或未通过 ACL/完整性校验。",
      code: projection.access.canRead && projection.access.canPreview
        ? "integrity-failed"
        : "unauthorized",
      status: result.status,
      retryable: false,
    };
  }
  // Preview/open must not leave relative source-tree URLs for deck/media loaders
  // (sites do not proxy /v1 → slide.oceanleo.com 404). Mint opaque access when needed.
  projection = await upgradeSourceTreeForEditor(projection, signal);
  return {
    ...result,
    data: artifactItemFromProjection(projection),
  };
}

export async function getArtifactItem(
  artifactId: string,
  revisionId: string,
  signal?: AbortSignal,
): Promise<ArtifactApiResult<LibraryItem>> {
  const safeArtifactId = String(artifactId ?? "").trim();
  const safeRevisionId = String(revisionId ?? "").trim();
  const params = new URLSearchParams({ revisionId: safeRevisionId });
  return itemResult(
    await artifactRequest<unknown>(
      `/v1/library/items/${encodeURIComponent(safeArtifactId)}?${params}`,
      { signal, auth: "optional" },
    ),
    { artifactId: safeArtifactId, revisionId: safeRevisionId },
    signal,
  );
}

/**
 * Fetch the server-authoritative current head for one artifact root.
 *
 * Omitting `revisionId` is intentional: paginated shelf results and their
 * ordering are not valid evidence for a recoverable CAS rebase.
 */
export async function getCurrentArtifactItem(
  artifactId: string,
  signal?: AbortSignal,
): Promise<ArtifactApiResult<LibraryItem>> {
  const safeArtifactId = String(artifactId ?? "").trim();
  return itemResult(
    await artifactRequest<unknown>(
      `/v1/library/items/${encodeURIComponent(safeArtifactId)}`,
      { signal, auth: "optional" },
    ),
    { artifactId: safeArtifactId },
    signal,
  );
}

export async function listPrimaryArtifacts(
  context: ArtifactContextRef,
  options: {
    artifactType?: ArtifactType | "";
    limit?: number;
    signal?: AbortSignal;
  } = {},
): Promise<ArtifactApiResult<ArtifactSearchResult>> {
  // Context refs arrive from plain-JS site callers and may miss fields.
  const contextId = String(context?.contextId ?? "").trim();
  const siteKey = String(context?.siteKey ?? "").trim();
  if (!contextId || !siteKey) {
    return {
      ok: false,
      error: ARTIFACT_CONTEXT_MISSING_MESSAGE,
      code: "invalid-binding",
      status: 400,
      retryable: false,
    };
  }
  const params = new URLSearchParams({
    contextId,
    siteKey,
    limit: boundedLibraryLimit(options.limit),
  });
  setTrimmedParam(params, "appId", context.appId);
  setTrimmedParam(params, "functionId", context.functionId);
  const result = await artifactRequest<unknown>(
    `/v1/library/primary?${params}`,
    { signal: options.signal },
  );
  if (!result.ok) return result as ArtifactApiResult<ArtifactSearchResult>;
  const normalized = projectionsFromPayload(result.data, {
    allowInvalidItems: true,
  });
  if (!normalized.ok) {
    return {
      ok: false,
      error: normalized.error,
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  const fullResponseContextMatches = normalized.responseContextPresent
    ? Boolean(
        normalized.responseContext &&
          artifactContextsEqual(normalized.responseContext, context),
      )
    : true;
  const responseContextIdMatches = normalized.responseContextId
    ? normalized.responseContextId === contextId
    : normalized.responseContextPresent;
  const responseContextMatches =
    fullResponseContextMatches && responseContextIdMatches;
  if (!responseContextMatches) {
    return {
      ok: false,
      error:
        "Primary 响应缺少请求 context，或返回了不匹配的 context。",
      code: "invalid-binding",
      status: result.status,
      retryable: false,
    };
  }
  const accepted: ArtifactProjection[] = [];
  const reasons: string[] = normalized.error ? ["invalid-shape"] : [];
  for (const artifact of normalized.projections) {
    const source = artifact.renditions.source;
    const reason =
      !artifactIsVisible(artifact)
        ? "not-visible"
        : !artifactHasExactContext(artifact, contextId)
          ? "wrong-context"
          : options.artifactType &&
              artifact.artifactType !== options.artifactType
            ? "wrong-type"
            : artifact.editability === "view_only"
              ? "view-only"
              : !artifact.editorCapability
                ? "missing-editor"
                : !artifact.access.canEdit && !artifact.access.canFork
                  ? "not-editable"
                  : !source ||
                      source.revisionId !== artifact.revisionId ||
                      !source.url ||
                      !source.digest
                    ? "missing-source"
                    : "";
    if (reason) {
      reasons.push(reason);
      continue;
    }
    accepted.push(artifact);
  }
  const omittedCount =
    normalized.invalidCount +
    (normalized.projections.length - accepted.length);
  return {
    ...result,
    data: {
      items: accepted.map((artifact) =>
        artifactItemFromProjection(artifact),
      ),
      nextCursor: normalized.nextCursor,
      total: normalized.total,
      diagnostics: {
        omittedCount,
        reasons: [...new Set(reasons)].slice(0, 12),
      },
    },
  };
}

export async function searchArtifactLibrary(options: {
  query?: string;
  artifactType?: ArtifactType | "";
  role?: string;
  sourceFormat?: string;
  offset?: number;
  /** @deprecated The backend paginates by numeric offset; retained for callers on v0.180. */
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
} = {}): Promise<ArtifactApiResult<ArtifactSearchResult>> {
  const requestedRole = options.role?.trim() || "";
  const requestedSourceFormat = options.sourceFormat?.trim() || "";
  const params = new URLSearchParams({
    limit: boundedLibraryLimit(options.limit),
  });
  setTrimmedParam(params, "q", options.query);
  setTrimmedParam(params, "artifactType", options.artifactType);
  setTrimmedParam(params, "role", options.role);
  setTrimmedParam(params, "sourceFormat", options.sourceFormat);
  const offset = boundedLibraryOffset(options.offset ?? options.cursor);
  if (offset > 0) params.set("offset", String(offset));
  const result = await artifactRequest<unknown>(
    `/v1/library/search?${params}`,
    { signal: options.signal, auth: "optional" },
  );
  if (!result.ok) return result as ArtifactApiResult<ArtifactSearchResult>;
  const normalized = projectionsFromPayload(result.data);
  if (!normalized.ok) {
    return {
      ok: false,
      error: normalized.error,
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  if (normalized.scope !== "public") {
    return {
      ok: false,
      error: "完整素材库响应 scope 不是 public。",
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  const invalid = normalized.projections.find(
    (artifact) =>
      !artifactIsVisible(artifact) ||
      artifact.owner.visibility !== "public" ||
      Boolean(
        options.artifactType &&
          artifact.artifactType !== options.artifactType,
      ) ||
      Boolean(requestedRole && !artifact.roles.includes(requestedRole)) ||
      Boolean(
        requestedSourceFormat &&
          artifact.sourceFormat !== requestedSourceFormat,
      ),
  );
  if (invalid) {
    return {
      ok: false,
      error:
        "完整素材库返回了非 public、未授权或筛选条件不匹配的 projection。",
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  return {
    ...result,
    data: {
      items: normalized.projections.map((artifact) =>
        artifactItemFromProjection(artifact),
      ),
      nextCursor: normalized.nextCursor,
      total: normalized.total,
    },
  };
}

export async function listEditableShelfArtifacts(
  signal?: AbortSignal,
): Promise<ArtifactApiResult<ArtifactSearchResult>> {
  const result = await artifactRequest<unknown>(
    `/v1/library/editable-shelf?perType=${ARTIFACT_EDITABLE_SHELF_PER_TYPE}`,
    { signal, auth: "optional" },
  );
  if (!result.ok) return result as ArtifactApiResult<ArtifactSearchResult>;
  const normalized = projectionsFromPayload(result.data, {
    allowInvalidItems: true,
  });
  if (!normalized.ok) {
    return {
      ok: false,
      error: normalized.error,
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  const counts = new Map<ArtifactType, number>();
  const accepted: ArtifactProjection[] = [];
  const reasons: string[] = normalized.error ? ["invalid-shape"] : [];
  for (const artifact of normalized.projections) {
    const source = artifact.renditions.source;
    const typeCount = counts.get(artifact.artifactType) || 0;
    const reason =
      !artifactIsVisible(artifact)
        ? "not-visible"
        : artifact.owner.visibility !== "public"
          ? "not-public"
          : !artifact.roles.includes("template")
            ? "not-template"
            : artifact.editability === "view_only"
              ? "view-only"
              : !artifact.editorCapability
                ? "missing-editor"
                : !artifact.access.canEdit && !artifact.access.canFork
                  ? "not-editable"
                  : !artifact.sourceFormat ||
                      !source ||
                      source.revisionId !== artifact.revisionId ||
                      !source.url ||
                      !source.digest
                    ? "missing-source"
                    : typeCount >= ARTIFACT_EDITABLE_SHELF_PER_TYPE
                      ? "type-overflow"
                      : "";
    if (reason) {
      reasons.push(reason);
      continue;
    }
    counts.set(artifact.artifactType, typeCount + 1);
    accepted.push(artifact);
  }
  const missingTypes = ARTIFACT_TYPES.filter((type) => !counts.has(type));
  if (normalized.scope !== "public" || normalized.nextCursor !== null) {
    return {
      ok: false,
      error: "可编辑素材货架响应不是单次公开 release 快照。",
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  return {
    ...result,
    data: {
      items: accepted.map((artifact) =>
        artifactItemFromProjection(artifact),
      ),
      nextCursor: null,
      total: accepted.length,
      diagnostics: {
        omittedCount:
          normalized.invalidCount +
          (normalized.projections.length - accepted.length),
        reasons: [
          ...new Set([
            ...reasons,
            ...missingTypes.map((type) => `missing-taxonomy:${type}`),
          ]),
        ].slice(0, 24),
      },
    },
  };
}

export async function listMyArtifacts(options: {
  artifactType?: ArtifactType | "";
  offset?: number;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
} = {}): Promise<ArtifactApiResult<ArtifactSearchResult>> {
  const params = new URLSearchParams({
    limit: boundedLibraryLimit(options.limit),
  });
  setTrimmedParam(params, "artifactType", options.artifactType);
  const offset = boundedLibraryOffset(options.offset ?? options.cursor);
  if (offset > 0) params.set("offset", String(offset));
  const result = await artifactRequest<unknown>(
    `/v1/library/mine?${params}`,
    { signal: options.signal },
  );
  if (!result.ok) return result as ArtifactApiResult<ArtifactSearchResult>;
  const normalized = projectionsFromPayload(result.data);
  if (!normalized.ok) {
    return {
      ok: false,
      error: normalized.error,
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  if (
    !normalized.ownerPrincipalId ||
    normalized.scope !== "mine"
  ) {
    return {
      ok: false,
      error: "我的库响应缺少 ownerPrincipalId 或 scope 不是 mine。",
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  const invalid = normalized.projections.find(
    (artifact) =>
      !artifactIsVisible(artifact) ||
      artifact.owner.principalId !== normalized.ownerPrincipalId ||
      artifact.owner.visibility === "public" ||
      Boolean(
        options.artifactType &&
          artifact.artifactType !== options.artifactType,
      ),
  );
  if (invalid) {
    return {
      ok: false,
      error:
        "我的库返回了其他 owner、public inventory 或未授权 projection。",
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  return {
    ...result,
    data: {
      items: normalized.projections.map((artifact) =>
        artifactItemFromProjection(artifact),
      ),
      nextCursor: normalized.nextCursor,
      total: normalized.total,
      ownerPrincipalId: normalized.ownerPrincipalId,
    },
  };
}

export async function listFavoriteArtifacts(options: {
  offset?: number;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
} = {},
): Promise<ArtifactApiResult<ArtifactSearchResult>> {
  const params = new URLSearchParams({
    limit: boundedLibraryLimit(options.limit ?? 100),
    offset: String(
      boundedLibraryOffset(options.offset ?? options.cursor),
    ),
  });
  const result = await artifactRequest<unknown>(
    `/v1/library/favorites?${params}`,
    { signal: options.signal },
  );
  if (!result.ok) return result as ArtifactApiResult<ArtifactSearchResult>;
  const normalized = projectionsFromPayload(result.data);
  if (!normalized.ok) {
    return {
      ok: false,
      error: normalized.error,
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  if (
    normalized.scope !== "favorites" ||
    !normalized.ownerPrincipalId
  ) {
    return {
      ok: false,
      error:
        "收藏素材响应缺少当前 ownerPrincipalId 或 scope 不是 favorites。",
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  const ownerPrincipalId = normalized.ownerPrincipalId;
  const invalid = normalized.projections.find(
    (artifact) =>
      !artifactIsVisible(artifact) ||
      artifact.favorite !== true ||
      (artifact.owner.visibility !== "public" &&
        !(
          artifact.owner.visibility === "private" &&
          artifact.owner.principalId === ownerPrincipalId
        )),
  );
  if (invalid) {
    return {
      ok: false,
      error:
        "收藏素材返回了未收藏、不可读、其他 owner 或非 public/private projection。",
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  return {
    ...result,
    data: {
      items: normalized.projections.map((artifact) =>
        artifactItemFromProjection(artifact),
      ),
      nextCursor: normalized.nextCursor,
      total: normalized.total,
      ownerPrincipalId,
    },
  };
}

export async function ensureArtifact(
  transient: TransientGenerationResult,
  signal?: AbortSignal,
): Promise<ArtifactApiResult<LibraryItem>> {
  if (!isEnsureableTransient(transient)) {
    return {
      ok: false,
      error:
        "临时结果缺少 resultId、payloadDigest 或稳定幂等键，不能安全入库。",
      code: "transient-persistence-failed",
      status: 400,
      retryable: false,
    };
  }
  const key = transient.idempotencyKey;
  const current = ENSURE_PENDING.get(key);
  if (current) {
    if (current.digest !== transient.payloadDigest) {
      return {
        ok: false,
        error: "同一幂等键对应了不同 payload digest，已拒绝覆盖。",
        code: "revision-conflict",
        status: 409,
        retryable: false,
      };
    }
    return current.promise;
  }
  const promise: Promise<ArtifactApiResult<LibraryItem>> =
    artifactRequest<unknown>("/v1/artifacts/ensure", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({
        schema: transient.schema,
        operation: transient.operation,
        result_id: transient.resultId,
        payload_digest: transient.payloadDigest,
        artifact_type: transient.artifactType,
        title: transient.title,
        rendition_url: transient.renditionUrl,
        source_url: transient.sourceUrl || null,
        source_format: transient.sourceFormat || null,
        site_id: transient.siteId || null,
        app_id: transient.appId || null,
        function_id: transient.functionId || null,
        provenance: transient.provenance || {},
      }),
      signal,
    }).then(async (result): Promise<ArtifactApiResult<LibraryItem>> => {
      if (!result.ok) return result as ArtifactApiResult<LibraryItem>;
      const envelope =
        result.data &&
        typeof result.data === "object" &&
        !Array.isArray(result.data)
          ? (result.data as Record<string, unknown>)
          : {};
      const receiptValue =
        envelope.receipt &&
        typeof envelope.receipt === "object" &&
        !Array.isArray(envelope.receipt)
          ? (envelope.receipt as Record<string, unknown>)
          : {};
      const resultId = String(
        receiptValue.resultId || receiptValue.result_id || "",
      ).trim();
      const payloadDigest = String(
        receiptValue.payloadDigest || receiptValue.payload_digest || "",
      ).trim();
      const idempotencyKey = String(
        receiptValue.idempotencyKey ||
          receiptValue.idempotency_key ||
          "",
      ).trim();
      if (
        resultId !== transient.resultId ||
        payloadDigest !== transient.payloadDigest ||
        idempotencyKey !== transient.idempotencyKey
      ) {
        return {
          ok: false,
          error:
            "ensure 响应缺少与请求一致的 resultId/payloadDigest/idempotencyKey receipt。",
          code: "transient-persistence-failed",
          status: result.status,
          retryable: false,
        };
      }
      return itemResult(result);
    });
  ENSURE_PENDING.set(key, { digest: transient.payloadDigest, promise });
  try {
    const ensured = await promise;
    if (
      ensured.ok &&
      ensured.data &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(
        new CustomEvent(ARTIFACT_LIBRARY_CHANGE_EVENT, {
          detail: {
            action: "ensure",
            artifactId: ensured.data.artifactId,
            revisionId: ensured.data.revisionId,
            item: ensured.data,
          },
        }),
      );
    }
    return ensured;
  } finally {
    if (ENSURE_PENDING.get(key)?.promise === promise) {
      ENSURE_PENDING.delete(key);
    }
  }
}

export async function ensureDurableArtifactItem(
  item: LibraryItem,
  signal?: AbortSignal,
): Promise<ArtifactApiResult<LibraryItem>> {
  if (isDurableLibraryItem(item)) {
    return getArtifactItem(item.artifactId, item.revisionId, signal);
  }
  if (item.transient) return ensureArtifact(item.transient, signal);
  return {
    ok: false,
    error:
      "这个条目没有 durable artifact identity，也没有可幂等入库的生成 receipt。",
    code: "transient-persistence-failed",
    status: 409,
    retryable: false,
  };
}

export async function getArtifactEditDecision(
  item: LibraryItem,
  signal?: AbortSignal,
): Promise<ArtifactApiResult<ArtifactEditDecision>> {
  const durable = await ensureDurableArtifactItem(item, signal);
  if (!durable.ok || !durable.data) {
    return {
      ok: false,
      error: durable.error,
      code: durable.code,
      status: durable.status,
      retryable: durable.retryable,
    };
  }
  let canonical = durable.data;
  if (
    isDurableLibraryItem(canonical) &&
    !canonical.artifact.access.canEdit &&
    canonical.artifact.access.canFork
  ) {
    const forked = await forkArtifact(canonical);
    if (!forked.ok || !forked.data) {
      return {
        ok: false,
        error: forked.error || "无法创建可编辑用户副本。",
        code: forked.code,
        status: forked.status,
        retryable: forked.retryable,
      };
    }
    canonical = forked.data;
  }
  const params = new URLSearchParams({
    revisionId: canonical.revisionId || "",
  });
  const result = await artifactRequest<unknown>(
    `/v1/artifacts/${encodeURIComponent(
      canonical.artifactId || "",
    )}/edit-capability?${params}`,
    { signal },
  );
  if (!result.ok) return result as ArtifactApiResult<ArtifactEditDecision>;
  const raw =
    result.data && typeof result.data === "object"
      ? (result.data as Record<string, unknown>)
      : {};
  const normalizedProjection = normalizeArtifactProjectionResult(
    raw.item ?? raw.artifact,
  );
  let projection = normalizedProjection.data;
  const declaredCapability =
    typeof raw.editor_capability === "string"
      ? raw.editor_capability.trim()
      : typeof raw.editorCapability === "string"
        ? raw.editorCapability.trim()
        : "";
  if (
    !isDurableLibraryItem(canonical) ||
    !normalizedProjection.ok ||
    !projection ||
    !artifactIsVisible(projection) ||
    projection.artifactId !== canonical.artifactId ||
    projection.revisionId !== canonical.revisionId ||
    typeof raw.available !== "boolean" ||
    (raw.available === true &&
      (!declaredCapability ||
        declaredCapability !== projection.editorCapability))
  ) {
    return {
      ok: false,
      error:
        "edit-capability 响应缺少与请求一致的 artifact/revision 投影。",
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  if (raw.available === true) {
    projection = await upgradeSourceTreeForEditor(projection, signal);
  }
  return {
    ...result,
    data: {
      available: raw.available === true,
      reason: String(raw.reason || raw.unavailable_reason || ""),
      editorCapability: declaredCapability || null,
      item: artifactItemFromProjection(projection, { forEdit: true }),
    },
  };
}

export async function prepareArtifactForAction(
  action: ArtifactCardAction,
  item: LibraryItem,
  signal?: AbortSignal,
): Promise<ArtifactApiResult<LibraryItem>> {
  if (action === "preview") {
    if (isDurableLibraryItem(item)) {
      return getArtifactItem(item.artifactId, item.revisionId, signal);
    }
    return { ok: true, data: item };
  }
  if (action === "edit") {
    const decision = await getArtifactEditDecision(item, signal);
    if (!decision.ok || !decision.data) {
      return {
        ok: false,
        error: decision.error,
        code: decision.code,
        status: decision.status,
        retryable: decision.retryable,
      };
    }
    if (!decision.data.available) {
      return {
        ok: false,
        error: decision.data.reason || "这个 revision 不允许编辑。",
        code: "missing-source",
        status: 422,
        retryable: false,
      };
    }
    return { ...decision, data: decision.data.item };
  }
  const durable = await ensureDurableArtifactItem(item, signal);
  if (!durable.ok || !durable.data) return durable;
  if (isDurableLibraryItem(durable.data)) {
    const allowed =
      action === "insert"
        ? durable.data.artifact.access.canInsert
        : durable.data.artifact.access.canReplace;
    if (!allowed) {
      return {
        ok: false,
        error: `服务端未授权此 revision 执行 ${action}。`,
        code: "unauthorized",
        status: 403,
        retryable: false,
      };
    }
  }
  return durable;
}

export async function refreshArtifactRendition(
  identity: { artifactId: string; revisionId: string },
  purpose: ArtifactRenditionPurpose,
  signal?: AbortSignal,
): Promise<ArtifactApiResult<ArtifactRendition>> {
  const params = new URLSearchParams({ revision_id: identity.revisionId });
  const result = await artifactRequest<unknown>(
    `/v1/library/items/${encodeURIComponent(
      identity.artifactId,
    )}/renditions/${purpose}/url?${params}`,
    { method: "POST", body: "{}", signal, auth: "optional" },
  );
  if (!result.ok) return result as ArtifactApiResult<ArtifactRendition>;
  const projection = normalizeArtifactProjection(result.data);
  if (
    projection &&
    (projection.artifactId !== identity.artifactId ||
      projection.revisionId !== identity.revisionId)
  ) {
    return {
      ok: false,
      error: "刷新后的 projection 没有固定到请求的 artifact/revision。",
      code: "integrity-failed",
      status: result.status,
      retryable: false,
    };
  }
  const rendition =
    projection?.renditions[purpose] ||
    (() => {
      const raw =
        result.data &&
        typeof result.data === "object" &&
        !Array.isArray(result.data)
          ? (result.data as Record<string, unknown>)
          : {};
      const rawRendition =
        raw.rendition &&
        typeof raw.rendition === "object" &&
        !Array.isArray(raw.rendition)
          ? (raw.rendition as Record<string, unknown>)
          : raw;
      const artifactId = String(
        raw.artifact_id || raw.artifactId || "",
      ).trim();
      const revisionId = String(
        raw.revision_id || raw.revisionId || "",
      ).trim();
      const renditionRevisionId = String(
        rawRendition.revision_id ||
          rawRendition.revisionId ||
          "",
      ).trim();
      const url = trustedHttpsUrl(
        rawRendition.url || rawRendition.signed_url,
      );
      return url &&
        artifactId === identity.artifactId &&
        revisionId === identity.revisionId &&
        renditionRevisionId === identity.revisionId
        ? {
            purpose,
            revisionId: renditionRevisionId,
            url,
            mediaType: String(rawRendition.media_type || ""),
            format: String(rawRendition.format || ""),
            expiresAt:
              typeof rawRendition.expires_at === "string"
                ? rawRendition.expires_at
                : null,
            rendererVersion:
              typeof rawRendition.renderer_version === "string"
                ? rawRendition.renderer_version
                : null,
            width:
              typeof rawRendition.width === "number"
                ? rawRendition.width
                : null,
            height:
              typeof rawRendition.height === "number"
                ? rawRendition.height
                : null,
            byteSize:
              typeof rawRendition.byte_size === "number"
                ? rawRendition.byte_size
                : typeof rawRendition.byteSize === "number"
                  ? rawRendition.byteSize
                  : null,
            durationMs:
              typeof rawRendition.duration_ms === "number"
                ? rawRendition.duration_ms
                : null,
            digest:
              typeof rawRendition.digest === "string"
                ? rawRendition.digest
                : null,
          }
        : null;
    })();
  if (!rendition || rendition.revisionId !== identity.revisionId) {
    return {
      ok: false,
      error: "刷新后的 signed URL 没有固定到请求的 revision。",
      code: "integrity-failed",
      status: result.status,
      retryable: false,
    };
  }
  return { ...result, data: rendition };
}

interface ArtifactDownloadPlan extends ArtifactDownloadEvidence {
  rendition: ArtifactRendition | null;
  code: ArtifactApiErrorCode;
  status: number;
}

function artifactDownloadPlan(item: LibraryItem): ArtifactDownloadPlan {
  if (!isDurableLibraryItem(item)) {
    return {
      visible: false,
      available: false,
      reason: "下载需要 durable artifact identity。",
      purpose: null,
      mode: null,
      rendition: null,
      code: "invalid-response",
      status: 409,
    };
  }
  const artifact = item.artifact;
  if (!artifact.access.canRead) {
    return {
      visible: false,
      available: false,
      reason: "当前主体没有下载这个 revision 的权限。",
      purpose: null,
      mode: null,
      rendition: null,
      code: "unauthorized",
      status: 403,
    };
  }
  if (!artifact.integrity.ok) {
    return {
      visible: true,
      available: false,
      reason:
        artifact.integrity.reason || "当前 revision 未通过完整性校验。",
      purpose: null,
      mode: null,
      rendition: null,
      code: "integrity-failed",
      status: 422,
    };
  }
  const [candidate] = artifactDownloadPlanFor(artifact);
  if (!candidate) {
    const declaredProjectState =
      artifact.renditions.source ||
      artifact.renditions.editor_manifest ||
      null;
    const hasAnyDownloadPermission =
      artifact.access.canExportSource || artifact.access.canPreview;
    const sourceEvidenceIsInvalid = Boolean(
      artifact.access.canExportSource &&
        artifact.renditions.source &&
        (artifact.renditions.source.revisionId !== artifact.revisionId ||
          !artifact.renditions.source.digest),
    );
    let reason: string;
    let code: ArtifactApiErrorCode;
    let status: number;
    if (sourceEvidenceIsInvalid) {
      reason =
        "source rendition 没有摘要或没有固定到当前 artifact revision。";
      code = "integrity-failed";
      status = 409;
    } else if (!hasAnyDownloadPermission) {
      reason = "当前主体没有下载 source 或 rendered deliverable 的权限。";
      code = "unauthorized";
      status = 403;
    } else {
      reason = declaredProjectState
        ? "当前 revision 没有符合能力合同的真实交付 rendition；project source/editor manifest 不是用户下载物，已拒绝降级为渲染图片。"
        : "当前 revision 缺少符合能力合同的真实交付 rendition。";
      code = "missing-source";
      status = 422;
    }
    return {
      visible: true,
      available: false,
      reason,
      purpose: null,
      mode: null,
      rendition: null,
      code,
      status,
    };
  }
  if (
    (candidate.mode === "source" && !artifact.access.canExportSource) ||
    (candidate.mode === "export" && !artifact.access.canPreview)
  ) {
    return {
      visible: true,
      available: false,
      reason: "当前主体没有合同所需的 rendition 下载权限。",
      purpose: null,
      mode: null,
      rendition: null,
      code: "unauthorized",
      status: 403,
    };
  }
  if (candidate.mode === "source") {
    return {
      visible: true,
      available: true,
      reason: "",
      purpose: candidate.purpose,
      mode: "source",
      rendition: candidate.rendition,
      code: "unknown",
      status: 200,
    };
  }
  return {
    visible: true,
    available: true,
    reason: "",
    purpose: candidate.purpose,
    mode: "export",
    rendition: candidate.rendition,
    code: "unknown",
    status: 200,
  };
}

export function artifactDownloadEvidence(
  item: LibraryItem,
): ArtifactDownloadEvidence {
  const plan = artifactDownloadPlan(item);
  return {
    visible: plan.visible,
    available: plan.available,
    reason: plan.reason,
    purpose: plan.purpose,
    mode: plan.mode,
  };
}

/** Shelf/API-facing download type hint; never editor JSON. */
export function artifactDownloadTypeHint(item: LibraryItem): {
  downloadMediaType: string;
  downloadFilename: string;
} | null {
  const artifact = item.artifact;
  if (!artifact) return null;
  const hint = artifactUserFacingDownloadHint({
    artifactType: artifact.artifactType,
    sourceFormat: artifact.sourceFormat,
    editorCapability: artifact.editorCapability,
    title: artifact.title,
    renditions: artifact.renditions,
  });
  if (!hint) return null;
  return {
    downloadMediaType: hint.mediaType,
    downloadFilename: hint.filename,
  };
}

export async function getArtifactDownload(
  item: LibraryItem,
  signal?: AbortSignal,
): Promise<ArtifactApiResult<ArtifactDownloadResult>> {
  const durable = await ensureDurableArtifactItem(item, signal);
  if (!durable.ok || !durable.data) {
    return {
      ok: false,
      error: durable.error,
      code: durable.code,
      status: durable.status,
      retryable: durable.retryable,
    };
  }
  if (!isDurableLibraryItem(durable.data)) {
    return {
      ok: false,
      error: "下载准备未返回 durable artifact identity。",
      code: "invalid-response",
      status: durable.status,
      retryable: false,
    };
  }
  const artifact = durable.data.artifact;
  const plan = artifactDownloadPlan(durable.data);
  const rendition = plan.rendition;
  const mode = plan.mode;
  if (!plan.available || !rendition || !mode) {
    return {
      ok: false,
      error: plan.reason,
      code: plan.code,
      status: plan.status,
      retryable: false,
    };
  }
  const grant = await artifactRequest<unknown>(
    `/v1/artifacts/${encodeURIComponent(
      artifact.artifactId,
    )}/revisions/${encodeURIComponent(
      artifact.revisionId,
    )}/renditions/${rendition.purpose}?mode=${mode}`,
    { signal },
  );
  if (!grant.ok) return grant as ArtifactApiResult<ArtifactDownloadResult>;
  const raw =
    grant.data &&
    typeof grant.data === "object" &&
    !Array.isArray(grant.data)
      ? (grant.data as Record<string, unknown>)
      : {};
  const grantArtifactId = String(
    raw.artifactId || raw.artifact_id || "",
  ).trim();
  const grantRevisionId = String(
    raw.revisionId || raw.revision_id || "",
  ).trim();
  const grantPurpose = String(raw.purpose || "").trim();
  const grantMode = String(raw.mode || "").trim();
  const grantUrl =
    trustedGatewayArtifactAccessUrl(raw.accessUrl || raw.access_url) ||
    (() => {
      const relative = String(raw.accessUrl || raw.access_url || "").trim();
      if (!relative || !isOpaqueAccessUrl(relative)) return "";
      const qualified = qualifyUrlField(relative);
      return trustedGatewayArtifactAccessUrl(qualified) || qualified;
    })();
  const expiresAtValue = String(
    raw.expiresAt || raw.expires_at || "",
  ).trim();
  const expiresAt = Date.parse(expiresAtValue);
  const grantMediaType = normalizedMediaType(
    raw.mediaType ||
      raw.media_type ||
      raw.contentType ||
      raw.content_type,
  );
  const renditionMediaType = normalizedMediaType(rendition.mediaType);
  const grantFormat = String(raw.format || "")
    .trim()
    .toLowerCase();
  const renditionFormat = String(rendition.format || "")
    .trim()
    .toLowerCase();
  if (
    grantArtifactId !== artifact.artifactId ||
    grantRevisionId !== artifact.revisionId ||
    grantPurpose !== rendition.purpose ||
    grantMode !== mode ||
    !grantUrl ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() ||
    !grantMediaType ||
    !renditionMediaType ||
    grantMediaType !== renditionMediaType ||
    !grantFormat ||
    !renditionFormat ||
    grantFormat !== renditionFormat
  ) {
    return {
      ok: false,
      error:
        `下载 grant 未返回固定 revision、${rendition.purpose}/${mode} 与 MIME 一致的有效 attachment access URL。`,
      code: "invalid-response",
      status: grant.status,
      retryable: false,
    };
  }
  const format =
    rendition.format ||
    (mode === "source" ? artifact.sourceFormat : "");
  if (
    isEditorProjectDownloadMedia(
      grantFormat || format,
      grantMediaType || renditionMediaType,
    )
  ) {
    return {
      ok: false,
      error:
        "editor JSON / project source 不是用户下载物；已拒绝生成误导附件名或 MIME。",
      code: "invalid-response",
      status: grant.status,
      retryable: false,
    };
  }
  const extension = attachmentExtension(
    format,
    grantMediaType || renditionMediaType,
    rendition.purpose,
  );
  const mediaType = attachmentMediaType(
    grantMediaType || renditionMediaType,
    extension,
  );
  if (!extension || !mediaType || extension === "json") {
    return {
      ok: false,
      error:
        `rendition MIME ${grantMediaType || "missing"} / format ${grantFormat || "missing"} 不在安全下载白名单；已拒绝生成误导文件名。`,
      code: "invalid-response",
      status: grant.status,
      retryable: false,
    };
  }
  return {
    ok: true,
    status: grant.status,
    data: {
      artifactId: artifact.artifactId,
      revisionId: artifact.revisionId,
      purpose: rendition.purpose,
      mode,
      url: grantUrl,
      filename: attachmentFilename(
        artifact.title,
        raw.filename,
        extension,
      ),
      mediaType,
      expiresAt: new Date(expiresAt).toISOString(),
    },
  };
}

export async function setArtifactFavorite(
  item: LibraryItem,
  favorite: boolean,
): Promise<ArtifactApiResult<LibraryItem>> {
  const durable = await ensureDurableArtifactItem(item);
  if (!durable.ok || !durable.data) return durable;
  if (
    !isDurableLibraryItem(durable.data) ||
    !durable.data.artifact.access.canFavorite
  ) {
    return {
      ok: false,
      error: "当前主体没有收藏这个 artifact 的权限。",
      code: "unauthorized",
      status: 403,
      retryable: false,
    };
  }
  const updated = await itemResult(
    await artifactRequest<unknown>(
      `/v1/artifacts/${encodeURIComponent(
        durable.data.artifactId || "",
      )}/favorite`,
      {
        method: "PUT",
        body: JSON.stringify({
          revision_id: durable.data.revisionId,
          favorite,
        }),
      },
    ),
    {
      artifactId: durable.data.artifactId,
      revisionId: durable.data.revisionId,
    },
  );
  if (updated.ok && updated.data?.favorite !== favorite) {
    return {
      ok: false,
      error: "收藏响应未确认请求的 artifact/revision favorite 状态。",
      code: "invalid-response",
      status: updated.status,
      retryable: false,
    };
  }
  if (
    updated.ok &&
    updated.data &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(
      new CustomEvent(ARTIFACT_LIBRARY_CHANGE_EVENT, {
        detail: {
          action: "favorite",
          artifactId: updated.data.artifactId,
          revisionId: updated.data.revisionId,
          favorite,
          item: updated.data,
        },
      }),
    );
  }
  return updated;
}

export async function bindArtifactToContext(
  item: LibraryItem,
  context: ArtifactContextRef,
  role: string,
): Promise<ArtifactApiResult<LibraryItem>> {
  if (!normalizeArtifactContextRef(context) || !String(role ?? "").trim()) {
    return {
      ok: false,
      error: "context binding 缺少精确 context 或 role。",
      code: "invalid-binding",
      status: 400,
      retryable: false,
    };
  }
  const durable = await ensureDurableArtifactItem(item);
  if (!durable.ok || !durable.data) return durable;
  if (
    !isDurableLibraryItem(durable.data) ||
    !durable.data.artifact.access.canBind
  ) {
    return {
      ok: false,
      error: "当前主体没有创建 context binding 的权限。",
      code: "unauthorized",
      status: 403,
      retryable: false,
    };
  }
  const result = await artifactRequest<unknown>(
    "/v1/artifact-bindings:batch",
    {
      method: "POST",
      headers: {
        "Idempotency-Key": [
          "artifact-binding-v1",
          durable.data.artifactId,
          durable.data.revisionId,
          context.contextId,
          role,
        ].join(":"),
      },
      body: JSON.stringify({
        context: {
          context_id: context.contextId,
          site_key: context.siteKey,
          app_id: context.appId || null,
          function_id: context.functionId || null,
        },
        bindings: [
          {
            artifact_id: durable.data.artifactId,
            revision_id: durable.data.revisionId,
            role,
          },
        ],
      }),
    },
  );
  if (!result.ok) return result as ArtifactApiResult<LibraryItem>;
  const rebound = await getArtifactItem(
    durable.data.artifactId || "",
    durable.data.revisionId || "",
  );
  if (
    !rebound.ok ||
    !rebound.data ||
    !isDurableLibraryItem(rebound.data) ||
    !artifactHasExactContext(rebound.data.artifact, context)
  ) {
    return {
      ok: false,
      error:
        rebound.error ||
        "binding 写入后未返回匹配 context 和 pinned revision 的投影。",
      code: rebound.code || "invalid-binding",
      status: rebound.status || result.status,
      retryable: false,
    };
  }
  return rebound;
}

export async function forkArtifact(
  item: LibraryItem,
): Promise<ArtifactApiResult<LibraryItem>> {
  const durable = await ensureDurableArtifactItem(item);
  if (!durable.ok || !durable.data) return durable;
  if (
    !isDurableLibraryItem(durable.data) ||
    !durable.data.artifact.access.canFork
  ) {
    return {
      ok: false,
      error: "当前主体没有 fork 这个 artifact root 的权限。",
      code: "unauthorized",
      status: 403,
      retryable: false,
    };
  }
  const result = await artifactRequest<unknown>(
    `/v1/artifacts/${encodeURIComponent(
      durable.data.artifactId || "",
    )}:fork`,
    {
      method: "POST",
      headers: {
        "Idempotency-Key": [
          "artifact-fork-v1",
          durable.data.artifactId,
          durable.data.revisionId,
        ].join(":"),
      },
      body: JSON.stringify({
        source_revision_id: durable.data.revisionId,
      }),
    },
  );
  if (!result.ok) return result as ArtifactApiResult<LibraryItem>;
  const envelope =
    result.data &&
    typeof result.data === "object" &&
    !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>)
      : {};
  const forkedFrom =
    envelope.forkedFrom &&
    typeof envelope.forkedFrom === "object" &&
    !Array.isArray(envelope.forkedFrom)
      ? (envelope.forkedFrom as Record<string, unknown>)
      : envelope.forked_from &&
          typeof envelope.forked_from === "object" &&
          !Array.isArray(envelope.forked_from)
        ? (envelope.forked_from as Record<string, unknown>)
        : {};
  if (
    String(
      forkedFrom.artifactId || forkedFrom.artifact_id || "",
    ).trim() !== durable.data.artifactId ||
    String(
      forkedFrom.revisionId || forkedFrom.revision_id || "",
    ).trim() !== durable.data.revisionId
  ) {
    return {
      ok: false,
      error: "fork 响应未证明来源 artifact/revision。",
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  const forked = await itemResult(result);
  if (
    forked.ok &&
    forked.data &&
    isDurableLibraryItem(forked.data) &&
    forked.data.artifactId === durable.data.artifactId
  ) {
    return {
      ok: false,
      error: "fork 响应复用了原 artifact root。",
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  if (forked.ok && forked.data && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(ARTIFACT_LIBRARY_CHANGE_EVENT, {
        detail: {
          action: "fork",
          artifactId: forked.data.artifactId,
          revisionId: forked.data.revisionId,
          item: forked.data,
        },
      }),
    );
  }
  return forked;
}

/**
 * Atomic content-revision publish. Composite callers must send scene closure
 * evidence and preview/full renditions in the same request.
 */
export async function createArtifactRevision(
  artifactId: string,
  commit: ArtifactRevisionCommit,
): Promise<ArtifactApiResult<LibraryItem>> {
  if (
    commit.artifactType === "composite_image" &&
    (!commit.scene?.closureDigest ||
      !commit.renditions.some((item) => item.purpose === "preview") ||
      !commit.renditions.some((item) => item.purpose === "full"))
  ) {
    return {
      ok: false,
      error:
        "复合图片 revision 必须原子提交 scene 依赖闭包、preview 与 full rendition。",
      code: "integrity-failed",
      status: 422,
      retryable: false,
    };
  }
  const result = await itemResult(
    await artifactRequest<unknown>(
      `/v1/artifacts/${encodeURIComponent(artifactId)}/revisions`,
      {
        method: "POST",
        headers: {
          "If-Match": commit.expectedRevisionId,
        },
        body: JSON.stringify({
          expected_revision_id: commit.expectedRevisionId,
          artifact_type: commit.artifactType,
          source: {
            format: commit.source.format,
            url: commit.source.url || null,
            blob_id: commit.source.blobId || null,
            digest: commit.source.digest,
          },
          renditions: commit.renditions.map((rendition) => ({
            purpose: rendition.purpose,
            url: rendition.url || null,
            blob_id: rendition.blobId || null,
            digest: rendition.digest,
          })),
          scene: commit.scene
            ? {
                schema: commit.scene.schema,
                closure_digest: commit.scene.closureDigest,
                dependency_revision_ids:
                  commit.scene.dependencyRevisionIds,
              }
            : null,
          provenance: commit.provenance || {},
        }),
      },
    ),
    { artifactId },
  );
  if (!result.ok || !result.data) return result;
  if (
    !isDurableLibraryItem(result.data) ||
    result.data.artifactId !== artifactId ||
    result.data.revisionId === commit.expectedRevisionId ||
    !result.data.artifact.integrity.ok
  ) {
    return {
      ok: false,
      error:
        "revision publish 未返回同一 root 的新、完整 revision；旧 head 必须保持不变。",
      code: "integrity-failed",
      status: 502,
      retryable: false,
    };
  }
  const committed: ArtifactApiResult<LibraryItem> = {
    ...result,
    data: {
      ...result.data,
      meta: {
        ...result.data.meta,
        previous_revision_id: commit.expectedRevisionId,
      },
    },
  };
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(ARTIFACT_LIBRARY_CHANGE_EVENT, {
        detail: {
          action: "revision",
          artifactId: committed.data?.artifactId,
          revisionId: committed.data?.revisionId,
          previousRevisionId: commit.expectedRevisionId,
        },
      }),
    );
  }
  return committed;
}

export async function retireArtifact(
  item: LibraryItem,
): Promise<ArtifactApiResult<{ retired: boolean }>> {
  const durable = await ensureDurableArtifactItem(item);
  if (
    !durable.ok ||
    !durable.data ||
    !isDurableLibraryItem(durable.data)
  ) {
    return {
      ok: false,
      error: durable.error || "缺少可 retire 的 durable identity。",
      code: durable.code || "invalid-response",
      status: durable.status,
      retryable: false,
    };
  }
  const identity = durable.data;
  const params = new URLSearchParams({
    revisionId: identity.revisionId,
  });
  const result = await artifactRequest<unknown>(
    `/v1/artifacts/${encodeURIComponent(identity.artifactId)}?${params}`,
    {
      method: "DELETE",
      headers: { "If-Match": identity.revisionId },
    },
  );
  if (!result.ok) {
    return result as ArtifactApiResult<{ retired: boolean }>;
  }
  const raw =
    result.data &&
    typeof result.data === "object" &&
    !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>)
      : {};
  const artifactId = String(
    raw.artifactId || raw.artifact_id || "",
  ).trim();
  const revisionId = String(
    raw.revisionId || raw.revision_id || "",
  ).trim();
  if (
    raw.retired !== true ||
    artifactId !== identity.artifactId ||
    revisionId !== identity.revisionId
  ) {
    return {
      ok: false,
      error:
        "retire 响应没有确认请求的 artifact/revision，列表状态保持不变。",
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(ARTIFACT_LIBRARY_CHANGE_EVENT, {
        detail: {
          action: "retire",
          artifactId,
          revisionId,
        },
      }),
    );
  }
  return {
    ok: true,
    status: result.status,
    data: { retired: true },
  };
}
