/**
 * 表格件跨模块共享的**小**类型。旧核 `use-grid-editor.ts` 删掉之后
 * （core-swap:delete grid，2026-09-07），仍有别的模块要一个「表格编辑器状态」
 * 的形状——那个形状搬到这里，不再拖着 1790 行的 hook 一起活。
 *
 * 这里只放类型：没有 React、没有 i18n，`node --test` 能直接 import。
 */
import type { LibraryItem } from "../library-data";
import type { GridCell, GridSheet } from "./grid-model";

/**
 * grid carrier 落库四元组的三个常量（`docs/specs/.../L1-carriers/grid.md` §1.1，
 * `tests/grid-carrier-contract.test.mjs` C-1）。第四个 `GRID_LEGACY_PROJECT_SCHEMA`
 * 在 `grid-univer/legacy-conversion.ts`。原来长在旧核 hook 里，旧核删了常量留下。
 */
export const GRID_SOURCE_FORMAT = "xlsx";
export const GRID_SOURCE_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const GRID_EDITOR_CAPABILITY = "grid-editor";

export interface GridSelection {
  anchor: GridCell;
  focus: GridCell;
}

/**
 * `doc-family-commands.ts` 的 `buildGridCommandSurface` 需要的编辑器状态。
 * 字段是它真读的那几个，不是旧核的全量 `GridEditorState`。
 */
export interface GridCommandEditorState {
  item: LibraryItem;
  sheets: GridSheet[];
  activeSheet: GridSheet;
  selection: GridSelection;
  selectedValue: string;
  headerRow: boolean;
  loading: boolean;
  dirty: boolean;
  editRevision: number;
  error: string;
  selectCell: (cell: GridCell, extend?: boolean) => void;
  setCell: (row: number, col: number, value: string) => void;
  insertRow: (side: "before" | "after") => void;
  insertColumn: (side: "before" | "after") => void;
  addSheet: () => void;
  renameSheet: (name: string) => void;
  sort: (direction: "asc" | "desc") => void;
  save: () => Promise<unknown>;
}
