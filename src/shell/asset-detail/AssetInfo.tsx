"use client";

import { useLocale } from "next-intl";
import { useUI } from "../../i18n/ui/useUI";
import type { WorkspaceLibraryEntry } from "../workspace-library-model";
import type { AssetActionContext } from "./types";

export function AssetInfo({ entry, actionContext }: {
  entry: WorkspaceLibraryEntry;
  actionContext?: AssetActionContext;
}) {
  const tt = useUI();
  let locale = "en";
  try { locale = useLocale(); } catch { /* Legacy hosts can render outside next-intl. */ }
  const author = actionContext?.author?.name || entry.detail?.uploader;
  const createdAt = actionContext?.createdAt || entry.detail?.uploadedAt || entry.libraryItem?.createdAt;
  const parsed = createdAt ? new Date(createdAt) : null;
  const validDate = parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
  const time = validDate ? new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "UTC", timeZoneName: "short",
  }).format(validDate) : "";
  const license = actionContext?.license;
  const commerce = actionContext?.commerce;
  // A resolved context is authoritative, including the absence of commerce.
  const priceFen = actionContext ? commerce?.priceFen : entry.detail?.priceFen;
  const currency = commerce?.currency || entry.detail?.currency || "CNY";
  let price = "";
  if (typeof priceFen === "number" && Number.isFinite(priceFen) && priceFen >= 0) {
    if (priceFen === 0) price = tt("免费");
    else {
      try { price = new Intl.NumberFormat(locale, { style: "currency", currency }).format(priceFen / 100); }
      catch { price = `${priceFen / 100} ${currency}`; }
    }
  } else if (commerce || (!actionContext && entry.detail)) price = tt("价格待确认");
  const licenseParts = [
    license?.code,
    typeof license?.commercialOk === "boolean" ? tt(license.commercialOk ? "允许商业使用" : "仅限非商业使用") : "",
    typeof license?.modifyOk === "boolean" ? tt(license.modifyOk ? "允许修改" : "不允许修改") : "",
    license?.attribution,
  ].filter(Boolean);
  if (!author && !time && !licenseParts.length && !price) return null;
  return (
    <div data-asset-info className="shrink-0 border-b border-[var(--border,#e7e5e4)] px-3 py-2 text-[11px] text-[var(--muted,#78716c)]">
      <dl className="flex flex-wrap gap-x-4 gap-y-1">
        {author && <div data-library-uploader className="flex gap-1"><dt>{tt("作者 / 上传者")}</dt><dd>{author}</dd></div>}
        {time && <div className="flex gap-1"><dt>{tt("创建时间")}</dt><dd><time dateTime={validDate!.toISOString()}>{time}</time></dd></div>}
        {licenseParts.length > 0 && <div className="flex min-w-0 gap-1"><dt className="shrink-0">{tt("授权说明")}</dt><dd className="break-words">{licenseParts.join(" · ")}</dd></div>}
        {price && <div className="flex gap-1"><dt>{tt("价格")}</dt><dd>{price}</dd></div>}
      </dl>
    </div>
  );
}
