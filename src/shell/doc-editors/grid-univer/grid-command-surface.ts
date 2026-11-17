import { boundedAgentContent } from "../../plugin-command/bounded-agent-content";
import type { EditorContextSurfaceInput } from "../../plugin-command/types";
import type { LibraryItem } from "../../library-data";
import { pluginTargetForLibraryItem } from "../../active-agent-file";
interface CellRange { startRow: number; endRow: number; startColumn: number; endColumn: number }
export function buildGridContext(input: {
  item: LibraryItem;
  revision: number;
  ready: boolean;
  snapshot(): { sheets?: Record<string, unknown> };
  selection(): { sheetId: string; range: CellRange } | null;
}): EditorContextSurfaceInput {
  return {
    editorId: "grid",
    target: () => pluginTargetForLibraryItem(input.item, "grid", input.revision),
    selection: () => {
      const selected = input.selection();
      return selected ? { kind: "cells", ...selected } : { kind: "whole-file" };
    },
    agentContext: () => {
      if (!input.ready) return { ready: false, reason: "Sheet source unavailable" };
      const selected = input.selection();
      const sheets = Object.entries(input.snapshot().sheets || {}).filter(([id]) => !selected || selected.sheetId === id).map(([sheetId, value]) => {
        const sheet = value as { name?: string; cellData?: Record<string, Record<string, { v?: unknown; f?: string }>> };
        const cells = Object.entries(sheet?.cellData || {}).flatMap(([rowKey, columns]) => {
          const row = Number(rowKey);
          if (selected && (row < selected.range.startRow - 2 || row > selected.range.endRow + 2)) return [];
          return Object.entries(columns || {}).flatMap(([columnKey, cell]) => {
            const column = Number(columnKey);
            if (selected && (column < selected.range.startColumn - 2 || column > selected.range.endColumn + 2)) return [];
            return cell && (cell.v !== undefined || cell.f !== undefined) ? [{ row: row + 1, column: column + 1, value: cell.v, formula: cell.f }] : [];
          });
        });
        return { sheetId, name: sheet?.name, cells };
      });
      return boundedAgentContent({ title: input.item.title, sheets });
    },
  };
}
