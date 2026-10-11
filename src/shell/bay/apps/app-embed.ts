// 作品页内窗口：只决定能不能嵌、嵌谁。不碰 window。
import type { BayApp } from "../../../lib/bay/apps";

const FIRST_PARTY_ROOTS = ["oceanleo.com", "oceanleo.cn", "oceandino.com", "oceanbizs.com"] as const;

// UC-3：作品是不可信内容，绝不给 `allow-same-origin`，也不给 `allow-top-navigation`（不许它把 Bay 页整个带走）。
export const BAY_APP_FRAME_SANDBOX = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";

export function isFirstPartyHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/\.+$/, "");
  if (!normalized) return false;
  return FIRST_PARTY_ROOTS.some((root) => normalized === root || normalized.endsWith(`.${root}`));
}

export function safeAppUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (!url.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

export type EmbedDecision =
  | { mode: "frame"; src: string }
  | { mode: "link"; reason: "creator" | "blocked" | "first-party" | "invalid"; href: string | null };

export function embedDecision(app: Pick<BayApp, "url" | "embed_mode" | "embed_ok">): EmbedDecision {
  const parsed = safeAppUrl(app.url);
  if (!parsed) return { mode: "link", reason: "invalid", href: null };
  const href = parsed.href;
  if (isFirstPartyHost(parsed.hostname)) return { mode: "link", reason: "first-party", href };
  if (app.embed_mode === "link") return { mode: "link", reason: "creator", href };
  if (app.embed_ok === false) return { mode: "link", reason: "blocked", href };
  return { mode: "frame", src: href };
}
