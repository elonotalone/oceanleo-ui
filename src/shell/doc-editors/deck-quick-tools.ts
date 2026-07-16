import type {
  SelectionCommand,
  SelectionControl,
} from "../selection-context";
import type { DeckEditorState } from "./use-deck-editor";

type Translate = (value: string) => string;

export type DeckCreationTool =
  | "select"
  | "draw"
  | "shape"
  | "line"
  | "note"
  | "text"
  | "signature"
  | "table";

export function deckQuickTools(
  tt: Translate,
  activeTool: DeckCreationTool,
): SelectionControl[] {
  return [
    ["tool-select", "选择", "select"],
    ["tool-draw", "画笔", "draw"],
    ["tool-shape", "形状", "shape"],
    ["tool-line", "线条", "line"],
    ["tool-note", "便签", "note"],
    ["tool-text", "文字", "text"],
    ["tool-signature", "签名", "signature"],
    ["tool-table", "表格", "table"],
  ].map(([id, label, icon]) => ({
    id,
    kind: "action" as const,
    label: tt(label),
    icon: icon as SelectionControl["icon"],
    value: activeTool === id.replace("tool-", ""),
    placement: "tools" as const,
  }));
}

export function applyDeckQuickTool(
  editor: DeckEditorState,
  command: SelectionCommand,
  actions: {
    setActiveTool: (tool: DeckCreationTool) => void;
    openDrawer: (drawerId: string) => void;
  },
): boolean {
  const tools: Record<
    string,
    { tool: DeckCreationTool; drawer?: string }
  > = {
    "tool-select": { tool: "select" },
    "tool-draw": { tool: "draw", drawer: "deck-draw" },
    "tool-shape": { tool: "shape", drawer: "deck-elements" },
    "tool-line": { tool: "line", drawer: "deck-lines" },
    "tool-note": { tool: "note", drawer: "deck-notes" },
    "tool-text": { tool: "text", drawer: "deck-text" },
    "tool-signature": { tool: "signature", drawer: "deck-signature" },
    "tool-table": { tool: "table", drawer: "deck-tables" },
  };
  const target = tools[command.controlId];
  if (!target) return false;
  actions.setActiveTool(target.tool);
  if (target.tool === "select") editor.selectElement("");
  if (target.drawer) actions.openDrawer(target.drawer);
  return true;
}
