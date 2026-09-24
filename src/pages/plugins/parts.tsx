"use client";

import type { ReactNode } from "react";

/** 嵌在设置窗里时，宿主面板有 transform，fixed 只能盖住面板；不要 portal 到 body。 */
export function InTreeDialog({
  children,
  onClose,
  wide,
  testId,
}: {
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  testId?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-in-tree-dialog={testId || ""}
        className={`max-h-[90%] w-full overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
