"use client";

// Calling an agent from a task (task rooms wave 2026-11-20, book TU1 item 4): pick a new agent
// task or an existing sub task, see what will be given to it (count + size from the server's
// preview), write the request, optionally carry earlier sub tasks and LeoChat messages, choose
// what the other people get. The summoner owns a new sub task (their computer, their credits).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { ImAttachment, ImConversationSummary, ImMessage } from "../../lib/im/types";
import {
  taskRoomsApi,
  type ImportedMessages,
  type SummonPreview,
  type SummonResult,
  type SummonTarget,
  type TaskChildMode,
  type TaskRoom,
  type TaskRoomsFailure,
} from "../../lib/task-rooms-api";
import { fetchConversations } from "../../lib/im/inbox-api";
import { messagesApi } from "../../lib/im/messages-api";
import { conversationDisplayTitle } from "../../lib/im/people-api";
import { MessageSettingsDialog, PRIMARY, QUIET } from "../messages/MessageSettingsFrame";
import { uploadAttachment } from "../messages/composer/upload";
import { plainTextOf } from "../messages/conversation/message-format";
import { ComputerDock } from "../cloud-computer/ComputerDock";
import { useAcpCatalogPicker } from "../acp-task/useAcpCatalogPicker";
import type { ConversationTarget } from "../native-thread/types";
import { readableSubTasks, sendableSubTasks, subTaskLabel, summonSelection } from "./room-model";

/** Everything the dialog holds; kept by the host while the person picks messages in the list. */
export interface SummonDraft {
  target: SummonTarget;
  /** null = the server's default for the target (rule 3). */
  messageIds: string[] | null;
  priorTaskIds: string[];
  imported: (ImportedMessages & { title: string })[];
  text: string;
  attachments: ImAttachment[];
  mode: TaskChildMode;
  conversation?: ConversationTarget;
}

export function newSummonDraft(target: SummonTarget = "new", messageIds: string[] | null = null): SummonDraft {
  return { target, messageIds, priorTaskIds: [], imported: [], text: "", attachments: [], mode: "view" };
}

export interface SummonDialogProps {
  room: TaskRoom;
  draft: SummonDraft;
  onDraftChange: (draft: SummonDraft) => void;
  /** Close the dialog and pick messages in the list (the host reopens it with the picked ids). */
  onChooseMessages: (current: readonly string[]) => void;
  onClose: () => void;
  onDone: (result: SummonResult, title: string) => void;
}

const PREVIEW_DELAY_MS = 250;

function failureText(tt: ReturnType<typeof useUI>, failure: TaskRoomsFailure): string {
  if (failure.unavailable) return tt("任务功能暂未开放。");
  switch (failure.code) {
    case "cannot_summon":
      return tt("项目的查看者可以在这里交流，但不能叫智能体。");
    case "cannot_send":
      return tt("你不能给这个子任务发消息。");
    case "over_limit":
      return tt("内容太多了，请少选一些消息。");
    case "create_required":
      return tt("请先选一台电脑和一个程序。");
    case "not_member":
      return tt("你已不在这个会话里。");
    case "network":
      return tt("网络不通，请稍后再试。");
    default:
      return tt("没能叫来智能体，请稍后再试。");
  }
}

function firstLine(text: string): string {
  return text.trim().split(/\n/)[0]?.slice(0, 80) ?? "";
}

export function SummonDialog({ room, draft, onDraftChange, onChooseMessages, onClose, onDone }: SummonDialogProps) {
  const tt = useUI();
  const clientId = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `summon-${Date.now()}`);
  const [preview, setPreview] = useState<SummonPreview | null>(null);
  const [previewFailure, setPreviewFailure] = useState<TaskRoomsFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const update = useCallback((patch: Partial<SummonDraft>) => onDraftChange({ ...draftRef.current, ...patch }), [onDraftChange]);

  const sendable = useMemo(() => sendableSubTasks(room.children), [room.children]);
  const earlier = useMemo(
    () => readableSubTasks(room.children).filter((child) => child.id !== draft.target),
    [room.children, draft.target],
  );
  const isNew = draft.target === "new";
  const native = draft.conversation?.kind === "native" ? draft.conversation : null;
  const catalog = useAcpCatalogPicker({ computerId: isNew ? native?.computerId : null, program: isNew ? native?.program : null });

  const importedKey = JSON.stringify(draft.imported.map(({ conversation_id, message_ids }) => [conversation_id, message_ids]));
  const messageKey = draft.messageIds ? draft.messageIds.join(",") : "default";
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      const current = draftRef.current;
      void taskRoomsApi
        .summonPreview(room.id, {
          target: current.target,
          message_ids: current.messageIds,
          prior_task_ids: current.priorTaskIds,
          imported: current.imported.map(({ conversation_id, message_ids }) => ({ conversation_id, message_ids })),
        })
        .then((result) => {
          if (!alive) return;
          if (result.ok) {
            setPreview(result.data);
            setPreviewFailure(null);
          } else {
            setPreview(null);
            setPreviewFailure(result);
          }
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [room.id, draft.target, messageKey, draft.priorTaskIds, importedKey]);

  const selection = summonSelection(draft.messageIds, preview);
  const unavailable = Boolean(previewFailure?.unavailable);
  const missingComputer = isNew && !native;
  const canSubmit = !busy && !uploading && !unavailable && selection !== null && Boolean(draft.text.trim()) && !missingComputer && room.can_summon;

  const submit = async () => {
    if (!canSubmit || !selection) return;
    setBusy(true);
    setError("");
    const choices = isNew ? catalog.forSend() : {};
    const result = await taskRoomsApi.summon(room.id, {
      target: draft.target,
      message_ids: selection,
      prior_task_ids: draft.priorTaskIds,
      imported: draft.imported.map(({ conversation_id, message_ids }) => ({ conversation_id, message_ids })),
      text: draft.text.trim(),
      ...(draft.attachments.length ? { attachments: draft.attachments } : {}),
      ...(isNew && native
        ? {
            create: {
              computer_id: native.computerId,
              program: native.program,
              title: firstLine(draft.text) || room.title,
              ...(room.project ? { project_id: room.project.id } : {}),
              ...choices,
            },
            mode: draft.mode,
          }
        : {}),
      client_id: clientId.current,
    });
    setBusy(false);
    if (!result.ok) {
      setError(failureText(tt, result));
      return;
    }
    const existing = room.children.find((child) => child.id === result.data.task_id);
    onDone(result.data, existing?.title || firstLine(draft.text) || room.title);
  };

  const addFiles = (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      setUploading((n) => n + 1);
      void uploadAttachment(file)
        .then((attachment) => update({ attachments: [...draftRef.current.attachments, attachment] }))
        .catch(() => setError(tt("文件没能上传，请重试。")))
        .finally(() => setUploading((n) => n - 1));
    }
  };

  const count = selection?.length ?? preview?.messages ?? 0;
  return (
    <MessageSettingsDialog title={tt("叫智能体")} onClose={onClose} contentHeight>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pb-1 text-[13px]" data-summon-dialog="">
        <fieldset className="flex flex-col gap-1.5" data-summon-target="">
          <legend className="mb-1 text-[12px] font-medium text-neutral-500">{tt("交给谁")}</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="summon-target" checked={isNew} onChange={() => update({ target: "new", messageIds: draft.target === "new" ? draft.messageIds : null })} />
            {tt("新的智能体任务")}
          </label>
          {sendable.map((child) => (
            <label key={child.id} className="flex min-w-0 items-center gap-2">
              <input type="radio" name="summon-target" checked={draft.target === child.id} onChange={() => update({ target: child.id, messageIds: null, priorTaskIds: draft.priorTaskIds.filter((id) => id !== child.id) })} />
              <span className="truncate">{subTaskLabel(child)}</span>
            </label>
          ))}
        </fieldset>

        {isNew ? (
          <div className="flex flex-col gap-1.5" data-summon-runner="">
            <span className="text-[12px] font-medium text-neutral-500">{tt("在哪台电脑、用哪个程序")}</span>
            <div className="flex flex-wrap items-center gap-2">
              <ComputerDock
                conversation={draft.conversation}
                onConversationChange={(conversation) => update({ conversation })}
                oceanleoDisabledReason={tt("智能体任务在你的电脑上用一个程序运行")}
              />
              {native ? catalog.picker : null}
            </div>
            {missingComputer ? <p className="text-[12px] text-neutral-500">{tt("请先选一台电脑和一个程序。")}</p> : null}
            <p className="text-[12px] text-neutral-500">{tt("这个子任务归你所有，用你的电脑和额度。")}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-1" data-summon-selection="">
          <div className="flex items-center justify-between gap-2">
            <span>
              {unavailable
                ? tt("任务功能暂未开放。")
                : preview
                  ? tt("这个任务里的 {n} 条消息，{chars} 个字", { n: count, chars: preview.chars })
                  : tt("正在计算…")}
            </span>
            <button type="button" className={QUIET} disabled={unavailable} onClick={() => onChooseMessages(selection ?? [])}>
              {tt("挑选消息")}
            </button>
          </div>
          {preview?.as_file ? <p className="text-[12px] text-neutral-500" data-summon-as-file="">{tt("内容较多，会作为一个文件交给智能体。")}</p> : null}
        </div>

        {earlier.length ? (
          <fieldset className="flex flex-col gap-1.5" data-summon-prior="">
            <legend className="mb-1 text-[12px] font-medium text-neutral-500">{tt("同时带上之前的子任务")}</legend>
            {earlier.map((child) => (
              <label key={child.id} className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.priorTaskIds.includes(child.id)}
                  onChange={(event) =>
                    update({
                      priorTaskIds: event.target.checked
                        ? [...draft.priorTaskIds, child.id]
                        : draft.priorTaskIds.filter((id) => id !== child.id),
                    })
                  }
                />
                <span className="truncate">{subTaskLabel(child)}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <div className="flex flex-col gap-1.5" data-summon-imported="">
          {draft.imported.map((item) => (
            <div key={item.conversation_id} className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="truncate">{tt("来自「{title}」的 {n} 条消息", { title: item.title, n: item.message_ids.length })}</span>
              <button type="button" className={QUIET} onClick={() => update({ imported: draft.imported.filter((row) => row !== item) })}>{tt("移除")}</button>
            </div>
          ))}
          {importOpen ? (
            <ImportFromLeoChat
              excludeId={room.id}
              onCancel={() => setImportOpen(false)}
              onImport={(item) => {
                setImportOpen(false);
                update({ imported: [...draft.imported.filter((row) => row.conversation_id !== item.conversation_id), item] });
              }}
            />
          ) : (
            <button type="button" className={`${QUIET} self-start`} onClick={() => setImportOpen(true)}>{tt("从 LeoChat 导入")}</button>
          )}
        </div>

        <div className="flex flex-col gap-1.5" data-summon-request="">
          <label className="text-[12px] font-medium text-neutral-500" htmlFor={`summon-text-${room.id}`}>{tt("你想让智能体做什么")}</label>
          <textarea
            id={`summon-text-${room.id}`}
            value={draft.text}
            rows={3}
            onChange={(event) => update({ text: event.target.value })}
            placeholder={tt("写下你的要求")}
            className="w-full resize-y rounded-lg border border-neutral-200 px-3 py-2 text-[13px] dark:border-neutral-700 dark:bg-neutral-900"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={QUIET} onClick={() => fileRef.current?.click()}>{tt("添加文件")}</button>
            <input ref={fileRef} type="file" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
            {uploading ? <span className="text-[12px] text-neutral-500">{tt("正在上传…")}</span> : null}
            {draft.attachments.map((attachment, index) => (
              <span key={`${attachment.url}-${index}`} className="flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[12px] dark:bg-neutral-800">
                <span className="max-w-[160px] truncate">{attachment.name}</span>
                <button type="button" aria-label={tt("移除")} onClick={() => update({ attachments: draft.attachments.filter((_, i) => i !== index) })}>×</button>
              </span>
            ))}
          </div>
        </div>

        {isNew ? (
          <fieldset className="flex flex-col gap-1.5" data-summon-mode="">
            <legend className="mb-1 text-[12px] font-medium text-neutral-500">{tt("任务里的其他人")}</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="summon-mode" checked={draft.mode === "view"} onChange={() => update({ mode: "view" })} />
              {tt("可查看")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="summon-mode" checked={draft.mode === "collaborate"} onChange={() => update({ mode: "collaborate" })} />
              {tt("可协作")}
            </label>
            {draft.mode === "collaborate" ? <p className="text-[12px] text-neutral-500">{tt("他们也能给这个子任务发消息，费用由你承担。")}</p> : null}
          </fieldset>
        ) : null}

        {error ? <p role="alert" className="text-[12.5px] text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={QUIET} onClick={onClose}>{tt("取消")}</button>
          <button type="button" className={PRIMARY} disabled={!canSubmit} onClick={() => void submit()} data-summon-submit="">
            {busy ? tt("正在发送…") : tt("交给智能体")}
          </button>
        </div>
      </div>
    </MessageSettingsDialog>
  );
}

/** Pick a LeoChat conversation, then messages in it (the same list the Forward dialog shows). */
function ImportFromLeoChat({ excludeId, onImport, onCancel }: {
  excludeId: string;
  onImport: (item: ImportedMessages & { title: string }) => void;
  onCancel: () => void;
}) {
  const tt = useUI();
  const [targets, setTargets] = useState<ImConversationSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<ImConversationSummary | null>(null);
  const [messages, setMessages] = useState<ImMessage[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let alive = true;
    void fetchConversations("all")
      .then((page) => { if (alive) setTargets(page.items.filter((item) => item.id !== excludeId)); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [excludeId]);

  useEffect(() => {
    if (!picked) return undefined;
    let alive = true;
    setMessages(null);
    void messagesApi
      .listMessages(picked.id, { limit: 50 })
      .then((page) => {
        if (!alive) return;
        const rows = (page.items ?? []).filter((m) => !m.recalled_at && m.sender_kind !== "system");
        setMessages(rows);
        setChosen(new Set(rows.map((m) => m.id)));
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [picked]);

  return (
    <div className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-700" data-summon-import="">
      {failed ? <p role="alert" className="text-[12.5px] text-red-600">{tt("暂时无法加载会话列表。")}</p> : null}
      {!picked ? (
        <div className="flex max-h-48 flex-col overflow-y-auto">
          {targets === null && !failed ? <p className="py-2 text-center text-neutral-500">{tt("正在加载会话…")}</p> : null}
          {(targets ?? []).map((target) => (
            <button key={target.id} type="button" className="truncate rounded-md px-2 py-1.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800" onClick={() => setPicked(target)}>
              {conversationDisplayTitle(target)}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex max-h-56 flex-col overflow-y-auto">
          <span className="mb-1 truncate text-[12px] font-medium text-neutral-500">{conversationDisplayTitle(picked)}</span>
          {messages === null && !failed ? <p className="py-2 text-center text-neutral-500">{tt("正在加载…")}</p> : null}
          {(messages ?? []).map((message) => (
            <label key={message.id} className="flex min-w-0 items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={chosen.has(message.id)}
                onChange={() => setChosen((current) => {
                  const next = new Set(current);
                  if (next.has(message.id)) next.delete(message.id); else next.add(message.id);
                  return next;
                })}
              />
              <span className="truncate text-[12.5px]">{plainTextOf(message.body).replace(/\s+/g, " ") || message.card?.title || message.attachments[0]?.name || "…"}</span>
            </label>
          ))}
        </div>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className={QUIET} onClick={picked ? () => setPicked(null) : onCancel}>{picked ? tt("返回") : tt("取消")}</button>
        {picked ? (
          <button
            type="button"
            className={PRIMARY}
            disabled={!chosen.size}
            onClick={() => onImport({
              conversation_id: picked.id,
              message_ids: (messages ?? []).filter((m) => chosen.has(m.id)).map((m) => m.id),
              title: conversationDisplayTitle(picked),
            })}
          >
            {tt("导入 {n} 条", { n: chosen.size })}
          </button>
        ) : null}
      </div>
    </div>
  );
}
