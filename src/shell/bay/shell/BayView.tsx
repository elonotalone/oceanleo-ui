"use client";

// 浮窗里的 Bay 视图：Messages 浮窗按 part 分别交给左栏与右栏。境内不渲染。
import type { BayLayout } from "./bay-state";
import { useBayEnabled } from "./bay-state";
import { BayAuthHost } from "./bay-auth-host";
import { BayDetail } from "./BayDetail";
import { BayList } from "./BayList";

export interface BayViewProps {
  part: "list" | "detail";
  layout: BayLayout;
}

export function BayView({ part, layout }: BayViewProps) {
  const enabled = useBayEnabled();
  if (!enabled) return null;
  if (part === "detail") return <BayDetail layout={layout} />;
  return (
    <>
      <BayList layout={layout} />
      <BayAuthHost />
    </>
  );
}
