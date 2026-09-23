// Text selected somewhere the browser selection API cannot see (xterm keeps its
// own selection model) is announced here so leo's selection bubble can offer it.

export type LeoSelection = {
  text: string;
  /** Viewport rect near the end of the selection; the bubble sits just above it. */
  anchor: DOMRect | null;
  source: "terminal" | "custom";
};

type Listener = (selection: LeoSelection | null) => void;

const listeners = new Set<Listener>();
let current: LeoSelection | null = null;

/** `null` clears the announced selection. */
export function announceLeoSelection(selection: LeoSelection | null): void {
  const next = selection && selection.text.trim().length >= 2 ? selection : null;
  if (!next && !current) return;
  current = next;
  for (const listener of Array.from(listeners)) listener(next);
}

export function currentLeoSelection(): LeoSelection | null {
  return current;
}

export function subscribeLeoSelection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
