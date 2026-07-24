"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { ensureDatabaseThumbnail } from "../lib/database";
import { advancedLibraryReferenceFor } from "./advanced-features";
import { useArtifactRendition } from "./ArtifactRendition";
import {
  isDurableLibraryItem,
  type LibraryItem,
  type LibraryKind,
} from "./library-data";
import {
  WorkspaceCoverResource,
  workspaceCoverPlan,
  workspaceCoverRenditionPurposes,
} from "./workspace-library-cover";
import { WORKSPACE_KIND_LABELS } from "./workspace-library-model";

const generatedThumbnailCache = new Map<string, string>();
const generatedThumbnailPending = new Map<string, Promise<string>>();
const generatedThumbnailFailed = new Set<string>();
const THUMBNAIL_PURPOSES = ["thumbnail", "preview"] as const;
const EMPTY_THUMBNAIL_ITEM: LibraryItem = {
  key: "empty-thumbnail",
  source: "artifact",
  id: "empty-thumbnail",
  title: "",
  kind: "file",
  siteId: "",
  favorite: false,
  meta: {},
};

export function WorkspaceKindIcon({
  kind,
  accent,
}: {
  kind: LibraryKind;
  accent: string;
}) {
  const tt = useUI();
  return (
    <div
      className="grid h-10 w-10 place-items-center rounded-xl border bg-transparent text-[10px] font-semibold opacity-75"
      style={{ borderColor: `${accent}33`, color: accent }}
      aria-hidden="true"
    >
      {tt(WORKSPACE_KIND_LABELS[kind] || "内容")}
    </div>
  );
}

export function WorkspaceThumbnail({
  url,
  item,
  alt,
  kind,
  accent,
  imageClassName,
  compact = false,
}: {
  url?: string;
  item?: LibraryItem;
  alt: string;
  kind: LibraryKind;
  accent: string;
  imageClassName: string;
  compact?: boolean;
}) {
  const tt = useUI();
  const renditionPurposes = item
    ? workspaceCoverRenditionPurposes(item)
    : THUMBNAIL_PURPOSES;
  const artifactRendition = useArtifactRendition(
    item || EMPTY_THUMBNAIL_ITEM,
    renditionPurposes,
  );
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [generationError, setGenerationError] = useState(false);
  const [visible, setVisible] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const lastFailedUrlRef = useRef("");
  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const typedArtifact = Boolean(item && isDurableLibraryItem(item));
  const reference =
    item && !typedArtifact ? advancedLibraryReferenceFor(item) : null;
  const referenceKey =
    reference &&
    (reference.source === "work" ||
      reference.source === "asset" ||
      reference.source === "artifact")
      ? `${reference.source}:${reference.id}`
      : "";
  const thumbnailFilename = String(
    item?.meta.filename ||
      item?.meta.format ||
      item?.url ||
      "",
  ).toLowerCase();
  const canGenerateThumbnail =
    /\.(?:pdf|docx?|odt|rtf|pptx?|odp|xlsx?|ods|csv|mp4|mov|webm)(?:$|[?#])/i.test(
      thumbnailFilename,
    ) ||
    /^(?:pdf|docx?|odt|rtf|pptx?|odp|xlsx?|ods|csv|mp4|mov|webm)$/.test(
      String(item?.meta.format || "").toLowerCase(),
    );
  const requiresGeneratedThumbnail = Boolean(
    item &&
      canGenerateThumbnail &&
      ["ppt", "sheet", "document", "video", "file"].includes(kind) &&
      (!url || url === item.url),
  );
  const [generatedUrl, setGeneratedUrl] = useState(
    referenceKey ? generatedThumbnailCache.get(referenceKey) || "" : "",
  );
  useEffect(() => {
    setFailed(false);
    setReady(false);
    setGenerationError(false);
    setGeneratedUrl(
      referenceKey ? generatedThumbnailCache.get(referenceKey) || "" : "",
    );
  }, [
    artifactRendition.url,
    artifactRendition.version,
    referenceKey,
    url,
  ]);
  useEffect(() => {
    lastFailedUrlRef.current = "";
  }, [artifactRendition.url, artifactRendition.version, url]);
  useEffect(() => {
    if (
      !referenceKey ||
      generatedThumbnailFailed.has(referenceKey) ||
      !visible ||
      generatedUrl ||
      (url && !failed && !requiresGeneratedThumbnail) ||
      !reference
    ) {
      return;
    }
    let alive = true;
    let pending = generatedThumbnailPending.get(referenceKey);
    if (!pending) {
      pending = ensureDatabaseThumbnail(
        reference.source as "work" | "asset" | "artifact",
        reference.id,
      )
        .then((result) => (result.ok ? result.data?.thumb_url || "" : ""))
        .catch(() => "");
      generatedThumbnailPending.set(referenceKey, pending);
    }
    void pending.then((nextUrl) => {
      generatedThumbnailPending.delete(referenceKey);
      if (!nextUrl) {
        generatedThumbnailFailed.add(referenceKey);
        if (alive) setGenerationError(true);
        return;
      }
      generatedThumbnailCache.set(referenceKey, nextUrl);
      if (alive) {
        setGeneratedUrl(nextUrl);
        setFailed(false);
        setGenerationError(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [
    failed,
    generatedUrl,
    reference,
    referenceKey,
    requiresGeneratedThumbnail,
    url,
    visible,
  ]);
  const displayUrl = typedArtifact
    ? artifactRendition.url
    : generatedUrl || (requiresGeneratedThumbnail ? "" : url);
  const plan = workspaceCoverPlan({
    item,
    kind,
    url: displayUrl,
    rendition: typedArtifact ? artifactRendition.rendition : null,
    assumeImage: Boolean(
      generatedUrl ||
        (!typedArtifact && displayUrl && displayUrl === url),
    ),
  });
  const resourceKey = [
    plan.renderer,
    plan.url,
    artifactRendition.version,
  ].join(":");
  useEffect(() => {
    setReady(false);
  }, [resourceKey]);
  const awaitingGeneratedThumbnail = Boolean(
    referenceKey &&
      visible &&
      !generatedUrl &&
      !generationError &&
      !generatedThumbnailFailed.has(referenceKey) &&
      (requiresGeneratedThumbnail || failed),
  );
  const failureMessage =
    artifactRendition.loading || awaitingGeneratedThumbnail
      ? ""
      : artifactRendition.error ||
        (generationError
          ? "未能生成可显示的真实封面。"
          : failed
            ? "封面资源加载失败。"
            : plan.failureReason);
  const loading =
    !failureMessage &&
    (artifactRendition.loading ||
      awaitingGeneratedThumbnail ||
      (plan.renderer !== "unavailable" && !ready));
  const coverState = failureMessage
    ? "error"
    : loading
      ? "loading"
      : ready
        ? "ready"
        : "error";
  return (
    <div
      ref={hostRef}
      className="relative h-full w-full overflow-hidden"
      data-cover-state={coverState}
      data-cover-artifact-type={item?.artifactType || kind}
      data-cover-source-aspect={
        plan.sourceAspectRatio?.toFixed(4) || undefined
      }
    >
      {!failureMessage && plan.renderer !== "unavailable" && (
        <WorkspaceCoverResource
          plan={plan}
          alt={alt}
          className={imageClassName}
          resourceKey={resourceKey}
          onReady={() => {
            setFailed(false);
            setReady(true);
          }}
          onError={() => {
            if (lastFailedUrlRef.current !== resourceKey) {
              lastFailedUrlRef.current = resourceKey;
              artifactRendition.resourceFailed();
            }
            setReady(false);
            setFailed(true);
          }}
        />
      )}
      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--surface,#f5f5f4)]/80">
          <span
            className="v-spinner h-4 w-4"
            role="status"
            aria-label={tt(
              artifactRendition.loading
                ? "正在刷新缩略图"
                : "正在加载真实封面",
            )}
          />
        </div>
      )}
      {failureMessage && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 border border-dashed border-[var(--border-strong,#d6d3d1)] bg-[var(--surface,#f5f5f4)] px-2 text-center"
          role="alert"
          data-cover-failure="true"
          title={failureMessage}
        >
          {!compact && <WorkspaceKindIcon kind={kind} accent={accent} />}
          <span className="text-[10px] font-semibold text-[var(--fg-2,#57534e)]">
            {tt("封面不可用")}
          </span>
          <span className="line-clamp-2 text-[9px] leading-tight text-[var(--muted,#a8a29e)]">
            {compact
              ? tt(WORKSPACE_KIND_LABELS[kind] || "内容")
              : tt(failureMessage)}
          </span>
        </div>
      )}
    </div>
  );
}
