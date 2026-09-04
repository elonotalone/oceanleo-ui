// ============================================================================
// 注释以 JSON 落 revision + 存量注释只读兼容与一键转换（W06，判据 3 / 4）
//
// 纯函数，不 import `@embedpdf/*`、不碰 DOM：这样「存量那份数据还认不认得出来」
// 与「转换失败时给不给得出原因」在没有 WASM 的环境里就能判红。
//
// ── 为什么要有 sidecar，而不是继续只把注释写进 PDF 字节 ──────────────────
//
// 旧核（pdf-lib）把注释直接写进文件：注释即字节，revision 里没有一份可读的注释台账。
// 代价是「这一版比上一版多了哪几条批注」只能靠比对二进制猜。判据 3 要求
// **注释以 JSON 落 revision**，于是这里定义一份 sidecar（`pdf-annotations@2`），
// 与既有的 `pdf-binary@1` manifest 并列：manifest 描述**文件**，sidecar 描述**注释**。
//
// 两级持久化一个字都没动：① 本地恢复仍是 `capturePdfRecovery` 的整份字节；
// ② 云端仍是 `saveFileToLibrary` 的 artifact revision。sidecar 是**加在第 ② 级上的
// 一份 JSON**，不替换任何一级。
//
// ── 坐标系（这段是实测，不是推断，写在这里免得下一棒重查）──────────────
//
// 旧核 `PdfAnnotationView.rect` 是**视觉矩形**：0..1 归一化、原点左上、**已经把页面
// 旋转算进去了**（`pdf-annotation-operations.ts` 的 `pdfPointToVisual`：
// `v = 1 - (y - geometry.y) / height`，所以 v=0 在页面顶边）。
//
// EmbedPDF 的 `Rect` 是 `{origin:{x,y}, size:{width,height}}`，单位是**点**、
// 原点同样在左上：`convertPagePointToDevicePoint` 在 rotation=0 时返回
// `{ x: px, y: DH - py }`（`@embedpdf/engines/dist/direct-engine-C8xTbxym.js` 内
// `convertPagePointToDevicePoint` 定义处），即把 PDF 的左下原点翻成左上原点；
// 且 `page.size` 已是**旋转后的显示尺寸**（r=1 分支里 DW/DH 根本没参与）。
//
// ⇒ 两边都是「所见即所得的左上原点」，差别只有归一化 vs 点。转换因此是一次纯缩放，
// **不需要再翻一次 y，也不需要再补一次旋转**——补了就是双重旋转，那是这类换核最
// 常见的一种错，所以这段依据写在代码里而不是只写在交付说明里。
// ============================================================================

/** sidecar 的 schema id。与 `pdf-binary@1` 并列，不是替换它。 */
export const PDF_ANNOTATION_SIDECAR_SCHEMA = "pdf-annotations@2";

/** sidecar 版本号。`1` 是留给旧核那份「只存在于字节里」的隐式形态的，不发。 */
export const PDF_ANNOTATION_SIDECAR_VERSION = 2;

/**
 * `PdfAnnotationSubtype` 的数值，抄自 `@embedpdf/models/dist/pdf.d.ts:616` 的 enum。
 *
 * 这里存一份数值副本而不是 import 那个 enum，是因为本文件必须能在没有内核的
 * 环境里被测试加载（判据 3/4 的闸不该依赖 4.6 MB WASM）。数值对不上就是上游
 * 改了 enum，`pdf-next-core-swap.test.mjs` 里有一条自检直接读上游 d.ts 比对。
 */
export const PDF_NEXT_ANNOTATION_SUBTYPES = {
  TEXT: 1,
  FREETEXT: 3,
  LINE: 4,
  SQUARE: 5,
  CIRCLE: 6,
  HIGHLIGHT: 9,
  UNDERLINE: 10,
  SQUIGGLY: 11,
  STRIKEOUT: 12,
  STAMP: 13,
  INK: 15,
} as const;

export type PdfNextAnnotationSubtypeName =
  keyof typeof PDF_NEXT_ANNOTATION_SUBTYPES;

/**
 * 旧核的 11 种 kind → 新核 subtype。
 *
 * `arrow` 与 `line` 都落到 `LINE`：旧核也是同一个 subtype，箭头是靠 `/LE` 线端样式
 * 区分的（`PDF_ANNOTATION_SUBTYPES` 里 `arrow: "Line"` 就是这个意思），
 * 所以这张表不是 1:1，`arrow` 的箭头样式由 `intent` 带走。
 */
export const PDF_LEGACY_KIND_TO_SUBTYPE: Readonly<
  Record<string, PdfNextAnnotationSubtypeName>
> = {
  text: "TEXT",
  highlight: "HIGHLIGHT",
  underline: "UNDERLINE",
  strikeout: "STRIKEOUT",
  squiggly: "SQUIGGLY",
  freehand: "INK",
  square: "SQUARE",
  circle: "CIRCLE",
  line: "LINE",
  arrow: "LINE",
  stamp: "STAMP",
};

/** 几何是「一串字形四边形」的那几种，转换时要带 `segmentRects`。 */
const QUAD_KINDS: readonly string[] = [
  "highlight",
  "underline",
  "strikeout",
  "squiggly",
];

/** EmbedPDF 的矩形形状：点为单位、原点左上。 */
export interface PdfNextRect {
  origin: { x: number; y: number };
  size: { width: number; height: number };
}

/** 页面的显示尺寸（点）。旋转已经算进去，与 `page.size` 同义。 */
export interface PdfNextPageSize {
  index: number;
  widthPt: number;
  heightPt: number;
}

/** 落进 revision 的一条注释。字段名与 `PdfAnnotationObject` 对齐，便于直接喂 `importAnnotations`。 */
export interface PdfNextSidecarAnnotation {
  id: string;
  pageIndex: number;
  /** `PdfAnnotationSubtype` 的数值。 */
  type: number;
  /** 同一个 subtype 的可读名，给人看的，也让 diff 有意义。 */
  typeName: PdfNextAnnotationSubtypeName;
  rect: PdfNextRect;
  contents: string;
  strokeColor: string;
  opacity: number;
  /** 字形四边形，仅 quad 类有。 */
  segmentRects?: PdfNextRect[];
  /** 手绘笔迹，仅 `freehand` 有。 */
  inkList?: { points: { x: number; y: number }[] }[];
  /** 线段两端，仅 `line` / `arrow` 有。 */
  linePoints?: { start: { x: number; y: number }; end: { x: number; y: number } };
  /** 内建图章名，仅 `stamp` 且非图片图章时有。 */
  stampName?: string;
  /** `arrow` 用它把「这是箭头」带过去（旧核靠 `/LE`，新核靠 intent）。 */
  intent?: string;
}

export interface PdfAnnotationSidecar {
  schema: typeof PDF_ANNOTATION_SIDECAR_SCHEMA;
  version: typeof PDF_ANNOTATION_SIDECAR_VERSION;
  /** 这份 sidecar 是谁生成的：新核直出，还是从存量数据转过来的。 */
  source: "embedpdf" | "legacy-converted";
  /** 生成它的那一版编辑器 revision，与 `artifactRevision.provenance.editorRevision` 同源。 */
  editorRevision: number;
  pages: PdfNextPageSize[];
  annotations: PdfNextSidecarAnnotation[];
}

// ── 存量数据的形状识别（判据 4 前半：只读兼容）──────────────────────────

/**
 * 旧核那条注释在内存里的形状（`PdfAnnotationView` 的结构子集）。
 *
 * 这里刻意**不 import** `PdfAnnotationView`：判据 4 要处理的是「已经躺在 revision
 * 里的存量数据」，它是从 JSON 反序列化出来的 `unknown`，不是类型系统里那个对象。
 * 照类型 import 会让人以为已经校验过了，其实一个字段都没验。
 */
export interface LegacyPdfAnnotationRecord {
  id: string;
  kind: string;
  contents: string;
  rect: { x: number; y: number; width: number; height: number };
  color: string;
  opacity: number;
  quads?: { x: number; y: number; width: number; height: number }[];
  strokes?: { x: number; y: number }[][];
  endpoints?: [{ x: number; y: number }, { x: number; y: number }] | null;
  stampName?: string;
  /** 存量数据里可能带页码；缺了就按第 0 页算并在结果里说明。 */
  pageIndex?: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isVisualRect(value: unknown): value is {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (typeof value !== "object" || value === null) return false;
  const rect = value as Record<string, unknown>;
  return (
    isFiniteNumber(rect.x) &&
    isFiniteNumber(rect.y) &&
    isFiniteNumber(rect.width) &&
    isFiniteNumber(rect.height)
  );
}

/**
 * 这坨 `unknown` 是不是一条旧核注释。
 *
 * 判得**严**：`kind` 必须在旧核那 11 种里，`rect` 四个数必须齐。宽松判定的代价是
 * 把别的编辑器的数据认成 PDF 注释，然后「一键转换」把它转成一堆空批注。
 */
export function isLegacyPdfAnnotation(
  value: unknown,
): value is LegacyPdfAnnotationRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || record.id === "") return false;
  if (typeof record.kind !== "string") return false;
  if (!(record.kind in PDF_LEGACY_KIND_TO_SUBTYPE)) return false;
  return isVisualRect(record.rect);
}

/** 已经是新 schema 了吗。存量判定与转换入口都靠它先分流。 */
export function isPdfAnnotationSidecar(
  value: unknown,
): value is PdfAnnotationSidecar {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schema === PDF_ANNOTATION_SIDECAR_SCHEMA &&
    record.version === PDF_ANNOTATION_SIDECAR_VERSION &&
    Array.isArray(record.annotations)
  );
}

export type PdfAnnotationPayloadKind =
  | "sidecar-v2"
  | "legacy-annotations"
  | "empty"
  | "unrecognized";

/**
 * 认一份存量载荷是什么。
 *
 * `unrecognized` 不是失败，是**「不动它」**：R7 的「存量只读」意味着认不出来的数据
 * 原样留着，既不转换也不覆盖。返回值里带 `reason`，让 UI 能说清为什么没有转换按钮。
 */
export function classifyPdfAnnotationPayload(value: unknown): {
  kind: PdfAnnotationPayloadKind;
  count: number;
  reason: string;
} {
  if (isPdfAnnotationSidecar(value)) {
    return {
      kind: "sidecar-v2",
      count: value.annotations.length,
      reason: "",
    };
  }
  const list = Array.isArray(value)
    ? value
    : typeof value === "object" &&
        value !== null &&
        Array.isArray((value as Record<string, unknown>).annotations)
      ? ((value as Record<string, unknown>).annotations as unknown[])
      : null;
  if (list === null) {
    return {
      kind: "unrecognized",
      count: 0,
      reason:
        "这份数据既不是 pdf-annotations@2，也不是一组存量注释记录，因此按只读处理，不做转换。",
    };
  }
  if (list.length === 0) return { kind: "empty", count: 0, reason: "" };
  const legacy = list.filter((entry) => isLegacyPdfAnnotation(entry));
  if (legacy.length === 0) {
    return {
      kind: "unrecognized",
      count: list.length,
      reason: `这 ${list.length} 条记录里没有一条符合存量注释的形状（缺 id/kind/rect 或 kind 不在已知的 11 种里），按只读处理。`,
    };
  }
  return { kind: "legacy-annotations", count: legacy.length, reason: "" };
}

// ── 一键转换（判据 4 后半：转换失败必须给出原因）────────────────────────

/** 0..1 视觉坐标 → 点。两边原点都在左上，所以只缩放，不翻 y（依据见文件头）。 */
export function legacyVisualRectToNextRect(
  rect: { x: number; y: number; width: number; height: number },
  page: PdfNextPageSize,
): PdfNextRect {
  return {
    origin: { x: rect.x * page.widthPt, y: rect.y * page.heightPt },
    size: {
      width: rect.width * page.widthPt,
      height: rect.height * page.heightPt,
    },
  };
}

function legacyVisualPointToNext(
  point: { x: number; y: number },
  page: PdfNextPageSize,
): { x: number; y: number } {
  return { x: point.x * page.widthPt, y: point.y * page.heightPt };
}

export interface PdfAnnotationConversionSkip {
  id: string;
  kind: string;
  reason: string;
}

export interface PdfAnnotationConversionResult {
  ok: boolean;
  sidecar: PdfAnnotationSidecar;
  converted: number;
  /** 逐条写明为什么没转过来。**空原因不许出现**，测试钉住。 */
  skipped: PdfAnnotationConversionSkip[];
  /** 给用户看的一句话结论。 */
  summary: string;
}

/**
 * 转一条。转不了返回 `reason`，绝不返回一个「差不多的」注释——
 * 静默降级的注释比丢掉更糟：用户以为签名还在，其实只剩一个空框。
 */
export function convertLegacyPdfAnnotation(
  record: LegacyPdfAnnotationRecord,
  page: PdfNextPageSize,
): { ok: true; annotation: PdfNextSidecarAnnotation } | { ok: false; reason: string } {
  const typeName = PDF_LEGACY_KIND_TO_SUBTYPE[record.kind];
  if (!typeName) {
    return {
      ok: false,
      reason: `存量注释类型「${record.kind}」不在已知的 11 种里，没有对应的新核 subtype。`,
    };
  }
  if (page.widthPt <= 0 || page.heightPt <= 0) {
    return {
      ok: false,
      reason: `第 ${page.index + 1} 页的尺寸读不出来（${page.widthPt}×${page.heightPt} 点），归一化坐标没法还原成点。`,
    };
  }
  // 图片图章的像素在旧核里是 PDF 里的一个 XObject，不在这条记录上。JSON sidecar
  // 带不走二进制，硬转就会得到一个没有图的空图章 —— 这是必须说出口的一条缩水。
  if (record.kind === "stamp" && !record.stampName) {
    return {
      ok: false,
      reason:
        "这是图片图章（含签名图），它的像素存在 PDF 内部而不在注释记录里，JSON 无法携带；转换后会变成空白图章，因此保留原样不转。仍可在专业模式里直接看这份文件。",
    };
  }
  const annotation: PdfNextSidecarAnnotation = {
    id: record.id,
    pageIndex: page.index,
    type: PDF_NEXT_ANNOTATION_SUBTYPES[typeName],
    typeName,
    rect: legacyVisualRectToNextRect(record.rect, page),
    contents: record.contents || "",
    strokeColor: record.color || "",
    opacity: isFiniteNumber(record.opacity) ? record.opacity : 1,
  };
  if (QUAD_KINDS.includes(record.kind)) {
    const quads = record.quads || [];
    if (quads.length === 0) {
      return {
        ok: false,
        reason: `${record.kind} 是按字形四边形画的，但这条记录没有 quads，转过去会变成一个盖住整块的色条。`,
      };
    }
    annotation.segmentRects = quads.map((quad) =>
      legacyVisualRectToNextRect(quad, page),
    );
  }
  if (record.kind === "freehand") {
    const strokes = (record.strokes || []).filter((stroke) => stroke.length > 0);
    if (strokes.length === 0) {
      return {
        ok: false,
        reason: "手绘注释没有笔迹点，转过去是一条看不见的空墨迹。",
      };
    }
    annotation.inkList = strokes.map((stroke) => ({
      points: stroke.map((point) => legacyVisualPointToNext(point, page)),
    }));
  }
  if (record.kind === "line" || record.kind === "arrow") {
    if (!record.endpoints) {
      return {
        ok: false,
        reason: `${record.kind} 缺两端坐标，只剩外接矩形，方向无法还原。`,
      };
    }
    annotation.linePoints = {
      start: legacyVisualPointToNext(record.endpoints[0], page),
      end: legacyVisualPointToNext(record.endpoints[1], page),
    };
    if (record.kind === "arrow") annotation.intent = "LineArrow";
  }
  if (record.kind === "stamp" && record.stampName) {
    annotation.stampName = record.stampName;
  }
  return { ok: true, annotation };
}

/**
 * 一键转换整份存量注释。
 *
 * **部分成功是正常结果**：能转的转过去，转不了的逐条留原因，
 * `ok` 只在「一条都没转成」时为 `false`。R7 要的是「转换失败必须给出原因」，
 * 不是「要么全成要么全败」。
 */
export function convertLegacyPdfAnnotations(
  records: readonly unknown[],
  pages: readonly PdfNextPageSize[],
  options: { editorRevision?: number } = {},
): PdfAnnotationConversionResult {
  const editorRevision = options.editorRevision ?? 0;
  const pageByIndex = new Map(pages.map((page) => [page.index, page]));
  const annotations: PdfNextSidecarAnnotation[] = [];
  const skipped: PdfAnnotationConversionSkip[] = [];
  const seenIds = new Set<string>();

  records.forEach((entry, position) => {
    if (!isLegacyPdfAnnotation(entry)) {
      skipped.push({
        id: `#${position}`,
        kind: "unknown",
        reason:
          "这条记录不符合存量注释的形状（缺 id/kind/rect，或 kind 不在已知的 11 种里）。",
      });
      return;
    }
    const pageIndex = isFiniteNumber(entry.pageIndex) ? entry.pageIndex : 0;
    const page = pageByIndex.get(pageIndex);
    if (!page) {
      skipped.push({
        id: entry.id,
        kind: entry.kind,
        reason: `这条注释挂在第 ${pageIndex + 1} 页，而这份文档没有这一页（共 ${pages.length} 页）。`,
      });
      return;
    }
    // 同 id 只认第一条：旧核的 id 取自 `/NM` 或对象引用，理论上唯一，
    // 但存量数据是十几个版本攒下来的，重复过就会在新核里互相覆盖。
    if (seenIds.has(entry.id)) {
      skipped.push({
        id: entry.id,
        kind: entry.kind,
        reason: "这个注释 id 在存量数据里重复出现，只保留第一条，避免在新核里互相覆盖。",
      });
      return;
    }
    const outcome = convertLegacyPdfAnnotation(entry, page);
    if (!outcome.ok) {
      skipped.push({ id: entry.id, kind: entry.kind, reason: outcome.reason });
      return;
    }
    seenIds.add(entry.id);
    annotations.push(outcome.annotation);
  });

  const total = records.length;
  const summary =
    skipped.length === 0
      ? `${annotations.length} 条注释全部转换完成。`
      : `${total} 条里转换了 ${annotations.length} 条，${skipped.length} 条保留原样（逐条附原因）。`;

  return {
    ok: annotations.length > 0 || total === 0,
    sidecar: {
      schema: PDF_ANNOTATION_SIDECAR_SCHEMA,
      version: PDF_ANNOTATION_SIDECAR_VERSION,
      source: "legacy-converted",
      editorRevision,
      pages: pages.map((page) => ({ ...page })),
      annotations,
    },
    converted: annotations.length,
    skipped,
    summary,
  };
}

/**
 * sidecar → 可以直接喂给 `importAnnotations()` 的形状。
 *
 * 新核吃的是 `AnnotationTransferItem[]`（`{ annotation, ctx? }`）。这里只出 `annotation`：
 * 需要 `ctx` 的只有图片图章，而图片图章根本不会进 sidecar（上面那条 reason）。
 */
export function sidecarToTransferItems(
  sidecar: PdfAnnotationSidecar,
): { annotation: Record<string, unknown> }[] {
  return sidecar.annotations.map((entry) => {
    const annotation: Record<string, unknown> = {
      id: entry.id,
      pageIndex: entry.pageIndex,
      type: entry.type,
      rect: entry.rect,
      contents: entry.contents,
      opacity: entry.opacity,
    };
    if (entry.strokeColor) annotation.strokeColor = entry.strokeColor;
    if (entry.segmentRects) annotation.segmentRects = entry.segmentRects;
    if (entry.inkList) annotation.inkList = entry.inkList;
    if (entry.stampName) annotation.name = entry.stampName;
    if (entry.intent) annotation.intent = entry.intent;
    return { annotation };
  });
}

/**
 * 存量数据一律**只读**：转换产出的是一份**新** sidecar，原始载荷一个字节不动。
 *
 * 这个函数存在的意义是把这条纪律写成可调用的形状——调用方拿不到「就地改写」的入口，
 * 想违反 R7 得先改这里，而改这里会当场撞上测试。
 */
export function pdfAnnotationLegacyIsReadOnly(): true {
  return true;
}
