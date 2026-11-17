/** Load the shared editor families before repainting an imported/reopened workbook. */
import type { IWorkbookData } from "@univerjs/presets";
import { loadEditorTextFonts, type EditorFontText } from "../../image-editor/editor-fonts";

export function gridSnapshotFontTexts(snapshot: Partial<IWorkbookData>): EditorFontText[] {
  const groups = new Map<string, { family: string; weight: number; characters: Set<string> }>();
  const add = (text: string, family: string | null | void, bold: number | null | void) => {
    if (!text || !family) return;
    const key = `${family}:${bold ? 700 : 400}`;
    const group = groups.get(key) ?? { family, weight: bold ? 700 : 400, characters: new Set<string>() };
    for (const character of text) group.characters.add(character);
    groups.set(key, group);
  };
  const resolve = (ref: unknown) => typeof ref === "string" ? snapshot.styles?.[ref] : ref as import("@univerjs/presets").IStyleData | undefined;
  for (const sheet of Object.values(snapshot.sheets ?? {})) {
    for (const [row, line] of Object.entries((sheet.cellData ?? {}) as Record<number, Record<number, import("@univerjs/presets").ICellData>>)) for (const [col, cell] of Object.entries(line)) {
      const style = { ...resolve(sheet.columnData?.[Number(col)]?.s), ...resolve(sheet.rowData?.[Number(row)]?.s), ...resolve(cell.s) };
      add(cell.p?.body?.dataStream ?? String(cell.v ?? ""), style.ff, style.bl);
      const stream = cell.p?.body?.dataStream ?? "";
      for (const run of cell.p?.body?.textRuns ?? []) add(stream.slice(run.st, run.ed), run.ts?.ff ?? style.ff, run.ts?.bl ?? style.bl);
    }
  }
  return [...groups.values()].map((group) => ({ text: [...group.characters].join(""), fontFamily: group.family, fontWeight: group.weight }));
}

export async function loadGridSnapshotFonts(snapshot: Partial<IWorkbookData>): Promise<void> {
  if (typeof document === "undefined" || !document.fonts || typeof FontFace === "undefined") return;
  await loadEditorTextFonts(gridSnapshotFontTexts(snapshot));
}
