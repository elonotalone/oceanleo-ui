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
  onActivate,
}: {
  marker: string;
  label: string;
  value: string;
  change: ChangeView;
  onActivate?: () => void;
}): ReactElement {
  const tt = useUI();
  const changeText =
    change.kind === "from-zero" ? tt("上一段为 0") : change.kind === "flat" ? tt("持平") : change.label;
  const body = (
    <>
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className="mt-1 text-[18px] font-semibold tabular-nums text-neutral-900">{value}</p>
      <p data-bay-stat-change={change.kind} className={`mt-1 text-[12px] tabular-nums ${changeClass(change.kind)}`}>
        {changeText}
      </p>
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
