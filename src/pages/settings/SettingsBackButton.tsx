"use client";

import { useUI } from "../../i18n/ui/useUI";

/** 与 PageHeader 返回键同一枚图标：圆底 + 左箭头。 */
export function SettingsBackIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SettingsBackButton({
  onClick,
  label,
  className = "",
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  const tt = useUI();
  const caption = label ? tt(label) : tt("返回");
  return (
    <button
      type="button"
      data-settings-back=""
      onClick={onClick}
      aria-label={tt("返回")}
      title={caption}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-100 hover:text-neutral-900 active:scale-95 ${className}`.trim()}
    >
      <SettingsBackIcon />
    </button>
  );
}
