"use client";

// ============================================================================
// @oceanleo/ui — 设置类页面统一页头（单一事实源，2026-07-02）
// ----------------------------------------------------------------------------
// 操作员定稿：账户中心的二级页（通用 / API / Cost / 账户设置 / 插件…）页头统一为
// 「左 = 返回键，中 = 页标题」。返回默认 history.back()，无历史时回 /settings。
// ============================================================================

import { BackButton } from "../ui/BackButton";
import { useUI } from "../i18n/ui/useUI";

export function PageHeader({
  title,
  backHref = "/settings",
  onBack,
}: {
  title: string;
  /** 无浏览历史可退时的兜底跳转（默认 /settings）。 */
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
      <BackButton onClick={goBack} className="absolute left-0" label={tt("返回")} />
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{tt(title)}</h1>
    </div>
  );
}
