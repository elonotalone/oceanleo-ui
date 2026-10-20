"use client";

/**
 * 卖家填表（BayImageGallery）：默认闲鱼「发闲置」横排方格；`variant="listing"` 是
 * Etsy 商品页那种左侧缩略图轨 + 大主图，给发帖左右分栏用。
 * 买家看帖（BayImageStage）：只看不改。
 */

import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { uploadFile } from "../../../lib/database";
import { BAY_GALLERY_MAX, cleanGalleryUrls, isGalleryImageFile } from "./bay-gallery";
import { humanUploadError, safeIdempotencyKey } from "./bay-upload";

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
const ADD_RAIL: CSSProperties = {
  ...ADD,
  width: 72,
  height: 72,
  gap: 2,
  padding: 4,
  background: "#fff",
  border: "1px solid #e5e5e5",
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
const LISTING_STAGE: CSSProperties = { display: "flex", gap: 12, alignItems: "flex-start", width: "100%" };
const LISTING_RAIL: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  width: 72,
  flexShrink: 0,
  maxHeight: "min(36rem, 72vh)",
  overflowY: "auto",
};
const LISTING_THUMB: CSSProperties = {
  position: "relative",
  width: 72,
  height: 72,
  padding: 0,
  borderRadius: 2,
  overflow: "hidden",
  background: "#ffffff",
  flexShrink: 0,
  cursor: "pointer",
};
const LISTING_MAIN: CSSProperties = {
  position: "relative",
  flex: 1,
  minWidth: 0,
  minHeight: 448,
  aspectRatio: "1 / 1",
  borderRadius: 2,
  overflow: "hidden",
  background: "#ffffff",
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
  /** listing：左侧大图 + 缩略图，给发帖左右分栏用。默认仍是闲鱼方格。 */
  variant?: "grid" | "listing";
}): ReactElement {
  const tt = useUI();
  const siteId = "oceanleo";
  const inputRef = useRef<HTMLInputElement>(null);
  const listing = props.variant === "listing";
  const [active, setActive] = useState(0);
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
        const uploaded = await uploadFile(slot.file, {
          siteId,
          title: slot.file.name,
          idempotencyKey: safeIdempotencyKey(["bay-gallery-v1", siteId, slot.file.name, slot.file.size, slot.file.lastModified]),
        });
        const url = uploadedHttps(uploaded);
        if (!url) {
          setError(uploaded.ok === false ? tt(humanUploadError(uploaded.error, uploaded.status)) : tt("图片没传上去"));
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
      hidden
      className="hidden"
      disabled={disabled || room <= 0}
      onChange={(event) => void addFiles(event.target.files)}
    />
  );
  const addTile = room > 0 ? (
    <button
      type="button"
      data-bay-cover-pick=""
      data-bay-gallery-add=""
      data-bay-gallery-empty={urls.length || pending.length ? undefined : ""}
      aria-label={`${tt("添加细节图")} · ${tt("最多 {n} 张", { n: max })}`}
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      style={{
        ...(listing ? ADD_RAIL : ADD),
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={listing ? "h-4 w-4" : "h-5 w-5"} aria-hidden="true">
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
      {listing ? null : <span className="text-[11px] leading-tight">{tt("添加细节图")}</span>}
    </button>
  ) : null;
  const tiles = (
    <>
      {urls.map((url, index) => (
        <div key={`${index}-${url}`} data-bay-gallery-tile={index} style={TILE}>
          {listing ? (
            <button type="button" onClick={() => setActive(index)} className="h-full w-full" aria-pressed={active === index} aria-label={tt("第 {n} 张", { n: index + 1 })}>
              <img src={url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            </button>
          ) : (
            <img src={url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          )}
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
      {addTile}
    </>
  );
  const current = urls[Math.min(Math.max(active, 0), Math.max(urls.length - 1, 0))] || pending[0]?.preview || "";

  return (
    <div
      data-bay-image-gallery=""
      data-bay-gallery-editor={listing ? "listing" : "grid"}
      data-bay-gallery-count={urls.length}
      data-bay-cover-drop=""
      data-bay-cover-state={urls.length || pending.length ? "filled" : "empty"}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{ outline: dragging ? "1px dashed #a3a3a3" : undefined, outlineOffset: 2 }}
    >
      {pick}
      {listing ? (
        <div data-bay-gallery-stage="" style={LISTING_STAGE}>
          <div data-bay-gallery-rail="" style={LISTING_RAIL}>
            {urls.map((url, index) => (
              <div key={`${index}-${url}`} data-bay-gallery-tile={index} style={{ ...LISTING_THUMB, border: active === index ? "2px solid #171717" : "1px solid #e5e5e5" }}>
                <button
                  type="button"
                  data-bay-gallery-thumb={index}
                  aria-pressed={active === index}
                  aria-label={tt("第 {n} 张", { n: index + 1 })}
                  onClick={() => setActive(index)}
                  className="h-full w-full"
                >
                  <img src={url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                </button>
                <button
                  type="button"
                  data-bay-gallery-remove={index}
                  aria-label={tt("去掉这张")}
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                  className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-[11px] leading-none text-white disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            ))}
            {pending.map((slot) => (
              <div key={slot.id} data-bay-gallery-pending="" style={LISTING_THUMB}>
                {slot.preview ? (
                  <img src={slot.preview} alt="" className="h-full w-full object-cover opacity-60" />
                ) : null}
                <span className="absolute inset-0 grid place-items-center text-[11px] text-neutral-600">{tt("上传中")}</span>
              </div>
            ))}
            {addTile}
          </div>
          <div
            data-bay-gallery-main=""
            role={current ? undefined : "button"}
            tabIndex={current || disabled ? undefined : 0}
            onClick={current || disabled || room <= 0 ? undefined : () => inputRef.current?.click()}
            style={{ ...LISTING_MAIN, cursor: current || disabled ? undefined : "pointer" }}
            className="border border-neutral-200"
          >
            {current ? (
              <img src={current} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center px-3 text-center text-[13px] text-neutral-400">
                {tt("添加细节图")}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div data-bay-gallery-grid="" style={GRID}>
          {tiles}
        </div>
      )}
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
