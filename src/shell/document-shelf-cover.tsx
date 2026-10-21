"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { fetchMediaBlob } from "../lib/media-proxy";
import {
  fetchValidatedOfficePackage,
  officePackageKindForItem,
} from "./doc-editors/office-file";
import {
  type LibraryItem,
  type LibraryKind,
} from "./library-data";
import { libraryEditorLabel } from "./library-editor-category";
import { extractDocumentCoverExcerpt } from "./document-cover-excerpt";
import {
  extractOoxmlEmbeddedThumbnail,
  ooxmlThumbnailObjectUrl,
} from "./ooxml-embedded-thumbnail";

const excerptCache = new Map<string, string>();
const thumbnailUrlCache = new Map<string, string>();

function cacheKey(item: LibraryItem): string {
  return [
    item.artifactId || item.id || item.key,
    item.revisionId || "",
    item.url || item.previewUrl || "",
  ].join(":");
}

function sourceUrlOf(item: LibraryItem): string {
  return (
    item.artifact?.renditions.source?.url ||
    item.artifact?.renditions.full?.url ||
    item.url ||
    item.previewUrl ||
    ""
  );
}

function itemMediaType(item: LibraryItem): string {
  return String(
    item.artifact?.renditions.source?.mediaType ||
      item.artifact?.renditions.full?.mediaType ||
      item.meta.viewer_media_type ||
      item.meta.mime ||
      "",
  )
    .trim()
    .toLowerCase()
    .split(";", 1)[0];
}

function looksLikeTextDocument(item: LibraryItem): boolean {
  const media = itemMediaType(item);
  const name = String(
    item.meta.filename || item.meta.format || item.url || item.title || "",
  ).toLowerCase();
  if (item.artifactType && item.artifactType !== "document") return false;
  if (media === "text/plain" || media === "text/markdown") return true;
  return /\.(md|markdown|txt)(?:$|[?#])/i.test(name);
}

function excerptFromText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^---[\s\S]*?---\n/, "")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>#]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join("\n");
}

export function itemUsesDocumentShelfCover(
  item: LibraryItem | undefined,
  kind: LibraryKind,
): boolean {
  if (!item) return false;
  return (
    kind === "document" ||
    kind === "file" ||
    kind === "ppt" ||
    kind === "sheet"
  );
}

export function DocumentShelfCover({
  item,
  kind,
  alt,
  compact = false,
  visible = true,
  onReady,
}: {
  item: LibraryItem;
  kind: LibraryKind;
  alt: string;
  compact?: boolean;
  visible?: boolean;
  onReady?: () => void;
}) {
  const tt = useUI();
  const key = cacheKey(item);
  const officeKind = officePackageKindForItem(item);
  const sourceUrl = sourceUrlOf(item);
  const textDocument = looksLikeTextDocument(item);
  const itemRef = useRef(item);
  itemRef.current = item;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [thumbnailUrl, setThumbnailUrl] = useState(
    () => thumbnailUrlCache.get(key) || "",
  );
  const [excerpt, setExcerpt] = useState(() => excerptCache.get(key) || "");
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setThumbnailUrl(thumbnailUrlCache.get(key) || "");
    setExcerpt(excerptCache.get(key) || "");
    setSettled(false);
  }, [key]);
  useEffect(() => {
    if (thumbnailUrl) onReadyRef.current?.();
  }, [thumbnailUrl]);
  useEffect(() => {
    if (!visible) return;
    if (!sourceUrl) {
      setSettled(true);
      onReadyRef.current?.();
      return;
    }
    let alive = true;
    const abort = new AbortController();
    const timeout = setTimeout(() => {
      abort.abort();
      if (alive) {
        setSettled(true);
        onReadyRef.current?.();
      }
    }, 12_000);
    void (async () => {
      try {
        if (officeKind && !thumbnailUrlCache.get(key)) {
          const { arrayBuffer } = await fetchValidatedOfficePackage(
            sourceUrl,
            officeKind,
            {
              item: itemRef.current,
              signal: abort.signal,
              maxBytes: 64 * 1024 * 1024,
            },
          );
          if (!alive || abort.signal.aborted) return;
          const embedded = extractOoxmlEmbeddedThumbnail(arrayBuffer);
          if (embedded) {
            const objectUrl = ooxmlThumbnailObjectUrl(embedded);
            thumbnailUrlCache.set(key, objectUrl);
            setThumbnailUrl(objectUrl);
            return;
          }
          const next = extractDocumentCoverExcerpt(arrayBuffer);
          if (next) {
            excerptCache.set(key, next);
            setExcerpt(next);
          }
        }
        if (textDocument && !excerptCache.get(key)) {
          const blob = await fetchMediaBlob(sourceUrl, {
            maxBytes: 64 * 1024,
            signal: abort.signal,
          });
          if (!alive || abort.signal.aborted) return;
          const next = excerptFromText(await blob.text());
          excerptCache.set(key, next);
          setExcerpt(next);
        }
      } catch {
        // Missing previews stay explicitly unavailable; never fabricate document content.
      } finally {
        clearTimeout(timeout);
        if (alive) {
          setSettled(true);
          onReadyRef.current?.();
        }
      }
    })();
    return () => {
      alive = false;
      clearTimeout(timeout);
      abort.abort();
    };
  }, [key, officeKind, sourceUrl, textDocument, visible]);

  if (thumbnailUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbnailUrl}
        alt={alt}
        className="h-full w-full object-cover object-top"
        data-document-cover="embedded-thumbnail"
        onError={() => {
          thumbnailUrlCache.delete(key);
          setThumbnailUrl("");
          setSettled(true);
        }}
      />
    );
  }

  const kindLabel = tt(libraryEditorLabel(item));
  return (
    <div
      className="flex h-full w-full flex-col bg-white px-3 py-3 text-left shadow-[inset_0_0_0_1px_rgba(28,25,23,0.06)]"
      data-document-cover={excerpt ? "excerpt" : "unavailable"}
      aria-label={alt}
    >
      <p className="text-[9px] font-medium uppercase tracking-wide text-stone-400">
        {kindLabel}
      </p>
      <p
        className={`mt-1 font-semibold leading-snug text-stone-900 ${
          compact ? "line-clamp-2 text-[10px]" : "line-clamp-3 text-[12px]"
        }`}
      >
        {item.title || alt}
      </p>
      {!compact && excerpt ? (
        <p className="mt-2 line-clamp-6 whitespace-pre-line text-[9px] leading-relaxed text-stone-500">
          {excerpt}
        </p>
      ) : !compact ? (
        <p className="mt-2 text-[9px] leading-relaxed text-stone-500">
          {tt(settled ? "暂无内容预览，打开查看素材" : "正在读取内容预览")}
        </p>
      ) : null}
    </div>
  );
}
