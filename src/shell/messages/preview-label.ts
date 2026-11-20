// 收件箱一行的「最后一条」怎么显示（纯函数，测试直接跑）。
// 服务端（合同 §2.2，BS）给 `last_message.preview`（与语言无关的字符串）和 `last_message.preview_label = {label_key, text}`；
// 有 label 时用本地词条画「[图片] 说明」「[任务] 标题」——中文原文是词条 key，各语言在 i18n 里，英文不会出现「[任务]」。
// 实时推来的消息由 `realtime/store.ts` 在本地算出同样的 label；旧服务端只有带中文前缀的字符串，也在这里换成 label。
import type { ImLastMessage, ImMessage } from "../../lib/im/types";

export interface PreviewLabel {
  label_key: string;
  text: string;
}

/** 服务端新加的字段；`lib/im/types.ts` 的 ImLastMessage 还没有它时按这个形状读。 */
export type ImLastMessageWithLabel = ImLastMessage & { preview_label?: PreviewLabel | null };

/** label_key → 词条 key（中文原文；翻译在 im-shell-copy.ts / ss-ul-copy.ts）。 */
export const PREVIEW_LABEL_COPY: Readonly<Record<string, string>> = {
  image: "[图片]",
  video: "[视频]",
  audio: "[音频]",
  voice: "[语音]",
  file: "[文件]",
  artifact: "[作品]",
  replay: "[工作回放]",
  task: "[任务]",
  quote: "[聊天记录]",
  talent_order: "[订单]",
  card: "[卡片]",
  recalled: "撤回了一条消息",
  hidden: "该消息因违反规则已隐藏",
};

/** 这两种只显示固定文案，不带正文。 */
const BARE_LABELS: ReadonlySet<string> = new Set(["recalled", "hidden"]);

/** 旧服务端拼在字符串前面的中文标签 → label_key。 */
const LEGACY_PREFIXES: ReadonlyArray<[string, string]> = [
  ["[图片]", "image"],
  ["[视频]", "video"],
  ["[音频]", "audio"],
  ["[语音]", "voice"],
  ["[文件]", "file"],
  ["[作品]", "artifact"],
  ["[工作回放]", "replay"],
  ["[回放]", "replay"],
  ["[子任务]", "task"],
  ["[任务]", "task"],
  ["[卡片]", "card"],
];

function oneLine(text: string | null | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

/** 一条消息的 label；纯文字消息为 null（直接显示正文）。与服务端的 label_key 一一对应。 */
export function previewLabelOf(message: ImMessage): PreviewLabel | null {
  if (message.recalled_at) return { label_key: "recalled", text: "" };
  if (message.hidden_reason === "moderation") return { label_key: "hidden", text: "" };
  const body = oneLine(message.body);
  const card = message.card as (ImMessage["card"] & { source_title?: string | null }) | null | undefined;
  const kind = String(message.kind);
  switch (kind) {
    case "image":
    case "video":
    case "audio":
      return { label_key: kind, text: body };
    case "voice":
      return { label_key: "voice", text: message.transcript?.status === "done" ? oneLine(message.transcript.text).slice(0, 80) : "" };
    case "file":
      return { label_key: "file", text: body || oneLine(message.attachments?.[0]?.name) };
    case "artifact":
    case "replay":
    case "task":
      return { label_key: kind, text: oneLine(card?.title) };
    case "quote":
      return { label_key: "quote", text: oneLine(card?.source_title ?? card?.title) };
    default:
      if (card) return { label_key: "card", text: oneLine(card.title) };
      return null;
  }
}

function labelFrom(value: unknown): PreviewLabel | null {
  if (!value || typeof value !== "object") return null;
  const key = (value as { label_key?: unknown }).label_key;
  if (typeof key !== "string" || !key) return null;
  const text = (value as { text?: unknown }).text;
  return { label_key: key, text: typeof text === "string" ? text : "" };
}

/** 旧服务端的「[任务] 标题」→ label；认不出来就是 null。 */
export function legacyPreviewLabel(preview: string): PreviewLabel | null {
  const text = preview.trim();
  for (const [prefix, key] of LEGACY_PREFIXES) {
    if (text.startsWith(prefix)) return { label_key: key, text: text.slice(prefix.length).trim() };
  }
  return null;
}

/** 收件箱里那一行要显示的文字（已翻译）。 */
export function inboxPreviewText(last: ImLastMessageWithLabel, tt: (key: string) => string): string {
  // 新服务端总带 preview_label（纯文字为 null）：那时不再猜前缀，免得把人打的「[图片]」当成标签。
  const label = "preview_label" in last ? labelFrom(last.preview_label) : legacyPreviewLabel(last.preview || "");
  if (label && PREVIEW_LABEL_COPY[label.label_key]) {
    const head = tt(PREVIEW_LABEL_COPY[label.label_key]);
    if (BARE_LABELS.has(label.label_key)) return head;
    const text = oneLine(label.text);
    return text ? `${head} ${text}` : head;
  }
  return tt(last.preview || "");
}
