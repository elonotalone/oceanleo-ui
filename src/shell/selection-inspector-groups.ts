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

interface SelectionInspectorGroupPresentation {
  label: string;
  icon: SelectionControlIcon;
  placement: "primary" | "more";
  iconOnly?: boolean;
  overflowGroup?: string;
}

/**
 * Route controls may provide a generic icon for every inspector. Canonical
 * shared presentations keep dense editors recognizable without requiring each
 * route to duplicate toolbar layout policy.
 */
const INSPECTOR_GROUP_PRESENTATIONS: Readonly<
  Record<string, SelectionInspectorGroupPresentation>
> = {
  "image-transform": {
    label: "位置",
    icon: "position",
    placement: "primary",
    iconOnly: false,
  },
  "grid-number-format": {
    label: "数字格式",
    icon: "font",
    placement: "more",
    overflowGroup: "grid-properties",
  },
  "grid-rows": {
    label: "行操作",
    icon: "add",
    placement: "more",
    overflowGroup: "grid-properties",
  },
  "grid-columns": {
    label: "列操作",
    icon: "table",
    placement: "more",
    overflowGroup: "grid-properties",
  },
  "grid-data": {
    label: "排序与筛选",
    icon: "filter",
    placement: "more",
    overflowGroup: "grid-properties",
  },
  "grid-merge": {
    label: "合并单元格",
    icon: "border",
    placement: "more",
    overflowGroup: "grid-properties",
  },
  "grid-conditional": {
    label: "条件格式",
    icon: "color",
    placement: "more",
    overflowGroup: "grid-properties",
  },
};

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

/**
 * 统一编辑栏投影（`edit-bar-canon-projection.ts`）已经替控件决定好去处：
 * 带 `canonPanel` 的是规范面板里的子控件，带 `canonId` 的 compact 控件上栏。
 * 这两类不再走下面按 id 猜的旧规则（例如行距被一律塞进「间距」）。
 */
interface CanonMarks {
  canonId?: string;
  canonPanel?: string;
  canonGroup?: string;
}

function canonMarks(control: SelectionControl): CanonMarks {
  return control as SelectionControl & CanonMarks;
}

export function isCompactSelectionControl(control: SelectionControl): boolean {
  const marks = canonMarks(control);
  if (marks.canonPanel) return false;
  if (marks.canonId && control.slot === "compact") {
    return control.kind !== "range" && control.kind !== "text";
  }
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
    const canonPanel = canonMarks(control).canonPanel;
    const spacing = !canonPanel && isSpacingDetail(control);
    const id = canonPanel
      ? canonPanel
      : spacing
        ? "text-spacing"
        : control.inspectorGroup || control.group || "adjustments";
    const presentation = INSPECTOR_GROUP_PRESENTATIONS[id];
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
        presentation?.label ||
        (spacing ? "间距" : control.inspectorLabel) ||
        (id === "adjustments" ? "调整" : control.label),
      icon:
        presentation?.icon ||
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
      const presentation = INSPECTOR_GROUP_PRESENTATIONS[entry.id];
      const first = canonMarks(group.controls[0]);
      if (first.canonPanel === entry.id) {
        // 规范面板（§4 增补 A-1）：入口就是那个规范项，id 用规范 id，
        // 标签 / 图标 / 位置已由投影写在子控件上。
        return {
          id: reservedIds.has(entry.id) ? group.panelId : entry.id,
          kind: "panel",
          label: group.label,
          icon: group.icon,
          iconOnly: true,
          panelId: group.panelId,
          placement: group.controls[0].placement === "more" ? "more" : "primary",
          slot: "compact",
          ...(group.controls[0].group ? { group: group.controls[0].group } : {}),
          canonId: entry.id,
          canonGroup: first.canonGroup,
        } as SelectionControl;
      }
      return {
        id: group.panelId,
        kind: "panel",
        label: group.label,
        icon: group.icon,
        iconOnly: presentation?.iconOnly ?? true,
        panelId: group.panelId,
        placement: presentation?.placement || "primary",
        slot: "compact",
        ...(presentation?.overflowGroup
          ? { group: presentation.overflowGroup }
          : {}),
        ...(group.semantic ? { semantic: group.semantic } : {}),
      };
    }),
    groups,
  };
}
