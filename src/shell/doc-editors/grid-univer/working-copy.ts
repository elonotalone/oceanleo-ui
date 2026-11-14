import type { IWorkbookData } from "@univerjs/presets";
import { gridSnapshotIsUsable, isUniverWorkbookSnapshot } from "./same-document";

export const GRID_WORKING_COPY_SCHEMA = "oceanleo.univer-working-document.v1";

export function gridWorkingCopy(payload: unknown): Partial<IWorkbookData> | null {
  return isUniverWorkbookSnapshot(payload) && gridSnapshotIsUsable(payload)
    ? structuredClone(payload) as Partial<IWorkbookData> : null;
}
