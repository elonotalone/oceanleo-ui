"use client";

import type { ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ChangeView } from "./dashboard-model";

function changeClass(kind: ChangeView["kind"]): string {
  if (kind === "up") return "text-emerald-700";
  if (kind === "down") return "text-rose-700";
  return "text-neutral-500";
}

export function StatTile({
  marker,
  label,
  value,
  change,
  hint,
  onActivate,
}: {
  marker: string;
  label: string;
  value: string;
  change: ChangeView;
  /** 数字下面再补一句话（例如收款状态：钱什么时候到账、为什么还不能收）。已翻译。 */
  hint?: string;
  onActivate?: () => void;
}): ReactElement {
  const tt = useUI();
  const changeText =
    change.kind === "from-zero" ? tt("上一段为 0") : change.kind === "flat" ? tt("持平") : change.label;
  const body = (
    <>
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className="mt-1 text-[14px] font-semibold tabular-nums text-neutral-900">{value}</p>
      {change.kind !== "empty" && <p data-bay-stat-change={change.kind} className={`mt-1 text-[11px] tabular-nums ${changeClass(change.kind)}`}>
        {changeText}
      </p>}
      {hint ? (
        <p data-bay-stat-hint="" className="mt-1 max-w-[16rem] text-[11px] leading-4 text-neutral-500">
          {hint}
        </p>
      ) : null}
    </>
  );
  const box = "text-left";
  if (onActivate) {
    return (
      <button type="button" data-bay-stat={marker} onClick={onActivate} className={`${box} hover:bg-neutral-50`}>
        {body}
      </button>
    );
  }
  return (
    <div data-bay-stat={marker} className={box}>
      {body}
    </div>
  );
}
