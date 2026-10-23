/**
 * 统一编辑栏词表与投影（2026-10-23 操作员裁定 D9）。各编辑器与外壳一律从这里引。
 *
 * 接口（`docs/work-logs/2026-10-23-editor-overhaul/00-dispatch.md` §4）：
 * - `SelectionContext.bar?: "text" | "image" | "shape" | "object"`：选区要哪条栏；
 *   缺省时按 `kind` 与控件推断（`inferSelectionBar`）。
 * - 编辑器给**规范 id**（`EditBarCanonId`）；图标、标签、顺序、分组由外壳统一出，
 *   编辑器自己写的 icon / label 对规范 id 无效。
 * - 旧 id 经 `EDIT_BAR_CANON_ALIASES` 归一，编辑器改完之前投影也成立。
 * - 编辑器特有控件排在对象组之后或进「更多」，不许借用规范图标
 *   （撞上的由 `finalizeEditBarIcons` 改显示文字）。
 * - 做不到就不出这个 id；不出灰按钮。
 *
 * 数据面在 `edit-bar-canon-table.ts`，投影在 `edit-bar-canon-projection.ts`。
 */
export {
  EDIT_BAR_CANON,
  EDIT_BAR_CANON_ALIASES,
  EDIT_BAR_CANON_GROUPS,
  EDIT_BAR_CANON_ICON_CLASSES,
  EDIT_BAR_CANON_ICON_SET,
  EDIT_BAR_CANON_OPTIONS,
  EDIT_BAR_SPECIFIC_ICONS,
  EDIT_BAR_UNLOCK_LABEL,
  editBarCanonSequence,
  editBarGroupOrder,
  editBarIconClass,
  inferSelectionBar,
  isEditBarCanonId,
  resolveEditBarCanonId,
  type EditBarCanonAlias,
  type EditBarCanonEntry,
  type EditBarCanonGroup,
  type EditBarCanonId,
  type SelectionBar,
} from "./edit-bar-canon-table";
export {
  canonicalSelectionControls,
  finalizeEditBarIcons,
  type CanonicalSelectionControl,
  type CanonicalSelectionProjection,
} from "./edit-bar-canon-projection";
