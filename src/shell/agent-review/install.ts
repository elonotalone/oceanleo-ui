import { subscribeEditorContext } from "../plugin-command/registry";
import { publishAgentSelection } from "./inbox";
import { refreshAgentSelectionFromDom } from "./selection-live";
import type { AgentSelection } from "./selection-bridge";
let selectionUnsub: (() => void) | null = null;
function onSelectionEvent(event: Event): void {
  const detail = (event as CustomEvent<AgentSelection | { selection?: AgentSelection }>).detail;
  const sel =
    detail && "kind" in detail && "id" in detail
      ? (detail as AgentSelection)
      : detail && "selection" in detail
        ? detail.selection
        : null;
  if (sel && sel.kind && sel.id) publishAgentSelection(sel);
}

export function installSelectionBridge(): void {
  refreshAgentSelectionFromDom();
  if (!selectionUnsub) {
    const unsubSurface = subscribeEditorContext(() => {
      refreshAgentSelectionFromDom();
    });
    if (typeof window !== "undefined") {
      window.addEventListener("oceanleo-selection-changed", onSelectionEvent);
    }
    selectionUnsub = () => {
      unsubSurface();
      if (typeof window !== "undefined") {
        window.removeEventListener("oceanleo-selection-changed", onSelectionEvent);
      }
    };
  }
}

export function uninstallSelectionBridge(): void {
  if (selectionUnsub) {
    selectionUnsub();
    selectionUnsub = null;
  }
}
