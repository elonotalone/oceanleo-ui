"use client";

// 素材库从「浮在画布右上角的 aside」搬进统一外壳的左侧面板。
//
// 原先它是 absolute 定位、宽到 42rem、盖在画布上，关掉要点自己那个 ×；
// 其余 12 件插件的素材库都在左栏、由 edit bar 按钮开合。同一个东西两种开法，
// 用户切插件时要重学一遍，这正是这轮统一要消掉的。

import { useEffect } from "react";
import { WorkspaceLibrary } from "../../WorkspaceLibrary";
import { useWorkbenchMaterials } from "../../workbench-material-provider";
import { usePluginChromePanelHost } from "../../plugin-chrome";

export const CANVAS_MATERIAL_PANEL_ID = "materials";

export function CanvasMaterialPanel({ accent }: { accent: string }) {
  const materials = useWorkbenchMaterials();
  return (
    <WorkspaceLibrary
      entries={[...(materials?.entries || [])]}
      siteId="video"
      appId={materials?.appId}
      accent={accent}
      materialActions={materials?.actions || []}
      onMaterialAction={
        materials
          ? (action, item) => materials.perform(action, item, { source: "click" })
          : undefined
      }
      materialActionAvailable={materials?.canPerform}
      materialActionEvidence={materials?.availability}
      draggableMaterials={Boolean(materials)}
      onMaterialDragStart={materials?.beginMaterialDrag}
      onMaterialDragEnd={materials?.endMaterialDrag}
      emptyTitle="没有登记在册的素材来源"
      emptyDescription="这个画布上下文在共享素材登记表里还没有持久条目。上传仍然可用。"
      className="min-h-0 flex-1"
    />
  );
}

/**
 * 画布命令（`canvas.material.library.open` 一类）与面板控制器之间的桥。
 *
 * 面板开合状态归 PluginChromeFrame 管，而画布那边仍然会从命令通道要求打开
 * 素材库。两边各持一份 boolean 必然会对不上（用户从左栏关掉、命令那边仍以为
 * 开着，下次命令就成了空操作），所以这里让画布那份只作为**请求**：它一变真，
 * 就把面板打开，然后立刻销掉请求位。真正的开合以面板控制器为准。
 */
export function CanvasMaterialPanelBridge({
  requestOpen,
  onRequestHandled,
}: {
  requestOpen: boolean;
  onRequestHandled: () => void;
}) {
  const { openPanel } = usePluginChromePanelHost();
  useEffect(() => {
    if (!requestOpen) return;
    openPanel(CANVAS_MATERIAL_PANEL_ID);
    onRequestHandled();
  }, [requestOpen, openPanel, onRequestHandled]);
  return null;
}
