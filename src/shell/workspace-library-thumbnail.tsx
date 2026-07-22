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
      className="grid h-12 w-12 place-items-center rounded-2xl text-[11px] font-semibold"
      style={{ background: `${accent}12`, color: accent }}
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
  const artifactRendition = useArtifactRendition(
    item || EMPTY_THUMBNAIL_ITEM,
    THUMBNAIL_PURPOSES,
  );
  const [failed, setFailed] = useState(false);
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
  }, [artifactRendition.url, url]);
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
        return;
      }
      generatedThumbnailCache.set(referenceKey, nextUrl);
      if (alive) {
        setGeneratedUrl(nextUrl);
        setFailed(false);
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
  if (!displayUrl || failed) {
    return (
      <div ref={hostRef} className="grid h-full place-items-center">
        {typedArtifact && artifactRendition.loading ? (
          <span
            className="v-spinner h-4 w-4"
            role="status"
            aria-label={tt("正在刷新缩略图")}
          />
        ) : compact ? (
          <span className="text-[10px] font-medium text-[var(--muted,#a8a29e)]">
            {tt(WORKSPACE_KIND_LABELS[kind] || "内容")}
          </span>
        ) : (
          <WorkspaceKindIcon kind={kind} accent={accent} />
        )}
      </div>
    );
  }
  return (
    <div ref={hostRef} className="h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={displayUrl}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          if (lastFailedUrlRef.current !== displayUrl) {
            lastFailedUrlRef.current = displayUrl;
            artifactRendition.resourceFailed();
          }
          setFailed(true);
        }}
        className={imageClassName}
      />
    </div>
  );
}
