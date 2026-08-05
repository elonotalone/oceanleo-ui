/**
 * 把一份导出载荷渲成字节。
 *
 * 五种可渲染形态各自是一件独立的成品文件，互不派生：
 *   xlsx       → 最小合法 SpreadsheetML 包（`grid` 载体）
 *   csv        → 带 BOM 的 UTF-8 文本，Excel 双击不乱码（`grid` 载体）
 *   html       → 自包含单文件网页（`website` 载体）
 *   long-image → 1080 宽的 SVG 长图（`vector_image` 载体）
 *   docx       → 最小合法 WordprocessingML 包（`document` 载体）
 *
 * pdf / srt / vtt 在形态表里已声明为本波不可渲染，走不到这里。
 *
 * 同一份输入必须产出同一串字节：zip 时间戳固定，所有拼装都不读当前时间，
 * 需要时间的地方只用请求里带的 `exportedAt`。幂等键因此稳定，重复导出
 * 不会在库里生出第二件同内容素材。
 */

import { strToU8, zipSync } from "fflate";
import {
  pluginExportFilename,
  type NormalizedPluginExportRequest,
  type PluginExportCell,
  type PluginExportData,
} from "./plugin-export-contract";

export interface RenderedPluginExport {
  bytes: Uint8Array;
  mediaType: string;
  filename: string;
  extension: string;
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // XML 1.0 不接受这些控制字符，Excel 见到会弹修复提示。
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function columnName(index: number): string {
  let name = "";
  let cursor = index;
  do {
    name = String.fromCharCode(65 + (cursor % 26)) + name;
    cursor = Math.floor(cursor / 26) - 1;
  } while (cursor >= 0);
  return name;
}

function cellText(cell: PluginExportCell): string {
  return cell === null || cell === undefined ? "" : String(cell);
}

function isNumericCell(cell: PluginExportCell): cell is number {
  return typeof cell === "number" && Number.isFinite(cell);
}

/* ------------------------------- Excel ---------------------------------- */

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SPREADSHEET_NS =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIP_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
/** 固定 zip 时间戳：同样的输入必须产出同样的字节。 */
const DETERMINISTIC_MTIME = new Date("2026-01-01T00:00:00Z");

function sheetCellXml(
  reference: string,
  cell: PluginExportCell,
  style: number,
): string {
  if (isNumericCell(cell)) {
    return `<c r="${reference}" s="${style}"><v>${cell}</v></c>`;
  }
  const text = cellText(cell);
  if (!text) return `<c r="${reference}" s="${style}"/>`;
  // inlineStr 让包里不需要 sharedStrings 部件，部件表因此更短也更好核对。
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    text,
  )}</t></is></c>`;
}

function worksheetXml(data: PluginExportData): string {
  const lines: string[] = [];
  lines.push(
    `<row r="1">${data.columns
      .map((column, index) =>
        sheetCellXml(`${columnName(index)}1`, column.label, 1),
      )
      .join("")}</row>`,
  );
  data.rows.forEach((row, rowIndex) => {
    const reference = rowIndex + 2;
    lines.push(
      `<row r="${reference}">${data.columns
        .map((_column, colIndex) =>
          sheetCellXml(
            `${columnName(colIndex)}${reference}`,
            row[colIndex] ?? null,
            0,
          ),
        )
        .join("")}</row>`,
    );
  });
  (data.totals || []).forEach((total, index) => {
    const reference = data.rows.length + 2 + index;
    const cells = [
      sheetCellXml(`A${reference}`, total.label, 1),
      sheetCellXml(`B${reference}`, total.value, 1),
    ];
    lines.push(`<row r="${reference}">${cells.join("")}</row>`);
  });
  const lastColumn = columnName(Math.max(0, data.columns.length - 1));
  const lastRow = data.rows.length + 1 + (data.totals?.length || 0);
  return `${XML_HEAD}<worksheet xmlns="${SPREADSHEET_NS}" xmlns:r="${RELATIONSHIP_NS}"><dimension ref="A1:${lastColumn}${Math.max(
    1,
    lastRow,
  )}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${data.columns
    .map(
      (_column, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="18" customWidth="1"/>`,
    )
    .join("")}</cols><sheetData>${lines.join("")}</sheetData></worksheet>`;
}

function stylesXml(): string {
  return `${XML_HEAD}<styleSheet xmlns="${SPREADSHEET_NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function corePropertiesXml(
  request: NormalizedPluginExportRequest,
): string {
  return `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(
    request.title,
  )}</dc:title><dc:creator>OceanLeo</dc:creator><cp:lastModifiedBy>OceanLeo</cp:lastModifiedBy><dc:description>${escapeXml(
    `${request.sourceLabel} · ${request.exportedAt}`,
  )}</dc:description><cp:category>oceanleo.plugin-export.v1</cp:category></cp:coreProperties>`;
}

function renderExcel(request: NormalizedPluginExportRequest): Uint8Array {
  const parts: Record<string, string> = {
    "[Content_Types].xml": `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    "_rels/.rels": `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RELATIONSHIP_NS}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    "docProps/core.xml": corePropertiesXml(request),
    "xl/_rels/workbook.xml.rels": `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RELATIONSHIP_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${RELATIONSHIP_NS}/styles" Target="styles.xml"/></Relationships>`,
    "xl/workbook.xml": `${XML_HEAD}<workbook xmlns="${SPREADSHEET_NS}" xmlns:r="${RELATIONSHIP_NS}"><workbookPr/><sheets><sheet name="${escapeXml(
      sheetName(request.sourceLabel),
    )}" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`,
    "xl/styles.xml": stylesXml(),
    "xl/worksheets/sheet1.xml": worksheetXml(request.data),
  };
  const files: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(parts)) {
    files[name] = strToU8(text);
  }
  return zipSync(files, { level: 6, mtime: DETERMINISTIC_MTIME });
}

/** 工作表名的 31 字符上限与非法字符是 OOXML 的硬约束。 */
function sheetName(value: string): string {
  return (
    value.replace(/[\\/*?:[\]]/g, "-").trim().slice(0, 31) || "Sheet1"
  );
}

/* -------------------------------- CSV ------------------------------------ */

function csvField(value: PluginExportCell): string {
  const text = cellText(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * BOM 是刻意加的：不带 BOM 的 UTF-8 CSV 在中文 Windows 上被 Excel 按 GBK 读，
 * 一打开就是乱码。行尾用 CRLF，同样是为了 Excel。
 */
function renderCsv(request: NormalizedPluginExportRequest): string {
  const { data } = request;
  const lines: string[] = [];
  lines.push(data.columns.map((column) => csvField(column.label)).join(","));
  for (const row of data.rows) {
    lines.push(
      data.columns
        .map((_column, index) => csvField(row[index] ?? null))
        .join(","),
    );
  }
  for (const total of data.totals || []) {
    lines.push([csvField(total.label), csvField(total.value)].join(","));
  }
  return `\ufeff${lines.join("\r\n")}\r\n`;
}

/* -------------------------------- 网页 ----------------------------------- */

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(request: NormalizedPluginExportRequest): string {
  const { data } = request;
  const head = data.columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join("");
  const body = data.rows
    .map(
      (row) =>
        `<tr>${data.columns
          .map((column, index) => {
            const cell = row[index] ?? null;
            const numeric =
              isNumericCell(cell) ||
              column.type === "number" ||
              column.type === "currency";
            return `<td class="${numeric ? "num" : "text"}">${escapeHtml(
              cellText(cell),
            )}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  const totals = (data.totals || [])
    .map(
      (total) =>
        `<li><span>${escapeHtml(total.label)}</span><b>${escapeHtml(
          total.value,
        )}</b></li>`,
    )
    .join("");
  const notes = (data.notes || [])
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="oceanleo.plugin-export.v1">
<title>${escapeHtml(request.title)}</title>
<style>
:root { color-scheme: light; }
body { margin: 0; padding: 32px 20px 56px; background: #fafaf9; color: #1c1917; font: 15px/1.6 "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; }
main { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #e7e5e4; border-radius: 16px; padding: 28px; }
h1 { margin: 0 0 4px; font-size: 22px; }
.meta { margin: 0 0 20px; color: #78716c; font-size: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 8px 10px; border-bottom: 1px solid #f0efee; text-align: left; }
th { background: #f5f5f4; font-weight: 600; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
tr:nth-child(even) td { background: #fcfcfb; }
ul.totals { list-style: none; margin: 20px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 12px; }
ul.totals li { flex: 1 1 180px; background: #f5f5f4; border-radius: 12px; padding: 10px 14px; display: flex; justify-content: space-between; gap: 12px; }
ul.notes { margin: 18px 0 0; padding-left: 20px; color: #57534e; font-size: 13px; }
footer { max-width: 900px; margin: 16px auto 0; color: #a8a29e; font-size: 11px; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(request.title)}</h1>
<p class="meta">${escapeHtml(request.sourceLabel)} · ${escapeHtml(
    request.exportedAt,
  )}</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
${totals ? `<ul class="totals">${totals}</ul>` : ""}
${notes ? `<ul class="notes">${notes}</ul>` : ""}
</main>
<footer>${escapeHtml(request.title)} · OceanLeo</footer>
</body>
</html>
`;
}

/* ------------------------------- Word ------------------------------------ */

const WORD_NS =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function wordParagraph(text: string, options: { bold?: boolean; size?: number } = {}): string {
  const size = options.size ?? 22;
  return `<w:p><w:pPr><w:rPr>${
    options.bold ? "<w:b/>" : ""
  }<w:sz w:val="${size}"/></w:rPr></w:pPr><w:r><w:rPr>${
    options.bold ? "<w:b/>" : ""
  }<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escapeXml(
    text,
  )}</w:t></w:r></w:p>`;
}

function wordCell(text: string, bold: boolean, width: number): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${wordParagraph(
    text,
    { bold },
  )}</w:tc>`;
}

function wordDocumentXml(request: NormalizedPluginExportRequest): string {
  const { data } = request;
  const width = Math.floor(9360 / Math.max(1, data.columns.length));
  const rows: string[] = [];
  rows.push(
    `<w:tr>${data.columns
      .map((column) => wordCell(column.label, true, width))
      .join("")}</w:tr>`,
  );
  for (const row of data.rows) {
    rows.push(
      `<w:tr>${data.columns
        .map((_column, index) =>
          wordCell(cellText(row[index] ?? null), false, width),
        )
        .join("")}</w:tr>`,
    );
  }
  const body = [
    wordParagraph(request.title, { bold: true, size: 32 }),
    wordParagraph(`${request.sourceLabel} · ${request.exportedAt}`, {
      size: 18,
    }),
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D6D3D1"/><w:left w:val="single" w:sz="4" w:color="D6D3D1"/><w:bottom w:val="single" w:sz="4" w:color="D6D3D1"/><w:right w:val="single" w:sz="4" w:color="D6D3D1"/><w:insideH w:val="single" w:sz="4" w:color="D6D3D1"/><w:insideV w:val="single" w:sz="4" w:color="D6D3D1"/></w:tblBorders></w:tblPr>${rows.join(
      "",
    )}</w:tbl>`,
    ...(data.totals || []).map((total) =>
      wordParagraph(`${total.label}：${total.value}`, { bold: true }),
    ),
    ...(data.notes || []).map((note) => wordParagraph(note, { size: 18 })),
  ].join("");
  return `${XML_HEAD}<w:document xmlns:w="${WORD_NS}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
}

function renderDocx(request: NormalizedPluginExportRequest): Uint8Array {
  const parts: Record<string, string> = {
    "[Content_Types].xml": `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    "_rels/.rels": `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RELATIONSHIP_NS}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    "docProps/core.xml": corePropertiesXml(request),
    "word/_rels/document.xml.rels": `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
    "word/document.xml": wordDocumentXml(request),
  };
  const files: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(parts)) {
    files[name] = strToU8(text);
  }
  return zipSync(files, { level: 6, mtime: DETERMINISTIC_MTIME });
}

/* ------------------------------ 图文长图 --------------------------------- */

const POSTER_WIDTH = 1080;
const POSTER_PADDING = 64;
const POSTER_ROW_HEIGHT = 64;

/** 单行截断：长图一行放不下就省略，不做换行排版。 */
function posterText(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function renderPoster(request: NormalizedPluginExportRequest): string {
  const { data } = request;
  const columns = data.columns.slice(0, 4);
  const rows = data.rows.slice(0, 40);
  const totals = data.totals || [];
  const notes = data.notes || [];
  const headerHeight = 200;
  const tableTop = headerHeight + 24;
  const tableHeight = POSTER_ROW_HEIGHT * (rows.length + 1);
  const totalsTop = tableTop + tableHeight + 32;
  const totalsHeight = totals.length ? 56 * totals.length + 24 : 0;
  const notesTop = totalsTop + totalsHeight + (notes.length ? 16 : 0);
  const notesHeight = notes.length ? 34 * notes.length + 24 : 0;
  const height = Math.round(notesTop + notesHeight + 96);
  const columnWidth =
    (POSTER_WIDTH - POSTER_PADDING * 2) / Math.max(1, columns.length);
  const parts: string[] = [];
  parts.push(
    `<rect width="${POSTER_WIDTH}" height="${height}" fill="#fafaf9"/>`,
    `<rect x="0" y="0" width="${POSTER_WIDTH}" height="${headerHeight}" fill="#1c1917"/>`,
    `<text x="${POSTER_PADDING}" y="96" fill="#ffffff" font-size="44" font-weight="700">${escapeXml(
      posterText(request.title, 22),
    )}</text>`,
    `<text x="${POSTER_PADDING}" y="146" fill="#a8a29e" font-size="24">${escapeXml(
      `${posterText(request.sourceLabel, 12)} · ${request.exportedAt.slice(0, 10)}`,
    )}</text>`,
  );
  columns.forEach((column, index) => {
    parts.push(
      `<text x="${POSTER_PADDING + columnWidth * index}" y="${
        tableTop + 40
      }" fill="#78716c" font-size="24" font-weight="600">${escapeXml(
        posterText(column.label, 10),
      )}</text>`,
    );
  });
  rows.forEach((row, rowIndex) => {
    const y = tableTop + POSTER_ROW_HEIGHT * (rowIndex + 1);
    if (rowIndex % 2 === 0) {
      parts.push(
        `<rect x="${POSTER_PADDING - 16}" y="${y - 24}" width="${
          POSTER_WIDTH - POSTER_PADDING * 2 + 32
        }" height="${POSTER_ROW_HEIGHT}" rx="12" fill="#ffffff"/>`,
      );
    }
    columns.forEach((_column, colIndex) => {
      parts.push(
        `<text x="${POSTER_PADDING + columnWidth * colIndex}" y="${
          y + 16
        }" fill="#1c1917" font-size="26">${escapeXml(
          posterText(cellText(row[colIndex] ?? null), 12),
        )}</text>`,
      );
    });
  });
  totals.forEach((total, index) => {
    const y = totalsTop + 56 * index;
    parts.push(
      `<rect x="${POSTER_PADDING - 16}" y="${y - 4}" width="${
        POSTER_WIDTH - POSTER_PADDING * 2 + 32
      }" height="48" rx="12" fill="#f5f5f4"/>`,
      `<text x="${POSTER_PADDING}" y="${y + 28}" fill="#57534e" font-size="26">${escapeXml(
        posterText(total.label, 16),
      )}</text>`,
      `<text x="${POSTER_WIDTH - POSTER_PADDING}" y="${
        y + 28
      }" fill="#1c1917" font-size="28" font-weight="700" text-anchor="end">${escapeXml(
        String(total.value),
      )}</text>`,
    );
  });
  notes.forEach((note, index) => {
    parts.push(
      `<text x="${POSTER_PADDING}" y="${
        notesTop + 34 * index + 24
      }" fill="#78716c" font-size="22">${escapeXml(posterText(note, 40))}</text>`,
    );
  });
  parts.push(
    `<text x="${POSTER_PADDING}" y="${
      height - 40
    }" fill="#a8a29e" font-size="20">OceanLeo</text>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${height}" viewBox="0 0 ${POSTER_WIDTH} ${height}" font-family="PingFang SC, Microsoft YaHei, system-ui, sans-serif">
${parts.join("\n")}
</svg>
`;
}

/* ------------------------------------------------------------------------ */

/**
 * 唯一的渲染入口。请求必须先过 `normalizePluginExportRequest()`，
 * 所以这里见到的形态一定是可渲染的；`default` 分支只在形态表新增了
 * 没接渲染器的取值时才会触发，那时宁可抛错也不许交一个空文件。
 */
export function renderPluginExport(
  request: NormalizedPluginExportRequest,
): RenderedPluginExport {
  const common = {
    mediaType: request.form.mediaType,
    filename: pluginExportFilename(request),
    extension: request.form.extension,
  };
  switch (request.form.id) {
    case "xlsx":
      return { ...common, bytes: renderExcel(request) };
    case "csv":
      return { ...common, bytes: strToU8(renderCsv(request)) };
    case "html":
      return { ...common, bytes: strToU8(renderHtml(request)) };
    case "long-image":
      return { ...common, bytes: strToU8(renderPoster(request)) };
    case "docx":
      return { ...common, bytes: renderDocx(request) };
    default:
      throw new Error(
        `${request.form.label}还没有接上渲染器，已拒绝产出空文件。`,
      );
  }
}
