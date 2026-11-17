import type { IWorkbookData } from "@univerjs/presets";
import { formatWithNumberFormat } from "../grid-format/number-format";
import { selectedChipColors } from "./chip-colors";
import { fetchMediaBlob } from "../../../lib/media-proxy";
type RecordValue = Record<string, any>;
function record(value: unknown): RecordValue { return value && typeof value === "object" ? value as RecordValue : {}; }
function color(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value : String(record(value).rgb || "");
  return /^#?[a-f\d]{6}$/i.test(text) ? (text.startsWith("#") ? text : `#${text}`) : fallback;
}
function resource(snapshot: Partial<IWorkbookData>, name: string): RecordValue {
  const raw = snapshot.resources?.find(entry => entry.name === name)?.data;
  try { return record(typeof raw === "string" ? JSON.parse(raw) : raw); } catch { return {}; }
}
export function gridPreviewLayout(snapshot: Partial<IWorkbookData>) {
  const id = snapshot.sheetOrder?.[0] || Object.keys(snapshot.sheets || {})[0];
  const sheet = record(snapshot.sheets?.[id]);
  const cells = record(sheet.cellData);
  const populatedRows = Object.keys(cells).map(Number).filter(Number.isFinite);
  const populatedCols = Object.values(cells).flatMap(row => Object.keys(record(row)).map(Number)).filter(Number.isFinite);
  const rowCount = Math.min(24, Math.max(1, ...populatedRows.map(value => value + 1)));
  const colCount = Math.min(12, Math.max(1, ...populatedCols.map(value => value + 1)));
  const widths = Array.from({length: colCount}, (_, col) => sheet.columnData?.[col]?.hd ? 0 : Math.max(1, Number(sheet.columnData?.[col]?.w || sheet.defaultColumnWidth || 96)));
  const heights = Array.from({length: rowCount}, (_, row) => sheet.rowData?.[row]?.hd ? 0 : Math.max(1, Number(sheet.rowData?.[row]?.h || sheet.defaultRowHeight || 28)));
  const offsets = (sizes: number[]) => sizes.reduce((all, size) => [...all, all[all.length - 1] + size], [0]);
  return { id, sheet, cells, widths, heights, x: offsets(widths), y: offsets(heights) };
}
async function paintImage(context: CanvasRenderingContext2D, source: string, x: number, y: number, width: number, height: number) {
  if (!source || width <= 0 || height <= 0) return;
  const blob = await fetchMediaBlob(source);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("导出失败，请重试")); image.src = url; });
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    context.drawImage(image, x, y, image.naturalWidth * scale, image.naturalHeight * scale);
  } finally { URL.revokeObjectURL(url); }
}
/** Render the first styled sheet itself; no synthetic header row or grey-grid substitute. */
export async function renderStyledGridPreview(snapshot: Partial<IWorkbookData>): Promise<Blob> {
  const layout = gridPreviewLayout(snapshot);
  const { id, sheet, cells, widths, heights, x, y } = layout;
  const canvas = document.createElement("canvas");
  const scale = Math.min(1.5, 1280 / Math.max(1, x[x.length - 1]), 900 / Math.max(1, y[y.length - 1]));
  canvas.width = Math.max(1, Math.ceil(x[x.length - 1] * scale));
  canvas.height = Math.max(1, Math.ceil(y[y.length - 1] * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("导出失败，请重试");
  ctx.scale(scale, scale); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width / scale, canvas.height / scale);
  const merges = Array.isArray(sheet.mergeData) ? sheet.mergeData : [];
  const rules = resource(snapshot, "SHEET_DATA_VALIDATION_PLUGIN")[id] || [];
  for (let row = 0; row < heights.length; row++) for (let col = 0; col < widths.length; col++) {
    const merge = merges.find((entry: RecordValue) => row >= entry.startRow && row <= entry.endRow && col >= entry.startColumn && col <= entry.endColumn);
    if (merge && (merge.startRow !== row || merge.startColumn !== col)) continue;
    const raw = record(cells[row]?.[col]);
    const style = typeof raw.s === "string" ? record(snapshot.styles?.[raw.s]) : record(raw.s);
    const width = x[Math.min(widths.length, (merge?.endColumn ?? col) + 1)] - x[col];
    const height = y[Math.min(heights.length, (merge?.endRow ?? row) + 1)] - y[row];
    const rule = rules.find((entry: RecordValue) => (entry.ranges || []).some((range: RecordValue) => row >= range.startRow && row <= range.endRow && col >= range.startColumn && col <= range.endColumn));
    const chip = rule && selectedChipColors(rule, raw.v);
    ctx.fillStyle = chip?.background || color(style.bg, "#ffffff"); ctx.fillRect(x[col], y[row], width, height);
    ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = .5; ctx.strokeRect(x[col], y[row], width, height);
    const body = record(raw.p?.body);
    let text = String(raw.v ?? body.dataStream ?? "").replace(/[\r\n]+$/, "");
    if (typeof raw.v === "number" && style.n?.pattern) text = formatWithNumberFormat(raw.v, style.n.pattern).text;
    ctx.save(); ctx.beginPath(); ctx.rect(x[col] + 2, y[row] + 1, Math.max(0, width - 4), Math.max(0, height - 2)); ctx.clip();
    const size = Number(style.fs) || 11;
    ctx.font = `${style.it ? "italic " : ""}${style.bl ? "bold " : ""}${size * 4 / 3}px ${style.ff || "sans-serif"}`;
    ctx.fillStyle = chip?.color || color(style.cl, "#111827"); ctx.textBaseline = "middle";
    ctx.textAlign = style.ht === 2 ? "center" : style.ht === 3 ? "right" : "left";
    const left = style.ht === 2 ? x[col] + width / 2 : style.ht === 3 ? x[col] + width - 5 : x[col] + 5;
    text.split(/\r?\n/).forEach((line, index) => ctx.fillText(line, left, y[row] + height / 2 + index * size * 1.4));
    for (const image of Object.values(record(raw.p?.drawings))) await paintImage(ctx, String(record(image).source || ""), x[col] + 2, y[row] + 2, width - 4, height - 4);
    ctx.restore();
  }
  const drawings = record(resource(snapshot, "SHEET_DRAWING_PLUGIN")[id]?.data);
  for (const raw of Object.values(drawings)) {
    const image = record(raw), from = image.sheetTransform?.from, to = image.sheetTransform?.to;
    if (!from || !to) continue;
    const left = x[from.column], top = y[from.row];
    if (left == null || top == null) continue;
    const right = x[Math.min(widths.length, to.column)] ?? x[x.length - 1];
    const bottom = y[Math.min(heights.length, to.row)] ?? y[y.length - 1];
    const ox = Number(from.columnOffset || 0), oy = Number(from.rowOffset || 0);
    await paintImage(ctx, String(image.source || ""), left + ox, top + oy, right + Number(to.columnOffset || 0) - left - ox, bottom + Number(to.rowOffset || 0) - top - oy);
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("导出失败，请重试")), "image/png"));
}
