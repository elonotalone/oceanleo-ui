/**
 * 登录会话在「已连接的设备」页上的展示：解析 `Chrome · Windows`、相对上次活动、
 * 地点。小于 60 秒必须是「{n} 秒前」，不能走 `timeAgo` 的「刚刚」。
 */

export type BrowserIconId = "chrome" | "edge" | "firefox" | "safari" | "other";

export interface ParsedDeviceLabel {
  browser: string;
  os: string;
  icon: BrowserIconId;
  display: string;
}

type Translate = (zh: string, vars?: Record<string, string | number>) => string;

const defaultTt: Translate = (zh, vars) =>
  vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;

/** 网关 `device_label`：`Chrome · Windows`（中间点号）。 */
export function parseDeviceLabel(label: string): ParsedDeviceLabel {
  const display = (label || "").trim();
  if (!display) {
    return { browser: "", os: "", icon: "other", display: "" };
  }
  const parts = display.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
  const browser = parts[0] || "";
  const os = parts.slice(1).join(" · ");
  return { browser, os, icon: iconForBrowser(browser), display };
}

export function iconForBrowser(name: string): BrowserIconId {
  const n = (name || "").toLowerCase();
  if (!n) return "other";
  if (/\bedge\b|\bedg\b/.test(n) || n.includes("microsoft edge")) return "edge";
  if (n.includes("firefox") || n.includes("fxios")) return "firefox";
  if (n.includes("safari")) return "safari";
  if (n.includes("chrome") || n.includes("crios") || n.includes("chromium")) return "chrome";
  return "other";
}

/**
 * 相对上次活动。&lt; 60s → `{n} 秒前`（含 0）。1 分钟以上复用已有 `{m} 分钟前` 等。
 * 不返回「刚刚」。
 */
export function formatRelativeLastActive(
  iso: string,
  nowMs = Date.now(),
  tt: Translate = defaultTt,
): string {
  const then = new Date(iso).getTime();
  if (!iso || Number.isNaN(then)) return "";
  const diff = Math.max(0, nowMs - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return tt("{n} 秒前", { n: seconds });
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return tt("{m} 分钟前", { m: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tt("{h} 小时前", { h: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return tt("{d} 天前", { d: days });
  const months = Math.floor(days / 30);
  if (months < 12) return tt("{mo} 个月前", { mo: months });
  return tt("{y} 年前", { y: Math.floor(months / 12) });
}

/** 「上次活动 6 秒前」/「上次活动 4 分钟前」。解析不出时间则空串。 */
export function formatLastActiveLine(
  iso: string,
  nowMs = Date.now(),
  tt: Translate = defaultTt,
): string {
  const then = new Date(iso).getTime();
  if (!iso || Number.isNaN(then)) return "";
  const diff = Math.max(0, nowMs - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return tt("上次活动 {time}", { time: tt("{n} 秒前", { n: seconds }) });
  }
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) {
    return tt("上次活动 {m} 分钟前", { m: minutes });
  }
  const relative = formatRelativeLastActive(iso, nowMs, tt);
  if (!relative) return "";
  return tt("上次活动 {time}", { time: relative });
}

/**
 * 城市。空就不画；完整 IP / 像地址的串也不当城市（不编造、不泄露）。
 */
export function displayLocation(raw: string | undefined | null): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return "";
  if (value.includes(":") && /^[0-9a-f:]+$/i.test(value)) return "";
  return value;
}
