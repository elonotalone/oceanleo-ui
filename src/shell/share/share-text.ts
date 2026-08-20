// ============================================================================
// @oceanleo/ui — 选中的消息 → 纯文本（Copy Text）
// ----------------------------------------------------------------------------
// 判据（任务书 P2）：保留代码块围栏、列表、表格的 **markdown 形态**。所以正文一律
// 逐字照抄，不做任何「渲染成纯文本」的降级——用户粘到别处还应该是可读的 markdown。
// 说话人用 `**标签**` 单独一行标注：既不与正文里的 `#` 标题打架，又一眼看得出轮次。
// 文案由调用方从 useUI() 取好传进来，本模块不认识任何一种语言。
// ============================================================================

import type { ShareSelectableMessage } from "./share-selection";

export interface ShareTextLabels {
  /** 用户消息的说话人标签，如「我」。 */
  user: string;
  /** 助手消息的说话人标签，如「OceanLeo」。 */
  assistant: string;
  /** 附件小节的标签，如「附件」。 */
  attachment: string;
  /** 产物小节的标签，如「已生成」。 */
  artifact: string;
}

function attachmentLines(
  message: ShareSelectableMessage,
  labels: ShareTextLabels,
): string[] {
  const attachments = message.meta?.attachments || [];
  return attachments.map((attachment) => {
    const name = String(attachment.name || "").trim();
    const url = String(attachment.url || "").trim();
    const shown = name || url || labels.attachment;
    return url && url !== shown
      ? `> ${labels.attachment} · [${shown}](${url})`
      : `> ${labels.attachment} · ${shown}`;
  });
}

function artifactLines(
  message: ShareSelectableMessage,
  labels: ShareTextLabels,
): string[] {
  const artifact = message.meta?.artifact;
  if (!artifact) return [];
  const title = String(artifact.title || artifact.type || "").trim();
  const url = String(artifact.url || "").trim();
  if (url) return [`> ${labels.artifact} · [${title || url}](${url})`];
  return title ? [`> ${labels.artifact} · ${title}`] : [];
}

/** 一条消息 → 一段文本（说话人标签 + 附件 + 正文 + 产物）。 */
export function shareMessageToText(
  message: ShareSelectableMessage,
  labels: ShareTextLabels,
): string {
  const speaker = message.role === "user" ? labels.user : labels.assistant;
  const body = String(message.content || "").replace(/\s+$/, "");
  const parts = [
    `**${speaker}**`,
    ...attachmentLines(message, labels),
    ...(body ? [body] : []),
    ...artifactLines(message, labels),
  ];
  return parts.join("\n");
}

/** 选中的整段对话 → 一块纯文本。空集合返回空串，调用方据此不写剪贴板。 */
export function shareMessagesToText(
  messages: readonly ShareSelectableMessage[],
  labels: ShareTextLabels,
): string {
  return messages
    .map((message) => shareMessageToText(message, labels))
    .join("\n\n");
}
