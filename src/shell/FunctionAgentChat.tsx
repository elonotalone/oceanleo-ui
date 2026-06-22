"use client";

// ============================================================================
// @oceanleo/ui — 功能区「操作台 / agent」双形态左栏（单一事实源）
// ----------------------------------------------------------------------------
// Doctrine v3: docs/architecture/oceanleo-function-agent-and-app-shell.md
//   一个功能区 = 一个操作台 = 一个 agent.
//
// 这是每个功能区左栏的统一容器：顶部一排「操作台 / agent」切换，下面：
//   - 操作台 tab：固定模板操控（各站传进来的 <StudioSection> 表单 + 主按钮）。
//   - agent  tab：对话流（绑定本功能区 agent_id）。agent 产出 OpsPatch → 经
//                 onApplyPatch 落到真实操作台 state；右栏随之重渲染。隔离：只持
//                 有本功能区的 agentId + schema，看不到别的功能区。
//
// 用法：把它放进 OperatorConsole 的 `ops`（左栏内容）。右栏（结果）照旧由
// OperatorConsole 的 canvas 渲染——agent 和操作台共用同一个右栏。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { LeoComposer } from "./LeoComposer";
import { useLeftPaneSlot } from "./SplitWorkspace";
import {
  createTask,
  followUp,
  getTask,
  type AgentMessage,
} from "../lib/agent";
import type { OpsPatch, OpsSchema } from "../lib/fn-agent";

export interface FunctionAgentChatProps {
  /** 本功能区 agent id（"<site_id>.<fn_id>"）。 */
  agentId: string;
  /** 本站 site_id（计量 + 历史分区）。 */
  siteId?: string;
  /** 操作台 schema（agent 据此读写字段）。 */
  schema: OpsSchema;
  /** 操作台 tab 的内容（各站现成的 StudioSection 表单 + 主按钮）。 */
  opsContent: React.ReactNode;
  /** 读当前操作台 state（精简快照，给 agent 当上下文）。 */
  getOpsState: () => Record<string, unknown>;
  /** 把 agent 产出的补丁应用到真实操作台 state。 */
  onApplyPatch: (patch: OpsPatch) => void;
  /** 触发某操作台动作（如 generate / export-pdf）。run=frontend 时各站自己执行。 */
  onRunAction?: (actionId: string) => void;
  /** 文本模型复合 key（来自 ModelPicker）。 */
  agentModel?: string;
  accent?: string;
  /** 操作台 tab 标签，默认「操作台」。 */
  opsLabel?: string;
  /** 默认显示哪个 tab，默认 "ops"。 */
  defaultTab?: "ops" | "agent";
}

export function FunctionAgentChat({
  agentId,
  siteId = "",
  schema,
  opsContent,
  getOpsState,
  onApplyPatch,
  onRunAction,
  agentModel = "",
  accent = "#4f46e5",
  opsLabel = "操作台",
  defaultTab = "ops",
}: FunctionAgentChatProps) {
  const [tab, setTab] = useState<"ops" | "agent">(defaultTab);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const appliedRef = useRef<Set<number>>(new Set());

  // doctrine v3（2026-06-21）：把「操作台 | agent」开关装到**左栏标题位置**
  // （SplitWorkspace 的左栏 PaneHeader），不再在栏体内放一个会与「操作台」标题
  // 文字重复的 pill。若不在 SplitWorkspace 内（slot 为 null），回退到栏体内嵌。
  const slot = useLeftPaneSlot();
  const toggle = (
    <div className="inline-flex rounded-lg bg-stone-100 p-0.5 text-[13px]">
      {(["ops", "agent"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTab(t)}
          className={`rounded-md px-3 py-1 font-medium transition-colors ${
            tab === t ? "text-white" : "text-stone-500 hover:text-stone-700"
          }`}
          style={tab === t ? { background: accent } : undefined}
        >
          {t === "ops" ? opsLabel : "app"}
        </button>
      ))}
    </div>
  );
  // 安装/更新左栏标题开关（toggle 节点选中态随 tab 变化）。卸载时清空，避免离开
  // 该功能区后残留旧开关。中间更新不置 null（不闪烁）。
  useEffect(() => {
    slot?.setLeftLabel(toggle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, tab, accent, opsLabel]);
  useEffect(() => {
    return () => slot?.setLeftLabel(null);
  }, [slot]);

  const refresh = useCallback(async (id: string) => {
    const r = await getTask(id);
    if (r.ok && r.data) {
      setMessages(r.data.messages || []);
      setStatus(r.data.task?.status || "");
      return r.data.task?.status || "";
    }
    return "";
  }, []);

  // poll while running
  useEffect(() => {
    if (!taskId) return;
    if (status && status !== "running") return;
    const t = setInterval(async () => {
      const s = await refresh(taskId);
      if (s && s !== "running") clearInterval(t);
    }, 1500);
    return () => clearInterval(t);
  }, [taskId, status, refresh]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Apply any NEW ops_patch the agent produced → real operator-console state.
  useEffect(() => {
    for (const m of messages) {
      const p = m.meta?.ops_patch;
      if (p && m.id >= 0 && !appliedRef.current.has(m.id)) {
        appliedRef.current.add(m.id);
        onApplyPatch(p);
        if (p.triggerAction && onRunAction) onRunAction(p.triggerAction);
      }
    }
  }, [messages, onApplyPatch, onRunAction]);

  async function send() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { id: Date.now(), role: "user", kind: "text", content: prompt }]);
    if (!taskId) {
      setBusy(true);
      const r = await createTask({
        prompt,
        mode: "agent",
        siteId,
        agentId,
        agentModel,
        opsState: snapshot(),
      });
      setBusy(false);
      if (!r.ok || !r.data) {
        setError(r.status === 401 ? "登录后即可使用 app。" : r.error || "创建失败");
        return;
      }
      setTaskId(r.data.task_id);
      setStatus("running");
      void refresh(r.data.task_id);
      return;
    }
    setBusy(true);
    const r = await followUp(taskId, prompt);
    setBusy(false);
    if (r.ok) setStatus("running");
    else setError(r.error || "发送失败");
  }

  function snapshot(): Record<string, unknown> {
    try {
      return getOpsState() || {};
    } catch {
      return {};
    }
  }

  const running = status === "running" || busy;

  return (
    <div className="flex h-full flex-col">
      {/* 回退：只有当不在 SplitWorkspace 内（无左栏标题插槽）时，才在栏体内放开关。 */}
      {!slot && <div className="mb-3 shrink-0 self-start">{toggle}</div>}

      {tab === "ops" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{opsContent}</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 && !running && (
              <p className="py-8 text-center text-sm text-stone-400">
                跟「{schema.title}」app 说说你想要什么，
                <br />它会帮你填好左侧操作台并生成结果。
              </p>
            )}
            {messages.map((m) => (
              <Bubble key={m.id} m={m} accent={accent} />
            ))}
            {running && (
              <div className="flex items-center gap-2 text-[13px] text-stone-400">
                <span className="v-spinner" /> agent 正在处理…
              </div>
            )}
            {error && <p className="text-[13px] text-rose-500">{error}</p>}
          </div>
          <div className="shrink-0 pt-3">
            <LeoComposer
              value={input}
              onChange={setInput}
              onSubmit={send}
              loading={busy}
              leoSuggest
              placeholder={`让 agent 帮你做「${schema.title}」…`}
              rows={1}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ m, accent }: { m: AgentMessage; accent: string }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[88%] rounded-2xl rounded-br-md px-3.5 py-2 text-[13px] text-white"
          style={{ background: accent }}
        >
          {m.content}
        </div>
      </div>
    );
  }
  if (m.kind === "plan") {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50/70 px-3.5 py-2.5 text-[13px]">
        <Markdown>{m.content}</Markdown>
      </div>
    );
  }
  if (m.kind === "step") {
    return <div className="px-1 text-[12px] font-medium text-stone-500">{m.content}</div>;
  }
  if (m.kind === "error") {
    return <div className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-600">{m.content}</div>;
  }
  const notice = m.meta?.ops_patch?.notice;
  return (
    <div className="max-w-[94%] space-y-1.5">
      <div className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-[13px] shadow-sm ring-1 ring-stone-100">
        <Markdown>{m.content}</Markdown>
      </div>
      {notice && (
        <p className="px-1 text-[12px] text-emerald-600">✓ {notice}</p>
      )}
    </div>
  );
}
