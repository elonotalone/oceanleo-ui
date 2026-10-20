"use client";

import { useRef, useState, type CSSProperties, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { useUI } from "../../../i18n/ui/useUI";
import { getStorageUsage, uploadFile, type FileItem } from "../../../lib/database";
import { getCurrentArtifactItem } from "../../artifact-client";
import type { LibraryItem } from "../../library-data";
import { pickLibraryWork } from "../needs/LibraryWorkPicker";
import { BAY_FORM_CHIP_BUTTON_CLASS } from "./form-ui";
import { humanUploadError, safeIdempotencyKey } from "./bay-upload";
import { BayWorkShowcase } from "./BayWorkShowcase";
import { kindFromUrl, type PreviewFileKind } from "./bay-typed-preview";
import {
  applyDigitalWorks,
  httpsWorkUrl,
  normalizeDigitalWorks,
  totalWorkBytes,
  USER_UPLOAD_MAX_BYTES,
  type DigitalWorkRef,
} from "./bay-digital-works";

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
const KIND_LABEL: Record<PreviewFileKind, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  ppt: "PPT",
  sheet: "表格",
  document: "文档",
  website: "网站",
  file: "文件",
};

type PendingTile = { key: string; title: string };

function SpinCircle({ size = 24 }: { size?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" data-bay-work-spin="">
      <circle cx="12" cy="12" r="9" fill="none" stroke="#d4d4d4" strokeWidth="2.5" />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="#171717" strokeWidth="2.5" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.7s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

function refFromLibraryItem(item: LibraryItem, file?: File, uploaded?: FileItem): DigitalWorkRef | null {
  const id = String(item.artifactId || item.id || "").trim();
  if (!id) return null;
  const url = httpsWorkUrl(item.url) || httpsWorkUrl(item.previewUrl) || httpsWorkUrl(uploaded?.url);
  const thumbUrl = httpsWorkUrl(item.posterUrl) || httpsWorkUrl(item.thumbUrl) || httpsWorkUrl(uploaded?.thumb_url);
  const rawBytes = uploaded?.bytes ?? item.meta?.bytes ?? item.meta?.size ?? file?.size;
  const bytes = typeof rawBytes === "number" && Number.isFinite(rawBytes) && rawBytes > 0 ? rawBytes : undefined;
  return {
    id,
    title: (item.title || file?.name || id).trim(),
    kind: "artifact",
    ...(url ? { url } : {}),
    ...(thumbUrl ? { thumbUrl } : {}),
    ...(bytes ? { bytes } : {}),
  };
}

async function libraryItemFromLocalFile(file: File, siteId: string): Promise<{ ok: true; item: LibraryItem; uploaded: FileItem } | { ok: false; error: string }> {
  const uploadIdempotencyKey = safeIdempotencyKey(["library-upload-v1", siteId, file.name, file.size, file.lastModified]);
  const result = await uploadFile(file, {
    siteId,
    title: file.name,
    idempotencyKey: uploadIdempotencyKey,
  });
  if (!result.ok || !result.data?.file) {
    return { ok: false, error: humanUploadError(result.error, result.status) };
  }
  const uploaded = result.data.file;
  const hasCanonicalContract = uploaded.artifact !== undefined || Boolean(uploaded.artifact_id) || Boolean(uploaded.revision_id);
  const [{ canonicalUploadLibraryItem, legacyUploadTransient }, { ensureArtifact }] = await Promise.all([
    import("../../MyLibrary"),
    import("../../artifact-client"),
  ]);
  if (hasCanonicalContract) {
    const canonical = canonicalUploadLibraryItem(uploaded);
    if (!canonical.ok) return { ok: false, error: canonical.error };
    return { ok: true, item: canonical.item, uploaded };
  }
  const legacy = legacyUploadTransient(uploaded, file, siteId);
  if (!legacy.ok) return { ok: false, error: legacy.error };
  const ensured = await ensureArtifact(legacy.transient);
  if (!ensured.ok || !ensured.data) {
    return { ok: false, error: ensured.error || "旧上传文件已落盘，但 durable artifact ensure 失败。" };
  }
  return { ok: true, item: ensured.data, uploaded };
}

async function remainingUploadBytes(): Promise<number | null> {
  try {
    const result = await getStorageUsage();
    if (!result.ok || !result.data || result.data.unavailable) return null;
    if (typeof result.data.remaining_bytes === "number") return Math.max(0, result.data.remaining_bytes);
    if (typeof result.data.limit_bytes === "number" && typeof result.data.used_bytes === "number") {
      return Math.max(0, result.data.limit_bytes - result.data.used_bytes);
    }
  } catch {
    /* 读不到占用就让网关判 */
  }
  return null;
}

export function BayDigitalWorksField(props: {
  works: DigitalWorkRef[];
  onChange: (works: DigitalWorkRef[]) => void;
  disabled?: boolean;
}): ReactElement {
  const tt = useUI();
  const siteId = "oceanleo";
  const inputRef = useRef<HTMLInputElement>(null);
  const works = normalizeDigitalWorks(props.works);
  const [pending, setPending] = useState<PendingTile[]>([]);
  const [error, setError] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const disabled = Boolean(props.disabled);
  const busy = pending.length > 0;

  function commit(next: DigitalWorkRef[]) {
    const synced = applyDigitalWorks(next);
    props.onChange(synced.digitalWorks);
  }

  function dropPending(key: string) {
    setPending((current) => current.filter((item) => item.key !== key));
  }

  function removeAt(index: number) {
    if (disabled) return;
    commit(works.filter((_, i) => i !== index));
    setOpenIndex((current) => {
      if (current == null) return current;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  }

  async function addFiles(list: FileList | null) {
    if (!list || disabled || busy) return;
    const queue = Array.from(list);
    if (inputRef.current) inputRef.current.value = "";
    if (!queue.length) return;
    const tiles: PendingTile[] = queue.map((file, index) => ({
      key: `upload-${Date.now()}-${index}-${file.name}`,
      title: file.name,
    }));
    setError("");
    flushSync(() => {
      setPending(tiles);
    });
    let remaining = await remainingUploadBytes();
    let current = [...works];
    const known = new Set(current.map((work) => work.id));
    let used = totalWorkBytes(current);
    try {
      for (let index = 0; index < queue.length; index += 1) {
        const file = queue[index];
        const tile = tiles[index];
        if (file.size > USER_UPLOAD_MAX_BYTES) {
          setError(tt("这个文件太大，送不过去。"));
          dropPending(tile.key);
          continue;
        }
        if (remaining != null && file.size > remaining) {
          setError(tt("这个文件太大，送不过去。"));
          dropPending(tile.key);
          continue;
        }
        if (used + file.size > USER_UPLOAD_MAX_BYTES) {
          setError(tt("这个文件太大，送不过去。"));
          dropPending(tile.key);
          continue;
        }
        const uploaded = await libraryItemFromLocalFile(file, siteId);
        dropPending(tile.key);
        if (!uploaded.ok) {
          setError(tt(humanUploadError(uploaded.error)));
          continue;
        }
        const ref = refFromLibraryItem(uploaded.item, file, uploaded.uploaded);
        if (!ref || known.has(ref.id)) continue;
        known.add(ref.id);
        used += file.size;
        if (remaining != null) remaining = Math.max(0, remaining - file.size);
        current = [...current, ref];
        commit(current);
      }
    } finally {
      setPending([]);
    }
  }

  async function pickFromLibrary() {
    if (disabled || busy) return;
    setError("");
    const work = await pickLibraryWork({ title: tt("从我的库选") });
    if (!work?.id) return;
    if (works.some((item) => item.id === work.id)) return;
    const tile: PendingTile = { key: `library-${work.id}`, title: work.title || work.id };
    flushSync(() => {
      setPending([tile]);
    });
    try {
      let url = httpsWorkUrl(work.preview_url);
      let thumbUrl = httpsWorkUrl(work.thumb_url);
      if (!url) {
        try {
          const result = await getCurrentArtifactItem(work.id);
          if (result.ok && result.data) {
            url = httpsWorkUrl(result.data.url) || httpsWorkUrl(result.data.previewUrl);
            thumbUrl = thumbUrl || httpsWorkUrl(result.data.posterUrl) || httpsWorkUrl(result.data.thumbUrl);
          }
        } catch {
          /* 没有地址仍可进列表，保存时无 https 的其余份会跳过 media */
        }
      }
      const next: DigitalWorkRef = {
        id: work.id,
        title: (work.title || work.id).trim(),
        kind: work.kind === "artifact" ? "artifact" : "task",
        ...(url ? { url } : {}),
        ...(thumbUrl ? { thumbUrl } : {}),
      };
      commit([...works, next]);
    } finally {
      dropPending(tile.key);
    }
  }

  return (
    <div data-bay-digital-work>
      <div data-bay-digital-work-grid="" style={GRID}>
        {works.map((work, index) => {
          const thumb = work.thumbUrl;
          const kindLabel = tt(KIND_LABEL[kindFromUrl(work.url || work.title || "")]);
          return (
            <div key={work.id} data-bay-work-tile={index} style={TILE}>
              <button
                type="button"
                className="h-full w-full text-left"
                onClick={() => setOpenIndex(index)}
                aria-label={tt("预览")}
              >
                {thumb ? (
                  <img src={thumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1.5 text-center">
                    <span className="text-[10px] font-medium text-neutral-600">{kindLabel}</span>
                    <span className="text-[10px] leading-tight text-neutral-500" style={{ overflow: "hidden", maxHeight: 28 }}>{work.title || work.id}</span>
                  </span>
                )}
              </button>
              <button
                type="button"
                data-bay-work-remove={index}
                aria-label={tt("删除")}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  removeAt(index);
                }}
                className="absolute right-1 top-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-black/70 text-[11px] leading-none text-white disabled:opacity-40"
              >
                ×
              </button>
            </div>
          );
        })}
        {pending.map((item) => (
          <div key={item.key} data-bay-work-pending="" role="status" aria-label={tt("上传中")} style={TILE}>
            <span className="absolute inset-0 grid place-items-center">
              <SpinCircle />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-bay-work-upload=""
          className={BAY_FORM_CHIP_BUTTON_CLASS}
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <SpinCircle size={16} />
              <span>{tt("上传中")}</span>
            </span>
          ) : (
            tt("上传文件")
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          className="hidden"
          disabled={disabled || busy}
          onChange={(event) => void addFiles(event.target.files)}
        />
        <button
          type="button"
          data-bay-work-library=""
          className={BAY_FORM_CHIP_BUTTON_CLASS}
          disabled={disabled || busy}
          onClick={() => void pickFromLibrary()}
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <SpinCircle size={16} />
              <span>{tt("从我的库选")}</span>
            </span>
          ) : (
            tt("从我的库选")
          )}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] text-rose-600">
          {error}
        </p>
      ) : null}
      {openIndex != null && works[openIndex] ? (
        <BayWorkShowcase
          works={works}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onIndex={setOpenIndex}
        />
      ) : null}
    </div>
  );
}
