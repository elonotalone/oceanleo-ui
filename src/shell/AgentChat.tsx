"use client";

// ============================================================================
// @oceanleo/ui — agent 工作界面 AgentChat（单一事实源）
// ----------------------------------------------------------------------------
// 首页输入框提交后进入的「agent」界面（聊天为主）。形态（操作员 2026-06-19）：
//   - 普通对话：单栏聊天流（不分屏）。
//   - 高级任务（产出地图/画布/小说/PPT/表格/文档等「格式化可编辑结果」）：
//     一分为二 —— 左栏 = AI 推导（消息流）、右栏 = 结果（可编辑）。
//   - 该次工作 = 一条 agent_task，自动进历史记录。
// 真实后端：createTask → 轮询 getTask → 渲染 messages + 取最新 artifact。
//
// 与「工作台」的区别：AgentChat 左栏以对话为主；工作台左栏以固定模板操控为主。
// 两者共用 SplitWorkspace 分栏骨架（可拖 + 大屏）。
// ============================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SplitWorkspace, type SplitLibraryConfig } from "./SplitWorkspace";
import { ResultCanvas, type CanvasTab } from "./ResultCanvas";
import { MaterialLibrary, type MaterialItem } from "./MaterialLibrary";
import { ArtifactLibrary } from "./ArtifactLibrary";
import { Markdown, TypewriterMarkdown } from "./Markdown";
import { LeoComposer } from "./LeoComposer";
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
import { useAttachments } from "./useAttachments";
import { ModelPicker, type ModelCategory } from "./ModelPicker";
import { useShellChrome } from "./ShellChrome";
import { useUI, type UITranslate } from "../i18n/ui/useUI";

function artifactLabels(tt: UITranslate): Record<string, string> {
  return {
    map: tt("地图"),
    canvas: tt("画布"),
    novel: tt("小说"),
    ppt: tt("演示文稿"),
    sheet: tt("表格"),
    doc: tt("文档"),
    markdown: tt("结果文档"),
    image: tt("图片"),
  };
}

/**
 * 把对话流转成「组织节点实时状态」（doctrine 2026-07-09）：供宿主喂给 <OrgCanvas nodeStatus>。
 * 判据（按 meta.worker=agent_id 聚合）：出过 kind="report" → done（已回复）；否则若整体
 * running 且该成员出现过（step/artifact/report 的 meta.worker）→ running（工作中）；否则
 * pending（待命）。返回 { [agent_id]: "pending"|"running"|"done" }。 */
export function orgStatusFromMessages(
  messages: AgentMessage[],
  running: boolean,
): Record<string, "pending" | "running" | "done"> {
  const reported = new Set<string>();
  const touched = new Set<string>();
  for (const m of messages) {
    const w = (m.meta?.worker as string) || "";
    if (!w) continue;
    touched.add(w);
    if (m.kind === "report") reported.add(w);
  }
  const out: Record<string, "pending" | "running" | "done"> = {};
  for (const id of touched) {
    out[id] = reported.has(id) ? "done" : running ? "running" : "pending";
  }
  return out;
}

export interface AgentChatProps {
  /** 站点 id（驱动 per-site 工具 md + 计量）。 */
  siteId?: string;
  /** 初次提交的内容（从首页输入框带进来）；传了会自动创建任务。 */
  initialPrompt?: string;
  /**
   * 初次提交随附的附件（用户在**首页输入框**「＋」上传 / 拖入的文件，已上传到文件库、
   * 拿到公网 url）。与 initialPrompt 一起自动创建首个任务——让 agent 从首页就带上来的
   * 文件（音频自动转写、其它文件按 url 分析）。宿主从 HomeIntro.onStart 的
   * opts.attachments 透传进来即可。 */
  initialAttachments?: AgentAttachment[];
  /** 已有会话 id（从历史记录点进来回看）；与 initialPrompt 二选一。 */
  taskId?: string;
  /** 模式：agent（默认，带规划循环 + artifact）| chat（纯对话）。 */
  mode?: "agent" | "chat";
  /** 绑定单个 agent（专家）。format "<site_id>.<fn_id>"，如 "agent.senior-engineer"。 */
  agentId?: string;
  /** 绑定一个「专家团」(agent.oceanleo.com)。format "team.<slug>"。 */
  teamId?: string;
  /** 选中的文本模型复合 key（来自 ModelPicker），透传给引擎。 */
  agentModel?: string;
  accent?: string;
  headerHeight?: number;
  /** 任务创建后回调（如把 id 写进 URL / 历史高亮）。 */
  onTaskCreated?: (taskId: string) => void;
  /**
   * site_id → app 展示名（doctrine v7：历史回看 / agent 界面要显示「所属 app」）。
   * 回看历史时本组件从 task.site_id 解析出 app 名，显示在左栏标题旁。 */
  appNames?: Record<string, string>;
  /** 直接指定「所属 app」展示名（覆盖 appNames 解析）。 */
  appLabel?: string;
  /** 右栏自定义渲染器：按 artifact.type 返回专用编辑器（map/canvas/ppt…）。
   *  不传或返回 null → 回退到内置 Markdown / 图片渲染。 */
  renderArtifact?: (artifact: ArtifactMeta, content: string) => React.ReactNode;
  /**
   * 操作员 2026-07-01：内建「库」开关（透传给 SplitWorkspace）。给了它，agent 界面
   * 左栏标题右侧出现「库」按钮（默认关）；点开 → 右栏显示共享文件库，agent 生成的
   * 作品可在「作品」分区查看。不传则默认按 siteId 自动启用（见下方 effectiveLibrary）。
   *   - 传对象 → 用它。
   *   - 传 false → 关闭库按钮。 */
  library?: SplitLibraryConfig | false;
  /**
   * 输入框上方的自定义内容（如 agent 站的「skill prompt 开源面板」）。渲染在 composer
   * 之上、对话流之下。用于把 agent 站的 prompt 面板并入共享 AgentChat（复用同一壳层，
   * 获得右栏 artifact + 库，无需自写 chat）。 */
  composerHeader?: React.ReactNode;
  /**
   * 宗旨 v13（2026-07-02）：输入框**内部**左下角的额外控件（透传 LeoComposer.inlineSlot，
   * 与「leo 建议」同一行）。agent 站用它放「专家团」小图标 → 点开成员管理弹窗。 */
  composerInlineSlot?: React.ReactNode;
  /**
   * 团队/组织成员名录（doctrine 2026-07-09）。给了它（且非空）→ 输入框内部左下角出现
   * 一个「@」按钮，点开成员列表，选某成员就把「@名字 」插进输入框——用户可只 @ 某几个
   * 成员，只跟他们说话（后端只把活派给被 @ 的成员）。不给 → 无 @ 选择器（单 agent）。 */
  mentionMembers?: { agent_id: string; name: string; icon?: string }[];
  /**
   * 「组织」板块渲染器（doctrine 2026-07-09，修：改用真【节点图画布】而非成员卡列表）。
   * 给了它 → 右栏库【最前面】多一个「组织」标签，内容 = 本函数返回的节点图（宿主用
   * `@oceanleo/ui/org-canvas` 的 <OrgCanvas> 渲染：团队≡组织，节点=成员、可加成员、点节点
   * 看 prompt/正在做的工作、有实时状态、带 minimap/缩放，与主站 organization 画布一模一样）。
   * 之所以用 render-prop 而不在此静态 import OrgCanvas：ReactFlow 只该进真正用画布的站
   * （agent/主站），不拖累其余 29 站。宿主可用 `orgStatusFromMessages(messages)` 把对话流
   * 转成节点状态喂给 OrgCanvas。不给 → 无「组织」板块（单 agent 场景）。 */
  renderOrgPanel?: (ctx: { messages: AgentMessage[]; running: boolean }) => React.ReactNode;
  /**
   * doctrine v6：本次会话的 skill-prompt 覆盖（用户编辑了 prompt 并选「用这段直接干活」）。
   * 只对本次会话生效，透传给 createTask，不写回 manifest。 */
  promptOverride?: string;
  /** 输入框占位文案（默认「继续追问，或上传文件让 agent 分析…」）。 */
  placeholder?: string;
  /** 空态提示（还没消息且未运行时显示，默认「在下方输入，开始与 agent 对话。」）。 */
  emptyHint?: React.ReactNode;
  /**
   * 顶栏「返回」按钮回调（操作员 2026-07-06，对齐参考图 bc92f732 + OperatorConsole 顶栏）。
   * 给了它 → agent 界面【最上面那一行】变成一条横栏：左「‹ 返回」pill + 本次对话总结
   * （= 后端自动生成的 task.title），右「模型选择 ▾」。此时会通知 AppShell 隐藏它 header
   * 里的模型选择（否则模型选择在上、返回在下 = 两行浪费空间）。点击「返回」【只调用本回调】
   * （不动任务、不 stopTask），让宿主在**不中止对话**的前提下退回上一层（如首页）。宿主自行
   * 决定卸载还是隐藏本组件——想保留对话请隐藏而非卸载（见 word app/page.tsx）。 */
  onBack?: () => void;
  /** 返回按钮文案，默认「返回」。 */
  backLabel?: string;
  /**
   * 宗旨 v19（操作员 2026-07-08）：把右栏（库）升级为全家桶统一的【多标签库】——
   * 导航 / 生成结果 / 素材库 / 文件库，与其它站的 app 右栏 UI 完全一致。给了它 →
   * 右版面渲染一个 <ResultCanvas>，标签 = [生成结果(内置 artifact)] + 本 prop 提供的
   * 额外标签（素材库/文件库…）。不给 → 保持旧的「单 artifact」右版面（向后兼容）。
   *
   * 约定：站点通常传 `libraryTabs={{ materials, showFiles: true }}`（agent.oceanleo.com）
   * 即得到「生成结果 / 素材库 / 文件库」三标签（「导航」在 agent 站无 guide，故不出现；
   * 若宿主套了 GuideProvider 则 ResultCanvas 会自动前插「导航」）。 */
  libraryTabs?: AgentLibraryTabs;
}

/** agent 右栏多标签库配置（宗旨 v19）。 */
export interface AgentLibraryTabs {
  /** 「素材库」的启发素材（同各 app materials）。不给则不出素材库标签。 */
  materials?: MaterialItem[];
  /** 是否出「文件库」标签（ArtifactLibrary，跨站）。默认 true。 */
  showFiles?: boolean;
  /** 「生成结果」标签名，默认「生成结果」。 */
  resultLabel?: string;
}

export function AgentChat({
  siteId = "",
  initialPrompt,
  initialAttachments,
  taskId: initialTaskId,
  mode = "agent",
  agentId = "",
  teamId = "",
  agentModel = "",
  accent = "#4f46e5",
  headerHeight = 56,
  onTaskCreated,
  renderArtifact,
  appNames,
  appLabel: appLabelProp,
  library,
  composerHeader,
  composerInlineSlot,
  promptOverride,
  placeholder,
  emptyHint,
  onBack,
  backLabel,
  libraryTabs,
  mentionMembers,
  renderOrgPanel,
}: AgentChatProps) {
  const tt = useUI();
  const ARTIFACT_LABEL = artifactLabels(tt);
  // 团队/组织对话（宿主给了 renderOrgPanel）→ 右栏库多一个「组织」板块，且操作员
  // 2026-07-09 要求：进团队 app 一打开就【库展开 + 默认停在「组织」】。单 agent 场景
  // （无 renderOrgPanel）仍是「默认生成结果标签 + 库收起（有产物才自动开）」。
  const hasOrgPanel = Boolean(renderOrgPanel);
  // 宗旨 v19：右栏多标签库当前标签（生成结果 / 素材库 / 文件库）。团队默认「组织」，否则「生成结果」。
  const [libTab, setLibTab] = useState(hasOrgPanel ? "org" : "result");
  // 「库」= 右版面（结果/预览）显隐开关。团队默认【开】（一进来就看到组织画布）；单 agent
  // 默认关（对话占满，生成结果 artifact 到达时自动打开）。用户可用「库」按钮手动开合。
  const [rightOpen, setRightOpen] = useState(hasOrgPanel);
  const [taskId, setTaskId] = useState<string | null>(initialTaskId ?? null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState<string>("");
  // 「所属 app」展示名：优先 appLabel prop，其次从 task.site_id 解析。
  const [taskSiteId, setTaskSiteId] = useState<string>("");
  // 本次对话「总结」= 后端自动生成的 task.title（首轮收尾时 AI 概括，见 refresh）。
  const [taskTitle, setTaskTitle] = useState<string>("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atts = useAttachments(siteId, setError);

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput((v) => (v ? v + " " : "") + text);
  }, []);

  // auto-create the task on first mount when an initialPrompt is given.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (initialTaskId) {
      void refresh(initialTaskId);
      return;
    }
    if (
      (initialPrompt && initialPrompt.trim()) ||
      (initialAttachments && initialAttachments.length)
    ) {
      void start((initialPrompt || "").trim(), initialAttachments);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async (id: string) => {
    const r = await getTask(id);
    if (r.ok && r.data) {
      setMessages(r.data.messages || []);
      setStatus(r.data.task?.status || "");
      if (r.data.task?.site_id) setTaskSiteId(r.data.task.site_id);
      // 后端首轮收尾生成的会话总结（task.title）——拿到就更新（顶栏「返回」右侧显示）。
      if (r.data.task?.title) setTaskTitle(r.data.task.title);
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

  // keep the reasoning stream scrolled to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function start(prompt: string, uploaded?: AgentAttachment[]) {
    setBusy(true);
    setError(null);
    setMessages([
      { id: -1, role: "user", kind: "text", content: prompt,
        meta: uploaded && uploaded.length ? { attachments: uploaded } : undefined },
    ]);
    const r = await createTask({
      prompt, mode, siteId, agentModel, agentId, teamId, attachments: uploaded,
      promptOverride: promptOverride || undefined,
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      setError(r.status === 401 ? tt("登录后即可使用 app。") : r.error || tt("创建任务失败"));
      return;
    }
    setTaskId(r.data.task_id);
    setStatus("running");
    onTaskCreated?.(r.data.task_id);
    void refresh(r.data.task_id);
  }

  async function send() {
    const prompt = input.trim();
    // Allow send when there's an attachment even if the text is empty. But block
    // while any attachment is still uploading.
    const uploaded = atts.ready();
    if ((!prompt && uploaded.length === 0) || busy || atts.uploading) return;
    setInput("");
    atts.clear();
    const effectivePrompt = prompt || tt("请分析我上传的文件。");
    if (!taskId) {
      await start(effectivePrompt, uploaded);
      return;
    }
    setBusy(true);
    setMessages((m) => [
      ...m,
      { id: Date.now(), role: "user", kind: "text", content: effectivePrompt,
        meta: uploaded.length ? { attachments: uploaded } : undefined },
    ]);
    const r = await followUp(taskId, effectivePrompt, uploaded);
    setBusy(false);
    if (r.ok) setStatus("running");
    else setError(r.error || tt("发送失败"));
  }

  // 「中止」：AI 工作中（任务 running / 请求在途）点停止键 → 停任务。
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

  // 启发式追问（后端在最终回答的 meta.suggestions 里给 3 个）——取最后一条 assistant
  // 消息上的 suggestions；一旦用户继续输入 / 任务重新 running 就消失。
  // 同时记录最新 assistant 文本条的 index，用于给它做流式打字机（其余条直接全量）。
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && (messages[i].kind === "text" || !messages[i].kind)) {
      lastAssistantIdx = i;
      break;
    }
  }
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const suggestions: string[] =
    !busy && status !== "running" && Array.isArray(lastAssistant?.meta?.suggestions)
      ? (lastAssistant!.meta!.suggestions as string[]).filter(
          (s) => typeof s === "string" && s.trim(),
        ).slice(0, 3)
      : [];

  const sendSuggestion = useCallback(
    async (text: string) => {
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
    },
    [taskId, busy, tt],
  );

  const art = latestArtifact(messages);
  const running = status === "running" || busy;

  // 生成结果(artifact)到达 → 自动打开右版面（「点素材查看」路径）。
  const artSig = art ? `${art.meta.type}:${art.meta.url || ""}:${art.content.slice(0, 32)}` : "";
  const seenArtRef = useRef("");
  useEffect(() => {
    if (art && artSig !== seenArtRef.current) {
      seenArtRef.current = artSig;
      setRightOpen(true);
    }
  }, [art, artSig]);

  // 关键修（操作员 2026-07-09：「团队 app 一打开库是折叠的」）：团队对话的 renderOrgPanel
  // 往往是 **异步** 就绪的（宿主先 setSel({kind:"team"}) 建壳、再 await 拉成员补 members，
  // 之后 renderOrgPanel 才从 undefined 变有值）。仅靠 useState 初始值 = hasOrgPanel 覆盖不到
  // 这个「挂载后才变 true」的情形 → 库仍是初始的关。这里用一次性 ref：hasOrgPanel 第一次
  // 变 true 时，强制【开库 + 切到「组织」】。只做一次，之后用户手动开合/切标签不再被打断。
  const orgAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (hasOrgPanel && !orgAutoOpenedRef.current) {
      orgAutoOpenedRef.current = true;
      setRightOpen(true);
      setLibTab("org");
    }
  }, [hasOrgPanel]);

  // 「库」= 右版面显隐开关（受控）。显式 false 关按钮。否则默认启用。
  const effectiveLibrary: SplitLibraryConfig | undefined =
    library === false
      ? undefined
      : {
          label: tt("库"),
          open: rightOpen,
          onOpenChange: setRightOpen,
          paneTitle: tt("库"),
          ...(library || {}),
        };

  // 「所属 app」展示名：prop > appNames[site] > site_id 本身。空则不显示标签。
  const resolvedApp =
    appLabelProp || (taskSiteId ? appNames?.[taskSiteId] || taskSiteId : "");
  // 左栏标题：「agent」+（有 app 时）所属 app 小标签。（「返回」+ 本次对话总结改到
  // 顶栏，见下方 topBar，对齐 OperatorConsole 顶栏 / 操作员 2026-07-06 参考图。）
  const leftLabelNode = resolvedApp ? (
    <span className="flex items-center gap-2">
      <span className="text-[12px] font-medium text-stone-500">agent</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
        {tt("所属 app · {app}", { app: resolvedApp })}
      </span>
    </span>
  ) : (
    "agent"
  );

  // 本次对话「总结」= 后端自动生成的 task.title（agent_engine._finalize_extras：首轮
  // 收尾时 AI 概括≤14 字会话标题，存 agent_tasks.title；getTask 已带回）。全 OceanLeo
  // 系列 agent 都走同一后端，故任何站的对话都有这个总结——这里在顶栏「返回」右侧显示它。
  const convoSummary = (taskTitle || "").trim();

  // 顶栏右上角「模型选择」：与 OperatorConsole 同款——从 AppShell 透传的 modelConfig
  // 取模态（各站零接线），渲染到本组件顶栏那一行的右侧，并通知 AppShell 隐藏它 header
  // 里那条模型选择（否则「模型选择」在上、返回在下 = 两行浪费空间，正是操作员截图的病）。
  const { setSuppressHeaderModel, modelConfig } = useShellChrome();
  const topBarActive = Boolean(onBack);
  const showModelPicker = topBarActive && Boolean(modelConfig?.categories?.length);
  useEffect(() => {
    if (!showModelPicker) return;
    setSuppressHeaderModel(true);
    return () => setSuppressHeaderModel(false);
  }, [showModelPicker, setSuppressHeaderModel]);
  const topBarModelPicker = showModelPicker ? (
    <ModelPicker
      categories={modelConfig!.categories as ModelCategory[]}
      siteId={modelConfig!.siteId}
      apiHref={modelConfig!.apiHref}
      variant="popover"
      align="right"
    />
  ) : null;

  // 顶栏（操作员 2026-07-06，对齐参考图 bc92f732 + OperatorConsole.topBar 样式）：
  // 一行搞定 —— 左「‹ 返回」pill + 本次对话总结，右「模型选择 ▾」。给了 onBack 才渲染。
  // 顶栏就是页面最上面那一行（AppShell header 已被 suppress 隐藏），不再多占一行。
  const TOPBAR_H = 52;
  const topBar = topBarActive ? (
    <div className="flex shrink-0 items-center gap-3 px-4 py-2.5" style={{ minHeight: TOPBAR_H }}>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-stone-600 transition hover:bg-stone-50 active:scale-95"
        title={backLabel ?? tt("返回")}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {backLabel ?? tt("返回")}
      </button>
      {/* 本次对话总结（task.title）。生成前先留空白/占位，避免抖动。 */}
      {convoSummary ? (
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-stone-700" title={convoSummary}>
          {convoSummary}
        </span>
      ) : messages.length > 0 ? (
        <span className="min-w-0 flex-1 truncate text-[13px] text-stone-400">
          {tt("正在总结本次对话…")}
        </span>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      {topBarModelPicker && <div className="shrink-0">{topBarModelPicker}</div>}
    </div>
  ) : null;

  // @成员选择器（doctrine 2026-07-09）：把「@名字 」插进输入框。与站点原有的
  // composerInlineSlot（如专家团 roster 按钮）拼在同一行。
  const appendMention = useCallback((name: string) => {
    setInput((v) => {
      const sep = v && !v.endsWith(" ") ? " " : "";
      return `${v}${sep}@${name} `;
    });
  }, []);
  const inlineSlot =
    mentionMembers && mentionMembers.length ? (
      <span className="inline-flex items-center gap-1">
        <MentionPicker members={mentionMembers} onPick={appendMention} accent={accent} />
        {composerInlineSlot}
      </span>
    ) : (
      composerInlineSlot
    );

  const stream = (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* 对话内容与下方输入框同宽、居中：读感更集中，气泡不再拉满整栏。 */}
        <div className="mx-auto w-full max-w-2xl space-y-3">
          {messages.length === 0 && !running && (
            <div className="py-10 text-center text-[15px] text-stone-400">
              {emptyHint ?? tt("在下方输入，开始与 agent 对话。")}
            </div>
          )}
          {messages.map((m, i) => (
            <MessageBubble
              key={m.id}
              m={m}
              streaming={running && i === lastAssistantIdx}
            />
          ))}
          {running && (
            <div className="flex items-center gap-2 text-[14px] text-stone-400">
              <span className="v-spinner" /> {tt("agent 正在思考…")}
            </div>
          )}
          {/* 灵感（回答完成后给 3 个可点追问，对照 Manus）：从上到下渐变显示
              （不是流式，是错峰淡入）；点了直接发送。 */}
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
      <div className="shrink-0 border-t border-stone-100 px-3 py-3">
        {/* 输入框收窄居中（操作员 2026-07-01）：不再铺满整栏，限宽 + 居中，
            与主站首页 max-w-3xl 输入框的占比观感一致，左右不再过宽。 */}
        <div className="mx-auto w-full max-w-2xl space-y-2">
          {composerHeader}
          <LeoComposer
            value={input}
            onChange={setInput}
            onSubmit={send}
            loading={running}
            onStop={() => void stop()}
            leoSuggest
            inlineSlot={inlineSlot}
            placeholder={placeholder ?? tt("继续追问，或上传文件让 agent 分析…")}
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

  // OceanLeo 系列右边永远只有【一个】版面：默认收起（对话占满）；点「库」按钮或生成结果
  // (artifact)到达 → 展开右版面显示结果。右版面内容 = 最新 artifact，或空态提示。
  const resultPane = art
    ? renderArtifact?.(art.meta, art.content) ?? (
        <DefaultArtifact artifact={art.meta} content={art.content} />
      )
    : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-stone-400">
          <svg className="h-10 w-10 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M4 17l5-5 4 4 3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-[13px]">{tt("还没有生成结果。让 agent 帮你生成后，结果会显示在这里。")}</p>
        </div>
      );

  // 宗旨 v19：给了 libraryTabs → 右栏是全家桶统一的多标签库（生成结果 / 素材库 / 文件库，
  // 与其它站 app 右栏一致；「导航」由 ResultCanvas 依 guide 自动前插，agent 站无 guide 故
  // 不出现）。不给 → 旧的单 artifact 右版面（向后兼容）。
  // 「组织」板块（doctrine 2026-07-09，修：真节点图画布）：宿主用 <OrgCanvas> 渲染，把团队
  // 当 organization 展示（节点=成员、加成员、点节点看 prompt/工作、实时状态、minimap/缩放）。
  const orgTab: CanvasTab | null = renderOrgPanel
    ? {
        id: "org",
        label: tt("组织"),
        content: <div className="h-full">{renderOrgPanel({ messages, running })}</div>,
      }
    : null;

  const right: ReactNode = libraryTabs
    ? (() => {
        const tabs: CanvasTab[] = [
          ...(orgTab ? [orgTab] : []),
          { id: "result", label: libraryTabs.resultLabel || "生成结果", content: resultPane },
        ];
        if (libraryTabs.materials && libraryTabs.materials.length) {
          tabs.push({
            id: "material",
            label: "素材库",
            content: <MaterialLibrary materials={libraryTabs.materials} accent={accent} />,
          });
        } else {
          // 素材库标签恒在（与其它 app 一致），无素材时走空态。
          tabs.push({
            id: "material",
            label: "素材库",
            content: <MaterialLibrary materials={[]} accent={accent} />,
          });
        }
        if (libraryTabs.showFiles !== false) {
          tabs.push({ id: "files", label: "文件库", content: <ArtifactLibrary accent={accent} fill /> });
        }
        return <ResultCanvas tabs={tabs} active={libTab} onChange={setLibTab} accent={accent} />;
      })()
    : resultPane;

  // 高度账（关键）：本组件顶栏出现时会 suppress 掉 AppShell 那条 header。
  //  - 顶栏出现且 suppress 了 header（showModelPicker=true）：本组件占满全高 → 可用高度 = 100dvh。
  //  - 顶栏出现但没 suppress（无模型模态，罕见）：AppShell header 仍在 → 可用高度 = 100dvh-headerHeight。
  //  - 无顶栏（旧行为）：AppShell header 在 → SplitWorkspace 自算 100dvh-headerHeight。
  // SplitWorkspace body 高 = 100dvh - 其 headerHeight 参数；令其 body = 可用高 - TOPBAR_H。
  const availOffset = topBar ? (showModelPicker ? 0 : headerHeight) : headerHeight;
  const split = (
    <SplitWorkspace
      left={stream}
      right={right}
      leftLabel={leftLabelNode}
      rightLabel={art ? ARTIFACT_LABEL[art.meta.type] || art.meta.title || tt("结果") : tt("结果")}
      defaultRatio={0.46}
      storageKey={siteId ? `oceanleo_agent_split:${siteId}` : "oceanleo_agent_split"}
      accent={accent}
      headerHeight={topBar ? availOffset + TOPBAR_H : headerHeight}
      // AgentChat 的对话流/输入框内部已 max-w-2xl 居中，外层单栏不再二次限宽（否则双重收窄）。
      soloMaxWidth={null}
      library={effectiveLibrary}
    />
  );

  // 无顶栏（未给 onBack）：保持原样，直接返回分栏骨架。
  if (!topBar) return split;

  // 有顶栏：外层 flex 列 = 顶栏（返回 + 总结 + 模型选择）+ 分栏骨架。整列高 = 可用高，顶栏占
  // TOPBAR_H，分栏占剩余（其 body 自算 = 100dvh-(availOffset+TOPBAR_H) = 可用高-TOPBAR_H，对齐不溢出）。
  return (
    <div
      className="flex min-h-0 flex-col"
      style={{ height: `calc(100dvh - ${availOffset}px)` }}
    >
      {topBar}
      <div className="min-h-0 flex-1">{split}</div>
    </div>
  );
}

function MessageBubble({ m, streaming = false }: { m: AgentMessage; streaming?: boolean }) {
  const tt = useUI();
  const ARTIFACT_LABEL = artifactLabels(tt);
  if (m.role === "user") {
    const atts = m.meta?.attachments || [];
    return (
      <div className="flex flex-col items-end gap-1.5">
        {atts.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {atts.map((a, i) => (
              <UserAttachmentChip key={i} att={a} />
            ))}
          </div>
        )}
        {m.content && (
          // 用户气泡：黑字 + 浅灰气泡（操作员 2026-07-03，对照 Manus）——不再黑底白字。
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5 text-[15px] leading-relaxed text-neutral-900">
            {m.content}
          </div>
        )}
      </div>
    );
  }
  // assistant
  if (m.kind === "plan") {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3">
        <Markdown className="text-[15px] leading-relaxed">{m.content}</Markdown>
      </div>
    );
  }
  // 团队/组织成员的【自己回答】：署名气泡（doctrine 2026-07-09）——@所有人时用户能看到
  // 每个成员各自的思考/回答，而不是只有主管汇总。
  if (m.kind === "report") {
    return <WorkerReportBubble m={m} />;
  }
  if (m.kind === "step") {
    return <div className="px-1 text-[13px] font-medium text-stone-500">{m.content}</div>;
  }
  if (m.kind === "error") {
    return <div className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-600">{m.content}</div>;
  }
  // text / artifact (artifact's full content is mirrored to the right pane; in
  // the stream we just show a short note for artifact-final to avoid duplication)
  if (m.meta?.artifact && m.meta?.final) {
    return (
      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[14px] text-emerald-700">
        {tt("✅ 已生成结果，见右侧「{label}」面板。", {
          label: ARTIFACT_LABEL[m.meta.artifact.type] || tt("结果"),
        })}
      </div>
    );
  }
  // agent 回答：不带气泡框，直接黑字显示在背景上（操作员 2026-07-03，对照 Manus）。
  // 最新一条回答做流式打字机。
  return (
    <div className="max-w-full px-1 text-neutral-900">
      <TypewriterMarkdown content={m.content} active={streaming} />
    </div>
  );
}

// 团队/组织「@成员」选择器：输入框内部左下角一个「@」按钮，点开成员浮层，选谁就把
// 「@名字 」插进输入框。用户只 @ 某几个成员 → 后端只让 TA 们处理（doctrine 2026-07-09）。
function MentionPicker({
  members,
  onPick,
  accent = "#7c3aed",
}: {
  members: { agent_id: string; name: string; icon?: string }[];
  onPick: (name: string) => void;
  accent?: string;
}) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={tt("@ 某个成员：只让 TA 处理")}
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 text-[12px] font-medium text-stone-500 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-700"
        style={{ color: accent }}
      >
        @
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-9 left-0 z-20 max-h-64 w-56 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl">
            <p className="px-2 py-1 text-[11px] text-stone-400">{tt("@ 谁（可多选）")}</p>
            {members.map((m) => (
              <button
                key={m.agent_id}
                type="button"
                onClick={() => {
                  onPick(m.name);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-stone-700 hover:bg-stone-50"
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-violet-50 text-[12px]">
                  {m.icon || "✦"}
                </span>
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
              </button>
            ))}
            {members.length === 0 && (
              <p className="px-2 py-3 text-center text-[12px] text-stone-400">{tt("暂无成员")}</p>
            )}
          </div>
        </>
      )}
    </span>
  );
}

// 团队/组织成员的署名回答气泡：左侧一个成员头像/名字条 + 该成员自己的回答正文。
// 用一个稳定的浅色边框把它和主管的最终汇总（emerald）、普通 step（灰字）区分开。
function WorkerReportBubble({ m }: { m: AgentMessage }) {
  const tt = useUI();
  const name = (m.meta?.worker_name as string) || (m.meta?.worker as string) || tt("成员");
  const icon = (m.meta?.worker_icon as string) || "✦";
  return (
    <div className="rounded-2xl border border-stone-200 bg-white/70 px-3.5 py-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-violet-50 text-[13px]">
          {icon}
        </span>
        <span className="truncate text-[12px] font-semibold text-stone-700">{name}</span>
        <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-400">
          {tt("成员回答")}
        </span>
      </div>
      <Markdown className="text-[14px] leading-relaxed text-neutral-800">{m.content}</Markdown>
    </div>
  );
}

function UserAttachmentChip({ att }: { att: AgentAttachment }) {
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

function DefaultArtifact({ artifact, content }: { artifact: ArtifactMeta; content: string }) {
  if (artifact.type === "image" && artifact.url) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artifact.url} alt={artifact.title || ""} className="max-h-full max-w-full rounded-lg object-contain" />
      </div>
    );
  }
  // map / canvas / novel / ppt / sheet / doc / markdown → render markdown.
  // Each site may override via renderArtifact for a richer editor.
  // overflow-y-auto so long deliverables scroll inside the (flex-filled) pane.
  return (
    <div className="h-full overflow-y-auto p-5">
      <Markdown>{content}</Markdown>
    </div>
  );
}
