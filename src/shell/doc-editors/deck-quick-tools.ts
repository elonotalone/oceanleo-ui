import type {
  SelectionCommand,
  SelectionControl,
} from "../selection-context";
import type { DeckEditorState } from "./use-deck-editor";

type Translate = (value: string) => string;

export function deckQuickTools(tt: Translate): SelectionControl[] {
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
    placement: "tools" as const,
  }));
}

export function applyDeckQuickTool(
  editor: DeckEditorState,
  command: SelectionCommand,
  tt: Translate,
): boolean {
  switch (command.controlId) {
    case "tool-select":
      editor.selectElement("");
      return true;
    case "tool-draw":
    case "tool-line":
      editor.addShapeElement("line");
      return true;
    case "tool-shape":
      editor.addShapeElement("rectangle");
      return true;
    case "tool-note":
      editor.addShapeElement("rounded");
      editor.addTextElement({
        text: tt("便签"),
        fontSize: 24,
        bold: true,
        color: "#3f3420",
      });
      return true;
    case "tool-text":
      editor.addTextElement();
      return true;
    case "tool-signature":
      editor.addTextElement({
        text: tt("签名"),
        fontFamily: "Segoe Script, Brush Script MT, cursive",
        fontSize: 44,
        italic: true,
      });
      return true;
    case "tool-table":
      editor.addTableElement(3, 3);
      return true;
    default:
      return false;
  }
}
