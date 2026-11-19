"use client";

import { useAutoRecovery } from "../lib/auto-recovery";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useUI } from "../i18n/ui/useUI";
import { officePackageKindForItem } from "./doc-editors/office-file";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "./library-data";

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

/** Signing and media transport errors recover through the same paced loop. */
export type ArtifactRenditionFailureKind = "signature" | "resource";

export interface ArtifactRenditionFailureState {
  kind: ArtifactRenditionFailureKind;
  /** Whether a caller has exhausted its own loading operation. */
  exhausted: boolean;
  /** 已经自动重签了几次。 */
  attempts: number;
}

const RENDITION_RESOURCE_MISSING_MESSAGE = "正在打开这份素材…";

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
  useEffect(() => {
    setRendition(initial);
    setError("");
    setForced(false);
    setRefreshVersion(0);
    setFailure(null);
  }, [identity, initial?.expiresAt, initial?.purpose, initial?.url]);

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

  // Re-read the current revision grant without replacing editor content.
  const retry = useCallback(() => {
    setFailure(null);
    setForced(true);
    setRefreshNonce((value) => value + 1);
  }, []);

  // Media failures include transport failures even when a URL has no expiring signature.
  const resourceFailed = useCallback(() => {
    if (!durable) return;
    setFailure({ kind: "resource", exhausted: false, attempts: 0 });
    setError(RENDITION_RESOURCE_MISSING_MESSAGE);
    setLoading(false);
  }, [durable]);
  useAutoRecovery(durable && visible && Boolean(error || failure) && !loading, retry, identity);


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
    if (
      officePackageKindForItem(item) ||
      item.kind === "document" ||
      item.kind === "file"
    ) {
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
/** A recovering resource keeps its normal loading look in every host. */
export function ArtifactRenditionFailure(_props: {
  message: string;
  loading?: boolean;
  failure?: ArtifactRenditionFailureState | null;
  onRetry?: () => void;
}) {
  const tt = useUI();
  return <div role="status" aria-busy="true" className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 text-center">
    <span className="v-spinner h-5 w-5" />
    <p className="text-[12px] text-[var(--muted,#78716c)]">{tt("正在打开这份素材…")}</p>
  </div>;
}
