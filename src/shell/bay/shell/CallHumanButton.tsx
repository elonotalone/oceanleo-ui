"use client";

// 左侧栏底部、账号行上方的「叫真人」：点开 Bay 浮窗里的求助表单（任务页自动带上当前任务，见 setBayTaskContext）。
// 收起的窄栏里只画图标，悬停有提示；境内不渲染。
import { useEffect } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { CallHumanIcon } from "./bay-icons";
import { attachBayDeepLinks, openBay, setBaySiteKey, useBayEnabled } from "./bay-state";

export interface CallHumanButtonProps {
  siteKey: string;
  compact?: boolean;
}

export function CallHumanButton({ siteKey, compact = false }: CallHumanButtonProps) {
  const tt = useUI();
  const enabled = useBayEnabled();

  useEffect(() => {
    setBaySiteKey(siteKey);
  }, [siteKey]);

  useEffect(() => (enabled ? attachBayDeepLinks() : undefined), [enabled]);

  if (!enabled) return null;
  const label = tt("叫真人");
  const open = () => openBay({ kind: "call-human" });
  if (compact) {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={label}
        title={label}
        data-bay-call-human="compact"
        className="leo-tap-row flex w-full items-center justify-center rounded-lg px-1 py-2 text-neutral-800 transition-all duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-200/50 hover:text-neutral-900"
      >
        <CallHumanIcon className="h-4 w-4" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      data-bay-call-human="full"
      className="leo-tap-row mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] font-medium text-neutral-800 transition-all duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 hover:text-neutral-900"
    >
      <CallHumanIcon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
