"use client";

import { useAutoRecovery } from "../../lib/auto-recovery";

import { useUI } from "../../i18n/ui/useUI";

/** Recover the source automatically inside its existing editor slot. */
export function EditorSourceFailurePanel({
  message,
  onReload,
  variant = "overlay",
}: {
  message: string;
  onReload: () => void;
  variant?: "overlay" | "surface";
}) {
  const tt = useUI();
  useAutoRecovery(true, onReload, message);
  return <div role="status" aria-busy="true" data-editor-source-recovery
    className={`${variant === "overlay" ? "absolute inset-0 z-[25]" : "h-full w-full"} flex flex-col items-center justify-center gap-3 bg-[var(--card,#fff)]/95 px-6 text-center`}>
    <span className="v-spinner h-5 w-5" />
    <p className="text-[12px] text-[var(--fg-2,#57534e)]">{tt("正在打开这份素材…")}</p>
  </div>;
}
