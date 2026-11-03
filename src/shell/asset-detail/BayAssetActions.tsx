"use client";

import { useLocale } from "next-intl";
import { useUI } from "../../i18n/ui/useUI";
import { ArtifactActionButtons, artifactActionMatrix } from "../ArtifactActions";
import { artifactDownloadEvidence } from "../artifact-client";
import { useAssetActions, type UseAssetActionsOptions } from "./useAssetActions";
import type { AssetActionContext } from "./types";

/** null stays unavailable; a missing price must never become a free claim. */
export function assetPriceText(context: AssetActionContext, locale: string, tt: (key: string) => string): string | null {
  const price = context.commerce;
  if (!price) return null;
  if (price.priceFen === null || !Number.isSafeInteger(price.priceFen) || price.priceFen < 0) return tt("价格暂不可用");
  if (price.free && price.priceFen === 0) return tt("免费");
  return new Intl.NumberFormat(locale, { style: "currency", currency: price.currency }).format(price.priceFen / 100);
}

/** Action slot for the shared detail header. Library keeps its existing toolbar. */
export function BayAssetActions(props: UseAssetActionsOptions) {
  const tt = useUI();
  let locale = "en";
  try { locale = useLocale(); } catch { /* Legacy hosts can render outside next-intl. */ }
  const actions = useAssetActions(props);
  const { entry, actionContext } = actions;
  const library = actionContext.surface === "library" && actionContext.owned && actionContext.commerce?.purchaseState !== "refunded" && actionContext.commerce?.purchaseState !== "pending";
  const item = entry.libraryItem;
  const libraryToolbar = library && item?.artifact;
  const price = assetPriceText(actionContext, locale, tt);
  const purchaseState = actionContext.commerce?.purchaseState;
  const download = item?.artifact ? artifactDownloadEvidence(item) : null;
  const sourceDenied = download && (download.purpose === "source" || download.mode === "source") && !actionContext.rights.canDownloadSource;
  const items = actions.items.filter((action) => !(libraryToolbar && (action.id === "download" || action.id === "edit")) && !(sourceDenied && action.id === "download"));
  return (
    <div className="min-w-0" data-asset-actions={actionContext.surface}>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={tt("素材操作")}>
        {!library && price && <span data-asset-price className="text-xs font-medium">{price}</span>}
        {purchaseState === "pending" && <span role="status" className="text-xs text-[var(--muted)]">{tt("等待付款确认")}</span>}
        {purchaseState === "refunded" && <span className="text-xs text-[var(--muted)]">{tt("已退款")}</span>}
        {items.map((action) => (
          <button key={action.id} type="button" data-asset-action={action.id}
            disabled={action.disabled} aria-busy={actions.pending === action.id}
            className="inline-flex min-h-8 min-w-11 items-center justify-center rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-semibold text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => void actions.run(action.id)}>
            {tt(action.label)}
          </button>
        ))}
        {libraryToolbar && item && <ArtifactActionButtons item={item}
          matrix={artifactActionMatrix(item, { hidePreview: true, canOpenEdit: actionContext.rights.canEdit && Boolean(props.onEdit), actionContext })}
          actionContext={actionContext}
          onEdit={props.onEdit ? async (prepared) => props.onEdit?.({ ...entry, libraryItem: prepared }) : undefined}
          linkUrl={entry.linkUrl} />}
      </div>
      {actions.failure && <p role="alert" className="mt-1 text-[11px] text-red-600">{tt(actions.failure)}
        {actions.retry && <button type="button" disabled={actions.pending !== null} data-asset-action="retry" className="ml-2 underline" onClick={() => void actions.retry?.()}>{tt("重试")}</button>}
      </p>}
    </div>
  );
}
