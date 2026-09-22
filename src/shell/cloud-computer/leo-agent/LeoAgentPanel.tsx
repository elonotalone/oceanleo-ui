"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudComputerClient, Computer } from "../../../lib/cloud-computer-api";
import { useUI } from "../../../i18n/ui/useUI";
import {
  deleteLeoNote,
  deleteLeoWatch,
  getLeoState,
  getLeoWatches,
  getTask,
  listLeoNotifications,
  markNotificationsRead,
  postLeoNote,
  postLeoTurn,
  postLeoWatch,
  putLeoState,
  type AgentMessage,
  type LeoEvent,
  type LeoState,
  type LeoWatch,
} from "../../../lib/cloud-computer-leo-api";
import { GuideCard } from "./GuideCard";
import { LEO_PROGRAMS, programLabel, type LeoProgramId } from "./guides";

export type LeoForm = "bubble" | "card" | "large" | "hidden";

export type LeoAgentControl = {
  form: LeoForm;
  alert: boolean;
  toggleFromBar: () => void;
  openLarge: () => void;
};

export type LeoTerminal = {
  sendText: (text: string) => void;
  tail: () => string;
  ready?: boolean;
};

type SystemNote = { id: string; tone: "online" | "offline" };
type Toast = { id: string; title: string };

const POLL_MS = 1500;
const REFRESH_MS = 30_000;
const TOAST_MS = 3000;

function formStorageKey(computerId: string): string {
  return `oceanleo.cc.leo.${computerId}.form`;
}

function lastStorageKey(computerId: string): string {
  return `oceanleo.cc.leo.${computerId}.last`;
}

function isForm(value: string | null): value is LeoForm {
  return value === "bubble" || value === "card" || value === "large" || value === "hidden";
}

function isVisible(value: string | null): value is Exclude<LeoForm, "hidden"> {
  return value === "bubble" || value === "card" || value === "large";
}

function loadForm(computerId: string): { form: LeoForm; last: Exclude<LeoForm, "hidden"> } {
  try {
    const form = localStorage.getItem(formStorageKey(computerId));
    const last = localStorage.getItem(lastStorageKey(computerId));
    return {
      form: isForm(form) ? form : "bubble",
      last: isVisible(last) ? last : "card",
    };
  } catch {
    return { form: "bubble", last: "card" };
  }
}

function persistForm(
  computerId: string,
  form: LeoForm,
  last: Exclude<LeoForm, "hidden">,
): void {
  try {
    localStorage.setItem(formStorageKey(computerId), form);
    localStorage.setItem(lastStorageKey(computerId), last);
  } catch {
    /* 写不进去时这一轮的形态仍留在内存里 */
  }
}

function latestEvents(events: LeoEvent[] | undefined): LeoEvent[] {
  return [...(events ?? [])]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 3);
}

function oneLine(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  if (flat.length <= 160) return flat;
  return `${flat.slice(0, 160)}…`;
}

function rememberLines(content: string): string[] {
  const found: string[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("【记住】")) continue;
    const text = line.slice("【记住】".length).trim();
    if (text) found.push(text.slice(0, 500));
  }
  return found;
}

function isToolStep(message: AgentMessage): boolean {
  return message.kind === "step" || message.kind === "tool";
}

function notifyDesktop(title: string): void {
  if (!title) return;
  const Desktop = globalThis.Notification;
  if (!Desktop || Desktop.permission !== "granted") return;
  try {
    const note = new Desktop(title);
    note.onclick = () => {
      window.focus();
      note.close();
    };
  } catch {
    /* 浏览器拒绝桌面通知时，站内 toast 仍然在 */
  }
}

function requestNotifyPermission(): void {
  const Desktop = globalThis.Notification;
  if (!Desktop || typeof Desktop.requestPermission !== "function") return;
  try {
    void Desktop.requestPermission();
  } catch {
    /* 拒绝不影响站内提醒 */
  }
}

export function LeoAgentPanel({
  computerId,
  sessionId,
  computer,
  client,
  terminal,
  onControl,
}: {
  computerId: string;
  sessionId: string | null;
  computer: Computer | null;
  client: Pick<CloudComputerClient, "getComputer" | "startComputer">;
  terminal: LeoTerminal;
  onControl?: (control: LeoAgentControl) => void;
}) {
  const tt = useUI();
  const loaded = loadForm(computerId);
  const [form, setFormState] = useState<LeoForm>(loaded.form);
  const lastRef = useRef(loaded.last);
  const [leoState, setLeoState] = useState<LeoState | null>(null);
  const [watches, setWatches] = useState<LeoWatch[]>([]);
  const [computerNow, setComputerNow] = useState<Computer | null>(computer);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [systemNotes, setSystemNotes] = useState<SystemNote[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | "install" | "teach">(null);
  const [watchOpen, setWatchOpen] = useState(false);
  const [guideProgram, setGuideProgram] = useState<LeoProgramId | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [powering, setPowering] = useState(false);
  const [powerError, setPowerError] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const onlineRef = useRef<boolean | null>(null);
  const taskReady = useRef(false);
  const skipHistory = useRef(false);
  const historyFor = useRef<string | null>(null);
  const pollGen = useRef(0);
  const askedPermission = useRef(false);
  const draftRef = useRef<HTMLInputElement | null>(null);
  const seenNotifications = useRef(new Set<string>());
  const onControlRef = useRef(onControl);
  onControlRef.current = onControl;

  useEffect(() => {
    setComputerNow(computer);
  }, [computer]);

  const setForm = useCallback(
    (next: LeoForm) => {
      setFormState((current) => {
        if (next === "hidden") {
          if (current !== "hidden") lastRef.current = current;
        } else {
          lastRef.current = next;
        }
        persistForm(computerId, next, lastRef.current);
        return next;
      });
    },
    [computerId],
  );

  const toggleFromBar = useCallback(() => {
    setFormState((current) => {
      let next: LeoForm;
      if (current === "hidden") next = lastRef.current;
      else if (current === "bubble") next = "card";
      else {
        lastRef.current = current;
        next = "hidden";
      }
      if (next !== "hidden") lastRef.current = next;
      persistForm(computerId, next, lastRef.current);
      return next;
    });
  }, [computerId]);

  const openLarge = useCallback(() => {
    setForm("large");
  }, [setForm]);

  const alert = hasUnread || watches.some((watch) => watch.status === "armed");

  useEffect(() => {
    onControlRef.current?.({ form, alert, toggleFromBar, openLarge });
  }, [form, alert, toggleFromBar, openLarge]);

  useEffect(() => {
    if (form !== "large") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setForm("card");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form, setForm]);

  useEffect(() => {
    let stop = false;
    async function tick() {
      const [stateRes, watchRes] = await Promise.all([
        getLeoState(computerId),
        getLeoWatches(computerId),
      ]);
      if (stop) return;
      if (watchRes.ok && watchRes.data && Array.isArray(watchRes.data.watches)) {
        setWatches(watchRes.data.watches);
      }
      if (!stateRes.ok || !stateRes.data) return;
      const next = stateRes.data;
      const prev = onlineRef.current;
      if (prev !== null && prev !== Boolean(next.online)) {
        setSystemNotes((list) => [
          ...list,
          { id: `sys-${Date.now()}`, tone: next.online ? "online" : "offline" },
        ]);
      }
      onlineRef.current = Boolean(next.online);
      setLeoState(next);
    }
    void tick();
    const timer = window.setInterval(() => void tick(), REFRESH_MS);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [computerId]);

  useEffect(() => {
    if (!leoState) return;
    if (skipHistory.current) {
      if (leoState.task_id == null) skipHistory.current = false;
      return;
    }
    if (taskReady.current) return;
    taskReady.current = true;
    setTaskId(leoState.task_id);
    const id = leoState.task_id;
    if (!id) return;
    historyFor.current = id;
    let stop = false;
    void getTask(id).then((res) => {
      if (stop || !res.ok || !res.data) return;
      setMessages(Array.isArray(res.data.messages) ? res.data.messages : []);
    });
    return () => {
      stop = true;
    };
  }, [leoState]);

  const panelOpen = form !== "hidden";
  useEffect(() => {
    let stop = false;
    async function tick(toast: boolean) {
      const [done, offline] = await Promise.all([
        listLeoNotifications("cloud_computer.watch.done"),
        listLeoNotifications("cloud_computer.offline"),
      ]);
      if (stop) return;
      const items = [
        ...(done.ok && done.data && Array.isArray(done.data.items) ? done.data.items : []),
        ...(offline.ok && offline.data && Array.isArray(offline.data.items)
          ? offline.data.items
          : []),
      ];
      setHasUnread(items.length > 0);
      if (!toast || items.length === 0) return;
      const fresh = items.filter((item) => item.id && !seenNotifications.current.has(item.id));
      if (fresh.length === 0) return;
      for (const item of fresh) seenNotifications.current.add(item.id);
      setToasts((prev) => [
        ...prev,
        ...fresh.map((item) => ({ id: item.id, title: item.title || "" })),
      ]);
      for (const item of fresh) notifyDesktop(item.title || "");
      const read = await markNotificationsRead(fresh.map((item) => item.id));
      if (!stop && read.ok) setHasUnread(false);
    }
    void tick(panelOpen);
    if (!panelOpen) {
      return () => {
        stop = true;
      };
    }
    const timer = window.setInterval(() => void tick(true), REFRESH_MS);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [computerId, panelOpen]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => setToasts([]), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  useEffect(() => {
    return () => {
      pollGen.current += 1;
    };
  }, []);

  async function poll(id: string) {
    const gen = ++pollGen.current;
    setBusy(true);
    try {
      for (let i = 0; i < 80; i += 1) {
        if (pollGen.current !== gen) return;
        const res = await getTask(id);
        if (pollGen.current !== gen) return;
        if (!res.ok || !res.data) {
          setSendError(tt("结果还没取回来。过一会儿再打开这里看。"));
          return;
        }
        setMessages(Array.isArray(res.data.messages) ? res.data.messages : []);
        if (res.data.task?.status !== "running") return;
        await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
      }
      setSendError(tt("这一轮还在跑。可以先去做别的，回来再看。"));
    } finally {
      if (pollGen.current === gen) setBusy(false);
    }
  }

  function textInBox(): string {
    const live = draftRef.current?.value;
    return typeof live === "string" ? live : draft;
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setSendError(null);
    setDraft("");
    const tail = (terminal.tail() || "").slice(-4000);
    const res = await postLeoTurn(computerId, {
      text: trimmed,
      terminal_tail: tail,
      ...(sessionId ? { shell_session_id: sessionId } : {}),
      ...(taskId ? { task_id: taskId } : {}),
    });
    if (!res.ok || !res.data?.task_id) {
      setDraft(trimmed);
      setSendError(tt("这句话没发出去。检查网络后再试。"));
      return;
    }
    const nextId = res.data.task_id;
    if (!taskId) void putLeoState(computerId, { task_id: nextId });
    historyFor.current = nextId;
    taskReady.current = true;
    setTaskId(nextId);
    await poll(nextId);
  }

  function newChat() {
    pollGen.current += 1;
    setBusy(false);
    skipHistory.current = true;
    historyFor.current = null;
    setTaskId(null);
    setMessages([]);
    setSendError(null);
    void putLeoState(computerId, { task_id: null });
  }

  async function addMemory(text: string) {
    const clean = text.trim().slice(0, 500);
    if (!clean) return;
    setNoteError(null);
    const res = await postLeoNote(computerId, clean);
    if (!res.ok || !res.data?.note) {
      setNoteError(tt("没记下来。再试一次。"));
      return;
    }
    const note = res.data.note;
    setLeoState((current) =>
      current ? { ...current, notes: [...(current.notes ?? []), note] } : current,
    );
    setNoteDraft("");
  }

  async function removeMemory(noteId: string) {
    const res = await deleteLeoNote(computerId, noteId);
    if (!res.ok) {
      setNoteError(tt("没记下来。再试一次。"));
      return;
    }
    setLeoState((current) =>
      current
        ? { ...current, notes: (current.notes ?? []).filter((note) => note.id !== noteId) }
        : current,
    );
  }

  async function toggleWatch(program: string) {
    const armed = watches.find(
      (watch) => watch.kind === "process" && watch.program === program && watch.status === "armed",
    );
    if (armed) {
      const res = await deleteLeoWatch(computerId, armed.id);
      if (res.ok) setWatches((current) => current.filter((watch) => watch.id !== armed.id));
      return;
    }
    if (!askedPermission.current) {
      askedPermission.current = true;
      requestNotifyPermission();
    }
    const res = await postLeoWatch(computerId, {
      kind: "process",
      program,
      label: programLabel(program).slice(0, 120),
    });
    if (res.ok && res.data?.watch) {
      setWatches((current) => [...current, res.data!.watch]);
    }
  }

  async function powerOn() {
    setPowerError(false);
    setPowering(true);
    try {
      await client.startComputer(computerId);
      setComputerNow(await client.getComputer(computerId));
    } catch {
      setPowerError(true);
    } finally {
      setPowering(false);
    }
  }

  function chooseProgram(program: LeoProgramId) {
    if (picker === "install") {
      const label = programLabel(program);
      void send(
        tt("请在这台机器上安装 {program}，装到默认位置，装完告诉我怎么登录", { program: label }),
      );
    } else if (picker === "teach") {
      setGuideProgram(program);
    }
    setPicker(null);
  }

  const running = leoState?.running ?? [];
  const notes = leoState?.notes ?? [];
  const guide = guideProgram ? (
    <GuideCard
      computerId={computerId}
      program={guideProgram}
      terminalReady={terminal.ready !== false}
      onType={(command) => terminal.sendText(command)}
    />
  ) : null;

  const frame =
    form === "bubble"
      ? "bottom-3 right-3 h-14 w-14 rounded-full"
      : form === "card"
        ? "bottom-3 right-3 h-[520px] max-h-[calc(100%-24px)] w-[360px] max-w-[calc(100%-24px)] rounded-2xl"
        : "inset-[3%] rounded-2xl";

  return (
    <>
      {form === "hidden" ? null : (
        <div
          className={`absolute z-20 flex flex-col overflow-hidden border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-xl transition-all duration-150 ${frame}`}
          data-oceanleo-cc-leo-form={form}
          onClick={form === "bubble" ? () => setForm("card") : undefined}
          onKeyDown={
            form === "bubble"
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") setForm("card");
                }
              : undefined
          }
          role={form === "bubble" ? "button" : undefined}
          tabIndex={form === "bubble" ? 0 : undefined}
        >
          {form === "bubble" ? (
            <span className="grid h-full w-full place-items-center text-[12px]">
              {tt("Leo")}
              {alert ? (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-400" />
              ) : null}
            </span>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-1 border-b border-neutral-800 px-2 py-1.5 text-[12px]">
                <span className="min-w-0 flex-1 truncate">{tt("OceanLeo agent")}</span>
                <button
                  type="button"
                  onClick={newChat}
                  data-oceanleo-cc-leo-new
                  className="rounded-lg px-2 py-1 text-neutral-300 hover:bg-neutral-800"
                >
                  {tt("新对话")}
                </button>
                <button
                  type="button"
                  onClick={() => setForm("large")}
                  data-oceanleo-cc-leo-enlarge
                  className="rounded-lg px-2 py-1 text-neutral-300 hover:bg-neutral-800"
                >
                  {tt("放大")}
                </button>
                <button
                  type="button"
                  onClick={() => setForm("bubble")}
                  data-oceanleo-cc-leo-shrink
                  className="rounded-lg px-2 py-1 text-neutral-300 hover:bg-neutral-800"
                >
                  {tt("缩到气泡")}
                </button>
                <button
                  type="button"
                  onClick={() => setForm("hidden")}
                  data-oceanleo-cc-leo-close
                  className="rounded-lg px-2 py-1 text-neutral-300 hover:bg-neutral-800"
                >
                  {tt("关闭")}
                </button>
              </div>
              {toasts.length > 0 ? (
                <div className="space-y-1 border-b border-neutral-800 px-3 py-2">
                  {toasts.map((toast) => (
                    <p
                      key={toast.id}
                      data-oceanleo-cc-leo-toast={toast.id}
                      className="rounded-lg bg-neutral-800 px-2 py-1 text-[12px] text-neutral-100"
                    >
                      {toast.title}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="flex min-h-0 flex-1">
                <div className="flex min-w-0 flex-1 flex-col">
                  <ModeBar
                    state={leoState}
                    computer={computerNow}
                    powering={powering}
                    powerError={powerError}
                    onPower={() => void powerOn()}
                  />
                  <div
                    className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 text-[13px]"
                    data-oceanleo-cc-leo-messages
                  >
                    {messages.length === 0 && systemNotes.length === 0 ? (
                      <p className="text-neutral-500">{tt("从下面输入，或点一个快捷动作。")}</p>
                    ) : null}
                    {messages.map((message) => (
                      <MessageRow
                        key={message.id}
                        message={message}
                        onRemember={(text) => void addMemory(text)}
                      />
                    ))}
                    {systemNotes.map((note) => (
                      <p
                        key={note.id}
                        data-oceanleo-cc-leo-system={note.tone}
                        className="text-[12px] text-neutral-400"
                      >
                        {note.tone === "online"
                          ? tt("这台机器上线了，改回本机模式。")
                          : tt("这台机器离线了，改成远程模式。")}
                      </p>
                    ))}
                    {busy ? <p className="text-[12px] text-neutral-500">{tt("正在处理")}</p> : null}
                  </div>
                  <div className="space-y-2 border-t border-neutral-800 px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Chip onClick={() => setPicker("install")} name="install">
                        {tt("帮我装 …")}
                      </Chip>
                      <Chip onClick={() => setPicker("teach")} name="teach">
                        {tt("教我用 …")}
                      </Chip>
                      <Chip onClick={() => setWatchOpen((open) => !open)} name="watch">
                        {tt("做好后提醒我")}
                      </Chip>
                      <Chip
                        onClick={() =>
                          void send(
                            leoState && !leoState.online
                              ? tt(
                                  "机器离线了，告诉我最后一次在线是什么时候、最近发生了什么、我现在该怎么做",
                                )
                              : tt(
                                  "检查这台机器现在的状态：磁盘、内存、负载、最近失败的服务，用一段话告诉我，并给出下一步",
                                ),
                          )
                        }
                        name="status"
                      >
                        {tt("这台机器怎么了")}
                      </Chip>
                    </div>
                    {picker ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[12px] text-neutral-400">{tt("选一个程序")}</span>
                        {LEO_PROGRAMS.map((program) => (
                          <button
                            key={program.id}
                            type="button"
                            data-oceanleo-cc-leo-program={program.id}
                            className="rounded-full bg-neutral-800 px-2 py-1 text-[12px] text-neutral-100 hover:bg-neutral-700"
                            onClick={() => chooseProgram(program.id)}
                          >
                            {tt(program.label)}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="rounded-full px-2 py-1 text-[12px] text-neutral-400 hover:bg-neutral-800"
                          onClick={() => setPicker(null)}
                        >
                          {tt("取消")}
                        </button>
                      </div>
                    ) : null}
                    {watchOpen ? (
                      <WatchList running={running} watches={watches} onToggle={(id) => void toggleWatch(id)} />
                    ) : null}
                    {form === "card" ? guide : null}
                    {sendError ? <p className="text-[12px] text-rose-300">{sendError}</p> : null}
                    <form
                      className="flex gap-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void send(textInBox());
                      }}
                    >
                      <input
                        ref={draftRef}
                        name="text"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          void send(textInBox());
                        }}
                        placeholder={tt("跟 OceanLeo agent 说")}
                        data-oceanleo-cc-leo-input
                        className="min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-[13px] text-neutral-100 outline-none"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        data-oceanleo-cc-leo-send
                        onClick={() => void send(textInBox())}
                        className="rounded-lg bg-neutral-800 px-2 py-1.5 text-[12px] text-neutral-100 hover:bg-neutral-700 disabled:opacity-50"
                      >
                        {tt("发送")}
                      </button>
                    </form>
                  </div>
                </div>
                {form === "large" ? (
                  <aside className="flex w-[240px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-neutral-800 px-3 py-2 text-[12px]">
                    <section>
                      <h3 className="mb-1 text-neutral-400">{tt("记忆")}</h3>
                      <ul className="space-y-1">
                        {notes.map((note) => (
                          <li key={note.id} data-oceanleo-cc-leo-note={note.id} className="flex gap-1">
                            <span className="min-w-0 flex-1 whitespace-pre-wrap text-neutral-100">
                              {note.text}
                            </span>
                            <button
                              type="button"
                              className="shrink-0 text-neutral-400 hover:text-neutral-100"
                              onClick={() => void removeMemory(note.id)}
                            >
                              {tt("删除")}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <form
                        className="mt-1 flex gap-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void addMemory(noteDraft);
                        }}
                      >
                        <input
                          value={noteDraft}
                          onChange={(event) => setNoteDraft(event.target.value)}
                          placeholder={tt("记在这台机器上")}
                          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900 px-1 py-1 text-neutral-100"
                        />
                        <button type="submit" className="rounded bg-neutral-800 px-2 py-1">
                          {tt("添加")}
                        </button>
                      </form>
                      {noteError ? <p className="mt-1 text-rose-300">{noteError}</p> : null}
                    </section>
                    <section>
                      <h3 className="mb-1 text-neutral-400">{tt("提醒")}</h3>
                      <WatchList
                        running={running}
                        watches={watches}
                        onToggle={(id) => void toggleWatch(id)}
                      />
                    </section>
                    <section>
                      <h3 className="mb-1 text-neutral-400">{tt("引导")}</h3>
                      <div className="mb-2 flex flex-wrap gap-1">
                        {LEO_PROGRAMS.map((program) => (
                          <button
                            key={program.id}
                            type="button"
                            data-oceanleo-cc-leo-program={program.id}
                            className="rounded-full bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
                            onClick={() => setGuideProgram(program.id)}
                          >
                            {tt(program.label)}
                          </button>
                        ))}
                      </div>
                      {guide}
                    </section>
                  </aside>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Chip({
  name,
  children,
  onClick,
}: {
  name: string;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-oceanleo-cc-leo-quick={name}
      onClick={onClick}
      className="rounded-full bg-neutral-800 px-2 py-1 text-[12px] text-neutral-100 hover:bg-neutral-700"
    >
      {children}
    </button>
  );
}

function ModeBar({
  state,
  computer,
  powering,
  powerError,
  onPower,
}: {
  state: LeoState | null;
  computer: Computer | null;
  powering: boolean;
  powerError: boolean;
  onPower: () => void;
}) {
  const tt = useUI();
  if (!state) {
    return (
      <p className="border-b border-neutral-800 px-3 py-2 text-[12px] text-neutral-400">
        {tt("还没有拿到这台机器的状态。过一会儿再看。")}
      </p>
    );
  }
  const online = Boolean(state.online);
  const canStart = !online && computer?.source === "aliyun" && computer.status === "stopped";
  const showDevices = !online && computer?.source === "byo";
  const events = latestEvents(state.events);
  return (
    <div className="border-b border-neutral-800 px-3 py-2 text-[12px]">
      <p
        data-oceanleo-cc-leo-mode
        data-online={online ? "1" : "0"}
        className={online ? "text-emerald-400" : "text-amber-400"}
      >
        {online
          ? tt("本机模式 · 这台机器上干活")
          : tt("远程模式 · 机器离线，从 OceanLeo 这边帮你")}
      </p>
      <p className="mt-1 text-neutral-400">
        {state.last_seen_at
          ? tt("上次在线 {time}", { time: state.last_seen_at })
          : tt("还没有在线记录")}
      </p>
      {events.length === 0 ? (
        <p className="text-neutral-500">{tt("最近没有事件")}</p>
      ) : (
        <ul>
          {events.map((event, index) => (
            <li key={`${event.created_at}-${index}`} className="truncate text-neutral-400">
              {event.kind} {event.created_at}
            </li>
          ))}
        </ul>
      )}
      {canStart ? (
        <button
          type="button"
          data-oceanleo-cc-leo-power
          disabled={powering}
          onClick={onPower}
          className="mt-1 rounded-lg bg-neutral-800 px-2 py-1 text-neutral-100 hover:bg-neutral-700 disabled:opacity-50"
        >
          {powering ? tt("正在开机") : tt("开机")}
        </button>
      ) : null}
      {showDevices ? (
        <a href="/devices" data-oceanleo-cc-leo-devices className="mt-1 inline-block text-amber-300">
          {tt("到我的设备里看节点")}
        </a>
      ) : null}
      {powerError ? (
        <p className="mt-1 text-rose-300">{tt("没能开机。到我的设备里再试一次。")}</p>
      ) : null}
    </div>
  );
}

function WatchList({
  running,
  watches,
  onToggle,
}: {
  running: string[];
  watches: LeoWatch[];
  onToggle: (program: string) => void;
}) {
  const tt = useUI();
  if (running.length === 0) {
    return <p className="text-neutral-400">{tt("终端里现在没有在跑的程序")}</p>;
  }
  return (
    <ul className="space-y-1">
      {running.map((program) => {
        const on = watches.some(
          (watch) =>
            watch.kind === "process" && watch.program === program && watch.status === "armed",
        );
        return (
          <li key={program}>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              data-oceanleo-cc-leo-watch={program}
              onClick={() => onToggle(program)}
              className={`rounded-full px-2 py-1 ${on ? "bg-emerald-900 text-emerald-200" : "bg-neutral-800 text-neutral-100"}`}
            >
              {tt(programLabel(program))}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MessageRow({
  message,
  onRemember,
}: {
  message: AgentMessage;
  onRemember: (text: string) => void;
}) {
  const tt = useUI();
  const content = typeof message.content === "string" ? message.content : "";
  if (isToolStep(message)) {
    return (
      <p className="text-[12px] text-neutral-400">
        {tt("工具")}
        {" · "}
        {oneLine(content)}
      </p>
    );
  }
  const plain =
    message.role === "user" ||
    message.kind === "text" ||
    message.kind === "error" ||
    message.kind === "";
  if (!plain) {
    return (
      <p className="text-[12px] text-neutral-400">
        {tt("工具")}
        {" · "}
        {oneLine(content)}
      </p>
    );
  }
  const remembered = message.role === "assistant" ? rememberLines(content) : [];
  return (
    <div>
      <p
        className={`whitespace-pre-wrap break-words ${
          message.role === "user" ? "text-neutral-100" : "text-neutral-200"
        }`}
      >
        {content}
      </p>
      {remembered.map((text) => (
        <button
          key={text}
          type="button"
          data-oceanleo-cc-leo-remember
          className="mt-1 rounded-lg px-2 py-1 text-[12px] text-emerald-300 hover:bg-neutral-800"
          onClick={() => onRemember(text)}
        >
          {tt("加入记忆？")}
        </button>
      ))}
    </div>
  );
}
