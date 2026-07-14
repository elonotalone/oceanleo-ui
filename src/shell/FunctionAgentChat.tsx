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
import { AgentTranscriptBubble } from "./AgentTranscriptBubble";
import { AgentProgress } from "./AgentProgress";
import { LeoComposer } from "./LeoComposer";
import { useLeftPaneSlot } from "./SplitWorkspace";
import { useRegisterOpsFiller, useGuideWorkflows, FillNonceProvider } from "./guide-context";
import { type WorkflowDraft } from "../lib/workflows";
import { useAttachments } from "./useAttachments";
import {
  createTask,
  branchTask,
  followUp,
  getTask,
  stopTask,
  type AgentMessage,
  type ArtifactMeta,
} from "../lib/agent";
import { type OpsPatch, type OpsSchema } from "../lib/fn-agent";
import { useUI } from "../i18n/ui/useUI";
import { useOptionalWorkspaceSession } from "./WorkspaceSession";
import { RestartDraftButton } from "./RestartDraftButton";
import { useWorkspaceRuntimeHydration } from "./workspace-runtime-hydration";
import {
  dispatchWorkspaceAction,
  normalizeWorkspaceAction,
} from "./workspace-actions";
import {
  mergeWorkspaceSessionSnapshot,
  splitWorkspaceSessionSnapshot,
} from "./workspace-session-snapshot";
import {
  OperatorRemarkField,
  useOperatorRemark,
} from "./OperatorRemark";
import { appendOperatorRemark } from "../lib/operator-remark";
import {
  activeAgentProgressKey,
  buildAgentRenderItems,
  sameAgentMessages,
  takeUnreportedAgentArtifacts,
} from "../lib/agent-progress";

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
  /**
   * 受控 agent task。省略时优先复用 WorkspaceSessionProvider 的 task_id，再回退组件自管。
   * 传 null 可明确要求从空 thread 开始。 */
  taskId?: string | null;
  /** 新建 task 后回报给宿主；Provider 存在时也会同步 bindTask。 */
  onTaskIdChange?: (taskId: string | null) => void;
  /** 无 Provider 时可显式把新 task 绑定到已知工作会话。 */
  sessionId?: string | null;
  /** 操作台 schema（功能区名/字段说明；agent 不读 state，仅用 schema.title 等展示）。 */
  schema: OpsSchema;
  /** 操作台页内容（各站现成的 StudioSection 表单 + **底部生成主按钮**）。 */
  opsContent: React.ReactNode;
  /**
   * 返回当前操作台 state 的快照（key → value）。宗旨 v16.1（2026-07-06）复活用途：
   * 「保存模板」按钮据此**自动派生**要保存的 { prompt, params, remark }（站点没显式传
   * getWorkflowDraft 时）——多数站早已传 getOpsState，故无需再改一行即获得保存模板。
   * agent 仍不读它（agent 与操作台独立，宗旨 v10）——仅用户点「保存模板」时读一次。 */
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
   * 完整工作会话快照。与 getOpsState（只服务「保存模板」的可复用输入）分离，允许站点
   * 一并保存右栏结果、大纲、画布、上传资源等运行态。省略时兼容回退到 getOpsState。 */
  getSessionSnapshot?: () => Record<string, unknown>;
  /**
   * 恢复完整工作会话快照。省略时把 snapshot 作为 patch.set 交给 onApplyPatch。 */
  onRestoreSessionSnapshot?: (snapshot: Record<string, unknown>) => void;
  /**
   * 把完整 runtime state 接成版本化 AppSession 快照。默认开启；少数自行调用
   * useConsoleDraft 管理同一 session 的 runtime 可关闭，避免双写。 */
  manageSessionSnapshot?: boolean;
  /** 当前操作台快照 schema 版本；默认 1。 */
  sessionSchemaVersion?: number;
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
  /** @deprecated 模型统一读取「AI 模型」页偏好；该覆盖值不再发送。 */
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
    opts?: {
      imageUrl?: string;
      set?: Record<string, unknown>;
      remark?: string;
      data?: unknown;
    },
  ) => void;
  /**
   * 「保存模板」：给了它 → 左栏标题「操作台 | agent」开关右侧出现「保存模板」按钮。
   * 点击时调用它拿到当前操作台输入的快照（{ label?, prompt, params?, remark? }），
   * 存进右栏「模板 · 我的」类别供一键复用。
   * 返回 null / prompt 为空 → 提示用户先填写。站点从自己的操作台 state 拼这份草稿。 */
  getWorkflowDraft?: () => WorkflowDraft | null;
  /**
   * 操作台「恒定主按钮」（宗旨 v18，操作员 2026-07-07）：给了它 → 操作台形态下，此节点
   * （通常是「生成图片 / 生成视频 / 开始搭建」主按钮）**固定在操作台最底部**，其余输入/
   * 选择框在其上方的可滚动区里随意展开折叠都不影响它显示。按钮条顶部叠一层从透明到底色
   * 的**半透明渐隐遮罩**，让滚动内容在按钮上方渐隐、不露出输入框边框缝隙（修截图
   * 43873e9b）。不给则操作台无恒定按钮（主按钮仍可内联写在 opsContent 里，旧行为）。
   */
  stickyAction?: React.ReactNode;
}

// 左栏双形态：操作台（表单 + 生成）/ agent（有能力、带工具，独立于操作台）。
type FnTab = "ops" | "agent";

export function FunctionAgentChat({
  agentId,
  siteId = "",
  taskId: controlledTaskId,
  onTaskIdChange,
  sessionId: explicitSessionId,
  schema,
  opsContent,
  getOpsState,
  onApplyPatch,
  getSessionSnapshot,
  onRestoreSessionSnapshot,
  manageSessionSnapshot = true,
  sessionSchemaVersion = 1,
  opsPrimaryField,
  onArtifact,
  onRunAction: _onRunAction,
  accent = "#4f46e5",
  opsLabel: opsLabelProp,
  defaultTab = "ops",
  showOps = true,
  appLabel,
  appIcon,
  onGuideExample,
  getWorkflowDraft,
  stickyAction,
}: FunctionAgentChatProps) {
  void _onRunAction;
  const tt = useUI();
  const workspaceValue = useOptionalWorkspaceSession();
  const workspace =
    workspaceValue && (!siteId || workspaceValue.siteId === siteId)
      ? workspaceValue
      : null;
  const runtimeHydration = useWorkspaceRuntimeHydration();
  const {
    remark: operatorRemark,
    setRemark: setOperatorRemark,
  } = useOperatorRemark();
  const sessionReadOnly = workspace?.readOnly ?? false;
  const readSessionSnapshot = getSessionSnapshot || getOpsState;
  const restoreSessionSnapshot = onRestoreSessionSnapshot
    ? onRestoreSessionSnapshot
    : onApplyPatch
      ? (snapshot: Record<string, unknown>) =>
          onApplyPatch({ set: snapshot })
      : undefined;
  const readSessionSnapshotRef = useRef(readSessionSnapshot);
  const restoreSessionSnapshotRef = useRef(restoreSessionSnapshot);
  const hasSessionSnapshotReader = Boolean(readSessionSnapshot);
  const hasSessionSnapshotRestorer = Boolean(restoreSessionSnapshot);
  useEffect(() => {
    readSessionSnapshotRef.current = readSessionSnapshot;
    restoreSessionSnapshotRef.current = restoreSessionSnapshot;
  });
  const opsLabel = opsLabelProp ?? tt("操作台");
  // 无操作台表单的纯对话功能区：强制 agent 形态、不显示切换键。
  const [tab, setTab] = useState<FnTab>(showOps ? defaultTab : "agent");
  const [localTaskId, setLocalTaskId] = useState<string | null>(null);
  const [branchTaskId, setBranchTaskId] = useState<string | null>(null);
  const taskId =
    branchTaskId ||
    (controlledTaskId !== undefined
      ? controlledTaskId
      : workspace?.taskId || localTaskId);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [messagesTaskId, setMessagesTaskId] = useState("");
  const [status, setStatus] = useState("");
  const [input, setInput] = useState("");
  const [branchFromMessageId, setBranchFromMessageId] = useState<number | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reportedArtifactIdsRef = useRef<Set<number>>(new Set());
  const seenWorkspaceActionIdsRef = useRef<Set<number>>(new Set());
  const loadedTaskRef = useRef("");
  const atts = useAttachments(siteId, setError);
  const sessionSnapshotScopeRef = useRef("");
  const sessionSnapshotReadyRef = useRef(false);
  const sessionSnapshotBaselineRef = useRef("");
  const sessionSnapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const sessionSnapshotFlushRef = useRef<(() => Promise<void>) | null>(null);
  const restartFlushRef = useRef<() => Promise<boolean>>(
    async () => true,
  );
  const sendRef = useRef<(override?: string) => Promise<void>>(async () => {});

  // 同一个真实 runtime 同时服务 live `/workspace/<appId>` 与
  // `/history/<sessionId>`：Provider 给身份，这里把各站已经存在的
  // 完整 runtime adapter 接成统一版本化快照；没单独接线的站兼容回退到 ops adapter。
  useEffect(() => {
    if (workspace?.availability === "loading") {
      sessionSnapshotScopeRef.current = "";
      sessionSnapshotReadyRef.current = false;
      return;
    }
    if (runtimeHydration && !runtimeHydration.appInitialized) return;
    if (
      !manageSessionSnapshot ||
      !workspace ||
      !showOps ||
      !hasSessionSnapshotReader ||
      !hasSessionSnapshotRestorer
    ) {
      sessionSnapshotScopeRef.current = "";
      sessionSnapshotReadyRef.current = false;
      runtimeHydration?.markRuntimeReady();
      return;
    }
    const scope = `${workspace.mode}:${workspace.siteId}:${workspace.appId}:${
      workspace.session?.id || "new"
    }:v${sessionSchemaVersion}`;
    if (sessionSnapshotScopeRef.current === scope) return;
    sessionSnapshotScopeRef.current = scope;
    sessionSnapshotReadyRef.current = false;
    sessionSnapshotBaselineRef.current = "";
    sessionSnapshotFlushRef.current = null;
    if (sessionSnapshotTimerRef.current) {
      clearTimeout(sessionSnapshotTimerRef.current);
    }

    const active = workspace.session;
    const raw = active?.snapshot;
    if (
      raw !== undefined &&
      raw !== null &&
      typeof raw === "object" &&
      !Array.isArray(raw)
    ) {
      if ((active?.schema_version || 1) !== sessionSchemaVersion) {
        setError(
          tt(
            `工作会话快照版本 ${active?.schema_version || 1} 与当前版本 ${sessionSchemaVersion} 不兼容，未自动覆盖操作台。`,
          ),
        );
        runtimeHydration?.markRuntimeReady();
        return;
      }
      let serialized = "";
      const split = splitWorkspaceSessionSnapshot(
        raw as Record<string, unknown>,
      );
      try {
        serialized = JSON.stringify(
          mergeWorkspaceSessionSnapshot(split.runtime, split.ui),
        );
      } catch {
        setError(tt("工作会话快照格式无效，未自动覆盖操作台。"));
        runtimeHydration?.markRuntimeReady();
        return;
      }
      sessionSnapshotBaselineRef.current = serialized;
      sessionSnapshotReadyRef.current = true;
      runtimeHydration?.restoreSharedUi(split.ui);
      restoreSessionSnapshotRef.current?.(split.runtime);
      runtimeHydration?.markRuntimeReady();
      return;
    }

    try {
      sessionSnapshotBaselineRef.current = JSON.stringify(
        mergeWorkspaceSessionSnapshot(
          readSessionSnapshotRef.current?.() || {},
          runtimeHydration?.snapshotSharedUi(),
        ),
      );
      sessionSnapshotReadyRef.current = true;
      runtimeHydration?.markRuntimeReady();
    } catch {
      setError(tt("当前操作台状态无法保存为工作会话。"));
      runtimeHydration?.markRuntimeReady();
    }
  }, [
    manageSessionSnapshot,
    workspace?.mode,
    workspace?.siteId,
    workspace?.appId,
    workspace?.availability,
    workspace?.session?.id,
    workspace?.session?.schema_version,
    hasSessionSnapshotReader,
    hasSessionSnapshotRestorer,
    showOps,
    sessionSchemaVersion,
    runtimeHydration,
  ]);

  const flushCurrentSnapshotForRestart = useCallback(async (): Promise<boolean> => {
    if (
      !manageSessionSnapshot ||
      !workspace ||
      !showOps ||
      !readSessionSnapshotRef.current ||
      !sessionSnapshotReadyRef.current ||
      workspace.readOnly ||
      workspace.availability === "loading"
    ) {
      return true;
    }
    if (sessionSnapshotTimerRef.current) {
      clearTimeout(sessionSnapshotTimerRef.current);
      sessionSnapshotTimerRef.current = null;
    }
    // A scheduled debounce captured an older render. Discard it and serialize
    // the current runtime synchronously so Restart can never archive stale data.
    sessionSnapshotFlushRef.current = null;
    let serialized = "";
    let snapshot: Record<string, unknown>;
    try {
      serialized = JSON.stringify(
        mergeWorkspaceSessionSnapshot(
          readSessionSnapshotRef.current() || {},
          runtimeHydration?.snapshotSharedUi(),
        ),
      );
      snapshot = JSON.parse(serialized) as Record<string, unknown>;
    } catch {
      setError(tt("当前操作台状态无法保存为工作会话。"));
      return false;
    }
    if (serialized === sessionSnapshotBaselineRef.current) return true;
    const result = await workspace.saveSnapshot(
      snapshot,
      sessionSchemaVersion,
      {
        title: appLabel || workspace.appTitle || schema.title,
        expectedSessionId: workspace.session?.id,
      },
    );
    if (result.ok) {
      sessionSnapshotBaselineRef.current = serialized;
      return true;
    }
    setError(
      result.conflict
        ? tt("这份工作已在另一个页面更新。当前页面不会静默覆盖，请刷新后再继续。")
        : result.error || tt("当前工作保存失败，未保存至我的任务。"),
    );
    return false;
  }, [
    manageSessionSnapshot,
    workspace,
    showOps,
    sessionSchemaVersion,
    appLabel,
    schema.title,
    tt,
    runtimeHydration,
  ]);
  restartFlushRef.current = flushCurrentSnapshotForRestart;
  useEffect(() => {
    if (!runtimeHydration) return;
    runtimeHydration.registerBeforeLeave(
      () => restartFlushRef.current(),
    );
    return () => runtimeHydration.registerBeforeLeave(null);
  }, [runtimeHydration]);

  // 任何站点操作台 state 变化都会令 opsContent/getOpsState 随宿主重渲染。这里用完整 JSON
  // 比较 + debounce，只在真实变化后保存；初值不会创建空 session。
  useEffect(() => {
    if (
      !manageSessionSnapshot ||
      !workspace ||
      !showOps ||
      !readSessionSnapshot ||
      !restoreSessionSnapshot ||
      !sessionSnapshotReadyRef.current ||
      workspace.readOnly ||
      workspace.availability === "loading"
    ) {
      return;
    }
    let serialized = "";
    let snapshot: Record<string, unknown>;
    try {
      serialized = JSON.stringify(
        mergeWorkspaceSessionSnapshot(
          readSessionSnapshot() || {},
          runtimeHydration?.snapshotSharedUi(),
        ),
      );
      snapshot = JSON.parse(serialized) as Record<string, unknown>;
    } catch {
      return;
    }
    if (serialized === sessionSnapshotBaselineRef.current) {
      sessionSnapshotFlushRef.current = null;
      return;
    }
    if (sessionSnapshotTimerRef.current) {
      clearTimeout(sessionSnapshotTimerRef.current);
    }
    const flushSnapshot = async () => {
      if (sessionSnapshotFlushRef.current === flushSnapshot) {
        sessionSnapshotFlushRef.current = null;
      }
      sessionSnapshotTimerRef.current = null;
      const result = await workspace.saveSnapshot(
        snapshot,
        sessionSchemaVersion,
        {
          title: appLabel || workspace.appTitle || schema.title,
          expectedSessionId: workspace.session?.id,
        },
      );
      if (result.ok) {
        sessionSnapshotBaselineRef.current = serialized;
      } else if (result.conflict) {
        setError(
          tt("这份工作已在另一个页面更新。当前页面不会静默覆盖，请刷新后再继续。"),
        );
      }
    };
    sessionSnapshotFlushRef.current = flushSnapshot;
    const timer = setTimeout(() => void flushSnapshot(), 700);
    sessionSnapshotTimerRef.current = timer;
    return () => clearTimeout(timer);
  });
  useEffect(() => {
    const flushPending = () => {
      if (sessionSnapshotTimerRef.current) {
        clearTimeout(sessionSnapshotTimerRef.current);
      }
      const flush = sessionSnapshotFlushRef.current;
      sessionSnapshotFlushRef.current = null;
      if (flush) void flush();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushPending();
    };
    window.addEventListener("pagehide", flushPending);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushPending);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flushPending();
    };
  }, [workspace?.siteId, workspace?.appId, workspace?.mode]);

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
  // 命令式填充 nonce（v20）：每次点导航/起手卡填充操作台就自增 → 经 FillNonceProvider 供
  // 给 opsContent 子树的所有 LeoComposer → TemplateFillArea 无条件重灌当前模板。修「删空后
  // 再点同卡恢复不了」（不依赖 value/template prop diff，站点零改动）。
  const [fillNonce, setFillNonce] = useState(0);
  const primaryField = opsPrimaryField || schema.fields[0]?.key || "";
  const fillFromGuide = useCallback<
    (
      text: string,
      opts?: {
        imageUrl?: string;
        set?: Record<string, unknown>;
        remark?: string;
        data?: unknown;
      },
    ) => void
  >(
    (text, opts) => {
      if (sessionReadOnly) {
        setError(tt("当前工作会话不可编辑。"));
        return;
      }
      if (opts && Object.prototype.hasOwnProperty.call(opts, "remark")) {
        setOperatorRemark(opts.remark || "");
      }
      if (onGuideExample) {
        onGuideExample(text, opts);
        setFillNonce((n) => n + 1); // v20：站点自定义处理也算一次填充 → 令内部 LeoComposer 重灌
        return;
      }
      if (showOps && primaryField && onApplyPatch) {
        // 宗旨 v15 决策 C：导航卡片 = 升级版 prompt——主字段填文案 + 一并 patch 参数
        // （ratio/genMode/style/words…，来自示例的 set）。站点 onApplyPatch 早已把
        // set.<field> 映射进自己的表单 state，故零站点改动即让参数一起填。
        onApplyPatch({ set: { [primaryField]: text, ...(opts?.set || {}) } });
        setFillNonce((n) => n + 1); // v20：强制重灌（含删空后重点同卡）
        setTab("ops");
        return;
      }
      // 纯对话功能区（无操作台）：示例填进 agent 输入框。
      setInput(text);
      setTab("agent");
    },
    [
      sessionReadOnly,
      tt,
      onGuideExample,
      setOperatorRemark,
      showOps,
      primaryField,
      onApplyPatch,
    ],
  );
  useRegisterOpsFiller(fillFromGuide);

  // ── 「保存模板」：把当前操作台输入与备注存成可复用模板 ───────────────────
  const guideWf = useGuideWorkflows();
  const [wfSaving, setWfSaving] = useState(false);
  const [wfSaved, setWfSaved] = useState(false);
  // 「当前操作台输入」快照来源（宗旨 v16.1，2026-07-06，全家桶统一）：
  //   ① 站点显式传 getWorkflowDraft → 用它（如 word 精确控制 prompt/params）。
  //   ② 否则若站点传了 getOpsState（多数站早已传）→ 自动派生：prompt = 主输入字段
  //      （opsPrimaryField / schema.fields[0]）的值；params = 其余基本类型字段
  //      （string/number/boolean，跳过文件/数组/对象）。→ 站点【零改动】即获得保存模板。
  //   ③ 两者都没有 → 不显示「保存模板」按钮。
  const effectiveGetDraft = useCallback((): WorkflowDraft | null => {
    if (getWorkflowDraft) {
      const draft = getWorkflowDraft();
      return draft
        ? {
            ...draft,
            remark: operatorRemark,
          }
        : null;
    }
    if (!getOpsState) return null;
    const st = (getOpsState() || {}) as Record<string, unknown>;
    const raw = st[primaryField];
    const prompt = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
    if (!prompt.trim()) return null;
    const params: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(st)) {
      if (k === primaryField) continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") params[k] = v;
    }
    return {
      prompt,
      params,
      remark: operatorRemark,
    };
  }, [getWorkflowDraft, getOpsState, primaryField, operatorRemark]);
  const canSaveWorkflow =
    showOps && Boolean(getWorkflowDraft || getOpsState) && Boolean(guideWf);
  const saveWorkflow = useCallback(async () => {
    if (!guideWf) return;
    const draft = effectiveGetDraft();
    if (!draft || !(draft.prompt || "").trim()) {
      setError(tt("请先在操作台填写内容，再保存此模板。"));
      setTimeout(() => setError(null), 2600);
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
  }, [effectiveGetDraft, guideWf, tt]);
  // 关键修（2026-07-06）：下面的「保存工作流」按钮节点被 setLeftLabel 塞进左栏标题槽后
  // 会被【冻结】在当时那一版闭包里（安装 effect 的依赖不含 saveWorkflow / getWorkflowDraft，
  // 否则每帧重装会导致 setState 循环）。而各站的 getWorkflowDraft 是每次渲染新建、闭包
  // 读【最新】操作台 state 的。若按钮 onClick 直接调 saveWorkflow，点的永远是初始那版 →
  // 读到空操作台 → getWorkflowDraft() 返回 null → 看似「点了没反应」。用 latest-ref 让被
  // 冻结的 onClick 每次点击都转发到最新的 saveWorkflow。
  const saveActionRef = useRef<() => void>(() => {});
  useEffect(() => {
    saveActionRef.current = () => void saveWorkflow();
  });

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
          onClick={() => saveActionRef.current()}
          disabled={wfSaving}
          title={tt("把当前操作台的输入与备注保存为模板，稍后可在右侧「模板 · 我的」里一键复用")}
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
          {wfSaved ? tt("已保存") : tt("保存此模板")}
        </button>
      )}
      {workspace && workspace.mode !== "history" && (
        <RestartDraftButton
          onBeforeRestart={() => restartFlushRef.current()}
          label={tt("新建")}
          className="inline-flex shrink-0 items-center rounded-lg border border-stone-200 px-2.5 py-1 text-[12px] font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 active:scale-95 disabled:opacity-50"
        />
      )}
    </div>
  ) : null;

  // 安装/更新左栏标题开关（toggle 节点选中态随 tab / 保存态变化）。卸载时清空，避免离开
  // 该功能区后残留旧开关。
  useEffect(() => {
    slot?.setLeftLabel(toggle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slot,
    tab,
    accent,
    opsLabel,
    showOps,
    canSaveWorkflow,
    wfSaving,
    wfSaved,
    workspace?.siteId,
    workspace?.appId,
  ]);
  useEffect(() => {
    return () => slot?.setLeftLabel(null);
  }, [slot]);

  const refresh = useCallback(async (id: string) => {
    const r = await getTask(id);
    if (loadedTaskRef.current !== id) return "";
    if (r.ok && r.data) {
      setMessagesTaskId(id);
      const incoming = r.data.messages || [];
      setMessages((current) =>
        sameAgentMessages(current, incoming) ? current : incoming,
      );
      setStatus(r.data.task?.status || "");
      return r.data.task?.status || "";
    }
    return "";
  }, []);

  // session / 受控 task 变化时复用既有 thread；切到无 task 的新 session 时清空旧本地 id。
  useEffect(() => {
    if (!workspace) return;
    setLocalTaskId(workspace.taskId);
  }, [workspace?.sessionId, workspace?.taskId]);
  useEffect(() => {
    setBranchTaskId(null);
  }, [controlledTaskId, workspace?.sessionId]);

  useEffect(() => {
    if (!taskId) {
      setMessagesTaskId("");
      if (loadedTaskRef.current) {
        loadedTaskRef.current = "";
        reportedArtifactIdsRef.current.clear();
        seenWorkspaceActionIdsRef.current.clear();
        setMessages([]);
        setStatus("");
      }
      return;
    }
    if (loadedTaskRef.current === taskId) return;
    loadedTaskRef.current = taskId;
    reportedArtifactIdsRef.current.clear();
    seenWorkspaceActionIdsRef.current.clear();
    setMessagesTaskId("");
    setMessages([]);
    setStatus("");
    void refresh(taskId);
  }, [taskId, refresh]);

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

  // 把 agent 线程里每个新 artifact（预览/图片/文档）按顺序回报给宿主 → 右侧结果画布显示。
  // 同一次轮询可能同时拿到 preview 和最终 markdown；不能只取 latest，否则预览会永久丢失。
  // 宗旨 v10：这是操作台与 agent 共用右栏结果区的机制（agent 不写操作台，但产物进
  // 共用结果区是合理的）。
  useEffect(() => {
    if (!onArtifact || !taskId || messagesTaskId !== taskId) return;
    const fresh = takeUnreportedAgentArtifacts(
      messages,
      reportedArtifactIdsRef.current,
      messagesTaskId,
      taskId,
    );
    if (!fresh.length) return;
    for (const message of fresh) {
      onArtifact(message.meta!.artifact!, message.content);
    }
    // 新后端写 artifact 时通常已更新活动时间；显式 touch 是旧写入路径的尽力兜底。
    if (workspace?.taskId === taskId) void workspace.touch();
  }, [messages, messagesTaskId, onArtifact, taskId, workspace]);

  // FunctionAgentChat lives in the left pane while ResultCanvas is its sibling.
  // Forward only persisted, backend-validated ui_action messages through the
  // instance page event; assistant prose never enters this path.
  useEffect(() => {
    if (!taskId || messagesTaskId !== taskId) return;
    for (const message of messages) {
      if (
        message.kind !== "ui_action" ||
        message.meta?.verified !== true ||
        seenWorkspaceActionIdsRef.current.has(message.id)
      )
        continue;
      const action = normalizeWorkspaceAction(
        message.meta?.workspace_action || message.meta?.ui_action,
      );
      if (!action) continue;
      seenWorkspaceActionIdsRef.current.add(message.id);
      dispatchWorkspaceAction({
        nonce: `${taskId}:${message.id}`,
        action,
      });
    }
  }, [messages, messagesTaskId, taskId]);

  async function send(override?: string) {
    // override：由操作台简报桥（submitToAgent）传入的完整 prompt，不经输入框。
    const prompt = (override ?? input).trim();
    const uploaded = override ? [] : atts.ready();
    if ((!prompt && uploaded.length === 0) || busy || atts.uploading) return;
    if (sessionReadOnly) {
      setError(tt("当前工作会话不可编辑。"));
      return;
    }
    const submittedInput = override ? "" : input;
    const submittedAttachments = override ? [] : atts.attachments;
    const restoreSubmission = () => {
      if (override) return;
      setInput((current) => (current ? current : submittedInput));
      atts.restoreReady(submittedAttachments);
    };
    if (!override) {
      setInput("");
      atts.clear();
    }
    setError(null);
    const effectivePrompt = appendOperatorRemark(
      prompt || tt("请分析我上传的文件。"),
      operatorRemark,
    );
    const meta = uploaded.length ? { attachments: uploaded } : undefined;
    if (taskId && branchFromMessageId) {
      setBusy(true);
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
      setBranchFromMessageId(null);
      const nextTaskId = result.data.task_id;
      const nextSessionId = String(result.data.session_id || "");
      setLocalTaskId(nextTaskId);
      setBranchTaskId(nextTaskId);
      if (workspace && nextSessionId) {
        const adopted = await workspace.adoptSession(nextSessionId);
        if (!adopted) {
          setError(tt("分支已创建，但工作会话暂未同步；本次任务仍会继续运行。"));
        }
      }
      onTaskIdChange?.(nextTaskId);
      setMessages([
        {
          id: Date.now(),
          role: "user",
          kind: "text",
          content: effectivePrompt,
          meta,
        },
      ]);
      setStatus("running");
      if (
        nextSessionId &&
        typeof window !== "undefined" &&
        window.location.pathname.includes("/history/")
      ) {
        window.history.replaceState(
          window.history.state,
          "",
          `/history/${encodeURIComponent(nextSessionId)}`,
        );
      }
      void refresh(nextTaskId);
      return;
    }
    const optimisticMessageId = Date.now();
    setMessages((m) => [
      ...m,
      { id: optimisticMessageId, role: "user", kind: "text", content: effectivePrompt, meta },
    ]);

    if (!taskId) {
      setBusy(true);
      let linkedSessionId =
        explicitSessionId || workspace?.sessionId || "";
      if (!linkedSessionId && workspace) {
        const context = await workspace.artifactContext(effectivePrompt);
        linkedSessionId = context?.sessionId || "";
      }
      if (workspace && !linkedSessionId) {
        setBusy(false);
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticMessageId),
        );
        restoreSubmission();
        setError(workspace.error || tt("无法创建工作会话，请稍后重试。"));
        return;
      }
      const r = await createTask({
        prompt: effectivePrompt,
        mode: "agent",
        siteId,
        agentId,
        sessionId: linkedSessionId || undefined,
        attachments: uploaded,
        // 宗旨 v10：agent 独立于操作台——不带 opsState（不读操作台 state）。
      });
      setBusy(false);
      if (!r.ok || !r.data) {
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticMessageId),
        );
        restoreSubmission();
        setError(r.status === 401 ? tt("登录后即可使用 agent。") : r.error || tt("创建失败"));
        return;
      }
      setLocalTaskId(r.data.task_id);
      onTaskIdChange?.(r.data.task_id);
      if (workspace) {
        // task 创建接口也会绑定；这里同步 Provider 内存态并兼容尚未自动绑定的后端。
        void workspace.bindTask(r.data.task_id, effectivePrompt);
      }
      setStatus("running");
      void refresh(r.data.task_id);
      return;
    }
    setBusy(true);
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
  useEffect(() => {
    sendRef.current = send;
  });

  const running = status === "running" || busy;
  const renderItems = buildAgentRenderItems(messages);
  const activeProgressKey = activeAgentProgressKey(renderItems, messages);

  // 「中止」：AI 工作中点停止键 → 停任务。
  const stop = useCallback(async () => {
    if (sessionReadOnly) return;
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
  }, [sessionReadOnly, taskId, refresh]);

  // 启发式追问（后端 meta.suggestions）——最后一条 assistant 消息上取；点了直接发送。
  // 同时记录最新 assistant 文本条 index，用于给它流式打字机。
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
    !running && Array.isArray(lastAssistant?.meta?.suggestions)
      ? (lastAssistant!.meta!.suggestions as string[]).filter(
          (s) => typeof s === "string" && s.trim(),
        ).slice(0, 3)
      : [];

  async function sendSuggestion(text: string) {
    if (!taskId || busy || sessionReadOnly) return;
    const effectiveText = appendOperatorRemark(text, operatorRemark);
    setBusy(true);
    setMessages((m) => [
      ...m,
      { id: Date.now(), role: "user", kind: "text", content: effectiveText },
    ]);
    const r = await followUp(taskId, effectiveText);
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
        void sendRef.current(p);
      },
    }),
    [],
  );
  // ── 操作台形态：直接渲染各站表单 ──────────────────────────────────────────
  // 宗旨 v18：opsContent 在可滚动区（flex-1）；stickyAction（主按钮）固定在操作台
  // 最底部（shrink-0）。滚动区与按钮条之间叠一层从透明到白的半透明渐隐遮罩，让内容
  // 在按钮上方渐隐、不露出输入框缝隙（操作员截图 43873e9b）。
  if (tab === "ops") {
    return (
      <FnAgentBridgeCtx.Provider value={bridge}>
        <div className="flex h-full flex-col">
          {/* 不在 SplitWorkspace 内（无左栏标题插槽）时，栏体内回退放开关。 */}
          {!slot && toggle && <div className="mb-3 shrink-0 self-start">{toggle}</div>}
          {/* 操作台形态也要能看到「保存工作流」的提示/报错（如「请先填写」）。 */}
          {error && (
            <p className="mb-2 shrink-0 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-600">
              {tt(error)}
            </p>
          )}
          {/* 操作员 2026-07-09（截图 63ad18f3）：底部渐隐遮罩会盖住最后一张卡（如「可编辑
              大纲」引导卡）。给滚动区补一段底部内边距（有 stickyAction 时 pb-8），让内容能
              滚到遮罩上方、卡片本体不进入半透明渐变区。 */}
          <div className={`min-h-0 flex-1 overflow-y-auto ${stickyAction != null ? "pb-8" : ""}`}>
            <FillNonceProvider nonce={fillNonce}>
              {opsContent}
              <OperatorRemarkField disabled={sessionReadOnly} />
            </FillNonceProvider>
          </div>
          {stickyAction != null && (
            <div className="relative shrink-0">
              {/* 半透明渐隐遮罩：从透明 → 白，盖住滚动内容与按钮之间的缝隙（不露输入框）。
                  高度收窄到 4（16px）并压在补出的 pb-8 空白上，卡片本体不会被吃掉。 */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-4 left-0 right-0 h-4 bg-gradient-to-t from-white/95 to-transparent"
              />
              <div className="bg-white/95 pt-1 backdrop-blur-sm">{stickyAction}</div>
            </div>
          )}
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
          {renderItems.map((item) =>
            item.type === "progress" ? (
              <AgentProgress
                key={item.key}
                messages={item.messages}
                running={running && item.key === activeProgressKey}
                accent={accent}
              />
            ) : (
              <AgentTranscriptBubble
                key={item.key}
                message={item.message}
                streaming={running && item.index === lastAssistantIdx}
                onBranch={
                  !running &&
                  !sessionReadOnly &&
                  item.message.role === "user" &&
                  item.message.id > 0
                    ? () => {
                        setBranchFromMessageId(item.message.id);
                        setInput(item.message.content);
                      }
                    : undefined
                }
              />
            ),
          )}
          {running && !activeProgressKey && (
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
            disabled={sessionReadOnly}
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
