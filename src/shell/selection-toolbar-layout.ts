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

/** Matches the compact row's `gap-1` spacing. */
export const SELECTION_TOOLBAR_CONTROL_GAP = 4;

/** Matches the More launcher's `h-11 w-11` hit target. */
export const SELECTION_TOOLBAR_MORE_BUTTON_WIDTH = 44;

/**
 * Fractional ResizeObserver values can differ by a sub-pixel across layout
 * passes. A half CSS pixel cannot make a control visibly fit, so tolerate it
 * at the exact boundary instead of flipping the More projection repeatedly.
 */
const SELECTION_TOOLBAR_FIT_EPSILON = 0.5;

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

/**
 * Live selection kinds that must remain reachable through More under real
 * measured widths. Site adapters project these kinds into SelectionToolbar;
 * the shared chrome owns overflow discoverability.
 */
export interface SelectionLiveCapability {
  id: string;
  label: string;
}

const LIVE_CAPABILITY_BY_PREFIX: ReadonlyArray<{
  prefix: string;
  capability: SelectionLiveCapability;
}> = [
  { prefix: "grid", capability: { id: "grid", label: "表格" } },
  { prefix: "chart", capability: { id: "chart", label: "图表" } },
  { prefix: "design", capability: { id: "design", label: "设计" } },
  { prefix: "deck", capability: { id: "deck", label: "幻灯片" } },
  { prefix: "rich-doc", capability: { id: "rich-doc", label: "文档" } },
  { prefix: "doc", capability: { id: "doc", label: "文档" } },
  { prefix: "video", capability: { id: "video", label: "视频" } },
  { prefix: "image", capability: { id: "image", label: "图片" } },
  { prefix: "audio", capability: { id: "audio", label: "音频" } },
  { prefix: "pdf", capability: { id: "pdf", label: "PDF" } },
  { prefix: "model", capability: { id: "model", label: "模型" } },
];

export function selectionLiveCapability(
  kind: string | null | undefined,
): SelectionLiveCapability | null {
  if (!kind) return null;
  const normalized = kind.trim().toLowerCase();
  if (!normalized) return null;
  for (const entry of LIVE_CAPABILITY_BY_PREFIX) {
    if (
      normalized === entry.prefix ||
      normalized.startsWith(`${entry.prefix}-`) ||
      normalized.startsWith(`${entry.prefix}_`)
    ) {
      return entry.capability;
    }
  }
  return null;
}

export function selectionMoreDialogLabel(
  kind: string | null | undefined,
): string {
  const capability = selectionLiveCapability(kind);
  return capability ? `更多属性 · ${capability.label}` : "更多属性";
}

export function estimatedSelectionControlWidth(
  control: SelectionControl,
): number {
  if (selectionControlUsesIconOnly(control)) {
    if (control.kind === "number") return 132;
    if (control.kind === "select") return 112;
    return 44;
  }
  if (control.kind === "range") return 210;
  if (control.kind === "text") return 180;
  if (control.kind === "number") {
    return Math.max(144, Math.min(244, 116 + control.label.length * 12));
  }
  if (control.kind === "select") {
    const selectedLabel = (control.options || []).find(
      (option) => option.value === String(control.value ?? ""),
    )?.label;
    const contentLength = Math.max(
      control.label.length,
      selectedLabel?.length || 0,
    );
    return Math.max(112, Math.min(192, 52 + contentLength * 12));
  }
  if (control.kind === "panel") {
    return Math.max(44, Math.min(124, 28 + control.label.length * 12));
  }
  return control.label
    ? Math.max(44, Math.min(144, 24 + control.label.length * 12))
    : 44;
}

function isDedicatedSelectionSurface(control: SelectionControl): boolean {
  return (
    control.slot === "context-menu" ||
    control.slot === "stage" ||
    control.slot === "inspector" ||
    control.placement === "tools"
  );
}

function measuredSelectionControlWidth(
  control: SelectionControl,
  measuredWidths: ReadonlyMap<string, number>,
): number {
  const measured = measuredWidths.get(control.id);
  return typeof measured === "number" &&
    Number.isFinite(measured) &&
    measured > 0
    ? measured
    : estimatedSelectionControlWidth(control);
}

export function partitionSelectionControls(
  controls: readonly SelectionControl[],
  measuredWidths: ReadonlyMap<string, number>,
  availableWidth: number,
): {
  visible: SelectionControl[];
  overflow: SelectionControl[];
} {
  const projected = controls.filter(
    (control) => !isDedicatedSelectionSurface(control),
  );
  const compact = projected.filter(
    (control) => control.placement !== "more",
  );
  const authoredOverflow = projected.filter(
    (control) => control.placement === "more",
  );
  const normalizedAvailableWidth =
    Number.isFinite(availableWidth) && availableWidth >= 0
      ? availableWidth
      : Number.POSITIVE_INFINITY;
  const compactWidth = compact.reduce(
    (total, control) =>
      total + measuredSelectionControlWidth(control, measuredWidths),
    0,
  );
  const compactGaps =
    Math.max(0, compact.length - 1) * SELECTION_TOOLBAR_CONTROL_GAP;
  const authoredMoreWidth =
    authoredOverflow.length > 0
      ? SELECTION_TOOLBAR_MORE_BUTTON_WIDTH +
        (compact.length > 0 ? SELECTION_TOOLBAR_CONTROL_GAP : 0)
      : 0;

  if (
    compactWidth + compactGaps + authoredMoreWidth <=
    normalizedAvailableWidth + SELECTION_TOOLBAR_FIT_EPSILON
  ) {
    return { visible: compact, overflow: authoredOverflow };
  }

  // More is now mandatory. Explicit primary controls are considered before
  // ordinary bar controls; source order breaks ties and remains the final DOM
  // order. Every visible control contributes one gap: between compact
  // controls, or between the last compact control and the More launcher.
  let occupiedWidth = SELECTION_TOOLBAR_MORE_BUTTON_WIDTH;
  const visibleIds = new Set<string>();
  const prioritized = compact
    .map((control, index) => ({ control, index }))
    .sort((left, right) => {
      const leftRank = left.control.placement === "primary" ? 0 : 1;
      const rightRank = right.control.placement === "primary" ? 0 : 1;
      return leftRank - rightRank || left.index - right.index;
    });
  for (const { control } of prioritized) {
    const nextWidth =
      occupiedWidth +
      SELECTION_TOOLBAR_CONTROL_GAP +
      measuredSelectionControlWidth(control, measuredWidths);
    if (
      nextWidth <=
      normalizedAvailableWidth + SELECTION_TOOLBAR_FIT_EPSILON
    ) {
      visibleIds.add(control.id);
      occupiedWidth = nextWidth;
    }
  }

  return {
    visible: compact.filter((control) => visibleIds.has(control.id)),
    overflow: projected.filter(
      (control) =>
        control.placement === "more" || !visibleIds.has(control.id),
    ),
  };
}
