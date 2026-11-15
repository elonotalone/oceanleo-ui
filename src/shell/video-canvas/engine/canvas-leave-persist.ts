export const CANVAS_AUTOSAVE_MS = 800;

export function canvasShouldFlushOnLeave(
  dirty: boolean,
  saving: boolean,
): boolean {
  return dirty && !saving;
}
