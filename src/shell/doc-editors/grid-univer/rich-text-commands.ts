/** Cell text commands use the same Univer command/history in either chrome mode. */
import type { GridFacadePort } from "./facade-commands";

type Json = Record<string, any>;
export const GRID_SET_RANGE_VALUES = "sheet.command.set-range-values";
export const GRID_RICH_TEXT_LIMIT = 10_000;
export const GRID_RICH_TEXT_COMMAND_IDS = ["list", "line-height", "link", "case", "indent-increase", "indent-decrease"] as const;

/** A cell editor owns unsaved text until native endEditingAsync completes. */
export async function settleGridTextPort(
  port: GridFacadePort,
  current: () => GridFacadePort | null,
  blocked: () => boolean,
): Promise<GridFacadePort | null> {
  if (!port.workbook.isCellEditing?.()) return port;
  try {
    if (!port.workbook.endEditingAsync || !await port.workbook.endEditingAsync(true) || blocked()) return null;
  } catch { return null; }
  const next = current();
  if (!next || next.unitId !== port.unitId || next.sheet.getSheetId() !== port.sheet.getSheetId()) return null;
  for (const key of ["startRow", "endRow", "startColumn", "endColumn"] as const) {
    if (next.selection[key] !== port.selection[key]) return null;
  }
  return next;
}

export function gridTextLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  return !url || /^(https?:\/\/|mailto:|tel:|#)/i.test(url) ? url : null;
}

export function gridRichTextState(cell: Json | null | undefined) {
  const body = cell?.p?.body;
  const paragraph = body?.paragraphs?.[0];
  return {
    list: paragraph?.bullet?.listType === "ORDER_LIST" ? "ordered" : paragraph?.bullet ? "bullet" : "none",
    lineHeight: paragraph?.paragraphStyle?.spacingRule === 2 ? Number(paragraph.paragraphStyle.lineSpacing) : null,
    indent: Number(paragraph?.paragraphStyle?.indentStart?.v ?? 0),
    link: body?.customRanges?.find((range: Json) => range.rangeType === 0)?.properties?.url ?? "",
  };
}

function paragraphs(body: Json): Json[] {
  const existing = new Map((body.paragraphs ?? []).map((paragraph: Json) => [paragraph.startIndex, paragraph]));
  return [...body.dataStream.matchAll(/\r/g)].map((match: RegExpMatchArray) => ({
    ...(existing.get(match.index) as Json | undefined), startIndex: match.index,
  }));
}

/** Unicode case changes can change length (ß → SS); keep all ranges attached to their text. */
function transformStream(doc: Json, transform: (char: string, index: number) => string): void {
  const stream: string = doc.body.dataStream;
  const boundaries = [0];
  let result = "";
  let offset = 0;
  for (const char of stream) {
    const converted = transform(char, offset);
    for (let index = 1; index <= char.length; index += 1) boundaries.push(result.length + (index === char.length ? converted.length : index));
    result += converted;
    offset += char.length;
  }
  const at = (index: number) => boundaries[index] ?? result.length;
  for (const run of doc.body.textRuns ?? []) { run.st = at(run.st); run.ed = at(run.ed); }
  for (const key of ["customRanges", "customDecorations"]) {
    for (const range of doc.body[key] ?? []) {
      range.startIndex = at(range.startIndex); range.endIndex = at(range.endIndex + 1) - 1;
    }
  }
  for (const key of ["paragraphs", "sectionBreaks", "customBlocks", "tables"]) {
    for (const item of doc.body[key] ?? []) if (typeof item.startIndex === "number") item.startIndex = at(item.startIndex);
  }
  doc.body.dataStream = result;
}

function changeCase(doc: Json, mode: string): void {
  let wordStart = true;
  transformStream(doc, (char) => {
    const converted = mode === "upper" ? char.toUpperCase() : mode === "lower" ? char.toLowerCase()
      : wordStart ? char.toUpperCase() : char.toLowerCase();
    wordStart = /\s/.test(char);
    return converted;
  });
}

/** Native ribbon links can include invisible range delimiter characters. */
function removeLinks(doc: Json): void {
  const markers = new Set<number>();
  for (const range of doc.body.customRanges ?? []) {
    if (range.rangeType !== 0) continue;
    if (doc.body.dataStream[range.startIndex] === "\u001f") markers.add(range.startIndex);
    if (doc.body.dataStream[range.endIndex] === "\u001e") markers.add(range.endIndex);
  }
  doc.body.customRanges = (doc.body.customRanges ?? []).filter((range: Json) => range.rangeType !== 0);
  if (markers.size) transformStream(doc, (char, index) => markers.has(index) ? "" : char);
}

/** Pure document patch, also exercised against real Univer save/reopen below the facade. */
export function gridRichTextCell(cell: Json, id: string, value: unknown, style?: Json | null): Json | null {
  // Never turn formulas, dates, booleans or numeric cells into literal text.
  if (cell.f || cell.si || (!cell.p?.body && typeof cell.v !== "string" && cell.v != null)) return null;
  const text = String(cell.v ?? "").replace(/\r\n|\n/g, "\r");
  const p: Json = cell.p?.body ? structuredClone(cell.p) : {
    id: "d", body: { dataStream: `${text}\r\n`,
      textRuns: [{ st: 0, ed: text.length, ts: Object.fromEntries(
        ["ff", "fs", "bl", "it", "ul", "st", "ol", "cl"].filter((key) => style?.[key] != null).map((key) => [key, style![key]]),
      ) }] },
  };
  const body = p.body;
  body.paragraphs = paragraphs(body);
  switch (id) {
    case "case":
      if (value == null) value = body.dataStream === body.dataStream.toUpperCase() ? "lower" : "upper";
      if (!["upper", "lower", "title"].includes(String(value))) return null;
      changeCase(p, String(value));
      break;
    case "line-height": {
      const px = Number(value);
      if (!Number.isFinite(px) || px < 1 || px > 300) return null;
      for (const paragraph of body.paragraphs) paragraph.paragraphStyle = {
        ...paragraph.paragraphStyle, lineSpacing: px, spacingRule: 2, snapToGrid: 0,
      };
      break;
    }
    case "indent-increase":
    case "indent-decrease":
      for (const paragraph of body.paragraphs) {
        const indent = Number(paragraph.paragraphStyle?.indentStart?.v ?? 0);
        paragraph.paragraphStyle = { ...paragraph.paragraphStyle,
          indentStart: { v: Math.max(0, Math.min(480, indent + (id === "indent-increase" ? 24 : -24))) } };
      }
      break;
    case "list": {
      if (!["none", "bullet", "ordered"].includes(String(value))) return null;
      const listId = "oceanleo-cell-list";
      if (value !== "none") {
        const ordered = value === "ordered";
        const listType = ordered ? "ORDER_LIST" : "BULLET_LIST";
        p.lists = { ...p.lists, [listType]: { listType, nestingLevel: [{
          startNumber: 0, glyphFormat: ordered ? "%1." : "●", ...(ordered ? { glyphType: 2 } : { glyphSymbol: "●" }),
          paragraphProperties: { indentStart: { v: 20 }, hanging: { v: 16 } },
          textStyle: {},
        }] } };
      }
      for (const paragraph of body.paragraphs) {
        if (value === "none") delete paragraph.bullet;
        else paragraph.bullet = { listId, listType: value === "ordered" ? "ORDER_LIST" : "BULLET_LIST", nestingLevel: 0 };
      }
      break;
    }
    case "link": {
      const url = gridTextLink(value);
      if (url === null) return null;
      removeLinks(p);
      if (url && !body.dataStream.replace(/\r\n$/, "")) {
        body.dataStream = `${url}\r\n`;
        body.paragraphs = paragraphs(body);
      }
      // Existing non-link annotations/ranges remain intact.
      const length = body.dataStream.replace(/\r\n$/, "").length;
      if (url && length) {
        // Univer's native link model indexes by id across the entire sheet.
        const rangeId = `oceanleo-cell-link-${globalThis.crypto.randomUUID()}`;
        body.customRanges.push({ startIndex: 0, endIndex: length - 1,
          rangeId, rangeType: 0, properties: { url, refId: rangeId } });
      }
      break;
    }
    default: return null;
  }
  return { ...cell, p, v: null, t: 1 };
}

export function runGridRichText(port: GridFacadePort, id: string, value: unknown): unknown {
  if (!port.execute || !port.unitId) return null;
  const s = port.selection;
  if ((s.endRow - s.startRow + 1) * (s.endColumn - s.startColumn + 1) > GRID_RICH_TEXT_LIMIT) return null;
  const cells: Json = {};
  for (let row = s.startRow; row <= s.endRow; row += 1) {
    for (let col = s.startColumn; col <= s.endColumn; col += 1) {
      const range = port.sheet.getRange(row, col, 1, 1);
      if (!range.getCellData) return null;
      const patch = gridRichTextCell(range.getCellData() ?? {}, id, value, range.getCellStyleData?.());
      if (patch) (cells[row] ??= {})[col] = patch;
    }
  }
  if (!Object.keys(cells).length) return null;
  return port.execute(GRID_SET_RANGE_VALUES, {
    unitId: port.unitId, subUnitId: port.sheet.getSheetId(), range: { ...s }, value: cells,
  });
}
