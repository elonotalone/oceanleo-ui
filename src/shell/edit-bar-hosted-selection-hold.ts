import type { SelectionContext } from "./selection-context";
import type { SelectionCommandGate } from "./selection-transactions";

export type SelectionInteractionChange = (
  heldSelection: SelectionContext | null,
) => void;

export type SelectionInteractionHoldRef = {
  current: SelectionInteractionChange | null;
};

/**
 * Scoped toolbar hold for a hosted gate. Call synchronously on pointerdown /
 * keyboard activate so the hold is in place before iframe blur posts
 * selection-changed(null). Do not use this as a document-wide cache.
 */
export function applySelectionInteractionHold(
  gate: Pick<SelectionCommandGate, "holdInteraction" | "releaseInteraction">,
  heldSelection: SelectionContext | null,
): void {
  if (heldSelection) gate.holdInteraction(heldSelection);
  else gate.releaseInteraction();
}

/** Live selection wins; a held range survives a transient blur null. */
export function selectionDuringInteraction(
  live: SelectionContext | null,
  held: SelectionContext | null,
): SelectionContext | null {
  return live ?? held;
}

export function bindSelectionInteractionRef(
  ref: SelectionInteractionHoldRef | null | undefined,
  apply: SelectionInteractionChange,
): void {
  if (ref) ref.current = apply;
}
