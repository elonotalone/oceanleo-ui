import type { DeckDocument, DeckElement } from "./deck-schema";

export type DeckElementMutationIntent =
  | "patch"
  | "replace"
  | "layer"
  | "duplicate"
  | "delete"
  | "unlock"
  | "metadata";

const LOCKED_METADATA_FIELDS = new Set<keyof DeckElement>(["alt", "label"]);

export function deckElementPatchAllowed(
  element: DeckElement,
  patch: Partial<DeckElement>,
): boolean {
  if (!element.locked) return true;
  const entries = Object.entries(patch) as Array<
    [keyof DeckElement, DeckElement[keyof DeckElement]]
  >;
  if (!entries.length) return false;
  return entries.every(
    ([key, value]) =>
      LOCKED_METADATA_FIELDS.has(key) ||
      (key === "locked" && value === false),
  );
}

export function applyDeckElementPatch(
  element: DeckElement,
  patch: Partial<DeckElement>,
): DeckElement {
  if (!deckElementPatchAllowed(element, patch)) return element;
  return { ...element, ...patch, id: element.id };
}

export function deckElementMutationAllowed(
  element: DeckElement,
  intent: DeckElementMutationIntent,
): boolean {
  return (
    !element.locked ||
    intent === "unlock" ||
    intent === "metadata"
  );
}

export function deckToolbarControlAllowed(
  element: DeckElement,
  controlId: string,
): boolean {
  return !element.locked || controlId === "lock" || controlId === "alt";
}

export function deckDocumentsEqual(
  before: DeckDocument,
  after: DeckDocument,
): boolean {
  // Collaboration and recovery reconstruct objects in a different key order.
  // Object-key order is not a document edit; array order (slides/layers) is.
  const serialize = (value: DeckDocument) => JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]]))
      : entry);
  return serialize(before) === serialize(after);
}
