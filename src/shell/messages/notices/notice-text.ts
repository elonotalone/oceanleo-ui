// Notification text in the reader's language. Some server notifications (invites, a Share
// link sent to you) carry `meta.text = { title, body, vars }`: the source sentence plus the
// names/titles to put in it. The stored `title`/`body` is that sentence already filled in, for
// clients that do not localise. Anything else is translated as before.
import type { UITranslate } from "../../../i18n/ui/useUI";

type NoticeLike = { title?: string | null; body?: string | null; meta?: Record<string, unknown> | null };

export function noticeText(item: NoticeLike, field: "title" | "body", tt: UITranslate): string {
  const text = item.meta && typeof item.meta === "object" ? (item.meta as { text?: unknown }).text : null;
  if (text && typeof text === "object") {
    const source = (text as Record<string, unknown>)[field];
    const raw = (text as { vars?: unknown }).vars;
    if (typeof source === "string" && source && raw && typeof raw === "object") {
      const vars: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === "string" || typeof value === "number") vars[key] = String(value);
      }
      return tt(source, vars);
    }
  }
  return tt(item[field] ?? "");
}
