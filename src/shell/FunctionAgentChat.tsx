"use client";

// ============================================================================
// @oceanleo/ui — 功能区「操作台 / agent / skill」三形态左栏（单一事实源）
// ----------------------------------------------------------------------------
// Doctrine v5（2026-06-23）：一个 app（左操作台 + 右结果，整块）里有：
//   - 操作台：固定模板操控（各站传进来的 <StudioSection> 表单 + 主按钮）。
//   - agent ：有真实能力的智能体——对话流（绑定本功能区 agent_id），产出
//             OpsPatch → onApplyPatch 落到真实操作台 state，右栏随之重渲染。
//             这是「app 帮你填操作台并生成结果」的入口。
//   - skill ：纯 prompt 套壳的聊天助手——直接和这个 app 聊天答疑，不操作操作台、
//             不产 ops_patch（mode=skill）。这是「跟这个 app 直接聊聊」的入口。
//
// 三者隔离：只持有本功能区的 agentId + schema，看不到别的功能区。
// 用法：把它放进 OperatorConsole 的 `ops`（左栏内容）。右栏（结果）照旧由
// OperatorConsole 的 canvas 渲染——三种形态共用同一个右栏。
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
  defaultTab?: FnTab;
}

// 左栏三形态：操作台（表单）/ agent（有能力，控操作台）/ skill（纯聊天）。
type FnTab = "ops" | "agent" | "skill";

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
  const [tab, setTab] = useState<FnTab>(defaultTab);
  // agent / skill 各自一条独立会话（互不串台）。
  const [taskId, setTaskId] = useState<string | null>(null);
  const [skillTaskId, setSkillTaskId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [skillMessages, setSkillMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState("");
  const [skillStatus, setSkillStatus] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const appliedRef = useRef<Set<number>>(new Set());

  // doctrine v3（2026-06-21）：把「操作台 | agent」开关装到**左栏标题位置**
  // （SplitWorkspace 的左栏 PaneHeader），不再在栏体内放一个会与「操作台」标题
  // 文字重复的 pill。若不在 SplitWorkspace 内（slot 为 null），回退到栏体内嵌。
  const slot = useLeftPaneSlot();
  const TAB_LABEL: Record<FnTab, string> = { ops: opsLabel, agent: "agent", skill: "skill" };
  const toggle = (
    <div className="inline-flex rounded-lg bg-stone-100 p-0.5 text-[13px]">
      {(["ops", "agent", "skill"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTab(t)}
          title={
            t === "ops"
              ? "固定模板操控"
              : t === "agent"
                ? "让 agent 帮你填操作台并生成结果"
                : "纯聊天助手：直接和这个 app 聊聊（不操作操作台）"
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
  // 安装/更新左栏标题开关（toggle 节点选中态随 tab 变化）。卸载时清空，避免离开
  // 该功能区后残留旧开关。中间更新不置 null（不闪烁）。
  useEffect(() => {
    slot?.setLeftLabel(toggle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, tab, accent, opsLabel]);
  useEffect(() => {
    return () => slot?.setLeftLabel(null);
  }, [slot]);

  // 刷新某条会话（按当前形态写回对应 thread）。agent / skill 各自的 setter。
  const refresh = useCallback(async (id: string) => {
    const r = await getTask(id);
    if (r.ok && r.data) {
      setMessages(r.data.messages || []);
      setStatus(r.data.task?.status || "");
      return r.data.task?.status || "";
    }
    return "";
  }, []);

  const refreshSkill = useCallback(async (id: string) => {
    const r = await getTask(id);
    if (r.ok && r.data) {
      setSkillMessages(r.data.messages || []);
      setSkillStatus(r.data.task?.status || "");
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

  // poll skill thread while running
  useEffect(() => {
    if (!skillTaskId) return;
    if (skillStatus && skillStatus !== "running") return;
    const t = setInterval(async () => {
      const s = await refreshSkill(skillTaskId);
      if (s && s !== "running") clearInterval(t);
    }, 1500);
    return () => clearInterval(t);
  }, [skillTaskId, skillStatus, refreshSkill]);

  const viewMessages = tab === "skill" ? skillMessages : messages;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [viewMessages]);

  // Apply any NEW ops_patch the agent produced → real operator-console state.
  // Only the agent thread can drive the console; skills never patch it.
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
    const isSkill = tab === "skill";
    const appendUser = isSkill ? setSkillMessages : setMessages;
    appendUser((m) => [...m, { id: Date.now(), role: "user", kind: "text", content: prompt }]);

    const curTaskId = isSkill ? skillTaskId : taskId;
    if (!curTaskId) {
      setBusy(true);
      const r = await createTask({
        prompt,
        mode: isSkill ? "skill" : "agent",
        siteId,
        agentId,
        agentModel,
        // 只有 agent 形态需要把操作台快照带过去；skill 是纯聊天，不读操作台。
        opsState: isSkill ? undefined : snapshot(),
      });
      setBusy(false);
      if (!r.ok || !r.data) {
        const msg =
          r.status === 401
            ? isSkill
              ? "登录后即可使用 skill。"
              : "登录后即可使用 agent。"
            : r.error || "创建失败";
        setError(msg);
        return;
      }
      if (isSkill) {
        setSkillTaskId(r.data.task_id);
        setSkillStatus("running");
        void refreshSkill(r.data.task_id);
      } else {
        setTaskId(r.data.task_id);
        setStatus("running");
        void refresh(r.data.task_id);
      }
      return;
    }
    setBusy(true);
    const r = await followUp(curTaskId, prompt);
    setBusy(false);
    if (r.ok) {
      if (isSkill) setSkillStatus("running");
      else setStatus("running");
    } else setError(r.error || "发送失败");
  }

  function snapshot(): Record<string, unknown> {
    try {
      return getOpsState() || {};
    } catch {
      return {};
    }
  }

  const isSkillTab = tab === "skill";
  const running =
    (isSkillTab ? skillStatus === "running" : status === "running") || busy;

  return (
    <div className="flex h-full flex-col">
      {/* 回退：只有当不在 SplitWorkspace 内（无左栏标题插槽）时，才在栏体内放开关。 */}
      {!slot && <div className="mb-3 shrink-0 self-start">{toggle}</div>}

      {tab === "ops" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{opsContent}</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {viewMessages.length === 0 && !running && (
              <p className="py-8 text-center text-sm text-stone-400">
                {isSkillTab ? (
                  <>
                    跟「{schema.title}」skill 直接聊聊，
                    <br />答疑、出主意、给建议（不会动左侧操作台）。
                  </>
                ) : (
                  <>
                    让「{schema.title}」agent 帮你做事，
                    <br />它会帮你填好左侧操作台并生成结果。
                  </>
                )}
              </p>
            )}
            {viewMessages.map((m) => (
              <Bubble key={m.id} m={m} accent={accent} />
            ))}
            {running && (
              <div className="flex items-center gap-2 text-[13px] text-stone-400">
                <span className="v-spinner" /> {isSkillTab ? "skill" : "agent"} 正在处理…
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
              placeholder={
                isSkillTab
                  ? `跟「${schema.title}」skill 聊聊…`
                  : `让 agent 帮你做「${schema.title}」…`
              }
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
