"use client";

import { WorkWorkbench } from "../works-workbench/WorkWorkbench";
import type { ServerWork } from "./model";

/** Server folders use the same three optional interfaces as every other work. */
export function ServerWorkViewer({ item }: { item: ServerWork; onRemoved?: () => void }) {
  return <WorkWorkbench workId={item.id} />;
}
