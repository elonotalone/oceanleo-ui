"use client";

// ============================================================================
// @oceanleo/ui — 写剪贴板（Copy Text / Copy Link 共用）
// ----------------------------------------------------------------------------
// `navigator.clipboard` 在非 https、iframe 无权限、或用户拒绝授权时会直接 reject；
// 那时退回 `<textarea> + execCommand("copy")`，这条在所有目标浏览器上仍然有效。
// 两条都不行就返回 false，让调用方提示「复制失败」而不是假装成功。
// ============================================================================

export async function writeClipboardText(text: string): Promise<boolean> {
  const value = String(text ?? "");
  if (!value) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // 掉到下面的兜底路径。
  }
  if (typeof document === "undefined" || !document.body) return false;
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand?.("copy") ?? false;
    document.body.removeChild(area);
    return Boolean(copied);
  } catch {
    return false;
  }
}
