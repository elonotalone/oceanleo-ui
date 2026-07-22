"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  artifactIsVisible,
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

export interface ArtifactRenditionState {
  url: string;
  purpose: ArtifactRenditionPurpose | null;
  loading: boolean;
  error: string;
  version: number;
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

  useEffect(() => {
    setRendition(initial);
    setError("");
    setForced(false);
    setRefreshVersion(0);
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

  const retry = useCallback(() => {
    setForced(true);
    setRefreshNonce((value) => value + 1);
  }, []);
  const resourceFailed = useCallback(() => {
    if (durable) retry();
  }, [durable, retry]);

  if (!durable) {
    const legacy = legacyUrl(item, requested);
    return {
      ...legacy,
      loading: false,
      error: legacy.url ? "" : "这个条目没有可用 URL。",
      version: 0,
      retry: () => undefined,
      resourceFailed: () => undefined,
    };
  }
  if (!artifactIsVisible(item.artifact)) {
    return {
      url: "",
      purpose: null,
      loading: false,
      error: "当前主体无权查看这个 artifact revision。",
      version: 0,
      retry: () => undefined,
      resourceFailed: () => undefined,
    };
  }
  return {
    url: rendition?.url || initial?.url || "",
    purpose: rendition?.purpose || initial?.purpose || null,
    loading,
    error,
    version: refreshVersion,
    retry,
    resourceFailed,
  };
}

export function withResolvedRendition(
  item: LibraryItem,
  state: Pick<ArtifactRenditionState, "url" | "purpose">,
): LibraryItem {
  if (!state.url) return item;
  if (state.purpose === "thumbnail") {
    return { ...item, thumbUrl: state.url };
  }
  if (state.purpose === "preview") {
    return { ...item, previewUrl: state.url };
  }
  return { ...item, url: state.url };
}

export function ArtifactRenditionFailure({
  message,
  loading,
  onRetry,
}: {
  message: string;
  loading?: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 text-center"
      role={loading ? "status" : "alert"}
      aria-live="polite"
    >
      <p className="max-w-sm text-[12px] leading-relaxed text-[var(--muted,#78716c)]">
        {loading ? "正在刷新安全访问地址…" : message}
      </p>
      {!loading && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-9 rounded-lg border border-[var(--border,#e7e5e4)] px-3 text-[12px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          重试
        </button>
      )}
    </div>
  );
}
