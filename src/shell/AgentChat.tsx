"use client";

// ============================================================================
// @oceanleo/ui — agent 工作界面 AgentChat（单一事实源）
// ----------------------------------------------------------------------------
// 首页输入框提交后进入的「agent」界面（聊天为主）。形态（操作员 2026-06-19）：
//   - 普通对话：单栏聊天流（不分屏）。
//   - 高级任务（产出地图/画布/小说/PPT/表格/文档等「格式化可编辑结果」）：
//     一分为二 —— 左栏 = AI 推导（消息流）、右栏 = 结果（可编辑）。
//   - 该次工作归属于 AppSession；live 用「新建任务」收存当前工作后刷新。
// 真实后端：createTask → 轮询 getTask → 渲染 messages + 取最新 artifact。
//
// 与「工作台」的区别：AgentChat 左栏以对话为主；工作台左栏以固定模板操控为主。
// 两者共用 SplitWorkspace 分栏骨架（可拖 + 大屏）。
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { SplitWorkspace, type SplitLibraryConfig } from "./SplitWorkspace";
import { ResultCanvas, type CanvasTab } from "./ResultCanvas";
import { type MaterialItem } from "./MaterialLibrary";
import { CloudBrowserPanel } from "./CloudBrowserPanel";
import {
  ArtifactRenderer,
  artifactToLibraryItem,
} from "./ArtifactRenderer";
import {
  normalizeWorkspaceAction,
  type WorkspaceActionEnvelope,
} from "./workspace-actions";
import {
  AgentTranscriptBubble,
  agentArtifactLabels,
} from "./AgentTranscriptBubble";
import { AgentProgress } from "./AgentProgress";
import { LeoComposer } from "./LeoComposer";
import {
  createTask,
  branchTask,
  followUp,
  getTask,
  stopTask,
  latestArtifact,
  type AgentAttachment,
  type AgentMessage,
  type ArtifactMeta,
} from "../lib/agent";
import { useAttachments } from "./useAttachments";
import type { ModelCategory } from "./ModelPicker";
import type { PreferredModel } from "../lib/auth/account";
import { useUI } from "../i18n/ui/useUI";
import {
  WorkspaceSessionProvider,
  useOptionalWorkspaceSession,
} from "./WorkspaceSession";
import { RestartDraftButton } from "./RestartDraftButton";
import {
  activeAgentProgressKey,
  buildAgentRenderItems,
  sameAgentMessages,
} from "../lib/agent-progress";
import { historySessionHref } from "./workspace-route";

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
  /**
   * 已有 agent task id（从历史记录点进来回看）；与 initialPrompt 二选一。
   * 省略时会复用最近的 WorkspaceSessionProvider.taskId；不在 Provider 内时保持旧行为。 */
  taskId?: string | null;
  /** 显式只读嵌入场景；历史任务默认仍可续聊或从任一用户消息创建分支。 */
  readOnly?: boolean;
  /** 模式：agent（默认，带规划循环 + artifact）| chat（纯对话）。 */
  mode?: "agent" | "chat";
  /** 绑定单个 agent（专家）。format "<site_id>.<fn_id>"，如 "agent.senior-engineer"。 */
  agentId?: string;
  /** 绑定一个「专家团」(agent.oceanleo.com)。format "team.<slug>"。 */
  teamId?: string;
  /** @deprecated 模型统一读取「AI 模型」页偏好；该覆盖值不再发送。 */
  agentModel?: string;
  /** @deprecated 模型统一读取「AI 模型」页偏好；该覆盖值不再发送。 */
  modelSelection?: Partial<Record<ModelCategory, PreferredModel>>;
  accent?: string;
  headerHeight?: number;
  /** 任务创建后回调（分支时同时返回新 aggregate id）。 */
  onTaskCreated?: (taskId: string, sessionId?: string) => void;
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
  /** 工作流人工确认门；主站任务页传入 resumeWorkflow。 */
  onGate?: (
    decision: "approve" | "reject",
    feedback: string,
  ) => Promise<void> | void;
  /**
   * 固定五槽位的兼容配置。宿主只需提供当前 app 精选素材；模板、预览、我的库和
   * 云端浏览器均由共享 ResultCanvas 统一装配。
   */
  libraryTabs?: AgentLibraryTabs;
}

/** agent 右栏多标签库配置（宗旨 v19）。 */
export interface AgentLibraryTabs {
  /** 当前 app 的精选素材；素材库槽位始终存在。 */
  materials?: MaterialItem[];
  /** @deprecated 「我的库」槽位始终存在。 */
  showFiles?: boolean;
  /** @deprecated 「云端浏览器」槽位始终存在。 */
  showBrowser?: boolean;
  /** 旧产物缺少标题时的预览卡片名。 */
  resultLabel?: string;
  /** 素材库工具栏「完整素材库」回调。 */
  onSeeAllMaterials?: () => void;
}

export function AgentChat(props: AgentChatProps) {
  const inheritedWorkspace = useOptionalWorkspaceSession();
  const router = useRouter();
  const startsFromHome =
    !inheritedWorkspace &&
    !props.taskId &&
    Boolean(
      props.siteId &&
        (props.initialPrompt?.trim() || props.initialAttachments?.length),
    );
  const onTaskCreated = useCallback(
    (taskId: string, sessionId?: string) => {
      props.onTaskCreated?.(taskId, sessionId);
      if (startsFromHome && sessionId) {
        router.replace(historySessionHref(sessionId));
      }
    },
    [props.onTaskCreated, router, startsFromHome],
  );
  if (!startsFromHome) {
    return <AgentChatInner {...props} />;
  }
  return (
    <WorkspaceSessionProvider
      siteId={props.siteId || ""}
      // Homepage-created conversations are a separate product surface from the
      // workspace's explicit “AI 助手” app. Sharing appId="agent" made the
      // workspace card resume homepage history and vice versa.
      appId="home-agent"
      title={props.initialPrompt?.trim().slice(0, 120) || "AI 助手"}
      resumeLatest={false}
    >
      <AgentChatInner {...props} onTaskCreated={onTaskCreated} />
    </WorkspaceSessionProvider>
  );
}

function AgentChatInner({
  siteId = "",
  initialPrompt,
  initialAttachments,
  taskId: explicitTaskId,
  readOnly: readOnlyProp = false,
  mode = "agent",
  agentId = "",
  teamId = "",
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
  onGate,
  libraryTabs,
  mentionMembers,
  renderOrgPanel,
}: AgentChatProps) {
  const tt = useUI();
  const ARTIFACT_LABEL = agentArtifactLabels(tt);
  const workspaceValue = useOptionalWorkspaceSession();
  const workspace =
    workspaceValue && (!siteId || workspaceValue.siteId === siteId)
      ? workspaceValue
      : null;
  const readOnly = readOnlyProp || Boolean(workspace?.readOnly);
  // 团队/组织页与所有生成结果都归入固定「预览」槽的卡片，不再占一级标签。
  const hasOrgPanel = Boolean(renderOrgPanel);
  const [libTab, setLibTab] = useState(hasOrgPanel ? "preview" : "template");
  const [workspaceAction, setWorkspaceAction] =
    useState<WorkspaceActionEnvelope | null>(null);
  // 团队默认开库；主页普通 agent 始终默认收起。新产物只在隐藏的库内更新，
  // 用户点结果卡或「库」按钮时才展开，避免主页 Enter 后页面自行改布局。
  const [rightOpen, setRightOpen] = useState(hasOrgPanel);
  const [localTaskId, setLocalTaskId] = useState<string | null>(
    explicitTaskId ?? null,
  );
  const [branchTaskId, setBranchTaskId] = useState<string | null>(null);
  const taskId =
    branchTaskId ||
    (explicitTaskId !== undefined
      ? explicitTaskId
      : workspace?.taskId || localTaskId);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState<string>("");
  // 「所属 app」展示名：优先 appLabel prop，其次从 task.site_id 解析。
  const [taskSiteId, setTaskSiteId] = useState<string>("");
  // 本次对话「总结」= 后端自动生成的 task.title（首轮收尾时 AI 概括，见 refresh）。
  const [taskTitle, setTaskTitle] = useState<string>("");
  const [input, setInput] = useState("");
  const [gateBusy, setGateBusy] = useState(false);
  const [branchFromMessageId, setBranchFromMessageId] = useState<number | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const loadedTaskRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const atts = useAttachments(siteId, setError);

  useEffect(() => {
    setBranchTaskId(null);
  }, [explicitTaskId, workspace?.sessionId]);

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput((v) => (v ? v + " " : "") + text);
  }, []);

  const refresh = useCallback(async (id: string) => {
    const r = await getTask(id);
    if (loadedTaskRef.current !== id) return "";
    if (r.ok && r.data) {
      const incoming = r.data.messages || [];
      setMessages((current) =>
        sameAgentMessages(current, incoming) ? current : incoming,
      );
      setStatus(r.data.task?.status || "");
      if (r.data.task?.site_id) setTaskSiteId(r.data.task.site_id);
      // 后端首轮收尾生成的会话总结（task.title）——拿到就更新（顶栏「返回」右侧显示）。
      if (r.data.task?.title) setTaskTitle(r.data.task.title);
      return r.data.task?.status || "";
    }
    return "";
  }, []);

  // Provider 可能先返回 session、随后才异步算出 task_id。task 真源变化时主动 refresh，
  // 不要求宿主重新挂载 AgentChat；切到无 task 的新 session 时也不能残留上一段消息。
  useEffect(() => {
    if (!taskId) {
      loadedTaskRef.current = "";
      setMessages([]);
      setStatus("");
      setTaskSiteId("");
      setTaskTitle("");
      return;
    }
    if (loadedTaskRef.current === taskId) return;
    loadedTaskRef.current = taskId;
    setMessages([]);
    setStatus("");
    setTaskSiteId("");
    setTaskTitle("");
    void refresh(taskId);
  }, [taskId, refresh]);

  useEffect(() => {
    if (explicitTaskId !== undefined || !workspace) return;
    setLocalTaskId(workspace.taskId);
  }, [
    explicitTaskId,
    workspace,
    workspace?.sessionId,
    workspace?.taskId,
  ]);

  // poll while running
  useEffect(() => {
    if (!taskId) return;
    if (status && status !== "running") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const s = await refresh(taskId);
      if (!cancelled && (!s || s === "running")) {
        timer = setTimeout(poll, 450);
      }
    };
    timer = setTimeout(poll, 120);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [taskId, status, refresh]);

  // keep the reasoning stream scrolled to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const start = useCallback(
    async (prompt: string, uploaded?: AgentAttachment[]) => {
      if (readOnly) {
        setError(tt("当前会话为只读状态。"));
        return false;
      }
      setBusy(true);
      setError(null);
      setMessages([
        {
          id: -1,
          role: "user",
          kind: "text",
          content: prompt,
          meta:
            uploaded && uploaded.length
              ? { attachments: uploaded }
              : undefined,
        },
      ]);

      let linkedSessionId = "";
      if (workspace) {
        const active =
          workspace.session ||
          (await workspace.ensureActive({ title: prompt }));
        linkedSessionId = active?.id || workspace.sessionId || "";
        if (!linkedSessionId) {
          setBusy(false);
          setError(workspace.error || tt("无法创建工作会话，请稍后重试。"));
          setMessages((current) =>
            current.filter((message) => message.id !== -1),
          );
          return false;
        }
      }

      const result = await createTask({
        prompt,
        mode,
        siteId,
        agentId,
        teamId,
        attachments: uploaded,
        promptOverride: promptOverride || undefined,
        sessionId: linkedSessionId || undefined,
      });
      setBusy(false);
      if (!result.ok || !result.data) {
        setMessages((current) =>
          current.filter((message) => message.id !== -1),
        );
        setError(
          result.status === 401
            ? tt("登录后即可使用 app。")
            : result.error || tt("创建任务失败"),
        );
        return false;
      }

      const createdTaskId = result.data.task_id;
      loadedTaskRef.current = createdTaskId;
      setLocalTaskId(createdTaskId);
      setStatus("running");
      let createdSessionId = linkedSessionId;
      if (workspace) {
        const bound = await workspace.bindTask(createdTaskId, prompt);
        createdSessionId = bound?.id || linkedSessionId;
      }
      onTaskCreated?.(createdTaskId, createdSessionId || undefined);
      void refresh(createdTaskId);
      return true;
    },
    [
      agentId,
      mode,
      onTaskCreated,
      promptOverride,
      readOnly,
      refresh,
      siteId,
      teamId,
      tt,
      workspace,
    ],
  );

  const continueInitialTask = useCallback(
    async (
      id: string,
      prompt: string,
      uploaded?: AgentAttachment[],
    ) => {
      if (readOnly) {
        setError(tt("当前会话为只读状态。"));
        return;
      }
      const effectivePrompt = prompt || tt("请分析我上传的文件。");
      const optimisticMessageId = Date.now();
      setBusy(true);
      setError(null);
      setMessages((current) => [
        ...current,
        {
          id: optimisticMessageId,
          role: "user",
          kind: "text",
          content: effectivePrompt,
          meta:
            uploaded && uploaded.length
              ? { attachments: uploaded }
              : undefined,
        },
      ]);
      const result = await followUp(id, effectivePrompt, uploaded);
      setBusy(false);
      if (!result.ok) {
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticMessageId),
        );
        setError(result.error || tt("发送失败"));
        return;
      }
      setStatus("running");
      // 对 ?q= 来说，已有 active free session 时 task 已经存在；成功接续后同样通知
      // 宿主清理一次性 query，避免既丢 prompt 又让 URL 永久残留 q。
      onTaskCreated?.(id);
      void refresh(id);
    },
    [onTaskCreated, readOnly, refresh, tt],
  );

  // initialPrompt 只能在 Provider 查完最近 session/task 后触发，避免加载中的空 task
  // 提前制造第二条 thread。历史模式不传 initialPrompt，因此只 refresh，不自动重跑。
  useEffect(() => {
    if (startedRef.current) return;
    if (workspace?.availability === "loading") return;
    startedRef.current = true;
    const hasInitial =
      Boolean(initialPrompt?.trim()) ||
      Boolean(initialAttachments && initialAttachments.length);
    if (!hasInitial) return;
    const prompt = (initialPrompt || "").trim();
    if (taskId) {
      // 只在 WorkspaceSessionProvider 场景接续已有 thread；旧的显式 taskId 调用仍保持
      // “只回看 task、忽略 initialPrompt”的兼容行为。
      if (workspace) {
        void continueInitialTask(taskId, prompt, initialAttachments);
      }
      return;
    }
    void start(prompt, initialAttachments);
  }, [
    continueInitialTask,
    initialAttachments,
    initialPrompt,
    start,
    taskId,
    workspace,
    workspace?.availability,
  ]);

  async function send() {
    const prompt = input.trim();
    // Allow send when there's an attachment even if the text is empty. But block
    // while any attachment is still uploading.
    const uploaded = atts.ready();
    if ((!prompt && uploaded.length === 0) || busy || atts.uploading) return;
    if (readOnly) {
      setError(tt("当前会话为只读状态。"));
      return;
    }
    const submittedInput = input;
    const submittedAttachments = atts.attachments;
    const restoreSubmission = () => {
      setInput((current) => (current ? current : submittedInput));
      atts.restoreReady(submittedAttachments);
    };
    setInput("");
    atts.clear();
    const effectivePrompt = prompt || tt("请分析我上传的文件。");
    if (!taskId) {
      const started = await start(effectivePrompt, uploaded);
      if (!started) restoreSubmission();
      return;
    }
    setBusy(true);
    if (branchFromMessageId) {
      const result = await branchTask(
        taskId,
        branchFromMessageId,
        effectivePrompt,
        uploaded,
      );
      setBusy(false);
      if (!result.ok || !result.data) {
        restoreSubmission();
        setError(result.error || tt("创建分支失败"));
        return;
      }
      const createdTaskId = result.data.task_id;
      const createdSessionId = String(result.data.session_id || "");
      setBranchFromMessageId(null);
      loadedTaskRef.current = createdTaskId;
      setLocalTaskId(createdTaskId);
      setBranchTaskId(createdTaskId);
      if (workspace && createdSessionId) {
        const adopted = await workspace.adoptSession(createdSessionId);
        if (!adopted) {
          setError(tt("分支已创建，但工作会话暂未同步；本次任务仍会继续运行。"));
        }
      }
      setMessages([
        {
          id: Date.now(),
          role: "user",
          kind: "text",
          content: effectivePrompt,
          meta: uploaded.length ? { attachments: uploaded } : undefined,
        },
      ]);
      setStatus("running");
      onTaskCreated?.(createdTaskId, createdSessionId || undefined);
      if (
        createdSessionId &&
        typeof window !== "undefined" &&
        window.location.pathname.includes("/history/")
      ) {
        window.history.replaceState(
          window.history.state,
          "",
          `/history/${encodeURIComponent(createdSessionId)}`,
        );
      }
      void refresh(createdTaskId);
      return;
    }
    const optimisticMessageId = Date.now();
    setMessages((m) => [
      ...m,
      { id: optimisticMessageId, role: "user", kind: "text", content: effectivePrompt,
        meta: uploaded.length ? { attachments: uploaded } : undefined },
    ]);
    const r = await followUp(taskId, effectivePrompt, uploaded);
    setBusy(false);
    if (r.ok) setStatus("running");
    else {
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessageId),
      );
      restoreSubmission();
      setError(r.error || tt("发送失败"));
    }
  }

  // 「中止」：AI 工作中（任务 running / 请求在途）点停止键 → 停任务。
  const stop = useCallback(async () => {
    if (readOnly) return;
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
  }, [readOnly, taskId, refresh]);

  // 启发式追问（后端在最终回答的 meta.suggestions 里给 3 个）——取最后一条 assistant
  // 消息上的 suggestions；一旦用户继续输入 / 任务重新 running 就消失。
  // 同时记录最新 assistant 文本条的 index，用于给它做流式打字机（其余条直接全量）。
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (
      messages[i].role === "assistant" &&
      (messages[i].kind === "text" || !messages[i].kind) &&
      messages[i].meta?.interim !== true
    ) {
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
      if (!taskId || busy || readOnly) return;
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
    [taskId, busy, readOnly, tt],
  );

  const artifactMessages = useMemo(
    () => messages.filter((message) => Boolean(message.meta?.artifact)),
    [messages],
  );
  const latestArtifactMessage =
    artifactMessages[artifactMessages.length - 1] || null;
  const art = latestArtifact(messages);
  const running = status === "running" || busy;
  const lastMessage = messages[messages.length - 1];
  const responseComplete =
    !busy &&
    lastMessage?.role === "assistant" &&
    Boolean(lastMessage.meta?.done || lastMessage.meta?.final);
  // Title/suggestion post-processing may keep the task row "running" briefly
  // after the answer is already durable. Never describe that background work
  // as the Agent still thinking.
  const showThinking = running && !responseComplete;
  const renderItems = buildAgentRenderItems(messages);
  const activeProgressKey = activeAgentProgressKey(renderItems, messages);
  const activeGateId =
    status === "waiting_user"
      ? [...messages].reverse().find((message) => message.kind === "gate")?.id
      : undefined;

  const handleGate = useCallback(
    async (decision: "approve" | "reject", feedback: string) => {
      if (!onGate || gateBusy) return;
      setGateBusy(true);
      setError(null);
      try {
        await onGate(decision, feedback);
        if (taskId) await refresh(taskId);
      } catch (gateError) {
        setError(
          gateError instanceof Error ? gateError.message : tt("操作失败"),
        );
      } finally {
        setGateBusy(false);
      }
    },
    [gateBusy, onGate, refresh, taskId, tt],
  );

  // 每一个 artifact 都是「预览」中的独立卡片；新产物到达时只消费一次并打开该卡。
  const seenArtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!latestArtifactMessage || latestArtifactMessage.id === seenArtRef.current)
      return;
    seenArtRef.current = latestArtifactMessage.id;
    setLibTab("preview");
    setWorkspaceAction({
      nonce: `artifact:${latestArtifactMessage.id}`,
      action: {
        version: 1,
        tab: "preview",
        itemId: `preview:artifact-${latestArtifactMessage.id}`,
      },
    });
  }, [latestArtifactMessage]);

  // Only signed tool receipts are persisted by the gateway as ui_action.
  // Assistant prose is deliberately never parsed for UI commands.
  const latestActionMessage = [...messages]
    .reverse()
    .find(
      (message) =>
        message.kind === "ui_action" && message.meta?.verified === true,
    );
  const seenActionRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      !latestActionMessage ||
      latestActionMessage.id === seenActionRef.current
    )
      return;
    const action = normalizeWorkspaceAction(
      latestActionMessage.meta?.workspace_action ||
        latestActionMessage.meta?.ui_action,
    );
    if (!action) return;
    seenActionRef.current = latestActionMessage.id;
    setLibTab(action.tab);
    setWorkspaceAction({
      nonce: `message:${latestActionMessage.id}`,
      action,
    });
  }, [latestActionMessage]);

  // Rolling-deploy fallback for old backend browse receipts that predate
  // ui_action. Once a signed ui_action exists, it is the sole authority.
  useEffect(() => {
    if (latestActionMessage) return;
    const browserActivity = [...messages].reverse().find((message) => {
      const tool = String(message.meta?.tool || "");
      return tool === "browse" || tool.startsWith("browser_");
    });
    const takeover = [...messages].reverse().find(
      (message) =>
        message.role !== "user" &&
        message.content.includes("接管") &&
        (message.content.includes("浏览器") ||
          message.content.includes("登录") ||
          message.content.includes("验证码") ||
          message.content.includes("支付")),
    );
    if ((!browserActivity && !takeover) || art) return;
    setLibTab("browser");
    setWorkspaceAction({
      nonce: `legacy-browser:${browserActivity?.id || takeover?.id || "open"}`,
      action: { version: 1, tab: "browser" },
    });
  }, [art, latestActionMessage, messages]);

  // 关键修（操作员 2026-07-09：「团队 app 一打开库是折叠的」）：团队对话的 renderOrgPanel
  // 往往是 **异步** 就绪的（宿主先 setSel({kind:"team"}) 建壳、再 await 拉成员补 members，
  // 之后 renderOrgPanel 才从 undefined 变有值）。仅靠 useState 初始值 = hasOrgPanel 覆盖不到
  // 这个「挂载后才变 true」的情形 → 库仍是初始的关。这里用一次性 ref：hasOrgPanel 第一次
  // 变 true 时，强制【开库 + 打开预览里的组织卡】。只做一次，之后不再抢焦点。
  const orgAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (hasOrgPanel && !orgAutoOpenedRef.current) {
      orgAutoOpenedRef.current = true;
      setRightOpen(true);
      setLibTab("preview");
      setWorkspaceAction({
        nonce: "organization:first-open",
        action: { version: 1, tab: "preview", itemId: "preview:org" },
      });
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
  const agentIdentityLabel = resolvedApp ? (
    <span className="flex items-center gap-2">
      <span className="text-[12px] font-medium text-stone-500">agent</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
        {tt("所属 app · {app}", { app: resolvedApp })}
      </span>
    </span>
  ) : (
    "agent"
  );
  const leftLabelNode = workspace ? (
    <span className="flex min-w-0 items-center gap-2">
      {agentIdentityLabel}
      {workspace.mode !== "history" && (
        <RestartDraftButton
          label={tt("新建")}
          className="inline-flex shrink-0 items-center rounded-lg border border-stone-200 px-2.5 py-1 text-[12px] font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 active:scale-95 disabled:opacity-50"
        />
      )}
    </span>
  ) : (
    agentIdentityLabel
  );

  // 本次对话「总结」= 后端自动生成的 task.title（agent_engine._finalize_extras：首轮
  // 收尾时 AI 概括≤14 字会话标题，存 agent_tasks.title；getTask 已带回）。全 OceanLeo
  // 系列 agent 都走同一后端，故任何站的对话都有这个总结——这里在顶栏「返回」右侧显示它。
  const convoSummary = (taskTitle || "").trim();

  const topBarActive = Boolean(onBack);

  // 顶栏（操作员 2026-07-06，对齐参考图 bc92f732 + OperatorConsole.topBar 样式）：
  // 一行搞定 —— 左「‹ 返回」pill + 本次对话总结。给了 onBack 才渲染。
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

  const openArtifactMessage = useCallback((message: AgentMessage) => {
    setRightOpen(true);
    setLibTab("preview");
    setWorkspaceAction({
      nonce: `artifact-click:${message.id}:${Date.now()}`,
      action: {
        version: 1,
        tab: "preview",
        itemId: `preview:artifact-${message.id}`,
        url: message.meta?.artifact?.url,
      },
    });
  }, []);

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
          {renderItems.map((item) =>
            item.type === "progress" ? (
              <AgentProgress
                key={item.key}
                messages={item.messages}
                running={showThinking && item.key === activeProgressKey}
                accent={accent}
              />
            ) : (
              <AgentTranscriptBubble
                key={item.key}
                message={item.message}
                streaming={running && item.index === lastAssistantIdx}
                onArtifactOpen={
                  item.message.meta?.artifact
                    ? () => openArtifactMessage(item.message)
                    : undefined
                }
                onBranch={
                  !running &&
                  !readOnly &&
                  item.message.role === "user" &&
                  item.message.id > 0
                    ? () => {
                        setBranchFromMessageId(item.message.id);
                        setInput(item.message.content);
                      }
                    : undefined
                }
                gateActive={item.message.id === activeGateId}
                gateBusy={gateBusy}
                onGate={onGate ? handleGate : undefined}
              />
            ),
          )}
          {showThinking && !activeProgressKey && (
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
          {branchFromMessageId && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-indigo-50 px-3 py-2 text-[12px] text-indigo-700">
              <span>{tt("将从所选消息之前创建新分支；原对话保持不变。")}</span>
              <button
                type="button"
                onClick={() => setBranchFromMessageId(null)}
                className="shrink-0 font-medium underline underline-offset-2"
              >
                {tt("取消")}
              </button>
            </div>
          )}
          <LeoComposer
            value={input}
            onChange={setInput}
            onSubmit={() => void send()}
            loading={running}
            onStop={() => void stop()}
            disabled={readOnly}
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

  // Every generated item becomes a Preview card. Existing organization and
  // browser surfaces are also legacy tabs consumed by the fixed five-slot shell.
  const orgTab: CanvasTab | null = renderOrgPanel
    ? {
        id: "org",
        label: tt("组织"),
        content: <div className="h-full">{renderOrgPanel({ messages, running })}</div>,
      }
    : null;
  const artifactTabs: CanvasTab[] = artifactMessages.map((message, index) => {
    const meta = message.meta!.artifact!;
    const libraryItem = artifactToLibraryItem(
      meta,
      message.content,
      `artifact-${message.id}`,
    );
    return {
      id: `artifact-${message.id}`,
      label:
        meta.title ||
        ARTIFACT_LABEL[meta.type] ||
        `${libraryTabs?.resultLabel || tt("预览")} ${index + 1}`,
      content:
        renderArtifact?.(meta, message.content) ?? (
          <DefaultArtifact artifact={meta} content={message.content} />
        ),
      libraryItem: renderArtifact ? undefined : libraryItem,
    };
  });
  const rightTabs: CanvasTab[] = [
    ...(orgTab ? [orgTab] : []),
    ...artifactTabs,
    {
      id: "browser",
      label: tt("云端浏览器"),
      content: <CloudBrowserPanel taskId={taskId} accent={accent} />,
    },
  ];
  const right: ReactNode = (
    <ResultCanvas
      tabs={rightTabs}
      materials={libraryTabs?.materials || []}
      onSeeAllMaterials={libraryTabs?.onSeeAllMaterials}
      active={libTab}
      onChange={setLibTab}
      accent={accent}
      action={workspaceAction}
      showTemplate={siteId !== "oceanleo"}
      taskId={taskId}
      siteId={siteId}
    />
  );

  // 高度账：有返回顶栏时它是页面最上面一行；无顶栏时沿用调用方传入的外层占高。
  // SplitWorkspace body 高 = 100dvh - 其 headerHeight 参数；令其 body = 可用高 - TOPBAR_H。
  const availOffset = topBar ? 0 : headerHeight;
  const split = (
    <SplitWorkspace
      left={stream}
      right={right}
      leftLabel={leftLabelNode}
      rightLabel={tt("预览")}
      defaultRatio={0.46}
      storageKey={siteId ? `oceanleo_agent_split:${siteId}` : "oceanleo_agent_split"}
      accent={accent}
      headerHeight={topBar ? availOffset + TOPBAR_H : headerHeight}
      // 有顶栏时：外层 flex 列自己算高（下方 return），SplitWorkspace 用 fillParent 填满剩余。
      // 无顶栏时（宿主如主站 tasks 页已用 <header>+<main flex-1> 约束高度）：也用 fillParent
      // 填满父容器，杜绝「相对 100dvh 记账 → 比父容器高一截 → 从历史重开输入框上移、上面
      // 内容被挤出」（操作员 2026-07-12）。
      fillParent
      // AgentChat 的对话流/输入框内部已 max-w-2xl 居中，外层单栏不再二次限宽（否则双重收窄）。
      soloMaxWidth={null}
      library={effectiveLibrary}
    />
  );

  // 无顶栏（未给 onBack）：宿主已约束高度，直接返回分栏骨架（fillParent 填满宿主容器）。
  if (!topBar) return split;

  // 有顶栏：外层 flex 列 = 顶栏（返回 + 总结）+ 分栏骨架。整列高 = 可用高，顶栏占
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

function DefaultArtifact({ artifact, content }: { artifact: ArtifactMeta; content: string }) {
  // 宗旨 v22（操作员 2026-07-12）：不再「非图片就一坨 Markdown」。统一走可复用成品渲染器
  // ArtifactRenderer——它按 type/URL 后缀分发到 图片/视频/音频/幻灯(Office 预览)/表格/文档/
  // 小红书图文/网页实时预览/3D 的富形态，兜底才 Markdown。宿主仍可用 renderArtifact 完全接管。
  return <ArtifactRenderer artifact={artifact} content={content} />;
}
