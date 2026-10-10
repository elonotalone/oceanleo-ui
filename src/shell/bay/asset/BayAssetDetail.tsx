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
import { BayModelViewer } from "./BayModelViewer";
import { BayZoomablePreview } from "./BayZoomablePreview";
import {
  asBayAssetFull,
  assetDetail,
  downloadHref,
  pptPageUrls,
  type BayAssetFull,
} from "./detail-client";
import { bayAssetDownloadHref, type BayAsset } from "./library-client";

const subscribeToHydration = () => () => {};

function is3dModel(asset: BayAssetFull): boolean {
  if (asset.type !== "3d") return false;
  const u = (asset.full_url || "").toLowerCase();
  return u.endsWith(".gltf") || u.endsWith(".glb");
}

function isChartAsset(asset: BayAssetFull): boolean {
  return asset.type === "chart" && !!asset.full_url;
}

function PptPager({ asset }: { asset: BayAssetFull }) {
  const tt = useUI();
  const pages = pptPageUrls(asset);
  const [idx, setIdx] = useState(0);
  if (pages.length === 0) {
    return (
      <BayZoomablePreview
        thumb={asset.thumb_url}
        full={asset.preview_url}
        alt={asset.title}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-full overflow-hidden rounded-lg border border-stone-200 bg-white">
        <BayZoomablePreview
          thumb={pages[idx]}
          full={pages[idx]}
          alt={tt("{title} 第 {n} 页", { title: asset.title, n: idx + 1 })}
        />
        <span className="pointer-events-none absolute right-3 top-3 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white">
          {idx + 1} / {pages.length}
        </span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {pages.map((u, i) => (
          <button
            key={u}
            type="button"
            onClick={() => setIdx(i)}
            className={`shrink-0 overflow-hidden rounded border-2 transition ${
              i === idx ? "border-sky-500" : "border-transparent opacity-70 hover:opacity-100"
            }`}
          >
            <img src={u} alt="" loading="lazy" className="aspect-video w-20 object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

// UC-3：图表 iframe 只给 allow-scripts，不给同源，避免读到非 httpOnly 的登录 cookie。
function ChartFrame({ asset }: { asset: BayAssetFull }) {
  const tt = useUI();
  const [loaded, setLoaded] = useState(false);
  const cover = asset.preview_url || asset.thumb_url;
  const frameSrc = safeHttpUrl(asset.full_url);
  if (!frameSrc) {
    return <BayZoomablePreview thumb={asset.thumb_url} full={cover} alt={asset.title} />;
  }
  return (
    <div className="relative w-full bg-white">
      {cover && !loaded ? (
        <img
          src={cover}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}
      <iframe
        src={frameSrc}
        title={asset.title}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        sandbox="allow-scripts"
        className={`h-[600px] w-full border-0 transition-opacity duration-[var(--leo-dur-3)] ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
      {cover && !loaded ? (
        <span className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white">
          {tt("图表加载中…")}
        </span>
      ) : null}
    </div>
  );
}

function DocGlyph() {
  return (
    <svg className="mx-auto h-16 w-16 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M7 3h8l5 5v13H7zM15 3v5h5M9 12h6M9 16h4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function DocumentPreview({ asset }: { asset: BayAssetFull }) {
  const tt = useUI();
  const name = assetFileName(asset);
  const format = assetFormat(asset);
  const size = formatByteSize(asset.file_size);
  const nos = officialDocNumbers(asset.tags);
  const preview = asset.preview_url || asset.thumb_url;
  return (
    <div className="flex flex-col gap-4">
      {preview ? (
        <BayZoomablePreview thumb={asset.thumb_url} full={preview} alt={asset.title} />
      ) : (
        <div className="px-6 pt-6">
          <DocGlyph />
        </div>
      )}
      <dl className="grid gap-2 px-6 pb-6 text-sm">
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-xs uppercase tracking-wide text-stone-400">{tt("文件名")}</dt>
          <dd className="min-w-0 break-all text-stone-800">{name}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-xs uppercase tracking-wide text-stone-400">{tt("格式")}</dt>
          <dd className="text-stone-800">{format ? format.toUpperCase() : tt("未标注")}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-xs uppercase tracking-wide text-stone-400">{tt("大小")}</dt>
          <dd className="text-stone-800">{size || tt("未标注")}</dd>
        </div>
        {nos.length > 0 ? (
          <div className="flex gap-3">
            <dt className="w-14 shrink-0 text-xs uppercase tracking-wide text-stone-400">{tt("编号")}</dt>
            <dd className="font-medium text-stone-900">{nos.join(" · ")}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
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

  const isAudio = full.type === "audio" || full.type === "music";
  const isVideo = full.type === "video";
  const is3d = is3dModel(full);
  const isChart = isChartAsset(full);
  const isPpt = full.type === "ppt" && full.id.startsWith("library:");
  const isDocument = full.type === "document";
  const dims = dimensionLabel(full.width, full.height);
  const pptHtmlUrl =
    isPpt && full.source_url.endsWith(".html") ? safeHttpUrl(full.source_url) : "";
  const chartPageUrl = isChart ? safeHttpUrl(full.source_url || full.full_url) : "";
  const modelSrc = is3d ? safeHttpUrl(full.full_url) : "";
  const audioSrc = isAudio ? safeHttpUrl(full.preview_url) : "";
  const videoSrc = isVideo ? safeHttpUrl(full.preview_url) : "";
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
            {isChart ? (
              <ChartFrame asset={full} />
            ) : isPpt ? (
              <PptPager asset={full} />
            ) : isDocument ? (
              <DocumentPreview asset={full} />
            ) : is3d && modelSrc ? (
              <BayModelViewer src={modelSrc} poster={full.thumb_url} alt={full.title} />
            ) : isAudio ? (
              <div className="flex flex-col">
                {full.thumb_url ? (
                  <BayZoomablePreview thumb={full.thumb_url} full={full.thumb_url} alt={full.title} />
                ) : null}
                <div className="px-4 py-3">
                  {audioSrc ? <audio controls src={audioSrc} className="w-full" /> : null}
                </div>
              </div>
            ) : isVideo ? (
              <video
                controls
                poster={full.thumb_url}
                src={videoSrc || undefined}
                className="max-h-[72vh] w-full bg-black"
              />
            ) : (
              <BayZoomablePreview
                thumb={full.thumb_url}
                full={full.preview_url || full.thumb_url}
                alt={full.title}
              />
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400">{tt("作者 / 来源")}</p>
              <p className="mt-1 text-sm text-stone-800">{full.author}</p>
              {pptHtmlUrl ? (
                <a href={pptHtmlUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 hover:underline">
                  {tt("打开网页版（HTML）")} ↗
                </a>
              ) : chartPageUrl ? (
                <a href={chartPageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 hover:underline">
                  {tt("打开网页版（HTML）")} ↗
                </a>
              ) : null}
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
            {isPpt ? tt("下载 .pptx") : isChart ? tt("下载 HTML") : isDocument ? tt("下载文件") : tt("下载")}
          </a>
          {chartPageUrl ? (
            <a
              href={chartPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
            >
              {tt("在新窗口打开")} ↗
            </a>
          ) : null}
          {pptHtmlUrl ? (
            <a
              href={pptHtmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
            >
              {tt("网页版预览（HTML）")}
            </a>
          ) : null}
          <span className="text-xs text-stone-500">
            {tt("下载后请按授权说明使用。")}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
