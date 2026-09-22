/** Homepage choice: which backbone speaks next. The key itself stays in the sealed cookie. */

export const CURSOR_MODEL_EVENT = "oceanleo:cursor-model";

const MODEL_KEY = "oceanleo.cursor.model";
const CLEARED_KEY = "oceanleo.cursor.cleared";

export type CursorModelChoice = { id: string; name: string };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readCursorModel(): CursorModelChoice | null {
  const raw = storage()?.getItem(MODEL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: string; name?: string };
    const id = String(parsed.id || "").trim();
    if (!id) return null;
    return { id, name: String(parsed.name || id) };
  } catch {
    return null;
  }
}

function emit(): void {
  window.dispatchEvent(new CustomEvent(CURSOR_MODEL_EVENT));
}

export function selectCursorModel(id: string, name: string): void {
  const store = storage();
  if (!store) return;
  store.setItem(MODEL_KEY, JSON.stringify({ id, name: name || id }));
  store.removeItem(CLEARED_KEY);
  emit();
}

/** Picking Lite / Pro / Max again. Follow-ups must say so, or the task stays on Cursor. */
export function clearCursorModel(): void {
  const store = storage();
  if (!store) return;
  const had = store.getItem(MODEL_KEY);
  store.removeItem(MODEL_KEY);
  if (had) store.setItem(CLEARED_KEY, "1");
  emit();
}

/** Homepage create-task field. Always empty: the home box stays on OceanLeo. */
export function createBackboneField(): string {
  return "";
}

/** Homepage follow-up field. Always empty: do not send a Cursor backbone. */
export function followUpBackboneField(): string {
  return "";
}
