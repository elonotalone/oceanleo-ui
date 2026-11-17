"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../../i18n/ui/useUI";
import {
  assetFileName,
  assetFormat,
  dimensionLabel,
  formatByteSize,
  officialDocNumbers,
} from "./asset-file-meta";
import { BayAssetProvenance, safeHttpUrl } from "./BayAssetProvenance";
import { BayLicenseFlags } from "./BayLicenseBadge";
import { LibraryItemViewer } from "../../library-viewers";
import {
  asBayAssetFull,
  assetDetail,
  downloadHref,
  type BayAssetFull,
} from "./detail-client";
import { bayAssetDownloadHref, type BayAsset } from "./library-client";

const subscribeToHydration = () => () => {};

/** Both origin materials and typed items use the Library's read-only viewers. */
export function bayOriginViewerItem(asset: BayAssetFull): import("../../library-data").LibraryItem {
  const kinds: Record<string, import("../../library-data").LibraryKind> = {
    ppt: "ppt", deck: "ppt", grid: "sheet", sheet: "sheet", document: "document", pdf: "document",
    "3d": "threed", audio: "audio", music: "audio", video: "video", image: "image", vector: "image", poster: "image",
  };
  const url = safeHttpUrl(asset.full_url) || safeHttpUrl(asset.download_url || "") || "";
  const poster = safeHttpUrl(asset.preview_url) || safeHttpUrl(asset.thumb_url) || "";
  const kind = kinds[asset.type] || "file";
  const format = assetFormat(asset).toLowerCase();
  const preview = /\.pdf(?:$|[?#])/i.test(poster) ? { state: "ready" as const, kind: "pdf" as const, url: poster }
    : kind === "file" ? { state: poster ? "ready" as const : "unavailable" as const, kind: "image" as const, url: poster }
    : undefined;
  return { key: `bay-origin:${asset.id}`, source: "artifact", id: asset.id, title: asset.title, kind,
    siteId: "", url: url || (/^(audio|video)$/.test(kind) ? poster : undefined), previewUrl: poster,
    thumbUrl: safeHttpUrl(asset.thumb_url) || undefined, favorite: false, preview,
    meta: { filename: assetFileName(asset), format, source_bytes: asset.file_size,
      ...(format === "pdf" ? { mime: "application/pdf", viewer_media_type: "application/pdf" } : {}) } };
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const tt = useUI();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="rounded-md border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50"
    >
      {done ? tt("已复制") : tt(label || "复制署名")}
    </button>
  );
}

export function BayAssetDetail({
  asset,
  onClose,
}: {
  asset: BayAsset;
  onClose: () => void;
}) {
  const tt = useUI();
  const full = asBayAssetFull(asset);
  const [files, setFiles] = useState<{ format: string; url: string }[] | null>(null);
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  useEffect(() => {
    if (full.source === "polyhaven" && !full.id.startsWith("library:")) {
      assetDetail(full.id)
        .then((d) => setFiles(d.files || []))
        .catch(() => setFiles([]));
    }
  }, [full]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const dims = dimensionLabel(full.width, full.height);
  const licenseUrl = safeHttpUrl(full.license.url);
  const dlHref = safeHttpUrl(downloadHref(full)) || bayAssetDownloadHref(full.id);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      data-bay-asset-detail
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 className="truncate pr-4 text-base font-semibold text-stone-800">{full.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label={tt("返回")}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="overflow-hidden rounded-xl bg-stone-100">
            <LibraryItemViewer item={bayOriginViewerItem(full)} />
            {full.type === "document" && <dl className="grid gap-2 p-4 text-sm">
              <div><dt className="text-xs text-stone-400">{tt("文件名")}</dt><dd>{assetFileName(full)}</dd></div>
              <div><dt className="text-xs text-stone-400">{tt("格式")}</dt><dd>{assetFormat(full).toUpperCase() || tt("未标注")}</dd></div>
              <div><dt className="text-xs text-stone-400">{tt("大小")}</dt><dd>{formatByteSize(full.file_size) || tt("未标注")}</dd></div>
              {officialDocNumbers(full.tags).length > 0 && <div><dt className="text-xs text-stone-400">{tt("编号")}</dt><dd>{officialDocNumbers(full.tags).join(" · ")}</dd></div>}
            </dl>}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400">{tt("作者 / 来源")}</p>
              <p className="mt-1 text-sm text-stone-800">{full.author}</p>

            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400">{tt("授权")}</p>
              {licenseUrl ? (
                <a href={licenseUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm font-medium text-stone-800 hover:underline">
                  {full.license.name}
                </a>
              ) : (
                <p className="mt-1 text-sm font-medium text-stone-800">{full.license.name}</p>
              )}
              <div className="mt-1.5">
                <BayLicenseFlags license={full.license} asset={full} />
              </div>
            </div>
          </div>

          {dims ? (
            <p className="mt-3 text-sm tabular-nums text-stone-600">{dims}</p>
          ) : null}

          <BayAssetProvenance asset={full} />

          {full.type === "prompt" && full.prompt ? (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  {tt("生成 Prompt")}
                </p>
                <CopyButton text={full.prompt} label="复制 Prompt" />
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-800">
                {full.prompt}
              </p>
            </div>
          ) : null}

          {full.license.attribution_required ? (
            <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-800">{tt("此素材需署名，使用时请保留：")}</p>
                <p className="mt-0.5 truncate text-xs text-amber-700">{full.license.attribution_text}</p>
              </div>
              <CopyButton text={full.license.attribution_text} />
            </div>
          ) : null}

          {full.source === "polyhaven" && files && files.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-stone-400">{tt("可下载文件")}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {files.slice(0, 8).map((f, i) => {
                  const href = safeHttpUrl(f.url);
                  if (!href) return null;
                  return (
                    <a
                      key={i}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-50"
                    >
                      {f.format || tt("文件")} ↓
                    </a>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 px-5 py-3">
          <a
            href={dlHref}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
          >
            {tt("下载")}
          </a>
          <span className="text-xs text-stone-500">
            {tt("下载后请按授权说明使用。")}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
