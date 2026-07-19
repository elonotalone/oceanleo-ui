"use client";

import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";
import {
  artifactContextsEqual,
  artifactHasExactContext,
  artifactIsVisible,
  isEnsureableTransient,
  normalizeArtifactContextRef,
  normalizeArtifactProjection,
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
}

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

function apiErrorCode(value: unknown, status?: number): ArtifactApiErrorCode {
  const raw =
    value && typeof value === "object"
      ? String(
          (value as { code?: unknown; error_code?: unknown }).code ||
            (value as { error_code?: unknown }).error_code ||
            "",
        )
          .trim()
          .toLowerCase()
          .replaceAll("_", "-")
      : "";
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
  const raw = value as {
    detail?: unknown;
    message?: unknown;
    error?: unknown;
  };
  return String(raw.detail || raw.message || raw.error || fallback);
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
  const token = await accessToken();
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
  const abort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abort();
  else callerSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
      payload = await response.json();
    } catch {
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
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      error: aborted
        ? "素材请求超时或已取消。"
        : error instanceof Error
          ? error.message
          : "无法连接素材服务。",
      code: "network-error",
      status: 0,
      retryable: !callerSignal?.aborted,
    };
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abort);
  }
}

function projectionsFromPayload(payload: unknown): {
  ok: boolean;
  projections: ArtifactProjection[];
  nextCursor: string | null;
  total: number | null;
  invalidCount: number;
  error: string;
  responseContext: ArtifactContextRef | null;
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
    };
  }
  const rawItems = envelope.items;
  const projections = rawItems.flatMap((value) => {
    const item = normalizeArtifactProjection(value);
    return item ? [item] : [];
  });
  return {
    ok: true,
    projections,
    nextCursor:
      typeof envelope.next_cursor === "string"
        ? envelope.next_cursor
        : typeof envelope.nextCursor === "string"
          ? envelope.nextCursor
          : null,
    total:
      typeof envelope.total === "number" && Number.isFinite(envelope.total)
        ? envelope.total
        : null,
    invalidCount: rawItems.length - projections.length,
    error: "",
    responseContext: normalizeArtifactContextRef(envelope.context),
  };
}

function itemResult(
  result: ArtifactApiResult<unknown>,
  expected?: { artifactId: string; revisionId?: string },
): ArtifactApiResult<LibraryItem> {
  if (!result.ok) return result as ArtifactApiResult<LibraryItem>;
  const projection = normalizeArtifactProjection(result.data);
  if (!projection) {
    return {
      ok: false,
      error: "素材服务返回了无效的 artifact/revision 投影。",
      code: "invalid-response",
      status: result.status,
      retryable: false,
    };
  }
  if (
    !artifactIsVisible(projection) ||
    (expected &&
      (projection.artifactId !== expected.artifactId.trim() ||
        (expected.revisionId &&
          projection.revisionId !== expected.revisionId.trim())))
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
  return {
    ...result,
    data: artifactProjectionToLibraryItem(projection),
  };
}

export async function getArtifactItem(
  artifactId: string,
  revisionId: string,
  signal?: AbortSignal,
): Promise<ArtifactApiResult<LibraryItem>> {
  const params = new URLSearchParams({ revision_id: revisionId.trim() });
  return itemResult(
    await artifactRequest<unknown>(
      `/v1/library/items/${encodeURIComponent(artifactId.trim())}?${params}`,
      { signal },
    ),
    { artifactId, revisionId },
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
  if (!context.contextId.trim() || !context.siteKey.trim()) {
    return {
      ok: false,
      error: "Primary shelf 缺少精确 contextId/siteKey，已停止宽泛回填。",
      code: "invalid-binding",
      status: 400,
      retryable: false,
    };
  }
  const params = new URLSearchParams({
    context_id: context.contextId.trim(),
    site_key: context.siteKey.trim(),
    app_id: context.appId?.trim() || "",
    function_id: context.functionId?.trim() || "",
    artifact_type: options.artifactType || "",
    limit: String(options.limit ?? 60),
  });
  const result = await artifactRequest<unknown>(
    `/v1/library/primary?${params}`,
    { signal: options.signal },
  );
  if (!result.ok) return result as ArtifactApiResult<ArtifactSearchResult>;
  const normalized = projectionsFromPayload(result.data);
  if (
    !normalized.ok ||
    !normalized.responseContext ||
    !artifactContextsEqual(normalized.responseContext, context)
  ) {
    return {
      ok: false,
      error:
        normalized.error ||
        "Primary 响应缺少请求 context，或返回了不匹配的 context。",
      code: "invalid-binding",
      status: result.status,
      retryable: false,
    };
  }
  const authorized = normalized.projections.filter(
    (artifact) =>
      artifactIsVisible(artifact) &&
      artifactHasExactContext(artifact, context.contextId),
  );
  const omitted =
    normalized.invalidCount +
    normalized.projections.length -
    authorized.length;
  return {
    ...result,
    data: {
      items: authorized.map((artifact) =>
        artifactProjectionToLibraryItem(artifact),
      ),
      nextCursor: omitted === 0 ? normalized.nextCursor : null,
      total: omitted === 0 ? normalized.total : null,
    },
  };
}

export async function searchArtifactLibrary(options: {
  query?: string;
  artifactType?: ArtifactType | "";
  role?: string;
  sourceFormat?: string;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
} = {}): Promise<ArtifactApiResult<ArtifactSearchResult>> {
  const params = new URLSearchParams({
    q: options.query?.trim() || "",
    artifact_type: options.artifactType || "",
    role: options.role?.trim() || "",
    source_format: options.sourceFormat?.trim() || "",
    cursor: options.cursor?.trim() || "",
    limit: String(options.limit ?? 60),
  });
  const result = await artifactRequest<unknown>(
    `/v1/library/search?${params}`,
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
  const authorized = normalized.projections.filter(
    artifactIsVisible,
  );
  const omitted =
    normalized.invalidCount +
    normalized.projections.length -
    authorized.length;
  return {
    ...result,
    data: {
      items: authorized.map((artifact) =>
        artifactProjectionToLibraryItem(artifact),
      ),
      nextCursor: omitted === 0 ? normalized.nextCursor : null,
      total: omitted === 0 ? normalized.total : null,
    },
  };
}

export async function ensureArtifact(
  transient: TransientGenerationResult,
  _signal?: AbortSignal,
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
  const promise = artifactRequest<unknown>("/v1/artifacts/ensure", {
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
    }).then(itemResult);
  ENSURE_PENDING.set(key, { digest: transient.payloadDigest, promise });
  try {
    return await promise;
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
    revision_id: canonical.revisionId || "",
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
  const projection = normalizeArtifactProjection(raw.item ?? raw.artifact);
  if (
    !isDurableLibraryItem(canonical) ||
    !projection ||
    !artifactIsVisible(projection) ||
    projection.artifactId !== canonical.artifactId ||
    projection.revisionId !== canonical.revisionId
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
  return {
    ...result,
    data: {
      available: raw.available === true,
      reason: String(raw.reason || raw.unavailable_reason || ""),
      editorCapability:
        typeof raw.editor_capability === "string"
          ? raw.editor_capability
          : typeof raw.editorCapability === "string"
            ? raw.editorCapability
            : canonical.artifact?.editorCapability || null,
      item: artifactProjectionToLibraryItem(projection, { forEdit: true }),
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
    { method: "POST", body: "{}", signal },
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
      const url = String(
        rawRendition.url || rawRendition.signed_url || "",
      ).trim();
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
  return itemResult(
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
}

export async function bindArtifactToContext(
  item: LibraryItem,
  context: ArtifactContextRef,
  role: string,
): Promise<ArtifactApiResult<LibraryItem>> {
  if (!normalizeArtifactContextRef(context) || !role.trim()) {
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
  return itemResult(
    await artifactRequest<unknown>(
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
    ),
  );
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
  const result = itemResult(
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
  return result;
}

export async function retireArtifact(
  artifactId: string,
): Promise<ArtifactApiResult<{ retired: boolean }>> {
  return artifactRequest<{ retired: boolean }>(
    `/v1/artifacts/${encodeURIComponent(artifactId)}`,
    { method: "DELETE" },
  );
}
