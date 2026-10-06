"use client";

// 左下角铃铛右边的 Bay 图标：点开 Messages 浮窗的 Bay 视图；登录时每 60 秒取一次待办数做角标。
// 未登录也显示（没登录也能逛 Bay）；境内不渲染。
import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { fetchBaySummary } from "../../../lib/bay/feed";
import { BayIcon } from "./bay-icons";
import { attachBayDeepLinks, openBay, useBayEnabled, useBaySignedIn } from "./bay-state";

const POLL_MS = 60_000;

export function useBayNeedsAction(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return undefined;
    }
    let cancelled = false;
    const refresh = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchBaySummary().then(
        (summary) => {
          if (!cancelled) setCount(summary.needs_action);
        },
        () => {
          /* 取不到就不显示角标 */
        },
      );
    };
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
  return count;
}

export function BayNavIcon({ className = "" }: { className?: string }) {
  const tt = useUI();
  const enabled = useBayEnabled();
  const signedIn = useBaySignedIn();
  const count = useBayNeedsAction(enabled && signedIn);

  useEffect(() => (enabled ? attachBayDeepLinks() : undefined), [enabled]);

  if (!enabled) return null;
  const label = count > 0 ? tt("OceanLeo Bay，{n} 件事等你处理", { n: count }) : "OceanLeo Bay";
  return (
    <div className={`relative ${className}`} data-bay-nav-icon>
      <button
        type="button"
        onClick={() => openBay({ kind: "feed" })}
        aria-label={label}
        title={label}
        className="leo-tap-target relative flex items-center justify-center rounded-lg text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100 hover:text-neutral-800"
      >
        <BayIcon className="h-4 w-4" strokeWidth={1.7} />
        {count > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
    </div>
  );
}
