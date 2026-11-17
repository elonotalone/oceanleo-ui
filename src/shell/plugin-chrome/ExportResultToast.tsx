"use client";
import { createPortal } from "react-dom";
import { useUI } from "../../i18n/ui/useUI";
/** A saved derivative stays in this editor; only an explicit link opens its Library detail. */
export function ExportResultToast({ href, error, onClose }: { href: string; error: string; onClose: () => void }) {
  const tt = useUI();
  if ((!href && !error) || typeof document === "undefined") return null;
  return createPortal(<div role={error ? "alert" : "status"} aria-live="polite" data-export-result-toast
    style={{ position: "fixed", bottom: 24, insetInlineEnd: 24, zIndex: 2147483600, maxWidth: 360, padding: 16, borderRadius: 12, background: "var(--card, #fff)", color: "var(--fg, #111)", boxShadow: "0 4px 24px #0003" }}>
    {error ? tt(error) : <a href={href} style={{ textDecoration: "underline" }}>{tt("已保存到我的库，查看文件")}</a>}
    <button type="button" aria-label={tt("关闭")} onClick={onClose} style={{ marginInlineStart: 16 }}>×</button>
  </div>, document.body);
}
