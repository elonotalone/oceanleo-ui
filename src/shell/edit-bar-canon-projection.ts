/**
 * 统一编辑栏投影（D9）：把任一编辑器给的选区控件，按规范词表改成同样的图标、
 * 同样的标签、同样的顺序与分组。纯函数，`SelectionToolbar` 对所有编辑器调用。
 *
 * 管线：`canonicalSelectionControls`（本文件）→ `partitionSelectionInspectorControls`
 * （把 inspector 子控件合成面板入口；规范面板的入口 id 就是规范 id）→
 * `finalizeEditBarIcons`（特有控件借用规范图标或撞形的，改显示文字）。
 *
 * - 规范 id（含别名）→ 规范图标、`tt(规范标签)`、规范顺序；编辑器的 icon/label 作废。
 * - 面板型规范项（§4 增补 A-1）：子控件带 `slot:"inspector"` + `inspectorGroup:<规范 id>`，
 *   合成面板就是那个规范项；子控件永远留在面板里，不拉成顶层按钮。
 *   旧写法（几何量散在别的分组里）按 `LEGACY_PANEL_MEMBERS` 收进对应规范面板。
 * - 同一规范 id 出现两次：形态相同的合并成一个，形态不同的后来者降为特有控件。
 * - `layer-up` / `layer-down` 这类「一个选项一个按钮」的旧控件合成一个规范下拉，
 *   命令经 `translate` 还原成编辑器自己的 id，编辑器不用改就能用。
 * - 顶层的规范项上栏；顶层的滑杆、长文本这类不能上栏的，各自成一个规范面板。
 *   编辑器自己放进属性分组（`slot:"inspector"`）的控件一律留在原分组，不拉成顶层。
 * - 灰掉的控件不出（D9「做不到就不出」）；整条只读（协同只能查看）时保留原样。
 * - 编辑器特有控件排在对象组之后。
 */
import type {
  SelectionBar,
  SelectionCommand,
  SelectionContext,
  SelectionControl,
  SelectionControlKind,
  SelectionControlOption,
} from "./selection-context-types";
import {
  EDIT_BAR_CANON,
  EDIT_BAR_CANON_ALIASES,
  EDIT_BAR_CANON_ICON_SET,
  EDIT_BAR_CANON_OPTIONS,
  EDIT_BAR_SPECIFIC_ICONS,
  EDIT_BAR_UNLOCK_LABEL,
  editBarCanonSequence,
  editBarIconClass,
  inferSelectionBar,
  isEditBarCanonId,
  resolveEditBarCanonId,
  type EditBarCanonGroup,
  type EditBarCanonId,
} from "./edit-bar-canon-table";

export interface CanonicalSelectionControl extends SelectionControl {
  /** 这个控件（或它合成的面板入口）显示成哪个规范项；缺省 = 编辑器特有控件。 */
  canonId?: EditBarCanonId;
  /** 排在哪一组（`specific` = 编辑器特有，排在对象组之后）。 */
  canonGroup?: EditBarCanonGroup | "specific";
  /** 这是哪个规范面板里的子控件（`inspectorGroup` 同值）。 */
  canonPanel?: EditBarCanonId;
  /** 编辑器原来的标签（字体面板把当前字体名写在 label 里），投影后当作值显示。 */
  canonValueLabel?: string;
  /** 合成下拉的来源控件 id（`layer-up` / `layer-down` → `arrange`）。 */
  canonSources?: readonly string[];
}

export interface CanonicalSelectionProjection {
  bar: SelectionBar;
  controls: CanonicalSelectionControl[];
  /** 把投影后控件发出的命令还原成编辑器自己的控件 id / 值；`null` = 无事可做。 */
  translate: (command: SelectionCommand) => SelectionCommand | null;
}

type Translate = (zh: string) => string;
const identity: Translate = (zh) => zh;

/** 能直接画在栏上的形态；其余（滑杆、长文本）只能进面板。 */
const BAR_KINDS = new Set<SelectionControlKind>([
  "action",
  "toggle",
  "select",
  "number",
  "color",
  "panel",
  "animation-gallery",
]);

/**
 * 旧写法里散在各自分组的面板子控件（几何量、调色滑杆、描边粗细……）。
 * 编辑器改成 A-1 写法之前，投影把它们收进对应规范面板。
 */
const LEGACY_PANEL_MEMBERS: ReadonlyArray<{
  canon: EditBarCanonId;
  bars?: readonly SelectionBar[];
  ids: ReadonlySet<string>;
}> = [
  {
    canon: "position",
    ids: new Set([
      "x", "y", "width", "height", "rotation", "angle", "scale", "left", "top",
      "position-x", "position-y", "object-width", "object-height",
    ]),
  },
  {
    canon: "adjust",
    ids: new Set([
      "brightness", "contrast", "saturation", "grayscale", "hue", "blur",
      "exposure", "sepia", "invert", "sharpen", "temperature", "vignette",
      "filter-reset",
    ]),
  },
  {
    canon: "stroke",
    bars: ["shape"],
    ids: new Set([
      "border-width", "stroke-width", "line-width", "line-dash", "stroke-dash",
      "border-style",
    ]),
  },
  {
    canon: "border",
    bars: ["image"],
    ids: new Set(["border-width", "border-style"]),
  },
];

function legacyPanelOf(
  control: SelectionControl,
  bar: SelectionBar,
): EditBarCanonId | undefined {
  const id = control.id.toLowerCase();
  return LEGACY_PANEL_MEMBERS.find(
    (panel) => (!panel.bars || panel.bars.includes(bar)) && panel.ids.has(id),
  )?.canon;
}

function onDedicatedSurface(control: SelectionControl): boolean {
  return control.slot === "stage" || control.placement === "tools";
}

function isLocked(control: SelectionControl): boolean {
  return control.value === true || control.icon === "unlock";
}

function canonOptions(
  canonId: EditBarCanonId,
  options: readonly SelectionControlOption[] | undefined,
  tt: Translate,
): SelectionControlOption[] | undefined {
  if (!options) return undefined;
  const table = (EDIT_BAR_CANON_OPTIONS as Partial<
    Record<EditBarCanonId, ReadonlyArray<{ value: string; label: string }>>
  >)[canonId];
  if (!table) return [...options];
  const known = new Map(table.map((option, index) => [option.value, index]));
  return options
    .map((option, index) => ({
      option: known.has(option.value)
        ? { value: option.value, label: tt(table[known.get(option.value)!].label) }
        : option,
      rank: known.get(option.value) ?? table.length + index,
    }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ option }) => option);
}

function placementOf(canonId: EditBarCanonId): "primary" | "more" {
  return EDIT_BAR_CANON[canonId].tier === "more" ? "more" : "primary";
}

/** 规范面板里的子控件：留在面板里，面板入口的标签 / 图标 / 位置走规范。 */
function panelChild(
  control: SelectionControl,
  canonId: EditBarCanonId,
  group: EditBarCanonGroup,
  tt: Translate,
): CanonicalSelectionControl {
  const entry = EDIT_BAR_CANON[canonId];
  return {
    ...control,
    slot: "inspector",
    inspectorGroup: canonId,
    inspectorLabel: tt(entry.label),
    inspectorIcon: entry.icon,
    placement: placementOf(canonId),
    canonPanel: canonId,
    canonGroup: group,
  };
}

function projectCanonical(
  control: SelectionControl,
  canonId: EditBarCanonId,
  group: EditBarCanonGroup,
  tt: Translate,
): CanonicalSelectionControl {
  const entry = EDIT_BAR_CANON[canonId];
  const locked = canonId === "lock" && isLocked(control);
  const base: CanonicalSelectionControl = {
    ...control,
    label: tt(locked ? EDIT_BAR_UNLOCK_LABEL : entry.label),
    icon: locked ? "unlock" : entry.icon,
    // 栏上一律只画图标（字体 / 字号画值，见 SelectionToolbarControl）；「更多」里照常带文字。
    iconOnly: true,
    canonId,
    canonGroup: group,
    group: `canon-${group}`,
    ...(canonId === "font-family" && control.kind === "panel" && control.label
      ? { canonValueLabel: control.label }
      : {}),
    ...(control.options
      ? { options: canonOptions(canonId, control.options, tt) }
      : {}),
  };
  if (onDedicatedSurface(control)) return base;
  if (BAR_KINDS.has(control.kind)) {
    const {
      inspectorGroup: _group,
      inspectorLabel: _label,
      inspectorIcon: _icon,
      ...rest
    } = base;
    return { ...rest, slot: "compact", placement: placementOf(canonId) };
  }
  // 滑杆、长文本：自成一个规范面板（入口 id = 规范 id）。
  return panelChild(control, canonId, group, tt);
}

interface SynthSource {
  option: string;
  control: SelectionControl;
}

/** `layer-up` / `layer-down` → 一个 `arrange` 下拉；`bullet-list` / `ordered-list` → `list`。 */
function synthesize(
  canonId: EditBarCanonId,
  group: EditBarCanonGroup,
  sources: readonly SynthSource[],
  tt: Translate,
): CanonicalSelectionControl | null {
  if (sources.length === 0) return null;
  const table = (EDIT_BAR_CANON_OPTIONS as Partial<
    Record<EditBarCanonId, ReadonlyArray<{ value: string; label: string }>>
  >)[canonId] || [];
  const available = new Set(sources.map((source) => source.option));
  if (canonId === "list") available.add("none");
  const entry = EDIT_BAR_CANON[canonId];
  return {
    id: canonId,
    kind: "select",
    label: tt(entry.label),
    icon: entry.icon,
    iconOnly: true,
    options: table
      .filter((option) => available.has(option.value))
      .map((option) => ({ value: option.value, label: tt(option.label) })),
    value:
      canonId === "list"
        ? sources.find((source) => source.control.value === true)?.option || "none"
        : "",
    canonId,
    canonGroup: group,
    group: `canon-${group}`,
    canonSources: sources.map((source) => source.control.id),
    slot: "compact",
    placement: placementOf(canonId),
  };
}

/**
 * 编辑器特有控件（含属性面板入口）借用了规范图标，或与栏上已有图标撞形：
 * 去掉图标改显示文字。`more` 是「更多」键自己的字形，也不许借。
 * 在 `partitionSelectionInspectorControls` 之后调用，面板入口也一起判。
 */
export function finalizeEditBarIcons<T extends SelectionControl>(
  controls: readonly T[],
): T[] {
  const used = new Set<string>(["more"]);
  for (const control of controls) {
    if ((control as CanonicalSelectionControl).canonId && control.icon) {
      used.add(editBarIconClass(control.icon));
    }
  }
  return controls.map((control) => {
    if ((control as CanonicalSelectionControl).canonId || !control.icon) {
      return control;
    }
    const iconClass = editBarIconClass(control.icon);
    if (!EDIT_BAR_CANON_ICON_SET.has(iconClass) && !used.has(iconClass)) {
      used.add(iconClass);
      return control;
    }
    const { icon: _icon, ...rest } = control;
    return { ...rest, iconOnly: false } as T;
  });
}

/** 整条都是灰的（协同只能查看）：照原样保留，让悬停说明「你只能查看」。 */
function wholeContextDisabled(controls: readonly SelectionControl[]): boolean {
  return controls.length > 0 && controls.every((control) => control.disabled);
}

export function canonicalSelectionControls(
  context: SelectionContext,
  tt: Translate = identity,
): CanonicalSelectionProjection {
  const bar = inferSelectionBar(context);
  const sequence = editBarCanonSequence(bar);
  const rank = new Map(sequence.map((item, index) => [item.id, index]));
  const groupOf = (id: EditBarCanonId) =>
    sequence.find((item) => item.id === id)?.group || "object";
  const keepDisabled = wholeContextDisabled(context.controls);
  const live = context.controls.filter(
    (control) => keepDisabled || !control.disabled,
  );

  // 一、编辑器按 A-1 写的规范面板：inspectorGroup 就是规范 id。
  const panels = new Set<EditBarCanonId>();
  for (const control of live) {
    const group = control.inspectorGroup?.toLowerCase();
    if (control.slot === "inspector" && group && isEditBarCanonId(group)) {
      panels.add(group);
    }
  }
  // 二、旧写法的面板子控件：同一规范面板没有 A-1 写法时才收。
  const legacyPanels = new Map<SelectionControl, EditBarCanonId>();
  for (const control of live) {
    if (onDedicatedSurface(control)) continue;
    const inGroup = control.inspectorGroup?.toLowerCase();
    if (inGroup && panels.has(inGroup as EditBarCanonId)) continue;
    const canon = legacyPanelOf(control, bar);
    if (canon) legacyPanels.set(control, canon);
  }
  for (const canon of new Set(legacyPanels.values())) panels.add(canon);

  const claimed = new Map<EditBarCanonId, CanonicalSelectionControl>();
  const children: CanonicalSelectionControl[] = [];
  const synthSources = new Map<EditBarCanonId, SynthSource[]>();
  const specific: CanonicalSelectionControl[] = [];
  const demote = (control: SelectionControl) => {
    const icon = EDIT_BAR_SPECIFIC_ICONS[control.id.toLowerCase()];
    specific.push({ ...control, ...(icon ? { icon } : {}), canonGroup: "specific" });
  };

  for (const control of live) {
    const inGroup = control.inspectorGroup?.toLowerCase();
    if (
      control.slot === "inspector" &&
      inGroup &&
      isEditBarCanonId(inGroup) &&
      panels.has(inGroup)
    ) {
      children.push(panelChild(control, inGroup, groupOf(inGroup), tt));
      continue;
    }
    const legacy = legacyPanels.get(control);
    if (legacy) {
      children.push(panelChild(control, legacy, groupOf(legacy), tt));
      continue;
    }
    if (control.slot === "inspector") {
      // 编辑器自己分组的面板子控件：留在原面板，不拉成顶层（与 A-1 同理）。
      // 规范项该上栏的，由编辑器改成顶层控件。
      demote(control);
      continue;
    }
    const canonId = resolveEditBarCanonId(control, bar);
    if (!canonId) {
      demote(control);
      continue;
    }
    const lower = control.id.toLowerCase();
    const alias = isEditBarCanonId(lower) ? undefined : EDIT_BAR_CANON_ALIASES[lower];
    if (alias?.option) {
      const list = synthSources.get(canonId) || [];
      list.push({ option: alias.option, control });
      synthSources.set(canonId, list);
      continue;
    }
    if (panels.has(canonId)) {
      // 规范面板已经在：同名的顶层控件进面板当子控件（不会出两个同图标入口）；
      // 进不了面板的形态（另一个面板键）只保功能。
      if (control.kind === "panel" || onDedicatedSurface(control)) demote(control);
      else children.push(panelChild(control, canonId, groupOf(canonId), tt));
      continue;
    }
    const existing = claimed.get(canonId);
    if (existing) {
      // 同语义同形态：合并成一个；形态不同：保住功能，降为特有控件。
      if (existing.kind !== control.kind) demote(control);
      continue;
    }
    const projected = projectCanonical(control, canonId, groupOf(canonId), tt);
    if (projected.slot === "inspector") children.push(projected);
    else claimed.set(canonId, projected);
  }

  const synthesized = new Map<string, CanonicalSelectionControl>();
  for (const [canonId, sources] of synthSources) {
    if (claimed.has(canonId) || panels.has(canonId)) {
      // 编辑器已经给了真的规范下拉：旧的单项按钮只保功能，不再占规范图标。
      for (const source of sources) demote(source.control);
      continue;
    }
    const control = synthesize(canonId, groupOf(canonId), sources, tt);
    if (!control) continue;
    claimed.set(canonId, control);
    synthesized.set(canonId, control);
  }

  const canonRank = (control: CanonicalSelectionControl) =>
    rank.get((control.canonId || control.canonPanel)!) ?? sequence.length;
  const canonical = [...claimed.values(), ...children]
    .map((control, index) => ({ control, index }))
    .sort(
      (left, right) =>
        canonRank(left.control) - canonRank(right.control) ||
        left.index - right.index,
    )
    .map(({ control }) => control);

  const sourceById = new Map(
    context.controls.map((control) => [control.id, control]),
  );
  const translate = (command: SelectionCommand): SelectionCommand | null => {
    const synth = synthesized.get(command.controlId);
    if (!synth) return command;
    const option = String(command.value ?? "");
    const sources = (synth.canonSources || [])
      .map((id) => sourceById.get(id))
      .filter((control): control is SelectionControl => Boolean(control));
    if (synth.canonId === "list" && option === "none") {
      const active = sources.find((control) => control.value === true);
      return active ? { ...command, controlId: active.id, value: false } : null;
    }
    const target = sources.find(
      (control) =>
        EDIT_BAR_CANON_ALIASES[control.id.toLowerCase()]?.option === option,
    );
    if (!target) return null;
    const { value: _value, ...rest } = command;
    return target.kind === "toggle"
      ? { ...rest, controlId: target.id, value: true }
      : { ...rest, controlId: target.id };
  };

  return { bar, controls: [...canonical, ...specific], translate };
}
