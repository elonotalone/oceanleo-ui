import type { ReactNode } from "react";

import type { EditorMode } from "./hosted-editor";

import type { AdvancedFlushResult } from "./advanced-session-context";
import type {
  AdvancedHistoryActions,
  AdvancedViewportActions,
  AdvancedWorkbenchAction,
} from "./advanced-workbench-chrome";
import type { WorkbenchIconName } from "./AdvancedEditorIcon";
import type { SelectionPanelAction } from "./selection-context";
import type { EditorAdapterId } from "./workbench-routes";
import type { AdvancedEditorPagesAdapter } from "./plugin-chrome/plugin-pages";

export interface AdvancedWorkbenchDrawer {
  id: string;
  label: string;
  icon: WorkbenchIconName;
  content: ReactNode;
  hiddenFromRail?: boolean;
}

export interface AdvancedEditorPersistenceAdapter {
  /** Monotonic editor mutation revision, never a saved URL or timestamp. */
  editRevision: string | number;
  dirty: boolean;
  /**
   * When false, the shell keeps close/beforeunload dirty guards and explicit
   * flush, but does not debounce-autosave. Website visual drafts need an
   * explicit Apply before Save; host autosave must not consume Apply.
   */
  autoSave?: boolean;
  /** Serializes and persists the revision current when this function starts. */
  flush: () => Promise<AdvancedFlushResult> | AdvancedFlushResult;
  recovery?: AdvancedEditorRecoveryAdapter;
}

export interface AdvancedEditorRecoveryAdapter {
  /** Root material + concrete version; stale drafts cannot cross versions. */
  key: string;
  ready: boolean;
  capture: () => unknown | Promise<unknown>;
  restore: (payload: unknown) => boolean | void | Promise<boolean | void>;
}

export interface AdvancedEditorNativeChrome {
  /** The embedded editor owns its formatting/creation toolbar. */
  toolbar?: boolean;
  /** The embedded editor owns content-only viewport controls. */
  viewport?: boolean;
  /** The embedded editor has an additional native close confirmation. */
  closeGuard?: boolean;
}

/**
 * Native 件的专业模式面（W01 判据 3 / R3）。Hosted 件不用这个，改收 `set-mode`
 * （契约 v2，见 `signals/W01-interface.md` §2.1）。
 *
 * 13 件高级编辑器必须交出 `setMode`。`unavailableReason` 只进 title，不再置灰。
 */
export interface AdvancedEditorModeAdapter {
  /** 当前模式。缺省视为 `normal`。 */
  current?: EditorMode;
  /** 宿主切模式时调它；编辑器自己决定露出/收起哪些内核 UI。 */
  setMode?: (mode: EditorMode) => void;
  /** 不支持时写明原因（会显示给用户，写人话）。 */
  unavailableReason?: string;
}

export interface AdvancedEditorToolbox {
  label: string;
  icon: WorkbenchIconName;
  content: ReactNode;
}

export interface AdvancedEditorUploadAdapter {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
}

/**
 * 画布提示（规范 v2 §1）：插件不再在画布顶部自画通栏（「此文档无文本层」之类），
 * 改申报到这里，宿主用 `PluginChromeNotices` 画在画布左下角的小胶囊里，不遮内容。
 */
export interface AdvancedEditorNotice {
  id: string;
  /** 人话中文原文；宿主渲染时过 tt()。 */
  text: string;
  /** 缺省 "info"。 */
  severity?: "info" | "warn";
}

export interface AdvancedContextToolbarHost {
  openDrawer: (
    drawerId: string,
    panelAction?: SelectionPanelAction,
  ) => void;
  closeDrawer: () => void;
}

/**
 * Exhaustive route-to-shell contract. Editors own model semantics; the shell
 * owns product chrome, reachability, geometry and the persistence queue.
 */
export interface AdvancedEditorAdapter {
  id: EditorAdapterId;
  label: string;
  stage: ReactNode;
  available?: boolean;
  status?: string;
  toolbox?: AdvancedEditorToolbox;
  drawers?: readonly AdvancedWorkbenchDrawer[];
  /** Properties/actions for a real selected object; null when nothing is selected. */
  contextToolbar?: ReactNode;
  /** Use when toolbar panel actions must explicitly target the host left pane. */
  renderContextToolbar?: (host: AdvancedContextToolbarHost) => ReactNode;
  /** Default deliverable shown first inside the shared download menu. */
  directDownload?: AdvancedWorkbenchAction;
  /**
   * 规范 v2 §4：宿主按 `group` 分发——`"edit"`（缺省）进编辑栏文档段（只在「编辑」页）；
   * `"save"` 进第一行保存菜单（套用草稿 / 保存 / 放弃草稿 / 重新加载 / 另存副本）；
   * `"download"` 进第一行下载菜单（含「截图存入我的库」这类导出）。
   * 编辑栏里**不允许**出现保存 / 上传 / 下载类动作；`upload` 走素材库抽屉。
   */
  actions?: readonly AdvancedWorkbenchAction[];
  /** 画布左下角小胶囊提示；替代插件自画的顶部通栏。 */
  notices?: readonly AdvancedEditorNotice[];
  history?: AdvancedHistoryActions;
  viewport?: AdvancedViewportActions;
  nativeChrome?: AdvancedEditorNativeChrome;
  /**
   * L3 专业模式。plugin-chrome-unification 之后它不再是第一行的开关，而是
   * 第二行「专业编辑」页；宿主用 `pageToEditorMode()` 把页翻成这里的 setMode。
   */
  mode?: AdvancedEditorModeAdapter;
  /**
   * 第二行页面申报（plugin-chrome-unification）。宿主自己补「编辑」「专业编辑」，
   * 插件只报附加页（Code / Database / …）。见 `plugin-chrome/plugin-pages.ts`。
   */
  pages?: AdvancedEditorPagesAdapter;
  /** Canvas-owned local upload; the host exposes one button and the same drop path. */
  upload?: AdvancedEditorUploadAdapter;
  persistence?: AdvancedEditorPersistenceAdapter;
  closeRequestRevision?: number;
}
