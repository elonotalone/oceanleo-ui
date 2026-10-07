"use client";

// 已并入 LeoChat 图标，保留只为不破坏导出。
import { LeoChatButton } from "../../leochat/LeoChatButton";

export { useBayNeedsAction } from "../../leochat/leochat-store";

export function BayNavIcon({ className = "" }: { className?: string }) {
  return <LeoChatButton className={className} />;
}
