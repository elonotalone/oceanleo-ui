"use client";

// 左侧面板的开合与投递，从 InlineAdvancedWorkbenchShell 里拆出来的一整块。
//
// 拆的理由不是行数，是**这块有自己的完整故事**：编辑栏里的按钮点下去 →
// 决定要开哪个抽屉 → 内容投到工作区窗格（或没有窗格时的本地兜底）→ 换主题作用域。
// 壳里剩下的部分讲的是另一个故事（生命周期、保存、关闭、拖放）。
// 两个故事挤在一个文件里时，谁改都得先读六百行。
//
// 面板内容走 LiveReactNode 而不是直接塞进 showDetail：抽屉内容每帧都可能变
// （比如 agent 面板在流式输出），而 showDetail 会把节点存进工作区的 state，
// 直接塞进去意味着每一帧都要惊动整棵工作区树。
//
// agent 抽屉：拿得到 ConsoleAgentFocus handler 就切左栏形态，绝不推 detail；
// 拿不到才挂 PluginAgentPanel（独立页 / gallery 兜底）。

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import { Button } from "../ui/Button";
import type { AdvancedEditorAdapter } from "./advanced-editor-adapter";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { InlineEditorMaterialPanel } from "./InlineEditorMaterialPanel";
import {
  resolveActiveMaterialAction,
  resolveEditBarDrawers,
  resolveInlineAdvancedDrawers,
} from "./inline-advanced-shell-helpers";
import type { LibraryItem } from "./library-data";
import {
  createLiveReactNodeStore,
  LiveReactNode,
  publishLiveReactNode,
} from "./live-react-node";
import { PLUGIN_AGENT_DRAWER_ID } from "./plugin-chrome/agent-drawer";
import { PluginAgentPanel } from "./plugin-chrome/PluginAgentPanel";
import { useConsoleAgentFocus } from "./SplitWorkspace";
import { AGENT_CONVERSATION_HOST_STRETCH_CLASS } from "./agent-conversation-layout";
import { PluginThemeScope, type PluginThemeId } from "./plugin-theme";
import type {
  WorkbenchMaterialAction,
  WorkbenchMaterialContextValue,
} from "./workbench-material-provider";

interface WorkspaceDetailRequest {
  ownerId: string;
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export interface InlineAdvancedPanelsInput {
  adapter: AdvancedEditorAdapter;
  item: LibraryItem;
  taskId?: string | null;
  siteId: string;
  accent: string;
  ownerId: string;
  pluginThemeId: PluginThemeId | null;
  workbenchMaterials: WorkbenchMaterialContextValue | null;
  showWorkspaceDetail?: (detail: WorkspaceDetailRequest) => void;
  clearWorkspaceDetail?: (ownerId: string) => void;
  /**
   * 宿主把左栏整块收着（`/library?item=` 单开一份文件时 agent 隐藏）。这时面板不进那块
   * 看不见的左栏，改走壳自己的 aside（10-23 W02 根因）。
   */
  workspaceLeftHidden?: boolean;
  /** 工作区此刻显示的、属于本壳的面板 id；被别处清掉时本地开合状态跟着归零。 */
  ownedWorkspaceDetailId?: string | null;
  /**
   * 规范 v2 §2：上传住在素材库抽屉第一项，不再进编辑栏。宿主把隐藏的
   * `<input type=file>` 的 click 接到这里；`adapter.upload` 缺席时不给这一项。
   */
  onLocalUpload?: () => void;
}

export function useInlineAdvancedPanels({
  adapter,
  item,
  taskId,
  siteId,
  accent,
  ownerId,
  pluginThemeId,
  workbenchMaterials,
  showWorkspaceDetail,
  clearWorkspaceDetail,
  workspaceLeftHidden = false,
  ownedWorkspaceDetailId = null,
  onLocalUpload,
}: InlineAdvancedPanelsInput) {
  const workspaceShow = workspaceLeftHidden ? undefined : showWorkspaceDetail;
  const tt = useUI();
  const consoleAgentFocus = useConsoleAgentFocus();
  const liveDetailStoreRef = useRef(createLiveReactNodeStore());
  const [fallbackDetail, setFallbackDetail] = useState<{
    label: ReactNode;
    content: ReactNode;
  } | null>(null);
  const [activeDrawerId, setActiveDrawerId] = useState("");
  const [transientPanel, setTransientPanel] = useState<{
    id: string;
    label: ReactNode;
  } | null>(null);
  const transientPanelRef = useRef(transientPanel);
  transientPanelRef.current = transientPanel;
  const [requestedMaterialAction, setRequestedMaterialAction] =
    useState<WorkbenchMaterialAction>();

  const drawers = useMemo(() => {
    const base = resolveInlineAdvancedDrawers(adapter);
    // agent 抽屉由壳统一提供，插件不再各自实现一份 AI 面板。
    // 改造前只有 deck 一个插件注册过 "agent"，其余 12 个没有任何 AI 入口，
    // 各写各的正是代码漂移的起点。插件仍可自带同 id 的抽屉来覆盖。
    if (base.some((drawer) => drawer.id === PLUGIN_AGENT_DRAWER_ID)) return base;
    return [
      ...base,
      {
        id: PLUGIN_AGENT_DRAWER_ID,
        label: tt("AI 助手"),
        icon: "agent" as const,
        content: (
          <PluginAgentPanel
            editorId={adapter.id}
            siteId={siteId}
            accent={accent}
            label={tt("AI 助手")}
          />
        ),
      },
    ];
  }, [adapter, siteId, accent, tt]);
  // D3：编辑栏空态的带文字抽屉按钮（AI 除外，右端 AI 键保留）。
  const editBarDrawers = useMemo(() => {
    const shown = new Set(
      resolveEditBarDrawers(adapter.id, drawers).map((entry) => entry.id),
    );
    return drawers
      .map((drawer) => ({ id: drawer.id, label: drawer.label, icon: drawer.icon }))
      .filter((drawer) => shown.has(drawer.id));
  }, [adapter.id, drawers]);
  const drawerById = useMemo(
    () => new Map(drawers.map((drawer) => [drawer.id, drawer])),
    [drawers],
  );
  const activeMaterialAction = resolveActiveMaterialAction(
    requestedMaterialAction,
    workbenchMaterials?.actions,
  );

  const panelFor = useCallback(
    (drawerId: string, materialAction?: WorkbenchMaterialAction) => {
      const drawer = drawerById.get(drawerId);
      if (drawer) {
        return { label: tt(drawer.label), content: drawer.content };
      }
      const canUploadLocal = Boolean(adapter.upload && onLocalUpload);
      return {
        label: tt(drawerId === "materials" ? "素材" : adapter.label),
        content:
          drawerId === "materials" ? (
            <div className="flex h-full min-h-0 flex-col">
              {canUploadLocal ? (
                // 抽屉第一项永远是「从本地上传」（规范 v2 §2）。
                <div className="shrink-0 border-b border-[var(--awb-border,var(--border,#e7e5e4))] p-2">
                  <Button
                    variant="secondary"
                    block
                    align="start"
                    data-workspace-local-upload
                    onClick={onLocalUpload}
                    title={tt("从本地添加到画布，也可以直接拖放文件")}
                  >
                    <AdvancedEditorIcon name="uploads" className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {tt("从本地上传")}
                    </span>
                  </Button>
                </div>
              ) : null}
              <div className="min-h-0 flex-1">
                <InlineEditorMaterialPanel
                  item={item}
                  taskId={taskId}
                  siteId={siteId}
                  accent={accent}
                  materials={workbenchMaterials}
                  primaryMaterialAction={materialAction || activeMaterialAction}
                />
              </div>
            </div>
          ) : null,
      };
    },
    [
      accent,
      activeMaterialAction,
      adapter.label,
      adapter.upload,
      drawerById,
      item,
      onLocalUpload,
      siteId,
      taskId,
      tt,
      workbenchMaterials,
    ],
  );
  const liveDrawerDetail = useMemo(
    () =>
      !transientPanel && activeDrawerId
        ? panelFor(activeDrawerId, requestedMaterialAction)
        : null,
    [activeDrawerId, panelFor, requestedMaterialAction, transientPanel],
  );
  useLayoutEffect(() => {
    // Keep the last detail subtree available while InlineAdvancedWorkbenchShell
    // animates its fallback pane closed. The next open publishes its new node;
    // clearing here would blank the panel before its 300ms exit finishes.
    if (transientPanel || !liveDrawerDetail) return;
    publishLiveReactNode(
      liveDetailStoreRef.current,
      liveDrawerDetail.content,
    );
  }, [liveDrawerDetail?.content, transientPanel]);

  // 抽屉/工具面板经 showWorkspaceDetail 传送到工作区窗格，DOM 在插件根之外，
  // 必须重建插件主题作用域，token 才能盖过站点 html.dark 的翻转。
  const liveDetailNode = useMemo(
    () =>
      pluginThemeId ? (
        <PluginThemeScope
          pluginId={pluginThemeId}
          className={`h-full min-h-0 ${AGENT_CONVERSATION_HOST_STRETCH_CLASS}`}
        >
          <LiveReactNode store={liveDetailStoreRef.current} />
        </PluginThemeScope>
      ) : (
        <div
          className={`h-full min-h-0 ${AGENT_CONVERSATION_HOST_STRETCH_CLASS}`}
        >
          <LiveReactNode store={liveDetailStoreRef.current} />
        </div>
      ),
    [pluginThemeId],
  );

  const closeDetail = useCallback(() => {
    clearWorkspaceDetail?.(ownerId);
    setFallbackDetail(null);
    setActiveDrawerId("");
    transientPanelRef.current = null;
    setTransientPanel(null);
    setRequestedMaterialAction(undefined);
  }, [clearWorkspaceDetail, ownerId]);

  const closeDrawer = useCallback(() => {
    // The standalone Library host opts into a closeable conversation. Its
    // visible agent is an edit-bar state, not a second local drawer to clear.
    if (
      activeDrawerId === "" &&
      !fallbackDetail &&
      !transientPanelRef.current &&
      consoleAgentFocus?.agentVisible === true
    ) {
      consoleAgentFocus.hideAgent();
    }
    closeDetail();
  }, [activeDrawerId, closeDetail, consoleAgentFocus, fallbackDetail]);

  const openDrawer = useCallback(
    (drawerId: string, materialAction?: WorkbenchMaterialAction) => {
      // 左栏已经挂着可切形态的操控台时，AI 键只切那一份，不再推第二棵 agent 树。
      // 判定是「此刻有没有 handler」，不是某个 featureId。
      if (drawerId === PLUGIN_AGENT_DRAWER_ID && consoleAgentFocus) {
        // A selected Assets/tool detail replaces the Agent body in the shared
        // left island. Returning to Agent must reveal that same conversation.
        closeDetail();
        if (consoleAgentFocus.focusAgent()) return;
      }
      transientPanelRef.current = null;
      setTransientPanel(null);
      setActiveDrawerId(drawerId);
      setRequestedMaterialAction(
        drawerId === "materials" ? materialAction : undefined,
      );
      const next = panelFor(drawerId, materialAction);
      publishLiveReactNode(liveDetailStoreRef.current, next.content);
      if (workspaceShow) {
        workspaceShow({
          ownerId,
          id: drawerId,
          label: next.label,
          content: liveDetailNode,
        });
      } else {
        setFallbackDetail({ label: next.label, content: liveDetailNode });
      }
    },
    [closeDetail, consoleAgentFocus, liveDetailNode, ownerId, panelFor, workspaceShow],
  );

  const openTransientPanel = useCallback(
    (panelId: string, label: ReactNode, content: ReactNode) => {
      const panel = { id: panelId, label };
      transientPanelRef.current = panel;
      setTransientPanel(panel);
      setActiveDrawerId(panelId);
      setRequestedMaterialAction(undefined);
      publishLiveReactNode(liveDetailStoreRef.current, content);
      if (workspaceShow) {
        workspaceShow({
          ownerId,
          id: panelId,
          label,
          content: liveDetailNode,
        });
      } else {
        setFallbackDetail({ label, content: liveDetailNode });
      }
    },
    [liveDetailNode, ownerId, workspaceShow],
  );

  const updateTransientPanel = useCallback(
    (panelId: string, content: ReactNode) => {
      if (transientPanelRef.current?.id !== panelId) return;
      publishLiveReactNode(liveDetailStoreRef.current, content);
    },
    [],
  );

  // 工作区把我们的面板换掉/清掉（左栏「←」、别的面板顶替）时，本地状态跟着归零，
  // 否则顶栏按钮还亮着，下一次点击会去「收起」一个已经不在的面板——看起来就是死按钮。
  const placedInWorkspace = Boolean(workspaceShow);
  useEffect(() => {
    if (!placedInWorkspace || !activeDrawerId) return;
    if (ownedWorkspaceDetailId === activeDrawerId) return;
    transientPanelRef.current = null;
    setTransientPanel(null);
    setActiveDrawerId("");
    setRequestedMaterialAction(undefined);
  }, [activeDrawerId, ownedWorkspaceDetailId, placedInWorkspace]);
  const isPanelOpen = useCallback(
    (panelId: string) =>
      activeDrawerId === panelId &&
      (placedInWorkspace
        ? ownedWorkspaceDetailId === panelId
        : Boolean(fallbackDetail)),
    [activeDrawerId, fallbackDetail, ownedWorkspaceDetailId, placedInWorkspace],
  );

  return {
    drawers,
    editBarDrawers,
    isPanelOpen,
    placedInWorkspace,
    activeMaterialAction,
    transientPanel,
    fallbackDetail,
    openDrawer,
    openTransientPanel,
    updateTransientPanel,
    closeDetail,
    closeDrawer,
    activeDrawerId:
      activeDrawerId ||
      (consoleAgentFocus?.agentVisible === true ? PLUGIN_AGENT_DRAWER_ID : ""),
  };
}
