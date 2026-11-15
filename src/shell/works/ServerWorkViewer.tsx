"use client";

import { lazy, Suspense } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { ServerWork } from "./model";

const WorkWorkbench = lazy(() => import("../works-workbench/WorkWorkbench").then(module => ({ default: module.WorkWorkbench })));

/** Server folders use the same three optional interfaces as every other work. */
export function ServerWorkViewer({ item }: { item: ServerWork; onRemoved?: () => void }) {
  const tt = useUI();
  return <Suspense fallback={<p role="status">{tt("加载中…")}</p>}><WorkWorkbench workId={item.id} /></Suspense>;
}
