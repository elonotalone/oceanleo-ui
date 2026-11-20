/** Gateway failures stay with the unsent message and its Resend action. */
const SENTENCES: Record<string, string> = {
  computer_offline: "电脑已离线，请连接电脑后重发。",
  computer_reconnecting: "电脑正在重新连接，请连接恢复后重发。",
  computer_on_other_gateway: "这台电脑连接到了另一个网关，当前无法使用。",
  agent_not_running: "智能体没有运行，请启动智能体后重发。",
  program_mismatch: "程序或电脑与此任务不符，请切回此任务的程序和电脑。",
  computer_mismatch: "程序或电脑与此任务不符，请切回此任务的程序和电脑。",
  program_required: "程序或电脑与此任务不符，请切回此任务的程序和电脑。",
  message_too_long: "消息太长，请缩短后重发。",
  invalid_attachment: "附件无法使用，请重新上传后重发。",
  attachment_invalid: "附件无法使用，请重新上传后重发。",
  attachment_not_found: "附件无法使用，请重新上传后重发。",
  attachment_unavailable: "附件无法使用，请重新上传后重发。",
  attachment_too_large: "附件无法使用，请重新上传后重发。",
  attachment_storage_unavailable: "附件暂时无法读取，请稍后重发。",
  permission_denied: "你没有发送权限，请联系任务所有者。",
  not_owner: "你没有发送权限，请联系任务所有者。",
  task_not_found: "你没有发送权限，请联系任务所有者。",
  task_grant_revoked: "你没有发送权限，请联系任务所有者。",
  task_access_changed: "你没有发送权限，请联系任务所有者。",
  forbidden: "你没有发送权限，请联系任务所有者。",
  "task not found": "你没有发送权限，请联系任务所有者。",
  "task access removed": "你没有发送权限，请联系任务所有者。",
};
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
/** Reuse the UI dictionary's existing translations; only ACP's Chinese labels change. */
export function sendCopy(key: "未发出" | "重新发送" | "发送失败，请重试", tt: (key: string) => string): string {
  const aliases = { "未发出": "没有发出", "重新发送": "重发", "发送失败，请重试": "发送失败，请重试。" };
  const translated = tt(aliases[key]);
  return translated === aliases[key] ? key : translated;
}

export function sendFailureText(error: unknown, tt: (key: string) => string): string {
  const value = record(error);
  const payload = record(value?.payload);
  const detail = payload?.detail;
  const rpc = record(payload?.error);
  // Gateway explanations are already user-facing. Preserve them ahead of any code mapping.
  const reason = record(detail)?.message ?? rpc?.message;
  if (typeof reason === "string" && reason.trim()) return reason;
  if (typeof detail === "string" && detail.trim()) return tt(SENTENCES[detail] || detail);
  let code = value?.code ?? record(detail)?.code;
  // FastAPI validation errors identify the rejected field even on older gateways.
  if (!code && Array.isArray(detail)) {
    if (detail.some((item) => record(item)?.type === "string_too_long" && (record(item)?.loc as unknown[])?.includes("text"))) code = "message_too_long";
    else if (detail.some((item) => (record(item)?.loc as unknown[])?.includes("attachments"))) code = "invalid_attachment";
  }
  if (code !== undefined && SENTENCES[String(code)]) return tt(SENTENCES[String(code)]);
  if (value?.status === 401 || value?.status === 403) return tt(SENTENCES.permission_denied);
  if (typeof value?.payload === "string") return sendCopy("发送失败，请重试", tt);
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (value?.status !== 0 && message && !/^HTTP\s+\d+$/i.test(message)) return tt(SENTENCES[message] || message);
  return sendCopy("发送失败，请重试", tt);
}
