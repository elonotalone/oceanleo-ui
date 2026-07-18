import type { SelectionControl } from "./selection-context";

export const SELECTION_TOOLBAR_MAX_WIDTH = 960;
export const SELECTION_TOOLBAR_GAP = 4;
export const SELECTION_TOOLBAR_MORE_WIDTH = 40;

export function estimatedSelectionControlWidth(
  control: SelectionControl,
): number {
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
  if (!controls.length) return { visible: [], overflow: [] };
  const widths = controls.map((control) =>
    Math.max(
      32,
      measuredWidths.get(control.id) ||
        estimatedSelectionControlWidth(control),
    ),
  );
  const total =
    widths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, controls.length - 1) * SELECTION_TOOLBAR_GAP;
  if (total <= availableWidth) {
    return { visible: [...controls], overflow: [] };
  }

  const visibleIndexes = new Set(controls.map((_, index) => index));
  const removalOrder = controls
    .map((control, index) => ({
      index,
      priority:
        control.placement === "more"
          ? 0
          : control.placement === "tools"
            ? 1
            : 2,
    }))
    .sort((left, right) =>
      left.priority === right.priority
        ? right.index - left.index
        : left.priority - right.priority,
    );
  const budget = Math.max(0, availableWidth - SELECTION_TOOLBAR_MORE_WIDTH);
  let used = total;
  for (const candidate of removalOrder) {
    if (used <= budget) break;
    visibleIndexes.delete(candidate.index);
    used -= widths[candidate.index] + SELECTION_TOOLBAR_GAP;
  }

  return controls.reduce(
    (result, control, index) => {
      result[visibleIndexes.has(index) ? "visible" : "overflow"].push(control);
      return result;
    },
    { visible: [], overflow: [] } as {
      visible: SelectionControl[];
      overflow: SelectionControl[];
    },
  );
}
