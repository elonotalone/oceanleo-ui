"use client";

// Forward chat messages (session/sites wave 2026-11-21, contract §2.3). Names and signatures are the contract
// stub's; unit UC renders <ForwardPicker/> as the second page of the conversation's Forward / Copy menu; unit US
// opens the right panel on `oceanleo:open-task-panel`; the task composer (AgentChat) takes the pending bundles.
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { SS_FU_COPY as limits } from "../../i18n/ui/messages/ss-fu-copy";
import { useUI } from "../../i18n/ui/useUI";
import { SS_UT_COPY as copy } from "../../i18n/ui/messages/ss-ut-copy";
import { FloatingMenuItem, FloatingMenuLabel, FloatingMenuSeparator } from "../../ui/menu/FloatingMenu";
import { useToast } from "../../ui/Toast";
import { chatRecordTitle, composeChatRecordText } from "./chat-record";
import {
  createChatBundle,
  forwardClientId,
  forwardFailureOf,
  loadForwardChats,
  loadForwardTasks,
  postQuoteCard,
  type ForwardChatRow,
  type ForwardFailure,
  type ForwardTaskRow,
} from "./forward-targets";

export {
  CHAT_RECORD_PREAMBLE,
  ComposerChatRecordChips,
  TranscriptChatRecord,
  chatRecordLabel,
  chatRecordTitle,
  composeChatRecordText,
  hasChatRecord,
  splitChatRecords,
  stripChatRecords,
  type ChatRecordPart,
  type ChatRecordSegment,
  type ComposerChatRecord,
} from "./chat-record";

/** What `POST /v1/im/conversations/{id}/bundles` answers. */
export interface ChatBundle {
  id: string;
  /** Name of the source chat or session. */
  title: string;
  messages: number;
  chars: number;
  /** inline: `text` is the whole record. file: `text` is an overview plus the newest lines, `attachment` the full record. */
  mode: "inline" | "file";
  text: string;
  /** Same object shape the task composer keeps for a private Library upload (mode "file" only). */
  attachment?: Record<string, unknown> | null;
}

export type ForwardTaskTarget = { kind: "new-task" } | { kind: "task"; taskId: string; title: string };

export interface ForwardPickerProps {
  source: { conversationId: string; title: string };
  /** Selected message ids, oldest first. */
  messageIds: readonly string[];
  selectedCount?: number | null;
  resolveMessageIds?: (limit: number) => Promise<string[]>;
  /** Called after the messages were handed over (task panel opened, or quote card posted). */
  onDone: () => void;
  onCancel: () => void;
}

export const OPEN_TASK_PANEL_EVENT = "oceanleo:open-task-panel";
/** detail of OPEN_TASK_PANEL_EVENT: open the right panel on this task, or on a new task draft when taskId is absent. */
export interface OpenTaskPanelDetail { taskId?: string; title?: string }

const pending = new Map<string, ChatBundle[]>();
const key = (target: ForwardTaskTarget) => (target.kind === "task" ? target.taskId : "new-task");

/** The picker stores the bundle; the task composer for that target takes it when it mounts or on the event. */
export function setPendingForward(target: ForwardTaskTarget, bundle: ChatBundle): void {
  pending.set(key(target), [...(pending.get(key(target)) ?? []), bundle]);
}

export function takePendingForward(target: ForwardTaskTarget): ChatBundle[] {
  const found = pending.get(key(target)) ?? [];
  pending.delete(key(target));
  return found;
}

export function openTaskPanel(detail: OpenTaskPanelDetail): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_TASK_PANEL_EVENT, { detail }));
}

/** `<chat-record …>` block a bundle becomes inside the message text (contract §2.3). */
export function chatRecordBlock(bundle: ChatBundle): string {
  const attr = (value: string) => value.replace(/["<>\n]/g, " ").trim();
  const file = bundle.mode === "file" ? ` file="1"` : "";
  return `<chat-record title="${attr(bundle.title)}" messages="${bundle.messages}"${file}>\n${bundle.text.trim()}\n</chat-record>`;
}

/** Message text a task gets for these bundles and the typed prompt (the prompt may be empty). */
export function forwardedMessageText(bundles: readonly ChatBundle[], prompt: string): string {
  return composeChatRecordText(bundles.map(chatRecordBlock), prompt);
}

const MAX_ROWS = 30;

function failureText(tt: ReturnType<typeof useUI>, failure: ForwardFailure): string {
  if (failure === "too_large") return tt(copy.tooLarge);
  if (failure === "not_member") return tt(copy.notMember);
  if (failure === "unavailable") return tt(copy.unavailable);
  return tt(copy.failed);
}

function matches(query: string, ...values: Array<string | undefined>): boolean {
  if (!query) return true;
  return values.some((value) => Boolean(value && value.toLocaleLowerCase().includes(query)));
}

const glyph = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
);
const BACK = glyph(<path d="M15 6l-6 6 6 6" />);
const PLUS = glyph(<path d="M12 5v14M5 12h14" />);
const TASK = glyph(<><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>);
const CHAT = glyph(<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />);
const SESSION = glyph(<><path d="M4 7h16v10H4z" /><path d="M4 7l2-3h12l2 3" /></>);

/**
 * Second page of the Forward / Copy menu: back row, search, "New task", my tasks, chats and sessions.
 * Task target → bundle → pending forward → right panel on that task (or a new task draft).
 * Chat / session target → quote card posted there at once. Failures stay on this page, in words.
 */
export function ForwardPicker({ source, messageIds, selectedCount = messageIds.length, resolveMessageIds, onDone, onCancel }: ForwardPickerProps): ReactElement | null {
  const tt = useUI();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<ForwardTaskRow[] | null>(null);
  const [chats, setChats] = useState<ForwardChatRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<ForwardFailure | null>(null);
  // One client id per request kind and target: a retry after a lost answer is the same request (idempotent).
  const clientIds = useRef(new Map<string, string>());
  const alive = useRef(true);
  const selectionKey = `${source.conversationId}:${selectedCount}:${messageIds.join(",")}`;
  useEffect(() => { clientIds.current.clear(); }, [selectionKey]);
  const clientIdFor = (key: string) => {
    const known = clientIds.current.get(key);
    if (known) return known;
    const fresh = forwardClientId();
    clientIds.current.set(key, fresh);
    return fresh;
  };

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      loadForwardTasks(query.trim()).then((rows) => { if (current) setTasks(rows); }, () => { if (current) setTasks([]); });
      loadForwardChats(source.conversationId, query.trim()).then((rows) => { if (current) setChats(rows); }, () => { if (current) setChats([]); });
    }, query.trim() ? 250 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [source.conversationId, query]);

  const needle = query.trim().toLocaleLowerCase();
  const taskRows = useMemo(() => (tasks ?? [])
    .map((row) => ({ ...row, label: chatRecordTitle(row.title, tt) || tt("未命名任务") }))
    .filter((row) => matches(needle, row.label))
    .slice(0, MAX_ROWS), [tasks, needle, tt]);
  const chatRows = useMemo(() => (chats ?? [])
    .filter((row) => matches(needle, row.title, row.project))
    .slice(0, MAX_ROWS), [chats, needle]);
  const nothing = tasks !== null && chats !== null && taskRows.length === 0 && chatRows.length === 0 && !matches(needle, tt("新任务"));
  const locked = busy !== null || selectedCount === 0;

  const toTask = async (target: ForwardTaskTarget) => {
    const key = target.kind === "task" ? `task:${target.taskId}` : "new-task";
    setBusy(key);
    setFailure(null);
    try {
      const bundle = await createChatBundle(source.conversationId, resolveMessageIds ? await resolveMessageIds(2000) : messageIds.slice(-2000), clientIdFor("bundle"));
      setPendingForward(target, bundle);
      openTaskPanel(target.kind === "task" ? { taskId: target.taskId, title: target.title } : {});
      onDone();
    } catch (error) {
      if (alive.current) setFailure(forwardFailureOf(error));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const toChat = async (row: ForwardChatRow) => {
    const key = `chat:${row.id}`;
    setBusy(key);
    setFailure(null);
    try {
      await postQuoteCard(row.id, source.conversationId, resolveMessageIds ? await resolveMessageIds(500) : messageIds.slice(-500), clientIdFor(`quote:${row.id}`));
      toast.success(tt(copy.quoted, { title: row.title || tt("未命名") }));
      onDone();
    } catch (error) {
      if (alive.current) setFailure(forwardFailureOf(error));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const working = (key: string) => (busy === key ? tt(copy.forwarding) : undefined);

  return (
    <div data-forward-picker="" data-forward-source={source.conversationId}>
      {selectedCount === null || selectedCount > 2000 ? <p role="note" className="px-2.5 py-1.5 text-xs text-stone-500">{tt(limits.taskLimit)}</p> : null}
      {selectedCount === null || selectedCount > 500 ? <p role="note" className="px-2.5 py-1.5 text-xs text-stone-500">{tt(limits.quoteLimit)}</p> : null}
      {busy !== null ? <p role="status" className="px-2.5 py-1.5 text-xs text-stone-500">{tt(copy.forwarding)}</p> : null}
      <FloatingMenuItem icon={BACK} label={tt("返回")} onSelect={onCancel} disabled={busy !== null} />
      <div className="px-1.5 pb-1 pt-0.5">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tt(copy.search)}
          aria-label={tt(copy.search)}
          data-forward-search=""
          className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-[13px] text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-300 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100"
        />
      </div>
      {matches(needle, tt("新任务")) && (
        <FloatingMenuItem icon={PLUS} label={tt("新任务")} disabled={locked} trailing={working("new-task")}
          onSelect={() => void toTask({ kind: "new-task" })} />
      )}
      <FloatingMenuSeparator />
      <FloatingMenuLabel>{tt(copy.tasks)}</FloatingMenuLabel>
      <div data-forward-section="tasks">
        {tasks === null ? <p className="px-2.5 py-1.5 text-[12px] text-stone-400">{tt("加载中…")}</p> : taskRows.map((row) => (
          <FloatingMenuItem key={row.taskId} icon={TASK} label={row.label} title={row.label} disabled={locked}
            trailing={working(`task:${row.taskId}`)}
            onSelect={() => void toTask({ kind: "task", taskId: row.taskId, title: row.label })} />
        ))}
      </div>
      <FloatingMenuLabel>{tt(copy.chats)}</FloatingMenuLabel>
      <div data-forward-section="chats">
        {chats === null ? <p className="px-2.5 py-1.5 text-[12px] text-stone-400">{tt("加载中…")}</p> : chatRows.map((row) => (
          <FloatingMenuItem key={`${row.kind}:${row.id}`} icon={row.kind === "session" ? SESSION : CHAT}
            label={row.title || tt("未命名")} description={row.kind === "session" ? row.project : undefined}
            title={row.title} disabled={locked} trailing={working(`chat:${row.id}`)}
            onSelect={() => void toChat(row)} />
        ))}
      </div>
      {nothing && <p className="px-2.5 py-1.5 text-[12px] text-stone-400" data-forward-empty="">{tt(copy.empty)}</p>}
      {failure && (
        <p role="alert" data-forward-error={failure} className="px-2.5 py-1.5 text-[12px] leading-5 text-rose-600 dark:text-rose-400">
          {failureText(tt, failure)}
        </p>
      )}
    </div>
  );
}
