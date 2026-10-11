// 报错卡与访客来源表的纯函数：状态怎么换成按钮、文件路径怎么缩短、来源标签怎么写成给人看的字。
import type { BayAppErrorStatus } from "../../../lib/bay/app-insights";
import { buildBaySearch } from "../shell/bay-links";
import type { BayAppEntry } from "./app-source";

export type ErrorAction = "resolve" | "ignore" | "reopen";

const ACTION_STATUS: Readonly<Record<ErrorAction, BayAppErrorStatus>> = {
  resolve: "resolved",
  ignore: "ignored",
  reopen: "open",
};

const ACTION_LABEL: Readonly<Record<ErrorAction, string>> = {
  resolve: "标为已解决",
  ignore: "忽略",
  reopen: "重新打开",
};

/** 货架点开一张卡之前：有搜索词算搜索，卡片自己标了新作品位算 fresh，其余算货架。 */
export function shelfOpenEntry(filter: { q?: string | null }, app?: object | null): BayAppEntry {
  if (String(filter.q || "").trim()) return "search";
  if (app && "fresh" in app && (app as { fresh?: unknown }).fresh === true) return "fresh";
  return "shelf";
}

export function errorStatusActions(status: BayAppErrorStatus): ErrorAction[] {
  if (status === "open") return ["resolve", "ignore"];
  if (status === "resolved") return ["ignore", "reopen"];
  return ["resolve", "reopen"];
}

export function errorActionStatus(action: ErrorAction): BayAppErrorStatus {
  return ACTION_STATUS[action];
}

export function errorActionLabel(action: ErrorAction): string {
  return ACTION_LABEL[action];
}

export function errorEmptyText(status: BayAppErrorStatus): string {
  if (status === "open") return "没有未处理的报错";
  if (status === "resolved") return "没有已解决的报错";
  return "没有已忽略的报错";
}

/** 文件只显示最后两段路径；查询参数丢掉。 */
export function errorFileShort(source: string): string {
  const raw = typeof source === "string" ? source.trim() : "";
  if (!raw) return "";
  let path = raw.split("#")[0] || raw;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) path = new URL(path).pathname || path;
  } catch {
    path = (path.split("?")[0] || path) as string;
  }
  const clean = path.split("?")[0] || path;
  const parts = clean.split("/").filter(Boolean);
  if (parts.length <= 2) return parts.join("/") || clean;
  return parts.slice(-2).join("/");
}

export function errorLocation(source: string, line: number, col: number): string {
  const file = errorFileShort(source) || "?";
  const safeLine = Number.isFinite(line) ? line : 0;
  const safeCol = Number.isFinite(col) ? col : 0;
  return `${file}:${safeLine}:${safeCol}`;
}

export function formatInsightTime(iso: string | null | undefined): string {
  if (typeof iso !== "string" || !iso.trim()) return "";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return iso.trim();
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function sourceLabel(source: string, siteName: string): string {
  const raw = typeof source === "string" ? source.trim() : "";
  if (raw === "search") return "Bay 搜索";
  if (raw === "fresh") return "新作品推荐位";
  if (raw === "shelf") return "作品货架";
  if (raw === "share") return "分享链接";
  if (raw === "follow") return "关注列表与更新通知";
  if (raw === "direct") return "直接打开";
  if (raw === "other") return "其他";
  if (raw.startsWith("ext:")) return `站外：${raw.slice(4)}`;
  if (raw.startsWith("site:")) {
    const name = (siteName || "").trim() || raw.slice(5);
    return `${name} 的 Bay`;
  }
  return "其他";
}

export function sourceLabelKey(source: string): { key: string; vars?: Record<string, string> } {
  const raw = typeof source === "string" ? source.trim() : "";
  if (raw.startsWith("ext:")) return { key: "站外：{host}", vars: { host: raw.slice(4) } };
  if (raw.startsWith("site:")) return { key: "{name} 的 Bay" };
  return { key: sourceLabel(raw, "") };
}

export function openRatio(opens: number, totalOpens: number): number {
  if (!(opens > 0) || !(totalOpens > 0)) return 0;
  return Math.round((opens / totalOpens) * 100);
}

export function appSharePath(appId: string): string {
  const id = typeof appId === "string" ? appId.trim() : "";
  const search = buildBaySearch("", { kind: "app", id });
  if (search.includes("src=")) return `/bay${search}`;
  if (search.startsWith("?")) return `/bay${search}&src=share`;
  return `/bay?bay=app:${id}&src=share`;
}

export function appShareHref(appId: string, origin?: string): string {
  const path = appSharePath(appId);
  const base = typeof origin === "string" ? origin.replace(/\/+$/, "") : "";
  return base ? `${base}${path}` : path;
}

export const SOURCE_RANGE_DAYS = [7, 30, 90] as const;
export type SourceRangeDays = (typeof SOURCE_RANGE_DAYS)[number];

export function sourceRangeLabel(days: SourceRangeDays): string {
  if (days === 7) return "近 7 天";
  if (days === 90) return "近 90 天";
  return "近 30 天";
}
