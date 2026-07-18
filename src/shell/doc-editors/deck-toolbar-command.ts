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
  const transactional = (persist: () => void, preview: () => void) => {
    if (!message.transactionId) {
      persist();
      return;
    }
    if (message.phase === "start") {
      editor.beginGesture();
      return;
    }
    if (message.phase === "cancel") {
      editor.cancelGesture();
      return;
    }
    preview();
    if (message.phase === "commit") editor.endGesture();
  };
  const patchSlide = (patch: Parameters<DeckEditorState["patchSlide"]>[0]) =>
    transactional(
      () => editor.patchSlide(patch),
      () => editor.patchSlideTransient(patch),
    );
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
        patchSlide({ [message.controlId]: String(message.value ?? "") });
        break;
      case "background":
        patchSlide({ background: String(message.value || "") });
        break;
      case "transition": {
        const type = String(message.value || "none");
        const valid = [
          "fade",
          "push-left",
          "push-right",
          "wipe",
          "zoom",
        ].includes(type);
        patchSlide({
          transition:
            valid
              ? {
                  type: type as NonNullable<
                    DeckEditorState["activeSlide"]["transition"]
                  >["type"],
                  durationMs: editor.activeSlide.transition?.durationMs || 500,
                }
              : undefined,
        });
        break;
      }
      case "transition-duration":
        if (editor.activeSlide.transition) {
          patchSlide({
            transition: {
              ...editor.activeSlide.transition,
              durationMs: Math.max(
                100,
                Math.min(3_000, numeric(message.value, 500)),
              ),
            },
          });
        }
        break;
      case "master":
        if (editor.deck.masters.some((master) => master.id === message.value)) {
          patchSlide({ masterId: String(message.value) });
        }
        break;
      case "master-name":
      case "master-background":
      case "master-text-color":
      case "master-accent-color":
      case "master-font-family": {
        if (message.transactionId && message.phase !== "commit") break;
        const field = {
          "master-name": "name",
          "master-background": "background",
          "master-text-color": "textColor",
          "master-accent-color": "accentColor",
          "master-font-family": "fontFamily",
        }[message.controlId] as
          | "name"
          | "background"
          | "textColor"
          | "accentColor"
          | "fontFamily";
        editor.patchMaster(editor.activeMaster.id, {
          [field]: String(message.value || ""),
        });
        break;
      }
      case "master-duplicate":
        editor.duplicateMaster();
        break;
      case "master-delete":
        editor.deleteMaster();
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
    case "text":
      patch.text = String(message.value ?? "");
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
    case "line-dash":
      patch.lineDash = String(message.value) as DeckElement["lineDash"];
      break;
    case "line-start":
      patch.lineStart = String(message.value) as DeckElement["lineStart"];
      break;
    case "line-end":
      patch.lineEnd = String(message.value) as DeckElement["lineEnd"];
      break;
    case "border-radius":
      patch.borderRadius = numeric(message.value);
      break;
    case "opacity":
      patch.opacity = numeric(message.value, 1);
      break;
    case "animation": {
      const type = String(message.value || "none");
      patch.animation = ["fade", "fly-up", "wipe", "zoom"].includes(type)
        ? {
            type: type as NonNullable<DeckElement["animation"]>["type"],
            durationMs: element.animation?.durationMs || 500,
            delayMs: element.animation?.delayMs || 0,
          }
        : undefined;
      break;
    }
    case "animation-duration":
      if (element.animation) {
        patch.animation = {
          ...element.animation,
          durationMs: Math.max(
            100,
            Math.min(3_000, numeric(message.value, 500)),
          ),
        };
      }
      break;
    case "animation-delay":
      if (element.animation) {
        patch.animation = {
          ...element.animation,
          delayMs: Math.max(
            0,
            Math.min(10_000, numeric(message.value, 0)),
          ),
        };
      }
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
  if (!Object.keys(patch).length) return;
  transactional(
    () => editor.patchElement(element.id, patch),
    () => editor.patchElementTransient(element.id, patch),
  );
}
