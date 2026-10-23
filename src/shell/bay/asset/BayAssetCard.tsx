"use client";

// 素材格子里的一张卡。授权徽标、自有/开源、按类型不同的卡面都画在这里。
import type { ReactElement } from "react";
import { CollectionItemCard, CollectionItemRow } from "../../collection-items";
import { useUI } from "../../../i18n/ui/useUI";
import { BayAssetOriginChip } from "./BayAssetProvenance";
import { BayLicenseBadge } from "./BayLicenseBadge";
import type { BayAsset } from "./library-client";

export interface BayAssetCardProps {
  asset: BayAsset;
  view?: "grid" | "list";
  onOpen: (asset: BayAsset) => void;
}

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PlayGlyph() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function CubeGlyph() {
  return (
    <svg className="h-10 w-10 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" strokeLinejoin="round" />
      <path d="M12 12l9-5M12 12v10M12 12L3 7" strokeLinejoin="round" />
    </svg>
  );
}

function DocGlyph() {
  return (
    <svg className="h-10 w-10 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M7 3h8l5 5v13H7zM15 3v5h5M9 12h6M9 16h4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function BayAssetCard({ asset, onOpen, view = "grid" }: BayAssetCardProps): ReactElement {
  const tt = useUI();
  const isMedia = asset.type === "audio" || asset.type === "music";
  const isVideo = asset.type === "video";
  const is3d = asset.type === "3d";
  const isChecker =
    asset.type === "sticker" || asset.type === "vector" || asset.type === "font";
  const isPpt = asset.type === "ppt";
  const isChart = asset.type === "chart";
  const isDocument =
    asset.type === "document" || asset.type === "pdf" || asset.type === "grid";
  const isContain = isChecker || isPpt || isChart || isDocument;
  const openHref = (asset.openHref || "").trim();

  const cover = (
      <>
        <div
          className={`relative h-full w-full overflow-hidden ${
            isChecker
              ? "bg-[conic-gradient(#f1f5f9_90deg,#fff_90deg_180deg,#f1f5f9_180deg_270deg,#fff_270deg)] bg-[length:20px_20px] p-3"
              : isPpt
                ? "bg-stone-200 p-3"
                : isChart
                  ? "bg-white p-2"
                  : isDocument
                    ? "bg-stone-100 p-3"
                    : "bg-stone-100"
          }`}
        >
          {asset.thumb_url ? (
            <img
              src={asset.thumb_url}
              alt={asset.title}
              loading="lazy"
              className={`h-full w-full transition group-hover:scale-105 ${
                isContain ? "object-contain" : "object-cover"
              }`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-stone-400">
              {is3d ? <CubeGlyph /> : isDocument ? <DocGlyph /> : <span className="text-xs">{tt("无预览")}</span>}
            </div>
          )}

          {view === "grid" && (isVideo || isMedia) && (
            <span className="absolute left-2 top-2 inline-flex items-center justify-center rounded-full bg-black/55 p-1.5 text-white backdrop-blur">
              <PlayGlyph />
            </span>
          )}
          {view === "grid" && asset.duration ? (
            <span className="absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {fmtDuration(asset.duration)}
            </span>
          ) : null}
          {view === "grid" ? <span className="absolute right-2 top-2 flex items-center gap-1">
            <BayAssetOriginChip asset={asset} />
            <BayLicenseBadge license={asset.license} asset={asset} />
          </span> : null}
        </div>

      </>
  );

  const Item = view === "list" ? CollectionItemRow : CollectionItemCard;
  return (
    <Item
      containerProps={{ "data-bay-asset-card": asset.id, "data-shelf-kind": asset.shelfKind || "origin", "data-bay-asset-open-href": openHref || undefined }}
      openHref={openHref || undefined}
      cover={cover}
      title={asset.title}
      metadata={<>{asset.type === "prompt" && asset.prompt ? asset.prompt : `${asset.author} · ${asset.source}`}{view === "list" ? <> · <BayAssetOriginChip asset={asset} /> <BayLicenseBadge license={asset.license} asset={asset} />{asset.duration ? ` · ${fmtDuration(asset.duration)}` : ""}</> : null}</>}
      onOpen={() => { if (!openHref) onOpen(asset); }}
    />
  );
}
