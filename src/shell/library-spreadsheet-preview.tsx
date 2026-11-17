"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { LibraryItem } from "./library-data";
import { useUI } from "../i18n/ui/useUI";
import { fetchValidatedSpreadsheetSource } from "./doc-editors/office-file";
import { fetchMediaBlob } from "../lib/media-proxy";
import { officeSourceCacheKey } from "./office-editor/office-source-identity";

type Json = Record<string, unknown>;
const object = (v: unknown): Json => v && typeof v === "object" && !Array.isArray(v) ? v as Json : {};
const number = (v: unknown, fallback = 0) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
const color = (v: unknown): string | undefined => {
  const rgb = typeof v === "string" ? v : String(object(v).rgb || object(v).argb || "");
  const value = rgb.replace(/^#/, "").slice(-6);
  return /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : undefined;
};
export interface PreviewCell { text: string; style?: CSSProperties; image?: string }
export interface PreviewSheet {
  name: string; rows: number; columns: number; cells: Record<string, PreviewCell>;
  widths: Record<number, number>; heights: Record<number, number>;
  merges: { r0: number; c0: number; r1: number; c1: number }[];
}
const safeImage = (v: unknown): string | undefined => typeof v === "string" && /^(?:https?:\/\/|data:image\/(?:png|jpeg|jpg|gif|webp|avif);base64,)/i.test(v) ? v : undefined;

/** Keep the native snapshot's formatting instead of reducing it to cell values. */
export async function sheetsFromSnapshot(value: unknown): Promise<PreviewSheet[]> {
  const snapshot = object(value), styles = object(snapshot.styles), sheets = object(snapshot.sheets);
  const order = Array.isArray(snapshot.sheetOrder) ? snapshot.sheetOrder.map(String) : Object.keys(sheets);
  const xlsx = await import("xlsx");
  const { SSF } = xlsx.default || xlsx;
  return order.filter(id => sheets[id]).map(id => {
    const sheet = object(sheets[id]), data = object(sheet.cellData);
    const result: PreviewSheet = { name: String(sheet.name || id), rows: number(sheet.rowCount, 20), columns: number(sheet.columnCount, 8), cells: {}, widths: {}, heights: {}, merges: [] };
    for (const [r, row] of Object.entries(data)) for (const [c, raw] of Object.entries(object(row))) {
      const cell = object(raw), style = typeof cell.s === "string" ? object(styles[cell.s]) : object(cell.s);
      const body = object(object(cell.p).body);
      let text = typeof body.dataStream === "string" ? body.dataStream.replace(/[\r\n]+$/, "") : String(cell.v ?? "");
      const pattern = object(style.n).pattern;
      if (typeof cell.v === "number" && typeof pattern === "string") { try { text = SSF.format(pattern, cell.v); } catch { /* preserve value */ } }
      const drawings = object(object(cell.p).drawings);
      const drawing = object(Object.values(drawings)[0]);
      result.cells[`${r}:${c}`] = { text, image: safeImage(drawing.source), style: {
        backgroundColor: color(style.bg), color: color(style.cl), fontFamily: typeof style.ff === "string" ? style.ff : undefined,
        fontSize: number(style.fs) ? `${number(style.fs)}pt` : undefined,
        fontWeight: style.bl === 1 ? "bold" : undefined, fontStyle: style.it === 1 ? "italic" : undefined,
        textDecoration: object(style.ul).s ? "underline" : undefined,
        textAlign: ({ 1: "left", 2: "center", 3: "right", 4: "justify" } as const)[number(style.ht) as 1],
        verticalAlign: ({ 1: "top", 2: "middle", 3: "bottom" } as const)[number(style.vt) as 1],
        whiteSpace: style.tb === 3 ? "pre-wrap" : "pre",
      } };
    }
    for (const [c, col] of Object.entries(object(sheet.columnData))) result.widths[+c] = number(object(col).w, number(sheet.defaultColumnWidth, 96));
    for (const [r, row] of Object.entries(object(sheet.rowData))) result.heights[+r] = number(object(row).h, number(sheet.defaultRowHeight, 24));
    for (const raw of Array.isArray(sheet.mergeData) ? sheet.mergeData : []) {
      const merge = object(raw); result.merges.push({ r0: number(merge.startRow), c0: number(merge.startColumn), r1: number(merge.endRow), c1: number(merge.endColumn) });
    }
    // In-cell drawings may also use a drawing-order array with keyed drawing data.
    for (const cell of Object.values(result.cells)) if (cell.image) cell.image = safeImage(cell.image);
    return result;
  });
}

export async function sheetsFromWorkbook(bytes: ArrayBuffer): Promise<PreviewSheet[]> {
  const xlsx = await import("xlsx");
  const XLSX = xlsx.default || xlsx;
  const book = XLSX.read(bytes, { cellStyles: true, cellNF: true });
  const result = book.SheetNames.map(name => {
    const sheet = book.Sheets[name];
    const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    const out: PreviewSheet = { name, rows: range.e.r + 1, columns: range.e.c + 1, cells: {}, widths: {}, heights: {}, merges: [] };
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith("!")) continue;
      const at = XLSX.utils.decode_cell(address), style = object(cell.s);
      out.cells[`${at.r}:${at.c}`] = { text: cell.w ?? XLSX.utils.format_cell(cell), style: { backgroundColor: color(object(style.fgColor).rgb) } };
    }
    (sheet["!cols"] || []).forEach((col, i) => { out.widths[i] = col.wpx || (col.wch ? col.wch * 7 : 96); });
    (sheet["!rows"] || []).forEach((row, i) => { out.heights[i] = row.hpx || (row.hpt ? row.hpt * 4 / 3 : 24); });
    out.merges = (sheet["!merges"] || []).map(m => ({ r0: m.s.r, c0: m.s.c, r1: m.e.r, c1: m.e.c }));
    return out;
  });
  // ExcelJS supplies fonts/fills and images that SheetJS's community reader omits.
  try {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    workbook.worksheets.forEach((sheet, i) => {
      const target = result.find(s => s.name === sheet.name) || result[i]; if (!target) return;
      sheet.eachRow((row, r) => {
        if (row.height) target.heights[r - 1] = row.height * 4 / 3;
        row.eachCell((cell, c) => {
          if (cell.isMerged && cell.master.address !== cell.address) return;
          const key = `${r - 1}:${c - 1}`, existing = target.cells[key] || { text: cell.text };
          const font = cell.font || {}, alignment = cell.alignment || {}, fill = cell.fill;
          existing.style = { ...existing.style, color: color(font.color), fontFamily: font.name, fontSize: font.size ? `${font.size}pt` : undefined,
            fontWeight: font.bold ? "bold" : undefined, fontStyle: font.italic ? "italic" : undefined,
            textDecoration: font.underline ? "underline" : font.strike ? "line-through" : undefined,
            backgroundColor: fill?.type === "pattern" ? color(fill.fgColor) : undefined,
            textAlign: alignment.horizontal === "centerContinuous" ? "center" : alignment.horizontal as CSSProperties["textAlign"],
            verticalAlign: alignment.vertical === "top" || alignment.vertical === "middle" || alignment.vertical === "bottom" ? alignment.vertical : undefined, whiteSpace: alignment.wrapText ? "pre-wrap" : "pre" };
          target.cells[key] = existing;
        });
      });
      sheet.columns?.forEach((col, c) => { if (col.width) target.widths[c] = col.width * 7; });
      for (const image of sheet.getImages()) {
        const media = workbook.getImage(Number(image.imageId));
        const buffer = media?.buffer;
        let src = safeImage(media?.base64);
        if (!src && buffer && /^(png|jpeg|gif)$/.test(media.extension)) {
          const data = new Uint8Array(buffer as ArrayBuffer); let binary = "";
          for (let j = 0; j < data.length; j += 8192) binary += String.fromCharCode(...data.subarray(j, j + 8192));
          src = `data:image/${media.extension};base64,${btoa(binary)}`;
        }
        if (src) {
          const key = `${Math.floor(image.range.tl.row)}:${Math.floor(image.range.tl.col)}`;
          target.cells[key] = { ...(target.cells[key] || { text: "" }), image: src };
        }
      }
    });
  } catch { /* ODS/CSV are read by SheetJS; ODS styles below use its source XML. */ }
  await applyXlsxCellImages(bytes, result);
  await applyOdsStyles(bytes, result);
  return result;
}

/** Excel rich-value cells and WPS DISPIMG store pictures outside worksheet drawings. */
async function applyXlsxCellImages(bytes: ArrayBuffer, sheets: PreviewSheet[]) {
  if (typeof DOMParser === "undefined") return;
  const { unzipSync, strFromU8 } = await import("fflate");
  let zip: Record<string, Uint8Array>, unpacked = 0;
  try { zip = unzipSync(new Uint8Array(bytes), { filter: f => {
    if (!/^xl\/(?:richData\/|media\/|worksheets\/sheet[^/]*\.xml$|metadata\.xml$|workbook\.xml$|_rels\/workbook\.xml.rels$|cellimages\.xml$|_rels\/cellimages\.xml.rels$)/.test(f.name)) return false;
    unpacked += f.originalSize;
    if (unpacked > 64 * 1024 * 1024) throw new Error("XLSX preview limit");
    return true;
  } }); } catch { return; }
  const parse = (path: string) => zip[path] ? new DOMParser().parseFromString(strFromU8(zip[path]), "application/xml") : null;
  const nodes = (root: Document | Element | null, name: string) => Array.from(root?.getElementsByTagNameNS("*", name) || []);
  const resolve = (base: string, target: string) => {
    if (target.startsWith("/")) return target.slice(1);
    const parts = base.split("/"); parts.pop();
    for (const part of target.split("/")) { if (part === "..") parts.pop(); else if (part && part !== ".") parts.push(part); }
    return parts.join("/");
  };
  const relationships = (base: string) => {
    const pieces = base.split("/"), name = pieces.pop();
    return new Map(nodes(parse(`${pieces.join("/")}/_rels/${name}.rels`), "Relationship")
      .filter(el => el.getAttribute("TargetMode") !== "External")
      .map(el => [el.getAttribute("Id") || "", resolve(base, el.getAttribute("Target") || "")]));
  };
  const dataUrl = (path: string | undefined) => {
    if (!path || !/^xl\/media\//.test(path)) return undefined;
    const data = zip[path], ext = path.split(".").pop()?.toLowerCase();
    if (!data || data.length > 4 * 1024 * 1024 || !/^(png|jpe?g|gif|webp|avif)$/.test(ext || "")) return undefined;
    let binary = ""; for (let j = 0; j < data.length; j += 8192) binary += String.fromCharCode(...data.subarray(j, j + 8192));
    return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${btoa(binary)}`;
  };
  const richRels = relationships("xl/richData/richValueRel.xml");
  const richImages = nodes(parse("xl/richData/richValueRel.xml"), "rel").map(el => richRels.get(el.getAttribute("r:id") || ""));
  const richValues = nodes(parse("xl/richData/rdrichvalue.xml"), "rv").map(el => Number(nodes(el, "v")[0]?.textContent));
  const metadata = nodes(parse("xl/metadata.xml"), "valueMetadata")[0] || null;
  const valueIndices = nodes(metadata, "bk").map(el => Number(nodes(el, "rc")[0]?.getAttribute("v")));
  const wpsRels = relationships("xl/cellimages.xml"), wpsImages = new Map<string, string>();
  for (const picture of nodes(parse("xl/cellimages.xml"), "cellImage")) {
    const name = nodes(picture, "cNvPr")[0]?.getAttribute("name"), id = nodes(picture, "blip")[0]?.getAttribute("r:embed");
    if (name && id) { const url = dataUrl(wpsRels.get(id)); if (url) wpsImages.set(name, url); }
  }
  const bookRels = relationships("xl/workbook.xml");
  const bookSheets = nodes(parse("xl/workbook.xml"), "sheet");
  const { utils } = (await import("xlsx")).default || await import("xlsx");
  for (const sheet of bookSheets) {
    const target = sheets.find(s => s.name === sheet.getAttribute("name"));
    const path = bookRels.get(sheet.getAttribute("r:id") || ""); if (!target || !path) continue;
    for (const cell of nodes(parse(path), "c")) {
      let image: string | undefined;
      const vm = Number(cell.getAttribute("vm"));
      if (vm > 0) image = dataUrl(richImages[richValues[valueIndices[vm - 1]]]);
      const formula = nodes(cell, "f")[0]?.textContent || "";
      const wpsName = /(?:_xlfn\.)?DISPIMG\(\s*"([^"]+)"/i.exec(formula)?.[1];
      if (!image && wpsName) image = wpsImages.get(wpsName);
      const address = cell.getAttribute("r");
      if (image && address) {
        const at = utils.decode_cell(address), key = `${at.r}:${at.c}`;
        target.cells[key] = { ...target.cells[key], text: "", image };
      }
    }
  }
}

async function applyOdsStyles(bytes: ArrayBuffer, sheets: PreviewSheet[]) {
  const { unzipSync, strFromU8 } = await import("fflate");
  let zip: Record<string, Uint8Array>;
  let unpacked = 0;
  try { zip = unzipSync(new Uint8Array(bytes), { filter: f => {
    if (!["content.xml", "styles.xml"].includes(f.name) && !f.name.startsWith("Pictures/")) return false;
    unpacked += f.originalSize;
    if (unpacked > 64 * 1024 * 1024) throw new Error("ODS preview limit");
    return true;
  } }); } catch { return; }
  if (!zip["content.xml"] || typeof DOMParser === "undefined") return;
  // XML is inspected as data only. Nothing is inserted as HTML.
  const parse = (data: Uint8Array) => new DOMParser().parseFromString(strFromU8(data), "application/xml");
  const content = parse(zip["content.xml"]);
  const definitions = new Map<string, Element>();
  for (const doc of [zip["styles.xml"] ? parse(zip["styles.xml"]) : null, content]) {
    for (const el of Array.from(doc?.getElementsByTagName("style:style") || [])) definitions.set(el.getAttribute("style:name") || "", el);
  }
  const resolve = (name: string, depth = 0): CSSProperties => {
    const el = definitions.get(name); if (!el || depth > 10) return {};
    const style = resolve(el.getAttribute("style:parent-style-name") || "", depth + 1);
    for (const prop of Array.from(el.children)) {
      const get = (attr: string) => prop.getAttribute(attr) || undefined;
      Object.assign(style, Object.fromEntries(Object.entries({ backgroundColor: get("fo:background-color"), color: get("fo:color"),
        fontSize: get("fo:font-size"), fontWeight: get("fo:font-weight"), fontStyle: get("fo:font-style"), fontFamily: get("style:font-name"),
        textAlign: get("fo:text-align"), verticalAlign: get("style:vertical-align") }).filter(([, v]) => v !== undefined)));
    }
    return style;
  };
  for (const table of Array.from(content.getElementsByTagName("table:table"))) {
    const sheet = sheets.find(s => s.name === table.getAttribute("table:name")); if (!sheet) continue;
    let column = 0;
    for (const col of Array.from(table.getElementsByTagName("table:table-column"))) {
      const def = definitions.get(col.getAttribute("table:style-name") || "");
      const width = def?.getElementsByTagName("style:table-column-properties")[0]?.getAttribute("style:column-width");
      const px = width ? parseFloat(width) * (width.endsWith("cm") ? 96 / 2.54 : width.endsWith("in") ? 96 : width.endsWith("pt") ? 4 / 3 : 1) : 96;
      const repeat = Math.min(sheet.columns - column, Number(col.getAttribute("table:number-columns-repeated") || 1));
      for (let j = 0; j < repeat; j++) sheet.widths[column++] = px;
    }
    let r = 0;
    for (const row of Array.from(table.getElementsByTagName("table:table-row"))) {
      const repeatRows = Math.min(sheet.rows - r, Number(row.getAttribute("table:number-rows-repeated") || 1));
      for (let rr = 0; rr < repeatRows; rr++, r++) {
        let c = 0;
        for (const cell of Array.from(row.children).filter(el => /(?:table-cell|covered-table-cell)$/.test(el.tagName))) {
          const repeat = Math.min(sheet.columns - c, Number(cell.getAttribute("table:number-columns-repeated") || 1));
          const style = resolve(cell.getAttribute("table:style-name") || "");
          const href = cell.getElementsByTagName("draw:image")[0]?.getAttribute("xlink:href")?.replace(/^\.\//, "");
          const imageBytes = href ? zip[href] : undefined;
          const ext = href?.split(".").pop()?.toLowerCase();
          let image: string | undefined;
          if (imageBytes && imageBytes.length <= 4 * 1024 * 1024 && /^(png|jpe?g|gif|webp|avif)$/.test(ext || "")) {
            let binary = ""; for (let j = 0; j < imageBytes.length; j += 8192) binary += String.fromCharCode(...imageBytes.subarray(j, j + 8192));
            image = `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${btoa(binary)}`;
          }
          for (let cc = 0; cc < repeat; cc++, c++) {
            const key = `${r}:${c}`; sheet.cells[key] = { ...(sheet.cells[key] || { text: "" }), style: { ...sheet.cells[key]?.style, ...style }, ...(image ? { image } : {}) };
          }
        }
      }
    }
  }
}

export function SpreadsheetViewer({ item, onResourceError }: { item: LibraryItem; onResourceError?: () => void }) {
  const tt = useUI();
  const [sheets, setSheets] = useState<PreviewSheet[]>([]), [active, setActive] = useState(0);
  const [page, setPage] = useState({ row: 0, col: 0 });
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const projectUrl = String(item.meta.editor_project_url || item.artifact?.renditions.editor_manifest?.url || item.meta.editor_manifest_url || "");
  const sourceRef = useRef({ item, onResourceError, projectUrl });
  sourceRef.current = { item, onResourceError, projectUrl };
  const revision = item.revisionId || item.artifact?.revisionId || "";
  const sourceIdentity = JSON.stringify([
    officeSourceCacheKey(item.url || "", revision, item),
    projectUrl ? officeSourceCacheKey(projectUrl, revision, item) : "",
  ]);
  useEffect(() => {
    const { item, onResourceError, projectUrl } = sourceRef.current;
    let alive = true; const controller = new AbortController();
    setLoading(true); setFailed(false); setActive(0); setPage({ row: 0, col: 0 });
    void (async () => {
      let parsed: PreviewSheet[] = [];
      const embedded = item.meta.snapshot || object(item.meta.project).data;
      if (embedded) parsed = await sheetsFromSnapshot(embedded);
      if (!parsed.length && projectUrl) {
        try {
          const project = JSON.parse(await (await fetchMediaBlob(projectUrl, { signal: controller.signal, maxBytes: 20 * 1024 * 1024 })).text());
          if (project.schema === "oceanleo.grid.univer.v1" && project.data) parsed = await sheetsFromSnapshot(project.data);
        } catch (error) { if (controller.signal.aborted || !item.url) throw error; }
      }
      if (!parsed.length && item.url) parsed = await sheetsFromWorkbook(await fetchValidatedSpreadsheetSource(item.url, item, { signal: controller.signal, maxBytes: 64 * 1024 * 1024, onAccessDenied: onResourceError }));
      if (!parsed.length && Array.isArray(item.meta.rows)) {
        const rows = item.meta.rows as unknown[][];
        parsed = [{ name: "Sheet1", rows: rows.length, columns: Math.max(1, ...rows.map(r => r.length)), widths: {}, heights: {}, merges: [],
          cells: Object.fromEntries(rows.flatMap((row, r) => row.map((v, c) => [`${r}:${c}`, { text: String(v ?? "") }]))) }];
      }
      if (alive) { setSheets(parsed); setFailed(!parsed.length); }
    })().catch(() => { if (alive) setFailed(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; controller.abort(); };
  }, [item.key, sourceIdentity, retry]);
  if (loading) return <div role="status" className="p-6">{tt("正在读取工作簿…")}</div>;
  if (failed || !sheets[active]) return <div className="p-6"><p>{tt("未能读取表格内容。")}</p><button onClick={() => setRetry(v => v + 1)}>{tt("重试")}</button></div>;
  const sheet = sheets[active], rEnd = Math.min(sheet.rows, page.row + 300), cEnd = Math.min(sheet.columns, page.col + 60);
  return <div className="flex h-full min-h-[520px] flex-col bg-white" data-sheet-preview="readonly">
    <div className="flex gap-2 overflow-auto p-2">{sheets.map((s, i) => <button key={i} aria-pressed={active === i} onClick={() => { setActive(i); setPage({ row: 0, col: 0 }); }}>{s.name}</button>)}</div>
    <div className="min-h-0 flex-1 overflow-auto"><table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}><colgroup><col style={{ width: 40 }} />{Array.from({ length: cEnd - page.col }, (_, i) => <col key={i} style={{ width: sheet.widths[i + page.col] || 96 }} />)}</colgroup><tbody>
      {Array.from({ length: rEnd - page.row }, (_, i) => i + page.row).map(r => <tr key={r} style={{ height: sheet.heights[r] || 24 }}><th className="border bg-stone-50 px-2 text-xs font-normal">{r + 1}</th>
        {Array.from({ length: cEnd - page.col }, (_, i) => i + page.col).map(c => {
          const merge = sheet.merges.find(m => r >= m.r0 && r <= m.r1 && c >= m.c0 && c <= m.c1);
          const top = merge ? Math.max(page.row, merge.r0) : r, left = merge ? Math.max(page.col, merge.c0) : c;
          if (merge && (r !== top || c !== left)) return null;
          const cell = sheet.cells[`${merge?.r0 ?? r}:${merge?.c0 ?? c}`];
          return <td key={c} rowSpan={merge ? Math.min(rEnd - 1, merge.r1) - top + 1 : undefined} colSpan={merge ? Math.min(cEnd - 1, merge.c1) - left + 1 : undefined}
            style={{ border: "1px solid #e7e5e4", padding: "4px 8px", minWidth: sheet.widths[c] || 96, verticalAlign: "top", ...cell?.style }}>
            {cell?.image && <img src={cell.image} alt="" style={{ maxWidth: "100%", maxHeight: 160, objectFit: "contain" }} referrerPolicy="no-referrer" />}{cell?.text || ""}</td>;
        })}</tr>)}
    </tbody></table></div>
    <div className="flex items-center gap-3 border-t p-2 text-xs">
      <button disabled={!page.row} onClick={() => setPage(p => ({ ...p, row: Math.max(0, p.row - 300) }))}>{tt("上一页")}</button>
      <span>{page.row + 1}–{rEnd} / {sheet.rows}</span>
      <button disabled={rEnd >= sheet.rows} onClick={() => setPage(p => ({ ...p, row: p.row + 300 }))}>{tt("下一页")}</button>
      <button disabled={!page.col} onClick={() => setPage(p => ({ ...p, col: Math.max(0, p.col - 60) }))}>{tt("前 60 列")}</button>
      <span>{page.col + 1}–{cEnd} / {sheet.columns}</span>
      <button disabled={cEnd >= sheet.columns} onClick={() => setPage(p => ({ ...p, col: p.col + 60 }))}>{tt("后 60 列")}</button>
    </div>
  </div>;
}
