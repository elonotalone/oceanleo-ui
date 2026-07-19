import type {
  SelectionControl,
  SelectionControlSemantic,
} from "./selection-context";

/**
 * The bar is intrinsically sized. This is only a viewport safety boundary,
 * never a preferred/fixed toolbar width.
 */
export const SELECTION_TOOLBAR_VIEWPORT_MAX =
  "calc(100dvw - max(1rem, env(safe-area-inset-left)) - max(1rem, env(safe-area-inset-right)))";

export const DESIGN_TEXT_CONTROL_ORDER: readonly SelectionControlSemantic[] = [
  "font-size",
  "color",
  "bold",
  "italic",
  "underline",
  "strike",
  "case",
  "alignment",
  "spacing",
  "vertical-text",
  "opacity",
  "effects",
  "animation",
  "position",
] as const;

const DESIGN_TEXT_CONTROL_RANK = new Map(
  DESIGN_TEXT_CONTROL_ORDER.map((semantic, index) => [semantic, index]),
);

const CONTROL_ID_SEMANTICS: Readonly<Record<string, SelectionControlSemantic>> = {
  "font-size": "font-size",
  color: "color",
  "text-color": "color",
  "font-color": "color",
  fill: "color",
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strike: "strike",
  strikethrough: "strike",
  case: "case",
  "text-case": "case",
  align: "alignment",
  alignment: "alignment",
  "text-align": "alignment",
  spacing: "spacing",
  "letter-spacing": "spacing",
  "char-spacing": "spacing",
  "line-spacing": "spacing",
  "line-height": "spacing",
  "text-anchor": "spacing",
  "vertical-align": "spacing",
  "vertical-text": "vertical-text",
  "writing-mode": "vertical-text",
  opacity: "opacity",
  effects: "effects",
  effect: "effects",
  animation: "animation",
  "animation-gallery": "animation",
  position: "position",
  layers: "position",
  arrange: "position",
};

export function selectionControlSemantic(
  control: Pick<SelectionControl, "id" | "semantic">,
): SelectionControlSemantic | undefined {
  return control.semantic || CONTROL_ID_SEMANTICS[control.id.toLowerCase()];
}

export function orderDesignTextControls(
  controls: readonly SelectionControl[],
): SelectionControl[] {
  return controls
    .map((control, index) => ({ control, index }))
    .sort((left, right) => {
      const leftSemantic = selectionControlSemantic(left.control);
      const rightSemantic = selectionControlSemantic(right.control);
      const leftRank = leftSemantic
        ? DESIGN_TEXT_CONTROL_RANK.get(leftSemantic)
        : undefined;
      const rightRank = rightSemantic
        ? DESIGN_TEXT_CONTROL_RANK.get(rightSemantic)
        : undefined;
      const normalizedLeft = leftRank ?? DESIGN_TEXT_CONTROL_ORDER.length;
      const normalizedRight = rightRank ?? DESIGN_TEXT_CONTROL_ORDER.length;
      return normalizedLeft - normalizedRight || left.index - right.index;
    })
    .map(({ control }) => control);
}

export const TEXT_ALIGNMENT_CYCLE = [
  "left",
  "center",
  "right",
  "justify",
] as const;

export type TextAlignment = (typeof TEXT_ALIGNMENT_CYCLE)[number];

export function nextTextAlignment(current: unknown): TextAlignment {
  const index = TEXT_ALIGNMENT_CYCLE.indexOf(current as TextAlignment);
  return index < 0
    ? TEXT_ALIGNMENT_CYCLE[0]
    : TEXT_ALIGNMENT_CYCLE[(index + 1) % TEXT_ALIGNMENT_CYCLE.length];
}

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
  // Geometry may only change wrapping/scrolling. It must never move commands
  // between semantic surfaces.
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
    if (control.placement === "more") {
      overflow.push(control);
      continue;
    }
    visible.push(control);
  }
  return { visible, overflow };
}
