import type { WorkbenchIconName } from "../AdvancedEditorIcon";
import { actionGroup, type AdvancedWorkbenchAction } from "../advanced-workbench-chrome";
import { creationToolForIcon, type AdvancedEditorCreationTool } from "../creation-tools";

export interface EditBarDrawerButton {
  id: string;
  label: string;
  icon: WorkbenchIconName;
}

/** Document actions and drawers are data in the one measured toolbar. */
export function editBarDocumentTools({ actions = [], drawers = [], activeDrawerId = "", onToggleDrawer }: {
  actions?: readonly AdvancedWorkbenchAction[];
  drawers?: readonly EditBarDrawerButton[];
  activeDrawerId?: string;
  onToggleDrawer?: (id: string, anchor?: HTMLElement) => void;
}): AdvancedEditorCreationTool[] {
  return [
    ...drawers.map((drawer): AdvancedEditorCreationTool => ({
      id: `creation:drawer:${drawer.id}`, tool: creationToolForIcon(drawer.icon), label: drawer.label,
      panelId: drawer.id,
      value: drawer.id === activeDrawerId, execute: (anchor) => onToggleDrawer?.(drawer.id, anchor),
    })),
    ...actions.filter((action) => actionGroup(action) === "edit").map((action): AdvancedEditorCreationTool => ({
      id: action.id, tool: creationToolForIcon(action.icon),
      label: action.busy && action.busyLabel ? action.busyLabel : action.label,
      disabled: action.disabled || action.busy,
      ...(action.panelId ? { panelId: action.panelId } : { execute: () => { void action.onTrigger?.(); } }),
      ...(action.variant === "primary" ? { value: true } : {}),
    })),
  ];
}
