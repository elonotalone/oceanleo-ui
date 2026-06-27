"use client";

// ============================================================================
// @oceanleo/ui — 功能区左栏「只有 agent」+ 操作台搬进 leo 助手浮窗（单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v9 修订（理解 A，操作员 2026-06-27）：docs/architecture/
// oceanleo-agent-only-console-and-prompt-helper.md
//
//   左栏 = 只有 agent。没有「agent / 灵感台」两页切换了——左栏自始至终是 agent
//   对话流 + 输入框（带「leo 建议」）。
//
//   原「操作台 / 灵感台」表单**搬进右下角的 leo 助手浮窗**，作为浮窗里的第二页
//   （浮窗顶部「leo 建议 | 操作台」一对切换键，共用同一个浮窗显示框）。本组件在
//   「成为当前活跃功能区」时，把自己的操作台（schema + 表单内容 + 读 state）通过
//   OpsConsoleBridge 注册给浮窗；浮窗渲染操作台页、把用户勾选整理成文本**单向**写进
//   当前 AI 输入框（= 本组件这个 LeoComposer）。
//
//   agent **只看用户发给它的消息**（输入框里的文本，含浮窗整理进来的「操作台块」），
//   不再读 opsState。agent 仍可经 ops_patch 把结构化结果回填操作台 state（让用户在
//   浮窗里继续微调），但操作台不再据此触发任何生成动作。
//
// 隔离：只持有本功能区的 agentId + schema，看不到别的功能区。
// 用法不变：把它放进 OperatorConsole 的某功能区 `ops`（左栏内容）。右栏（结果）照旧
// 由 OperatorConsole / AgentConsole 的 canvas 渲染。
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { LeoComposer } from "./LeoComposer";
import { registerOpsConsole, type OpsConsoleHandle } from "./OpsConsoleBridge";
import {
  createTask,
  followUp,
  getTask,
  latestArtifact,
  type AgentMessage,
  type ArtifactMeta,
} from "../lib/agent";
import { type OpsPatch, type OpsSchema } from "../lib/fn-agent";

export interface FunctionAgentChatProps {
  /** 本功能区 agent id（"<site_id>.<fn_id>"）。 */
  agentId: string;
  /** 本站 site_id（计量 + 历史分区）。 */
  siteId?: string;
  /** 操作台 schema（用于把已填字段整理成「字段：值」文本喂进 agent 输入框）。 */
  schema: OpsSchema;
  /** 操作台页的内容（各站现成的 StudioSection 表单，**不含生成按钮**）。 */
  opsContent: React.ReactNode;
  /** 读当前操作台 state（用于整理成 prompt 文本同步进 agent 输入框）。 */
  getOpsState: () => Record<string, unknown>;
  /** 把 agent 产出的补丁应用到真实操作台 state（agent 仍可回填，让用户继续微调）。 */
  onApplyPatch: (patch: OpsPatch) => void;
  /**
   * agent 产出「分屏产物」(artifact，如生成的图片 / 文档) 时回报给宿主，让右侧结果
   * 画布把它显示出来。 */
  onArtifact?: (artifact: ArtifactMeta, content: string) => void;
  /** 触发某操作台动作（保留向后兼容；操作台已无主行动按钮，通常不再使用）。 */
  onRunAction?: (actionId: string) => void;
  /** 文本模型复合 key（来自 ModelPicker）。 */
  agentModel?: string;
  accent?: string;
  /** 操作台页标签，默认「操作台」。 */
  opsLabel?: string;
  /**
   * @deprecated 理解 A：左栏不再有页切换，本 prop 不再控制左栏。保留仅为向后兼容。
   */
  defaultTab?: "agent" | "ops";
  /** 不含操作台表单（纯对话型功能区）时传 false，浮窗不出现「操作台」页。 */
  showOps?: boolean;
  /**
   * 该功能区所属 app 的展示名（如「LeoImage」）。给了它，agent 页会在顶部显示
   * 「所属 app」的小标签，让用户知道当前 agent 隶属于哪个 app。 */
  appLabel?: string;
  /** app 图标（emoji / 单字），与 appLabel 一起展示。 */
  appIcon?: string;
}

export function FunctionAgentChat({
  agentId,
  siteId = "",
  schema,
  opsContent,
  getOpsState,
  onApplyPatch,
  onArtifact,
  onRunAction,
  agentModel = "",
  accent = "#4f46e5",
  opsLabel = "操作台",
  defaultTab: _defaultTab,
  showOps = true,
  appLabel,
  appIcon,
}: FunctionAgentChatProps) {
  void _defaultTab;
  const [taskId, setTaskId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const appliedRef = useRef<Set<number>>(new Set());
  const reportedArtifactRef = useRef<string>("");

  // 结果/输出字段：不进操作台 prompt 文本。
  const excludeKeys = useMemo(
    () => schema.fields.filter((f) => f.key.endsWith("result") || f.label.includes("结果")).map((f) => f.key),
    [schema],
  );

  // ── 把操作台注册给 leo 助手浮窗（理解 A）─────────────────────────────────
  // mount 时注册一次拿到 handle，unmount 注销；每次 render（父层操作台 state 变化）
  // 通过 handle.update 原地把最新内容/state/rev 推给浮窗——不 unregister/re-register，
  // 避免「操作台」tab 抖动消失。getOpsState 是闭包，总能读到最新 state。
  const revRef = useRef(0);
  const handleRef = useRef<OpsConsoleHandle | null>(null);
  useEffect(() => {
    if (!showOps) return;
    revRef.current += 1;
    handleRef.current = registerOpsConsole({
      id: agentId,
      schema,
      content: opsContent,
      getState: getOpsState,
      excludeKeys,
      accent,
      label: opsLabel,
      appLabel,
      rev: revRef.current,
    });
    return () => {
      handleRef.current?.unregister();
      handleRef.current = null;
    };
    // 仅按 agentId/showOps 决定注册生命周期；内容更新走下面的 update effect。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, showOps]);

  // 每次 render 把最新内容/state 推给浮窗（rev 递增触发浮窗重算同步文本）。
  useEffect(() => {
    if (!showOps || !handleRef.current) return;
    revRef.current += 1;
    handleRef.current.update({
      schema,
      content: opsContent,
      getState: getOpsState,
      excludeKeys,
      accent,
      label: opsLabel,
      appLabel,
      rev: revRef.current,
    });
  });

  const refresh = useCallback(async (id: string) => {
    const r = await getTask(id);
    if (r.ok && r.data) {
      setMessages(r.data.messages || []);
      setStatus(r.data.task?.status || "");
      return r.data.task?.status || "";
    }
    return "";
  }, []);

  // poll agent thread while running
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

  // Apply any NEW ops_patch the agent produced → real 操作台 state（回填，供用户微调）。
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

  // 把 agent 线程里最新的 artifact（图片/文档）回报给宿主 → 右侧结果画布显示。
  useEffect(() => {
    if (!onArtifact) return;
    const a = latestArtifact(messages);
    if (!a) return;
    const sig = `${a.meta.type}:${a.meta.url || ""}:${a.content.slice(0, 64)}`;
    if (reportedArtifactRef.current === sig) return;
    reportedArtifactRef.current = sig;
    onArtifact(a.meta, a.content);
  }, [messages, onArtifact]);

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
        // 宗旨 v9：agent 只看用户发给它的消息（输入框文本含操作台块），不再带 opsState。
      });
      setBusy(false);
      if (!r.ok || !r.data) {
        setError(r.status === 401 ? "登录后即可使用 agent。" : r.error || "创建失败");
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

  const running = status === "running" || busy;

  return (
    <div className="flex h-full flex-col">
      {appLabel && (
        <div className="mb-2 flex shrink-0 items-center gap-1.5 text-[12px] text-stone-400">
          <span>所属 app</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-600">
            {appIcon && <span className="text-[13px] leading-none">{appIcon}</span>}
            {appLabel}
          </span>
        </div>
      )}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && !running && (
          <p className="py-8 text-center text-sm text-stone-400">
            让「{schema.title}」agent 帮你做事，
            <br />
            它会为你生成结果。
            {showOps && (
              <>
                <br />
                <span className="text-[12px] text-stone-300">
                  不知怎么描述？点输入框的「leo 建议」，在「{opsLabel}」页勾几个选项，需求自动整理好。
                </span>
              </>
            )}
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
      <div className="shrink-0 space-y-2 pt-3">
        <LeoComposer
          value={input}
          onChange={setInput}
          onSubmit={send}
          loading={busy}
          leoSuggest
          leoQuickSuggest={{ siteId: siteId || schema.agentId.split(".")[0] }}
          placeholder={`让 agent 帮你做「${schema.title}」…`}
          rows={1}
        />
      </div>
    </div>
  );
}

function Bubble({ m, accent }: { m: AgentMessage; accent: string }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md px-3.5 py-2 text-[13px] text-white"
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
      {notice && <p className="px-1 text-[12px] text-emerald-600">✓ {notice}</p>}
    </div>
  );
}
