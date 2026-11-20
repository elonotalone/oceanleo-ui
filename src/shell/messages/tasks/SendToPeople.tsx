"use client";

// 新任务输入框（首页 / 任务起步）上的「发给人」：默认动作仍是交给 agent（发送键、Enter 不变）；
// 这里另选几个人，打的字成为一个新任务（人的会话）的第一条消息 → `POST /v1/task-rooms` → 打开这个任务。
import { useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { MessagePromptDialog, PRIMARY, QUIET } from "../MessageSettingsFrame";
import { MemberPicker } from "../people/MemberPicker";
import { TASK_TITLE_MAX, createTaskRoom, newClientId } from "./task-room-calls";
import { openTaskRoom } from "./open-task";

/** 默认任务名：第一行文字，截到上限。 */
export function sendToPeopleTitle(text: string): string {
  const line = text.split(/\r?\n/).map((part) => part.trim()).find(Boolean) ?? "";
  return Array.from(line).slice(0, TASK_TITLE_MAX).join("");
}

export interface SendToPeopleOptions {
  /** 任务归到这个项目（项目页上的输入框）。 */
  projectId?: string | null;
}

/** 输入框发送键旁边的小按钮 + 它打开的对话框。 */
export function SendToPeopleButton({ text, blockedReason, options, onSent }: {
  text: string;
  /** 现在不能发给人的原因（例如带了文件）；有值时按钮不可点，原因在提示里。 */
  blockedReason?: string | null;
  options?: SendToPeopleOptions;
  /** 任务建好了：宿主清空输入框。 */
  onSent: () => void;
}) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const empty = !text.trim();
  const label = tt("发给人");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={empty || Boolean(blockedReason)}
        aria-label={label}
        title={blockedReason || label}
        data-composer-send-people=""
        className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] text-neutral-500 transition-all duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
          <circle cx="17" cy="9" r="2.4" />
          <path d="M15.8 14.4c2.3.1 4 1.6 4.7 4.1" />
        </svg>
        <span className="hidden sm:inline">{label}</span>
      </button>
      {open ? (
        <SendToPeopleDialog
          text={text}
          options={options}
          onClose={() => setOpen(false)}
          onCreated={(room) => {
            setOpen(false);
            onSent();
            openTaskRoom(room.id, room.title, "page");
          }}
        />
      ) : null}
    </>
  );
}

export function SendToPeopleDialog({ text, options, onClose, onCreated }: {
  text: string;
  options?: SendToPeopleOptions;
  onClose: () => void;
  onCreated: (room: { id: string; title: string }) => void;
}) {
  const tt = useUI();
  const [members, setMembers] = useState<string[]>([]);
  const [title, setTitle] = useState(() => sendToPeopleTitle(text));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientId = useRef(newClientId());

  async function send() {
    if (busy || members.length === 0 || !text.trim()) return;
    setBusy(true);
    setError(null);
    const cleanTitle = title.trim();
    const result = await createTaskRoom({
      ...(cleanTitle ? { title: cleanTitle } : {}),
      member_ids: members,
      first_message: { body: text.trim() },
      ...(options?.projectId ? { project_id: options.projectId } : {}),
      client_id: clientId.current,
    });
    setBusy(false);
    if (result.ok) {
      onCreated({ id: result.data.id, title: result.data.title || cleanTitle });
      return;
    }
    if (result.unavailable) setError(tt("任务功能暂不可用，请稍后再试。"));
    else if (result.status === 401) setError(tt("登录后才能发给别人。"));
    else setError(tt("任务没有建成，请重试。"));
  }

  return (
    <MessagePromptDialog title={tt("发给人")} onClose={onClose}>
      <div data-send-to-people-dialog="" aria-busy={busy} className="space-y-3 text-[13px]">
        <p className="text-neutral-500">{tt("你写的内容会成为新任务的第一条消息，选中的人会收到邀请。")}</p>
        <blockquote className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-50 px-3 py-2 text-neutral-700" data-send-to-people-preview="">
          {text.trim()}
        </blockquote>
        <label className="block">
          <span className="text-[12px] text-neutral-600">{tt("任务名称")}</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={TASK_TITLE_MAX}
            data-send-to-people-title=""
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 outline-none focus:border-neutral-400"
          />
        </label>
        <div>
          <p className="mb-1 text-[12px] text-neutral-600">{tt("发给谁")}</p>
          <MemberPicker selected={members} onChange={setMembers} />
        </div>
        {error ? <p role="alert" data-send-to-people-error="" className="text-[12px] text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={QUIET} onClick={onClose}>{tt("取消")}</button>
          <button type="button" className={PRIMARY} disabled={busy || members.length === 0} data-send-to-people-submit="" onClick={() => void send()}>
            {busy ? tt("正在创建…") : tt("发送")}
          </button>
        </div>
      </div>
    </MessagePromptDialog>
  );
}
