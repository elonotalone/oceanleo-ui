"use client";
import { useWebsiteUI } from "../website-platform/website-preview-i18n";

export function WorkNotWired({ page = "preview" }: { page?: "preview" | "dashboard" | "configuration" }) {
  const tt = useWebsiteUI();
  const explanation = {
    preview: "让 agent 接入一个预览地址或服务器画面。",
    dashboard: "让 agent 为这个作品接入看板；作品可以继续运行。",
    configuration: "让 agent 为这个作品接入服务配置；作品可以继续运行。",
  }[page];
  return <div role="status" className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center" data-testid={`work-${page}-not-wired`}>
    <strong>{tt("未接入")}</strong><p className="text-sm opacity-70">{tt(explanation)}</p>
  </div>;
}
