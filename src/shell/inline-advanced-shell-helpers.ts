import type {
  AdvancedEditorAdapter,
  AdvancedWorkbenchDrawer,
} from "./advanced-editor-adapter";
import type { LibraryItem } from "./library-data";
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
