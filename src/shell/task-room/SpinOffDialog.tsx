"use client";

// "New task from selected messages" (task rooms wave 2026-11-20, book TU1 item 6): the picked
// messages start a new task (a people conversation) whose card appears in this task.
import { useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { ImMember } from "../../lib/im/types";
import type { PersonCard } from "../../lib/im/people-api";
import { taskRoomsApi } from "../../lib/task-rooms-api";
import { MessageSettingsDialog, PRIMARY, QUIET } from "../messages/MessageSettingsFrame";
import { PeopleSuggestions } from "../messages/people/PeopleDiscovery";

export interface SpinOffDialogProps {
  roomId: string;
  messageIds: readonly string[];
  /** The task's current members: all start selected. */
  members: readonly ImMember[];
  viewerId: string | null;
  onClose: () => void;
  onDone: (roomId: string, title: string) => void;
}

export function SpinOffDialog({ roomId, messageIds, members, viewerId, onClose, onDone }: SpinOffDialogProps) {
  const tt = useUI();
  const clientId = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `spin-${Date.now()}`);
  const [title, setTitle] = useState("");
  const [memberIds, setMemberIds] = useState<Set<string>>(() => new Set(members.map((member) => member.user_id)));
  const [added, setAdded] = useState<PersonCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id: string) =>
    setMemberIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    setBusy(true);
    setError("");
    const ids = [...memberIds].filter((id) => id !== viewerId);
    const result = await taskRoomsApi.spinOff(roomId, {
      message_ids: [...messageIds],
      member_ids: ids,
      ...(title.trim() ? { title: title.trim() } : {}),
      client_id: clientId.current,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.unavailable ? tt("任务功能暂未开放。") : tt("没能新建任务，请稍后再试。"));
      return;
    }
    onDone(result.data.room_id, title.trim());
  };

  return (
    <MessageSettingsDialog title={tt("用所选消息新建任务")} onClose={onClose} contentHeight>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto text-[13px]" data-spin-off-dialog="">
        <p className="text-neutral-500">{tt("所选的 {n} 条消息会作为新任务的开头。", { n: messageIds.length })}</p>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-neutral-500">{tt("任务名称")}</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            placeholder={tt("不填则自动命名")}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <fieldset className="flex flex-col gap-1.5" data-spin-off-members="">
          <legend className="mb-1 text-[12px] font-medium text-neutral-500">{tt("成员")}</legend>
          {members.map((member) => (
            <label key={member.user_id} className="flex min-w-0 items-center gap-2">
              <input
                type="checkbox"
                checked={member.user_id === viewerId || memberIds.has(member.user_id)}
                disabled={member.user_id === viewerId}
                onChange={() => toggle(member.user_id)}
              />
              <span className="truncate">{member.nickname || member.profile.display_name}</span>
            </label>
          ))}
          {added.map((person) => (
            <label key={person.user_id} className="flex min-w-0 items-center gap-2">
              <input type="checkbox" checked={memberIds.has(person.user_id)} onChange={() => toggle(person.user_id)} />
              <span className="truncate">{person.name}</span>
            </label>
          ))}
          <div className="mt-1">
            <PeopleSuggestions
              mode="select"
              selectedIds={[...memberIds]}
              existingIds={members.map((member) => member.user_id)}
              onPick={(person) => {
                setAdded((list) => (list.some((item) => item.user_id === person.user_id) ? list : [...list, person]));
                toggle(person.user_id);
              }}
            />
          </div>
        </fieldset>
        {error ? <p role="alert" className="text-[12.5px] text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={QUIET} onClick={onClose}>{tt("取消")}</button>
          <button type="button" className={PRIMARY} disabled={busy || !messageIds.length} onClick={() => void submit()} data-spin-off-submit="">
            {busy ? tt("正在创建…") : tt("新建任务")}
          </button>
        </div>
      </div>
    </MessageSettingsDialog>
  );
}
