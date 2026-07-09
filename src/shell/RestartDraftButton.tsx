"use client";

// ============================================================================
// @oceanleo/ui — RestartDraftButton：操作台「重新开始」小按钮（单一事实源）
// ----------------------------------------------------------------------------
// doctrine 2026-07-09。操作台默认自动恢复上次草稿；当用户想丢弃续编、从头开始时点它。
// 二段式确认（先变成「确认清空？」再点一次才真清），避免误触把辛苦填的内容清掉。
// 站点把 useConsoleDraft 返回的 restart 传进 onRestart 即可。
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";

export interface RestartDraftButtonProps {
  onRestart: () => void;
  /** 自定义文案（默认「重新开始」）。 */
  label?: string;
  className?: string;
}

export function RestartDraftButton({ onRestart, label, className }: RestartDraftButtonProps) {
  const tt = useUI();
  const [arming, setArming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        if (arming) {
          if (timer.current) clearTimeout(timer.current);
          setArming(false);
          onRestart();
        } else {
          setArming(true);
          timer.current = setTimeout(() => setArming(false), 2600);
        }
      }}
      title={tt("清空当前草稿，从头开始")}
      className={
        className ??
        `inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium transition ${
          arming
            ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
            : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
        }`
      }
    >
      {arming ? tt("确认清空？") : label ?? tt("重新开始")}
    </button>
  );
}
