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

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import type { AdvancedEditorAdapter } from "./advanced-editor-adapter";
import { InlineEditorMaterialPanel } from "./InlineEditorMaterialPanel";
import {
  resolveActiveMaterialAction,
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
}: InlineAdvancedPanelsInput) {
  const tt = useUI();
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
      return {
        label: tt(drawerId === "materials" ? "素材" : adapter.label),
        content:
          drawerId === "materials" ? (
            <InlineEditorMaterialPanel
              item={item}
              taskId={taskId}
              siteId={siteId}
              accent={accent}
              materials={workbenchMaterials}
              primaryMaterialAction={materialAction || activeMaterialAction}
            />
          ) : null,
      };
    },
    [
      accent,
      activeMaterialAction,
      adapter.label,
      drawerById,
      item,
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
    if (transientPanel) return;
    publishLiveReactNode(
      liveDetailStoreRef.current,
      liveDrawerDetail?.content || null,
    );
  }, [liveDrawerDetail?.content, transientPanel]);

  // 抽屉/工具面板经 showWorkspaceDetail 传送到工作区窗格，DOM 在插件根之外，
  // 必须重建插件主题作用域，token 才能盖过站点 html.dark 的翻转。
  const liveDetailNode = useMemo(
    () =>
      pluginThemeId ? (
        <PluginThemeScope pluginId={pluginThemeId}>
          <LiveReactNode store={liveDetailStoreRef.current} />
        </PluginThemeScope>
      ) : (
        <LiveReactNode store={liveDetailStoreRef.current} />
      ),
    [pluginThemeId],
  );

  const openDrawer = useCallback(
    (drawerId: string, materialAction?: WorkbenchMaterialAction) => {
      transientPanelRef.current = null;
      setTransientPanel(null);
      setActiveDrawerId(drawerId);
      setRequestedMaterialAction(
        drawerId === "materials" ? materialAction : undefined,
      );
      const next = panelFor(drawerId, materialAction);
      publishLiveReactNode(liveDetailStoreRef.current, next.content);
      if (showWorkspaceDetail) {
        showWorkspaceDetail({
          ownerId,
          id: drawerId,
          label: next.label,
          content: liveDetailNode,
        });
      } else {
        setFallbackDetail({ label: next.label, content: liveDetailNode });
      }
    },
    [liveDetailNode, ownerId, panelFor, showWorkspaceDetail],
  );

  const openTransientPanel = useCallback(
    (panelId: string, label: ReactNode, content: ReactNode) => {
      const panel = { id: panelId, label };
      transientPanelRef.current = panel;
      setTransientPanel(panel);
      setActiveDrawerId(panelId);
      setRequestedMaterialAction(undefined);
      publishLiveReactNode(liveDetailStoreRef.current, content);
      if (showWorkspaceDetail) {
        showWorkspaceDetail({
          ownerId,
          id: panelId,
          label,
          content: liveDetailNode,
        });
      } else {
        setFallbackDetail({ label, content: liveDetailNode });
      }
    },
    [liveDetailNode, ownerId, showWorkspaceDetail],
  );

  const updateTransientPanel = useCallback(
    (panelId: string, content: ReactNode) => {
      if (transientPanelRef.current?.id !== panelId) return;
      publishLiveReactNode(liveDetailStoreRef.current, content);
    },
    [],
  );

  const closeDetail = useCallback(() => {
    clearWorkspaceDetail?.(ownerId);
    setFallbackDetail(null);
    setActiveDrawerId("");
    transientPanelRef.current = null;
    setTransientPanel(null);
    setRequestedMaterialAction(undefined);
    publishLiveReactNode(liveDetailStoreRef.current, null);
  }, [clearWorkspaceDetail, ownerId]);

  return {
    drawers,
    activeDrawerId,
    activeMaterialAction,
    transientPanel,
    fallbackDetail,
    openDrawer,
    openTransientPanel,
    updateTransientPanel,
    closeDetail,
  };
}
