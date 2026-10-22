"use client";

// 五格信号（NetLevel 0–5；0 = 未知，显示灰色问号）。有可读名（「网络：好」），读屏与悬停提示都能读到。
import { useUI } from "../../../../i18n/ui/useUI";
import type { NetLevel } from "../engine";
import { netLevelLabel, qualityFromLevel } from "./health";

export interface NetworkBarsProps {
  level: NetLevel;
  className?: string;
}

const FILLED: Record<string, string> = {
  good: "bg-emerald-500",
  fair: "bg-amber-400",
  poor: "bg-red-500",
  unknown: "bg-neutral-400",
};

/** 每格的高度（占 12px 高度的百分比），从低到高。 */
export const BAR_HEIGHTS = [28, 46, 64, 82, 100] as const;

export function NetworkBars({ level, className = "" }: NetworkBarsProps) {
  const tt = useUI();
  const safe = (Number.isInteger(level) && level >= 0 && level <= 5 ? level : 0) as NetLevel;
  const label = tt(netLevelLabel(safe));
  const quality = qualityFromLevel(safe);
  const fill = FILLED[quality];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-net-level={safe}
      data-net-quality={quality}
      className={`relative inline-flex h-3 w-[17px] shrink-0 items-end gap-[1px] ${className}`}
    >
      {BAR_HEIGHTS.map((height, index) => (
        <span
          key={height}
          aria-hidden="true"
          data-bar-on={index < safe ? "true" : "false"}
          className={`w-[2.6px] rounded-[1px] ${index < safe ? fill : "bg-current opacity-25"}`}
          style={{ height: `${height}%` }}
        />
      ))}
      {safe === 0 ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-[10px] font-bold leading-none text-neutral-400"
        >
          ?
        </span>
      ) : null}
    </span>
  );
}
