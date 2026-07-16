import type { SelectionCommand } from "../selection-context";
import type {
  DeckElement,
  DeckLayout,
  DeckTextAlign,
} from "./deck-schema";
import type { DeckEditorState } from "./use-deck-editor";

function numeric(value: SelectionCommand["value"], fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function applyDeckToolbarCommand(
  editor: DeckEditorState,
  element: DeckElement | null,
  message: SelectionCommand,
): void {
  if (!element) {
    switch (message.controlId) {
      case "undo":
        editor.undo();
        break;
      case "redo":
        editor.redo();
        break;
      case "add-slide":
        editor.addSlide();
        break;
      case "layout":
        editor.applySlideLayout(String(message.value) as DeckLayout);
        break;
      case "title":
      case "body":
      case "notes":
        editor.patchSlide({ [message.controlId]: String(message.value ?? "") });
        break;
      case "background":
        editor.patchSlide({ background: String(message.value || "") });
        break;
      case "duplicate-slide":
        editor.duplicateSlide();
        break;
      case "delete-slide":
        editor.deleteSlide();
        break;
    }
    return;
  }

  const patch: Partial<DeckElement> = {};
  switch (message.controlId) {
    case "undo":
      editor.undo();
      return;
    case "redo":
      editor.redo();
      return;
    case "alt":
    case "color":
    case "fill":
    case "shape":
      patch[message.controlId] = String(message.value ?? "");
      break;
    case "font-family":
      patch.fontFamily = String(message.value || "");
      break;
    case "font-size":
      patch.fontSize = numeric(message.value, 18);
      break;
    case "bold":
    case "italic":
    case "underline":
    case "shadow":
      patch[message.controlId] = message.value === true;
      break;
    case "align":
      patch.align = String(message.value) as DeckTextAlign;
      break;
    case "image-fit":
      patch.imageFit = String(message.value) as DeckElement["imageFit"];
      break;
    case "line-height":
      patch.lineHeight = numeric(message.value, 1.15);
      break;
    case "letter-spacing":
      patch.letterSpacing = numeric(message.value);
      break;
    case "border-color":
      patch.borderColor = String(message.value || "");
      break;
    case "border-width":
      patch.borderWidth = numeric(message.value);
      break;
    case "border-radius":
      patch.borderRadius = numeric(message.value);
      break;
    case "opacity":
      patch.opacity = numeric(message.value, 1);
      break;
    case "flip-x":
      patch.flipX = !element.flipX;
      break;
    case "flip-y":
      patch.flipY = !element.flipY;
      break;
    case "x":
    case "y":
    case "width":
    case "height":
    case "rotation":
      patch[message.controlId] = numeric(message.value);
      break;
    case "layer-up":
      editor.moveElementLayer(1);
      return;
    case "layer-down":
      editor.moveElementLayer(-1);
      return;
    case "duplicate":
      editor.duplicateElement();
      return;
    case "lock":
      editor.toggleElementLock();
      return;
    case "delete":
      editor.deleteElement();
      return;
  }
  editor.patchElement(element.id, patch);
}
