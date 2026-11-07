// ============================================================================
// @oceanleo/ui — 对话选段模式的状态机（纯函数，无 React、无 DOM）
// ----------------------------------------------------------------------------
// 选段模式是一个**临时页面模式**：底部输入框整块换成操作条，每条消息左侧长出勾选框。
// 这里只回答三个问题——哪些消息可以被选、勾一条之后集合变成什么、全选/全不选。
// 把它做成纯函数是为了能在 node 里直接断言，不必渲染整个 AgentChat。
// ============================================================================

import type { AgentMessage } from "../../lib/agent";

/** 选段只认这几个字段，方便回放页/分享页用同一套判定。 */
export interface ShareSelectableMessage {
  id: number;
  role: AgentMessage["role"];
  kind?: string;
  content: string;
  meta?: AgentMessage["meta"];
}

/**
 * 进度条、内核内部的步骤、给右栏用的隐形指令都不是「一段对话」，勾了也没有意义。
 * 反过来，产物卡片（meta.artifact）与只带附件的用户消息**是**用户眼里的一条消息，
 * 必须可选——否则「把这段对话导出成图」会莫名其妙缺一块。
 */
export function isShareSelectable(
  message: ShareSelectableMessage,
): boolean {
  const kind = message.kind || "text";
  if (kind === "ui_action" || kind === "step") return false;
  if (message.meta?.interim === true) return false;
  if (message.content && message.content.trim()) return true;
  if (message.meta?.artifact) return true;
  if (message.meta?.image_url) return true;
  return Boolean(message.meta?.attachments?.length);
}

export function shareSelectableMessages<T extends ShareSelectableMessage>(
  messages: readonly T[],
): T[] {
  return messages.filter((message) => isShareSelectable(message));
}

export function shareSelectableIds(
  messages: readonly ShareSelectableMessage[],
): number[] {
  return shareSelectableMessages(messages).map((message) => message.id);
}

/** 勾一条：已选则取消，未选则加上。返回新集合，绝不原地改。 */
export function toggleShareSelection(
  selected: ReadonlySet<number>,
  id: number,
): Set<number> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** 「全选」是个开关：已经全选了再点就是全不选（对标 Kimi）。 */
export function toggleSelectAll(
  selected: ReadonlySet<number>,
  messages: readonly ShareSelectableMessage[],
): Set<number> {
  const ids = shareSelectableIds(messages);
  return isAllShareSelected(selected, messages)
    ? new Set<number>()
    : new Set(ids);
}

export function isAllShareSelected(
  selected: ReadonlySet<number>,
  messages: readonly ShareSelectableMessage[],
): boolean {
  const ids = shareSelectableIds(messages);
  if (ids.length === 0) return false;
  return ids.every((id) => selected.has(id));
}

/**
 * 选中的消息按**原对话顺序**返回（不是按用户点击顺序）——导出的图和文本必须读得通。
 * 同时把不可选的消息挡在外面，避免旧的勾选残留在集合里被带出去。
 */
export function selectedShareMessages<T extends ShareSelectableMessage>(
  messages: readonly T[],
  selected: ReadonlySet<number>,
): T[] {
  return shareSelectableMessages(messages).filter((message) =>
    selected.has(message.id),
  );
}

/** 换对话、消息被删时把失效的 id 丢掉，操作条上的计数才不会撒谎。 */
export function pruneShareSelection(
  selected: ReadonlySet<number>,
  messages: readonly ShareSelectableMessage[],
): Set<number> {
  const live = new Set(shareSelectableIds(messages));
  const next = new Set<number>();
  for (const id of selected) if (live.has(id)) next.add(id);
  return next;
}
