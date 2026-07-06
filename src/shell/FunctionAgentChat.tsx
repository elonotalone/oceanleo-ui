"use client";

// ============================================================================
// @oceanleo/ui — 功能区左栏「操作台 | agent」同栏双形态（单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v10（操作员 2026-06-28）：docs/architecture/
// oceanleo-pro-site-console-agent-coplane.md
//
//   专业子站的每个功能页 = 一个功能 = 一个操作台。左栏是「操作台 | agent」同栏双
//   形态，切换键挂在左栏标题位（SplitWorkspace 的 useLeftPaneSlot）：
//     - 操作台（默认）：各站现成的 StudioSection 表单 + 底部「生成」主按钮，用户
//       直接精细操控、直接生成。
//     - agent：本功能区专属智能体，对话 + 工具调用能力，独立产出结果。
//
//   操作台与 agent **完全独立**：agent 不读、不写操作台 state（不带 ops_state 上行、
//   不回填 ops_patch）。二者**共用同一个右栏「结果」区**——操作台生成的结果和 agent
//   对话产出的图片/文档都进右栏（agent 经 onArtifact 上报）。
//
//   推翻 v9（理解 A）：不再「左栏只剩 agent + 操作台搬进 leo 助手浮窗」。操作台回到
//   左栏第一公民、默认显示、可直接生成。skill 形态保持删除（不恢复）。
//
// 隔离：只持有本功能区的 agentId + schema，看不到别的功能区。
// 用法：把它放进 OperatorConsole 的 `ops`（左栏内容）。右栏（结果）照旧由
// OperatorConsole / AgentConsole 的 canvas 渲染——两种形态共用同一个右栏。
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Markdown, TypewriterMarkdown } from "./Markdown";
import { LeoComposer } from "./LeoComposer";
import { useLeftPaneSlot } from "./SplitWorkspace";
import { useRegisterOpsFiller, useGuideWorkflows } from "./guide-context";
import { type WorkflowDraft } from "../lib/workflows";
import { useAttachments } from "./useAttachments";
import {
  createTask,
  followUp,
  getTask,
  stopTask,
  latestArtifact,
  type AgentAttachment,
  type AgentMessage,
  type ArtifactMeta,
} from "../lib/agent";
import { type OpsPatch, type OpsSchema } from "../lib/fn-agent";
import { useUI } from "../i18n/ui/useUI";

// ── 操作台 → agent 桥（宗旨 v12.2，操作员 2026-07-05）────────────────────────
// 一些功能区的「操作台」不是自成一体的确定性表单，而是一份【结构化需求简报】——
// 用户在操作台里选类型/风格/要点，点「开始」后把这些拼成一句完整需求【交给本功能区
// agent 去执行】（典型：AI 建站——操作台填站点类型/页面/风格 → 交给 CodeAct agent 写
// 真代码）。为此 FunctionAgentChat 通过本 context 暴露一个 submitToAgent(prompt)，让
// 自定义 opsContent 能把拼好的 prompt push 进 agent 并切到 agent 形态开始跑。
// 注意：这【不是】v9 的「agent 读操作台 state」——是【用户】在操作台点按钮，主动把
// 一段文本交给 agent，与在 agent 输入框打字发送等价。
interface FnAgentBridge {
  submitToAgent: (prompt: string) => void;
}
const FnAgentBridgeCtx = createContext<FnAgentBridge | null>(null);

/** 在自定义 opsContent 里拿到「把简报交给本功能区 agent」的提交器。 */
export function useFnAgentBridge(): FnAgentBridge | null {
  return useContext(FnAgentBridgeCtx);
}

export interface FunctionAgentChatProps {
  /** 本功能区 agent id（"<site_id>.<fn_id>"）。 */
  agentId: string;
  /** 本站 site_id（计量 + 历史分区）。 */
  siteId?: string;
  /** 操作台 schema（功能区名/字段说明；agent 不读 state，仅用 schema.title 等展示）。 */
  schema: OpsSchema;
  /** 操作台页内容（各站现成的 StudioSection 表单 + **底部生成主按钮**）。 */
  opsContent: React.ReactNode;
  /**
   * @deprecated 宗旨 v10：agent 与操作台独立，agent 不读操作台 state。保留 prop 仅为
   * 向后兼容（不再调用），各站可继续传，无副作用。 */
  getOpsState?: () => Record<string, unknown>;
  /**
   * 把「补丁」写进操作台 state（key → value）。宗旨 v12.2（操作员 2026-07-05）复活此
   * prop 的一个正当用途：右栏「导航」示例被点击时，默认行为是把示例完整 prompt 填进
   * **操作台的主输入字段**（schema.fields[0]，或 opsPrimaryField 指定）并切到「操作台」
   * 形态——不再灌进 agent。各站早已实现 onApplyPatch 把 patch.set.<field> 映射进自己
   * 的表单 state，因此复用它即可零改动让「点卡片→填操作台」在全家桶生效。
   * （agent 仍不读/不写操作台——这里是【用户】点导航示例触发的填充，不是 agent 触发。） */
  onApplyPatch?: (patch: OpsPatch) => void;
  /**
   * 操作台「主输入字段」key（导航示例默认填它）。不给则取 schema.fields[0].key。
   * 用于表单主字段不是第一个、或想显式指定时。 */
  opsPrimaryField?: string;
  /**
   * agent 产出「分屏产物」(artifact，如生成的图片 / 文档) 时回报给宿主，让右侧结果
   * 画布把它显示出来（操作台与 agent 共用右栏结果区）。 */
  onArtifact?: (artifact: ArtifactMeta, content: string) => void;
  /**
   * @deprecated 宗旨 v10：agent 不触发操作台动作。保留 prop 仅为向后兼容（不再调用）。 */
  onRunAction?: (actionId: string) => void;
  /** 文本模型复合 key（来自 ModelPicker）。 */
  agentModel?: string;
  accent?: string;
  /** 操作台页标签，默认「操作台」。 */
  opsLabel?: string;
  /** 默认显示哪个形态，默认 "ops"（操作台第一公民）。 */
  defaultTab?: "agent" | "ops";
  /** 不含操作台表单（纯对话型功能区）时传 false，左栏只显示 agent、不出现切换键。 */
  showOps?: boolean;
  /**
   * 该功能区所属 app 的展示名（如「LeoImage」）。给了它，agent 页会在顶部显示
   * 「所属 app」的小标签，让用户知道当前 agent 隶属于哪个 app。 */
  appLabel?: string;
  /** app 图标（emoji / 单字），与 appLabel 一起展示。 */
  appIcon?: string;
  /**
   * 宗旨 v12.1/v12.2：右栏「导航」示例被点击时的处理器。给了它 → 由站点决定怎么把示例
   * 灌进左栏（如 image 站按 opts.data 里的 sceneId 套用整套场景预设并切到「操作台」）。
   * 不给 → 默认：把完整 prompt 填进【操作台主输入字段】(onApplyPatch + primaryField)
   * 并切到「操作台」；没有操作台表单时才回退填 agent 输入框。 */
  onGuideExample?: (
    text: string,
    opts?: { imageUrl?: string; set?: Record<string, unknown>; data?: unknown },
  ) => void;
  /**
   * 「保存工作流」（宗旨 v16 补充，操作员 2026-07-06）：给了它 → 左栏标题「操作台 |
   * agent」开关右侧出现「保存工作流」按钮。点击时调用它拿到当前操作台输入的快照
   * （{ label?, prompt, params? }），存进「我的工作流」（右栏导航「我的」类别可一键复用）。
   * 返回 null / prompt 为空 → 提示用户先填写。站点从自己的操作台 state 拼这份草稿。 */
  getWorkflowDraft?: () => WorkflowDraft | null;
}

// 左栏双形态：操作台（表单 + 生成）/ agent（有能力、带工具，独立于操作台）。
type FnTab = "ops" | "agent";

export function FunctionAgentChat({
  agentId,
  siteId = "",
  schema,
  opsContent,
  getOpsState: _getOpsState,
  onApplyPatch,
  opsPrimaryField,
  onArtifact,
  onRunAction: _onRunAction,
  agentModel = "",
  accent = "#4f46e5",
  opsLabel: opsLabelProp,
  defaultTab = "ops",
  showOps = true,
  appLabel,
  appIcon,
  onGuideExample,
  getWorkflowDraft,
}: FunctionAgentChatProps) {
  void _getOpsState;
  void _onRunAction;
  const tt = useUI();
  const opsLabel = opsLabelProp ?? tt("操作台");
  // 无操作台表单的纯对话功能区：强制 agent 形态、不显示切换键。
  const [tab, setTab] = useState<FnTab>(showOps ? defaultTab : "agent");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reportedArtifactRef = useRef<string>("");
  const atts = useAttachments(siteId, setError);

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput((v) => (v ? v + " " : "") + text);
  }, []);

  // 宗旨 v12.2（操作员 2026-07-05）：注册「导航」示例填充器——点右栏导航里的示例时
  // 被调用。**默认填「操作台」，不再填 agent**（操作员截图 dde6ce27：点卡片内容应进
  // 左侧操作台输入框，而不是 agent 输入框）。优先级：
  //   ① 站点给了 onGuideExample → 交给站点处理（如 image 按 data.sceneId 套场景预设）。
  //   ② 有操作台表单（showOps）+ 能写回（onApplyPatch）→ 把完整 prompt 填进操作台
  //      **主输入字段**（opsPrimaryField 或 schema.fields[0].key）并切到「操作台」形态。
  //   ③ 纯对话功能区（无操作台表单）→ 回退：填进 agent 输入框并切到「agent」。
  const primaryField = opsPrimaryField || schema.fields[0]?.key || "";
  const fillFromGuide = useCallback<
    (text: string, opts?: { imageUrl?: string; set?: Record<string, unknown>; data?: unknown }) => void
  >(
    (text, opts) => {
      if (onGuideExample) {
        onGuideExample(text, opts);
        return;
      }
      if (showOps && primaryField && onApplyPatch) {
        // 宗旨 v15 决策 C：导航卡片 = 升级版 prompt——主字段填文案 + 一并 patch 参数
        // （ratio/genMode/style/words…，来自示例的 set）。站点 onApplyPatch 早已把
        // set.<field> 映射进自己的表单 state，故零站点改动即让参数一起填。
        onApplyPatch({ set: { [primaryField]: text, ...(opts?.set || {}) } });
        setTab("ops");
        return;
      }
      // 纯对话功能区（无操作台）：示例填进 agent 输入框。
      setInput(text);
      setTab("agent");
    },
    [onGuideExample, showOps, primaryField, onApplyPatch],
  );
  useRegisterOpsFiller(fillFromGuide);

  // ── 「保存工作流」（宗旨 v16 补充）：把当前操作台输入存成可复用工作流 ──────────
  const guideWf = useGuideWorkflows();
  const [wfSaving, setWfSaving] = useState(false);
  const [wfSaved, setWfSaved] = useState(false);
  const canSaveWorkflow = showOps && Boolean(getWorkflowDraft) && Boolean(guideWf);
  const saveWorkflow = useCallback(async () => {
    if (!getWorkflowDraft || !guideWf) return;
    const draft = getWorkflowDraft();
    if (!draft || !(draft.prompt || "").trim()) {
      setError(tt("请先在操作台填写内容，再保存工作流。"));
      return;
    }
    setError(null);
    setWfSaving(true);
    const w = await guideWf.saveWorkflow(draft);
    setWfSaving(false);
    if (w) {
      setWfSaved(true);
      setTimeout(() => setWfSaved(false), 1800);
    } else {
      setError(tt("保存失败，请重试。"));
    }
  }, [getWorkflowDraft, guideWf, tt]);

  // ── 「操作台 | agent」切换键装进左栏标题位（宗旨 v10，复用 v0.41.0 机制）──────
  // SplitWorkspace 的左栏 PaneHeader 标题本身就是这枚开关；不在 SplitWorkspace 内
  // （slot 为 null）时回退到栏体内嵌。纯对话功能区（!showOps）不装开关。
  // 宗旨 v16：开关右侧再挂一枚「保存工作流」按钮（getWorkflowDraft 存在时）。
  const slot = useLeftPaneSlot();
  const toggle = showOps ? (
    <div className="flex min-w-0 items-center gap-2">
      <div className="inline-flex shrink-0 rounded-lg bg-stone-100 p-0.5 text-[13px]">
        {(["ops", "agent"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            title={
              t === "ops"
                ? tt("操作台：直接精细操控、直接生成")
                : tt("agent：跟它说话，它带工具帮你生成（不会动操作台）")
            }
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              tab === t ? "text-white" : "text-stone-500 hover:text-stone-700"
            }`}
            style={tab === t ? { background: accent } : undefined}
          >
            {t === "ops" ? opsLabel : "agent"}
          </button>
        ))}
      </div>
      {canSaveWorkflow && (
        <button
          type="button"
          onClick={() => void saveWorkflow()}
          disabled={wfSaving}
          title={tt("把当前操作台的输入保存为工作流，稍后可在右侧「导航 · 我的」里一键复用")}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition active:scale-95 disabled:opacity-50 ${
            wfSaved
              ? "border-transparent text-white"
              : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50"
          }`}
          style={wfSaved ? { background: accent } : undefined}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            {wfSaved ? (
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path
                d="M5 5a2 2 0 012-2h9l3 3v13a2 2 0 01-2 2H7a2 2 0 01-2-2V5z M8 3v5h7 M8 21v-6h8v6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
          {wfSaved ? tt("已保存") : tt("保存工作流")}
        </button>
      )}
    </div>
  ) : null;

  // 安装/更新左栏标题开关（toggle 节点选中态随 tab / 保存态变化）。卸载时清空，避免离开
  // 该功能区后残留旧开关。
  useEffect(() => {
    slot?.setLeftLabel(toggle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, tab, accent, opsLabel, showOps, canSaveWorkflow, wfSaving, wfSaved]);
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
    if (tab !== "agent") return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, tab]);

  // 把 agent 线程里最新的 artifact（图片/文档）回报给宿主 → 右侧结果画布显示。
  // 宗旨 v10：这是操作台与 agent 共用右栏结果区的机制（agent 不写操作台，但产物进
  // 共用结果区是合理的）。
  useEffect(() => {
    if (!onArtifact) return;
    const a = latestArtifact(messages);
    if (!a) return;
    const sig = `${a.meta.type}:${a.meta.url || ""}:${a.content.slice(0, 64)}`;
    if (reportedArtifactRef.current === sig) return;
    reportedArtifactRef.current = sig;
    onArtifact(a.meta, a.content);
  }, [messages, onArtifact]);

  async function send(override?: string) {
    // override：由操作台简报桥（submitToAgent）传入的完整 prompt，不经输入框。
    const prompt = (override ?? input).trim();
    const uploaded = override ? [] : atts.ready();
    if ((!prompt && uploaded.length === 0) || busy || atts.uploading) return;
    if (!override) {
      setInput("");
      atts.clear();
    }
    setError(null);
    const effectivePrompt = prompt || tt("请分析我上传的文件。");
    const meta = uploaded.length ? { attachments: uploaded } : undefined;
    setMessages((m) => [
      ...m,
      { id: Date.now(), role: "user", kind: "text", content: effectivePrompt, meta },
    ]);

    if (!taskId) {
      setBusy(true);
      const r = await createTask({
        prompt: effectivePrompt,
        mode: "agent",
        siteId,
        agentId,
        agentModel,
        attachments: uploaded,
        // 宗旨 v10：agent 独立于操作台——不带 opsState（不读操作台 state）。
      });
      setBusy(false);
      if (!r.ok || !r.data) {
        setError(r.status === 401 ? tt("登录后即可使用 agent。") : r.error || tt("创建失败"));
        return;
      }
      setTaskId(r.data.task_id);
      setStatus("running");
      void refresh(r.data.task_id);
      return;
    }
    setBusy(true);
    const r = await followUp(taskId, effectivePrompt, uploaded);
    setBusy(false);
    if (r.ok) setStatus("running");
    else setError(r.error || tt("发送失败"));
  }

  const running = status === "running" || busy;

  // 「中止」：AI 工作中点停止键 → 停任务。
  const stop = useCallback(async () => {
    if (!taskId) {
      setBusy(false);
      return;
    }
    const r = await stopTask(taskId);
    if (r.ok) {
      setStatus("stopped");
      setBusy(false);
      void refresh(taskId);
    }
  }, [taskId, refresh]);

  // 启发式追问（后端 meta.suggestions）——最后一条 assistant 消息上取；点了直接发送。
  // 同时记录最新 assistant 文本条 index，用于给它流式打字机。
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && (messages[i].kind === "text" || !messages[i].kind)) {
      lastAssistantIdx = i;
      break;
    }
  }
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const suggestions: string[] =
    !running && Array.isArray(lastAssistant?.meta?.suggestions)
      ? (lastAssistant!.meta!.suggestions as string[]).filter(
          (s) => typeof s === "string" && s.trim(),
        ).slice(0, 3)
      : [];

  async function sendSuggestion(text: string) {
    if (!taskId || busy) return;
    setBusy(true);
    setMessages((m) => [
      ...m,
      { id: Date.now(), role: "user", kind: "text", content: text },
    ]);
    const r = await followUp(taskId, text);
    setBusy(false);
    if (r.ok) setStatus("running");
    else setError(r.error || tt("发送失败"));
  }

  // 操作台简报桥：让自定义 opsContent 能把拼好的 prompt 交给本功能区 agent 执行。
  const bridge = useMemo<FnAgentBridge>(
    () => ({
      submitToAgent: (prompt: string) => {
        const p = (prompt || "").trim();
        if (!p) return;
        setTab("agent");
        void send(p);
      },
    }),
    // send 是稳定闭包（读 taskId/busy 等 state 已在内部处理）；tab 切换用 setter。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [taskId, busy, agentId, siteId, agentModel],
  );

  // ── 操作台形态：直接渲染各站表单（含底部「生成」主按钮）──────────────────────
  if (tab === "ops") {
    return (
      <FnAgentBridgeCtx.Provider value={bridge}>
        <div className="flex h-full flex-col">
          {/* 不在 SplitWorkspace 内（无左栏标题插槽）时，栏体内回退放开关。 */}
          {!slot && toggle && <div className="mb-3 shrink-0 self-start">{toggle}</div>}
          <div className="min-h-0 flex-1 overflow-y-auto">{opsContent}</div>
        </div>
      </FnAgentBridgeCtx.Provider>
    );
  }

  // ── agent 形态：对话流 + 输入框（独立于操作台，带工具能力）──────────────────
  // 排版对齐 agent.oceanleo.com 的 AgentChat（操作员 2026-07-01）：字体 15px、对话
  // 与输入框 max-w-2xl 居中、气泡不铺满整栏，读感与主 agent 站一致（不再是 13px + 拉满）。
  return (
    <div className="flex h-full flex-col">
      {!slot && toggle && <div className="mb-3 shrink-0 self-start">{toggle}</div>}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        <div className="mx-auto w-full max-w-2xl space-y-3">
          {appLabel && (
            <div className="flex shrink-0 items-center gap-1.5 text-[12px] text-stone-400">
              <span>{tt("所属 app")}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-600">
                {appIcon && <span className="text-[13px] leading-none">{appIcon}</span>}
                {appLabel}
              </span>
            </div>
          )}
          {messages.length === 0 && !running && (
            <p className="py-10 text-center text-[15px] text-stone-400">
              {tt("让「{title}」agent 帮你做事，", { title: schema.title })}
              <br />
              {tt("它会调用工具为你生成结果。")}
              {showOps && (
                <>
                  <br />
                  <span className="text-[13px] text-stone-300">
                    {tt("想自己精细操控？切到「{label}」直接调参生成。", { label: opsLabel })}
                  </span>
                </>
              )}
            </p>
          )}
          {messages.map((m, i) => (
            <Bubble key={m.id} m={m} accent={accent} streaming={running && i === lastAssistantIdx} />
          ))}
          {running && (
            <div className="flex items-center gap-2 text-[14px] text-stone-400">
              <span className="v-spinner" /> {tt("agent 正在处理…")}
            </div>
          )}
          {/* 灵感（3 个可点追问）：从上到下渐变显示（错峰淡入，非流式）。 */}
          {suggestions.length > 0 && (
            <div className="flex flex-col items-stretch gap-0.5 pt-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void sendSuggestion(s)}
                  style={{ animationDelay: `${i * 130}ms` }}
                  className="group v-fade-up flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[14px] text-stone-600 transition hover:bg-stone-100/70 hover:text-stone-900"
                >
                  <svg className="h-4 w-4 shrink-0 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M8 12h8M12 8v8" strokeLinecap="round" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                  <span className="min-w-0 flex-1 truncate">{s}</span>
                  <svg className="h-4 w-4 shrink-0 text-stone-300 transition group-hover:text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-[14px] text-rose-500">{tt(error)}</p>}
        </div>
      </div>
      <div className="shrink-0 pt-3">
        <div className="mx-auto w-full max-w-2xl space-y-2">
          <LeoComposer
            value={input}
            onChange={setInput}
            onSubmit={send}
            loading={running}
            onStop={() => void stop()}
            leoSuggest
            leoQuickSuggest={{ siteId: siteId || schema.agentId.split(".")[0] }}
            placeholder={tt("让 agent 帮你做「{title}」，可上传文件…", { title: schema.title })}
            rows={1}
            onAttachFiles={atts.handleAttachFiles}
            attachments={atts.composerAttachments}
            onRemoveAttachment={atts.removeAttachment}
            onVoiceTranscript={handleVoiceTranscript}
          />
        </div>
      </div>
    </div>
  );
}

function Bubble({ m, accent, streaming = false }: { m: AgentMessage; accent: string; streaming?: boolean }) {
  void accent;
  if (m.role === "user") {
    const attList = m.meta?.attachments || [];
    return (
      <div className="flex flex-col items-end gap-1.5">
        {attList.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {attList.map((a, i) => (
              <FnAttachmentChip key={i} att={a} />
            ))}
          </div>
        )}
        {m.content && (
          // 用户气泡：黑字 + 浅灰气泡（操作员 2026-07-03）。
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5 text-[15px] leading-relaxed text-neutral-900">
            {m.content}
          </div>
        )}
      </div>
    );
  }
  if (m.kind === "plan") {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3">
        <Markdown className="text-[15px] leading-relaxed">{m.content}</Markdown>
      </div>
    );
  }
  if (m.kind === "step") {
    return <div className="px-1 text-[13px] font-medium text-stone-500">{m.content}</div>;
  }
  if (m.kind === "error") {
    return <div className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-600">{m.content}</div>;
  }
  // agent 回答：不带气泡框，黑字直接显示在背景上（操作员 2026-07-03）；最新条流式打字。
  return (
    <div className="max-w-full px-1 text-neutral-900">
      <TypewriterMarkdown content={m.content} active={streaming} />
    </div>
  );
}

function FnAttachmentChip({ att }: { att: AgentAttachment }) {
  const tt = useUI();
  const isImage =
    (att.mime || "").startsWith("image/") ||
    att.media_type === "image" ||
    /\.(png|jpe?g|webp|gif)$/i.test((att.url || "").split("?")[0]);
  if (isImage && att.url) {
    return (
      <a href={att.url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.url}
          alt={att.name || ""}
          className="h-16 w-16 rounded-lg border border-stone-200 object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={att.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[12px] text-stone-600 shadow-sm hover:bg-stone-50"
    >
      <svg className="h-4 w-4 shrink-0 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
        <path d="M14 3v4h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="max-w-[140px] truncate">{att.name || tt("附件")}</span>
    </a>
  );
}
