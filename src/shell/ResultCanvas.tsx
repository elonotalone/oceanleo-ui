"use client";

import {
  Component,
  lazy,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import { useRightPaneSlot, useWorkspacePane } from "./SplitWorkspace";
import { useFunctionGuide } from "./guide-context";
import { NavigatorGuide } from "./NavigatorGuide";
import type { MaterialItem } from "./MaterialLibrary";
import { resolveAssetDetail } from "./asset-detail/resolve";
import { AssetDetail } from "./asset-detail/AssetDetail";
import { WorkspacePaneSkeleton } from "./WorkspacePaneSkeleton";
import { BayAssetActions } from "./asset-detail/BayAssetActions";
import type { AssetActionContext } from "./asset-detail/types";
import { useWorkspaceEntryRequest, type TaskWorkspaceOpenEntry } from "./result-canvas-entry-state";
import { BayAssetLibrary } from "./bay/asset/BayAssetLibrary";
import { MyLibrary } from "./MyLibrary";
import { CloudBrowserPanel } from "./CloudBrowserPanel";
import {
  WorkspaceLibrary,
  type WorkspaceLibraryEntry,
  workspaceEntryFromLibraryItem,
} from "./WorkspaceLibrary";
import {
  workspaceSlotForLegacyId,
  workspaceMaterialsActionFromSearch,
  type WorkspaceActionEnvelope,
  type WorkspaceSlotId,
} from "./workspace-actions";
import { useWorkspaceSlotState } from "./result-canvas-slot-state";
import { useWorkspaceViewState } from "./result-canvas-view-state";
import { useBayEnabled } from "./bay/shell/bay-state";
import { useImEnabled } from "../lib/im/client";
import { BayPanel } from "./bay/panel";
import { LeoChatPanel } from "./leochat/LeoChatPanel";
import {
  LEOCHAT_PANEL_REQUEST_EVENT,
  type LeoChatPanelRequestDetail,
} from "./leochat/LeoChatButton";
import { WorkspaceHome, WorkspaceViewHeader } from "./result-canvas-home";
import { getWorkspacePanel } from "./workspace-panels/registry";
import {
  useActiveAppCapability,
  useAppCapabilityControls,
} from "./app-capability-context";
import {
  createPluginStateAccess,
  exportPluginArtifact,
  type PluginHost,
  type PluginModule,
} from "./plugin-module";
import { createPluginAppDataReader } from "./plugin-app-data";
import { useWorkspaceRuntimeHydration } from "./workspace-runtime-hydration";
import { useOptionalWorkspaceSession } from "./workspace-session-context";
import {
  libraryItemIdentityKey,
  type LibraryItem,
} from "./library-data";
import {
  canonicalArtifactContextId,
  type ArtifactContextRef,
} from "./artifact-contract";
import { AdvancedContentWorkbench } from "./AdvancedContentWorkbench";
import { editorCapabilityFor } from "./workbench-routes";
import {
  advancedRootItemId,
  inlineEditorItemsFromSession,
  savedEditorRevisionTransition,
} from "./advanced-session";
import { useWorkbenchMaterialActions } from "./workbench-material-provider";
import { useWorkbenchOpenClaim } from "./workbench-open-store";
import {
  adaptLegacyWorkspaceSurfaceTabs,
  legacyWorkspaceEntry,
  type LegacyWorkspaceSurfaceTab,
} from "./legacy-workspace-surface-adapter";
import {
  buildWorkspaceSurfaceModel,
  workspaceSurfaceCallerId,
  workspaceSurfacePrimaryTab,
  workspaceSurfaceSlotForId,
} from "./workspace-surface-model";
import {
  CanvasEmpty,
  CanvasSubTabs,
  LiveWorkspaceNode,
  StandaloneWorkspaceFrame,
  WORKSPACE_SLOT_LABELS,
  createLiveWorkspaceNodeStore,
  type LiveWorkspaceNodeStore,
} from "./result-canvas-view";

export { CanvasEmpty, CanvasSubTabs } from "./result-canvas-view";

// Keep the cards light: Devices/Settings pull substantial account and browser
// code, so load those panels only after the user opens the page.
const DevicesWorkspacePanel = lazy(() => import("./workspace-panels/DevicesWorkspacePanel").then((module) => ({ default: module.DevicesWorkspacePanel })));
const ProjectsWorkspacePanel = lazy(() => import("./workspace-panels/ProjectsWorkspacePanel").then((module) => ({ default: module.ProjectsWorkspacePanel })));
const SettingsWorkspacePanel = lazy(() => import("./workspace-panels/SettingsWorkspacePanel").then((module) => ({ default: module.SettingsWorkspacePanel })));

export interface CanvasTab extends LegacyWorkspaceSurfaceTab {}

/**
 * A direct-open request (W7 2026-10-31): open this exact item now, without
 * waiting for any library list to load and resolve an `itemId`. Consumed once
 * per `nonce`. `edit` falls back to preview when no typed editor exists.
 */
export interface TaskWorkspaceOpenItem {
  nonce: string;
  item: LibraryItem;
  mode: "preview" | "edit";
  /** Bind the editor's work session to this canvas's task once that task exists. */
  bindTask?: boolean;
}

/** What the canvas has open in the foreground (reported to the host). */
export interface TaskWorkspaceOpenState {
  item: LibraryItem;
  mode: "preview" | "edit";
  entry?: WorkspaceLibraryEntry;
  actionContext?: AssetActionContext;
}

export interface ResultCanvasProps {
  /**
   * Compatibility input. Existing pages can keep declaring their domain tabs;
   * legacy material tabs open the LeoBay material view.
   */
  tabs: CanvasTab[];
  active?: string;
  onChange?: (id: string) => void;
  accent?: string;
  /** @deprecated Kept for source compatibility; fixed slots own their empty copy. */
  hint?: string;
  empty?: ReactNode;
  focusNonce?: number;
  className?: string;
  materials?: MaterialItem[];
  onSeeAllMaterials?: () => void;
  /** Direct, instance-scoped action from this conversation's signed receipt. */
  action?: WorkspaceActionEnvelope | null;
  /** OceanLeo 主站是通用 Agent，不显示模板；专业站默认保留。 */
  showTemplate?: boolean;
  /** Advanced content workbench reuses this exact Agent thread. */
  taskId?: string | null;
  siteId?: string;
  /** TaskWorkspaceShell state keeps a lazy LeoChat request until this canvas mounts. */
  leoChatRequestNonce?: string | null;
  /** Controlled right-pane visibility, used to distinguish open from closed LeoChat toggles. */
  workspaceOpen?: boolean;
  /** Server-issued exact binding context for the Primary material shelf. */
  materialContext?: ArtifactContextRef;
  /**
   * 素材库空态下方的 CTA 插槽。宿主用它把「这个 app 能做什么」指回功能按钮；
   * **可选**，不传时空态仍然是既有的图标 + 两行灰字，一个字都不改。
   */
  materialsEmptyCta?: ReactNode;
  /** Direct-open input (see TaskWorkspaceOpenItem). */
  openItem?: TaskWorkspaceOpenItem | null;
  openEntry?: TaskWorkspaceOpenEntry | null;
  /** Task host chooses how a server-authorized asset is attached/inserted. */
  onUseWorkspaceEntry?: (entry: WorkspaceLibraryEntry) => Promise<void> | void;
  /** The foreground item (or null) whenever it changes, including saved revisions. */
  onOpenItemChange?: (open: TaskWorkspaceOpenState | null) => void;
  /**
   * Wraps the editor of a `bindTask` direct-open item when no work session is
   * inherited (TaskWorkspaceShell supplies a session provider + task binder).
   */
  renderBoundEditor?: (
    editor: ReactNode,
    context: { item: LibraryItem; rootId: string; taskId: string | null; siteId: string },
  ) => ReactNode;
}

class PluginModuleErrorBoundary extends Component<
  { label: string; onClose: () => void; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The fallback below is the user-visible report. A module failure must not
    // escape into the app workspace tree.
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <CanvasEmpty
        title={`「${this.props.label}」暂时无法显示`}
        description={this.state.error.message || "模块渲染时发生错误。"}
        action={
          <button
            type="button"
            onClick={this.props.onClose}
            className="rounded-full border border-stone-200 px-3 py-1.5 text-[12px] text-stone-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-50"
          >
            返回
          </button>
        }
      />
    );
  }
}

function PluginModuleMount({
  module,
  host,
}: {
  module: PluginModule;
  host: PluginHost;
}) {
  return module.render(host);
}

/**
 * Five fixed product slots. Legacy container tabs render directly; only
 * normalized LibraryItems/entries become cards.
 * 右侧栏顶上不再有标签，层由 `useWorkspaceViewState` 决定。
 */
export function ResultCanvas({
  tabs,
  active,
  onChange,
  accent = "#4f46e5",
  empty,
  focusNonce,
  className = "",
  action: externalAction,
  showTemplate = true,
  taskId,
  siteId = "",
  leoChatRequestNonce = null,
  workspaceOpen,
  materialContext,
  openItem,
  openEntry,
  onUseWorkspaceEntry,
  onOpenItemChange,
  renderBoundEditor,
}: ResultCanvasProps) {
  const tt = useUI();
  const [legacyLocationAction] = useState<WorkspaceActionEnvelope | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    // Item bookmarks already go through the catalog dispatcher. Raw platform
    // links predate it, so the sidebar itself supplies their material landing.
    if (params.has("item")) return null;
    const action = workspaceMaterialsActionFromSearch(window.location.search);
    return action ? { nonce: `legacy-material-location:${window.location.search}`, action } : null;
  });
  const [legacyAssetLocation] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("asset"));
  const workspaceSession = useOptionalWorkspaceSession();
  const workspaceSessionRef = useRef(workspaceSession);
  workspaceSessionRef.current = workspaceSession;
  const activeCapability = useActiveAppCapability();
  const capabilityControls = useAppCapabilityControls();
  const effectiveTaskId = taskId || workspaceSession?.taskId || null;
  const effectiveSiteId = siteId || workspaceSession?.siteId || "";
  const guideContext = useFunctionGuide();
  const guide = guideContext?.guide || null;
  const runtimeHydration = useWorkspaceRuntimeHydration();
  const rightSlot = useRightPaneSlot();
  const workspacePane = useWorkspacePane();
  const libraryPanelInstanceId = useId();
  const libraryPanelOwnerRef = useRef(
    `result-canvas-library:${libraryPanelInstanceId}`,
  );
  const myLibraryStoreRef = useRef<LiveWorkspaceNodeStore>(
    createLiveWorkspaceNodeStore(),
  );
  const [activeCanvasEntry, setActiveCanvasEntry] =
    useState<WorkspaceLibraryEntry | null>(null);
  const currentViewRef = useRef<string>("home");
  const foregroundOriginRef = useRef<string>("preview");
  const [activeActionContext, setActiveActionContext] = useState<AssetActionContext | undefined>();
  const [foregroundSuspended, setForegroundSuspended] = useState(false);
  const [activeCanvasMode, setActiveCanvasMode] =
    useState<"preview" | "edit">("preview");
  const [hasCommittedEditorRevision, setHasCommittedEditorRevision] =
    useState(false);
  const [artifactSaveError, setArtifactSaveError] = useState("");
  const activeCanvasRevisionKey = activeCanvasEntry?.libraryItem
    ? libraryItemIdentityKey(activeCanvasEntry.libraryItem)
    : "";
  useEffect(() => {
    // A failure belongs to one exact material revision in one canvas mode.
    // Metadata/no-op callbacks do not clear it; an actual transition does.
    setArtifactSaveError("");
  }, [activeCanvasMode, activeCanvasRevisionKey]);
  const materialSiteId =
    materialContext?.siteKey ||
    effectiveSiteId ||
    activeCanvasEntry?.libraryItem?.siteId ||
    "oceanleo";
  const materialAppId =
    materialContext?.appId || workspaceSession?.appId || materialSiteId;
  // Explicit server-issued context wins; otherwise derive the canonical
  // olctx:v1 binding so sites without materialContextForApp still get a
  // working Primary shelf.
  const materialContextId =
    materialContext?.contextId ||
    canonicalArtifactContextId(materialSiteId, materialAppId);
  const workbenchMaterials = useWorkbenchMaterialActions(
    materialSiteId,
    materialAppId,
  );
  const primaryMaterialAction =
    workbenchMaterials.actions.includes("insert")
      ? "insert"
      : workbenchMaterials.actions[0];
  // Set only by a direct-open request carrying `bindTask`; any other open clears it.
  const [bindEditorToTask, setBindEditorToTask] = useState(false);
  const openCanvasEntry = useCallback(
    (entry: WorkspaceLibraryEntry) => {
      // An explicit library card is a pinned artifact/revision identity.
      // Never replace a historical card with a locally saved head by root id.
      setActiveActionContext(undefined);
      foregroundOriginRef.current = currentViewRef.current === "home" ? "preview" : currentViewRef.current;
      setForegroundSuspended(false);
      setActiveCanvasEntry(entry);
      setHasCommittedEditorRevision(false);
      setActiveCanvasMode("preview");
      setArtifactSaveError("");
      setBindEditorToTask(false);
    },
    [],
  );
  const openCanvasItem = useCallback(
    (item: LibraryItem) => {
      setActiveActionContext(undefined);
      foregroundOriginRef.current = currentViewRef.current === "home" ? "preview" : currentViewRef.current;
      setForegroundSuspended(false);
      setHasCommittedEditorRevision(false);
      setActiveCanvasMode("edit");
      setArtifactSaveError("");
      setActiveCanvasEntry(workspaceEntryFromLibraryItem(item));
      setBindEditorToTask(false);
    },
    [],
  );
  const openResolvedEntry = useCallback((detail: { entry: WorkspaceLibraryEntry; actionContext?: AssetActionContext }, mode: "preview" | "edit", bindTask: boolean) => {
    foregroundOriginRef.current = currentViewRef.current === "home" ? "preview" : currentViewRef.current;
    setActiveCanvasEntry(detail.entry);
    setActiveActionContext(detail.actionContext);
    setActiveCanvasMode(mode === "edit" && detail.entry.libraryItem && (!detail.actionContext || detail.actionContext.rights.canEdit) && editorCapabilityFor(detail.entry.libraryItem).available ? "edit" : "preview");
    setHasCommittedEditorRevision(false);
    setArtifactSaveError("");
    setBindEditorToTask(bindTask);
    setForegroundSuspended(false);
  }, []);

  // Direct open (W7): the host already holds the exact item, so no library
  // list has to load and resolve an id first. One request per nonce.
  const consumedOpenNonceRef = useRef("");
  useEffect(() => {
    if (!openItem || consumedOpenNonceRef.current === openItem.nonce) return;
    consumedOpenNonceRef.current = openItem.nonce;
    if (
      openItem.mode === "edit" &&
      editorCapabilityFor(openItem.item).available
    ) {
      openCanvasItem(openItem.item);
    } else {
      openCanvasEntry(workspaceEntryFromLibraryItem(openItem.item));
    }
    if (openItem.bindTask) setBindEditorToTask(true);
  }, [openCanvasEntry, openCanvasItem, openItem]);
  // An explicit Library open replaces the foreground file, including attachments
  // picked from the Library. Keep the legacy uploaded-filter action compatible.
  const consumedLibraryOpenNonceRef = useRef("");
  useEffect(() => {
    const nonce = externalAction?.nonce || "";
    if (!nonce || consumedLibraryOpenNonceRef.current === nonce) return;
    consumedLibraryOpenNonceRef.current = nonce;
    const action = externalAction!.action;
    if (action.tab !== "mine" || (action.intent !== "open" && action.filter !== "uploaded")) return;
    setForegroundSuspended(true);
  }, [externalAction]);
  const onOpenItemChangeRef = useRef(onOpenItemChange);
  onOpenItemChangeRef.current = onOpenItemChange;
  const reportedItem = !foregroundSuspended ? activeCanvasEntry?.libraryItem || null : null;
  useEffect(() => {
    onOpenItemChangeRef.current?.(
      reportedItem ? { item: reportedItem, mode: activeCanvasMode, ...(activeActionContext && activeCanvasEntry ? { entry: activeCanvasEntry, actionContext: activeActionContext } : {}) } : null,
    );
  }, [activeCanvasMode, reportedItem, activeActionContext, activeCanvasEntry]);
  const recordSavedEditorItem = useCallback((item: LibraryItem) => {
    const source = activeCanvasEntry?.libraryItem;
    const transition = source
      ? savedEditorRevisionTransition(source, item)
      : null;
    if (transition && !transition.ok) {
      setArtifactSaveError(
        "编辑器未返回同一 artifact root、以当前 pin 为 previous revision 的新完整 revision；旧 head 仍保留。",
      );
      return;
    }
    const rootId = advancedRootItemId(item);
    // A valid new durable revision resolves an earlier commit failure. A
    // rename/open/autosave-noop must not hide a still-unresolved real failure.
    if (transition?.durableCommit) {
      setArtifactSaveError("");
      setHasCommittedEditorRevision(true);
    }
    setActiveCanvasEntry((current) =>
      current?.libraryItem &&
      advancedRootItemId(current.libraryItem) === rootId
        ? {
            ...current,
            title: item.title,
            thumbUrl: item.thumbUrl || item.previewUrl,
            externalUrl: item.url || item.previewUrl,
            libraryItem: item,
          }
        : current,
    );
  }, [activeCanvasEntry?.libraryItem]);

  useEffect(() => {
    const item = activeCanvasEntry?.libraryItem;
    const context = activeActionContext;
    if (!item?.artifactId || !item.revisionId || !context || context.ref.kind !== "artifact" ||
      (context.ref.artifactId === item.artifactId && context.ref.revisionId === item.revisionId)) return;
    const controller = new AbortController();
    resolveAssetDetail({ kind: "artifact", artifactId: item.artifactId, revisionId: item.revisionId }, { surface: context.surface, signal: controller.signal })
      .then((next) => { if (!controller.signal.aborted) { setActiveCanvasEntry(next.entry); setActiveActionContext(next.actionContext); } })
      .catch(() => { if (!controller.signal.aborted) setArtifactSaveError(tt("这份素材的权限未能刷新，请重新打开后再操作。")); });
    return () => controller.abort();
  }, [activeCanvasRevisionKey, activeActionContext]);

  const guideTab: CanvasTab | null = guide
    ? {
        id: "__guide",
        label: "灵感",
        surface: {
          slot: "template",
          role: "panel",
          primary: true,
          displayLabel: "快速起手",
          callbackId: null,
        },
        content: (
          <NavigatorGuide
            guide={guide}
            accent={accent}
            onUseExample={guideContext?.useExample}
          />
        ),
      }
    : null;
  const sourceTabs = useMemo(
    () => (guideTab ? [guideTab, ...tabs] : tabs),
    // Guide identity is stable inside one app runtime.
    [tabs, guideTab?.id], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const surfaceModel = useMemo(
    () => adaptLegacyWorkspaceSurfaceTabs(sourceTabs),
    [sourceTabs],
  );
  const grouped = surfaceModel.groups;
  const slotForId = useCallback(
    (id: string) =>
      workspaceSurfaceSlotForId(
        surfaceModel,
        id,
        workspaceSlotForLegacyId,
      ),
    [surfaceModel],
  );

  const inlineHistoryItems = useMemo(
    () => inlineEditorItemsFromSession(workspaceSession?.session),
    [
      workspaceSession?.session?.id,
      workspaceSession?.session?.revision,
      workspaceSession?.session?.snapshot,
    ],
  );
  const previewEntries = useMemo(
    () => [
      // A legacy result tab is a container, not a generated item. Only tabs
      // carrying a real normalized LibraryItem become cards; React content is
      // rendered directly below so “生成” never contains another fake “生成”
      // folder card.
      ...grouped.preview
        .flatMap((tab) =>
          tab.entries?.length
            ? tab.entries
            : tab.libraryItem
              ? [legacyWorkspaceEntry(tab)]
              : [],
        ),
      ...inlineHistoryItems.map((item) =>
        workspaceEntryFromLibraryItem(item, {
          id: `edited:${advancedRootItemId(item)}`,
          category: "已编辑",
          description: "本 App 自动保存的可编辑版本",
        }),
      ),
    ],
    [grouped.preview, inlineHistoryItems],
  );
  const libraryRefreshNonce = useMemo(
    () => previewEntries.map((entry) => entry.id).join("|"),
    [previewEntries],
  );
  const minePageEntries = useMemo(
    () =>
      grouped.mine
        .filter((tab) => tab.role !== "container")
        .map((tab) => ({
          ...legacyWorkspaceEntry(tab),
          id: `mine-page:${tab.id}`,
          category: "本站数据",
        })),
    [grouped.mine],
  );

  const callerIdForSlot = useCallback(
    (id: WorkspaceSlotId) => workspaceSurfaceCallerId(surfaceModel, id),
    [surfaceModel],
  );
  const {
    selected,
    visibleSlots,
    templatePageId,
    setTemplatePageId,
    select,
    actionFor,
    layer,
    setLayer,
    panelAction,
    pageAction,
  } = useWorkspaceSlotState({
    active,
    showTemplate,
    focusNonce,
    externalAction: externalAction || legacyLocationAction,
    runtimeHydration,
    slotForId,
    callerIdForSlot,
    onChange,
  });
  const bayOn = useBayEnabled();
  const imOn = useImEnabled();
  const panels = useMemo(() => ({ bay: bayOn, leochat: imOn, devices: true, projects: true, settings: true }), [bayOn, imOn]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const { view, openSlot, openPanel, goHome, bayRequest, chatRequest, openChat } = useWorkspaceViewState({
    selected, layer, setLayer, panelAction, select, panels,
    onHome: () => onChangeRef.current?.("home"),
  });
  useEffect(() => {
    if (typeof window === "undefined" || !imOn) return undefined;
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<LeoChatPanelRequestDetail>).detail;
      if (!detail || detail.handled) return;
      detail.handled = true;
      if (view === "leochat" && workspaceOpen !== false) {
        if (rightSlot?.closeRightPane) rightSlot.closeRightPane();
        else goHome();
        return;
      }
      openPanel("leochat");
    };
    window.addEventListener(LEOCHAT_PANEL_REQUEST_EVENT, receive);
    return () => window.removeEventListener(LEOCHAT_PANEL_REQUEST_EVENT, receive);
  }, [goHome, imOn, openPanel, rightSlot, view, workspaceOpen]);
  useEffect(() => {
    if (!imOn || !leoChatRequestNonce || view === "leochat") return;
    openPanel("leochat");
  }, [imOn, leoChatRequestNonce, openPanel, view]);
  // Navigation hides a foreground editor instead of destroying its mounted session.
  currentViewRef.current = view;
  const previousNavigation = useRef({ view, nonce: externalAction?.nonce, focusNonce, active });
  useEffect(() => {
    const previous = previousNavigation.current;
    previousNavigation.current = { view, nonce: externalAction?.nonce, focusNonce, active };
    if (previous.view === view && previous.nonce === externalAction?.nonce && previous.focusNonce === focusNonce && previous.active === active) return;
    setForegroundSuspended(view !== foregroundOriginRef.current || previous.nonce !== externalAction?.nonce);
  }, [view, externalAction?.nonce, focusNonce, active]);
  const legacyEntryRequest = useMemo<TaskWorkspaceOpenEntry | null>(() => bayRequest?.target && bayRequest.view === "materials" && !(legacyAssetLocation && bayRequest.nonce === legacyLocationAction?.nonce)
    ? { nonce: bayRequest.nonce, ref: bayRequest.target, surface: "task", mode: bayRequest.intent === "edit" ? "edit" : "preview" }
    : null, [bayRequest, legacyAssetLocation, legacyLocationAction]);
  const latestEntryRequest = useRef<{ direct?: string; legacy?: string; item?: string; action?: string; view?: string; request: TaskWorkspaceOpenEntry | null }>({ request: null });
  if (view !== latestEntryRequest.current.view) {
    latestEntryRequest.current.view = view;
    latestEntryRequest.current.request = null;
  }
  if (externalAction?.nonce !== latestEntryRequest.current.action) {
    latestEntryRequest.current.action = externalAction?.nonce;
    if (externalAction) latestEntryRequest.current.request = null;
  }
  if (bayRequest?.nonce !== latestEntryRequest.current.legacy) {
    latestEntryRequest.current.legacy = bayRequest?.nonce;
    latestEntryRequest.current.request = legacyEntryRequest;
  }
  if (openEntry?.nonce !== latestEntryRequest.current.direct) {
    latestEntryRequest.current.direct = openEntry?.nonce;
    if (openEntry) latestEntryRequest.current.request = openEntry;
  }
  if (openItem?.nonce !== latestEntryRequest.current.item) {
    latestEntryRequest.current.item = openItem?.nonce;
    if (openItem) latestEntryRequest.current.request = null;
  }
  const entryRequest = useWorkspaceEntryRequest(latestEntryRequest.current.request, openResolvedEntry);
  const bayBackRef = useRef<(() => void) | null>(null);
  const chatBackRef = useRef<(() => void) | null>(null);
  const handleBack = useCallback(() => {
    const inner = view === "bay" ? (bayRequest?.view === "materials" ? null : bayBackRef.current) : view === "leochat" ? chatBackRef.current : null;
    if (inner) inner();
    else goHome();
  }, [goHome, view, bayRequest?.view]);
  const [bayVisited, setBayVisited] = useState(false);
  const [chatVisited, setChatVisited] = useState(false);
  useEffect(() => { if (view === "bay") setBayVisited(true); }, [view]);
  useEffect(() => { if (view === "leochat") setChatVisited(true); }, [view]);
  const viewTitle = view === "home" ? "" : view === "bay" ? "LeoBay" : view === "leochat" ? "LeoChat" : view === "devices" ? tt("Devices") : view === "projects" ? tt("Projects") : view === "settings" ? tt("Settings") : tt(WORKSPACE_SLOT_LABELS[view]);

  const selectedTemplateTab = workspaceSurfacePrimaryTab(
    surfaceModel,
    "template",
    templatePageId,
  );
  const templateContent =
    selectedTemplateTab?.content || (
      <CanvasEmpty
        title="选择一个灵感开始"
        description="当前应用还没有起手灵感；你仍可以直接在左侧描述要完成的目标。"
      />
    );
  const previewPanelTabs = grouped.preview.filter(
    (tab) => tab.role === "panel",
  );
  const previewPanelModel = useMemo(
    () => buildWorkspaceSurfaceModel(previewPanelTabs),
    [previewPanelTabs],
  );
  const selectedPreviewTab = workspaceSurfacePrimaryTab(
    previewPanelModel,
    "preview",
    active,
  );
  const browserContent = (
    <CloudBrowserPanel taskId={effectiveTaskId} accent={accent} />
  );
  const managedPageAction = pageAction?.action && "version" in pageAction.action && pageAction.action.version === 2 ? pageAction.action : null;
  const RegisteredProjectsPanel = getWorkspacePanel("projects");
  const managedContent: Record<"devices" | "projects" | "settings", ReactNode> = {
    devices: <DevicesWorkspacePanel section={managedPageAction?.tab === "devices" ? managedPageAction.section : undefined} deviceId={managedPageAction?.deviceId} taskId={effectiveTaskId} />,
    projects: RegisteredProjectsPanel ? <RegisteredProjectsPanel taskId={effectiveTaskId} /> : <ProjectsWorkspacePanel />,
    settings: <SettingsWorkspacePanel section={managedPageAction?.tab === "settings" ? managedPageAction.section : undefined} prefill={managedPageAction?.tab === "settings" ? managedPageAction.prefill : undefined} />,
  };
  const content: Record<WorkspaceSlotId, ReactNode> = {
    template: (
      <div className="flex h-full min-h-0 flex-col overflow-hidden p-3">
        {grouped.template.length > 1 && selectedTemplateTab && (
          <CanvasSubTabs
            tabs={grouped.template.map((tab) => ({
              id: tab.id,
              label: tab.displayLabel,
            }))}
            active={selectedTemplateTab.id}
            onChange={(id) => {
              setTemplatePageId(id);
              if (id !== "__guide") onChange?.(id);
            }}
            accent={accent}
          />
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {templateContent}
        </div>
      </div>
    ),
    preview: selectedPreviewTab ? (
      <div className="flex h-full min-h-0 flex-col overflow-hidden p-3">
        {previewPanelTabs.length > 1 && (
          <CanvasSubTabs
            tabs={previewPanelTabs.map((tab) => ({
              id: tab.id,
              label: tab.label,
            }))}
            active={selectedPreviewTab.id}
            onChange={(id) => {
              onChange?.(id);
              runtimeHydration?.setRightTab(id);
            }}
            accent={accent}
          />
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {selectedPreviewTab.content}
        </div>
      </div>
    ) : (
      <WorkspaceLibrary
        entries={previewEntries}
        accent={accent}
        action={actionFor("preview")}
        taskId={effectiveTaskId}
        siteId={effectiveSiteId}
        onOpenEntry={openCanvasEntry}
        allowHostRestore={!activeCanvasEntry || activeCanvasMode !== "edit"}
        onOpenItem={openCanvasItem}
        searchPlaceholder="搜索生成结果和当前应用页面"
        emptyTitle="还没有生成内容"
        emptyDescription="生成后的 PPT、网站、图片、表格、文档和画布会逐项显示在这里；点开即可继续编辑。"
      />
    ),
    materials: null, // Compatibility inputs are routed to LeoBay; there is no standalone mount.
    mine: (
      <div className="h-full min-h-0">
        <MyLibrary
          accent={accent}
          action={actionFor("mine")}
          taskId={effectiveTaskId}
          siteId={materialSiteId}
          featuredEntries={minePageEntries}
          refreshNonce={libraryRefreshNonce}
          onOpenItem={openCanvasItem}
          materialActions={workbenchMaterials.actions}
          onMaterialAction={workbenchMaterials.perform}
          materialActionAvailable={workbenchMaterials.canPerform}
          materialActionEvidence={workbenchMaterials.availability}
          primaryMaterialAction={primaryMaterialAction}
          draggableMaterials={Boolean(primaryMaterialAction)}
          onMaterialDragStart={workbenchMaterials.beginMaterialDrag}
          onMaterialDragEnd={workbenchMaterials.endMaterialDrag}
        />
      </div>
    ),
    browser: <div className="h-full min-h-0">{browserContent}</div>,
  };

  const myLibraryNode = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">{content.mine}</div>
    </div>
  );
  myLibraryStoreRef.current.node = myLibraryNode;
  useLayoutEffect(() => {
    const stores = [myLibraryStoreRef.current];
    stores.forEach((store) => {
      store.version += 1;
      store.listeners.forEach((listener) => listener());
    });
  }, [myLibraryNode]);

  const registerLibraryPanel = workspacePane?.registerLibraryPanel;
  const unregisterLibraryPanel = workspacePane?.unregisterLibraryPanel;
  useLayoutEffect(() => {
    if (!registerLibraryPanel || !unregisterLibraryPanel) return;
    const ownerId = libraryPanelOwnerRef.current;
    registerLibraryPanel("mine", {
      ownerId,
      id: "workspace-library:mine",
      label: tt(WORKSPACE_SLOT_LABELS.mine),
      content: <LiveWorkspaceNode store={myLibraryStoreRef.current} />,
    });
    return () => {
      unregisterLibraryPanel("mine", ownerId);
    };
  }, [registerLibraryPanel, tt, unregisterLibraryPanel]);

  /**
   * 编辑器挂不挂，取决于**手上有没有一份判得了 `available` 的素材**——不再取决于
   * 「这份素材是不是从库里点开的」。
   *
   * 改动前这里额外要求 `activeCanvasEntry.libraryItem` 来自一次库内打开；现在素材仍走
   * 同一条挂载路径，而插件模块由位置层直接显示，不再伪装成一件素材进入编辑器路由。
   */
  const activeEditorItem =
    activeCanvasMode === "edit" &&
    activeCanvasEntry?.libraryItem &&
    editorCapabilityFor(activeCanvasEntry.libraryItem).available
      ? activeCanvasEntry.libraryItem
      : null;
  const editorWorkbench = activeEditorItem ? (
    <AdvancedContentWorkbench
      key={advancedRootItemId(activeEditorItem)}
      item={activeEditorItem}
      taskId={effectiveTaskId}
      siteId={effectiveSiteId || activeEditorItem.siteId}
      appId={workspaceSession?.appId}
      accent={accent}
      embedded
      onSavedItem={recordSavedEditorItem}
      onClose={() => {
        // Keep the exact revision accepted from this editor's commit chain.
        // Returning to a cached library card would reopen its older pin.
        if (hasCommittedEditorRevision) setActiveCanvasMode("preview");
        else setActiveCanvasEntry(null);
        setArtifactSaveError("");
      }}
    />
  ) : null;
  // A carried-over file (home → its new task): the host wraps the editor in
  // the session provider the embedded workbench would create, plus a binder to
  // the task once it exists. Decided per opened entry, so the task arriving
  // never remounts the editor.
  const editorContent =
    activeEditorItem && bindEditorToTask && !workspaceSession && renderBoundEditor
      ? renderBoundEditor(editorWorkbench, {
          item: activeEditorItem,
          rootId: advancedRootItemId(activeEditorItem),
          taskId: effectiveTaskId,
          siteId: effectiveSiteId || activeEditorItem.siteId,
        })
      : editorWorkbench;
  const viewerContent =
    activeCanvasEntry && activeCanvasMode === "preview" ? (
      activeActionContext ? <AssetDetail entry={activeCanvasEntry} actionContext={activeActionContext} accent={accent} plain
        onBack={() => { setActiveCanvasEntry(null); setActiveActionContext(undefined); }}
        actions={<BayAssetActions entry={activeCanvasEntry} actionContext={activeActionContext}
          onResolved={(next) => { setActiveCanvasEntry(next.entry); setActiveActionContext(next.actionContext); }}
          onEdit={(entry) => openResolvedEntry({ entry, actionContext: activeActionContext }, "edit", bindEditorToTask)}
          onUseInTask={onUseWorkspaceEntry} />} /> : <WorkspaceLibrary
        entries={
          previewEntries.some((entry) => entry.id === activeCanvasEntry.id)
            ? previewEntries.map((entry) =>
                entry.id === activeCanvasEntry.id ? activeCanvasEntry : entry,
              )
            : [...previewEntries, activeCanvasEntry]
        }
        accent={accent}
        openEntryId={activeCanvasEntry.id}
        taskId={effectiveTaskId}
        siteId={effectiveSiteId}
        onOpenItem={openCanvasItem}
        onDetailOpenChange={(open) => {
          if (open) return;
          setActiveCanvasEntry(null);
          setHasCommittedEditorRevision(false);
          setArtifactSaveError("");
        }}
        searchPlaceholder="搜索生成结果和当前应用页面"
        emptyTitle="还没有生成内容"
        emptyDescription="生成后的 PPT、网站、图片、表格、文档和画布会逐项显示在这里；点开即可继续编辑。"
      />
    ) : null;
  const pluginHost = useMemo<PluginHost | null>(() => {
    if (!activeCapability) return null;
    const { siteKey, appId, id } = activeCapability;
    const state = createPluginStateAccess(siteKey, appId, id);
    return {
      siteKey,
      appId,
      appData: createPluginAppDataReader({
        siteKey,
        appId,
        session: () => workspaceSessionRef.current?.session,
      }),
      save: state.save,
      load: state.load,
      exportArtifact: (bytes, kind, filename) =>
        exportPluginArtifact(siteKey, bytes, kind, filename),
    };
  }, [activeCapability]);
  const pluginContent = activeCapability && pluginHost ? (
    <div
      data-plugin-module-host={activeCapability.id}
      className="h-full min-h-0 w-full overflow-hidden"
    >
      <PluginModuleErrorBoundary
        key={`${activeCapability.siteKey}/${activeCapability.appId}/${activeCapability.id}`}
        label={activeCapability.label}
        onClose={capabilityControls.close}
      >
        <PluginModuleMount module={activeCapability} host={pluginHost} />
      </PluginModuleErrorBoundary>
    </div>
  ) : null;
  const foregroundContent = pluginContent || editorContent || viewerContent;
  const foregroundVisible = Boolean(pluginContent) || (Boolean(editorContent || viewerContent) && !foregroundSuspended);
  const openingEntry = entryRequest.status !== null;
  // 登记 workbenchOpen：右上角「模型组合」选择框据此让位，不再压在面板页签上。
  //   - 前台一露出来（编辑器 / 详情预览 / 插件模块）就登记；编辑器自己也会登记一份
  //     （AdvancedContentWorkbench），计数器语义下互不干扰，这里补的是详情预览与插件模块。
  //   - 没有 SplitWorkspace 时本组件自带返回行（StandaloneWorkspaceFrame）正好顶在
  //     右上角，同样是面板可见 → 登记。有 SplitWorkspace 时右栏显隐由它登记。
  useWorkbenchOpenClaim(foregroundVisible || !rightSlot);
  const chatPanelActive = !foregroundVisible && view === "leochat" && workspaceOpen !== false;
  const rightMainContent = (
    <div className="relative h-full min-h-0 overflow-hidden" data-workspace-view={view}>
      <div
        data-result-canvas-slot-stack
        className={`h-full min-h-0 ${foregroundVisible ? "hidden" : "block"}`}
        aria-hidden={foregroundVisible || undefined}
        inert={foregroundVisible || undefined}
      >
        <div data-workspace-home data-workspace-home-active={!foregroundVisible && view === "home"}
             hidden={view !== "home"} inert={view !== "home" || undefined} className="h-full min-h-0 overflow-y-auto">
          <WorkspaceHome slots={visibleSlots} panels={panels} onOpenSlot={openSlot} onOpenPanel={openPanel} previewCount={previewEntries.length} />
        </div>
        {visibleSlots.map((slot) => {
          const isActive = !foregroundVisible && view === slot;
          return (
            <div
              key={slot}
              data-workspace-slot-panel={slot}
              data-workspace-slot-active={isActive}
              role="tabpanel"
              aria-label={tt(WORKSPACE_SLOT_LABELS[slot])}
              aria-hidden={!isActive}
              hidden={!isActive}
              inert={!isActive || undefined}
              className="h-full min-h-0 overflow-hidden"
            >
              {content[slot] || empty || content.template}
            </div>
          );
        })}
        {panels.bay && bayVisited ? (
          <div data-workspace-panel="bay" data-workspace-panel-active={!foregroundVisible && view === "bay"}
               hidden={view !== "bay"} inert={view !== "bay" || undefined} className="h-full min-h-0 overflow-hidden">
            {bayRequest?.view === "materials" ? <div className="h-full min-h-0 overflow-auto" data-workspace-bay-materials>
              <BayAssetLibrary key={bayRequest.nonce} siteKey={materialSiteId} context={materialContext || { contextId: materialContextId, siteKey: materialSiteId, appId: materialAppId }}
                filter={{ kind: "asset", q: bayRequest.query }} onEdit={(entry) => openResolvedEntry({ entry }, "edit", false)} onUseInTask={onUseWorkspaceEntry} />
            </div> : <BayPanel siteKey={effectiveSiteId || "oceanleo"} active={!foregroundVisible && view === "bay"} request={bayRequest}
                      onBackChange={(back) => { bayBackRef.current = back; }} onOpenConversation={openChat} />}
          </div>
        ) : null}
        {panels.leochat && chatVisited ? (
          <div data-workspace-panel="leochat" data-workspace-panel-active={chatPanelActive}
               hidden={!chatPanelActive} inert={!chatPanelActive || undefined} className="h-full min-h-0 overflow-hidden">
            <LeoChatPanel active={chatPanelActive} request={chatRequest}
                          onBackChange={(back) => { chatBackRef.current = back; }} onEvicted={goHome} />
          </div>
        ) : null}
        {(view === "devices" || view === "projects" || view === "settings") ? (
          <div data-workspace-managed-panel={view} className="h-full min-h-0 overflow-auto">
            {managedContent[view]}
          </div>
        ) : null}
      </div>
      {openingEntry && <div className="absolute inset-0 z-10 bg-[var(--card,#fff)]" data-workspace-entry-open={entryRequest.status}>
        {entryRequest.status === "loading"
          ? <WorkspacePaneSkeleton action={<button type="button" onClick={entryRequest.dismiss}>{tt("返回")}</button>} />
          : <CanvasEmpty title="无法打开这份素材" description={entryRequest.reason}
              action={<><button type="button" onClick={entryRequest.dismiss}>{tt("返回")}</button><button type="button" onClick={entryRequest.retry}>{tt("重试")}</button></>} />}
      </div>}
      {foregroundContent && (
        <div
          data-result-canvas-foreground
          hidden={!foregroundVisible || openingEntry}
          inert={!foregroundVisible || openingEntry || undefined}
          className="absolute inset-0 min-h-0 overflow-hidden"
        >
          {foregroundContent}
          {!pluginContent && artifactSaveError && (
            <div
              role="alert"
              className="absolute inset-x-0 top-0 z-50 border-b border-rose-500/25 bg-rose-50 px-3 py-2 text-[11px] leading-relaxed text-rose-700"
            >
              {artifactSaveError}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // My Library keeps its registered node for existing editor hosts. Material
  // insertion drawers own their data/UI independently of this sidebar.
  useLayoutEffect(() => {
    if (!rightSlot) return;
    if (foregroundSuspended && !activeCapability) {
      rightSlot.setRightEditorHeader(false);
      rightSlot.setRightFrameless(view === "home");
      rightSlot.setRightLabel(view === "home" ? null : <WorkspaceViewHeader title={viewTitle} onBack={handleBack} />);
      return () => { rightSlot.setRightLabel(null); rightSlot.setRightFrameless(false); };
    }
    if (activeCapability) {
      rightSlot.setRightLabel(null);
      rightSlot.setRightEditorHeader(false);
      rightSlot.setRightFrameless(true);
      return () => {
        rightSlot.setRightFrameless(false);
      };
    }
    rightSlot.setRightFrameless(false);
    const editorOpening = Boolean(
      activeCanvasMode === "edit" &&
        activeCanvasEntry?.libraryItem &&
        editorCapabilityFor(activeCanvasEntry.libraryItem).available,
    );
    if (editorOpening) {
      rightSlot.setRightEditorHeader(true);
      return () => {
        rightSlot.setRightEditorHeader(false);
      };
    }
    if (activeCanvasEntry) return;
    rightSlot.setRightEditorHeader(false);
    // 卡片首页：去掉右栏顶上那一行。setRightLabel(null) 在 library 模式下会回落到
    // 「预览」标题，必须连 frameless 一起打开，SplitWorkspace 才不画 header。
    const onHome = view === "home";
    rightSlot.setRightFrameless(onHome);
    rightSlot.setRightLabel(onHome ? null : <WorkspaceViewHeader title={viewTitle} onBack={handleBack} />);
    return () => {
      rightSlot.setRightLabel(null);
      rightSlot.setRightFrameless(false);
    };
  }, [
    foregroundSuspended,
    activeCapability,
    activeCanvasEntry,
    activeCanvasMode,
    handleBack,
    rightSlot,
    view,
    viewTitle,
  ]);

  if (rightSlot) {
    return (
      <div className={`flex h-full min-h-0 flex-col overflow-hidden ${className}`}>
        <div className="min-h-0 flex-1 overflow-hidden">
          {rightMainContent}
        </div>
      </div>
    );
  }

  return (
    <StandaloneWorkspaceFrame
      header={view === "home" ? null : <WorkspaceViewHeader title={viewTitle} onBack={handleBack} />}
      className={className}
    >
      {rightMainContent}
    </StandaloneWorkspaceFrame>
  );
}
