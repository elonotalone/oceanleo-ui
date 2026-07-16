"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTask,
  followUp,
  getTask,
  stopTask,
  type AgentMessage,
} from "../lib/agent";
import { useUI } from "../i18n/ui/useUI";
import { LeoComposer } from "./LeoComposer";
import { Markdown } from "./Markdown";
import type { LibraryItem } from "./library-data";
import { useAdvancedSession } from "./advanced-session-context";
import { useAttachments } from "./useAttachments";

export interface AdvancedAgentPanelProps {
  item: LibraryItem;
  taskId?: string | null;
  siteId?: string;
  accent?: string;
}

function visibleMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.filter(
    (message) =>
      Boolean(message.content?.trim()) &&
      !["plan", "step", "ui_action"].includes(message.kind),
  );
}

/** Compact thread view used inside the advanced workbench.
 * It reads and follows up the exact same task rather than creating a second chat.
 */
export function AdvancedAgentPanel({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
}: AdvancedAgentPanelProps) {
  const tt = useUI();
  const [activeTaskId, setActiveTaskId] = useState(taskId || "");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [startingNew, setStartingNew] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const advancedSession = useAdvancedSession();
  const atts = useAttachments(siteId || item.siteId || "oceanleo", setError);
  const sessionTaskId = advancedSession
    ? advancedSession.taskId || ""
    : taskId || "";

  useEffect(() => {
    setActiveTaskId(sessionTaskId);
    if (!sessionTaskId) {
      setMessages([]);
      setStatus("");
    }
  }, [sessionTaskId]);

  const refresh = useCallback(async (id: string) => {
    const result = await getTask(id);
    if (!result.ok || !result.data) {
      setError(result.error || tt("读取 Agent 历史失败"));
      return "";
    }
    setMessages(result.data.messages || []);
    const next = result.data.task?.status || "";
    setStatus(next);
    return next;
  }, [tt]);

  useEffect(() => {
    if (!activeTaskId) return;
    void refresh(activeTaskId);
  }, [activeTaskId, refresh]);

  useEffect(() => {
    if (!activeTaskId || (status && status !== "running")) return;
    const timer = window.setInterval(() => void refresh(activeTaskId), 1200);
    return () => window.clearInterval(timer);
  }, [activeTaskId, refresh, status]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, status]);

  async function send(cleanValue?: string) {
    const prompt = (cleanValue ?? input).trim();
    const uploaded = atts.ready();
    if (
      (!prompt && uploaded.length === 0) ||
      busy ||
      status === "running" ||
      atts.uploading
    ) {
      return;
    }
    const submittedAttachments = atts.attachments;
    setInput("");
    atts.clear();
    setBusy(true);
    setError("");
    const assetUrl = item.url || item.previewUrl || "";
    const visiblePrompt =
      prompt || tt("已上传 {count} 个文件", { count: uploaded.length });
    const hiddenContext = [
      `当前正在高级工作台处理「${item.title}」（${item.kind}，素材 ID：${item.id}）。`,
      assetUrl ? "当前素材已作为附件发送，请直接读取附件内容后处理。" : "",
      prompt ? "" : "用户本轮只上传了文件，请读取并处理附件。",
    ]
      .filter(Boolean)
      .join("\n");
    const attachments = [
      ...(assetUrl
        ? [
            {
              url: assetUrl,
              mime: String(item.meta.mime || ""),
              name: item.title,
              media_type: item.kind,
            },
          ]
        : []),
      ...uploaded,
    ];
    const restoreSubmission = () => {
      setInput((current) => (current ? current : prompt));
      atts.restoreReady(submittedAttachments);
    };
    const session = await advancedSession?.ensure(activeTaskId || null);
    if (advancedSession && !session) {
      setError(tt("无法创建工作会话，请稍后重试。"));
      restoreSubmission();
      setBusy(false);
      return;
    }
    if (activeTaskId) {
      const optimistic: AgentMessage = {
        id: Date.now(),
        role: "user",
        kind: "text",
        content: visiblePrompt,
      };
      setMessages((current) => [...current, optimistic]);
      const result = await followUp(
        activeTaskId,
        visiblePrompt,
        attachments.length ? attachments : undefined,
        hiddenContext,
      );
      if (result.ok) {
        setStatus("running");
        void refresh(activeTaskId);
      } else {
        setMessages((current) =>
          current.filter((message) => message.id !== optimistic.id),
        );
        setError(result.error || tt("发送失败"));
        restoreSubmission();
      }
      setBusy(false);
      return;
    }

    const result = await createTask({
      prompt: visiblePrompt,
      hiddenContext,
      mode: "agent",
      siteId,
      attachments: attachments.length ? attachments : undefined,
      sessionId: session?.id,
    });
    if (
      result.ok &&
      result.data?.task_id &&
      (!session || result.data.session_id === session.id)
    ) {
      const nextTaskId = result.data.task_id;
      setActiveTaskId(nextTaskId);
      setStatus("running");
      setMessages([
        {
          id: Date.now(),
          role: "user",
          kind: "text",
          content: visiblePrompt,
        },
      ]);
      await advancedSession?.ensure(nextTaskId);
    } else {
      setError(
        result.ok && session
          ? tt("任务未绑定到当前工作会话，请重试。")
          : result.error || tt("创建任务失败"),
      );
      restoreSubmission();
    }
    setBusy(false);
  }

  async function stop() {
    if (!activeTaskId || busy || status !== "running") return;
    setBusy(true);
    setError("");
    const result = await stopTask(activeTaskId);
    if (result.ok) {
      setStatus(result.data?.status || "cancelled");
      await refresh(activeTaskId);
    } else {
      setError(result.error || tt("停止失败"));
    }
    setBusy(false);
  }

  async function newConversation() {
    if (busy || startingNew || !advancedSession) return;
    setStartingNew(true);
    setError("");
    const next = await advancedSession.startNew();
    if (next) {
      setActiveTaskId("");
      setMessages([]);
      setStatus("");
      setInput("");
      atts.clear();
    } else {
      setError(tt("新建对话失败，当前内容仍已保留。"));
    }
    setStartingNew(false);
  }

  const rendered = visibleMessages(messages);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--divider,#e7e5e4)] px-3 py-2">
        <span className="text-[11px] text-[var(--muted,#78716c)]">{tt("当前素材对话")}</span>
        <button
          type="button"
          disabled={busy || startingNew || !advancedSession}
          onClick={() => void newConversation()}
          className="rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 py-1 text-[11px] font-medium text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,rgba(0,0,0,0.05))] disabled:opacity-40"
        >
          {startingNew ? tt("保存中…") : tt("新建对话")}
        </button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {rendered.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border,#e7e5e4)] bg-[var(--surface,#fafaf9)] p-3 text-[12px] leading-relaxed text-[var(--fg-2,#57534e)]">
            {tt("让 Agent 分析、改写或继续处理当前内容。这里复用操控台的同一条聊天历史。")}
          </div>
        )}
        {rendered.map((message) => (
          <div
            key={message.id}
            className={`rounded-xl px-3 py-2.5 text-[12px] leading-relaxed ${
              message.role === "user"
                ? "ml-5 text-white"
                : "mr-2 border border-[var(--border,#e7e5e4)] bg-[var(--card,#ffffff)] text-[var(--fg,#292524)]"
            }`}
            style={message.role === "user" ? { background: accent } : undefined}
          >
            {message.role === "assistant" ? (
              <Markdown>{message.content}</Markdown>
            ) : (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
          </div>
        ))}
        {(busy || status === "running") && (
          <div className="flex items-center gap-2 px-1 text-[11px] text-[var(--muted,#78716c)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: accent }} />
            {tt("Agent 正在处理当前内容…")}
          </div>
        )}
        {error && <p className="text-[11px] text-rose-600">{error}</p>}
      </div>
      <div className="shrink-0 border-t border-[var(--border,#e7e5e4)] p-3">
        <LeoComposer
          value={input}
          onChange={setInput}
          onSubmit={(cleanValue) => void send(cleanValue)}
          loading={busy || status === "running"}
          onStop={status === "running" ? () => void stop() : undefined}
          disabled={startingNew}
          leoSuggest
          rows={2}
          maxHeight={180}
          accentColor={accent}
          placeholder={tt("告诉 Agent 要怎样处理当前内容…")}
          onAttachFiles={atts.handleAttachFiles}
          attachments={atts.composerAttachments}
          onRemoveAttachment={atts.removeAttachment}
          onVoiceTranscript={(text) =>
            setInput((current) =>
              `${current}${current && !/\s$/.test(current) ? " " : ""}${text}`,
            )
          }
        />
      </div>
    </div>
  );
}
