import type {
  SelectionControl,
  SelectionControlIcon,
  SelectionControlSemantic,
} from "./selection-context";

export interface SelectionInspectorGroup {
  panelId: string;
  label: string;
  icon?: SelectionControlIcon;
  semantic?: SelectionControlSemantic;
  controls: SelectionControl[];
}

const SPACING_DETAIL_IDS = new Set([
  "letter-spacing",
  "char-spacing",
  "line-spacing",
  "line-height",
  "text-anchor",
  "vertical-align",
]);

function isSpacingDetail(control: SelectionControl): boolean {
  return (
    (control.semantic === "spacing" ||
      SPACING_DETAIL_IDS.has(control.id.toLowerCase())) &&
    SPACING_DETAIL_IDS.has(control.id.toLowerCase())
  );
}

function isHorizontalAlignment(control: SelectionControl): boolean {
  return (
    control.semantic === "alignment" ||
    ["align", "alignment", "text-align"].includes(control.id.toLowerCase())
  );
}

function inspectorSemantic(
  control: SelectionControl,
): SelectionControlSemantic | undefined {
  if (control.semantic) return control.semantic;
  const id = control.id.toLowerCase();
  if (id === "opacity") return "opacity";
  if (id === "effects" || id === "effect") return "effects";
  if (id === "animation" || id === "animation-gallery") return "animation";
  if (id === "position" || id === "layers" || id === "arrange") {
    return "position";
  }
  return undefined;
}

export function isCompactSelectionControl(control: SelectionControl): boolean {
  if (
    isHorizontalAlignment(control) &&
    control.slot !== "stage" &&
    control.slot !== "context-menu" &&
    control.placement !== "tools" &&
    control.kind !== "range" &&
    control.kind !== "text"
  ) {
    return true;
  }
  return (
    !isSpacingDetail(control) &&
    control.slot !== "inspector" &&
    control.slot !== "stage" &&
    control.slot !== "context-menu" &&
    control.placement !== "tools" &&
    control.kind !== "range" &&
    control.kind !== "text"
  );
}

export function partitionSelectionInspectorControls(
  source: readonly SelectionControl[],
): {
  compact: SelectionControl[];
  groups: SelectionInspectorGroup[];
} {
  const grouped = new Map<string, SelectionInspectorGroup>();
  const compactOrder: Array<
    | { type: "control"; control: SelectionControl }
    | { type: "group"; id: string }
  > = [];
  const reservedIds = new Set(source.map((control) => control.id));
  const panelIds = new Set<string>();
  for (const control of source) {
    if (isCompactSelectionControl(control)) {
      compactOrder.push({
        type: "control",
        control: isHorizontalAlignment(control)
          ? { ...control, slot: "compact" }
          : control,
      });
      continue;
    }
    if (
      control.slot === "stage" ||
      control.slot === "context-menu" ||
      control.placement === "tools"
    ) {
      continue;
    }
    const spacing = isSpacingDetail(control);
    const id = spacing
      ? "text-spacing"
      : control.inspectorGroup || control.group || "adjustments";
    const basePanelId = `selection-inspector-${id.replace(
      /[^a-z0-9_.:-]/gi,
      "-",
    )}`;
    let panelId = basePanelId;
    for (let suffix = 2; reservedIds.has(panelId) || panelIds.has(panelId); suffix += 1) {
      panelId = `${basePanelId}-${suffix}`;
    }
    const current = grouped.get(id) || {
      panelId,
      label:
        (spacing ? "间距" : control.inspectorLabel) ||
        (id === "adjustments" ? "调整" : control.label),
      icon:
        (spacing ? "spacing" : control.inspectorIcon) ||
        control.icon ||
        "more",
      semantic: spacing ? "spacing" : inspectorSemantic(control),
      controls: [],
    };
    if (!grouped.has(id)) compactOrder.push({ type: "group", id });
    panelIds.add(current.panelId);
    current.controls.push(control);
    grouped.set(id, current);
  }
  const groups = [...grouped.values()];
  return {
    compact: compactOrder.map((entry): SelectionControl => {
      if (entry.type === "control") return entry.control;
      const group = grouped.get(entry.id)!;
      return {
        id: group.panelId,
        kind: "panel",
        label: group.label,
        icon: group.icon,
        iconOnly: true,
        panelId: group.panelId,
        placement: "primary",
        slot: "compact",
        ...(group.semantic ? { semantic: group.semantic } : {}),
      };
    }),
    groups,
  };
}
