"use client";

import { useUI } from "../../i18n/ui/useUI";

/**
 * 取源失败时给用户看的那一块。三条内容缺一不可：**哪一步失败**、**什么原因**、
 * **下一步能做什么**。前两条由各编辑器的 `*SourceFailureMessage()` 组好整段传进来，
 * 这里只负责把它和一个真的会重跑加载的入口摆在同一块地方 —— 文案里承诺
 * 「重新载入」而界面上没有这个按钮，等于把缺口写成一句空话。
 *
 * `variant` 只决定它是盖在舞台上（`overlay`）还是自己就是整个舞台（`surface`）：
 * 有些路由在取源失败时压根不挂编辑器，那一格由这块面板整个占掉。
 */
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
  return (
    <div
      role="alert"
      data-editor-source-failure
      className={`${
        variant === "overlay" ? "absolute inset-0 z-40" : "h-full w-full"
      } flex flex-col items-center justify-center gap-3 bg-[var(--card,#fff)]/95 px-6 text-center`}
    >
      <p className="max-w-md text-[12px] leading-relaxed text-[var(--fg-2,#57534e)]">
        {message}
      </p>
      <button
        type="button"
        onClick={onReload}
        className="min-h-9 rounded-lg border border-[var(--border,#e7e5e4)] px-3 text-[12px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {tt("重新载入")}
      </button>
    </div>
  );
}
