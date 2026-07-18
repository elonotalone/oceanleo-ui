"use client";

import {
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
import type { LibraryItem, LibraryKind } from "./library-data";
import { AdvancedContentWorkbench } from "./AdvancedContentWorkbench";
import { WorkspaceEntryCanvas } from "./WorkspaceEntryCanvas";
import { editorCapabilityFor } from "./workbench-routes";
import {
  advancedRootItemId,
  inlineEditorItemsFromSession,
} from "./advanced-session";
import { useWorkbenchMaterialScope } from "./workbench-material-provider";

interface LiveWorkspaceNodeStore {
  node: ReactNode;
  version: number;
  listeners: Set<() => void>;
}

function createLiveWorkspaceNodeStore(): LiveWorkspaceNodeStore {
  return { node: null, version: 0, listeners: new Set() };
}

function LiveWorkspaceNode({ store }: { store: LiveWorkspaceNodeStore }) {
  useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener);
      return () => store.listeners.delete(listener);
    },
    () => store.version,
    () => store.version,
  );
  return <>{store.node}</>;
}

export interface CanvasTab {
  id: string;
  label: string;
  content: ReactNode;
  /** Normalized payload shared with Materials/My Library rich viewers. */
  libraryItem?: LibraryItem;
  /** Real flat entries for a result tab that produced multiple artifacts. */
  entries?: WorkspaceLibraryEntry[];
  /** Task Preview can remove its receipt without deleting the durable My Library copy. */
  onDelete?: () => Promise<void> | void;
}

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
}

const SLOT_LABELS: Record<WorkspaceSlotId, string> = {
  template: "灵感",
  preview: "生成",
  materials: "素材库",
  mine: "我的库",
  browser: "云端浏览器",
};

function FixedWorkspaceTabs({
  slots,
  selected,
  onSelect,
  accent,
}: {
  slots: WorkspaceSlotId[];
  selected: WorkspaceSlotId;
  onSelect: (slot: WorkspaceSlotId) => void;
  accent: string;
}) {
  const tt = useUI();
  return (
    <nav
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-xl bg-stone-100 p-1"
      aria-label={tt("工作区")}
    >
      {slots.map((slot) => {
        const active = selected === slot;
        return (
          <button
            key={slot}
            type="button"
            onClick={() => onSelect(slot)}
            className={`min-w-fit flex-1 whitespace-nowrap rounded-lg px-2 py-1 text-[12px] font-medium transition-colors ${
              active
                ? "bg-white shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
            style={active ? { color: accent } : undefined}
          >
            {tt(SLOT_LABELS[slot])}
          </button>
        );
      })}
    </nav>
  );
}

const PREVIEW_KIND_HINTS: Array<[RegExp, LibraryKind]> = [
  [
    /(?:(视频|video).*(工作流|workflow|时间线|timeline|剪辑)|(?:工作流|workflow|时间线|timeline|剪辑).*(视频|video))/i,
    "video_canvas",
  ],
  [/(ppt|幻灯|演示)/i, "ppt"],
  [/(excel|表格|sheet)/i, "sheet"],
  [/(网站|网页|website|web)/i, "website"],
  [/(图片|海报|image|poster)/i, "image"],
  [/(音频|音乐|audio|music)/i, "audio"],
  [/(3d|模型)/i, "threed"],
  [/(大纲|成稿|文档|word|document|draft|outline)/i, "document"],
  [/(画布|canvas|组织|节点)/i, "canvas"],
];

function kindForTab(tab: CanvasTab): LibraryKind {
  const text = `${tab.id} ${tab.label}`;
  return PREVIEW_KIND_HINTS.find(([pattern]) => pattern.test(text))?.[1] || "file";
}

function slotForCanvasTab(tab: CanvasTab): WorkspaceSlotId {
  const label = tab.label.trim().toLowerCase();
  if (/灵感|靈感|模板|範本|template|inspiration/.test(label)) return "template";
  if (/素材库|素材庫|materials?/.test(label)) return "materials";
  if (/我的库|我的庫|文件库|檔案庫|my library/.test(label)) return "mine";
  if (/我的.*(?:库|庫|记录|記錄)|作品库|作品庫|项目|項目|历史记录|歷史記錄|会议库|會議庫|闪卡库|閃卡庫/.test(label)) {
    return "mine";
  }
  if (/云端浏览器|雲端瀏覽器|cloud browser/.test(label)) return "browser";
  return workspaceSlotForLegacyId(tab.id);
}

function previewEntry(
  tab: CanvasTab,
  options: { material?: boolean } = {},
): WorkspaceLibraryEntry {
  const kind = tab.libraryItem?.kind || kindForTab(tab);
  const isResult = /^(result|results|preview|artifact)/i.test(tab.id);
  const isWorkflow =
    kind === "video_canvas" || /workflow|工作流|流程/i.test(`${tab.id} ${tab.label}`);
  const title = /^(生成结果|结果)$/i.test(tab.label.trim())
    ? "生成"
    : tab.label || "生成";
  return {
    id: `${options.material ? "workflow" : "preview"}:${tab.id}`,
    title: tab.libraryItem?.title || title,
    description: options.material
      ? "当前应用已有页面 · 可直接打开查看"
      : isResult
        ? "本次任务生成结果"
        : "当前应用已有页面",
    category: options.material
      ? isWorkflow
        ? "应用工作流"
        : "应用页面"
      : isResult
        ? "生成"
        : isWorkflow
          ? "工作流"
          : "应用页面",
    keywords: [
      tab.id,
      tab.label,
      tab.libraryItem?.siteId || "",
      isWorkflow ? "工作流" : "",
    ].filter(Boolean),
    kind,
    thumbUrl: tab.libraryItem?.thumbUrl || tab.libraryItem?.previewUrl,
    libraryItem: tab.libraryItem,
    content: tab.libraryItem ? undefined : tab.content,
    externalUrl: tab.libraryItem?.url || tab.libraryItem?.previewUrl,
    onDelete: tab.onDelete,
  };
}

function isComponentNamed(node: ReactNode, names: string[]): boolean {
  if (!isValidElement(node)) return false;
  const type = node.type as { name?: string; displayName?: string } | string;
  if (typeof type === "string") return false;
  const name = type.displayName || type.name || "";
  return names.includes(name);
}

function isGenericMineTab(tab: CanvasTab): boolean {
  const label = tab.label.trim();
  if (
    /^(?:file|files|file\s*library|library|database|mine|mylib|my\s*library)$/i.test(
      label,
    ) ||
    /^(?:文件库|檔案庫|我的库|我的庫)$/.test(label)
  ) {
    return true;
  }
  if (label) return false;
  return /^(?:file|files|filelibrary|library|database|mine|mylib|my_library)$/i.test(
    tab.id.trim(),
  );
}

function isGenericMaterialsTab(tab: CanvasTab): boolean {
  const label = tab.label.trim();
  if (
    /^(?:material|materials|material\s*library)$/i.test(label) ||
    /^(?:素材|素材库|素材庫)$/.test(label)
  ) {
    return true;
  }
  if (label) return false;
  return /^(?:material|materials|material_library)$/i.test(tab.id.trim());
}

function inspirationLabel(value: string): string {
  return value
    .replaceAll("模板", "灵感")
    .replaceAll("範本", "灵感")
    .replace(/\btemplates?\b/gi, "灵感");
}

function extractedMaterialItems(tab: CanvasTab): MaterialItem[] {
  if (!isValidElement(tab.content)) return [];
  if (tab.content.type !== MaterialLibrary) return [];
  const props = tab.content.props as { materials?: MaterialItem[] };
  return Array.isArray(props.materials) ? props.materials : [];
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
  materials = [],
  onSeeAllMaterials,
  action: externalAction,
  showTemplate = true,
  taskId,
  siteId = "",
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
  const materialSiteId =
    effectiveSiteId || activeCanvasEntry?.libraryItem?.siteId || "oceanleo";
  const materialAppId = workspaceSession?.appId || materialSiteId;
  const workbenchMaterials = useWorkbenchMaterialScope(
    materialSiteId,
    materialAppId,
  );
  const primaryMaterialAction =
    workbenchMaterials.actions.includes("insert")
      ? "insert"
      : workbenchMaterials.actions[0];
  const [savedEditorItems, setSavedEditorItems] = useState<
    Record<string, LibraryItem>
  >({});
  const openCanvasEntry = useCallback(
    (entry: WorkspaceLibraryEntry) => {
      const item = entry.libraryItem;
      if (!item) {
        setActiveCanvasEntry(entry);
        return;
      }
      const saved = savedEditorItems[advancedRootItemId(item)];
      setActiveCanvasEntry(
        saved
          ? {
              ...entry,
              title: saved.title,
              thumbUrl: saved.thumbUrl || saved.previewUrl,
              externalUrl: saved.url || saved.previewUrl,
              libraryItem: saved,
            }
          : entry,
      );
    },
    [savedEditorItems],
  );
  const openCanvasItem = useCallback(
    (item: LibraryItem) =>
      openCanvasEntry(workspaceEntryFromLibraryItem(item)),
    [openCanvasEntry],
  );
  const recordSavedEditorItem = useCallback((item: LibraryItem) => {
    const rootId = advancedRootItemId(item);
    setSavedEditorItems((current) => ({ ...current, [rootId]: item }));
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
  }, []);

  const guideTab: CanvasTab | null = guide
    ? {
        id: "__guide",
        label: "灵感",
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

  const grouped = useMemo(() => {
    const map: Record<WorkspaceSlotId, CanvasTab[]> = {
      template: [],
      preview: [],
      materials: [],
      mine: [],
      browser: [],
    };
    for (const tab of sourceTabs) {
      map[slotForCanvasTab(tab)].push(tab);
    }
    return map;
  }, [sourceTabs]);
  const slotForId = useCallback(
    (id: string) => {
      const tab = sourceTabs.find((entry) => entry.id === id);
      return tab ? slotForCanvasTab(tab) : workspaceSlotForLegacyId(id);
    },
    [sourceTabs],
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
              ? [previewEntry(tab)]
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
      ...grouped.materials.flatMap(extractedMaterialItems),
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
            !isGenericMaterialsTab(tab) &&
            extractedMaterialItems(tab).length === 0 &&
            Boolean(tab.libraryItem),
        )
        .map((tab) => ({
          ...previewEntry(tab, { material: true }),
          id: `material-page:${tab.id}`,
          category: "本站精选",
        })),
    ],
    [grouped.materials],
  );
  const minePageEntries = useMemo(
    () =>
      grouped.mine
        .filter(
          (tab) =>
            !isGenericMineTab(tab) &&
            !isComponentNamed(tab.content, [
              "ArtifactLibrary",
              "FileLibrary",
              "MyLibrary",
            ]),
        )
        .map((tab) => ({
          ...previewEntry(tab),
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
    (id: WorkspaceSlotId) =>
      grouped[id].find((tab) => tab.id !== "__guide")?.id ||
      (id === "template" ? null : id),
    [grouped],
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

  const selectedTemplateTab =
    grouped.template.find((tab) => tab.id === templatePageId) ||
    grouped.template[0] ||
    null;
  const templateContent =
    selectedTemplateTab?.content || (
      <CanvasEmpty
        title="选择一个灵感开始"
        description="当前应用还没有起手灵感；你仍可以直接在左侧描述要完成的目标。"
      />
    );
  const previewPanelTabs = grouped.preview.filter(
    (tab) => !tab.libraryItem && !tab.entries?.length,
  );
  const selectedPreviewTab =
    previewPanelTabs.find((tab) => tab.id === active) ||
    previewPanelTabs.find((tab) =>
      /^(?:result|results|preview|artifact)$/i.test(tab.id),
    ) ||
    previewPanelTabs[0] ||
    null;
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
              label:
                tab.id === "__guide"
                  ? "快速起手"
                  : inspirationLabel(tab.label),
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
        onSeeAll={onSeeAllMaterials}
        onOpenItem={openCanvasItem}
        materialActions={workbenchMaterials.actions}
        onMaterialAction={workbenchMaterials.perform}
        materialActionAvailable={workbenchMaterials.canPerform}
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
      label: tt(SLOT_LABELS.materials),
      content: <LiveWorkspaceNode store={materialLibraryStoreRef.current} />,
    });
    registerLibraryPanel("mine", {
      ownerId,
      id: "workspace-library:mine",
      label: tt(SLOT_LABELS.mine),
      content: <LiveWorkspaceNode store={myLibraryStoreRef.current} />,
    });
    return () => {
      unregisterLibraryPanel("materials", ownerId);
      unregisterLibraryPanel("mine", ownerId);
    };
  }, [registerLibraryPanel, tt, unregisterLibraryPanel]);

  const activeEditorItem =
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
      onClose={() => setActiveCanvasEntry(null)}
    />
  ) : null;
  const viewerContent =
    activeCanvasEntry && !activeEditorItem ? (
      <WorkspaceEntryCanvas
        entry={activeCanvasEntry}
        accent={accent}
        onClose={() => setActiveCanvasEntry(null)}
      />
    ) : null;
  const rightMainContent =
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
                className={`relative h-10 whitespace-nowrap px-3 text-[12px] font-medium transition ${
                  isActive
                    ? "text-stone-900"
                    : "text-stone-400 hover:text-stone-700"
                }`}
              >
                {tt(SLOT_LABELS[slot])}
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

/** Secondary tabs inside a Preview card; kept API-compatible with all sites. */
export function CanvasSubTabs({
  tabs,
  active,
  onChange,
  accent = "#4f46e5",
  right,
  className = "",
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  accent?: string;
  right?: ReactNode;
  className?: string;
}) {
  const tt = useUI();
  return (
    <div className={`mb-3 flex flex-wrap items-center gap-2 ${className}`}>
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              selected
                ? "text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
            style={selected ? { background: accent } : undefined}
          >
            {tt(tab.label)}
          </button>
        );
      })}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

export function CanvasEmpty({
  title = "结果将在这里显示",
  description = "在左侧设置参数并开始后，可在这里查看和下载。",
  hint,
  icon,
}: {
  title?: string;
  description?: string;
  hint?: string;
  icon?: ReactNode;
}) {
  const tt = useUI();
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-8 text-center">
      {icon ?? (
        <svg className="mb-3 h-10 w-10 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9h10M7 13h7M7 17h4" strokeLinecap="round" />
        </svg>
      )}
      <h3 className="text-[13px] font-semibold text-stone-700">{tt(title)}</h3>
      <p className="mt-1.5 max-w-xs text-[11px] leading-relaxed text-stone-400">
        {tt(hint || description)}
      </p>
    </div>
  );
}
