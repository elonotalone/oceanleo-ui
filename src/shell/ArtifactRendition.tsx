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
import { refreshArtifactRendition } from "./artifact-client";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "./library-data";

export interface ArtifactRenditionState {
  url: string;
  purpose: ArtifactRenditionPurpose | null;
  loading: boolean;
  error: string;
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
  const requested = useMemo(
    () =>
      purposes?.length
        ? [...purposes]
        : isDurableLibraryItem(item)
          ? viewerRenditionOrder(
              item.artifact.artifactType,
              item.artifact.access.canExportSource,
            )
          : (["preview", "full"] as ArtifactRenditionPurpose[]),
    [
      item,
      purposes,
    ],
  );
  const initial = useMemo<ArtifactRendition | null>(() => {
    if (!isDurableLibraryItem(item)) return null;
    if (!artifactIsVisible(item.artifact)) return null;
    return selectArtifactRendition(item.artifact, requested);
  }, [item, requested]);
  const identity = isDurableLibraryItem(item)
    ? `${item.artifactId}:${item.revisionId}`
    : "";
  const [rendition, setRendition] = useState<ArtifactRendition | null>(
    initial,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [forced, setForced] = useState(false);

  useEffect(() => {
    setRendition(initial);
    setError("");
    setForced(false);
  }, [identity, initial?.expiresAt, initial?.purpose, initial?.url]);

  useEffect(() => {
    if (!isDurableLibraryItem(item)) return;
    if (!artifactIsVisible(item.artifact)) {
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
    void refreshArtifactRendition(
      { artifactId: item.artifactId, revisionId: item.revisionId },
      selected.purpose,
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok && result.data) {
        setRendition(result.data);
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
    identity,
    initial,
    item,
    refreshNonce,
    rendition,
  ]);

  const retry = useCallback(() => {
    setForced(true);
    setRefreshNonce((value) => value + 1);
  }, []);
  const resourceFailed = useCallback(() => {
    if (isDurableLibraryItem(item)) retry();
  }, [item, retry]);

  if (!isDurableLibraryItem(item)) {
    const legacy = legacyUrl(item, requested);
    return {
      ...legacy,
      loading: false,
      error: legacy.url ? "" : "这个条目没有可用 URL。",
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
      retry: () => undefined,
      resourceFailed: () => undefined,
    };
  }
  return {
    url: rendition?.url || initial?.url || "",
    purpose: rendition?.purpose || initial?.purpose || null,
    loading,
    error,
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
