/**
 * 选区桥的生产接线：不改 SelectionToolbar 的控件排布。
 * kind/id 已经写在 `data-selection-kind` / `data-selection-id` 上，这里只读。
 */
import { publishAgentSelection, readAgentSelection } from "./inbox";
import type { AgentSelection } from "./selection-bridge";

export function selectionFromToolbarAttrs(attrs: {
  kind?: string | null;
  id?: string | null;
  label?: string | null;
}): AgentSelection | null {
  const kind = String(attrs.kind || "").trim();
  const id = String(attrs.id || "").trim();
  if (!kind || kind === "none" || !id) return null;
  const label = String(attrs.label || "").trim();
  const summary = (label || `${kind}:${id}`).slice(0, 500);
  return {
    kind,
    id,
    summary,
    ...(label ? { label } : {}),
  };
}

export function refreshAgentSelectionFromDom(
  root: { querySelector: (selector: string) => Element | null } | null | undefined =
    typeof document === "undefined" ? null : document,
): AgentSelection | null {
  if (!root) return readAgentSelection();
  const el = root.querySelector("[data-selection-kind][data-selection-id]");
  if (!el) return readAgentSelection();
  const next = selectionFromToolbarAttrs({
    kind: el.getAttribute("data-selection-kind"),
    id: el.getAttribute("data-selection-id"),
    label: el.getAttribute("aria-label"),
  });
  if (!next) return readAgentSelection();
  return publishAgentSelection(next);
}
