"use client";

// 收件箱的一行：头像（群为拼图）、标题、「外部」标记、最后一条、时间、未读与 @ 角标、免打扰图标、草稿提示。
import type { ImConversationSummary } from "../../lib/im/types";
import { useUI } from "../../i18n/ui/useUI";
import { formatBadge } from "./realtime/store";

const TILE_COLORS = ["#38bdf8", "#818cf8", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#fb7185", "#2dd4bf"];

function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function conversationTitle(item: ImConversationSummary): string {
  return item.title || item.peer?.display_name || "";
}

/** 没有头像图时：私聊 = 单个字母块；群 = 2×2 拼图（取标题前四个字符各占一格）。 */
export function avatarTiles(item: ImConversationSummary): string[] {
  const title = Array.from(conversationTitle(item).trim());
  if (item.kind === "dm" || item.kind === "talent") return [title[0] ?? "?"];
  const chars = title.length ? title.slice(0, 4) : ["?"];
  return chars;
}

export function Avatar({ item, size = 40 }: { item: ImConversationSummary; size?: number }) {
  const url = item.avatar_url || (item.kind === "dm" || item.kind === "talent" ? item.peer?.avatar_url : null);
  const box = { width: size, height: size };
  if (url) {
    // 只用 <img> 指向服务端给的头像地址，不内联任何 HTML。
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" referrerPolicy="no-referrer" style={box} className="shrink-0 rounded-full object-cover" />
    );
  }
  const tiles = avatarTiles(item);
  const base = hashOf(item.id);
  if (tiles.length === 1) {
    return (
      <span
        style={{ ...box, background: TILE_COLORS[base % TILE_COLORS.length] }}
        className="inline-flex shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        aria-hidden="true"
      >
        {tiles[0]}
      </span>
    );
  }
  return (
    <span
      style={box}
      className="grid shrink-0 grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-xl bg-white/60"
      aria-hidden="true"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <span
          key={index}
          style={{ background: tiles[index] ? TILE_COLORS[(base + index) % TILE_COLORS.length] : "transparent" }}
          className="flex items-center justify-center text-[10px] font-semibold text-white"
        >
          {tiles[index] ?? ""}
        </span>
      ))}
    </span>
  );
}

function MutedIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-9.3-5M6 6.2C6 12 3 14 3 17h14M10 21h4M3 3l18 18" />
    </svg>
  );
}

/** 一行右上角的时间：今天 = 时:分，昨天 = 「昨天」，今年 = 月/日，更早 = 年/月/日。 */
export function formatRowTime(iso: string, now: Date, yesterdayLabel: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days <= 0) return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return yesterdayLabel;
  if (at.getFullYear() === now.getFullYear()) return at.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
  return at.toLocaleDateString(undefined, { year: "numeric", month: "numeric", day: "numeric" });
}

export function InboxRow({
  item,
  active,
  hasDraft,
  onOpen,
}: {
  item: ImConversationSummary;
  active: boolean;
  hasDraft: boolean;
  onOpen: (id: string) => void;
}) {
  const tt = useUI();
  const title = conversationTitle(item);
  const unread = formatBadge(item.unread_count);
  const mention = item.mention_count > 0;
  const last = item.last_message;
  let preview = "";
  if (item.dissolved) preview = tt("群已解散");
  else if (last) preview = tt(last.preview);
  return (
    <button
      type="button"
      data-testid="inbox-row"
      data-conversation-id={item.id}
      aria-current={active ? "true" : undefined}
      onClick={() => onOpen(item.id)}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
        active ? "bg-sky-500/10" : "hover:bg-black/5 dark:hover:bg-white/5"
      }`}
    >
      <Avatar item={item} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{title}</span>
          {item.has_external ? (
            <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[10px] text-amber-600 dark:text-amber-400">
              {tt("外部")}
            </span>
          ) : null}
          {item.muted ? (
            <span className="shrink-0 text-black/35 dark:text-white/35" title={tt("消息免打扰")}>
              <MutedIcon />
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-black/50 dark:text-white/50">
          {hasDraft ? <span className="shrink-0 text-red-500">{tt("[草稿]")}</span> : null}
          <span className="truncate">{preview}</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[11px] text-black/40 dark:text-white/40">
          {item.last_activity_at ? formatRowTime(item.last_activity_at, new Date(), tt("昨天")) : ""}
        </span>
        <span className="flex items-center gap-1">
          {mention ? (
            <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white" aria-label={tt("有人@你")}>
              @
            </span>
          ) : null}
          {unread ? (
            <span
              className={`min-w-[1.1rem] rounded-full px-1.5 text-center text-[10px] font-semibold leading-4 text-white ${
                item.muted ? "bg-black/30 dark:bg-white/30" : "bg-sky-500"
              }`}
            >
              {unread}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
