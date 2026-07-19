import type { GridSheet } from "./grid-model";
import type { GridEditorState } from "./use-grid-editor";

export interface GridRouteSnapshot {
  sheets: GridSheet[];
  activeSheetId: string;
  headerRow: boolean;
  filterQuery: string;
  filterColumn: number;
}

function cloneSnapshot(snapshot: GridRouteSnapshot): GridRouteSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as GridRouteSnapshot;
}

function sameSnapshot(
  left: GridRouteSnapshot,
  right: GridRouteSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function captureGridRouteSnapshot(
  editor: Pick<
    GridEditorState,
    | "sheets"
    | "activeSheetId"
    | "headerRow"
    | "filterQuery"
    | "selection"
  >,
): GridRouteSnapshot {
  return cloneSnapshot({
    sheets: editor.sheets,
    activeSheetId: editor.activeSheetId,
    headerRow: editor.headerRow,
    filterQuery: editor.filterQuery,
    filterColumn: editor.selection.focus.col,
  });
}

export class GridRouteHistory {
  #past: GridRouteSnapshot[] = [];
  #future: GridRouteSnapshot[] = [];
  #current: GridRouteSnapshot | null = null;
  #revision: string | number | null = null;

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  reset(revision: string | number, snapshot: GridRouteSnapshot): void {
    this.#past = [];
    this.#future = [];
    this.#current = cloneSnapshot(snapshot);
    this.#revision = revision;
  }

  observe(revision: string | number, snapshot: GridRouteSnapshot): boolean {
    if (!this.#current) {
      this.reset(revision, snapshot);
      return true;
    }
    if (revision === this.#revision) {
      this.#current = cloneSnapshot(snapshot);
      return false;
    }
    const changed = !sameSnapshot(this.#current, snapshot);
    if (changed) {
      this.#past = [...this.#past, cloneSnapshot(this.#current)].slice(-80);
      this.#future = [];
    }
    this.#current = cloneSnapshot(snapshot);
    this.#revision = revision;
    return changed;
  }

  accept(revision: string | number, snapshot: GridRouteSnapshot): void {
    this.#current = cloneSnapshot(snapshot);
    this.#revision = revision;
  }

  undo(current: GridRouteSnapshot): GridRouteSnapshot | null {
    const previous = this.#past.pop();
    if (!previous) return null;
    this.#future.push(cloneSnapshot(current));
    this.#current = cloneSnapshot(previous);
    return cloneSnapshot(previous);
  }

  redo(current: GridRouteSnapshot): GridRouteSnapshot | null {
    const next = this.#future.pop();
    if (!next) return null;
    this.#past.push(cloneSnapshot(current));
    this.#current = cloneSnapshot(next);
    return cloneSnapshot(next);
  }

  rollbackUndo(): void {
    const original = this.#future.pop();
    if (!original || !this.#current) return;
    this.#past.push(cloneSnapshot(this.#current));
    this.#current = cloneSnapshot(original);
  }

  rollbackRedo(): void {
    const original = this.#past.pop();
    if (!original || !this.#current) return;
    this.#future.push(cloneSnapshot(this.#current));
    this.#current = cloneSnapshot(original);
  }
}
