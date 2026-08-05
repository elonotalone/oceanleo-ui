import type {
  AdvancedEditorAdapter,
  AdvancedWorkbenchDrawer,
} from "./advanced-editor-adapter";
import type { AdvancedFlushResult } from "./advanced-session-context";
import type { AdvancedAutoSaveState } from "./use-advanced-autosave";
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

/**
 * 关闭之前把还没同步的改动冲刷出去，并给出一个能读的结论。
 *
 * 等待有上限：冲刷本身可能卡在网络上，而关闭动作不能跟着一起挂起——超时就按
 * 「没同步成功」返回，由调用方去问用户还走不走。自动保存本来就已经是错误态时
 * 不必再试一次，直接报那个错。
 */
export function flushAdvancedWorkBeforeLeave(
  autoSave: {
    state: AdvancedAutoSaveState;
    flushLatest: () => Promise<AdvancedFlushResult>;
  },
  timeoutMs = 3_000,
): Promise<AdvancedFlushResult> {
  if (autoSave.state === "error") {
    return Promise.resolve({ ok: false, error: "自动保存仍未同步" });
  }
  return Promise.race([
    autoSave.flushLatest(),
    new Promise<AdvancedFlushResult>((resolve) =>
      setTimeout(
        () => resolve({ ok: false, error: "离开前保存等待超时" }),
        timeoutMs,
      ),
    ),
  ]);
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
