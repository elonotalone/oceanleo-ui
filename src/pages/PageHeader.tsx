"use client";

// ============================================================================
// @oceanleo/ui — 设置类页面统一页头（单一事实源，2026-07-02）
// ----------------------------------------------------------------------------
// 操作员定稿：账户中心的二级页（通用 / API / Cost / 账户设置 / 插件…）页头统一为
// 「左 = 返回键，中 = 页标题」。返回默认 history.back()，无历史时回 /account。
// ============================================================================

import { useUI } from "../i18n/ui/useUI";

export function PageHeader({
  title,
  backHref = "/account",
  onBack,
}: {
  title: string;
  /** 无浏览历史可退时的兜底跳转（默认 /account）。 */
  backHref?: string;
  /** 自定义返回行为（i18n 站用自己的 router）。 */
  onBack?: () => void;
}) {
  const tt = useUI();

  function goBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== "undefined") {
      if (window.history.length > 1) window.history.back();
      else window.location.href = backHref;
    }
  }

  return (
    <div className="relative flex items-center justify-center py-1">
      <button
        type="button"
        onClick={goBack}
        aria-label={tt("返回")}
        title={tt("返回")}
        className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 active:scale-95"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{tt(title)}</h1>
    </div>
  );
}
