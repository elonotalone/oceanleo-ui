"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Computer } from "../../../lib/cloud-computer-api";
import { bindComputerTaskSession, getComputerTaskTranscript, type ComputerTaskSession } from "../../../lib/computer-task-api";
import { useUI } from "../../../i18n/ui/useUI";
import { ArchivedAttachmentLink } from "../agent-dialog/ArchivedAttachment";
import { AcpCard } from "../agent-dialog/AcpCard";
import { applyDialog, initialDialogState } from "../agent-dialog/reduce";
import { AgentText } from "../agent-dialog/text";
import { CliCard } from "../terminal-card/CliCard";
import { TerminalCard } from "../terminal-card/TerminalCard";

export type ComputerSessionViewProps = {
  computer: Computer;
  session: ComputerTaskSession;
  active?: boolean;
  settingsOpen: boolean;
  onSettingsContent: (content: ReactNode | null) => void;
  onNativeSessionChange?: (id: string) => void;
};

type Archive = Awaited<ReturnType<typeof getComputerTaskTranscript>>;

/** The managed binding is the identity. Native identity updates must never remount this view. */
export function ComputerSessionView({ computer, session, active = true, settingsOpen, onSettingsContent, onNativeSessionChange }: ComputerSessionViewProps) {
  const tt = useUI();
  const [started, setStarted] = useState(active);
  useEffect(() => { if (active) setStarted(true); }, [active]);
  const [archive, setArchive] = useState<Archive | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const binding = useRef(session.native_session_id);
  const bindingPromise = useRef<Promise<void> | null>(null);
  const bindNative = useCallback(async (id: string) => {
    if (bindingPromise.current) await bindingPromise.current;
    if (binding.current === id) return;
    const pending = bindComputerTaskSession(session.id, id).then(() => {
      binding.current = id;
      onNativeSessionChange?.(id);
    });
    bindingPromise.current = pending;
    try { await pending; } finally { if (bindingPromise.current === pending) bindingPromise.current = null; }
  }, [session.id, onNativeSessionChange]);

  useEffect(() => {
    if (session.kind !== "acp" || !active) return;
    const controller = new AbortController();
    const refresh = () => {
      void getComputerTaskTranscript(session.id, { signal: controller.signal }).then((next) => {
        setArchive(next); setError("");
      }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : tt("云端记录读取失败")); });
    };
    refresh();
    const timer = computer.node_online ? setInterval(refresh, 15_000) : undefined;
    return () => { controller.abort(); clearInterval(timer); };
  }, [session.id, session.kind, active, computer.node_online]);

  const messages = useMemo(() => (archive?.frames ?? []).reduce<ReturnType<typeof initialDialogState>>((state, frame) => applyDialog(state, { type: "frame", frame }), { ...initialDialogState(), program: session.program, activeSession: archive?.session.native_session_id ?? session.native_session_id ?? "" }).messages, [archive?.frames, archive?.session.native_session_id, session.program, session.native_session_id]);
  async function loadOlder() {
    if (!archive?.has_older || archive.next_before == null || loading) return;
    setLoading(true);
    try {
      const older = await getComputerTaskTranscript(session.id, { before: archive.next_before });
      setArchive((current) => current ? { ...current, frames: [...older.frames, ...current.frames], has_older: older.has_older, next_before: older.next_before } : older);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : tt("云端记录读取失败")); }
    finally { setLoading(false); }
  }
  const online = computer.node_online === true;
  const common = { computer, active, embedded: true, settingsOpen, onSettingsContent, initialSessionId: session.native_session_id ?? undefined };
  return <section className="flex h-full min-h-0 flex-col" data-computer-session={session.id}>
    <p className="shrink-0 px-3 py-1 text-xs" role="status" data-computer-archive-status={error ? "error" : archive?.sync_status ?? session.sync_status}>
      {error || (session.kind === "acp" ? (archive?.sync_status === "saved" ? tt("对话已保存在云端") : archive?.sync_status === "error" ? tt("云端保存失败") : tt("云端记录正在同步")) : tt("终端按键不保存为任务对话；仅保留会话关联。"))}
      {!online ? ` · ${tt("电脑离线；查看已保存的记录")}` : ""}
    </p>
    {started && (session.kind === "acp" ? <>
      <div className={online ? "min-h-0 flex-1" : "hidden"}>
        <AcpCard {...common} taskSessionId={session.id} initialProgram={session.program ?? "oceanleo"}
          onNativeSessionChange={onNativeSessionChange} />
      </div>
      {!online ? <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" data-computer-saved-transcript="">
        {archive?.has_older ? <button type="button" disabled={loading} onClick={() => void loadOlder()}>{loading ? tt("正在读取…") : tt("读取更早的对话")}</button> : null}
        {!archive && !error ? <p>{tt("正在读取云端记录…")}</p> : null}
        {archive && !messages.length ? <p>{tt("还没有保存的对话")}</p> : null}
        {messages.map((message) => message.kind === "user" ? <article key={message.id} data-role="user"><p className="text-xs">{tt("你")}</p><AgentText text={message.text} />{message.attachments?.map((attachment, index) => <p key={index}><ArchivedAttachmentLink attachment={attachment} /></p>)}</article> : message.kind === "turn" ? <article key={message.id} data-role="assistant">{message.items.map((item) => item.kind === "assistant" ? <AgentText key={item.id} text={item.text} /> : item.kind === "tool" ? <p key={item.id}>{item.tool.title} · {item.tool.status}</p> : null)}</article> : null)}
      </div> : null}
    </> : session.kind === "cli" ? <CliCard {...common} initialProgram={session.program ?? "oceanleo"} onNativeSessionChange={bindNative} /> : <TerminalCard {...common} onNativeSessionChange={bindNative} />)}
  </section>;
}
