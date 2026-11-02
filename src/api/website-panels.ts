"use client";
import { websiteRequest } from "./website-runtime";
export interface WebsitePanel {
  id: string; title: string; kind: "table" | "metric" | "chart";
  source: "platform" | "app"; state: "not_wired" | "wired" | "error"; error?: string;
}
export type WebsitePanelData =
  | { kind: "table"; columns: { key: string; label: string; type: "text" | "number" | "datetime" | "email" }[]; rows: Record<string, unknown>[]; total: number }
  | { kind: "metric"; items: { label: string; value: string | number; unit?: string; hint?: string }[] }
  | { kind: "chart"; chart: "line" | "bar" | "pie"; series: { name: string; points: { x: string | number; y: number }[] }[] };
export const websitePanelsApi = {
  list: (id: string, signal?: AbortSignal) => websiteRequest<WebsitePanel[]>(id, "/panels", { signal }),
  data: (id: string, panel: string, signal?: AbortSignal) =>
    websiteRequest<WebsitePanelData>(id, "/panels/" + encodeURIComponent(panel) + "/data", { signal }),
  wire: (id: string, panel: string) => websiteRequest<{ task_id: string }>(id,
    "/panels/" + encodeURIComponent(panel) + "/wire", { method: "POST" }),
};
export type WebsitePanelsApi = typeof websitePanelsApi;
