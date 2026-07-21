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
  FIXED_WORKSPACE_SLOTS,
  WORKSPACE_ACTION_EVENT,
  normalizeWorkspaceAction,
  workspaceSlotForLegacyId,
  type WorkspaceActionEnvelope,
  type WorkspaceSlotId,
} from "./workspace-actions";
import { useWorkspaceRuntimeHydration } from "./workspace-runtime-hydration";
import { useOptionalWorkspaceSession } from "./workspace-session-context";
import type { LibraryItem } from "./library-data";
import { isDurableLibraryItem } from "./library-data";
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
      setActiveCanvasEntry(workspaceEntryFromLibraryItem(item));
    },
    [],
  );
  const recordSavedEditorItem = useCallback((item: LibraryItem) => {
    const source = activeCanvasEntry?.libraryItem;
    if (source && isDurableLibraryItem(source)) {
      const previousRevisionId = String(
        item.meta.previous_revision_id || "",
      ).trim();
      if (
        !isDurableLibraryItem(item) ||
        item.artifactId !== source.artifactId ||
        item.revisionId === source.revisionId ||
        previousRevisionId !== source.revisionId ||
        !item.artifact.integrity.ok
      ) {
        setArtifactSaveError(
          "编辑器未返回同一 artifact root、以当前 pin 为 previous revision 的新完整 revision；旧 head 仍保留。",
        );
        return;
      }
    }
    const rootId = advancedRootItemId(item);
    setArtifactSaveError("");
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

  const restoredSlot = slotForId(runtimeHydration?.rightTab || "");
  const visibleSlots = useMemo(
    () =>
      FIXED_WORKSPACE_SLOTS.filter(
        (slot) => showTemplate || slot !== "template",
      ),
    [showTemplate],
  );
  const [internal, setInternal] = useState<WorkspaceSlotId>(() => {
    const requested = runtimeHydration?.rightTab
      ? restoredSlot
      : active
        ? slotForId(active)
        : showTemplate
          ? "template"
          : "preview";
    return !showTemplate && requested === "template" ? "preview" : requested;
  });
  const [templatePageId, setTemplatePageId] = useState(() => {
    const restoredTemplate = runtimeHydration?.rightTab || "";
    if (
      restoredTemplate &&
      slotForId(restoredTemplate) === "template"
    ) {
      return restoredTemplate;
    }
    return active && slotForId(active) === "template"
      ? active
      : "";
  });
  const [workspaceAction, setWorkspaceAction] =
    useState<WorkspaceActionEnvelope | null>(null);
  const selected =
    !showTemplate && internal === "template" ? "preview" : internal;
  const previousActive = useRef(active);
  const callerIdForSlot = useCallback(
    (id: WorkspaceSlotId) => workspaceSurfaceCallerId(surfaceModel, id),
    [surfaceModel],
  );

  const select = useCallback(
    (id: WorkspaceSlotId) => {
      if (!showTemplate && id === "template") return;
      setInternal(id);
      // Existing sites persist their local `result/material/mine` ids in app
      // snapshots. Keep that callback contract while the shared runtime stores
      // the canonical fixed-slot id below.
      const callerId = callerIdForSlot(id);
      if (callerId) onChange?.(callerId);
      runtimeHydration?.setRightTab(id);
    },
    [callerIdForSlot, onChange, runtimeHydration, showTemplate],
  );

  useEffect(() => {
    if (active === undefined) {
      previousActive.current = undefined;
      return;
    }
    if (active === previousActive.current) return;
    previousActive.current = active;
    const requested = slotForId(active);
    const slot =
      !showTemplate && requested === "template" ? "preview" : requested;
    setInternal(slot);
    if (slot === "template") setTemplatePageId(active);
  }, [active, showTemplate, slotForId]);

  useEffect(() => {
    runtimeHydration?.setDefaultRightTab(showTemplate ? "template" : "preview");
  }, [runtimeHydration?.identity, showTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!runtimeHydration?.restoredSnapshot) return;
    const restoredRightTab = runtimeHydration.rightTab || "";
    const requested = slotForId(restoredRightTab);
    const slot =
      !showTemplate && requested === "template" ? "preview" : requested;
    setInternal(
      restoredRightTab
        ? slot
        : active
          ? (!showTemplate &&
            slotForId(active) === "template"
              ? "preview"
              : slotForId(active))
          : showTemplate
            ? "template"
            : "preview",
    );
    if (restoredRightTab && slot === "template") {
      setTemplatePageId(restoredRightTab);
    }
  }, [
    runtimeHydration?.snapshotRestoreEpoch,
    runtimeHydration?.identity,
    showTemplate,
    slotForId,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const previousFocusNonce = useRef(focusNonce);
  useEffect(() => {
    if (focusNonce === previousFocusNonce.current) return;
    previousFocusNonce.current = focusNonce;
    select("preview");
  }, [focusNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceActionEnvelope>).detail;
      const action = normalizeWorkspaceAction(detail?.action);
      if (!action) return;
      const envelope = {
        nonce: String(detail?.nonce || Date.now()),
        action,
      };
      setWorkspaceAction(envelope);
      select(action.tab);
    };
    window.addEventListener(WORKSPACE_ACTION_EVENT, receive);
    return () => window.removeEventListener(WORKSPACE_ACTION_EVENT, receive);
  }); // select intentionally reads the latest controlled props.

  useEffect(() => {
    if (!externalAction) return;
    const action = normalizeWorkspaceAction(externalAction.action);
    if (!action) return;
    setWorkspaceAction({ nonce: externalAction.nonce, action });
    select(action.tab);
  }, [externalAction?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const actionFor = (slot: WorkspaceSlotId) =>
    workspaceAction?.action.tab === slot ? workspaceAction : null;

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

  const libraryContent = content[selected] || empty || content.template;
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
  const rightMainContent =
    artifactSaveError ? (
      <div className="flex h-full min-h-0 flex-col">
        <div
          role="alert"
          className="shrink-0 border-b border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-700"
        >
          {artifactSaveError}
        </div>
        <div className="min-h-0 flex-1">{editorContent}</div>
      </div>
    ) :
    editorContent ||
    viewerContent ||
    libraryContent;

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
    <section
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white ${className}`}
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,.035)" }}
    >
      <nav
        className="v-scroll shrink-0 overflow-x-auto border-b border-stone-200 bg-stone-50/80 px-2"
        aria-label={tt("工作区")}
      >
        <div className="flex min-w-max items-center">
          {visibleSlots.map((slot) => {
            const isActive = selected === slot;
            return (
              <button
                key={slot}
                type="button"
                onClick={() => select(slot)}
                aria-current={isActive ? "page" : undefined}
                className={`relative h-10 whitespace-nowrap px-3 text-[12px] font-medium transition ${
                  isActive
                    ? "text-stone-900"
                    : "text-stone-400 hover:text-stone-700"
                }`}
              >
                {tt(WORKSPACE_SLOT_LABELS[slot])}
                {isActive && (
                  <span
                    className="absolute inset-x-3 bottom-0 h-0.5 rounded-full"
                    style={{ background: accent }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>
      <div className="min-h-0 flex-1 overflow-hidden">
        {rightMainContent}
      </div>
    </section>
  );
}
