"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 插件设置里的对话框。挂到 `document.body`、默认 `z-[180]`：盖住设置窗 `z-[160]`，
 * 仍低于 toast `z-index: 200`。宿主面板有 transform 时，不 portal 的 `fixed` 只能
 * 盖住面板，点了像没反应。
 */
export function InTreeDialog({
  children,
  onClose,
  wide,
  testId,
  zClassName = "z-[180]",
}: {
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  testId?: string;
  zClassName?: string;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`fixed inset-0 ${zClassName} flex items-center justify-center bg-black/40 p-4`}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-in-tree-dialog={testId || ""}
        {...(testId === "org-mcp-dialog" ? { "data-org-mcp-dialog": "" } : {})}
        className={`max-h-[90%] w-full overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
