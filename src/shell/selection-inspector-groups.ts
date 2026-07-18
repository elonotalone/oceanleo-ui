import type {
  SelectionControl,
  SelectionControlIcon,
} from "./selection-context";

export interface SelectionInspectorGroup {
  panelId: string;
  label: string;
  icon?: SelectionControlIcon;
  controls: SelectionControl[];
}

export function isCompactSelectionControl(control: SelectionControl): boolean {
  return (
    control.slot !== "inspector" &&
    control.slot !== "stage" &&
    control.slot !== "context-menu" &&
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
  const compact: SelectionControl[] = [];
  const reservedIds = new Set(source.map((control) => control.id));
  const panelIds = new Set<string>();
  for (const control of source) {
    if (isCompactSelectionControl(control)) {
      if (control.slot !== "stage" && control.slot !== "context-menu") {
        compact.push(control);
      }
      continue;
    }
    if (control.slot === "stage" || control.slot === "context-menu") continue;
    const id = control.inspectorGroup || control.group || "adjustments";
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
        control.inspectorLabel ||
        (id === "adjustments" ? "调整" : control.label),
      icon: control.inspectorIcon || control.icon || "more",
      controls: [],
    };
    panelIds.add(current.panelId);
    current.controls.push(control);
    grouped.set(id, current);
  }
  const groups = [...grouped.values()];
  return {
    compact: [
      ...compact,
      ...groups.map(
        (group): SelectionControl => ({
          id: group.panelId,
          kind: "panel",
          label: group.label,
          icon: group.icon,
          panelId: group.panelId,
          placement: "more",
          slot: "compact",
        }),
      ),
    ],
    groups,
  };
}
