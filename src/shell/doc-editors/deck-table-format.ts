import type { DeckElement } from "./deck-schema";

export interface DeckCellSelection { elementId: string; slideId: string; row: number; column: number }
export function deckCellElement(element: DeckElement, row: number, column: number): DeckElement {
  return { ...element, ...element.cellStyles?.[`${row}:${column}`], text: element.rows?.[row]?.[column] || "" };
}
/** Clear overrides explicitly to the same inherited defaults as a text box. */
export const DECK_CLEARED_INLINE = {
  fontFamily: undefined, fontSize: undefined, color: undefined, link: undefined, bold: false, italic: false,
  underline: false, strike: undefined, highlight: undefined, letterSpacing: 0,
};

/** Geometry effects that the existing PPTX writer represents as a picture. */
export function deckTableUsesPicture(element: DeckElement): boolean {
  return element.shadow === true || Boolean(element.rotation) || element.flipX === true || element.flipY === true || (element.borderRadius || 0) > 0;
}
