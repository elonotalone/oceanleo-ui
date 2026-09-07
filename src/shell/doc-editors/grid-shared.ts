/**
 * 表格件跨模块共享的**小**类型。旧核 `use-grid-editor.ts` 删掉之后
 * （core-swap:delete grid，2026-09-07），仍有别的模块要一个「表格编辑器状态」
 * 的形状——那个形状搬到这里，不再拖着 1790 行的 hook 一起活。
 *
 * 这里只放类型：没有 React、没有 i18n，`node --test` 能直接 import。
 */
import type { LibraryItem } from "../library-data";
import type { GridCell, GridSheet } from "./grid-model";

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
