"use client";

/**
 * 卖家填表（BayImageGallery）：闲鱼「发闲置 / 宝贝图片」——横排方格，角上叉掉，
 * 格子右侧永远留着「+ 添加细节图」，一次能选多张，最多 9 张。
 * 买家看帖（BayImageStage）：左侧缩略图 + 主图。填写页不要用 Stage。
 */

import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { uploadFile } from "../../../lib/database";
import { BAY_GALLERY_MAX, cleanGalleryUrls, isGalleryImageFile } from "./bay-gallery";

const TILE_PX = 88;
const TILE: CSSProperties = {
  position: "relative",
  width: TILE_PX,
  height: TILE_PX,
  borderRadius: 8,
  overflow: "hidden",
  flexShrink: 0,
  background: "#f5f5f5",
};
const GRID: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  width: "100%",
};
const ADD: CSSProperties = {
  ...TILE,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  margin: 0,
  padding: 6,
  border: "none",
  background: "#f4f4f5",
  color: "#737373",
  cursor: "pointer",
  textAlign: "center",
};
const FILE: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};
const STAGE: CSSProperties = { display: "flex", gap: 8, alignItems: "stretch", width: "100%" };
const RAIL: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: 56,
  flexShrink: 0,
  maxHeight: 220,
  overflowY: "auto",
};
const THUMB: CSSProperties = {
  position: "relative",
  width: 56,
  height: 56,
  padding: 0,
  borderRadius: 8,
  overflow: "hidden",
  background: "#f5f5f5",
  flexShrink: 0,
  cursor: "pointer",
};
const MAIN: CSSProperties = {
  position: "relative",
  flex: 1,
  minWidth: 0,
  aspectRatio: "16 / 9",
  borderRadius: 12,
  overflow: "hidden",
  background: "#f5f5f5",
};
const EMPTY: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  borderRadius: 12,
  overflow: "hidden",
  background: "#ffffff",
};

type PendingSlot = { id: string; preview: string; file: File };

function objectUrl(file: File): string {
  try {
    return URL.createObjectURL(file);
  } catch {
    return "";
  }
}

function revokeUrl(url: string) {
  if (!url.startsWith("blob:")) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

function uploadedHttps(result: { ok: boolean; data?: { file?: { url?: string } }; error?: string }): string {
  if (!result.ok) return "";
  const url = result.data?.file?.url || "";
  return url.startsWith("https://") ? url : "";
}

function sameUrls(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function BayImageStage(props: {
  urls: string[];
  active?: number;
  onActive?: (index: number) => void;
  emptyLabel?: string;
}): ReactElement {
  const tt = useUI();
  const urls = cleanGalleryUrls(props.urls);
  const active = Math.min(Math.max(props.active ?? 0, 0), Math.max(urls.length - 1, 0));
  const current = urls[active] || "";
  if (!urls.length) {
    return (
      <div data-bay-image-stage="" data-bay-gallery-empty="" style={EMPTY} className="grid place-items-center border border-neutral-200 text-[13px] text-neutral-400">
        {props.emptyLabel || tt("卖家暂未上传作品图")}
      </div>
    );
  }
  return (
    <div data-bay-image-stage="" data-bay-gallery-count={urls.length} style={STAGE}>
      {urls.length > 1 ? (
        <div data-bay-gallery-rail="" style={RAIL}>
          {urls.map((url, index) => (
            <button
              key={`${index}-${url}`}
              type="button"
              data-bay-gallery-thumb={index}
              aria-pressed={active === index}
              aria-label={tt("第 {n} 张", { n: index + 1 })}
              onClick={() => props.onActive?.(index)}
              style={{ ...THUMB, border: active === index ? "2px solid #171717" : "1px solid #e5e5e5" }}
            >
              <img src={url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
      <div data-bay-gallery-main="" style={MAIN}>
        <img src={current} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      </div>
    </div>
  );
}

export function BayImageGallery(props: {
  urls: string[];
  onUrls: (urls: string[]) => void;
  disabled?: boolean;
  max?: number;
}): ReactElement {
  const tt = useUI();
  const inputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>(cleanGalleryUrls(props.urls));
  const pushedRef = useRef<string[] | null>(null);
  const pendingRef = useRef<PendingSlot[]>([]);
  const max = Math.min(Math.max(props.max ?? BAY_GALLERY_MAX, 1), BAY_GALLERY_MAX);
  const [pending, setPending] = useState<PendingSlot[]>([]);
  pendingRef.current = pending;
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [urls, setUrls] = useState<string[]>(() => cleanGalleryUrls(props.urls));
  const disabled = Boolean(props.disabled);

  useEffect(() => {
    const incoming = cleanGalleryUrls(props.urls);
    if (pushedRef.current && sameUrls(incoming, pushedRef.current)) return;
    if (sameUrls(incoming, urlsRef.current)) return;
    urlsRef.current = incoming;
    setUrls(incoming);
  }, [props.urls]);

  const used = urls.length + pending.length;
  const room = Math.max(0, max - used);

  function commitUrls(next: string[]) {
    const cleaned = cleanGalleryUrls(next).slice(0, max);
    urlsRef.current = cleaned;
    pushedRef.current = cleaned;
    setUrls(cleaned);
    props.onUrls(cleaned);
  }

  function dropPending(id: string) {
    const slot = pendingRef.current.find((item) => item.id === id);
    if (slot) revokeUrl(slot.preview);
    const next = pendingRef.current.filter((item) => item.id !== id);
    pendingRef.current = next;
    setPending(next);
  }

  async function addFiles(list: FileList | File[] | null | undefined) {
    if (!list || disabled) return;
    const picked = Array.from(list);
    if (!picked.length) return;
    setError("");
    const images = picked.filter(isGalleryImageFile);
    if (!images.length) {
      setError(tt("只能添加图片"));
      return;
    }
    const available = Math.max(0, max - urlsRef.current.length - pendingRef.current.length);
    if (!available) {
      setError(tt("最多 {n} 张", { n: max }));
      return;
    }
    const batch = images.slice(0, available);
    if (images.length > available) setError(tt("最多 {n} 张", { n: max }));
    const newcomers: PendingSlot[] = batch.map((file, index) => ({
      id: `p-${Date.now()}-${index}-${file.name}`,
      preview: objectUrl(file),
      file,
    }));
    const nextPending = [...pendingRef.current, ...newcomers];
    pendingRef.current = nextPending;
    setPending(nextPending);
    if (inputRef.current) inputRef.current.value = "";

    for (const slot of newcomers) {
      try {
        const uploaded = await uploadFile(slot.file, { siteId: "home", title: slot.file.name });
        const url = uploadedHttps(uploaded);
        if (!url) {
          setError(uploaded.ok === false ? uploaded.error || tt("图片没传上去") : tt("图片没传上去"));
          continue;
        }
        const current = urlsRef.current;
        if (current.includes(url) || current.length >= max) continue;
        commitUrls([...current, url]);
      } catch {
        setError(tt("图片没传上去"));
      } finally {
        dropPending(slot.id);
      }
    }
  }

  function removeAt(index: number) {
    if (disabled) return;
    commitUrls(urlsRef.current.filter((_, i) => i !== index));
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled && room > 0) setDragging(true);
  }

  function onDragLeave() {
    setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    void addFiles(event.dataTransfer.files);
  }

  const pick = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple
      style={FILE}
      disabled={disabled || room <= 0}
      onChange={(event) => void addFiles(event.target.files)}
    />
  );

  return (
    <div
      data-bay-image-gallery=""
      data-bay-gallery-editor="grid"
      data-bay-gallery-count={urls.length}
      data-bay-cover-drop=""
      data-bay-cover-state={urls.length || pending.length ? "filled" : "empty"}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{ outline: dragging ? "1px dashed #a3a3a3" : undefined, outlineOffset: 2 }}
    >
      <div data-bay-gallery-grid="" style={GRID}>
        {urls.map((url, index) => (
          <div key={`${index}-${url}`} data-bay-gallery-tile={index} style={TILE}>
            <img src={url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            <button
              type="button"
              data-bay-gallery-remove={index}
              aria-label={tt("去掉这张")}
              disabled={disabled}
              onClick={() => removeAt(index)}
              className="absolute right-1 top-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-black/70 text-[11px] leading-none text-white disabled:opacity-40"
            >
              ×
            </button>
          </div>
        ))}
        {pending.map((slot) => (
          <div key={slot.id} data-bay-gallery-pending="" style={TILE}>
            {slot.preview ? (
              <img src={slot.preview} alt="" className="h-full w-full object-cover opacity-60" />
            ) : null}
            <span className="absolute inset-0 grid place-items-center text-[11px] text-neutral-600">{tt("上传中")}</span>
          </div>
        ))}
        {room > 0 ? (
          <label
            data-bay-cover-pick=""
            data-bay-gallery-add=""
            data-bay-gallery-empty={urls.length || pending.length ? undefined : ""}
            aria-label={`${tt("添加细节图")} · ${tt("最多 {n} 张", { n: max })}`}
            style={{ ...ADD, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            <span className="text-[11px] leading-tight">{tt("添加细节图")}</span>
            {pick}
          </label>
        ) : null}
      </div>
      <p data-bay-cover-hint="" className="hidden">
        {tt("把图片拖到这里")}
      </p>
      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
