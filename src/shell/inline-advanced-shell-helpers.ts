import type {
  AdvancedEditorAdapter,
  AdvancedWorkbenchDrawer,
} from "./advanced-editor-adapter";
import type { LibraryItem } from "./library-data";
import { PLUGIN_AGENT_DRAWER_ID } from "./plugin-chrome/agent-drawer";
import {
  WORKBENCH_MATERIAL_MIME,
  type WorkbenchMaterialAction,
  type WorkbenchMaterialContextValue,
} from "./workbench-material-provider";

const PREFERRED_MATERIAL_ACTIONS = [
  "insert",
  "apply",
  "replace",
  "merge",
] as const satisfies readonly WorkbenchMaterialAction[];

export function resolveInlineAdvancedDrawers(
  adapter: AdvancedEditorAdapter,
): AdvancedWorkbenchDrawer[] {
  if (adapter.drawers?.length) return [...adapter.drawers];
  if (!adapter.toolbox?.content) return [];
  return [
    {
      id: "editor-global",
      label: adapter.toolbox.label,
      icon: adapter.toolbox.icon,
      content: adapter.toolbox.content,
    },
  ];
}

/**
 * D3（操作员 2026-10-23）：没选中任何东西时，编辑栏显示的带文字抽屉按钮。
 * 列在这里的编辑器只显示这几项（按 adapter 声明顺序）；没列的编辑器显示它申报的
 * 全部抽屉（`drawers`，或由 `toolbox` 合成的那一项）。AI 一律不在这里出现。
 * 其余抽屉（字体、图片调整、效果……）是选区控件的面板目标，不是空态入口。
 */
export const EDIT_BAR_EMPTY_STATE_DRAWERS: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  deck: ["deck-design", "deck-elements", "deck-draw", "deck-lines", "deck-notes"],
  image: ["image-brush", "image-shapes", "image-lines", "image-notes"],
});

export function resolveEditBarDrawers(
  adapterId: string,
  drawers: readonly AdvancedWorkbenchDrawer[],
): AdvancedWorkbenchDrawer[] {
  const allow = EDIT_BAR_EMPTY_STATE_DRAWERS[adapterId.split("@")[0]];
  return drawers.filter(
    (drawer) =>
      drawer.id !== PLUGIN_AGENT_DRAWER_ID &&
      drawer.id !== "materials" &&
      drawer.id !== "mine" &&
      (!allow || allow.includes(drawer.id)),
  );
}

export function resolveActiveMaterialAction(
  requested: WorkbenchMaterialAction | undefined,
  actions: readonly WorkbenchMaterialAction[] | undefined,
): WorkbenchMaterialAction | undefined {
  const preferred = PREFERRED_MATERIAL_ACTIONS.find((action) =>
    actions?.includes(action),
  );
  if (requested && actions?.includes(requested)) return requested;
  return preferred;
}

export function resolveDroppedWorkbenchMaterial(
  dataTransfer: DataTransfer,
  workbenchMaterials: Pick<
    WorkbenchMaterialContextValue,
    "draggedItem" | "entries"
  >,
): LibraryItem | null {
  let material = workbenchMaterials.draggedItem;
  if (material) return material;
  try {
    const payload = JSON.parse(
      dataTransfer.getData(WORKBENCH_MATERIAL_MIME) || "{}",
    ) as { id?: string };
    return (
      workbenchMaterials.entries.find(
        (entry) =>
          entry.id === payload.id ||
          entry.libraryItem?.key === payload.id ||
          entry.libraryItem?.url === payload.id,
      )?.libraryItem || null
    );
  } catch {
    return null;
  }
}
