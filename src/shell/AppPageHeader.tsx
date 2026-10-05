"use client";

import { type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";

export const APP_PAGE_TITLE_CLASS =
  "text-[17px] font-semibold tracking-tight text-neutral-900";
export const APP_PAGE_FRAME_CLASS =
  "mx-auto flex min-h-0 w-full max-w-6xl flex-col px-4 pt-3 pb-5";
export const APP_PAGE_HEADER_ROW_CLASS =
  "mb-3 flex min-h-9 shrink-0 items-center justify-between gap-3";

export function AppPageHeader({
  title,
  children,
}: {
  title: ReactNode;
  children?: ReactNode;
}) {
  const tt = useUI();
  return (
    <header className={APP_PAGE_HEADER_ROW_CLASS}>
      <h1 className={APP_PAGE_TITLE_CLASS}>
        {typeof title === "string" ? tt(title) : title}
      </h1>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {children}
      </div>
    </header>
  );
}
