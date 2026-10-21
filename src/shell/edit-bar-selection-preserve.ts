/**
 * Keep the editor selection when the user presses the shared edit bar.
 *
 * Same-document cores (TipTap, canvas) collapse the range on focus steal.
 * Hosted iframes emit selection-changed(null) on blur. The inspector already
 * calls preventDefault on pointerdown; compact bar controls did not.
 *
 * Number/text fields still take focus so a font-size value can be typed.
 */

const EDIT_BAR_SURFACE_SELECTOR = [
  "[data-workspace-edit-bar]",
  "[data-workspace-edit-bar-toolbar]",
  "[data-selection-control-id]",
  "[data-selection-overflow-control]",
  "[data-anchored-popover]",
  "[data-edit-bar-document-segment]",
  "[data-edit-bar-document-more]",
  "[data-edit-bar-agent]",
  "[data-plugin-chrome-edit-button]",
  "[data-edit-bar-interactive]",
].join(",");

function eventElement(target: EventTarget | null): Element | null {
  if (typeof Element !== "undefined" && target instanceof Element) return target;
  if (typeof Node !== "undefined" && target instanceof Node) {
    return target.parentElement;
  }
  return null;
}

export function isEditBarSurface(target: EventTarget | null): boolean {
  return Boolean(eventElement(target)?.closest(EDIT_BAR_SURFACE_SELECTOR));
}

/** Ctrl/⌘+Z 在输入框里让给原生撤销；画布 / 空白处才走编辑器撤销。 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const node = target as {
    tagName?: string;
    isContentEditable?: boolean;
    parentElement?: {
      tagName?: string;
      isContentEditable?: boolean;
      closest?: (selector: string) => Element | null;
    } | null;
    closest?: (selector: string) => Element | null;
  };
  const el = typeof node.tagName === "string" ? node : node.parentElement;
  if (!el || typeof el.tagName !== "string") return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return true;
  const editableAttr =
    typeof (el as { getAttribute?: (name: string) => string | null }).getAttribute ===
    "function"
      ? (el as { getAttribute: (name: string) => string | null }).getAttribute(
          "contenteditable",
        )
      : null;
  if (el.isContentEditable || (editableAttr != null && editableAttr !== "false")) {
    return true;
  }
  return typeof el.closest === "function"
    ? Boolean(el.closest("[contenteditable]:not([contenteditable='false'])"))
    : false;
}

export function preserveEditBarSelection(event: {
  preventDefault(): void;
  target?: EventTarget | null;
}): void {
  const target = event.target;
  if (
    typeof HTMLTextAreaElement !== "undefined" &&
    target instanceof HTMLTextAreaElement
  ) {
    return;
  }
  if (
    typeof HTMLInputElement !== "undefined" &&
    target instanceof HTMLInputElement
  ) {
    const type = target.type;
    if (
      type === "text" ||
      type === "number" ||
      type === "search" ||
      type === "email"
    ) {
      return;
    }
  }
  event.preventDefault();
}

export function editBarHistoryShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): "undo" | "redo" | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  if (event.key === "z" || event.key === "Z") {
    return event.shiftKey ? "redo" : "undo";
  }
  if (event.key === "y" || event.key === "Y") return "redo";
  return null;
}

