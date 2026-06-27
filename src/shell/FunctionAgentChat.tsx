"use client";

// ============================================================================
// @oceanleo/ui — 功能区左栏「agent / 灵感台」统一显示框（单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v9（2026-06-27，操作员）：彻底删除 skill 形态，左栏只保留 agent；把原「操作台」
// 降级为一个**纯 prompt 提示器「灵感台」**。docs/architecture/
// oceanleo-agent-only-console-and-prompt-helper.md
//
//   左栏 = 一个统一显示框，顶部一对切换键在两页之间翻页：
//     - agent  ：唯一能生成的智能体。对话流（绑定本功能区 agent_id）+ 输入框
//                （带「leo 建议」）。agent **只看用户发给它的消息**，不再读 opsState。
//     - 灵感台 ：帮用户整理思路的 prompt 提示器（原操作台表单，**无生成按钮**）。
//                用户勾选/输入的内容自动整理成「字段：值」文本，**单向**同步进 agent
//                输入框的「灵感台块」（哨兵包裹，整块替换/追加/移除）。
//
// agent 仍可经 ops_patch 把结构化结果回填灵感台（让用户继续微调），但灵感台不再
// 据此触发任何生成动作。skill thread / SkillPromptPanel 内联入口整套删除。
//
// 隔离：只持有本功能区的 agentId + schema，看不到别的功能区。
// 用法：把它放进 OperatorConsole 的 `ops`（左栏内容）。右栏（结果）照旧由
// OperatorConsole 的 canvas 渲染——两页共用同一个右栏。
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { LeoComposer } from "./LeoComposer";
import { useLeftPaneSlot } from "./SplitWorkspace";
import {
  createTask,
  followUp,
  getTask,
  latestArtifact,
  type AgentMessage,
  type ArtifactMeta,
} from "../lib/agent";
import {
  mergeOpsBlock,
  opsStateToPromptText,
  type OpsPatch,
  type OpsSchema,
} from "../lib/fn-agent";

export interface FunctionAgentChatProps {
  /** 本功能区 agent id（"<site_id>.<fn_id>"）。 */
  agentId: string;
  /** 本站 site_id（计量 + 历史分区）。 */
  siteId?: string;
  /** 灵感台 schema（用于把已填字段整理成「字段：值」文本喂进 agent 输入框）。 */
  schema: OpsSchema;
  /** 灵感台页的内容（各站现成的 StudioSection 表单，**不含生成按钮**）。 */
  opsContent: React.ReactNode;
  /** 读当前灵感台 state（用于整理成 prompt 文本同步进 agent 输入框）。 */
  getOpsState: () => Record<string, unknown>;
  /** 把 agent 产出的补丁应用到真实灵感台 state（agent 仍可回填，让用户继续微调）。 */
  onApplyPatch: (patch: OpsPatch) => void;
  /**
   * agent 产出「分屏产物」(artifact，如生成的图片 / 文档) 时回报给宿主，让右侧结果
   * 画布把它显示出来。 */
  onArtifact?: (artifact: ArtifactMeta, content: string) => void;
  /** 触发某灵感台动作（保留向后兼容；灵感台已无主行动按钮，通常不再使用）。 */
  onRunAction?: (actionId: string) => void;
  /** 文本模型复合 key（来自 ModelPicker）。 */
  agentModel?: string;
  accent?: string;
  /** 灵感台页标签，默认「灵感台」。 */
  opsLabel?: string;
  /** 默认显示哪一页，默认 "agent"（主推 agent）。 */
  defaultTab?: FnTab;
  /** 不含灵感台表单（纯对话型功能区）时传 false，隐藏「灵感台」切换页。 */
  showOps?: boolean;
  /**
   * 该功能区所属 app 的展示名（如「LeoImage」）。给了它，agent 页会在顶部显示
   * 「所属 app」的小标签，让用户知道当前 agent 隶属于哪个 app。 */
  appLabel?: string;
  /** app 图标（emoji / 单字），与 appLabel 一起展示。 */
  appIcon?: string;
}

// 左栏两页：agent（唯一能生成）/ ops（灵感台，prompt 提示器）。
type FnTab = "agent" | "ops";

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
  opsLabel = "灵感台",
  defaultTab = "agent",
  showOps = true,
  appLabel,
  appIcon,
}: FunctionAgentChatProps) {
  const [tab, setTab] = useState<FnTab>(showOps ? defaultTab : "agent");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const appliedRef = useRef<Set<number>>(new Set());
  const reportedArtifactRef = useRef<string>("");

  const slot = useLeftPaneSlot();
  // 结果/输出字段：不进灵感台 prompt 文本。
  const outputKeys = useMemo(
    () => schema.fields.filter((f) => f.key.endsWith("result") || f.label.includes("结果")).map((f) => f.key),
    [schema],
  );

  // ── 灵感台 → agent 输入框 的单向传递 ─────────────────────────────────────
  // 每次灵感台 state 变化（在灵感台页操作）→ 把已填字段整理成文本块，合并进输入框。
  const syncOpsToInput = useCallback(() => {
    if (!showOps) return;
    const state = (() => {
      try {
        return getOpsState() || {};
      } catch {
        return {};
      }
    })();
    const body = opsStateToPromptText(schema, state, outputKeys);
    setInput((cur) => mergeOpsBlock(cur, body));
  }, [showOps, getOpsState, schema, outputKeys]);

  // 左栏标题位的「agent | 灵感台」切换。不在 SplitWorkspace 内时回退到栏体内嵌。
  const TAB_LABEL: Record<FnTab, string> = { agent: "agent", ops: opsLabel };
  const tabs: FnTab[] = showOps ? ["agent", "ops"] : ["agent"];
  const toggle = (
    <div className="inline-flex rounded-lg bg-stone-100 p-0.5 text-[13px]">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => {
            // 离开灵感台时，把最新选择整理进输入框（保证回到 agent 页就能看到）。
            if (tab === "ops" && t === "agent") syncOpsToInput();
            setTab(t);
          }}
          title={
            t === "agent"
              ? "和 agent 对话——它能帮你生成结果"
              : "灵感台：整理思路的 prompt 提示器，勾选项会自动整理进 agent 输入框"
          }
          className={`rounded-md px-3 py-1 font-medium transition-colors ${
            tab === t ? "text-white" : "text-stone-500 hover:text-stone-700"
          }`}
          style={tab === t ? { background: accent } : undefined}
        >
          {TAB_LABEL[t]}
        </button>
      ))}
    </div>
  );
  useEffect(() => {
    slot?.setLeftLabel(toggle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, tab, accent, opsLabel, showOps]);
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

  // Apply any NEW ops_patch the agent produced → real 灵感台 state（回填，供用户微调）。
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
        // 宗旨 v9：agent 只看用户发给它的消息（输入框文本含灵感台块），不再带 opsState。
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
      {/* 回退：不在 SplitWorkspace 内（无左栏标题插槽）时，才在栏体内放切换键。 */}
      {!slot && <div className="mb-3 shrink-0 self-start">{toggle}</div>}

      {tab === "ops" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="mb-3 rounded-xl border border-stone-200 bg-stone-50/70 px-3 py-2 text-[12px] leading-relaxed text-stone-500">
            灵感台帮你整理思路：勾选/填写下面的选项，会自动整理成需求发给 agent。点上方
            「agent」即可让它据此为你生成。
          </p>
          {opsContent}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
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
                      不知怎么描述？切到「{opsLabel}」勾几个选项，需求自动整理好。
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
      )}
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
