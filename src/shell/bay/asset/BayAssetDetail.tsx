"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../../i18n/ui/useUI";
import { bayAssetDownloadHref, type BayAsset } from "./library-client";

const subscribeNever = () => () => {};

export function BayAssetDetail({
  asset,
  onClose,
}: {
  asset: BayAsset;
  onClose: () => void;
}) {
  const tt = useUI();
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

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

  if (!mounted) return null;

  const preview = asset.preview_url || asset.thumb_url;
  const isVideo = asset.type === "video";
  const isAudio = asset.type === "audio" || asset.type === "music";
  const isDocument = asset.type === "document" || asset.type === "ppt";

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      data-bay-asset-detail
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 className="truncate pr-4 text-base font-semibold text-stone-800">{asset.title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={tt("返回")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="overflow-hidden rounded-xl bg-stone-100">
            {isVideo && preview ? (
              <video controls poster={asset.thumb_url} src={preview} className="max-h-[72vh] w-full bg-black" />
            ) : isAudio && preview ? (
              <div className="px-4 py-6">
                <audio controls src={preview} className="w-full" />
              </div>
            ) : preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt={asset.title} className="max-h-[72vh] w-full object-contain" />
            ) : (
              <div className="px-6 py-16 text-center text-[13px] text-stone-400">{tt(isDocument ? "文档" : "素材")}</div>
            )}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400">{tt("作者 / 来源")}</p>
              <p className="mt-1 text-sm text-stone-800">{asset.author || asset.source}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400">{tt("授权")}</p>
              {asset.license.url ? (
                <a href={asset.license.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm font-medium text-stone-800 hover:underline">
                  {asset.license.name}
                </a>
              ) : (
                <p className="mt-1 text-sm font-medium text-stone-800">{asset.license.name}</p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {asset.license.commercial_ok ? (
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">{tt("可商用")}</span>
                ) : null}
                {asset.license.attribution_required ? (
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">{tt("需要署名")}</span>
                ) : null}
              </div>
            </div>
          </div>
          {asset.license.attribution_required && asset.license.attribution_text ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              {tt("此素材需署名，使用时请保留：")} {asset.license.attribution_text}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 px-5 py-3">
          <a
            href={bayAssetDownloadHref(asset.id)}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
          >
            {tt("下载")}
          </a>
          <span className="text-xs text-stone-500">{tt("下载后请按授权说明使用。")}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
