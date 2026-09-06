"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  artifactIsVisible,
  isArtifactSourceTreeUrl,
  renditionNeedsRefresh,
  selectArtifactRendition,
  viewerRenditionOrder,
  type ArtifactRendition,
  type ArtifactRenditionPurpose,
} from "./artifact-contract";
import {
  refreshArtifactRendition,
  type ArtifactApiResult,
} from "./artifact-client";
import { officePackageKindForItem } from "./doc-editors/office-file";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "./library-data";
import { isDisplayableText } from "./website-inline-preview";

const renditionRefreshCache = new Map<
  string,
  { rendition: ArtifactRendition; usableUntil: number }
>();
const renditionRefreshPending = new Map<
  string,
  Promise<ArtifactApiResult<ArtifactRendition>>
>();

function renditionRefreshKey(
  artifactId: string,
  revisionId: string,
  purpose: ArtifactRenditionPurpose,
): string {
  return `${artifactId}:${revisionId}:${purpose}`;
}

function cachedRefreshedRendition(
  artifactId: string,
  revisionId: string,
  purposes: readonly ArtifactRenditionPurpose[],
  now = Date.now(),
): ArtifactRendition | null {
  for (const purpose of purposes) {
    const key = renditionRefreshKey(artifactId, revisionId, purpose);
    const cached = renditionRefreshCache.get(key);
    if (!cached) continue;
    if (
      now >= cached.usableUntil ||
      renditionNeedsRefresh(cached.rendition, now)
    ) {
      renditionRefreshCache.delete(key);
      continue;
    }
    return cached.rendition;
  }
  return null;
}

function refreshRenditionOnce(
  artifactId: string,
  revisionId: string,
  purpose: ArtifactRenditionPurpose,
  force: boolean,
): Promise<ArtifactApiResult<ArtifactRendition>> {
  const key = renditionRefreshKey(artifactId, revisionId, purpose);
  if (force) renditionRefreshCache.delete(key);
  const cached = cachedRefreshedRendition(
    artifactId,
    revisionId,
    [purpose],
  );
  if (cached) {
    return Promise.resolve({ ok: true as const, data: cached, status: 200 });
  }
  const active = renditionRefreshPending.get(key);
  if (active) return active;
  // A component unmount must not cancel a refresh shared by another thumbnail.
  const pending = refreshArtifactRendition(
    { artifactId, revisionId },
    purpose,
  ).then((result) => {
    if (result.ok && result.data) {
      const expiresAt = result.data.expiresAt
        ? Date.parse(result.data.expiresAt)
        : Number.NaN;
      const usableUntil = Number.isFinite(expiresAt)
        ? expiresAt - 60_000
        : Date.now() + 15_000;
      if (usableUntil > Date.now()) {
        renditionRefreshCache.set(key, {
          rendition: result.data,
          usableUntil,
        });
      }
    }
    return result;
  }).finally(() => {
    renditionRefreshPending.delete(key);
  });
  renditionRefreshPending.set(key, pending);
  return pending;
}

/**
 * The early-return branches below have no refresh to run, but their callbacks
 * still travel into consumer effect dependency arrays. A fresh arrow function
 * per render made those effects re-run forever; this shared constant keeps the
 * identity stable exactly like the `useCallback` pair on the durable path.
 */
const NO_RENDITION_ACTION = () => undefined;

/**
 * 「签名过期」与「资源不存在」是两件事，混在一起用户会一直点重试（W07 P3）。
 *
 * - `signature`：这份 rendition 带 `expiresAt`，也就是一个签名地址。取不到它**可能**
 *   只是签名过期了，换发一个新地址有意义，所以走有限次退避重试。
 * - `resource`：重签解决不了。两种来路都归这一档——① 这份 rendition 压根没有
 *   `expiresAt`（不是签名地址，没有签名可换）；② 我们**刚刚**才换发过地址，新地址
 *   同样打不开——那就证明了问题不在签名，而在资源本身。
 */
export type ArtifactRenditionFailureKind = "signature" | "resource";

export interface ArtifactRenditionFailureState {
  kind: ArtifactRenditionFailureKind;
  /** 自动退避重试已用尽（或压根不该自动重试）。此后只剩用户手动那一次。 */
  exhausted: boolean;
  /** 已经自动重签了几次。 */
  attempts: number;
}

/**
 * 有限次退避。**不许无限重试**：`resourceFailed` 挂在 `<img onError>` 上，每次重签都
 * 换发一个新地址，于是「失败→重签→再失败」会以网络往返的速度自激，把 rendition
 * 网关打爆。三次退避之后就停在一个说得清楚的失败态上，把下一次的决定权交回用户。
 */
const RENDITION_RETRY_BACKOFF_MS: readonly number[] = [400, 1_200, 3_600];

const RENDITION_SIGNATURE_EXHAUSTED_MESSAGE =
  "多次刷新安全访问地址后仍然打不开这一件，请稍后再试。";
const RENDITION_RESOURCE_MISSING_MESSAGE =
  "这一件的资源在服务器上取不到；刷新访问地址没有用。";
const RENDITION_RESIGNED_STILL_FAILING_MESSAGE =
  "刚换发的访问地址同样打不开，问题不在签名，而是这一件的资源本身取不到。";

export interface ArtifactRenditionState {
  url: string;
  purpose: ArtifactRenditionPurpose | null;
  /** Exact normalized representation selected or returned by refresh. */
  rendition: ArtifactRendition | null;
  loading: boolean;
  error: string;
  version: number;
  /** 为什么失败的、机器可读的那一份。`null` = 现在没有失败。 */
  failure: ArtifactRenditionFailureState | null;
  retry: () => void;
  resourceFailed: () => void;
}

function legacyUrl(
  item: LibraryItem,
  purposes: readonly ArtifactRenditionPurpose[],
): { url: string; purpose: ArtifactRenditionPurpose | null } {
  for (const purpose of purposes) {
    if (purpose === "thumbnail" && item.thumbUrl) {
      return { url: item.thumbUrl, purpose };
    }
    if (purpose === "preview" && item.previewUrl) {
      return { url: item.previewUrl, purpose };
    }
    if (
      (purpose === "full" || purpose === "source") &&
      item.url
    ) {
      return { url: item.url, purpose };
    }
  }
  return {
    url: item.previewUrl || item.url || item.thumbUrl || "",
    purpose: null,
  };
}

export function useArtifactRendition(
  item: LibraryItem,
  purposes?: readonly ArtifactRenditionPurpose[],
): ArtifactRenditionState {
  const durable = isDurableLibraryItem(item);
  const artifactId = durable ? item.artifactId : "";
  const revisionId = durable ? item.revisionId : "";
  const visible = durable && artifactIsVisible(item.artifact);
  const requestedKey = purposes?.length
    ? purposes.join("|")
    : durable
      ? viewerRenditionOrder(
          item.artifact.artifactType,
          item.artifact.access.canExportSource,
        ).join("|")
      : "preview|full";
  const requested = useMemo(
    () =>
      requestedKey
        .split("|")
        .filter(Boolean) as ArtifactRenditionPurpose[],
    [requestedKey],
  );
  const initialSignature = durable
    ? requested
        .map((purpose) => {
          const rendition = item.artifact.renditions[purpose];
          return `${purpose}:${rendition?.url || ""}:${rendition?.expiresAt || ""}`;
        })
        .join("|")
    : "";
  const initial = useMemo<ArtifactRendition | null>(() => {
    if (!durable) return null;
    if (!visible) return null;
    return (
      cachedRefreshedRendition(artifactId, revisionId, requested) ||
      selectArtifactRendition(item.artifact, requested)
    );
  }, [
    artifactId,
    durable,
    initialSignature,
    requested,
    revisionId,
    visible,
  ]);
  const identity = durable ? `${artifactId}:${revisionId}` : "";
  const [rendition, setRendition] = useState<ArtifactRendition | null>(
    initial,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [forced, setForced] = useState(false);
  const [failure, setFailure] =
    useState<ArtifactRenditionFailureState | null>(null);
  /**
   * 下面三个都必须是 ref，不能进 `useCallback` 的依赖：`retry` / `resourceFailed` 的
   * 引用一旦每次渲染都变，三个编辑器的加载 effect 就会自激
   * （`tests/rendition-callback-identity.test.mjs` 钉着这条，别把它们改成 state）。
   */
  const autoAttemptsRef = useRef(0);
  /** 本端换发过、交出去过的地址。它们再失败就证明问题不在签名。 */
  const resignedUrlsRef = useRef(new Set<string>());
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** `resourceFailed` 要读「当下正在用的那一份」，而它不能依赖 state。 */
  const activeRenditionRef = useRef<ArtifactRendition | null>(null);

  useEffect(() => {
    setRendition(initial);
    setError("");
    setForced(false);
    setRefreshVersion(0);
    setFailure(null);
    autoAttemptsRef.current = 0;
    resignedUrlsRef.current.clear();
    clearTimeout(backoffTimerRef.current);
  }, [identity, initial?.expiresAt, initial?.purpose, initial?.url]);

  useEffect(() => {
    activeRenditionRef.current = rendition || initial;
  }, [initial, rendition]);

  useEffect(() => () => clearTimeout(backoffTimerRef.current), []);

  useEffect(() => {
    if (!durable) return;
    if (!visible) {
      setError("当前主体无权查看这个 artifact revision。");
      return;
    }
    const selected = rendition || initial;
    if (!selected) {
      setError("当前 revision 没有可用 rendition。");
      return;
    }
    if (!forced && !renditionNeedsRefresh(selected)) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void refreshRenditionOnce(
      artifactId,
      revisionId,
      selected.purpose,
      forced,
    ).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok && result.data) {
        // 记下这个刚换发的地址。它**再**失败一次就证明问题不在签名上，
        // 于是下一次 `resourceFailed` 会判成 `resource` 而不是继续重签。
        if (result.data.url) resignedUrlsRef.current.add(result.data.url);
        setRendition(result.data);
        setRefreshVersion((value) => value + 1);
        setForced(false);
        setError("");
        setFailure(null);
      } else {
        setError(result.error || "signed URL 刷新失败。");
      }
      setLoading(false);
    });
    return () => controller.abort();
  }, [
    forced,
    artifactId,
    durable,
    identity,
    initial,
    refreshNonce,
    rendition,
    revisionId,
    visible,
  ]);

  /**
   * 用户按下的重试。它**重置**退避预算：自动重试用尽后失败面上仍然摆着一个按钮，
   * 那个按钮必须真的还能再试一次，否则它就是一句空话。
   */
  const retry = useCallback(() => {
    clearTimeout(backoffTimerRef.current);
    autoAttemptsRef.current = 0;
    resignedUrlsRef.current.clear();
    setFailure(null);
    setForced(true);
    setRefreshNonce((value) => value + 1);
  }, []);

  /**
   * 媒体元素报「这个地址取不到」时走这里。
   *
   * 形参刻意保持为空：调用点大多是 `onError={rendition.resourceFailed}`
   * （`library-viewers.tsx` 的 `<video>` / `<audio>` 两处），第一个实参会是一个
   * React 合成事件。所以「该不该重签」一律由本端从 `expiresAt` 与换发历史推出来，
   * 不从调用方要。
   */
  const resourceFailed = useCallback(() => {
    if (!durable) return;
    const active = activeRenditionRef.current;
    const url = active?.url || "";
    // 没有 `expiresAt` 就不是签名地址，没有签名可换；重签一次也是白跑。
    const signable = Boolean(active?.expiresAt);
    const freshSignatureAlsoFailed =
      Boolean(url) && resignedUrlsRef.current.has(url);
    if (!signable || freshSignatureAlsoFailed) {
      clearTimeout(backoffTimerRef.current);
      setFailure({
        kind: "resource",
        exhausted: true,
        attempts: autoAttemptsRef.current,
      });
      setError(
        freshSignatureAlsoFailed
          ? RENDITION_RESIGNED_STILL_FAILING_MESSAGE
          : RENDITION_RESOURCE_MISSING_MESSAGE,
      );
      setLoading(false);
      return;
    }
    const attempt = autoAttemptsRef.current;
    if (attempt >= RENDITION_RETRY_BACKOFF_MS.length) {
      clearTimeout(backoffTimerRef.current);
      setFailure({ kind: "signature", exhausted: true, attempts: attempt });
      setError(RENDITION_SIGNATURE_EXHAUSTED_MESSAGE);
      setLoading(false);
      return;
    }
    autoAttemptsRef.current = attempt + 1;
    setFailure({
      kind: "signature",
      exhausted: false,
      attempts: attempt + 1,
    });
    setLoading(true);
    clearTimeout(backoffTimerRef.current);
    backoffTimerRef.current = setTimeout(() => {
      setForced(true);
      setRefreshNonce((value) => value + 1);
    }, RENDITION_RETRY_BACKOFF_MS[attempt]);
  }, [durable]);

  if (!durable) {
    const legacy = legacyUrl(item, requested);
    const localDraft =
      item.meta.draft === true || item.meta.blank === true;
    return {
      ...legacy,
      rendition: null,
      loading: false,
      // Local /advanced blanks have no URL on purpose. That is not a
      // missing-source fault and must not surface "刷新 source/full".
      error: legacy.url || localDraft ? "" : "这个条目没有可用 URL。",
      version: 0,
      failure: null,
      retry: NO_RENDITION_ACTION,
      resourceFailed: NO_RENDITION_ACTION,
    };
  }
  if (!artifactIsVisible(item.artifact)) {
    return {
      url: "",
      purpose: null,
      rendition: null,
      loading: false,
      error: "当前主体无权查看这个 artifact revision。",
      version: 0,
      failure: null,
      retry: NO_RENDITION_ACTION,
      resourceFailed: NO_RENDITION_ACTION,
    };
  }
  return {
    url:
      rendition?.url && !isArtifactSourceTreeUrl(rendition.url)
        ? rendition.url
        : initial?.url && !isArtifactSourceTreeUrl(initial.url)
          ? initial.url
          : "",
    purpose: rendition?.purpose || initial?.purpose || null,
    rendition: rendition || initial,
    loading,
    error,
    version: refreshVersion,
    failure,
    retry,
    resourceFailed,
  };
}

export function withResolvedRendition(
  item: LibraryItem,
  state: Pick<ArtifactRenditionState, "url" | "purpose">,
): LibraryItem {
  if (!state.url) return item;
  // Never overwrite LibraryItem.url with an auth-gated source-tree path.
  if (isArtifactSourceTreeUrl(state.url)) return item;
  if (state.purpose === "thumbnail") {
    return { ...item, thumbUrl: state.url };
  }
  if (state.purpose === "preview") {
    /**
     * office 三支查看器（PPT / 表格 / 文档）读的是 `item.url`，不是 `previewUrl`。
     * `officeViewerRenditionPurposes` 会在同字节可缓存时把首选换成 `preview`，
     * 若这里只写 `previewUrl`，那次改选就落不到查看器手上——`url` 仍是旧的
     * 不可缓存地址，等于白改。所以 office 包的 `preview` 两个字段都写。
     */
    if (officePackageKindForItem(item)) {
      return { ...item, url: state.url, previewUrl: state.url };
    }
    return { ...item, previewUrl: state.url };
  }
  return { ...item, url: state.url };
}

/**
 * 失败面上摆的必须是一句话，不是一段响应体。
 *
 * 这里的 `message` 有一条来路是网关响应，它可能带着原始字节；把它原样摆出去就是
 * 「拿不到本体时把字节当文字给用户看」的同一种死法。判据与网站查看器共用
 * `isDisplayableText`。
 */
const FAILURE_MESSAGE_MAX_CHARS = 300;

function displayableFailureMessage(message: string): string {
  if (!isDisplayableText(message)) {
    return "这一件现在没有可显示的内容。";
  }
  return message.length > FAILURE_MESSAGE_MAX_CHARS
    ? `${message.slice(0, FAILURE_MESSAGE_MAX_CHARS)}…`
    : message;
}

export function ArtifactRenditionFailure({
  message,
  loading,
  failure,
  onRetry,
}: {
  message: string;
  loading?: boolean;
  /**
   * 有它就说得出「重签有没有用」，按钮上的字也就不再骗人。缺席时逐字保持既有文案，
   * 所以另外两个调用点（office 签发中 / 签发失败）一个字都不用改。
   */
  failure?: ArtifactRenditionFailureState | null;
  onRetry: () => void;
}) {
  /**
   * 资源本身取不到时，「正在刷新安全访问地址…」是一句假话，而按钮上写「重试」会让
   * 用户以为再点一次就好——现状就是这么把两种失败混在一起的（W07 P3）。
   */
  const resourceMissing = failure?.kind === "resource";
  const busy = Boolean(loading) && !resourceMissing;
  return (
    <div
      className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 text-center"
      role={busy ? "status" : "alert"}
      aria-live="polite"
      data-rendition-failure={failure?.kind || (busy ? "" : "unknown")}
      data-rendition-failure-exhausted={
        failure ? String(failure.exhausted) : undefined
      }
    >
      <p className="max-w-sm text-[12px] leading-relaxed text-[var(--muted,#78716c)]">
        {busy ? "正在刷新安全访问地址…" : displayableFailureMessage(message)}
      </p>
      {!busy && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-9 rounded-lg border border-[var(--border,#e7e5e4)] px-3 text-[12px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {resourceMissing ? "重新检查" : "重试"}
        </button>
      )}
    </div>
  );
}
