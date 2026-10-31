"use client";

import { isComputerWorkspaceTask, taskExecutionTarget } from "../lib/execution-target";

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
// 两者共用 SplitWorkspace 分栏骨架（可拖；2026-09-07 起没有单栏全屏键）。
// ============================================================================

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { type SplitLibraryConfig } from "./SplitWorkspace";
import {
  TaskWorkspaceShell,
  useTaskWorkspaceState,
  type TaskWorkspaceInitial,
} from "./TaskWorkspaceShell";
import { useTaskAttachmentOpener, type TaskAttachmentTarget } from "./task-attachment-open";
import { IconSearch } from "./icons";
import { CollabTaskPresence } from "./collab/CollabActionSlot";
import { type CanvasTab } from "./ResultCanvas";
import { WorkspacePaneErrorBoundary } from "./WorkspacePaneErrorBoundary";
import { type MaterialItem } from "./MaterialLibrary";
import { CloudBrowserPanel } from "./CloudBrowserPanel";
import {
  ArtifactRenderer,
  artifactToLibraryItem,
} from "./ArtifactRenderer";
import { normalizeWorkspaceAction } from "./workspace-actions";
import {
  AgentTranscriptBubble,
  agentArtifactLabels,
} from "./AgentTranscriptBubble";
import { AgentProgress } from "./AgentProgress";
import { AGENT_CONVERSATION_MAX_WIDTH_CLASS } from "./agent-conversation-layout";
import { agentMessageTimeSeparators } from "./chat-time-separators";
import { LeoComposer, type ComposerMenuItem } from "./LeoComposer";
import type { ExecutionTarget } from "../lib/execution-target";
// One UI system for computer conversations (redo 2026-10-30): a native
// Codex/Claude/Cursor/Hermes conversation renders through this same stream and
// LeoComposer; CLI/terminal show the host-styled surface with the same dock below.
import { useNativeThread, type NativeThread } from "./native-thread";
import { libraryAttachmentFile } from "./native-draft-files";
import { createPortal } from "react-dom";
import type { ConversationTarget, NativeProgram } from "./native-thread/types";
import { ConversationBar } from "./cloud-computer/ConversationBar";
import { NativeSettingsPanel, NativeTerminalSurface, nativeSettingsTitle } from "./cloud-computer/native-surface";
import type { Computer } from "../lib/cloud-computer-api";
import { getComputer } from "../lib/cloud-computer-api";
import {
  bindComputerTaskSession,
  computerTaskSessionsTarget,
  createComputerTaskSession,
  findComputerTaskSession,
  latestComputerTaskSession,
  listComputerTaskSessions,
  hasPendingNativePrompt,
  knownComputer,
  knownComputerTaskSession,
  rememberComputer,
  rememberComputerTaskSession,
  takePendingNativePrompt,
  type ComputerTaskSession,
} from "../lib/computer-task-api";
// 选段与导出（Copy Text / Copy Link / Generate Image / Generate Document）。
import { ShareActionBar, ShareEntryButton } from "./share/ShareActionBar";
import { ShareCardPreview } from "./share/ShareCard";
import { useShareMode } from "./share/useShareMode";
// 「左边说话、右边动手」的指令桥与确认卡只有一份实现，落在 FunctionAgentChat 里
// （它比本文件轻，不会把分栏骨架/云端浏览器拖进每个功能区左栏）。这里复用它。
import {
  EditorCommandNotes,
  useEditorCommandBridge,
} from "./FunctionAgentChat";
import type { EditorCommandSurfaceReader } from "../lib/fn-agent";
import { currentPluginCommandSurface } from "./plugin-command";
import {
  AgentReviewPanel,
  createReviewGatedReader,
  hostReviewSession,
  installAgentReviewGate,
  installSelectionBridge,
  useHostReviewActions,
} from "./agent-review";
import {
  activeAgentFilePin,
  persistActiveAgentFile,
  readActiveAgentFileContext,
} from "./active-agent-file";
import { QuickActionChips } from "./quick-actions";
import { HumanHandoffStatus } from "./HumanHandoffStatus";
import { LocalAgentTaskStatus } from "./LocalAgentTaskStatus";
import { taskLocalAgentState, parseLocalAgentRun, newerLocalAgentRun, localAgentCanControl, localAgentRunLive, localTaskArtifacts, localAgentRefusalText, localAgentFailure, type LocalTaskArtifact, type LocalAgentRun, type LocalAgentControl } from "../lib/local-agent-task";
import { CallHumanIcon } from "./bay/shell/bay-icons";
import { openBay, setBayTaskContext, useBayEnabled } from "./bay/shell/bay-state";
import {
  createTask,
  branchTask,
  followUp,
  getTask,
  stopTask,
  controlLocalAgentTask,
  type AgentAttachment,
  type AgentMessage,
  type ArtifactMeta,
  type TaskDetail,
} from "../lib/agent";
import { deleteArtifact } from "../lib/database";
import {
  decodeChatFrame,
  isSseError,
  openSseStream,
  type SseFailureReason,
  type SseRequestInit,
} from "../lib/sse";
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
  agentTurnActionTargets,
  buildAgentRenderItems,
  liveAgentProgressKey,
} from "../lib/agent-progress";
import { historySessionHref } from "./workspace-route";
import {
  isLiveAction,
  ownTaskActionMark,
  settleActionHistory,
  type ActionHistoryMark,
} from "./agent-thread/action-history";
import { mergeAgentMessages } from "./agent-thread/merge";
import { threadPresentation, resolveTaskStatus } from "./agent-thread/rules";
import { createAgentThreadSync, type AgentThreadPull } from "./agent-thread/sync";
import { thinkingLabel, useThinkingSeconds } from "./agent-thread/thinking-label";
import { markSend, noteFirstVisibleReply, sentAtFor } from "./agent-thread/ttfv";
import { latestTurn, userTurnCount } from "./agent-thread/turn";
import { useAgentThreadPolling, type TaskPollResult } from "./agent-thread/useAgentThreadPolling";
// W5 (2026-10-31): one loading look per task switch, per-conversation scroll memory.
import { useTaskLoadingReport } from "./task-loading-gate";
import { placeConversationScroll, rememberConversationScroll, scrollPaneShown } from "./task-scroll-memory";
import { isStaleTaskSeed } from "./history-detail-cache";
import { RoutePageSkeleton } from "./nav-source/route-boundary";

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

export { nextPollCadence } from "./agent-thread/cadence";
export type { PollCadenceInput, PollCadence } from "./agent-thread/cadence";
export { resolveTaskStatus } from "./agent-thread/rules";

const IDLE_POLL_RESULT: TaskPollResult = { status: "", changed: false };

/** 「粘底」判定阈值：离底不到这个距离就算用户还在追最新。 */
const STICK_TO_BOTTOM_PX = 80;

/**
 * 单行顶栏上的图标键（返回 / 搜索 / 上一项 / 下一项 / 关闭 / 右栏开关）共用一套尺寸：
 * `p-1.5` + 16px 图标 = 28px，与既有的 `ShareEntryButton` 同款，靠内边距撑而不写死
 * `h-*`（命中区预算锁 `hit-target-budget` 只认写死的高度；这里不新增欠账）。
 */
const HEADER_ICON_BUTTON_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 text-stone-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-100 hover:text-stone-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * 用户此刻还在不在底部——**跟不跟随，只由这一个判断说了算**。
 *
 * 原实现里根本没有这个判断：`messages` 一变就无条件 `scrollTo(bottom)`。
 * 用户往上翻看历史会被硬拽回去，而流式渲染下 `messages` 每几百毫秒变一次，
 * 于是变成每秒好几次——想回头看一眼上文都做不到。
 */
export function isNearBottom(metrics: ScrollMetrics): boolean {
  const distanceFromBottom =
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return distanceFromBottom <= STICK_TO_BOTTOM_PX;
}

/** Scrolled within this many px of the top, the stream reads one more batch of earlier messages. */
export const LOAD_OLDER_PX = 200;
const OLDER_ANCHOR_STALE_MS = 15_000;

/** Where the user was when an earlier batch was asked for (to keep that spot after the prepend). */
interface OlderScrollAnchor {
  scrollHeight: number;
  firstId: number | null;
  sawLoading: boolean;
  at: number;
}

function scrollMetricsOf(el: HTMLElement): ScrollMetrics {
  return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
}

/**
 * 上滑自动读更早的一批（操作员 2026-10-31：去掉「读取更早的对话」按键）。
 * 用户自己往上滑到离顶不足 `LOAD_OLDER_PX`，或这一批短到撑不满可视区（没法再往上滑）时，
 * 读下一批；正在读、或没有更早的了就不读。
 */
export function shouldLoadOlder(
  metrics: ScrollMetrics,
  state: { hasOlder: boolean; loading: boolean; movingUp: boolean },
): boolean {
  if (!state.hasOlder || state.loading) return false;
  if (metrics.scrollHeight <= metrics.clientHeight + LOAD_OLDER_PX) return true;
  return state.movingUp && metrics.scrollTop < LOAD_OLDER_PX;
}

function documentHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

/**
 * 只读一次的偏好查询（不订阅变化：滚动这种一次性行为读当下即可）。
 * 动效 token 那边由 `globals.css` 的 `@media (prefers-reduced-motion)` 把时长归零，
 * 但 `scrollTo({behavior:"smooth"})` 是 JS 行为、CSS 管不着，只能在这儿判一次。
 */
function scrollBehavior(): ScrollBehavior {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return "auto";
  }
  return "smooth";
}

// ---------------------------------------------------------------------------
// 流式正文（解析器用 W20 的 src/lib/sse.ts，本仓只有那一份）
// ---------------------------------------------------------------------------

export type AgentStreamOutcome =
  /** 流自然读完。 */
  | { kind: "complete"; text: string }
  /** 用户按了停止；`text` 是断开前已经收到的部分。 */
  | { kind: "stopped"; text: string }
  /** 流开不起来或中途判坏——**调用方据此回落到轮询并告知用户**。 */
  | {
      kind: "unavailable";
      text: string;
      reason: SseFailureReason | "frame";
      message: string;
    };

/**
 * 把一条 SSE 流折成正文，边收边喂给 `onText`——**首字节到达即渲染，不等整段**。
 *
 * 三条纪律照 `signals/W20-request.md` §2.5，每条都有反直觉之处：
 *  1. 读到 `[DONE]` **不许 break**：计费帧在它之后才发，break 就把它吞了；
 *  2. `kind:"error"` 一律当失败，**哪怕 HTTP 是 200**——流一旦开始就改不了状态码，
 *     内容审核拦截和 provider 不可达都只能以 data 帧送出；
 *  3. 中途断开时**已收到的部分要保留**并标未完成，用户多半已经在读了。
 */
export async function consumeAgentStream(
  init: SseRequestInit,
  onText: (full: string) => void,
): Promise<AgentStreamOutcome> {
  let text = "";
  try {
    for await (const event of openSseStream(init)) {
      const frame = decodeChatFrame(event.data);
      if (!frame) continue;
      if (frame.kind === "delta") {
        // 只带 finish_reason 的收尾帧 text 是空串，那不是内容，也不是结束信号。
        if (!frame.text) continue;
        text += frame.text;
        onText(text);
        continue;
      }
      if (frame.kind === "error") {
        return {
          kind: "unavailable",
          text,
          reason: "frame",
          message: frame.message,
        };
      }
      // "done" / "charge" / "unknown" 一律继续读到流真正关闭（纪律 1）。
    }
    return { kind: "complete", text };
  } catch (caught) {
    // 取消不是错误：W20 让它照 Web 平台惯例抛 AbortError，全仓的既有判据一致。
    if ((caught as { name?: string } | null)?.name === "AbortError") {
      return { kind: "stopped", text };
    }
    if (isSseError(caught)) {
      return {
        kind: "unavailable",
        text,
        reason: caught.reason,
        message: caught.message,
      };
    }
    return {
      kind: "unavailable",
      text,
      reason: "network",
      message: caught instanceof Error ? caught.message : String(caught),
    };
  }
}

/**
 * 尾部那条回答该显示哪份正文——**流比轮询早到时显示流的那份**，
 * 这就是「首字节即渲染」落到屏幕上的地方。
 *
 * **只在流更长时才替换**：轮询是正文的真源，它把完整正文取回来之后就以它为准。
 * 少了这个长度比较，流断在半截会让一段用户已经读到的完整回答当着他的面缩回去。
 */
export function streamedBubbleContent(input: {
  /** 轮询取回的正文（真源）。 */
  content: string;
  /** 流已收到的正文；没接流时是空串。 */
  streamText: string;
  /** 只有尾部那条 assistant 消息才可能有流。 */
  isLastAssistant: boolean;
}): string {
  const { content, streamText, isLastAssistant } = input;
  if (!isLastAssistant) return content;
  return streamText.length > content.length ? streamText : content;
}

export interface AgentChatProps {
  /** Optional existing editor hosted in the same conversation split. */
  workspaceContent?: ReactNode;
  workspaceOpen?: boolean;
  onWorkspaceOpenChange?: (open: boolean) => void;
  workspaceAgentVisible?: boolean;
  onWorkspaceAgentFocus?: () => void;
  onWorkspaceAgentClose?: () => void;
  projectId?: string;
  /** A portal host may keep this live instance and own its canonical task URL. */
  navigateToSessionOnCreate?: boolean;
  /** 站点 id（驱动 per-site 工具 md + 计量）。 */
  siteId?: string;
  /** 初次提交的内容（从首页输入框带进来）；传了会自动创建任务。 */
  initialPrompt?: string;
  initialExecutionTarget?: ExecutionTarget;
  /**
   * Homepage → native chat in place (no page jump). The host already owns the
   * prewarmed thread (picked on its composer) with the first prompt queued in
   * it (`thread.queue`), and creates the managed session in the background.
   * This page shows that conversation at once through the same stream, adopts
   * the task when `created` arrives (`onTaskCreated`), and never opens a
   * second connection for it. Mutually exclusive with `initialPrompt`.
   */
  nativeLaunch?: AgentChatNativeLaunch;
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
  /**
   * The `GET /tasks/{id}` the host already read for `taskId` (history opens a
   * task this way). Shown at once instead of fetching the same task again;
   * polling still follows while the task runs. Ignored for any other task.
   */
  initialTask?: TaskDetail | null;
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
  /**
   * 对话输入框是否开启【文件上传 / 拖拽 / 「＋」菜单里的本地文件】。**默认 `true`**，
   * 35 个站的行为与 2026-07-28 之前逐字一致，接入方无需改一行。
   *
   * 传 `false` 的唯一后果是**不再把 `onAttachFiles` 交给 `LeoComposer`**——它据此
   * 同时收起文件选择按钮与整卡拖拽上传（`LeoComposer.tsx` 的 `dragEnabled` 与
   * 隐藏 `<input type="file">` 都以 `Boolean(onAttachFiles)` 为开关），占位文案也换成
   * 不提上传的那句。命名与行为都对齐 `HomeIntro` 的同名 prop，全家桶只有一套写法。
   *
   * 为什么需要它：`game`（LeoPlay）按操作员拍板的 D8「全站不提供任何上传/导入用户
   * 文件的入口」，游戏只能由平台生成链产出。在此之前本组件**无条件**传
   * `onAttachFiles`，于是 game 的对话界面不但能上传，占位文案还在主动邀请用户上传
   * （V3 验收 J5 判 FAIL）。这里给的是开关，不是按 site key 分叉——按站名分叉会与
   * 跨站一致性门禁的棘轮冲突。
   */
  enableInputTools?: boolean;
  /** 空态提示（还没消息且未运行时显示，默认「在下方输入，开始与 agent 对话。」）。 */
  emptyHint?: React.ReactNode;
  /**
   * 「返回」回调（操作员 2026-07-06；2026-09-07 收进单行顶栏）。给了它 → 对话区那**唯一
   * 一行**顶栏最左出现一枚「‹」图标键（title = backLabel ?? 「返回」）。不再另起一行。
   * 点击【只调用本回调】（不动任务、不 stopTask），让宿主在**不中止对话**的前提下退回
   * 上一层（如首页）。宿主自行决定卸载还是隐藏本组件——想保留对话请隐藏而非卸载。 */
  onBack?: () => void;
  /** 返回键的 title / aria-label，默认「返回」。 */
  backLabel?: string;
  /**
   * 顶栏右侧、搜索图标之前的宿主自定义节点（2026-09-07）。主站 `/tasks/[id]` 用它放
   * 任务状态胶囊与评分星星，从而删掉自带的那条页头，与子站共用同一行。 */
  headerExtra?: ReactNode;
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
  /**
   * 「左边说话、右边动手」：agent 可以读右栏编辑器的指令面并下指令（改动前必须由用户
   * 确认）。**默认开**——没有编辑器挂在指令面上时给模型的上下文为空串、也没有指令可解析，
   * 行为与接线之前逐字一致。 */
  enableEditorCommands?: boolean;
  /**
   * 指令面读取器（合同 §3.1 的 `currentPluginCommandSurface`）。不传则读
   * `registerEditorCommandSurfaceReader()` 注册的那个模块级单例。 */
  editorCommandSurface?: EditorCommandSurfaceReader | null;
  /**
   * agent 任务的**流式正文端点**（SSE）。给了它 → 正文走流，首字节到达即渲染；
   * 流开不起来或中途判坏 → **自动回落到轮询，并在对话底部说明这件事**。
   * 不传 → 全程轮询，与接线之前逐字一致（31 个站的现状）。
   *
   * 为什么是可选而不是写死一个地址：网关**当前没有**这样的端点。
   * `/v1/agent/**` 全部 16 条路由无一流式；唯一的 `/v1/chat/stream` 是无状态 LLM
   * 透传，不跑规划循环、不产 artifact、不认 task，拿它顶 agent 对话是功能净损失。
   * 加端点是后端的活（本波禁区），前端这侧已经按 `sse-contract@1` 接好，
   * 端点落地后宿主传这一个 prop 就通。详见 `signals/W21-request.md`。
   *
   * 注意轮询**不会**因为传了它而停掉：messages / artifact / 状态机的真源始终是
   * `GET /tasks/{id}`，流只负责让正文早一点出现。所以「回落」不需要额外动作，
   * 只需要把话说清楚。
   */
  agentStreamEndpoint?: string;
  /**
   * W7 (2026-10-31): the right sidebar's first state, e.g. the file the home
   * page had open when its first prompt started this task (opened at once,
   * its editor session bound to the task once it exists).
   */
  initialWorkspace?: TaskWorkspaceInitial | null;
}

/** See {@link AgentChatProps.nativeLaunch}. */
export interface AgentChatNativeLaunch {
  conversation: Extract<ConversationTarget, { kind: "native" }>;
  /** The computer as the host knows it (null while it is being read). */
  computer: Computer | null;
  /** The host's live thread for this conversation (its first prompt already queued). */
  thread: NativeThread;
  /** The task and managed session, once the host has created them. */
  created: { taskId: string; session: ComputerTaskSession } | null;
  /** Creating the session failed: try again (the queued prompt is kept and retried with it). */
  retry?: () => void;
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

type AgentChatInnerProps = AgentChatProps & {
  /** Homepage launches archive any previous rolling home-agent session first. */
  startFreshSession?: boolean;
  /**
   * initialPrompt 只自动发送一次的记号，由 Provider 外层的 AgentChat 持有：
   * WorkspaceSessionProvider 用 `key={runtimeEpoch}` 重挂载 Inner（「新建」会这样），
   * Inner 自己的 ref 会跟着归零，原来的首条提示词就会被再发一遍、凭空多出一条任务。
   */
  launchOnceRef?: MutableRefObject<boolean>;
};

export function AgentChat(props: AgentChatProps) {
  const inheritedWorkspace = useOptionalWorkspaceSession();
  const router = useRouter();
  const pathname = usePathname() || "";
  const launchOnceRef = useRef(false);
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
      if (startsFromHome && sessionId && props.navigateToSessionOnCreate !== false) {
        router.replace(historySessionHref(sessionId, undefined, pathname));
      }
    },
    [props.onTaskCreated, props.navigateToSessionOnCreate, router, startsFromHome, pathname],
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
      <AgentChatInner
        {...props}
        onTaskCreated={onTaskCreated}
        startFreshSession
        launchOnceRef={launchOnceRef}
      />
    </WorkspaceSessionProvider>
  );
}

const NO_TASK_SESSIONS: ComputerTaskSession[] = [];

function pickChatKey(conversation: {computerId: string; program: string}): string {
  return `pick:${conversation.computerId}:${conversation.program}`;
}

/** Same cadence as the computer views (`useCloudComputers` CC_POLL_MS). */
const COMPUTER_REFRESH_MS = 15_000;

/** A computer that no longer exists (404): shown offline, never "connecting". */
function removedComputer(id: string, sessions: readonly ComputerTaskSession[]): Computer {
  const name = sessions.find((session) => session.computer_id === id)?.computer_name || id;
  return {id, name, status: "removed", node_online: false} as Computer;
}

/** ACP sessions without a native program (legacy program "oceanleo") are not native chats. */
function usableSession(session: ComputerTaskSession): boolean {
  return session.kind !== "acp" || Boolean(session.program && session.program !== "oceanleo");
}

/** The R0 conversation a managed session stands for. */
function sessionConversation(session: ComputerTaskSession): ConversationTarget {
  if (session.kind === "terminal" || !session.program) {
    return {kind: "terminal", computerId: session.computer_id, computerName: session.computer_name, sessionId: session.id};
  }
  return {kind: "native", computerId: session.computer_id, computerName: session.computer_name, program: session.program as NativeProgram,
    view: session.kind === "cli" ? "cli" : "chat", sessionId: session.id};
}

function AgentChatInner({
  workspaceContent,
  workspaceOpen,
  onWorkspaceOpenChange,
  workspaceAgentVisible = true,
  onWorkspaceAgentFocus,
  onWorkspaceAgentClose,
  projectId,
  siteId = "",
  initialPrompt,
  initialExecutionTarget,
  nativeLaunch,
  initialAttachments,
  taskId: explicitTaskId,
  initialTask,
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
  enableInputTools = true,
  emptyHint,
  onBack,
  backLabel,
  headerExtra,
  onGate,
  libraryTabs,
  mentionMembers,
  renderOrgPanel,
  startFreshSession = false,
  launchOnceRef,
  enableEditorCommands = true,
  editorCommandSurface,
  agentStreamEndpoint,
  initialWorkspace,
}: AgentChatInnerProps) {
  const tt = useUI();
  // `tt` 是 locale provider 所有的函数。它进下面那条 SSE effect 的依赖，会让
  // provider 每换一次身份就 `controller.abort()` 再重开一条流——正文当场断一次，
  // 而回落告知与语言无关。沿用 W13 在 `doc-editors/use-grid-editor.ts:410-419`
  // 定下的 ref + 恒定身份写法（`cloud-browser-interaction.ts:183` 同形）。
  const translateRef = useRef(tt);
  useEffect(() => {
    translateRef.current = tt;
  }, [tt]);
  const ARTIFACT_LABEL = agentArtifactLabels(tt);
  const workspaceValue = useOptionalWorkspaceSession();
  const workspace =
    workspaceValue && (!siteId || workspaceValue.siteId === siteId)
      ? workspaceValue
      : null;
  const readOnly = readOnlyProp || Boolean(workspace?.readOnly);
  // 团队/组织页与所有生成结果都归入固定「预览」槽的卡片，不再占一级标签。
  const hasOrgPanel = Boolean(renderOrgPanel);
  // 团队默认开库；主页普通 agent 始终默认收起。新产物只在隐藏的库内更新，
  // 用户点结果卡或「库」按钮时才展开，避免主页 Enter 后页面自行改布局。
  // State lives in the shared TaskWorkspaceShell hook (W7); same names, same defaults.
  const taskWorkspace = useTaskWorkspaceState({
    defaultOpen: hasOrgPanel,
    defaultTab: hasOrgPanel ? "preview" : "home",
    initial: initialWorkspace,
  });
  const { libTab, setLibTab, workspaceAction, setWorkspaceAction, rightOpen, setRightOpen } = taskWorkspace;
  // Which conversation of this task is shown (redo 2026-10-30): the task's own
  // OceanLeo conversation, or one of its managed computer sessions.
  /** `loaded`: one successful list; `failed`: the last attempt failed (retried with backoff). */
  const [taskSessions, setTaskSessions] = useState<{taskId: string; items: ComputerTaskSession[]; loaded: boolean; failed: boolean}>({taskId: "", items: [], loaded: false, failed: false});
  const [sessionsEpoch, setSessionsEpoch] = useState(0);
  const sessionsRetryRef = useRef(0);
  /** `id: null` = the OceanLeo conversation; `resolved: false` = not decided yet for this task. */
  const [selectedSession, setSelectedSession] = useState<{taskId: string; id: string | null; resolved: boolean}>({taskId: "", id: null, resolved: false});
  const [taskMode, setTaskMode] = useState<{taskId: string; computer: boolean}>({taskId: "", computer: false});
  /** Draft (no task yet) only: the OceanLeo target picked in the dock; undefined = today's remembered target. */
  const [draftConversation, setDraftConversation] = useState<ConversationTarget | undefined>(undefined);
  /** A native chat picked for a program this task (or draft) has no session for: created by the first send. */
  const [pickedChat, setPickedChat] = useState<{taskId: string; conversation: Extract<ConversationTarget, {kind: "native"}>} | null>(
    () => nativeLaunch ? {taskId: "", conversation: nativeLaunch.conversation} : null);
  // Computers already known in this tab (the homepage's pick, a page that just created a session) are not waited for.
  const [computers, setComputers] = useState<Record<string, Computer>>(() => {
    const known = nativeLaunch?.computer ?? (nativeLaunch ? knownComputer(nativeLaunch.conversation.computerId) : null);
    return known ? {[known.id]: known} : {};
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversationBusy, setConversationBusy] = useState(false);
  const [conversationError, setConversationError] = useState("");
  /** Native chat sessions opened on this page; each keeps its thread mounted (hidden) so switching never kills a run. */
  const [openedChats, setOpenedChats] = useState<string[]>([]);
  /** The right-pane node the on-screen native chat portals its settings into. */
  const [settingsHost, setSettingsHost] = useState<HTMLDivElement | null>(null);
  /** CLI / terminal surfaces opened on this page; kept mounted (hidden) so nothing restarts. */
  const [openedSurfaces, setOpenedSurfaces] = useState<string[]>([]);
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
  // 手上这份消息属于哪段对话。换对话时它先归零，等服务端那份到齐才跟上；
  // 编辑器指令只在两者一致时才看，否则会拿上一段对话的消息去对新对话记账。
  const [messagesTaskId, setMessagesTaskId] = useState("");
  const [readFailedTaskId, setReadFailedTaskId] = useState("");
  const [activeArtifactIds, setActiveArtifactIds] = useState<Set<string> | null>(
    null,
  );
  const [hiddenArtifactMessageIds, setHiddenArtifactMessageIds] = useState<
    Set<number>
  >(new Set());
  const [status, setStatus] = useState<string>("");
  const [boundTarget, setBoundTarget] = useState<{taskId: string; target: ExecutionTarget | null}>({taskId: "", target: null});
  const [localExecution, setLocalExecution] = useState<{taskId: string; local: boolean; run: LocalAgentRun | null}>({taskId: "", local: false, run: null});
  const isLocalExecution = localExecution.taskId === taskId && localExecution.local;
  const localRun = isLocalExecution ? localExecution.run : null;
  const [localArtifacts, setLocalArtifacts] = useState<{taskId: string; items: LocalTaskArtifact[]}>({taskId: "", items: []});
  const localControlInFlight = useRef(false);
  const [localControlBusy, setLocalControlBusy] = useState(false);
  const [pollEpoch, setPollEpoch] = useState(0);
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
  const freshSessionStartedRef = useRef(false);
  const loadedTaskRef = useRef("");
  const initialTaskRef = useRef(initialTask);
  initialTaskRef.current = initialTask;
  const seededTaskRef = useRef("");
  const seenArtRef = useRef<number | null>(null);
  const seenActionRef = useRef<number | null>(null);
  const actionHistoryRef = useRef<ActionHistoryMark | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 服务端那份消息的上一次快照。用来判断「这一轮轮询有没有拿到新东西」——
  // 轮询节奏据此收紧或退避。不能直接读 `messages`：本地乐观插入的用户消息
  // 也会改它，那不是服务端的动静。
  const serverMessagesRef = useRef<AgentMessage[]>([]);
  const threadSyncRef = useRef(createAgentThreadSync());
  // 用户按过停止的那个 task。服务端要过一会儿才把状态落成 stopped，
  // 这期间任何一次 refresh 都会把 status 写回 running、把轮询和「思考中」放回来。
  // 有了它，本地判定优先，界面不会自己复活。
  const stoppedTaskRef = useRef("");
  const [stoppedTaskId, setStoppedTaskId] = useState("");
  // 流式正文：只在宿主给了 agentStreamEndpoint 时才有值。轮询始终是真源，
  // 这里存的是「比轮询更早到的那一段」，用来让正文提前出现。
  const [streamText, setStreamText] = useState("");
  const [streamNotice, setStreamNotice] = useState("");
  // 停止键要真的把流掐掉，而不是丢弃结果——取消要省下的是上游的算力。
  const streamAbortRef = useRef<AbortController | null>(null);
  const atts = useAttachments(siteId, setError);
  // 右栏编辑器的指令面（左边说话、右边动手）。没有编辑器挂上来时全程空转。
  // mutates 的 run() 必须进审阅闸：allowAlways / 确认卡都不能直接写文档。
  const gatedSurfaceReader = useMemo(
    () =>
      createReviewGatedReader(
        editorCommandSurface,
        currentPluginCommandSurface,
      ),
    [editorCommandSurface],
  );
  useEffect(() => {
    installAgentReviewGate();
    installSelectionBridge();
  }, []);
  const editorCommands = useEditorCommandBridge({
    enabled: enableEditorCommands,
    surfaceReader: gatedSurfaceReader,
    taskId,
    readOnly,
    activeFileScopeId: workspace?.activeFileScopeId,
  });
  const captureEditorTurn = editorCommands.captureContext;
  const confirmHostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editorCommands.pending || editorCommands.busy) return;
    const button = confirmHostRef.current?.querySelector(
      "[data-editor-command-action='confirm']",
    );
    if (button instanceof HTMLButtonElement && !button.disabled) {
      button.click();
    }
  }, [editorCommands.pending, editorCommands.busy]);
  // 接受 / 拒绝 / 回滚只有一份实现（`agent-review/dock.tsx`），本文件与 AgentConsole
  // 原来各抄了一遍。接受与回滚经 `applyParkedReview()` 带 apply token 写穿闸。
  const review = useHostReviewActions();
  const noteUserTurn = editorCommands.noteUserTurn;
  const noteOwnEditorTask = editorCommands.noteOwnTask;
  const ingestEditorCommands = editorCommands.ingest;
  // 与 HomeIntro 同名同义的开关（见 AgentChatProps.enableInputTools）。默认 true，
  // 所以下面每一处 `toolsOn ? X : undefined` 对 35 个站都恒等于改动前的 `X`。
  const toolsOn = enableInputTools;
  // 关掉输入工具的站，首页那一侧的 HomeIntro 同样是关的，`onStart` 不可能带出附件；
  // 真收到就说明有人绕过了 D8，这里显式丢弃而不是默默照单全收。
  const initialAtts = toolsOn ? initialAttachments : undefined;

  useEffect(() => {
    setBranchTaskId(null);
  }, [explicitTaskId, workspace?.sessionId]);

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput((v) => (v ? v + " " : "") + text);
  }, []);

  /**
   * 拉一次任务（`applyTask` 落一份已拿到的 TaskDetail：轮询结果或宿主给的 initialTask）。
   * 返回 `status` 与 `changed`（这一轮有没有拿到新消息）——
   * `changed` 是轮询节奏的输入：还在出字就跟紧，没动静就退避。
   */
  const applyTask = useCallback((id: string, pull: AgentThreadPull, data: TaskDetail): TaskPollResult => {
    const settled = threadSyncRef.current.settle(
      pull,
      serverMessagesRef.current,
      data,
    );
    if (settled === null) return IDLE_POLL_RESULT;
    const changed = settled !== serverMessagesRef.current;
    actionHistoryRef.current = settleActionHistory(
      actionHistoryRef.current,
      id,
      settled,
    );
    serverMessagesRef.current = settled;
    setMessagesTaskId(id);
    setTaskMode((current) => {
      const computer = isComputerWorkspaceTask(data.task);
      return current.taskId === id && current.computer === computer ? current : {taskId: id, computer};
    });
    setBoundTarget({taskId: id, target: taskExecutionTarget(data.task)});
    const local = taskLocalAgentState(data.task);
    const artifacts = localTaskArtifacts(data.task.plan);
    setLocalArtifacts(current => current.taskId === id && JSON.stringify(current.items) === JSON.stringify(artifacts) ? current : {taskId: id, items: artifacts});
    setLocalExecution(current => {
      const run = current.taskId === id ? newerLocalAgentRun(current.run, local.run) : local.run;
      return current.taskId === id && current.local === local.local && current.run === run ? current : {taskId: id, local: local.local, run};
    });
    setMessages((current) => mergeAgentMessages(current, settled));
    setActiveArtifactIds((current) => {
      const artifactIds = (data.artifacts || []).map((artifact) =>
        String(artifact.id),
      );
      if (
        current &&
        current.size === artifactIds.length &&
        artifactIds.every((artifactId) => current.has(artifactId))
      ) {
        return current;
      }
      return new Set(artifactIds);
    });
    // 用户已经按过停止：服务端还没跟上不代表它还在跑，本地判定优先。
    // 少了这一句，停止键按下去就是「界面停半秒又自己动起来」。
    const status = resolveTaskStatus({
      serverStatus: data.task?.status || "",
      taskId: id,
      stoppedTaskId: stoppedTaskRef.current,
    });
    setStatus(status);
    if (data.task?.site_id) setTaskSiteId(data.task.site_id);
    // 后端首轮收尾生成的会话总结（task.title）——拿到就更新（顶栏「返回」右侧显示）。
    if (data.task?.title) setTaskTitle(data.task.title);
    return { status, changed, streaming: status === "running" && settled.some(
      (message) => message.role === "assistant" && message.meta?.streaming === true,
    ) };
  }, []);
  const refresh = useCallback(async (id: string): Promise<TaskPollResult> => {
    const pull = threadSyncRef.current.begin(id);
    const r = await getTask(id, pull.options);
    if (loadedTaskRef.current !== id) return IDLE_POLL_RESULT;
    if (r.ok && r.data) return applyTask(id, pull, r.data);
    // A task that cannot be read is not "loading" forever (W5 loading gate).
    setReadFailedTaskId(id);
    return IDLE_POLL_RESULT;
  }, [applyTask]);

  const noteOutgoingTurn = useCallback((id: string, turn: number) => {
    markSend(id, turn);
    threadSyncRef.current.invalidate();
  }, []);

  const kickAfterFollowUp = useCallback(
    (id: string) => {
      setPollEpoch((epoch) => epoch + 1);
      setStatus("running");
      void refresh(id);
    },
    [refresh],
  );

  useEffect(() => {
    if (taskId) noteFirstVisibleReply(taskId, messages);
  }, [taskId, messages]);

  // 「找人帮忙」在任务页自动带上当前任务；只读（别人的任务、回放）不带。
  useEffect(() => {
    if (!taskId || readOnly) return undefined;
    return () => setBayTaskContext(null);
  }, [taskId, readOnly]);
  useEffect(() => {
    if (taskId && !readOnly) setBayTaskContext({ taskId, messages });
  }, [taskId, readOnly, messages]);
  // 任务页的直达入口：输入框「＋」菜单里的「找人帮忙」，点开就是带着当前任务的那张表单。
  // 境内没有 LeoBay、只读任务不能求助，这两种情况菜单里不出现。
  const bayEnabled = useBayEnabled();
  const getHelpMenu = useMemo<ComposerMenuItem[] | undefined>(
    () =>
      bayEnabled && taskId && !readOnly
        ? [
            {
              id: "get-help",
              label: tt("找人帮忙"),
              icon: <CallHumanIcon className="h-4 w-4" />,
              onClick: () => openBay({ kind: "call-human" }),
            },
          ]
        : undefined,
    [bayEnabled, taskId, readOnly, tt],
  );

  // Provider 可能先返回 session、随后才异步算出 task_id。task 真源变化时主动 refresh，
  // 不要求宿主重新挂载 AgentChat；切到无 task 的新 session 时也不能残留上一段消息。
  useEffect(() => {
    if (!taskId) {
      loadedTaskRef.current = "";
      setMessagesTaskId("");
      setMessages([]);
      setActiveArtifactIds(null);
      setHiddenArtifactMessageIds(new Set());
      seenArtRef.current = null;
      seenActionRef.current = null;
      actionHistoryRef.current = null;
      setLibTab(hasOrgPanel ? "preview" : "home");
      setWorkspaceAction(null);
      setRightOpen(hasOrgPanel);
      setStatus("");
      setTaskSiteId("");
      setTaskTitle("");
      return;
    }
    if (loadedTaskRef.current === taskId) return;
    loadedTaskRef.current = taskId;
    setMessagesTaskId("");
    setMessages([]);
    setActiveArtifactIds(null);
    setHiddenArtifactMessageIds(new Set());
    seenArtRef.current = null;
    seenActionRef.current = null;
    if (actionHistoryRef.current?.taskId !== taskId) actionHistoryRef.current = null;
    setLibTab(hasOrgPanel ? "preview" : "home");
    setWorkspaceAction(null);
    setRightOpen(hasOrgPanel);
    setStatus("");
    setTaskSiteId("");
    setTaskTitle("");
    // The host already read this task (history): show it now, no second GET.
    // Only once per task on this mount; later loads read the server again.
    const seed = initialTaskRef.current;
    if (seed?.task?.id === taskId && seededTaskRef.current !== taskId) {
      seededTaskRef.current = taskId;
      applyTask(taskId, threadSyncRef.current.begin(taskId), seed);
      // A copy the history page kept from an earlier visit shows at once; the task
      // may have moved on since, so it is read once more (silently merged).
      if (isStaleTaskSeed(seed)) void refresh(taskId);
      return;
    }
    void refresh(taskId);
  }, [hasOrgPanel, taskId, refresh, applyTask]);

  // Provider 算出的 task_id 只在**有值**时接管本地 task。
  // 操作员 2026-09-07 图 f2dde413（LeoSheet 首页）：发完 hi、回答已出现，几秒后整块对话
  // 变成「新任务 / 在下方输入…」。服务端日志：task 出生时没绑上会话（startNew 没返回
  // 会话），3 秒后 home-agent 会话才建出来、task_id=null → provider 的 context 值一变，
  // 这里原来无条件 `setLocalTaskId(workspace.taskId)` 把活着的 task 覆盖成 null，
  // 上面「!taskId → 清消息」那条 effect 就把正文全清了。
  // 现在：provider 给了别的 task 才切；给 null 时保留本地 task，并把它绑到刚出现的
  // 会话上（补上 createTask 时没绑成的那一下）。「新建」走 runtimeEpoch 重挂载清空，
  // 不依赖这里。
  const boundSessionRef = useRef("");
  useEffect(() => {
    if (explicitTaskId !== undefined || !workspace) return;
    if (workspace.taskId) {
      setLocalTaskId(workspace.taskId);
      return;
    }
    const local = localTaskId;
    const sessionId = workspace.sessionId || "";
    if (!local || !sessionId || workspace.readOnly) return;
    if (boundSessionRef.current === sessionId) return;
    boundSessionRef.current = sessionId;
    void workspace.bindTask(local);
  }, [
    explicitTaskId,
    localTaskId,
    workspace,
    workspace?.sessionId,
    workspace?.taskId,
  ]);

  // A computer run that is paused, stuck or stopping keeps refreshing until it is terminal.
  useAgentThreadPolling(taskId, status, refresh, pollEpoch, isLocalExecution && localAgentRunLive(localRun));

  // ---------------------------------------------------------------------
  // Computer conversations (redo 2026-10-30: one UI system)
  // ---------------------------------------------------------------------
  // The page decides which conversation is in front: `?computerSession=<id>`
  // (portal links use this name) → that managed session; a computer task
  // without one → its most recent session; otherwise the task's own OceanLeo
  // conversation. Choosing never executes anything and never cancels a run.
  // A native chat is created by its first send; CLI / terminal on pick.
  useEffect(() => {
    setSettingsOpen(false);
    setConversationError("");
    setOpenedSurfaces([]);
    setOpenedChats([]);
    sessionsRetryRef.current = 0;
  }, [taskId]);
  /** The task adopted in place (and the list epoch then): its list is not read again. */
  const adoptedTaskRef = useRef("");
  const adoptedEpochRef = useRef(0);
  useEffect(() => {
    if (!taskId) {
      setTaskSessions({taskId: "", items: [], loaded: false, failed: false});
      return;
    }
    // A task this page just created in place already holds its only session: no list read.
    if (adoptedTaskRef.current === taskId && sessionsEpoch === adoptedEpochRef.current) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A session this tab was just handed (`?computerSession=` from the homepage) shows at once;
    // the list (and its computer) are read in parallel instead of one after the other.
    const handed = knownComputerTaskSession(new URL(window.location.href).searchParams.get("computerSession") || "");
    const seed = handed && handed.task_id === taskId ? [handed] : [];
    setTaskSessions((current) => current.taskId === taskId ? current : {taskId, items: seed, loaded: false, failed: false});
    void listComputerTaskSessions(taskId).then((result) => {
      if (!alive) return;
      sessionsRetryRef.current = 0;
      setTaskSessions((current) => {
        // Sessions this page just created stay even if the list was read a moment before.
        const local = current.taskId === taskId ? current.items.filter((row) => !result.sessions.some((item) => item.id === row.id)) : [];
        return {taskId, items: [...result.sessions, ...local], loaded: true, failed: false};
      });
    }).catch(() => {
      if (!alive) return;
      setTaskSessions((current) => current.taskId === taskId ? {...current, failed: true} : {taskId, items: [], loaded: false, failed: true});
      const attempt = sessionsRetryRef.current++;
      timer = setTimeout(() => setSessionsEpoch((epoch) => epoch + 1), Math.min(30_000, 2_000 * 2 ** attempt));
    });
    return () => { alive = false; clearTimeout(timer); };
  }, [taskId, sessionsEpoch]);
  const retrySessions = useCallback(() => {
    sessionsRetryRef.current = 0;
    setSessionsEpoch((epoch) => epoch + 1);
  }, []);
  const allSessions = taskSessions.taskId === (taskId || "") ? taskSessions.items : NO_TASK_SESSIONS;
  // An ACP session with program "oceanleo" (old imports) is not a native chat: it is never shown as one.
  const sessions = useMemo(() => allSessions.filter(usableSession), [allSessions]);
  const sessionsLoaded = taskSessions.taskId === taskId && taskSessions.loaded;
  const sessionsFailed = Boolean(taskId) && taskSessions.taskId === taskId && taskSessions.failed;
  const taskModeKnown = Boolean(taskId) && (taskMode.taskId === taskId || messagesTaskId === taskId);
  const computerTask = taskMode.taskId === taskId && taskMode.computer;

  // The URL names the conversation; a change from outside (back/forward, a link
  // to another `computerSession` of this task) switches it.
  const lastParamRef = useRef<string | null>(null);
  const writeSessionParam = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("computerSession", id);
    else url.searchParams.delete("computerSession");
    lastParamRef.current = id ?? "";
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const [, setLocationTick] = useState(0);
  useEffect(() => {
    const changed = () => setLocationTick((tick) => tick + 1);
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);
  useEffect(() => {
    const param = new URL(window.location.href).searchParams.get("computerSession") || "";
    if (lastParamRef.current === null || lastParamRef.current === param) { lastParamRef.current = param; return; }
    lastParamRef.current = param;
    // Not decided yet for this task: the resolution below reads the URL itself.
    if (!taskId || selectedSession.taskId !== taskId || !selectedSession.resolved) return;
    if (param && param !== "cloud") {
      const named = sessions.find((session) => session.id === param);
      if (named) { setPickedChat(null); setSelectedSession({taskId, id: named.id, resolved: true}); }
      else if (sessionsLoaded) setSessionsEpoch((epoch) => epoch + 1);
    } else if (!computerTask) {
      setPickedChat(null);
      setSelectedSession({taskId, id: null, resolved: true});
    }
  });

  useEffect(() => {
    if (!taskId) return;
    if (selectedSession.taskId === taskId && selectedSession.resolved) return;
    const requested = new URL(window.location.href).searchParams.get("computerSession") || "";
    const named = requested && requested !== "cloud" ? sessions.find((session) => session.id === requested) : undefined;
    if (!named) {
      if (!taskModeKnown) return;
      // Until the list is read, a named session or a computer task waits (the URL is kept);
      // a cloud task opens its OceanLeo conversation right away.
      if (!sessionsLoaded && (computerTask || (requested && requested !== "cloud"))) return;
    }
    const chosen = named ?? (computerTask ? latestComputerTaskSession(sessions) : null);
    setSelectedSession({taskId, id: chosen?.id ?? null, resolved: true});
    if (requested !== (chosen?.id ?? "")) {
      // A legacy `computerSession=cloud` (or a stale id) is dropped instead of opening an empty page;
      // a computer task opened on its latest session names it, so a reload lands on the same one.
      writeSessionParam(chosen?.id ?? null);
    }
  }, [taskId, sessions, sessionsLoaded, selectedSession, taskModeKnown, computerTask, writeSessionParam]);

  const activeSession = selectedSession.taskId === (taskId || "") && selectedSession.id
    ? sessions.find((session) => session.id === selectedSession.id) ?? null : null;
  const conversationResolved = !taskId || (selectedSession.taskId === taskId && selectedSession.resolved);
  const pick = !activeSession && pickedChat && pickedChat.taskId === (taskId || "") ? pickedChat.conversation : null;

  // Computers in play (name, online state). "Not known yet" is not offline; the state
  // refreshes on the cadence the computer views use (15 s) and on window focus.
  const draftComputerId = !taskId && draftConversation && draftConversation.kind !== "oceanleo" ? draftConversation.computerId : "";
  const computerIds = useMemo(() => [...new Set([
    ...allSessions.map((session) => session.computer_id),
    ...(pick ? [pick.computerId] : []),
    ...(draftComputerId ? [draftComputerId] : []),
  ])].sort().join(","), [allSessions, pick?.computerId, draftComputerId]);
  useEffect(() => {
    const ids = computerIds ? computerIds.split(",") : [];
    if (!ids.length) return;
    let alive = true;
    // Rows this tab read a moment ago (the homepage pick) show at once instead of "connecting"; the read below refreshes them.
    const known = ids.map((id) => knownComputer(id));
    setComputers((current) => known.reduce((next, row) => row && !next[row.id] ? {...next, [row.id]: row} : next, current));
    const load = () => {
      void Promise.allSettled(ids.map((id) => getComputer(id))).then((rows) => {
        if (!alive) return;
        rows.forEach((row) => { if (row.status === "fulfilled" && row.value?.id) rememberComputer(row.value); });
        setComputers((current) => {
          let next = current;
          rows.forEach((row, index) => {
            const id = ids[index];
            // A computer that no longer exists is shown offline; any other failure retries on the next tick.
            const value = row.status === "fulfilled" ? row.value
              : (row.reason as {status?: number} | null)?.status === 404 ? removedComputer(id, allSessions) : null;
            if (value && current[id] !== value) next = next === current ? {...current, [id]: value} : {...next, [id]: value};
          });
          return next;
        });
      });
    };
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, COMPUTER_REFRESH_MS);
    window.addEventListener("focus", load);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", load); };
  }, [computerIds]);
  const computerFor = useCallback((computerId: string): Computer | null => computers[computerId] ?? null, [computers]);

  // The OceanLeo conversation's bound target. A computer task (`mode="computer"`) has
  // no OceanLeo conversation of its own: its Device control shows the computer of the
  // conversation in front, and the OceanLeo row is disabled with a reason.
  const taskBound = boundTarget.taskId === taskId ? boundTarget.target : null;
  const frontComputer = activeSession
    ? {id: activeSession.computer_id, name: activeSession.computer_name}
    : pick ? {id: pick.computerId, name: pick.computerName} : null;
  const resolvedBoundTarget: ExecutionTarget | null = !taskId ? null
    : computerTask
      ? (frontComputer ? {kind: "computer", id: frontComputer.id, name: frontComputer.name || frontComputer.id}
        : sessionsLoaded ? computerTaskSessionsTarget(allSessions) : null)
      : taskBound;
  const oceanleoDisabledReason = computerTask ? tt("OceanLeo 请在新任务里使用") : null;
  const conversation: ConversationTarget | undefined = activeSession
    ? sessionConversation(activeSession)
    : pick
      ? pick
      : taskId
        ? resolvedBoundTarget && conversationResolved ? {kind: "oceanleo", target: resolvedBoundTarget} : undefined
        : draftConversation;
  const nativeChat = conversation?.kind === "native" && conversation.view === "chat";
  const surfaceActive = Boolean(activeSession && activeSession.kind !== "acp");
  useEffect(() => {
    if (activeSession?.kind === "acp") {
      const id = activeSession.id;
      setOpenedChats((current) => current.includes(id) ? current : [...current, id]);
    }
    if (activeSession && activeSession.kind !== "acp") {
      const id = activeSession.id;
      setOpenedSurfaces((current) => current.includes(id) ? current : [...current, id]);
    }
  }, [activeSession]);
  const conversationComputer = conversation && conversation.kind !== "oceanleo" ? computerFor(conversation.computerId) : null;

  const patchSession = useCallback((sessionId: string, nativeId: string) => {
    const known = knownComputerTaskSession(sessionId);
    if (known) rememberComputerTaskSession({...known, native_session_id: nativeId});
    setTaskSessions((current) => ({...current, items: current.items.map((row) => row.id === sessionId ? {...row, native_session_id: nativeId} : row)}));
  }, []);
  // CLI / terminal surfaces report their native id; the page binds it once, in order.
  // A rejected bind is handed back so the surface keeps its process and retries.
  type SurfaceBinding = {bound: string | null; pending: Promise<void> | null; bind: (nativeId: string) => Promise<void>};
  const surfaceBinders = useRef(new Map<string, SurfaceBinding>());
  const surfaceBinder = useCallback((session: ComputerTaskSession) => {
    const known = surfaceBinders.current.get(session.id);
    if (known) return known.bind;
    const entry: SurfaceBinding = {
      bound: session.native_session_id, pending: null,
      bind: async (nativeId: string) => {
        if (entry.pending) await entry.pending.catch(() => undefined);
        if (entry.bound === nativeId) return;
        const pending = bindComputerTaskSession(session.id, nativeId).then(() => {
          entry.bound = nativeId;
          patchSession(session.id, nativeId);
        });
        entry.pending = pending;
        try { await pending; } finally { if (entry.pending === pending) entry.pending = null; }
      },
    };
    surfaceBinders.current.set(session.id, entry);
    return entry.bind;
  }, [patchSession]);

  const showSession = useCallback((id: string | null) => {
    if (!taskId) return;
    setSelectedSession({taskId, id, resolved: true});
    writeSessionParam(id);
  }, [taskId, writeSessionParam]);

  // A draft created a task: this page adopts it in place (its only session is the one
  // just created: no list read), and tells the host once; the host decides any navigation.
  const adoptCreatedTask = useCallback(async (task: string, session: ComputerTaskSession, prompt?: string) => {
    adoptedTaskRef.current = task;
    adoptedEpochRef.current = sessionsEpoch;
    setTaskSessions({taskId: task, items: [session], loaded: true, failed: false});
    setSelectedSession({taskId: task, id: session.id, resolved: true});
    setPickedChat(null);
    if (explicitTaskId === undefined) setLocalTaskId(task);
    let workspaceSessionId = "";
    if (workspace) {
      const bound = await workspace.bindTask(task, prompt).catch(() => null);
      workspaceSessionId = bound?.id || "";
    }
    onTaskCreated?.(task, workspaceSessionId || undefined);
  }, [explicitTaskId, onTaskCreated, sessionsEpoch, workspace]);

  const changeConversation = useCallback(async (next: ConversationTarget) => {
    setConversationError("");
    if (next.kind === "oceanleo") {
      if (computerTask) return;
      setPickedChat(null);
      setSettingsOpen(false);
      if (taskId) showSession(null);
      else setDraftConversation(next);
      return;
    }
    const kind: ComputerTaskSession["kind"] = next.kind === "terminal" ? "terminal" : next.view === "cli" ? "cli" : "acp";
    const program: ComputerTaskSession["program"] = next.kind === "terminal" ? null : next.program;
    const existing = (next.sessionId ? sessions.find((session) => session.id === next.sessionId) : null) ??
      findComputerTaskSession(sessions, {computerId: next.computerId, kind, program});
    if (taskId && existing) { setPickedChat(null); showSession(existing.id); return; }
    // A native chat is created by its first send (nothing to run before that).
    if (next.kind === "native" && next.view === "chat") {
      const {sessionId: _ignored, ...picked} = next;
      void _ignored;
      setPickedChat({taskId: taskId || "", conversation: picked});
      if (taskId) showSession(null);
      return;
    }
    if (conversationBusy) return;
    const requestTask = taskId;
    setConversationBusy(true);
    try {
      const result = await createComputerTaskSession(next.computerId, {
        kind, program, ...(requestTask ? {task_id: requestTask} : {}), request_id: crypto.randomUUID(),
      });
      if (requestTask) {
        setTaskSessions((current) => current.taskId === requestTask
          ? {...current, items: [...current.items.filter((row) => row.id !== result.session.id), result.session]} : current);
        setPickedChat(null);
        setSelectedSession((current) => current.taskId === requestTask ? {taskId: requestTask, id: result.session.id, resolved: true} : current);
        if (taskId === requestTask) writeSessionParam(result.session.id);
      } else {
        await adoptCreatedTask(result.task_id, result.session);
      }
    } catch {
      // The conversation (and the Device label) stay where they were.
      setConversationError(tt("没能打开这段对话，请稍后再试。"));
    } finally {
      setConversationBusy(false);
    }
  }, [adoptCreatedTask, computerTask, conversationBusy, sessions, showSession, taskId, tt, writeSessionParam]);
  const onConversationChange = useCallback((next: ConversationTarget) => { void changeConversation(next); }, [changeConversation]);
  const toggleSettings = useCallback(() => setSettingsOpen((open) => !open), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  useEffect(() => {
    if (!conversation || conversation.kind === "oceanleo") setSettingsOpen(false);
  }, [conversation?.kind]);

  // First send of a picked native chat: the text is already queued in its thread (the
  // user's bubble shows at once); this creates the managed session (and, in a draft, the
  // task) and the same thread sends it as soon as the session and link are bound. A
  // failure is never silent: the caller marks the bubble unsent with a retry.
  const chatKeysRef = useRef(new Map<string, string>());
  /** One request id per picked chat until it is created, so a retry cannot make a second session. */
  const pickRequestIds = useRef(new Map<string, string>());
  const startNative = useCallback(async (text: string): Promise<boolean> => {
    if (readOnly || conversationBusy || !pick) return false;
    const requestTask = taskId;
    const key = pickChatKey(pick);
    let requestId = pickRequestIds.current.get(key);
    if (!requestId) pickRequestIds.current.set(key, requestId = crypto.randomUUID());
    setConversationBusy(true);
    try {
      const result = await createComputerTaskSession(pick.computerId, {
        kind: "acp", program: pick.program, ...(requestTask ? {task_id: requestTask} : {}), request_id: requestId,
      });
      pickRequestIds.current.delete(key);
      chatKeysRef.current.set(result.session.id, key);
      if (requestTask) {
        setTaskSessions((current) => current.taskId === requestTask ? {...current, items: [...current.items, result.session]} : current);
        setPickedChat(null);
        showSession(result.session.id);
      } else await adoptCreatedTask(result.task_id, result.session, text);
      return true;
    } catch {
      return false;
    } finally {
      setConversationBusy(false);
    }
  }, [adoptCreatedTask, conversationBusy, pick, readOnly, showSession, taskId]);

  // Homepage launch (nativeLaunch): the host created the task; adopt it under the
  // same chat entry key, so the host's thread carries over (no remount, no second socket).
  const launchKey = nativeLaunch ? pickChatKey(nativeLaunch.conversation) : "";
  const launchCreated = nativeLaunch?.created ?? null;
  const launchPrompt = nativeLaunch?.thread.pending?.text;
  const adoptedLaunchRef = useRef("");
  useEffect(() => {
    if (!launchCreated || adoptedLaunchRef.current === launchCreated.session.id) return;
    adoptedLaunchRef.current = launchCreated.session.id;
    chatKeysRef.current.set(launchCreated.session.id, launchKey);
    void adoptCreatedTask(launchCreated.taskId, launchCreated.session, launchPrompt);
  }, [launchCreated, launchKey, launchPrompt, adoptCreatedTask]);
  const launchComputer = nativeLaunch?.computer ?? null;
  useEffect(() => {
    if (launchComputer) setComputers((current) => current[launchComputer.id] === launchComputer ? current : {...current, [launchComputer.id]: launchComputer});
  }, [launchComputer]);

  // One plain line (with retry) while this task's computer conversations cannot be read.
  const sessionsNotice = sessionsFailed ? (
    <p className="flex items-center gap-2 text-[13px] text-stone-500" data-computer-sessions-failed>
      <span>{tt("暂时没读到这个任务在电脑上的对话。")}</span>
      <button type="button" onClick={retrySessions}
        className="rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] font-medium text-stone-600 hover:bg-stone-50">
        {tt("重试")}
      </button>
    </p>
  ) : null;
  const conversationNotice = conversationError || sessionsNotice ? (
    <>
      {conversationError && <p className="text-[14px] text-rose-500" data-agent-chat-error>{conversationError}</p>}
      {sessionsNotice}
    </>
  ) : null;

  // 流式正文（可选，见 AgentChatProps.agentStreamEndpoint）。
  // 轮询在旁边照常跑，所以这条流唯一的职责是让正文**早一点**出现；
  // 它挂了就只是回到轮询的节奏，不会少任何内容——因此回落不需要重试，只需要告知。
  useEffect(() => {
    if (!agentStreamEndpoint || !taskId) return;
    if (status && status !== "running") return;
    let cancelled = false;
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setStreamText("");
    void (async () => {
      const outcome = await consumeAgentStream(
        {
          url: agentStreamEndpoint,
          body: { task_id: taskId },
          signal: controller.signal,
        },
        (full) => {
          if (!cancelled) setStreamText(full);
        },
      );
      if (cancelled) return;
      if (outcome.kind === "unavailable") {
        setStreamNotice(translateRef.current("实时流不可用，已回落到轮询刷新。"));
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      streamAbortRef.current = null;
    };
  }, [agentStreamEndpoint, taskId, status]);

  // ---------------------------------------------------------------------
  // 粘底滚动
  // ---------------------------------------------------------------------
  // 原实现是 `messages` 一变就 scrollTo(bottom)，**无条件**。用户往上翻看历史时
  // 会被硬拽回底部；流式渲染下 `messages` 每几百毫秒变一次，于是变成每秒好几次
  // ——想回头看一眼上文都做不到。
  //
  // 改成标准粘底：在底部附近才跟随；用户主动往上滚就交出控制权，只用一个浮标
  // 告诉他「下面还有 N 条」，回不回去他自己决定。
  const [following, setFollowing] = useState(true);
  const [unread, setUnread] = useState(0);
  // 跟随状态要在滚动回调里同步读写，state 的异步更新赶不上连续滚动事件。
  const followingRef = useRef(true);
  const seenMessageCountRef = useRef(0);

  const scrollToLatest = useCallback((behavior: ScrollBehavior) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  /** 回到跟随态：点浮标、以及自己发言时都走这里。 */
  const resumeFollowing = useCallback(() => {
    followingRef.current = true;
    setFollowing(true);
    setUnread(0);
    scrollToLatest(scrollBehavior());
  }, [scrollToLatest]);

  // W5 (2026-10-31): where this task's conversation opens. Its first frame is placed
  // once (instant, never smooth): back at the remembered spot when the user had
  // scrolled up there earlier in this page, otherwise at the latest message
  // (reload / first open). Placed while the loading cover is still on, so the
  // first visible frame is already in place.
  const placedTaskRef = useRef("");
  /** The `messages` the first frame was placed for (that render needs no follow scroll). */
  const justPlacedRef = useRef<AgentMessage[] | null>(null);
  const placedHoldRef = useRef<(() => void) | null>(null);
  const scrollKeyRef = useRef("");
  scrollKeyRef.current = taskId ? `task:${taskId}` : "";
  const cloudPaneShown = !conversation || conversation.kind === "oceanleo";
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !taskId || messagesTaskId !== taskId || placedTaskRef.current === taskId) return;
    if (messages.length === 0 || !cloudPaneShown || !scrollPaneShown(el)) return;
    placedTaskRef.current = taskId;
    seenMessageCountRef.current = messages.length;
    const placed = placeConversationScroll(el, `task:${taskId}`, () => followingRef.current);
    followingRef.current = placed.follow;
    setFollowing(placed.follow);
    justPlacedRef.current = messages;
    placedHoldRef.current?.();
    placedHoldRef.current = placed.release;
  }, [messages, messagesTaskId, taskId, cloudPaneShown]);
  useEffect(() => () => placedHoldRef.current?.(), []);

  // W5: one loading look per task switch. This conversation is ready to be shown
  // once the task's first read is in and the page decided which conversation is
  // in front (a native chat then reports its own saved copy). No-op without a
  // TaskLoadingGate above (home page, workspace consoles).
  useTaskLoadingReport(
    !taskId ||
      readFailedTaskId === taskId ||
      (messagesTaskId === taskId && (conversationResolved || sessionsFailed)),
  );

  const handleStreamScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = isNearBottom({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
    if (placedTaskRef.current && scrollKeyRef.current === `task:${placedTaskRef.current}`) {
      rememberConversationScroll(scrollKeyRef.current, el.scrollTop, atBottom);
    }
    if (followingRef.current === atBottom) return;
    followingRef.current = atBottom;
    setFollowing(atBottom);
    if (atBottom) setUnread(0);
  }, []);

  useEffect(() => {
    // 未读记的是**新消息条数**，不是渲染次数：流式期间最后一条会一直长，
    // 那是同一条在变，不该让计数一路往上跳。
    const added = Math.max(0, messages.length - seenMessageCountRef.current);
    seenMessageCountRef.current = messages.length;
    // The first frame was just placed (instant): no smooth scroll from the top.
    if (justPlacedRef.current === messages) {
      justPlacedRef.current = null;
      return;
    }
    // Nothing placed for this task yet (its copy is still on its way): nothing to follow.
    if (taskId && placedTaskRef.current !== taskId) return;
    if (followingRef.current) {
      scrollToLatest(scrollBehavior());
      return;
    }
    if (added > 0) setUnread((current) => current + added);
  }, [messages, scrollToLatest]);

  // 换对话：跟随、未读、停止判定、服务端快照全部归零，
  // 免得把上一段对话的滚动位置和「已停止」标记带到新对话上。
  useEffect(() => {
    serverMessagesRef.current = [];
    stoppedTaskRef.current = "";
    setStoppedTaskId("");
    setStreamText("");
    setStreamNotice("");
    seenMessageCountRef.current = 0;
    followingRef.current = true;
    setFollowing(true);
    setUnread(0);
  }, [taskId]);

  /** 用户又开口了：清掉「已停止」，并回到跟随态。 */
  const beginUserTurn = useCallback(() => {
    stoppedTaskRef.current = "";
    setStoppedTaskId("");
    resumeFollowing();
  }, [resumeFollowing]);

  // 模型在回答里下的编辑器指令：逐条处理，会改内容的先弹确认卡。
  // 手上的消息还属于上一段对话时先不看，免得把新对话的历史当成刚说的话。
  useEffect(() => {
    if (messagesTaskId !== (taskId || "")) return;
    ingestEditorCommands(messages, taskId || "");
  }, [messages, messagesTaskId, taskId, ingestEditorCommands]);

  // 「我的任务」何时出现这条会话由服务端决定：task 出生时已绑在会话上，第一条 AI
  // 回答落地时服务端盖 `first_output_at`。不再"看到 assistant 消息就建档"：恢复一段
  // 旧对话（刷新、切页签回来）时那会凭空 ensure 出一条没人干活的新会话。

  const start = useCallback(
    async (
      prompt: string,
      uploaded?: AgentAttachment[],
      orgId?: string,
      capturedTurn?: { context: string; filePin: string | null },
      executionTarget?: ExecutionTarget,
    ) => {
      if (readOnly) {
        setError(tt("这段对话只能查看。"));
        return false;
      }
      // Freeze both the model-visible file contents and exact target before the
      // first await. A file switch while a new session is being prepared must not
      // silently change which file this user turn refers to.
      const turn = capturedTurn || captureEditorTurn(prompt);
      setBusy(true);
      setError(null);
      noteUserTurn(turn.filePin);
      beginUserTurn();
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
      // The draft session this very call created for a home launch; only that
      // one may be discarded again when the gateway refuses the task.
      let freshDraftId = "";
      if (workspace) {
        let active = workspace.session;
        if (startFreshSession && !freshSessionStartedRef.current) {
          // 刚开口的 agent 线程：建会话让 task 出生就绑上；服务端记下第一条回答前
          // 它仍是「我的任务」看不见的草稿。
          freshSessionStartedRef.current = true;
          active = await workspace.startNew({
            title: prompt,
            remountRuntime: false,
            intent: "thread",
          });
          freshDraftId = active?.id || "";
        } else if (!active) {
          active = await workspace.ensureActive({
            title: prompt,
            intent: "thread",
          });
        }
        if (!active && !workspace.sessionId) {
          // startNew / ensureActive 没给出会话（接口失败、并发被丢弃……）时再补一次
          // ensureActive，而不是让 task 无会话出生：无会话的 task 在「我的任务」里点开
          // 就是 404，之后会话补建出来又会把这条对话冲掉（见 2026-09-07 图 f2dde413）。
          active = await workspace.ensureActive({
            title: prompt,
            intent: "thread",
          });
        }
        linkedSessionId = active?.id || workspace.sessionId || "";
      }

      const liveFileContext = readActiveAgentFileContext(workspace?.activeFileScopeId);
      if (activeAgentFilePin(liveFileContext) !== turn.filePin) {
        setBusy(false);
        setMessages((current) => current.filter((message) => message.id !== -1));
        setError("右侧 Library 文件在准备会话时已切换；这条消息未创建任务，请检查当前文件后重试。");
        return false;
      }
      const filePersistence = await persistActiveAgentFile(
        workspace?.activeFileScopeId,
        null,
      );
      if (!filePersistence.ok) {
        setBusy(false);
        setMessages((current) => current.filter((message) => message.id !== -1));
        setError(filePersistence.error || "当前文件关联尚未保存，任务没有创建。");
        return false;
      }
      if (activeAgentFilePin(readActiveAgentFileContext(workspace?.activeFileScopeId)) !== turn.filePin) {
        setBusy(false);
        setMessages((current) => current.filter((message) => message.id !== -1));
        setError("保存文件关联期间右侧 Library 文件已切换；没有创建任务，请检查当前文件后重试。");
        return false;
      }

      const result = await createTask({
        prompt,
        // 让模型看见右边现在开着什么、能做什么（只给模型看；没开编辑器时为空）。
        hiddenContext: turn.context || undefined,
        mode,
        siteId,
        agentId,
        teamId,
        attachments: uploaded,
        promptOverride: promptOverride || undefined,
        sessionId: linkedSessionId || undefined,
        orgId,
        projectId,
        executionTarget,
      });
      setBusy(false);
      // A task aimed at a paired computer is explained in words, never as the
      // gateway's raw code (`agent.ts` keeps codes in `error` for other callers).
      const failure = result.ok && result.data ? null : localAgentFailure(
        result, (result.executionTarget ?? executionTarget)?.kind === "device");
      const unconfirmed = failure?.kind === "unconfirmed" ? failure : null;
      if (!unconfirmed && (!result.ok || !result.data)) {
        setMessages((current) =>
          current.filter((message) => message.id !== -1),
        );
        setError(
          result.status === 401
            ? tt("登录后即可使用 app。")
            : failure?.text || result.error || tt("创建任务失败"),
        );
        if (failure?.kind === "refused" && failure.definite && freshDraftId && workspace?.discardDraft) {
          // The home launch created this draft only for this task, and a
          // definite refusal proves nothing was handed to the computer: drop
          // the empty row now instead of at the next launch. The next send
          // starts a fresh draft; startNew queues behind this discard.
          freshSessionStartedRef.current = false;
          void workspace.discardDraft(freshDraftId);
        }
        // `false` hands the typed task back to the composer; nothing re-sends it.
        return false;
      }

      // A lost receipt after the gateway created the task: show that same task
      // (never a second dispatch to the computer). Its server rows replace the
      // optimistic bubble, and the typed text still goes back to the composer.
      const createdTaskId = unconfirmed ? unconfirmed.taskId : result.data!.task_id;
      if (unconfirmed) {
        setMessages((current) => current.filter((message) => message.id !== -1));
        setError(unconfirmed.text);
      }
      // 这段对话是刚建起来的：它的第一份消息里没有历史，模型的回答不能被当历史吞掉。
      noteOwnEditorTask(createdTaskId);
      actionHistoryRef.current = ownTaskActionMark(createdTaskId);
      loadedTaskRef.current = createdTaskId;
      setLocalTaskId(createdTaskId);
      setStatus("running");
      let createdSessionId = linkedSessionId;
      if (workspace) {
        const bound = await workspace.bindTask(createdTaskId, prompt);
        createdSessionId = bound?.id || linkedSessionId;
      }
      if (activeAgentFilePin(readActiveAgentFileContext(workspace?.activeFileScopeId)) === turn.filePin) {
        const taskPersistence = await persistActiveAgentFile(
          workspace?.activeFileScopeId,
          createdTaskId,
        );
        if (!taskPersistence.ok) {
          setError("任务已创建，但当前文件关联的任务快照更新失败；已保留创建前的文件快照，请不要重复发送同一条创建请求。");
        }
      }
      onTaskCreated?.(createdTaskId, createdSessionId || undefined);
      markSend(createdTaskId, 1);
      void refresh(createdTaskId);
      // Unconfirmed: the task is shown, but the typed text is not consumed.
      return !unconfirmed;
    },
    [
      agentId,
      beginUserTurn,
      captureEditorTurn,
      mode,
      noteOwnEditorTask,
      noteUserTurn,
      onTaskCreated,
      promptOverride,
      projectId,
      readOnly,
      refresh,
      siteId,
      startFreshSession,
      teamId,
      tt,
      workspace,
    ],
  );

  // A task handed in from outside (home launch, ?q=) that did not go through
  // goes back into this composer, text and files, so nothing the user typed is
  // lost. It is only offered again; nothing re-sends it.
  const restoreAttachments = atts.restoreReady;
  const returnToComposer = useCallback(
    (prompt: string, uploaded?: AgentAttachment[]) => {
      if (prompt) setInput((current) => current || prompt);
      if (!toolsOn || !uploaded?.length) return;
      restoreAttachments(uploaded.map((attachment, index) => ({
        id: `returned-${index}-${attachment.url}`,
        name: attachment.name || attachment.url.split("/").pop() || "",
        url: attachment.url,
        mime: attachment.mime,
        previewUrl: attachment.media_type === "image" ? attachment.url : undefined,
        uploading: false,
        attachment,
      })));
    },
    [restoreAttachments, toolsOn],
  );

  const continueInitialTask = useCallback(
    async (
      id: string,
      prompt: string,
      uploaded?: AgentAttachment[],
    ) => {
      if (readOnly) {
        setError(tt("这段对话只能查看。"));
        return;
      }
      const effectivePrompt = prompt || tt("请分析我上传的文件。");
      const optimisticMessageId = Date.now();
      const turn = captureEditorTurn(effectivePrompt);
      noteUserTurn(turn.filePin);
      beginUserTurn();
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
      noteOutgoingTurn(id, userTurnCount(messages) + 1);
      if (activeAgentFilePin(readActiveAgentFileContext(workspace?.activeFileScopeId)) !== turn.filePin) {
        setBusy(false);
        setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
        setError("右侧 Library 文件已切换；这条消息没有发送，请针对当前文件重试。");
        return;
      }
      const filePersistence = await persistActiveAgentFile(
        workspace?.activeFileScopeId,
        id,
      );
      if (!filePersistence.ok) {
        setBusy(false);
        setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
        setError(filePersistence.error || "当前文件关联尚未保存；这条消息没有发送。");
        return;
      }
      if (activeAgentFilePin(readActiveAgentFileContext(workspace?.activeFileScopeId)) !== turn.filePin) {
        setBusy(false);
        setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
        setError("保存文件关联期间右侧 Library 文件已切换；这条消息没有发送。");
        return;
      }
      const result = await followUp(id, effectivePrompt, uploaded, turn.context);
      setBusy(false);
      if (!result.ok) {
        const failure = localAgentFailure(result, isLocalExecution);
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticMessageId),
        );
        setError(failure?.text || result.error || tt("发送失败"));
        returnToComposer(prompt, uploaded);
        if (failure?.kind === "unconfirmed") {
          // Possibly committed on the computer: re-read this same task.
          onTaskCreated?.(id);
          kickAfterFollowUp(id);
        }
        return;
      }
      // 对 ?q= 来说，已有 active free session 时 task 已经存在；成功接续后同样通知
      // 宿主清理一次性 query，避免既丢 prompt 又让 URL 永久残留 q。
      onTaskCreated?.(id);
      kickAfterFollowUp(id);
    },
    [
      beginUserTurn,
      captureEditorTurn,
      isLocalExecution,
      kickAfterFollowUp,
      messages,
      noteOutgoingTurn,
      noteUserTurn,
      onTaskCreated,
      readOnly,
      refresh,
      returnToComposer,
      tt,
      workspace,
    ],
  );

  // initialPrompt 只能在 Provider 查完最近 session/task 后触发，避免加载中的空 task
  // 提前制造第二条 thread。历史模式不传 initialPrompt，因此只 refresh，不自动重跑。
  useEffect(() => {
    if (startedRef.current) return;
    if (workspace?.availability === "loading") return;
    startedRef.current = true;
    // Provider 用 runtimeEpoch 重挂载过本组件（「新建」）：首条提示词已经发过，不再重发。
    if (launchOnceRef?.current) return;
    if (launchOnceRef) launchOnceRef.current = true;
    const hasInitial =
      Boolean(initialPrompt?.trim()) || Boolean(initialAtts && initialAtts.length);
    if (!hasInitial) return;
    const prompt = (initialPrompt || "").trim();
    if (taskId) {
      // 只在 WorkspaceSessionProvider 场景接续已有 thread；旧的显式 taskId 调用仍保持
      // “只回看 task、忽略 initialPrompt”的兼容行为。
      if (workspace) {
        void continueInitialTask(taskId, prompt, initialAtts);
      }
      return;
    }
    // The home composer already cleared itself: a send that did not go through
    // (e.g. local execution off on the chosen computer) returns the task here.
    void start(prompt, initialAtts, undefined, undefined, initialExecutionTarget).then((started) => {
      if (!started) returnToComposer(prompt, initialAtts);
    });
  }, [
    continueInitialTask,
    initialAtts,
    initialPrompt,
    initialExecutionTarget,
    returnToComposer,
    start,
    taskId,
    workspace,
    workspace?.availability,
  ]);

  async function send(orgId?: string, executionTarget?: ExecutionTarget) {
    const prompt = input.trim();
    // Allow send when there's an attachment even if the text is empty. But block
    // while any attachment is still uploading.
    // 关掉输入工具时不存在任何用户附件来源，附件相关的分支一律走空集，
    // 免得留下「界面没有入口、提交路径却还认附件」的半开状态。
    const uploaded = toolsOn ? atts.ready() : [];
    if ((!prompt && uploaded.length === 0) || busy || (toolsOn && atts.uploading))
      return;
    if (readOnly) {
      setError(tt("这段对话只能查看。"));
      return;
    }
    const submittedInput = input;
    const submittedAttachments = toolsOn ? atts.attachments : [];
    const restoreSubmission = () => {
      setInput((current) => (current ? current : submittedInput));
      atts.restoreReady(submittedAttachments);
    };
    setInput("");
    atts.clear();
    const effectivePrompt = prompt || tt("请分析我上传的文件。");
    const turn = captureEditorTurn(effectivePrompt);
    noteUserTurn(turn.filePin);
    beginUserTurn();
    if (!taskId) {
      const started = await start(effectivePrompt, uploaded, orgId, turn, executionTarget);
      if (!started) restoreSubmission();
      return;
    }
    setBusy(true);
    if (branchFromMessageId) {
      if (activeAgentFilePin(readActiveAgentFileContext(workspace?.activeFileScopeId)) !== turn.filePin) {
        setBusy(false);
        restoreSubmission();
        setError("右侧 Library 文件已切换；没有创建分支任务，请重新发送。");
        return;
      }
      const filePersistence = await persistActiveAgentFile(
        workspace?.activeFileScopeId,
        taskId,
      );
      if (!filePersistence.ok) {
        setBusy(false);
        restoreSubmission();
        setError(filePersistence.error || "当前文件关联尚未保存；没有创建分支任务。");
        return;
      }
      if (activeAgentFilePin(readActiveAgentFileContext(workspace?.activeFileScopeId)) !== turn.filePin) {
        setBusy(false);
        restoreSubmission();
        setError("保存文件关联期间右侧 Library 文件已切换；没有创建分支任务。");
        return;
      }
      const result = await branchTask(
        taskId,
        branchFromMessageId,
        effectivePrompt,
        uploaded,
        orgId,
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
          setError(tt("分支已创建，右侧工作区稍后更新；任务会继续运行。"));
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
    noteOutgoingTurn(taskId, userTurnCount(messages) + 1);
    if (activeAgentFilePin(readActiveAgentFileContext(workspace?.activeFileScopeId)) !== turn.filePin) {
      setBusy(false);
      setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
      restoreSubmission();
      setError("右侧 Library 文件已切换；这条消息没有发送，请针对当前文件重试。");
      return;
    }
    const filePersistence = await persistActiveAgentFile(
      workspace?.activeFileScopeId,
      taskId,
    );
    if (!filePersistence.ok) {
      setBusy(false);
      setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
      restoreSubmission();
      setError(filePersistence.error || "当前文件关联尚未保存；这条消息没有发送。");
      return;
    }
    if (activeAgentFilePin(readActiveAgentFileContext(workspace?.activeFileScopeId)) !== turn.filePin) {
      setBusy(false);
      setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
      restoreSubmission();
      setError("保存文件关联期间右侧 Library 文件已切换；这条消息没有发送。");
      return;
    }
    const r = await followUp(taskId, effectivePrompt, uploaded, turn.context, orgId);
    setBusy(false);
    if (r.ok) kickAfterFollowUp(taskId);
    else {
      const failure = localAgentFailure(r, isLocalExecution);
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessageId),
      );
      restoreSubmission();
      setError(failure?.text || r.error || tt("发送失败"));
      // Possibly committed on the computer: re-read this task; never re-send.
      if (failure?.kind === "unconfirmed") kickAfterFollowUp(taskId);
    }
  }

  // 「中止」：AI 工作中（任务 running / 请求在途）点停止键 → 停任务。
  const controlLocal = useCallback(async (action: LocalAgentControl) => {
    if (readOnly || !taskId || !isLocalExecution || localControlInFlight.current) return false;
    if (!localAgentCanControl(localRun, action)) {
      void refresh(taskId);
      return false;
    }
    const id = taskId;
    localControlInFlight.current = true;
    setLocalControlBusy(true);
    try {
      const result = await controlLocalAgentTask(id, action, localRun!.revision);
      if (loadedTaskRef.current !== id) return false;
      if (result.ok) {
        const next = parseLocalAgentRun(result.data);
        setLocalExecution(current => current.taskId === id ? {...current, run: newerLocalAgentRun(current.run, next)} : current);
      } else {
        setError(tt("没有收到电脑控制的确认，请核对最新状态；不会自动重复操作。"));
      }
      void refresh(id);
      return result.ok;
    } catch {
      if (loadedTaskRef.current === id) {
        setError(tt("没有收到电脑控制的确认，请核对最新状态；不会自动重复操作。"));
        void refresh(id);
      }
      return false;
    } finally {
      localControlInFlight.current = false;
      setLocalControlBusy(false);
    }
  }, [readOnly, taskId, isLocalExecution, localRun, refresh, tt]);

  const stop = useCallback(async () => {
    if (readOnly) return;
    if (!taskId) {
      setBusy(false);
      return;
    }
    if (isLocalExecution) {
      await controlLocal("stop");
      return;
    }
    // 真的把流掐断（AbortSignal 一路传到 fetch），不是拿到结果再丢掉。
    // 已经收到的 streamText 原样留着——用户多半正在读它。
    streamAbortRef.current?.abort();
    // 先落本地再等服务端。停止是用户唯一能踩的刹车，等一个来回（还可能失败）
    // 才有反应，按下去就是「没反应」。
    stoppedTaskRef.current = taskId;
    setStoppedTaskId(taskId);
    setStatus("stopped");
    setBusy(false);
    const r = await stopTask(taskId);
    if (r.ok) {
      // 停下之前那一小段已经写进库、还没被轮询取回的正文要补齐——用户读到一半
      // 的东西不能因为他按了停止就丢。`refresh` 里的停止判定会挡住状态被写回 running。
      void refresh(taskId);
      return;
    }
    // 没停成就得说清楚，不能让界面显示「已停止」而后台还在烧钱。
    stoppedTaskRef.current = "";
    setStoppedTaskId("");
    setError(r.error || tt("没能停下这次任务，它可能仍在运行。"));
    void refresh(taskId);
  }, [readOnly, taskId, refresh, tt, isLocalExecution, controlLocal]);

  // 记录最新 assistant 文本条的 index，用于给它做流式打字机（其余条直接全量）。
  // 回答后的追问 chip 已取消（操作员 2026-10-31），旧行的 meta.suggestions 不再渲染。
  let lastAssistantIdx = -1;
  const lastUserIdx = messages.findLastIndex((message) => message.role === "user");
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
  const renderItems = buildAgentRenderItems(messages);
  const activeProgressKey = activeAgentProgressKey(renderItems, messages);
  // Only the block nothing visible follows yet is live; it folds once text starts after it.
  const liveProgressKey = liveAgentProgressKey(renderItems, messages);
  const presentation = threadPresentation(messages, status, {
    busy, taskId: taskId || "", stoppedTaskId, activeProgress: Boolean(activeProgressKey),
  });
  const turnState = latestTurn(messages);
  const sentAt = taskId ? sentAtFor(taskId, turnState.turn) : null;
  const showThinkingTicker = Boolean(
    presentation.thinking && !turnState.visible && sentAt !== null,
  );
  const thinkingSeconds = useThinkingSeconds(showThinkingTicker, sentAt);
  const thinkingText = showThinkingTicker
    ? thinkingLabel(tt, thinkingSeconds, turnState.thinkingChars)
    : tt("正在理解问题…");

  const sendSuggestion = useCallback(
    async (text: string) => {
      if (!taskId || busy || readOnly) return;
      const turn = captureEditorTurn(text);
      noteUserTurn(turn.filePin);
      beginUserTurn();
      setBusy(true);
      setMessages((m) => [
        ...m,
        { id: Date.now(), role: "user", kind: "text", content: text },
      ]);
      noteOutgoingTurn(taskId, userTurnCount(messages) + 1);
      if (activeAgentFilePin(readActiveAgentFileContext(workspace?.activeFileScopeId)) !== turn.filePin) {
        setBusy(false);
        setError("右侧 Library 文件已切换；这条追问没有发送，请针对当前文件重试。");
        return;
      }
      const filePersistence = await persistActiveAgentFile(
        workspace?.activeFileScopeId,
        taskId,
      );
      if (!filePersistence.ok) {
        setBusy(false);
        setError(filePersistence.error || "当前文件关联尚未保存；这条追问没有发送。");
        return;
      }
      if (activeAgentFilePin(readActiveAgentFileContext(workspace?.activeFileScopeId)) !== turn.filePin) {
        setBusy(false);
        setError("保存文件关联期间右侧 Library 文件已切换；这条追问没有发送。");
        return;
      }
      const r = await followUp(taskId, text, undefined, turn.context);
      setBusy(false);
      if (r.ok) kickAfterFollowUp(taskId);
      else {
        const failure = localAgentFailure(r, isLocalExecution);
        setError(failure?.text || r.error || tt("发送失败"));
        if (failure?.kind === "unconfirmed") kickAfterFollowUp(taskId);
      }
    },
    [
      taskId,
      beginUserTurn,
      busy,
      isLocalExecution,
      kickAfterFollowUp,
      messages,
      noteOutgoingTurn,
      readOnly,
      tt,
      captureEditorTurn,
      noteUserTurn,
      workspace,
    ],
  );

  const fireAgentText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || readOnly) return;
      if (!taskId) {
        await start(trimmed);
        return;
      }
      await sendSuggestion(trimmed);
    },
    [readOnly, taskId, start, sendSuggestion],
  );
  useEffect(() => {
    const onChip = (event: Event) => {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (prompt) void fireAgentText(prompt);
    };
    window.addEventListener("oceanleo-l4-chip", onChip);
    return () => window.removeEventListener("oceanleo-l4-chip", onChip);
  }, [fireAgentText]);

  // 选段模式（对标 Kimi）：点右上角「分享」→ 整页进入选择模式，底部输入框换成操作条。
  const share = useShareMode({
    messages,
    taskId,
    title: taskTitle,
    siteLabel:
      appLabelProp || (taskSiteId ? appNames?.[taskSiteId] || "" : "") || undefined,
  });
  // W5 share fix (2026-10-31): the select mode lives in the OceanLeo conversation's
  // own stream (its footer becomes the action bar). With a computer conversation in
  // front that stream is hidden: entering there looked like "the button vanished,
  // nothing happened". So the header entry is offered only while the OceanLeo
  // conversation is shown, and leaving it ends the select mode.
  const shareAvailable = cloudPaneShown && share.selectable.length > 0;
  const exitShare = share.exit;
  useEffect(() => {
    if (!cloudPaneShown && share.active) exitShare();
  }, [cloudPaneShown, share.active, exitShare]);

  // ---------------------------------------------------------------------
  // 对话内搜索（操作员 2026-09-07，图 662b8bb0）
  // ---------------------------------------------------------------------
  // 点顶栏 🔍 → 同一行右侧原地展开 [🔍 输入框] n/N [▲][▼][✕]。当前词以
  // `highlightQuery` 透传给每条气泡，气泡把命中包成 `<mark data-leo-search-hit>`
  // （渲染在 AgentTranscriptBubble / Markdown 里）；这里只负责计数与导航：在消息滚动
  // 容器上 querySelectorAll，给当前项置 data-active 并滚到视口中央。
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchHitCount, setSearchHitCount] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // 上一次真的滚过去的是哪一条（query + index），流式期间气泡反复重渲不该再拽视口。
  const searchScrolledRef = useRef("");
  const highlightQuery = searchOpen ? searchQuery.trim() : "";

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchIndex(0);
    setSearchHitCount(0);
    searchScrolledRef.current = "";
  }, []);
  const stepSearch = useCallback((delta: 1 | -1) => {
    setSearchIndex((current) => {
      if (searchHitCount <= 0) return 0;
      return (current + delta + searchHitCount) % searchHitCount;
    });
  }, [searchHitCount]);

  useEffect(() => {
    if (!searchOpen) return;
    const container = scrollRef.current;
    if (!container) return;
    const hits = highlightQuery
      ? container.querySelectorAll<HTMLElement>("[data-leo-search-hit]")
      : ([] as HTMLElement[]);
    const total = hits.length;
    if (total !== searchHitCount) setSearchHitCount(total);
    const active = total > 0 ? Math.min(searchIndex, total - 1) : 0;
    if (active !== searchIndex) setSearchIndex(active);
    hits.forEach((hit, i) => {
      if (i === active) hit.setAttribute("data-active", "true");
      else hit.removeAttribute("data-active");
    });
    if (total === 0) {
      searchScrolledRef.current = "";
      return;
    }
    const key = `${highlightQuery}\u0000${active}`;
    if (searchScrolledRef.current === key) return;
    searchScrolledRef.current = key;
    const target = hits[active];
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    }
    // `messages` / `streamText` 在依赖里：气泡重渲后命中集合会变，要重数。
  }, [searchOpen, highlightQuery, searchIndex, searchHitCount, messages, streamText]);

  /** 「重做」：把上一句用户的话原样再问一遍，让 agent 重新作答。 */
  const regenerateFrom = useCallback(
    (messageId: number) => {
      if (readOnly || busy || status === "running") return;
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) return;
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const candidate = messages[cursor];
        if (candidate.role === "user" && candidate.content.trim()) {
          void sendSuggestion(candidate.content);
          return;
        }
      }
    },
    [busy, messages, readOnly, sendSuggestion, status],
  );

  const artifactMessages = useMemo(
    () =>
      messages.filter((message) => {
        const artifact = message.meta?.artifact;
        if (!artifact || hiddenArtifactMessageIds.has(message.id)) return false;
        return (
          !artifact.id ||
          activeArtifactIds === null ||
          activeArtifactIds.has(artifact.id)
        );
      }),
    [activeArtifactIds, hiddenArtifactMessageIds, messages],
  );
  const visibleArtifactMessageIds = useMemo(
    () => new Set(artifactMessages.map((message) => message.id)),
    [artifactMessages],
  );
  const latestArtifactMessage =
    artifactMessages[artifactMessages.length - 1] || null;
  const running = status === "running" || busy;
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
  useEffect(() => {
    if (
      !latestActionMessage ||
      latestActionMessage.id === seenActionRef.current ||
      !taskId ||
      messagesTaskId !== taskId
    )
      return;
    seenActionRef.current = latestActionMessage.id;
    if (!isLiveAction(actionHistoryRef.current, taskId, latestActionMessage)) return;
    const action = normalizeWorkspaceAction(
      latestActionMessage.meta?.workspace_action ||
        latestActionMessage.meta?.ui_action,
    );
    if (!action) return;
    // 「找真人」的 action 不是槽位：不动受控值，把右侧栏打开，由右侧栏自己进到 LeoBay 那一块。
    if (action.tab === "bay") setRightOpen(true);
    else setLibTab(action.tab);
    setWorkspaceAction({
      nonce: `message:${latestActionMessage.id}`,
      action,
    });
  }, [latestActionMessage, messagesTaskId, taskId]);

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

  // 右版面显隐开关（受控）。显式 false 关按钮。否则默认启用。右栏一律叫「预览」，
  // 不再出现「库」字样（操作员 2026-09-07）。开关键样式与顶栏其余图标键同一套。
  const effectiveLibrary: SplitLibraryConfig | undefined =
    library === false
      ? undefined
      : {
          label: tt("预览"),
          open: rightOpen,
          onOpenChange: setRightOpen,
          paneTitle: tt("预览"),
          buttonClassName: HEADER_ICON_BUTTON_CLASS,
          ...(library || {}),
          ...(workspaceOpen !== undefined ? {
            open: workspaceOpen,
            onOpenChange: onWorkspaceOpenChange || setRightOpen,
          } : {}),
        };

  // 「所属 app」展示名：prop > appNames[site] > site_id 本身。空则不显示标签。
  const resolvedApp =
    appLabelProp || (taskSiteId ? appNames?.[taskSiteId] || "" : "");

  // 本次对话「总结」= 后端自动生成的 task.title（agent_engine._finalize_extras：首轮
  // 收尾时 AI 概括≤14 字会话标题，存 agent_tasks.title；getTask 已带回）。全 OceanLeo
  // 系列 agent 都走同一后端，故任何站的对话都有这个总结——它就是这一行顶栏的标题。
  const convoSummary = (taskTitle || "").trim();

  // ---------------------------------------------------------------------
  // 单行顶栏（操作员 2026-09-07：图 466f833a 布局 + 3f9d0f8c 图标 + 662b8bb0 搜索态）
  // ---------------------------------------------------------------------
  // 对话区**只有这一行**——它就是 SplitWorkspace 左栏的 PaneHeader：
  //   [‹ 仅 onBack] [对话总结 | 正在总结… | 新任务] [所属 app] [新建] …… [headerExtra] [🔍] [↪] [▯]
  // 最右的 [▯] 右栏开关由 SplitWorkspace 接在本节点之后渲染。原来 onBack 时多出来的那条
  // 原先独立的「‹ 返回 + 总结 + 分享」那一行与正文区浮着的分享键都已并入此处，不再有两行。
  const backTitle = backLabel ?? tt("返回");
  const summaryNode = convoSummary ? (
    <span
      className="min-w-0 flex-1 truncate text-[13px] font-medium text-stone-700"
      title={convoSummary}
    >
      {convoSummary}
    </span>
  ) : (
    <span className="min-w-0 flex-1 truncate text-[13px] text-stone-400">
      {messages.length > 0 ? tt("正在总结本次对话…") : tt("新任务")}
    </span>
  );
  const searchControl = searchOpen ? (
    <div
      data-agent-chat-search
      role="search"
      className="flex shrink-0 items-center gap-0.5"
    >
      <span className="relative inline-flex items-center">
        <IconSearch className="pointer-events-none absolute left-1.5 h-3.5 w-3.5 text-stone-400" />
        <input
          ref={searchInputRef}
          autoFocus
          type="text"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setSearchIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeSearch();
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              stepSearch(event.shiftKey ? -1 : 1);
            }
          }}
          placeholder={tt("搜索对话")}
          aria-label={tt("搜索对话")}
          className="w-32 min-w-0 rounded-lg border border-stone-200 bg-white py-1 pl-6 pr-1.5 text-[12px] text-stone-700 outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] placeholder:text-stone-400 focus:border-stone-400 focus-visible:ring-2 focus-visible:ring-stone-300/70"
        />
      </span>
      <span
        data-agent-chat-search-count
        className="shrink-0 px-0.5 text-[11px] tabular-nums text-stone-500"
      >
        {searchHitCount > 0 ? `${searchIndex + 1}/${searchHitCount}` : "0/0"}
      </span>
      <button
        type="button"
        onClick={() => stepSearch(-1)}
        disabled={searchHitCount === 0}
        title={tt("上一项")}
        aria-label={tt("上一项")}
        className={HEADER_ICON_BUTTON_CLASS}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => stepSearch(1)}
        disabled={searchHitCount === 0}
        title={tt("下一项")}
        aria-label={tt("下一项")}
        className={HEADER_ICON_BUTTON_CLASS}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={closeSearch}
        title={tt("关闭")}
        aria-label={tt("关闭")}
        className={HEADER_ICON_BUTTON_CLASS}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      title={tt("搜索")}
      aria-label={tt("搜索")}
      className={HEADER_ICON_BUTTON_CLASS}
    >
      <IconSearch className="h-4 w-4" />
    </button>
  );
  const headerNode = (
    <div
      data-agent-chat-header
      className="flex w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden"
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          title={backTitle}
          aria-label={backTitle}
          className={HEADER_ICON_BUTTON_CLASS}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {summaryNode}
      {resolvedApp && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
          {tt("所属 app · {app}", { app: resolvedApp })}
        </span>
      )}
      {workspace && workspace.mode !== "history" && (
        <RestartDraftButton
          label={tt("新建")}
          className="inline-flex shrink-0 items-center rounded-lg border border-stone-200 px-2.5 py-1 text-[12px] font-medium text-stone-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:border-stone-300 hover:bg-stone-50 active:scale-95 disabled:opacity-50"
        />
      )}
      <CollabTaskPresence taskId={taskId} />
      {headerExtra}
      {searchControl}
      {/* 「分享」：点它整页进入选段模式（对标 Kimi）。只在这里出现一次。 */}
      {/* Stays in place while selecting (pressed; a second click leaves). It used to be
          unmounted on click, so the header looked like it lost the button. Entering
          from here selects every message: 「复制链接」 works straight away. */}
      {(share.active || shareAvailable) && (
        <ShareEntryButton
          active={share.active}
          onClick={() => (share.active ? share.exit() : share.enter("all"))}
        />
      )}
    </div>
  );

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

  // W7 + W6: every file on the task page (composer tile, sent attachment, a computer
  // task's inbox file; cloud AND native pane) opens in this task's own right sidebar,
  // the same one the home page uses: never a new tab, never the strip's old panel.
  // A Library editor thread (workspaceContent) gives way to the file until the pane closes.
  const openWorkspaceItem = taskWorkspace.openWorkspaceItem;
  const [fileOverWorkspace, setFileOverWorkspace] = useState(false);
  const hasWorkspaceContent = Boolean(workspaceContent);
  const openTaskAttachment = useTaskAttachmentOpener(
    siteId || "oceanleo",
    useCallback((target: TaskAttachmentTarget) => {
      setSettingsOpen(false);
      if (hasWorkspaceContent) setFileOverWorkspace(true);
      onWorkspaceOpenChange?.(true);
      openWorkspaceItem(target.item, target.mode);
    }, [hasWorkspaceContent, onWorkspaceOpenChange, openWorkspaceItem]),
  );
  const workspacePaneOpen = workspaceOpen ?? rightOpen;
  useEffect(() => {
    if (!workspacePaneOpen) setFileOverWorkspace(false);
  }, [workspacePaneOpen]);

  const removePreviewArtifact = useCallback(
    async (message: AgentMessage) => {
      const artifactId = message.meta?.artifact?.id;
      if (artifactId) {
        const result = await deleteArtifact(artifactId);
        if (!result.ok) {
          throw new Error(result.error || tt("删除失败，请重试。"));
        }
        setActiveArtifactIds((current) => {
          if (current === null) return new Set<string>();
          const next = new Set(current);
          next.delete(artifactId);
          return next;
        });
      }
      setHiddenArtifactMessageIds((current) => {
        const next = new Set(current);
        next.add(message.id);
        return next;
      });
    },
    [tt],
  );

  // 用户往上翻看历史时的浮标：不把他拽回底部，只说明下面还有多少条没看。
  // 动效走既有的 `.v-fade-up`（token 化，且 reduced-motion 下自动 animation:none），
  // 不新写一条曲线。
  const backToLatest =
    !following && messages.length > 0 ? (
      <button
        type="button"
        onClick={resumeFollowing}
        className="v-fade-up absolute bottom-3 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-stone-200 bg-white/95 px-3 py-1.5 text-[12px] font-medium text-stone-600 shadow-lg backdrop-blur hover:bg-white"
      >
        <svg
          className="h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 5v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread > 0
          ? tt("回到最新 · {count} 条新消息", { count: unread })
          : tt("回到最新")}
      </button>
    ) : null;

  // 复制 / 重做 / 分享：一轮只在最后一段话底下出现一次（操作员 2026-10-31），跑着的这一轮不出现。
  const turnActions = agentTurnActionTargets(renderItems, running || presentation.working);
  // W4 2026-10-31: the small time above user bubbles (first one, then after a 5-minute gap).
  const timeSeparators = agentMessageTimeSeparators(messages);

  /** 把上面那条裁决接到实际渲染的那条消息上。 */
  const messageForBubble = (item: {
    index: number;
    message: AgentMessage;
  }): AgentMessage => {
    const content = streamedBubbleContent({
      content: item.message.content,
      streamText,
      isLastAssistant: item.index === lastAssistantIdx,
    });
    return content === item.message.content
      ? item.message
      : { ...item.message, content };
  };

  // What the composer (and the bar under CLI/terminal) needs to show and switch conversations.
  const conversationProps = {
    conversation,
    onConversationChange,
    taskSessions: sessions,
    onOpenSettings: toggleSettings,
    settingsOpen,
    oceanleoDisabledReason,
  };

  // The ONE stream. The OceanLeo conversation and a native computer conversation
  // render through the same JSX (same bubbles, progress card, composer frame);
  // only the source of messages, running state and handlers differs.
  const renderStream = (pane: StreamPane) => (
    <div className="flex h-full flex-col" data-agent-stream={pane.pane}>
      {pane.top}
      {/* 相对定位容器：浮标贴着对话区底部，而不是贴着输入框或整页。 */}
      <div className="relative min-h-0 flex-1">
      <div
        ref={pane.scrollRef}
        onScroll={pane.onScroll}
        className="h-full overflow-y-auto overflow-x-hidden px-4 py-4"
        data-agent-stream-scroller=""
        // Native: earlier batches are prepended and the position is restored by hand
        // (NativeChatConversation); browser scroll anchoring would shift it a second time.
        style={pane.pane === "native" ? { overflowAnchor: "none" } : undefined}
      >
        {/* 对话内容与下方输入框同宽、居中（宽度上限 = agent-conversation-layout 的
            AGENT_CONVERSATION_MAX_WIDTH_CLASS，比 Manus 比例略宽，W4 2026-10-31）。
            Never a horizontal scrollbar: long paths / URLs / commands wrap here. */}
        <div className={`mx-auto w-full min-w-0 ${AGENT_CONVERSATION_MAX_WIDTH_CLASS} space-y-3 break-words [overflow-wrap:anywhere]`} data-agent-stream-column="">
          {pane.empty}
          {pane.items}
          {pane.tail}
        </div>
      </div>
        {pane.overlay}
      </div>
      <div className="shrink-0 border-t border-stone-100 px-3 py-3">
        {/* 输入框收窄居中（操作员 2026-07-01）：不再铺满整栏，限宽 + 居中，
            与主站首页 max-w-3xl 输入框的占比观感一致，左右不再过宽。
            选段模式下**这一整块**换成操作条，退出即恢复。宽度与正文列同一常量。 */}
        <div className={`mx-auto w-full ${AGENT_CONVERSATION_MAX_WIDTH_CLASS} space-y-2`}>
          {pane.footer}
        </div>
      </div>
      {pane.after}
    </div>
  );

  const stream = renderStream({
    pane: "cloud",
    scrollRef,
    onScroll: handleStreamScroll,
    top: isLocalExecution && <LocalAgentTaskStatus key={taskId} run={localRun} artifacts={localArtifacts.taskId === taskId ? localArtifacts.items : []} busy={localControlBusy} readOnly={Boolean(readOnly)} onControl={controlLocal} />,
    // A computer task whose conversation is not decided yet shows nothing rather than a cloud empty page.
    empty: messages.length === 0 && !running && conversationResolved ? (
      <div className="py-10 text-center text-[15px] text-stone-400">
        {emptyHint ?? tt("在下方输入，开始与 agent 对话。")}
      </div>
    ) : null,
    items: (
      <>
          {renderItems.map((item) =>
            item.type === "progress" ? (
              <AgentProgress
                key={item.key}
                messages={item.messages}
                running={presentation.working && item.key === liveProgressKey}
                accent={accent}
              />
            ) : (
              <AgentTranscriptBubble
                key={item.key}
                message={messageForBubble(item)}
                timeAbove={timeSeparators.get(item.index)}
                streaming={presentation.working && item.index === lastAssistantIdx &&
                  item.index > lastUserIdx && item.message.meta?.done !== true &&
                  item.message.meta?.final !== true && item.message.meta?.stopped !== true}
                stopped={
                  item.message.meta?.stopped === true ||
                  ((Boolean(stoppedTaskId) && stoppedTaskId === (taskId || "")) &&
                    item.index === lastAssistantIdx)
                }
                onArtifactOpen={
                  item.message.meta?.artifact &&
                  visibleArtifactMessageIds.has(item.message.id)
                    ? () => openArtifactMessage(item.message)
                    : undefined
                }
                onOpenAttachment={openTaskAttachment}
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
                taskRunning={running}
                onContinue={
                  readOnly
                    ? undefined
                    : () => {
                        void sendSuggestion(tt("已确认，请继续刚才的操作"));
                      }
                }
                selectMode={share.active}
                selected={share.selectedIds.has(item.message.id)}
                onSelectToggle={() => share.toggle(item.message.id)}
                onRegenerate={
                  !readOnly && item.message.role === "assistant"
                    ? () => regenerateFrom(item.message.id)
                    : undefined
                }
                onShare={() => share.enter(item.message.id)}
                turnCopyText={turnActions.get(item.key) ?? null}
                highlightQuery={highlightQuery || undefined}
              />
            ),
          )}
          {presentation.thinking && (
            <div className="flex items-center gap-2 text-[14px] text-stone-400">
              <span className="v-spinner" /> {thinkingText}
            </div>
          )}
      </>
    ),
    tail: (
      <>
          {/* 编辑器指令的执行结果（人话，含失败原因）。 */}
          <EditorCommandNotes notes={editorCommands.notes} />
          {/* 卡住了叫真人：求助状态就地长在对话流里，人接住了这里会出现系统气泡。 */}
          <HumanHandoffStatus originRef={taskId || ""} accent={accent} />
          {/* 流式回落的告知。正文仍会到齐（轮询始终是真源），所以这是一句说明、
              不是报错——用 stone 而不是 rose，免得用户以为要重发一遍。 */}
          {streamNotice && (
            <p className="break-words text-[13px] text-stone-400 [overflow-wrap:anywhere]">{streamNotice}</p>
          )}
          {/* A local-task code set on any other path is still shown in words. */}
          {error && <p className="break-words text-[14px] text-rose-500 [overflow-wrap:anywhere]" data-agent-chat-error>{tt(localAgentRefusalText(error) ?? error)}</p>}
          {/* A failed computer pick / unreadable session list shows here too (the pick did not switch). */}
          {conversationNotice}
      </>
    ),
    overlay: backToLatest,
    footer: share.active ? (
            <ShareActionBar share={share} />
          ) : (
            <>
          {composerHeader}
          <QuickActionChips onFire={(prompt) => void fireAgentText(prompt)} />
          <AgentReviewPanel
            session={hostReviewSession}
            busy={review.busy}
            onAccept={() => void review.accept()}
            onReject={review.reject}
            onRollback={() => void review.rollback()}
          />
          {/* 旧确认卡仍要挂上才能点「就这么改」把 mutates 送进闸；对用户隐藏。 */}
          <div ref={confirmHostRef} data-agent-review-host className="sr-only">
            {editorCommands.card}
          </div>
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
            boundExecutionTarget={taskId ? resolvedBoundTarget : undefined}
            value={input}
            onChange={setInput}
            onSubmit={(_, payer, context) => void send(payer?.org_id, context?.executionTarget)}
            loading={running}
            onStop={() => void stop()}
            onOpenAttachment={openTaskAttachment}
            // A computer task has no OceanLeo conversation to send into (its Device row says why).
            disabled={readOnly || computerTask}
            leoSuggest
            leoContext={{ page: "task", taskId: taskId || undefined }}
            inlineSlot={inlineSlot}
            placeholder={
              placeholder ??
              (toolsOn
                ? tt("继续追问，或上传文件让 agent 分析…")
                : // 关闭态复用既有的已翻译词条，不新增 key（17 语都已有译文）。
                  tt("继续追问"))
            }
            rows={1}
            onAttachFiles={toolsOn ? atts.handleAttachFiles : undefined}
            attachments={toolsOn ? atts.composerAttachments : undefined}
            onRemoveAttachment={toolsOn ? atts.removeAttachment : undefined}
            onRetryAttachment={toolsOn ? atts.retryAttachment : undefined}
            // Refresh keeps the follow-up text and its Library files; 「从资料库添加文件」.
            draftKey={taskId ? `task:${taskId}` : undefined}
            onAddAttachments={toolsOn ? atts.addComposerAttachments : undefined}
            onVoiceTranscript={handleVoiceTranscript}
            attachMenuExtra={getHelpMenu}
            {...conversationProps}
          />
            </>
          ),
    after: (
      <>
      {share.preview && (
        <ShareCardPreview
          images={share.preview}
          fileBaseName="oceanleo-share"
          onClose={share.closePreview}
        />
      )}
      </>
    ),
  });

  // Settings of the native/terminal conversation open in the existing right pane;
  // the previous right content stays mounted (hidden) and comes back on close.
  const settingsShown = Boolean(settingsOpen && conversation && conversation.kind !== "oceanleo");
  const settingsTitle = settingsShown && conversation ? nativeSettingsTitle(conversation, tt) : "";
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // A native conversation through the SAME stream: no branch, regenerate, share,
  // suggestions or quick-action chips; gates answer the computer's program.
  // Each opened native chat is its own <NativeChatConversation> (one hook per
  // session, kept mounted and connected while hidden); this function is its stream.
  const renderNativePane = (pane: NativeChatPane): ReactNode => {
    const { thread, session, input, setInput, scrollRef, onScroll, connecting } = pane;
    const nativeMessages = thread.messages;
    const nativeRenderItems = buildAgentRenderItems(nativeMessages);
    const nativeProgressKey = activeAgentProgressKey(nativeRenderItems, nativeMessages);
    const nativeLiveProgressKey = liveAgentProgressKey(nativeRenderItems, nativeMessages);
    const nativePresentation = threadPresentation(nativeMessages, thread.running ? "running" : "", {
      activeProgress: Boolean(nativeProgressKey),
    });
    const nativeLastUserIdx = nativeMessages.findLastIndex((message) => message.role === "user");
    const nativeLastAssistantIdx = nativeMessages.findLastIndex((message) =>
      message.role === "assistant" && (message.kind === "text" || !message.kind) && message.meta?.interim !== true);
    // One copy row per turn, under its last words; none while the turn is still running.
    const nativeTurnActions = agentTurnActionTargets(nativeRenderItems, nativePresentation.working || thread.running);
    const nativeTimeSeparators = agentMessageTimeSeparators(nativeMessages);
    // Install / sign-in live in the settings pane: a send blocked for that reason opens it.
    const blockedBySetup = Boolean(!connecting && thread.blockedReason && !thread.offline);
    // A prompt typed while the session is still opening waits in the queue: its bubble
    // is the whole signal (no 「正在打开对话…」 line, 2026-10-31 D); a real reason
    // (offline, not installed / signed in) or a still-unknown computer is said.
    const blockedLine = connecting ? tt("正在连接…") : thread.blockedReason;
    // The homepage created this chat's session itself (nativeLaunch): no second create here.
    const hostLaunch = !session && Boolean(nativeLaunch) && Boolean(pick) && pickChatKey(pick!) === launchKey;
    const notOpened = () => tt("没能打开这段对话，请稍后再试。");
    const retryPending = () => {
      const text = thread.pending?.text ?? "";
      thread.retry();
      if (session) { if (blockedBySetup) setSettingsOpen(true); return; }
      if (hostLaunch) nativeLaunch?.retry?.();
      else if (!conversationBusy) void startNative(text).then((ok) => { if (!ok) thread.markUnsent(notOpened()); });
    };
    const submit = async (value?: string) => {
      const text = (value ?? input).trim();
      if (readOnly) return;
      // A first prompt on its way is already the user's bubble; one at a time.
      if (thread.pending && !thread.pending.unsent) return;
      // No session yet, or replacing an unsent first prompt: the bubble shows now and
      // goes out by itself once the session and link are bound (never handed back).
      if (!session || thread.pending) {
        if (!thread.queue(text)) return;
        setInput("");
        if (session) { if (blockedBySetup) setSettingsOpen(true); return; }
        if (hostLaunch) { nativeLaunch?.retry?.(); return; }
        if (!(await startNative(text))) thread.markUnsent(notOpened());
        return;
      }
      if (!thread.ready) {
        if (blockedBySetup) { setSettingsOpen(true); return; }
        // Still opening (link / occupancy not read yet): never drop Enter. The prompt is
        // the user's bubble now and goes out by itself once ready (unsent after 45 s).
        if (thread.running || thread.offline) return;
        if (thread.queue(text)) setInput("");
        return;
      }
      // Attachment-only sends are allowed; the input clears only when the prompt really went out.
      if (await thread.send(text)) setInput("");
    };
    return renderStream({
      pane: "native",
      scrollRef,
      onScroll,
      // No "load earlier" button: scrolling near the top reads one more batch by itself
      // (NativeChatConversation.onScroll); only a small spinner while it is on its way.
      top: thread.olderLoading ? (
        <div className="flex shrink-0 justify-center px-4 pt-2" role="status" aria-label={tt("正在读取…")} data-native-older-loading="">
          <span className="v-spinner" />
        </div>
      ) : null,
      // An existing conversation shows its cloud-saved copy at once; only while that
      // copy is still on its way is there the page-level skeleton (never 「正在打开对话…」).
      empty: nativeMessages.length === 0 && !thread.running ? (
        session && (connecting || thread.opening) ? (
          // The same page-level skeleton as the task switch (W5): one loading look, no spinner.
          <div data-native-opening="">
            <RoutePageSkeleton variant="list" label={tt("正在读取…")} />
          </div>
        ) : (
          <div className="py-10 text-center text-[15px] text-stone-400">{tt("在下方输入，开始与 agent 对话。")}</div>
        )
      ) : null,
      items: (
        <>
          {nativeRenderItems.map((item) =>
            item.type === "progress" ? (
              <AgentProgress
                key={item.key}
                messages={item.messages}
                running={nativePresentation.working && item.key === nativeLiveProgressKey}
                accent={accent}
              />
            ) : (
              <AgentTranscriptBubble
                key={item.key}
                message={item.message}
                timeAbove={nativeTimeSeparators.get(item.index)}
                streaming={nativePresentation.working && item.index === nativeLastAssistantIdx &&
                  item.index > nativeLastUserIdx && item.message.meta?.done !== true &&
                  item.message.meta?.final !== true && item.message.meta?.stopped !== true}
                stopped={item.message.meta?.stopped === true}
                turnCopyText={nativeTurnActions.get(item.key) ?? null}
                taskRunning={thread.running}
                // Saved transcript (offline): gates are read-only.
                onNativeAnswer={!readOnly && thread.live ? thread.answer : undefined}
                onOpenAttachment={openTaskAttachment}
              />
            ),
          )}
          {/* Only until the turn's first entry: after that the process block / streaming text is the live signal. */}
          {nativePresentation.thinking &&
            !nativeMessages.slice(nativeLastUserIdx + 1).some((message) => message.role === "assistant") && (
            <div className="flex items-center gap-2 text-[14px] text-stone-400">
              <span className="v-spinner" /> {tt("agent 正在思考…")}
            </div>
          )}
        </>
      ),
      tail: (
        <>
          {/* A first prompt that could not go out: said plainly under its bubble, with a retry (never handed back silently). */}
          {thread.pending?.unsent && (
            <div className="flex flex-wrap items-center justify-end gap-2 text-[12px] text-stone-500" data-native-unsent>
              <span>{tt("未发送：{reason}", { reason: thread.pending.unsent })}</span>
              <button type="button" onClick={retryPending}
                className="rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] font-medium text-stone-600 hover:bg-stone-50">
                {tt("重试")}
              </button>
            </div>
          )}
          {conversationNotice}
        </>
      ),
      overlay: null,
      footer: (
        <>
          {session && blockedLine && (
            <p className="px-1 text-[12px] text-stone-500" data-native-blocked>{blockedLine}</p>
          )}
          {thread.saveFailed && (
            <p className="px-1 text-[12px] text-stone-400" data-native-save-failed>{tt("这段对话暂时没能保存到云端")}</p>
          )}
          <LeoComposer
            boundExecutionTarget={taskId ? resolvedBoundTarget : undefined}
            value={input}
            onChange={setInput}
            onSubmit={(clean) => void submit(clean)}
            loading={thread.running || (!session && conversationBusy)}
            onStop={() => thread.stop()}
            // Offline: read-only. Connecting, still opening, or setup-blocked stays usable
            // (Send queues, or opens settings). Typing is never blocked by an unknown state.
            disabled={readOnly || Boolean(session && !connecting && thread.offline)}
            placeholder={placeholder ?? (toolsOn ? tt("继续追问，或上传文件让 agent 分析…") : tt("继续追问"))}
            rows={1}
            onAttachFiles={toolsOn ? thread.onAttachFiles : undefined}
            attachments={toolsOn ? thread.composerAttachments : undefined}
            onRemoveAttachment={toolsOn ? thread.onRemoveAttachment : undefined}
            // W6: a tile opens in this task's right sidebar (never AttachmentStrip's old PreviewPanel).
            onOpenAttachment={openTaskAttachment}
            draftKey={taskId ? `task:${taskId}` : undefined}
            // A computer's inbox takes bytes: a Library pick is read once and attached as a file.
            onAddAttachments={toolsOn && thread.onAttachFiles ? (items) => {
              const attach = thread.onAttachFiles;
              void Promise.all(items.map((item) => libraryAttachmentFile(item))).then((files) => {
                const ok = files.filter((file): file is File => Boolean(file));
                if (ok.length && attach) attach(ok);
              });
            } : undefined}
            onVoiceTranscript={(text: string) => setInput((current) => (current ? current + " " : "") + text)}
            // Controls that do nothing for a native send are not shown.
            showPlugins={false}
            showPayerSelector={false}
            showAppsBar={false}
            modelPickerSlot={thread.modelPicker}
            {...conversationProps}
          />
        </>
      ),
      after: null,
    });
  };
  const chatSessions = openedChats
    .map((id) => sessions.find((session) => session.id === id))
    .filter((session): session is ComputerTaskSession => Boolean(session));
  if (activeSession?.kind === "acp" && !chatSessions.some((session) => session.id === activeSession.id)) chatSessions.push(activeSession);
  const settingsForChat = (active: boolean) => settingsShown && nativeChat && active ? settingsHost : null;
  // One keyed list: a picked chat and the session its first send creates share a key,
  // so the same thread instance carries over (draft model choice included).
  const chatEntries: {key: string; session: ComputerTaskSession | null; conversation: Extract<ConversationTarget, {kind: "native"}>; active: boolean}[] = [
    ...chatSessions.map((session) => ({
      key: chatKeysRef.current.get(session.id) ?? session.id,
      session,
      conversation: sessionConversation(session) as Extract<ConversationTarget, {kind: "native"}>,
      active: activeSession?.id === session.id,
    })),
    ...(pick ? [{key: pickChatKey(pick), session: null, conversation: pick, active: true}] : []),
  ];
  const nativeStream = chatEntries.length ? (
    <>
      {chatEntries.map((entry) => (
        <div key={entry.key} className={entry.active ? "relative min-h-0 flex-1" : "hidden"} hidden={!entry.active}
          data-native-chat={entry.session?.id ?? "pick"}>
          <NativeChatConversation
            session={entry.session}
            computer={computerFor(entry.conversation.computerId)}
            // The homepage's prewarmed thread drives its launched chat (one connection).
            external={nativeLaunch && entry.key === launchKey ? nativeLaunch.thread : undefined}
            active={entry.active}
            onNativeSessionChange={patchSession}
            onSetupBlocked={openSettings}
            settingsTarget={settingsForChat(entry.active)}
            conversation={entry.conversation}
            render={renderNativePane}
          />
        </div>
      ))}
    </>
  ) : null;

  // CLI / terminal: the host-styled surface fills the pane, the same dock sits below it.
  // The active surface is mounted in the same render it is chosen (same key afterwards: no remount).
  const surfaceIds = activeSession && activeSession.kind !== "acp" && !openedSurfaces.includes(activeSession.id)
    ? [...openedSurfaces, activeSession.id] : openedSurfaces;
  const surfaceSessions = surfaceIds
    .map((id) => sessions.find((session) => session.id === id))
    .filter((session): session is ComputerTaskSession => Boolean(session));
  const cloudShown = !conversation || conversation.kind === "oceanleo";
  const leftPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cloudShown ? "relative min-h-0 flex-1" : "hidden"} hidden={!cloudShown}>{stream}</div>
      {nativeStream && (
        <div className={nativeChat ? "flex min-h-0 flex-1 flex-col" : "hidden"} hidden={!nativeChat}>{nativeStream}</div>
      )}
      {surfaceSessions.map((session) => {
        const active = surfaceActive && activeSession?.id === session.id;
        return (
          <div key={session.id} className={active ? "relative min-h-0 flex-1" : "hidden"} hidden={!active} data-computer-surface={session.id}>
            <NativeTerminalSurface
              computer={computerFor(session.computer_id)}
              session={session}
              active={active}
              onNativeSessionChange={surfaceBinder(session)}
            />
          </div>
        );
      })}
      {surfaceActive && (
        <div className="shrink-0 border-t border-stone-100">
          <div className={`mx-auto w-full ${AGENT_CONVERSATION_MAX_WIDTH_CLASS}`}>
            {conversationNotice && <div className="space-y-1 px-4 pt-2">{conversationNotice}</div>}
            <ConversationBar
              conversation={conversation!}
              onConversationChange={onConversationChange}
              taskSessions={sessions}
              boundTarget={taskId ? resolvedBoundTarget : undefined}
              onOpenSettings={toggleSettings}
              settingsOpen={settingsOpen}
              oceanleoDisabledReason={oceanleoDisabledReason}
            />
          </div>
        </div>
      )}
    </div>
  );


  // W7: a carried sidebar (the home's open file) survives this component's own
  // draft/first-task resets above: declared after them, so it runs after them,
  // on mount and once more when the new task's id arrives; never again.
  const carriedWorkspaceRef = useRef(initialWorkspace);
  useEffect(() => {
    const carried = carriedWorkspaceRef.current;
    if (!carried) return;
    if (taskId) carriedWorkspaceRef.current = null;
    if (carried.open || carried.item) setRightOpen(true);
    if (carried.tab) setLibTab(carried.tab);
    if (carried.action) setWorkspaceAction(carried.action);
  }, [taskId, setLibTab, setRightOpen, setWorkspaceAction]);

  // Every generated item becomes a Preview card. Existing organization and
  // browser surfaces are also legacy tabs consumed by the fixed five-slot shell.
  const orgTab: CanvasTab | null = renderOrgPanel
    ? {
        id: "org",
        label: tt("组织编排"),
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
      onDelete: () => removePreviewArtifact(message),
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
  // 高度账（2026-09-07 顶栏收成一行之后）：对话区不再有自己的返回行，唯一的一行顶栏
  // 就在 SplitWorkspace 左栏里，所以 SplitWorkspace 永远 fillParent 填满宿主给的高度。
  // SplitWorkspace + ResultCanvas are assembled by the shared TaskWorkspaceShell (W7),
  // the same shell the home page hosts its column in.
  const split = (
    <TaskWorkspaceShell
      state={taskWorkspace}
      tabs={rightTabs}
      canvas={{
        materials: libraryTabs?.materials || [],
        onSeeAllMaterials: libraryTabs?.onSeeAllMaterials,
        accent,
        showTemplate: siteId !== "oceanleo",
        taskId,
        siteId,
      }}
      left={leftPane}
      renderRight={(right) => (
        <WorkspacePaneErrorBoundary
          recoveryKey={`${taskId || ""}:${libTab}:${workspaceAction?.nonce || ""}:${workspaceOpen ?? rightOpen}`}
          title={tt("右侧工作区暂时无法显示，对话仍可继续。")}
          retryLabel={tt("重试")}
          closeLabel={tt("关闭")}
          detailsLabel={tt("技术详情")}
          onClose={() => settingsShown ? closeSettings() : (onWorkspaceOpenChange || setRightOpen)(false)}
        >
          <div className={settingsShown ? "hidden" : "h-full"} hidden={settingsShown}>
            {workspaceContent ? (
              <>
                {/* The editor stays mounted (unsaved work kept) while an opened file is shown. */}
                <div className={fileOverWorkspace ? "hidden" : "h-full"} hidden={fileOverWorkspace} data-task-workspace-content="">{workspaceContent}</div>
                {fileOverWorkspace && right}
              </>
            ) : right}
          </div>
          {settingsShown && conversation && conversation.kind !== "oceanleo" && (
            <div className="h-full overflow-y-auto" data-native-settings-pane>
              {nativeChat
                // The on-screen native chat portals its panel here with its live thread.dialog.
                ? <div ref={setSettingsHost} className="h-full" />
                : <NativeSettingsPanel computer={conversationComputer} conversation={conversation} />}
            </div>
          )}
        </WorkspacePaneErrorBoundary>
      )}
      leftHidden={!workspaceAgentVisible}
      onAgentFocus={() => onWorkspaceAgentFocus?.()}
      onAgentClose={onWorkspaceAgentClose}
      leftLabel={headerNode}
      rightLabel={tt("预览")}
      defaultRatio={0.46}
      storageKey={siteId ? `oceanleo_agent_split:${siteId}` : "oceanleo_agent_split"}
      accent={accent}
      headerHeight={headerHeight}
      // 宿主（如主站 tasks 页）已用 <header>+<main flex-1> 约束高度时 fillParent 填满父容器，
      // 杜绝「相对 100dvh 记账 → 比父容器高一截 → 从历史重开输入框上移、上面内容被挤出」
      // （操作员 2026-07-12）。onBack 场景下方另给一个 100dvh 的外框。
      fillParent
      // AgentChat 的对话流/输入框内部已按 AGENT_CONVERSATION_MAX_WIDTH_CLASS 居中，外层单栏不再二次限宽（否则双重收窄）。
      soloMaxWidth={null}
      library={settingsShown
        ? { ...(effectiveLibrary || {}), label: settingsTitle, open: true, onOpenChange: (open) => { if (!open) closeSettings(); },
            // The settings title wins over any hidden editor's header claim while open.
            paneTitle: <span className="truncate text-[12px] font-medium text-stone-500" data-native-settings-title>{settingsTitle}</span>,
            paneTitleOwned: true }
        : effectiveLibrary ?? null}
    />
  );

  // 未给 onBack（主站 tasks 页 / 子站 history 回看）：宿主已约束高度，直接返回分栏骨架。
  if (!onBack) return split;

  // 给了 onBack（子站首页进入的 agent 界面）：本组件是页面最上面的一块，沿用旧账自己占满
  // 100dvh（原先是 `calc(100dvh - 0px)` 的外框 + 52px 返回行；返回行没了，外框照旧）。
  return (
    <div className="flex min-h-0 flex-col" style={{ height: "100dvh" }}>
      <div className="min-h-0 flex-1">{split}</div>
    </div>
  );
}

/** What one native chat hands the host's stream renderer. */
interface NativeChatPane {
  thread: NativeThread;
  /** null: a picked conversation whose session is created by the first send. */
  session: ComputerTaskSession | null;
  input: string;
  setInput: (next: string | ((current: string) => string)) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  /** The computer's state is not known yet: "正在连接…", never "offline". */
  connecting: boolean;
}

/**
 * One native chat conversation: its own thread (a hook, so one component per
 * session), kept mounted AND connected while hidden so permission prompts and
 * progress keep arriving; switching never kills a run. A first prompt handed
 * over by link is queued in its thread (the user's bubble at once, sent once
 * connected, or marked unsent with a reason and a retry — never handed back
 * silently). It keeps its own draft text and scroll position, and portals its
 * settings panel (with the live `thread.dialog`) into the right pane. With
 * `external` (the homepage's prewarmed thread) it renders that thread and
 * opens no connection of its own.
 */
function NativeChatConversation({ session, computer, external, active, onNativeSessionChange, onSetupBlocked, settingsTarget, conversation, render }: {
  session: ComputerTaskSession | null;
  computer: Computer | null;
  external?: NativeThread;
  active: boolean;
  onNativeSessionChange: (sessionId: string, nativeId: string) => void;
  onSetupBlocked: () => void;
  settingsTarget: HTMLElement | null;
  conversation: Extract<ConversationTarget, { kind: "native" }>;
  render: (pane: NativeChatPane) => ReactNode;
}) {
  const sessionId = session?.id ?? "";
  const onNative = useCallback((nativeId: string) => {
    if (sessionId) onNativeSessionChange(sessionId, nativeId);
  }, [sessionId, onNativeSessionChange]);
  // A picked (session-less) chat still connects for program status and models;
  // it never opens or creates a session. A host-owned thread replaces this one
  // (which then stays disconnected).
  const own = useNativeThread({
    computer, session, program: conversation.program,
    enabled: !external,
    onNativeSessionChange: onNative,
  });
  const thread = external ?? own;
  // The host-owned thread reports its native id to its host; this page's row learns it here.
  const externalNative = external?.dialog.activeSession ?? "";
  useEffect(() => {
    if (externalNative) onNative(externalNative);
  }, [externalNative, onNative]);
  const connecting = !computer && !external?.live;
  const [input, setInput] = useState("");
  // A send the computer refused hands its text back (thread.restoredDraft): it goes
  // back into the composer when that is empty. Only restores after this mount count.
  const restored = thread.restoredDraft ?? null;
  const restoredSeqRef = useRef(restored?.seq ?? 0);
  useEffect(() => {
    if (!restored || restored.seq === restoredSeqRef.current) return;
    restoredSeqRef.current = restored.seq;
    const text = restored.text;
    if (text) setInput((current) => (current.trim() ? current : text));
  }, [restored]);
  const onSetupBlockedRef = useRef(onSetupBlocked);
  onSetupBlockedRef.current = onSetupBlocked;
  const setupBlocked = Boolean(!connecting && thread.blockedReason && !thread.offline);
  const queue = thread.queue;
  useEffect(() => {
    if (!active || !sessionId || !hasPendingNativePrompt(sessionId)) return;
    // takePendingNativePrompt removes the entry before returning it: queued once, even under StrictMode.
    const text = takePendingNativePrompt(sessionId);
    if (text) queue(text);
  }, [active, sessionId, queue]);
  // A queued prompt held back by install / sign-in opens the settings pane once.
  const unsent = thread.pending?.unsent ?? null;
  useEffect(() => {
    if (active && unsent && setupBlocked) onSetupBlockedRef.current();
  }, [active, unsent, setupBlocked]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  // Scroll-up history: near the top (or while the stream does not fill the pane)
  // read ONE more batch; the anchor keeps what the user is reading in place once
  // the batch is prepended. No button.
  const olderAnchor = useRef<OlderScrollAnchor | null>(null);
  const lastScrollTop = useRef(0);
  const threadRef = useRef(thread);
  threadRef.current = thread;
  const maybeLoadOlder = useCallback((movingUp: boolean) => {
    const el = scrollRef.current;
    const current = threadRef.current;
    if (!el || !active) return;
    // A read that never started (or never answered) does not block the next try forever.
    if (olderAnchor.current && Date.now() - olderAnchor.current.at > OLDER_ANCHOR_STALE_MS) olderAnchor.current = null;
    if (olderAnchor.current) return;
    if (!shouldLoadOlder(scrollMetricsOf(el), { hasOlder: current.hasOlder, loading: current.olderLoading === true, movingUp })) return;
    olderAnchor.current = {
      scrollHeight: el.scrollHeight,
      firstId: current.messages[0]?.id ?? null, sawLoading: false, at: Date.now(),
    };
    current.loadOlder();
  }, [active]);
  // W5: remembered per session for the life of the page (see task-scroll-memory).
  const scrollKey = sessionId ? `native:${sessionId}` : "";
  const placedRef = useRef(false);
  const justPlacedRef = useRef<unknown>(null);
  const placedHoldRef = useRef<(() => void) | null>(null);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const metrics = scrollMetricsOf(el);
    followRef.current = isNearBottom(metrics);
    if (placedRef.current) rememberConversationScroll(scrollKey, metrics.scrollTop, followRef.current);
    // Only the user's own scroll up reads more; the smooth follow-to-bottom from 0 never does.
    const movingUp = metrics.scrollTop < lastScrollTop.current;
    lastScrollTop.current = metrics.scrollTop;
    maybeLoadOlder(movingUp);
  }, [maybeLoadOlder, scrollKey]);
  const firstMessageId = thread.messages[0]?.id ?? null;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = olderAnchor.current;
    if (!el || !anchor) return;
    if (firstMessageId !== anchor.firstId) {
      // The earlier batch is in: grow scrollTop by exactly what was added above.
      // (From where the user is now: they may have kept scrolling while it loaded.)
      el.scrollTop += el.scrollHeight - anchor.scrollHeight;
      lastScrollTop.current = el.scrollTop;
      olderAnchor.current = null;
      return;
    }
    if (thread.olderLoading) anchor.sawLoading = true;
    // The read ended with nothing new (or never started): free the trigger again.
    else if (anchor.sawLoading || !thread.hasOlder) olderAnchor.current = null;
  }, [firstMessageId, thread.olderLoading, thread.hasOlder]);
  // W5: the first frame each time this chat comes to the front is placed instantly:
  // the remembered spot if the user had scrolled up, otherwise the latest message
  // (never a smooth scroll down from the top). lastScrollTop follows, so the
  // placement itself is never read as "scrolling up" (no older batch from it).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!active) {
      placedRef.current = false;
      return;
    }
    if (!el || placedRef.current || thread.messages.length === 0 || !scrollPaneShown(el)) return;
    placedRef.current = true;
    const placed = placeConversationScroll(el, scrollKey, () => followRef.current);
    followRef.current = placed.follow;
    lastScrollTop.current = el.scrollTop;
    justPlacedRef.current = thread.messages;
    placedHoldRef.current?.();
    placedHoldRef.current = placed.release;
  }, [active, thread.messages, scrollKey]);
  useEffect(() => () => placedHoldRef.current?.(), []);
  // Shown and its saved copy still on its way: the task's loading cover stays on.
  useTaskLoadingReport(
    !(session && thread.messages.length === 0 && !thread.running && (connecting || thread.opening)),
    active,
  );
  useEffect(() => {
    const el = scrollRef.current;
    if (justPlacedRef.current === thread.messages) justPlacedRef.current = null;
    // Nothing placed yet (no messages, or hidden): nothing to follow.
    else if (el && active && placedRef.current && followRef.current) el.scrollTo({top: el.scrollHeight, behavior: scrollBehavior()});
    // A short first batch that does not fill the pane cannot be scrolled up: read the next one.
    maybeLoadOlder(false);
  }, [thread.messages, active, thread.olderLoading, maybeLoadOlder]);
  return (
    <>
      {render({ thread, session, input, setInput, scrollRef, onScroll, connecting })}
      {settingsTarget && createPortal(
        <NativeSettingsPanel computer={computer} conversation={conversation} dialog={thread.dialog} />,
        settingsTarget,
      )}
    </>
  );
}

/** One stream pane: the OceanLeo conversation or a native computer conversation. */
interface StreamPane {
  pane: "cloud" | "native";
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  top: ReactNode;
  empty: ReactNode;
  /** Progress cards, bubbles and the thinking line: AgentProgress / AgentTranscriptBubble for both panes. */
  items: ReactNode;
  tail: ReactNode;
  overlay: ReactNode;
  footer: ReactNode;
  after: ReactNode;
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
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 text-[12px] font-medium text-stone-500 shadow-sm transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-stone-300 hover:bg-stone-50 hover:text-stone-700"
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
