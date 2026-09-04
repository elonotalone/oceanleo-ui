/**
 * 把审阅闸装到 `registerEditorCommandSurfaceReader`：
 * FunctionAgentChat 不传 surfaceReader 时（PluginAgentPanel）也会拿到包闸后的面。
 * 本模块必须被加载并调用 `installAgentReviewGate()` 才生效。
 */
import { registerEditorCommandSurfaceReader } from "../../lib/fn-agent";
import {
  currentPluginCommandSurface,
  subscribePluginCommandSurface,
} from "../plugin-command/registry";
import { gateSurfaceForAgent } from "./gate";
import { publishAgentSelection } from "./inbox";
import { refreshAgentSelectionFromDom } from "./selection-live";
import type { AgentSelection } from "./selection-bridge";

let gateOn = false;
let selectionUnsub: (() => void) | null = null;

export function installAgentReviewGate(): void {
  if (gateOn) return;
  gateOn = true;
  registerEditorCommandSurfaceReader(() => {
    const real = currentPluginCommandSurface();
    if (!real) return null;
    return gateSurfaceForAgent(real);
  });
}

export function uninstallAgentReviewGate(): void {
  if (!gateOn) return;
  gateOn = false;
  registerEditorCommandSurfaceReader(null);
}

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
    const unsubSurface = subscribePluginCommandSurface(() => {
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

export function emitReviewDecision(detail: {
  proposalId: string;
  decision: "accept" | "reject";
  editorId?: string;
}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("oceanleo-review-decision", { detail }),
  );
}
