"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTask,
  followUp,
  getTask,
  type AgentMessage,
} from "../lib/agent";
import { useUI } from "../i18n/ui/useUI";
import { Markdown } from "./Markdown";
import type { LibraryItem } from "./library-data";

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
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveTaskId(taskId || "");
    if (!taskId) {
      setMessages([]);
      setStatus("");
    }
  }, [taskId]);

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

  async function send() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput("");
    setBusy(true);
    setError("");
    const context = `当前正在高级工作台处理「${item.title}」（${item.kind}）。\n${prompt}`;
    if (activeTaskId) {
      const optimistic: AgentMessage = {
        id: Date.now(),
        role: "user",
        kind: "text",
        content: prompt,
      };
      setMessages((current) => [...current, optimistic]);
      const result = await followUp(activeTaskId, context);
      if (result.ok) {
        setStatus("running");
        void refresh(activeTaskId);
      } else {
        setMessages((current) =>
          current.filter((message) => message.id !== optimistic.id),
        );
        setError(result.error || tt("发送失败"));
      }
      setBusy(false);
      return;
    }

    const result = await createTask({
      prompt: context,
      mode: "agent",
      siteId,
    });
    if (result.ok && result.data?.task_id) {
      setActiveTaskId(result.data.task_id);
      setStatus("running");
      setMessages([
        { id: Date.now(), role: "user", kind: "text", content: prompt },
      ]);
    } else {
      setError(result.error || tt("创建任务失败"));
      setInput(prompt);
    }
    setBusy(false);
  }

  const rendered = visibleMessages(messages);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {rendered.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-3 text-[12px] leading-relaxed text-stone-500">
            {tt("让 Agent 分析、改写或继续处理当前内容。这里复用操控台的同一条聊天历史。")}
          </div>
        )}
        {rendered.map((message) => (
          <div
            key={message.id}
            className={`rounded-xl px-3 py-2.5 text-[12px] leading-relaxed ${
              message.role === "user"
                ? "ml-5 text-white"
                : "mr-2 border border-stone-200 bg-white text-stone-700"
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
          <div className="flex items-center gap-2 px-1 text-[11px] text-stone-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: accent }} />
            {tt("Agent 正在处理当前内容…")}
          </div>
        )}
        {error && <p className="text-[11px] text-rose-600">{error}</p>}
      </div>
      <div className="shrink-0 border-t border-stone-200 p-3">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          rows={3}
          placeholder={tt("告诉 Agent 要怎样处理当前内容…")}
          className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px] outline-none transition focus:border-stone-400"
        />
        <button
          type="button"
          disabled={!input.trim() || busy}
          onClick={() => void send()}
          className="mt-2 w-full rounded-xl px-3 py-2 text-[12px] font-semibold text-white transition disabled:opacity-40"
          style={{ background: accent }}
        >
          {tt("发送")}
        </button>
      </div>
    </div>
  );
}
