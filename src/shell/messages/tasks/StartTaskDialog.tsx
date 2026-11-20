"use client";

// 「用选中的消息开任务」：普通会话（私聊 / 群 / Team / 项目群）多选几条消息 → 这里填标题、定成员
// （默认 = 这个会话现在的成员，可增删）→ `POST /v1/im/conversations/{id}/start-task`。
// 成功后服务端把任务卡片贴进原会话（实时推送），这里收起多选并打开新任务。
import { useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImConversationDetail, ImMessage } from "../../../lib/im/types";
import { plainTextOf } from "../conversation/message-format";
import { MessagePromptDialog, PRIMARY, QUIET } from "../MessageSettingsFrame";
import { MemberPicker } from "../people/MemberPicker";
import { TASK_TITLE_MAX, newClientId, startTaskFromConversation } from "./task-room-calls";

export const START_TASK_TITLE_MAX = TASK_TITLE_MAX;

/** 默认标题：第一条选中消息的正文（压成一行、截到上限）；没有正文就空着，由服务端取名。 */
export function defaultStartTaskTitle(messages: Pick<ImMessage, "body" | "card" | "attachments">[]): string {
  for (const message of messages) {
    const line = plainTextOf(message.body || "").replace(/\s+/g, " ").trim()
      || String(message.card?.title || "").trim()
      || String(message.attachments?.[0]?.name || "").trim();
    if (line) return Array.from(line).slice(0, START_TASK_TITLE_MAX).join("");
  }
  return "";
}

/** 默认成员：这个会话现在的成员，去掉自己（自己总在任务里）。 */
export function defaultStartTaskMembers(conversation: Pick<ImConversationDetail, "members"> | null, viewerId: string | null): string[] {
  const ids = (conversation?.members ?? []).map((member) => member.user_id).filter((id) => id && id !== viewerId);
  return [...new Set(ids)];
}

export function StartTaskDialog({ conversationId, conversation, viewerId, messages, onClose, onStarted }: {
  conversationId: string;
  conversation: ImConversationDetail | null;
  viewerId: string | null;
  /** 选中的消息，按时间先后。 */
  messages: ImMessage[];
  onClose: () => void;
  onStarted: (room: { id: string; title: string }) => void;
}) {
  const tt = useUI();
  const initialMembers = useMemo(() => defaultStartTaskMembers(conversation, viewerId), [conversation, viewerId]);
  const [title, setTitle] = useState(() => defaultStartTaskTitle(messages));
  const [members, setMembers] = useState<string[]>(initialMembers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 同一次打开里的重试用同一个 client_id：服务端只建一个任务。
  const clientId = useRef(newClientId());

  async function start() {
    if (busy || messages.length === 0) return;
    setBusy(true);
    setError(null);
    const cleanTitle = title.trim();
    const result = await startTaskFromConversation(conversationId, {
      message_ids: messages.map((message) => message.id),
      member_ids: members,
      ...(cleanTitle ? { title: cleanTitle } : {}),
      client_id: clientId.current,
    });
    setBusy(false);
    if (result.ok) {
      onStarted({ id: result.data.room_id, title: cleanTitle });
      return;
    }
    if (result.unavailable) setError(tt("任务功能暂不可用，请稍后再试。"));
    else if (result.code === "not_member" || result.status === 403) setError(tt("你不能在这个会话里开任务。"));
    else setError(tt("任务没有建成，请重试。"));
  }

  return (
    <MessagePromptDialog title={tt("用选中的消息开任务")} onClose={onClose}>
      <div data-start-task-dialog="" aria-busy={busy} className="space-y-3 text-[13px]">
        <p className="text-neutral-500">{tt("选中的 {n} 条消息会作为新任务的开头。", { n: messages.length })}</p>
        <label className="block">
          <span className="text-[12px] text-neutral-600">{tt("任务名称")}</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={START_TASK_TITLE_MAX}
            data-start-task-title=""
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 outline-none focus:border-neutral-400"
          />
        </label>
        <div>
          <p className="mb-1 text-[12px] text-neutral-600">{tt("任务成员")}</p>
          <MemberPicker selected={members} onChange={setMembers} extraIds={initialMembers} />
        </div>
        {error ? <p role="alert" data-start-task-error="" className="text-[12px] text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={QUIET} onClick={onClose}>{tt("取消")}</button>
          <button type="button" className={PRIMARY} disabled={busy || messages.length === 0} data-start-task-submit="" onClick={() => void start()}>
            {busy ? tt("正在创建…") : tt("开始任务")}
          </button>
        </div>
      </div>
    </MessagePromptDialog>
  );
}
