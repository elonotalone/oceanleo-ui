"use client";

import type { ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayDashboardProduct } from "../../../lib/bay/dashboard";
import { formatBayFen } from "../../../lib/bay/money";
import { openBay } from "../shell/bay-state";
import {
  isAppProduct,
  productErrorsTarget,
  productFeedbackTarget,
  productKindLabel,
  productOpenTarget,
  productRatingLabel,
  productStatusLabel,
  sharePercent,
} from "./dashboard-model";

function dash(): string {
  return "—";
}

export function ProductTable({
  products,
  currency,
  locale,
}: {
  products: BayDashboardProduct[];
  currency: string;
  locale: string;
}): ReactElement {
  const tt = useUI();
  if (!products.length) {
    return (
      <div data-bay-dashboard-products className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center">
        <p className="text-[13px] text-neutral-600">{tt("你还没有发布任何东西")}</p>
        <button
          type="button"
          data-bay-action="publish"
          onClick={() => openBay({ kind: "publish" })}
          className="mt-3 rounded-xl bg-stone-900 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-stone-800"
        >
          {tt("去发布")}
        </button>
      </div>
    );
  }
  return (
    <div data-bay-dashboard-products className="overflow-x-auto">
      <table className="min-w-full text-left text-[12px] text-neutral-700">
        <thead>
          <tr className="border-b border-neutral-200 text-[11px] text-neutral-500">
            <th className="px-2 py-2 font-medium">{tt("种类")}</th>
            <th className="px-2 py-2 font-medium">{tt("名称")}</th>
            <th className="px-2 py-2 font-medium">{tt("上架状态")}</th>
            <th className="px-2 py-2 font-medium">{tt("本段收入")}</th>
            <th className="px-2 py-2 font-medium">{tt("订单数")}</th>
            <th className="px-2 py-2 font-medium">{tt("占比")}</th>
            <th className="px-2 py-2 font-medium">{tt("打开次数")}</th>
            <th className="px-2 py-2 font-medium">{tt("登录用户数")}</th>
            <th className="px-2 py-2 font-medium">{tt("待回复留言")}</th>
            <th className="px-2 py-2 font-medium">{tt("未处理报错")}</th>
            <th className="px-2 py-2 font-medium">{tt("评分")}</th>
          </tr>
        </thead>
        <tbody>
          {products.map((row) => {
            const target = productOpenTarget(row);
            const app = isAppProduct(row.item_kind);
            return (
              <tr
                key={`${row.item_kind}:${row.item_id}`}
                data-bay-product={row.item_id}
                data-bay-product-kind={row.item_kind}
                onClick={target ? () => openBay(target) : undefined}
                className={target ? "cursor-pointer border-b border-neutral-100 hover:bg-neutral-50" : "border-b border-neutral-100"}
              >
                <td className="px-2 py-2">{tt(productKindLabel(row))}</td>
                <td className="px-2 py-2 font-medium text-neutral-900">{row.title}</td>
                <td className="px-2 py-2">{tt(productStatusLabel(row.status))}</td>
                <td className="px-2 py-2 tabular-nums">{formatBayFen(row.income_fen, currency, locale)}</td>
                <td className="px-2 py-2 tabular-nums">{row.orders}</td>
                <td className="px-2 py-2 tabular-nums">{sharePercent(row.share)}</td>
                <td className="px-2 py-2 tabular-nums">{app ? row.opens : dash()}</td>
                <td className="px-2 py-2 tabular-nums">{app ? row.users : dash()}</td>
                <td className="px-2 py-2">
                  {app && row.open_threads > 0 ? (
                    <button
                      type="button"
                      data-bay-action="product-threads"
                      className="tabular-nums text-neutral-800 underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        openBay(productFeedbackTarget(row.item_id));
                      }}
                    >
                      {row.open_threads}
                    </button>
                  ) : (
                    <span className="tabular-nums">{app ? row.open_threads : dash()}</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {app && row.open_errors > 0 ? (
                    <button
                      type="button"
                      data-bay-action="product-errors"
                      className="tabular-nums text-neutral-800 underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        openBay(productErrorsTarget(row.item_id));
                      }}
                    >
                      {row.open_errors}
                    </button>
                  ) : (
                    <span className="tabular-nums">{app ? row.open_errors : dash()}</span>
                  )}
                </td>
                <td className="px-2 py-2 tabular-nums">{productRatingLabel(row.rating_avg, row.rating_count)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
