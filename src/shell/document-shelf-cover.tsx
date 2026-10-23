"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { canvasSafeUrl } from "../lib/media-proxy";
import {
  fetchValidatedOfficePackage,
  officePackageKindForItem,
} from "./doc-editors/office-file";
import {
  type LibraryItem,
  type LibraryKind,
} from "./library-data";
import {
  libraryEditorLabel,
  translateLibraryTypeLabel,
} from "./library-editor-category";
import {
  clampExcerpt,
  decodeTextHead,
  documentExcerptSource,
  extractDocumentCoverExcerpt,
  itemUsesTextDocumentCard,
  looksLikeBinaryText,
  storedTextExcerpt,
  textExcerptFromSource,
} from "./document-cover-excerpt";
import {
  extractOoxmlEmbeddedThumbnail,
  ooxmlThumbnailObjectUrl,
} from "./ooxml-embedded-thumbnail";

const excerptCache = new Map<string, string>();
const thumbnailUrlCache = new Map<string, string>();
/** 文字卡片只读开头：64KB 足够算出 600 字的摘要，大文件也不整份下载。 */
const TEXT_HEAD_BYTES = 64 * 1024;
/** Word 包要整份读（目录在包尾）；卡片只为「便宜取到」的那一档去读。 */
const DOCX_COVER_MAX_BYTES = 16 * 1024 * 1024;
const OFFICE_FALLBACK_MAX_BYTES = 64 * 1024 * 1024;
const READ_TIMEOUT_MS = 12_000;

function cacheKey(item: LibraryItem): string {
  return [
    item.artifactId || item.id || item.key,
    item.revisionId || "",
    item.url || item.previewUrl || "",
  ].join(":");
}

function fallbackSourceUrl(item: LibraryItem): string {
  return (
    item.artifact?.renditions.source?.url ||
    item.artifact?.renditions.full?.url ||
    item.url ||
    item.previewUrl ||
    ""
  );
}

/** 只读开头 `limit` 字节就停（不靠 Range 头，不改 CORS 形态）。 */
async function readTextHead(
  url: string,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetch(canvasSafeUrl(url), {
    cache: "force-cache",
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.body) {
    return new Uint8Array(await response.arrayBuffer()).subarray(0, limit);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  const head = new Uint8Array(Math.min(size, limit));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= head.length) break;
    const part = chunk.subarray(0, head.length - offset);
    head.set(part, offset);
    offset += part.length;
  }
  return head;
}

/** Shelf fallback for decks / sheets / files that have no displayable cover. */
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
  const textCard = itemUsesTextDocumentCard(item, kind);
  const stored = textCard ? storedTextExcerpt(item) : "";
  const source = textCard && !stored ? documentExcerptSource(item) : null;
  const sourceKind = source?.kind || "";
  const sourceUrl = source?.url || "";
  // Decks / sheets keep the OOXML fallback (embedded thumbnail or first lines).
  const officeKind = textCard ? null : officePackageKindForItem(item);
  const officeUrl = officeKind ? fallbackSourceUrl(item) : "";
  const itemRef = useRef(item);
  itemRef.current = item;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [thumbnailUrl, setThumbnailUrl] = useState(
    () => (textCard ? "" : thumbnailUrlCache.get(key) || ""),
  );
  const [excerpt, setExcerpt] = useState(
    () => stored || excerptCache.get(key) || "",
  );
  const [settled, setSettled] = useState(
    () => Boolean(stored || excerptCache.has(key)),
  );
  useEffect(() => {
    setThumbnailUrl(textCard ? "" : thumbnailUrlCache.get(key) || "");
    setExcerpt(stored || excerptCache.get(key) || "");
    setSettled(Boolean(stored || excerptCache.has(key)));
  }, [key, stored, textCard]);
  useEffect(() => {
    if (thumbnailUrl) onReadyRef.current?.();
  }, [thumbnailUrl]);
  useEffect(() => {
    if (!visible) return;
    const url = textCard ? sourceUrl : officeUrl;
    if (stored || !url || excerptCache.has(key) || thumbnailUrlCache.has(key)) {
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
    }, READ_TIMEOUT_MS);
    const keep = (next: string) => {
      if (!next) return;
      excerptCache.set(key, next);
      setExcerpt(next);
    };
    void (async () => {
      try {
        if (textCard && sourceKind === "text") {
          const head = await readTextHead(url, TEXT_HEAD_BYTES, abort.signal);
          if (!alive || abort.signal.aborted || looksLikeBinaryText(head)) return;
          keep(textExcerptFromSource(decodeTextHead(head)));
          return;
        }
        const packageKind = textCard ? "docx" : officeKind;
        if (!packageKind) return;
        const { arrayBuffer } = await fetchValidatedOfficePackage(url, packageKind, {
          item: itemRef.current,
          signal: abort.signal,
          maxBytes: textCard ? DOCX_COVER_MAX_BYTES : OFFICE_FALLBACK_MAX_BYTES,
        });
        if (!alive || abort.signal.aborted) return;
        if (!textCard) {
          const embedded = extractOoxmlEmbeddedThumbnail(arrayBuffer);
          if (embedded) {
            const objectUrl = ooxmlThumbnailObjectUrl(embedded);
            thumbnailUrlCache.set(key, objectUrl);
            setThumbnailUrl(objectUrl);
            return;
          }
        }
        const next = extractDocumentCoverExcerpt(arrayBuffer);
        keep(textCard ? clampExcerpt(next) : next);
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
  }, [key, officeKind, officeUrl, sourceKind, sourceUrl, stored, textCard, visible]);

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

  const kindLabel = translateLibraryTypeLabel(tt, libraryEditorLabel(item));
  // 标题第一帧就在；摘要没到之前那块留空，不放「正在读取」。颜色全走站点 token（D6）。
  return (
    <div
      className="flex h-full w-full flex-col bg-[var(--card,#fff)] px-3 py-3 text-left"
      data-document-cover={excerpt ? "excerpt" : settled ? "unavailable" : "pending"}
      data-document-excerpt-source={
        stored ? "meta" : excerpt ? sourceKind || "office" : undefined
      }
      aria-label={alt}
    >
      <p className="text-[9px] font-medium uppercase tracking-wide text-[var(--fg-2,#57534e)]">
        {kindLabel}
      </p>
      <p
        className={`mt-1 font-semibold leading-snug text-[var(--fg,#1c1917)] ${
          compact ? "line-clamp-2 text-[10px]" : "line-clamp-3 text-[12px]"
        }`}
      >
        {item.title || alt}
      </p>
      {!compact && excerpt ? (
        <p className="mt-2 line-clamp-6 whitespace-pre-line text-[9px] leading-relaxed text-[var(--fg-2,#57534e)]">
          {excerpt}
        </p>
      ) : !compact && settled ? (
        <p className="mt-2 text-[9px] leading-relaxed text-[var(--fg-2,#57534e)]">
          {tt("暂无内容预览，打开查看素材")}
        </p>
      ) : null}
    </div>
  );
}
