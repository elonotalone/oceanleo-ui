import type { SelectionControl } from "./selection-context";

export const SELECTION_TOOLBAR_MAX_WIDTH = 960;
export const SELECTION_TOOLBAR_GAP = 4;
export const SELECTION_TOOLBAR_MORE_WIDTH = 40;
/**
 * The compact surface is a deliberately small, stable command projection.
 * Width may change how those controls are painted, never which surface owns
 * them. Controls after this cap stay in More at every viewport width.
 */
export const SELECTION_TOOLBAR_MAX_COMPACT_CONTROLS = 6;

export interface SelectionOverflowGroup {
  id: string;
  controls: SelectionControl[];
}

export function selectionControlUsesIconOnly(
  control: SelectionControl,
): boolean {
  if (control.iconOnly !== undefined) return control.iconOnly;
  return Boolean(control.icon);
}

function overflowGroupId(control: SelectionControl): string {
  if (control.danger || control.tone === "danger") return "danger";
  if (control.group) return `group:${control.group}`;
  if (control.inspectorGroup || control.kind === "panel") return "inspectors";
  return "actions";
}

export function groupSelectionOverflowControls(
  controls: readonly SelectionControl[],
): SelectionOverflowGroup[] {
  const groups = new Map<string, SelectionOverflowGroup>();
  for (const control of controls) {
    const id = overflowGroupId(control);
    const group = groups.get(id) || { id, controls: [] };
    group.controls.push(control);
    groups.set(id, group);
  }
  return [...groups.values()];
}

export function estimatedSelectionControlWidth(
  control: SelectionControl,
): number {
  if (selectionControlUsesIconOnly(control)) {
    if (control.kind === "number") return 92;
    if (control.kind === "select") return 104;
    return 36;
  }
  if (control.kind === "range") return 210;
  if (control.kind === "text") return 180;
  if (control.kind === "number") return 108;
  if (control.kind === "select") return 132;
  if (control.kind === "panel") {
    return Math.max(44, Math.min(124, 28 + control.label.length * 12));
  }
  return control.label ? Math.max(40, Math.min(112, 24 + control.label.length * 12)) : 40;
}

export function partitionSelectionControls(
  controls: readonly SelectionControl[],
  measuredWidths: ReadonlyMap<string, number>,
  availableWidth: number,
): {
  visible: SelectionControl[];
  overflow: SelectionControl[];
} {
  // Retain the arguments while old callers migrate; v8 intentionally ignores
  // geometry so 320px and 1920px project the same command surfaces.
  void measuredWidths;
  void availableWidth;

  const visible: SelectionControl[] = [];
  const overflow: SelectionControl[] = [];
  for (const control of controls) {
    // These controls have dedicated semantic surfaces and must never leak into
    // either the compact row or its More projection.
    if (
      control.slot === "context-menu" ||
      control.slot === "stage" ||
      control.slot === "inspector" ||
      control.placement === "tools"
    ) {
      continue;
    }
    if (
      control.placement === "more" ||
      visible.length >= SELECTION_TOOLBAR_MAX_COMPACT_CONTROLS
    ) {
      overflow.push(control);
      continue;
    }
    visible.push(control);
  }
  return { visible, overflow };
}
