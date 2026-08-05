/**
 * TrueType 解析与子集化 —— 导出 PDF 时把「这份文档实际用到的那些字」切出来。
 *
 * 为什么共享包里要有这个东西：手写 PDF 只能用 WinAnsi 的十四款标准字体，
 * 中文一律渲成空白方块。要在纯前端渲出中文，PDF 里必须**嵌一份字形**；
 * 而整包塞一份全字库（思源黑体一份 19 MB、Droid Sans Fallback 3.4 MB）
 * 既进不了 npm 包，也不该让每一份导出的 PDF 都背着几兆字形。
 *
 * 所以字形走两级子集：
 *
 *   1. **构建期**（`scripts/build-plugin-export-font.mjs`）：从系统字体切出一份
 *      有界字集（GB2312 全字 + 拉丁 + 标点），压进随包发布的数据模块。
 *   2. **导出期**（`pdf-render.ts`）：从那份字集再切一次，只留本份文档真正
 *      出现过的字符，嵌进 PDF。一份三十行的台账因此只带几十个字形。
 *
 * 两级用的是本文件同一个 `subsetTrueType()`，没有第二套实现。
 *
 * 只认 `glyf` 轮廓的 TrueType（不认 CFF/OTF、不认 TTC）：CFF 子集要重写
 * CharStrings 与私有字典，代价是本文件的好几倍，而 `glyf` 这一支已经够用。
 * 认不出来的输入一律抛错，不许退化成「少了几个字形」的残包。
 */

interface TableRecord {
  offset: number;
  length: number;
}

export interface TrueTypeFont {
  readonly bytes: Uint8Array;
  readonly unitsPerEm: number;
  readonly numGlyphs: number;
  readonly ascender: number;
  readonly descender: number;
  /** head 里的 xMin / yMin / xMax / yMax，字体单位。 */
  readonly bbox: readonly [number, number, number, number];
  readonly tables: ReadonlyMap<string, TableRecord>;
  /** 字形轮廓的起止（`glyf` 表内的绝对偏移）。 */
  glyphRange(gid: number): { start: number; end: number };
  /** 取不到字形返回 0（`.notdef`），调用方必须自己判，不许当成「空格」。 */
  glyphId(codePoint: number): number;
  advance(gid: number): number;
  leftSideBearing(gid: number): number;
  codePoints(): number[];
}

export interface TrueTypeSubset {
  /** 一份合法、可再解析的 TrueType 字节流。 */
  bytes: Uint8Array;
  /** 新 gid → 原 gid。索引即新 gid。 */
  glyphOrder: number[];
  /** 码位 → 新 gid。原字体没有的码位不在表里。 */
  glyphIdForCodePoint: Map<number, number>;
  /** 原字体查不到的码位，按码位升序。**调用方必须处理，不许静默丢字。** */
  missing: number[];
  unitsPerEm: number;
  /** 逐新 gid 的步进宽度，字体单位。 */
  advances: number[];
}

const SFNT_TRUETYPE = 0x00010000;
const SFNT_TRUE = 0x74727565;
/** 子集必须带上的表。`cvt `/`fpgm`/`prep` 有就一起带，指令还留在字形里。 */
const OPTIONAL_TABLES = ["cvt ", "fpgm", "prep"];

function fail(message: string): never {
  throw new Error(`TrueType 子集化失败：${message}`);
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function parseTrueType(bytes: Uint8Array): TrueTypeFont {
  if (bytes.length < 12) fail("字节流太短，不是字体文件");
  const dv = view(bytes);
  const sfnt = dv.getUint32(0);
  if (sfnt === 0x74746366) fail("这是 TTC 字体集合，本实现只认单份 TrueType");
  if (sfnt === 0x4f54544f) fail("这是 CFF/OTF 轮廓，本实现只认 glyf 轮廓");
  if (sfnt !== SFNT_TRUETYPE && sfnt !== SFNT_TRUE) {
    fail(`认不出的 sfnt 版本 0x${sfnt.toString(16)}`);
  }
  const numTables = dv.getUint16(4);
  const tables = new Map<string, TableRecord>();
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    if (record + 16 > bytes.length) fail("表目录越界");
    const tag = String.fromCharCode(
      bytes[record],
      bytes[record + 1],
      bytes[record + 2],
      bytes[record + 3],
    );
    tables.set(tag, {
      offset: dv.getUint32(record + 8),
      length: dv.getUint32(record + 12),
    });
  }
  for (const tag of ["head", "hhea", "maxp", "hmtx", "loca", "glyf"]) {
    if (!tables.has(tag)) fail(`缺 ${tag} 表`);
  }

  const head = tables.get("head")!.offset;
  const unitsPerEm = dv.getUint16(head + 18);
  if (!unitsPerEm) fail("head.unitsPerEm 为 0");
  const indexToLocFormat = dv.getInt16(head + 50);
  const bbox: [number, number, number, number] = [
    dv.getInt16(head + 36),
    dv.getInt16(head + 38),
    dv.getInt16(head + 40),
    dv.getInt16(head + 42),
  ];

  const hhea = tables.get("hhea")!.offset;
  const ascender = dv.getInt16(hhea + 4);
  const descender = dv.getInt16(hhea + 6);
  const numberOfHMetrics = dv.getUint16(hhea + 34);
  if (!numberOfHMetrics) fail("hhea.numberOfHMetrics 为 0");

  const numGlyphs = dv.getUint16(tables.get("maxp")!.offset + 4);

  const locaTable = tables.get("loca")!;
  const loca = new Uint32Array(numGlyphs + 1);
  for (let i = 0; i <= numGlyphs; i += 1) {
    loca[i] =
      indexToLocFormat === 0
        ? dv.getUint16(locaTable.offset + i * 2) * 2
        : dv.getUint32(locaTable.offset + i * 4);
  }

  const hmtx = tables.get("hmtx")!.offset;
  const glyf = tables.get("glyf")!;
  const cmap = parseCmap(bytes, dv, tables.get("cmap"));

  return {
    bytes,
    unitsPerEm,
    numGlyphs,
    ascender,
    descender,
    bbox,
    tables,
    glyphRange(gid) {
      if (gid < 0 || gid >= numGlyphs) return { start: 0, end: 0 };
      const start = glyf.offset + loca[gid];
      const end = glyf.offset + loca[gid + 1];
      return end > start ? { start, end } : { start: 0, end: 0 };
    },
    glyphId(codePoint) {
      return cmap.get(codePoint) || 0;
    },
    advance(gid) {
      const index = Math.min(Math.max(gid, 0), numberOfHMetrics - 1);
      return dv.getUint16(hmtx + index * 4);
    },
    leftSideBearing(gid) {
      if (gid < numberOfHMetrics) return dv.getInt16(hmtx + gid * 4 + 2);
      const extra = gid - numberOfHMetrics;
      const base = hmtx + numberOfHMetrics * 4 + extra * 2;
      // 尾部的单值 lsb 数组可能被裁掉（合法字体也常见），读不到就当 0。
      return base + 2 <= bytes.length ? dv.getInt16(base) : 0;
    },
    codePoints() {
      return [...cmap.keys()].sort((a, b) => a - b);
    },
  };
}

/** 只认 Unicode 子表：(3,10) format 12 优先，其次 (3,1) / (0,*) format 4。 */
function parseCmap(
  bytes: Uint8Array,
  dv: DataView,
  table: TableRecord | undefined,
): Map<number, number> {
  const map = new Map<number, number>();
  if (!table) return map;
  const base = table.offset;
  const count = dv.getUint16(base + 2);
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < count; i += 1) {
    const record = base + 4 + i * 8;
    const platform = dv.getUint16(record);
    const encoding = dv.getUint16(record + 2);
    const offset = base + dv.getUint32(record + 4);
    const format = dv.getUint16(offset);
    let score = -1;
    if (platform === 3 && encoding === 10 && format === 12) score = 3;
    else if (platform === 3 && encoding === 1 && format === 4) score = 2;
    else if (platform === 0 && (format === 4 || format === 12)) score = 1;
    if (score > bestScore) {
      bestScore = score;
      best = offset;
    }
  }
  if (best < 0) return map;
  const format = dv.getUint16(best);
  if (format === 12) {
    const groups = dv.getUint32(best + 12);
    for (let i = 0; i < groups; i += 1) {
      const group = best + 16 + i * 12;
      const start = dv.getUint32(group);
      const end = dv.getUint32(group + 4);
      const startGid = dv.getUint32(group + 8);
      for (let cp = start; cp <= end; cp += 1) {
        map.set(cp, startGid + (cp - start));
      }
    }
    return map;
  }
  if (format !== 4) return map;
  const segCountX2 = dv.getUint16(best + 6);
  const segCount = segCountX2 / 2;
  const endCodes = best + 14;
  const startCodes = endCodes + segCountX2 + 2;
  const idDeltas = startCodes + segCountX2;
  const idRangeOffsets = idDeltas + segCountX2;
  for (let s = 0; s < segCount; s += 1) {
    const end = dv.getUint16(endCodes + s * 2);
    const start = dv.getUint16(startCodes + s * 2);
    const delta = dv.getInt16(idDeltas + s * 2);
    const rangeOffset = dv.getUint16(idRangeOffsets + s * 2);
    if (start > end) continue;
    for (let cp = start; cp <= end && cp !== 0xffff; cp += 1) {
      let gid: number;
      if (rangeOffset === 0) {
        gid = (cp + delta) & 0xffff;
      } else {
        const index = idRangeOffsets + s * 2 + rangeOffset + (cp - start) * 2;
        if (index + 2 > bytes.length) continue;
        gid = dv.getUint16(index);
        if (gid !== 0) gid = (gid + delta) & 0xffff;
      }
      if (gid) map.set(cp, gid);
    }
  }
  return map;
}

/** 复合字形引用的所有部件，递归展开。 */
function collectComponents(
  font: TrueTypeFont,
  gid: number,
  into: Set<number>,
): void {
  if (into.has(gid)) return;
  into.add(gid);
  const { start, end } = font.glyphRange(gid);
  if (end - start < 10) return;
  const dv = view(font.bytes);
  if (dv.getInt16(start) >= 0) return;
  let cursor = start + 10;
  for (;;) {
    if (cursor + 4 > end) return;
    const flags = dv.getUint16(cursor);
    collectComponents(font, dv.getUint16(cursor + 2), into);
    cursor += 4;
    cursor += flags & 0x0001 ? 4 : 2;
    if (flags & 0x0008) cursor += 2;
    else if (flags & 0x0040) cursor += 4;
    else if (flags & 0x0080) cursor += 8;
    if (!(flags & 0x0020)) return;
  }
}

/** 复合字形里的部件 gid 要换成子集里的新编号，否则画出来是别的字。 */
function remapComposite(
  glyph: Uint8Array,
  newGidOf: Map<number, number>,
): void {
  const dv = view(glyph);
  if (glyph.length < 10 || dv.getInt16(0) >= 0) return;
  let cursor = 10;
  for (;;) {
    if (cursor + 4 > glyph.length) return;
    const flags = dv.getUint16(cursor);
    const component = dv.getUint16(cursor + 2);
    const mapped = newGidOf.get(component);
    if (mapped === undefined) {
      fail(`复合字形引用了没收进子集的部件 ${component}`);
    }
    dv.setUint16(cursor + 2, mapped);
    cursor += 4;
    cursor += flags & 0x0001 ? 4 : 2;
    if (flags & 0x0008) cursor += 2;
    else if (flags & 0x0040) cursor += 4;
    else if (flags & 0x0080) cursor += 8;
    if (!(flags & 0x0020)) return;
  }
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

function checksum(bytes: Uint8Array, offset: number, length: number): number {
  let sum = 0;
  const end = offset + align4(length);
  for (let i = offset; i < end; i += 4) {
    const b0 = bytes[i] || 0;
    const b1 = bytes[i + 1] || 0;
    const b2 = bytes[i + 2] || 0;
    const b3 = bytes[i + 3] || 0;
    sum = (sum + ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3)) >>> 0;
  }
  return sum >>> 0;
}

/**
 * 切一份只含 `codePoints` 的子集。
 *
 * 产出的是一份**可以再被 `parseTrueType()` 读回来**的完整字体：构建期切出来的
 * 有界字集，导出期还要在它上面再切一次，两次用的是同一段代码。
 */
export function subsetTrueType(
  font: TrueTypeFont,
  codePoints: Iterable<number>,
): TrueTypeSubset {
  const wanted = [...new Set(codePoints)].sort((a, b) => a - b);
  const missing: number[] = [];
  const keep = new Set<number>([0]);
  const gidForCodePoint = new Map<number, number>();
  for (const cp of wanted) {
    const gid = font.glyphId(cp);
    if (!gid) {
      missing.push(cp);
      continue;
    }
    gidForCodePoint.set(cp, gid);
    collectComponents(font, gid, keep);
  }
  const glyphOrder = [...keep].sort((a, b) => a - b);
  const newGidOf = new Map<number, number>();
  glyphOrder.forEach((oldGid, newGid) => newGidOf.set(oldGid, newGid));

  const glyphBlobs: Uint8Array[] = [];
  const offsets: number[] = [0];
  let glyfLength = 0;
  for (const oldGid of glyphOrder) {
    const { start, end } = font.glyphRange(oldGid);
    let blob: Uint8Array;
    if (end <= start) {
      blob = new Uint8Array(0);
    } else {
      blob = font.bytes.slice(start, end);
      remapComposite(blob, newGidOf);
      if (blob.length % 4 !== 0) {
        const padded = new Uint8Array(align4(blob.length));
        padded.set(blob);
        blob = padded;
      }
    }
    glyphBlobs.push(blob);
    glyfLength += blob.length;
    offsets.push(glyfLength);
  }

  const glyf = new Uint8Array(glyfLength);
  let cursor = 0;
  for (const blob of glyphBlobs) {
    glyf.set(blob, cursor);
    cursor += blob.length;
  }

  const count = glyphOrder.length;
  const loca = new Uint8Array((count + 1) * 4);
  const locaView = view(loca);
  offsets.forEach((offset, index) => locaView.setUint32(index * 4, offset));

  const advances: number[] = [];
  const hmtx = new Uint8Array(count * 4);
  const hmtxView = view(hmtx);
  glyphOrder.forEach((oldGid, newGid) => {
    const advance = font.advance(oldGid);
    advances.push(advance);
    hmtxView.setUint16(newGid * 4, advance);
    hmtxView.setInt16(newGid * 4 + 2, font.leftSideBearing(oldGid));
  });

  const head = font.bytes.slice(
    font.tables.get("head")!.offset,
    font.tables.get("head")!.offset + 54,
  );
  const headView = view(head);
  headView.setUint32(8, 0); // checkSumAdjustment 先清零，整包算完再填
  headView.setInt16(50, 1); // loca 一律长格式

  const hhea = font.bytes.slice(
    font.tables.get("hhea")!.offset,
    font.tables.get("hhea")!.offset + 36,
  );
  view(hhea).setUint16(34, count);

  const maxpRecord = font.tables.get("maxp")!;
  const maxp = font.bytes.slice(
    maxpRecord.offset,
    maxpRecord.offset + maxpRecord.length,
  );
  view(maxp).setUint16(4, count);

  const parts = new Map<string, Uint8Array>([
    ["cmap", buildCmap(gidForCodePoint, newGidOf)],
    ["glyf", glyf],
    ["head", head],
    ["hhea", hhea],
    ["hmtx", hmtx],
    ["loca", loca],
    ["maxp", maxp],
  ]);
  for (const tag of OPTIONAL_TABLES) {
    const record = font.tables.get(tag);
    if (!record || !record.length) continue;
    parts.set(
      tag,
      font.bytes.slice(record.offset, record.offset + record.length),
    );
  }

  return {
    bytes: assembleSfnt(parts),
    glyphOrder,
    glyphIdForCodePoint: new Map(
      [...gidForCodePoint].map(([cp, oldGid]) => [cp, newGidOf.get(oldGid)!]),
    ),
    missing,
    unitsPerEm: font.unitsPerEm,
    advances,
  };
}

/** format 4，只收 BMP 码位（本链的字集全在 BMP 内）。 */
function buildCmap(
  gidForCodePoint: Map<number, number>,
  newGidOf: Map<number, number>,
): Uint8Array {
  const entries = [...gidForCodePoint]
    .filter(([cp]) => cp <= 0xffff)
    .map(([cp, oldGid]) => [cp, newGidOf.get(oldGid)!] as const)
    .sort((a, b) => a[0] - b[0]);

  const segments: { start: number; end: number; gids: number[] }[] = [];
  for (const [cp, gid] of entries) {
    const last = segments[segments.length - 1];
    if (last && cp === last.end + 1) {
      last.end = cp;
      last.gids.push(gid);
    } else {
      segments.push({ start: cp, end: cp, gids: [gid] });
    }
  }
  // 0xFFFF 收尾段是 format 4 的硬性要求。
  segments.push({ start: 0xffff, end: 0xffff, gids: [0] });

  const segCount = segments.length;
  const glyphIdArrayLength = segments.reduce(
    (sum, segment) => sum + segment.gids.length,
    0,
  );
  const subtableLength = 16 + segCount * 8 + glyphIdArrayLength * 2;
  const bytes = new Uint8Array(4 + 8 + subtableLength);
  const dv = view(bytes);
  dv.setUint16(0, 0); // version
  dv.setUint16(2, 1); // numTables
  dv.setUint16(4, 3); // platformID = Windows
  dv.setUint16(6, 1); // encodingID = Unicode BMP
  dv.setUint32(8, 12);

  const base = 12;
  dv.setUint16(base, 4);
  dv.setUint16(base + 2, subtableLength);
  dv.setUint16(base + 4, 0);
  dv.setUint16(base + 6, segCount * 2);
  const searchRange = 2 * 2 ** Math.floor(Math.log2(segCount));
  dv.setUint16(base + 8, searchRange);
  dv.setUint16(base + 10, Math.log2(searchRange / 2));
  dv.setUint16(base + 12, segCount * 2 - searchRange);

  const endCodes = base + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  const glyphIdArray = idRangeOffsets + segCount * 2;
  let glyphCursor = 0;
  segments.forEach((segment, index) => {
    dv.setUint16(endCodes + index * 2, segment.end);
    dv.setUint16(startCodes + index * 2, segment.start);
    dv.setInt16(idDeltas + index * 2, 0);
    // 一律走 glyphIdArray：段内 gid 不必连续，用 delta 表达会假设它连续。
    const rangeOffset =
      (segCount - index) * 2 + glyphCursor * 2;
    dv.setUint16(idRangeOffsets + index * 2, rangeOffset);
    for (const gid of segment.gids) {
      dv.setUint16(glyphIdArray + glyphCursor * 2, gid);
      glyphCursor += 1;
    }
  });
  return bytes;
}

function assembleSfnt(parts: Map<string, Uint8Array>): Uint8Array {
  const tags = [...parts.keys()].sort();
  const numTables = tags.length;
  const directoryLength = 12 + numTables * 16;
  let total = directoryLength;
  const layout = tags.map((tag) => {
    const data = parts.get(tag)!;
    const offset = total;
    total += align4(data.length);
    return { tag, data, offset };
  });

  const out = new Uint8Array(total);
  const dv = view(out);
  dv.setUint32(0, SFNT_TRUETYPE);
  dv.setUint16(4, numTables);
  const searchRange = 16 * 2 ** Math.floor(Math.log2(numTables));
  dv.setUint16(6, searchRange);
  dv.setUint16(8, Math.log2(searchRange / 16));
  dv.setUint16(10, numTables * 16 - searchRange);

  layout.forEach((entry, index) => {
    const record = 12 + index * 16;
    for (let i = 0; i < 4; i += 1) out[record + i] = entry.tag.charCodeAt(i);
    dv.setUint32(record + 8, entry.offset);
    dv.setUint32(record + 12, entry.data.length);
    out.set(entry.data, entry.offset);
  });
  layout.forEach((entry, index) => {
    dv.setUint32(
      12 + index * 16 + 4,
      checksum(out, entry.offset, entry.data.length),
    );
  });

  const headEntry = layout.find((entry) => entry.tag === "head");
  if (headEntry) {
    const adjustment = (0xb1b0afba - checksum(out, 0, out.length)) >>> 0;
    dv.setUint32(headEntry.offset + 8, adjustment);
  }
  return out;
}
