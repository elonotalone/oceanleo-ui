"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import { useRightPaneSlot, useWorkspacePane } from "./SplitWorkspace";
import { useFunctionGuide } from "./guide-context";
import { NavigatorGuide } from "./NavigatorGuide";
import { MaterialLibrary, type MaterialItem } from "./MaterialLibrary";
import { MyLibrary } from "./MyLibrary";
import { CloudBrowserPanel } from "./CloudBrowserPanel";
import {
  WorkspaceLibrary,
  type WorkspaceLibraryEntry,
  workspaceEntryFromLibraryItem,
} from "./WorkspaceLibrary";
import {
  workspaceSlotForLegacyId,
  type WorkspaceActionEnvelope,
  type WorkspaceSlotId,
} from "./workspace-actions";
import { useWorkspaceSlotState } from "./result-canvas-slot-state";
import {
  ADVANCED_FEATURE_LAUNCH_EVENT,
  normalizeAdvancedFeatureLaunch,
  type AdvancedFeatureLaunchEnvelope,
} from "./advanced-feature-launch";
import { pluginInstanceLibraryItem } from "./plugin-initial-state";
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
import { WorkspaceEntryCanvas } from "./WorkspaceEntryCanvas";
import { editorCapabilityFor } from "./workbench-routes";
import {
  advancedRootItemId,
  inlineEditorItemsFromSession,
  savedEditorRevisionTransition,
} from "./advanced-session";
import { useWorkbenchMaterialActions } from "./workbench-material-provider";
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
  FixedWorkspaceTabs,
  LiveWorkspaceNode,
  StandaloneWorkspaceFrame,
  WORKSPACE_SLOT_LABELS,
  createLiveWorkspaceNodeStore,
  type LiveWorkspaceNodeStore,
} from "./result-canvas-view";

export { CanvasEmpty, CanvasSubTabs } from "./result-canvas-view";

const EMPTY_MATERIALS: MaterialItem[] = [];

export interface CanvasTab extends LegacyWorkspaceSurfaceTab {}

export interface ResultCanvasProps {
  /**
   * Compatibility input. Existing pages can keep declaring their domain tabs;
   * the shared shell classifies them into the five fixed product slots.
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
  /** Server-issued exact binding context for the Primary material shelf. */
  materialContext?: ArtifactContextRef;
  /**
   * 空手启动：不选任何素材，直接点开一个功能。与 `action` 同形（一枚 nonce + 一份
   * 已规范化的请求），也同样可以改走 `oceanleo:advanced-feature-launch` 总线。
   * **可选**——不传时右栏行为与今天逐字相同。
   */
  featureLaunch?: AdvancedFeatureLaunchEnvelope | null;
  /**
   * 素材库空态下方的 CTA 插槽。宿主用它把「这个 app 能做什么」指回功能按钮；
   * **可选**，不传时空态仍然是既有的图标 + 两行灰字，一个字都不改。
   */
  materialsEmptyCta?: ReactNode;
}

/**
 * Five fixed product slots. Legacy container tabs render directly; only
 * normalized LibraryItems/entries become cards.
 */
export function ResultCanvas({
  tabs,
  active,
  onChange,
  accent = "#4f46e5",
  empty,
  focusNonce,
  className = "",
  materials = EMPTY_MATERIALS,
  onSeeAllMaterials,
  action: externalAction,
  showTemplate = true,
  taskId,
  siteId = "",
  materialContext,
  featureLaunch,
  materialsEmptyCta,
}: ResultCanvasProps) {
  const tt = useUI();
  const workspaceSession = useOptionalWorkspaceSession();
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
  const materialLibraryStoreRef = useRef<LiveWorkspaceNodeStore>(
    createLiveWorkspaceNodeStore(),
  );
  const myLibraryStoreRef = useRef<LiveWorkspaceNodeStore>(
    createLiveWorkspaceNodeStore(),
  );
  const [activeCanvasEntry, setActiveCanvasEntry] =
    useState<WorkspaceLibraryEntry | null>(null);
  const [activeCanvasMode, setActiveCanvasMode] =
    useState<"preview" | "edit">("preview");
  const [artifactSaveError, setArtifactSaveError] = useState("");
  const [featureLaunchError, setFeatureLaunchError] = useState("");
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
  const openCanvasEntry = useCallback(
    (entry: WorkspaceLibraryEntry) => {
      // An explicit library card is a pinned artifact/revision identity.
      // Never replace a historical card with a locally saved head by root id.
      setActiveCanvasEntry(entry);
      setActiveCanvasMode("preview");
      setArtifactSaveError("");
    },
    [],
  );
  const openCanvasItem = useCallback(
    (item: LibraryItem) => {
      setActiveCanvasMode("edit");
      setArtifactSaveError("");
      setFeatureLaunchError("");
      setActiveCanvasEntry(workspaceEntryFromLibraryItem(item));
    },
    [],
  );
  /**
   * 点开一枚按键。宿主只递来「点的是哪一个」，右栏按这个身份取它自己的第一屏
   * （`plugin-initial-state.ts` 的注册表），再走**同一条**挂载路径 —— 没有第二套
   * 挂载逻辑，也没有绕过 `editorCapabilityFor()`：取出来的实例照样要被判
   * `available` 才挂得起来。
   *
   * **fail-closed**：查不到第一屏就把理由显示出来，不退回任何通用模板。以前这里
   * 是按载体类型反查 5 份通用空白起手件之一，于是所有按键打开的都是同一份骨架；
   * 那条路已经整条拆掉。
   */
  const startFeatureLaunch = useCallback(
    (envelope: AdvancedFeatureLaunchEnvelope) => {
      const launch = normalizeAdvancedFeatureLaunch(envelope.launch);
      if (!launch) {
        setFeatureLaunchError("这次打开请求缺少功能身份，已拒绝打开。");
        return;
      }
      const instance = pluginInstanceLibraryItem(launch.pluginId, {
        siteId: materialSiteId,
        appId: materialAppId,
        title: launch.title,
        nonce: envelope.nonce,
      });
      if (!instance) {
        setFeatureLaunchError(
          `「${launch.title || launch.pluginId}」还没有定义打开后的第一屏，暂时不能使用。`,
        );
        return;
      }
      const capability = editorCapabilityFor(instance);
      if (!capability.available) {
        setFeatureLaunchError(
          capability.unavailableReason || "这个功能没有可用的运行时。",
        );
        return;
      }
      openCanvasItem(instance);
    },
    [materialAppId, materialSiteId, openCanvasItem],
  );
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
    if (transition?.durableCommit) setArtifactSaveError("");
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
  const localMaterials = useMemo(
    () => [
      ...materials,
      ...grouped.materials.flatMap((tab) => tab.materials || []),
    ],
    [materials, grouped.materials],
  );
  const materialPageEntries = useMemo(
    () => [
      ...grouped.materials
        // The fixed slot already *is* Material Library. Turning a legacy
        // “素材库” tab into an entry produced the reported library-inside-
        // library card. Its actual materials are extracted above; the
        // container tab itself must never become a card.
        .filter(
          (tab) =>
            tab.role !== "container" &&
            (tab.materials?.length || 0) === 0 &&
            Boolean(tab.libraryItem),
        )
        .map((tab) => ({
          ...legacyWorkspaceEntry(tab, { material: true }),
          id: `material-page:${tab.id}`,
          category: "本站精选",
        })),
    ],
    [grouped.materials],
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
  } = useWorkspaceSlotState({
    active,
    showTemplate,
    focusNonce,
    externalAction,
    runtimeHydration,
    slotForId,
    callerIdForSlot,
    onChange,
  });

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<AdvancedFeatureLaunchEnvelope>)
        .detail;
      if (!detail?.launch) return;
      startFeatureLaunch({
        nonce: String(detail.nonce || Date.now()),
        launch: detail.launch,
      });
    };
    window.addEventListener(ADVANCED_FEATURE_LAUNCH_EVENT, receive);
    return () =>
      window.removeEventListener(ADVANCED_FEATURE_LAUNCH_EVENT, receive);
  }, [startFeatureLaunch]);

  useEffect(() => {
    if (!featureLaunch) return;
    startFeatureLaunch(featureLaunch);
  }, [featureLaunch?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

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
        onOpenItem={openCanvasItem}
        searchPlaceholder="搜索生成结果和当前应用页面"
        emptyTitle="还没有生成内容"
        emptyDescription="生成后的 PPT、网站、图片、表格、文档和画布会逐项显示在这里；点开即可继续编辑。"
      />
    ),
    materials: (
      <MaterialLibrary
        materials={localMaterials}
        featuredEntries={materialPageEntries}
        accent={accent}
        action={actionFor("materials")}
        taskId={effectiveTaskId}
        siteId={materialSiteId}
        appId={materialAppId}
        contextId={materialContextId}
        functionId={materialContext?.functionId || ""}
        onSeeAll={onSeeAllMaterials}
        emptyCta={materialsEmptyCta}
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
    ),
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

  const materialLibraryNode = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">{content.materials}</div>
    </div>
  );
  const myLibraryNode = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">{content.mine}</div>
    </div>
  );
  materialLibraryStoreRef.current.node = materialLibraryNode;
  myLibraryStoreRef.current.node = myLibraryNode;
  useLayoutEffect(() => {
    const stores = [materialLibraryStoreRef.current, myLibraryStoreRef.current];
    stores.forEach((store) => {
      store.version += 1;
      store.listeners.forEach((listener) => listener());
    });
  }, [materialLibraryNode, myLibraryNode]);

  const registerLibraryPanel = workspacePane?.registerLibraryPanel;
  const unregisterLibraryPanel = workspacePane?.unregisterLibraryPanel;
  useLayoutEffect(() => {
    if (!registerLibraryPanel || !unregisterLibraryPanel) return;
    const ownerId = libraryPanelOwnerRef.current;
    registerLibraryPanel("materials", {
      ownerId,
      id: "workspace-library:materials",
      label: tt(WORKSPACE_SLOT_LABELS.materials),
      content: <LiveWorkspaceNode store={materialLibraryStoreRef.current} />,
    });
    registerLibraryPanel("mine", {
      ownerId,
      id: "workspace-library:mine",
      label: tt(WORKSPACE_SLOT_LABELS.mine),
      content: <LiveWorkspaceNode store={myLibraryStoreRef.current} />,
    });
    return () => {
      unregisterLibraryPanel("materials", ownerId);
      unregisterLibraryPanel("mine", ownerId);
    };
  }, [registerLibraryPanel, tt, unregisterLibraryPanel]);

  /**
   * 编辑器挂不挂，取决于**手上有没有一份判得了 `available` 的素材**——不再取决于
   * 「这份素材是不是从库里点开的」。
   *
   * 改动前这里额外要求 `activeCanvasEntry.libraryItem` 来自一次库内打开，于是「库为空
   * 但指定了一个功能」这条路径永远拿不到 `libraryItem`，`activeEditorItem` 恒为 `null`，
   * 编辑器挂不起来（H 波判据 `H1-c`）。空手起手件由 `startFeatureLaunch()` 造好后走
   * `openCanvasItem()` 进到同一个 `activeCanvasEntry`，所以这里只剩一条挂载路径：
   * **判定仍然在 `editorCapabilityFor()`，一个字都没放宽**，放开的只是素材的来路。
   */
  const activeEditorItem =
    activeCanvasMode === "edit" &&
    activeCanvasEntry?.libraryItem &&
    editorCapabilityFor(activeCanvasEntry.libraryItem).available
      ? activeCanvasEntry.libraryItem
      : null;
  const editorContent = activeEditorItem ? (
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
        setActiveCanvasEntry(null);
        setArtifactSaveError("");
      }}
    />
  ) : null;
  const viewerContent =
    activeCanvasEntry && activeCanvasMode === "preview" ? (
      <WorkspaceEntryCanvas
        entry={activeCanvasEntry}
        accent={accent}
        onClose={() => {
          setActiveCanvasEntry(null);
          setArtifactSaveError("");
        }}
      />
    ) : null;
  // 起手失败必须看得见，也必须退得出去：不留一块空白前景，也不静默回到槽位堆。
  const launchFailureContent = featureLaunchError ? (
    <CanvasEmpty
      title="这个功能暂时打不开"
      description={featureLaunchError}
      action={
        <button
          type="button"
          onClick={() => setFeatureLaunchError("")}
          className="rounded-full border border-stone-200 px-3 py-1.5 text-[12px] text-stone-600 transition hover:bg-stone-50"
        >
          返回
        </button>
      }
    />
  ) : null;
  const foregroundContent = artifactSaveError ? (
      <div className="flex h-full min-h-0 flex-col">
        <div
          role="alert"
          className="shrink-0 border-b border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-700"
        >
          {artifactSaveError}
        </div>
        <div className="min-h-0 flex-1">{editorContent}</div>
      </div>
    ) : (
      editorContent || viewerContent || launchFailureContent
    );
  const foregroundVisible = Boolean(foregroundContent);
  const rightMainContent = (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div
        data-result-canvas-slot-stack
        className={`h-full min-h-0 ${foregroundVisible ? "hidden" : "block"}`}
        aria-hidden={foregroundVisible || undefined}
        inert={foregroundVisible || undefined}
      >
        {visibleSlots.map((slot) => {
          const isActive = !foregroundVisible && selected === slot;
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
      </div>
      {foregroundVisible && (
        <div
          data-result-canvas-foreground
          className="absolute inset-0 min-h-0 overflow-hidden"
        >
          {foregroundContent}
        </div>
      )}
    </div>
  );

  // Materials/My Library reuse these exact nodes when the fixed editor action
  // bar opens them on the left. The right library itself never moves.
  useLayoutEffect(() => {
    if (!rightSlot) return;
    rightSlot.setRightFrameless(false);
    if (activeCanvasEntry) return;
    rightSlot.setRightEditorHeader(false);
    rightSlot.setRightLabel(
      <FixedWorkspaceTabs
        slots={visibleSlots}
        selected={selected}
        onSelect={select}
        accent={accent}
      />,
    );
    return () => {
      rightSlot.setRightLabel(null);
      rightSlot.setRightFrameless(false);
    };
  }, [
    accent,
    activeCanvasEntry,
    rightSlot,
    select,
    selected,
    visibleSlots,
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
      slots={visibleSlots}
      selected={selected}
      onSelect={select}
      accent={accent}
      className={className}
    >
      {rightMainContent}
    </StandaloneWorkspaceFrame>
  );
}
