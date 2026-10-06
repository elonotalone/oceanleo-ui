"use client";

// @ 候选：成员 +「所有人」（仅 owner/admin）+ leo（会话 `leo_enabled` 时）。
// 规则写成纯函数（`mentionCandidates`、`activeMentionQuery`、`applyMention`、`collectMentions`），界面只管画。
import type { ImConversationDetail, ImRole } from "../../../lib/im/types";
import { LEO_MENTION } from "../leo/leo-mention";

export interface MentionCandidate {
  /** 用户 id；`all` / `leo` 是特殊项。 */
  id: string;
  label: string;
  kind: "user" | "all" | "leo";
  avatar_url?: string | null;
  external?: boolean;
}

export const MENTION_ALL_ID = "all";
export const MAX_MENTION_CANDIDATES = 8;

type MentionConversation = Pick<ImConversationDetail, "members" | "leo_enabled" | "kind"> & {
  my_role: ImRole | null;
};

function matches(label: string, query: string, aliases: string[] = []): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const targets = [label, ...aliases].map((s) => s.toLowerCase());
  if (targets.some((t) => t.startsWith(q))) return 0;
  if (targets.some((t) => t.includes(q))) return 1;
  return -1;
}

/** 当前该显示哪些 @ 候选。 */
export function mentionCandidates(input: {
  conversation: MentionConversation | null;
  viewerId: string | null;
  query: string;
  allLabel: string;
}): MentionCandidate[] {
  const { conversation, viewerId, query, allLabel } = input;
  if (!conversation) return [];
  const scored: Array<{ rank: number; order: number; item: MentionCandidate }> = [];
  let order = 0;

  const isManager = conversation.my_role === "owner" || conversation.my_role === "admin";
  // 「所有人」只有 owner/admin 有，且私聊里没有意义
  if (isManager && conversation.kind !== "dm" && conversation.kind !== "talent") {
    const rank = matches(allLabel, query, ["all", "everyone"]);
    if (rank >= 0) scored.push({ rank, order: order++, item: { id: MENTION_ALL_ID, label: allLabel, kind: "all" } });
  }
  // leo 只在这个会话开着 leo 时出现（交易会话没有 leo）
  if (conversation.leo_enabled && conversation.kind !== "talent") {
    const rank = matches(LEO_MENTION.label, query);
    if (rank >= 0) scored.push({ rank, order: order++, item: { id: LEO_MENTION.id, label: LEO_MENTION.label, kind: "leo" } });
  }
  for (const member of conversation.members) {
    if (member.user_id === viewerId) continue;
    const label = member.profile.display_name;
    if (!label) continue;
    const rank = matches(label, query);
    if (rank < 0) continue;
    scored.push({
      rank,
      order: order++,
      item: {
        id: member.user_id,
        label,
        kind: "user",
        avatar_url: member.profile.avatar_url,
        external: member.external,
      },
    });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, MAX_MENTION_CANDIDATES)
    .map((entry) => entry.item);
}

/** 光标前是不是正在输入一个 @：`@` 前面是行首或空白，`@` 到光标之间没有空白。 */
export function activeMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query) || query.length > 24) return null;
  return { start: at, query };
}

/** 选中一个候选：把 `@查询` 换成 `@名字 `，返回新文字与光标位置。 */
export function applyMention(
  text: string,
  caret: number,
  active: { start: number; query: string },
  candidate: MentionCandidate,
): { text: string; caret: number } {
  const insert = `@${candidate.label} `;
  const next = text.slice(0, active.start) + insert + text.slice(caret);
  return { text: next, caret: active.start + insert.length };
}

// 手打的 @leo：@ 或全角＠，可选一个空格，leo（不分大小写）。
// 前面不能紧贴字母数字（foo@leo 不算），后面不能紧跟拉丁字母/数字/下划线（@leonard 不算）；
// 紧跟中文（@leo你好）算数，因为中文输入时 @ 和正文之间通常不留空格。
const TYPED_LEO_MENTION = /(?:^|[^A-Za-z0-9_])[@\uFF20][ \u3000]?leo(?![A-Za-z0-9_\u00C0-\u024F])/i;

/** 正文里有没有手打的 @leo（不经过候选下拉）。 */
export function hasTypedLeoMention(text: string): boolean {
  return TYPED_LEO_MENTION.test(text);
}

/**
 * 发消息时：只带仍然留在正文里的那些被选中的 @。
 * `mention_leo` 另有文本兜底：用户没打开下拉、直接手打 `@leo` 也算（仅当会话开着 leo，
 * 与 `mentionCandidates` 里 leo 候选的出现条件一致）。后端只信这个布尔，不解析正文。
 */
export function collectMentions(
  text: string,
  picked: MentionCandidate[],
  leoEnabled: boolean = true,
): { mentions: string[]; mention_all: boolean; mention_leo: boolean } {
  const present = picked.filter((candidate) => text.includes(`@${candidate.label}`));
  return {
    mentions: Array.from(new Set(present.filter((c) => c.kind === "user").map((c) => c.id))),
    mention_all: present.some((c) => c.kind === "all"),
    mention_leo: present.some((c) => c.kind === "leo") || (leoEnabled && hasTypedLeoMention(text)),
  };
}

export function MentionPicker({
  candidates,
  activeIndex,
  onPick,
  onHover,
  hintFor,
}: {
  candidates: MentionCandidate[];
  activeIndex: number;
  onPick: (candidate: MentionCandidate) => void;
  onHover: (index: number) => void;
  hintFor: (candidate: MentionCandidate) => string | null;
}) {
  if (candidates.length === 0) return null;
  return (
    <ul
      role="listbox"
      className="absolute bottom-full left-2 z-30 mb-1 max-h-60 w-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
      data-mention-picker=""
    >
      {candidates.map((candidate, index) => {
        const hint = hintFor(candidate);
        return (
          <li key={`${candidate.kind}:${candidate.id}`} role="option" aria-selected={index === activeIndex}>
            <button
              type="button"
              // 用 mousedown，避免输入框先失焦
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(candidate);
              }}
              onMouseEnter={() => onHover(index)}
              className={
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] " +
                (index === activeIndex ? "bg-neutral-100" : "hover:bg-neutral-50")
              }
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-medium text-neutral-600">
                {candidate.kind === "all" ? "@" : Array.from(candidate.label)[0]?.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-neutral-800">{candidate.label}</span>
              {hint ? <span className="shrink-0 text-[11px] text-neutral-400">{hint}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
