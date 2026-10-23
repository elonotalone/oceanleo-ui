/**
 * ✓ 打勾 / ✗ 打叉（D4）：点哪放哪，生成的是**标准 /Ink 批注**（矢量，Acrobat、
 * Preview、Chrome 都看得见），不是位图。
 *
 * 做法：给 EmbedPDF 的批注插件加两个自定义工具，`pointerHandler` 在按下的那一点
 * 提交一条 Ink 批注。`matchScore` 恒为 0——工具只管「创建」，之后拖动、缩放、删除
 * 由默认的 ink 工具接手（它会按比例缩放笔画点）。
 */
import { PDF_SUBTYPE } from "./pdf-viewer-bridge";

export type PdfMarkKind = "check" | "cross";

export const PDF_MARK_TOOL_IDS: Readonly<Record<PdfMarkKind, string>> = {
  check: "oceanleo-check",
  cross: "oceanleo-cross",
};

export const PDF_MARK_DEFAULTS: Readonly<
  Record<PdfMarkKind, { strokeColor: string; strokeWidth: number }>
> = {
  check: { strokeColor: "#16a34a", strokeWidth: 3 },
  cross: { strokeColor: "#dc2626", strokeWidth: 3 },
};

/** 一个记号的边长（PDF 点）。约等于正文一行的高度，适合填表格里的方框。 */
export const PDF_MARK_SIZE = 16;

interface Point {
  x: number;
  y: number;
}

/** 记号的笔画（页面坐标，原点左上，y 向下）。 */
export function pdfMarkStrokes(
  kind: PdfMarkKind,
  center: Point,
  size = PDF_MARK_SIZE,
): { points: Point[] }[] {
  const at = (dx: number, dy: number) => ({
    x: center.x + dx * size,
    y: center.y + dy * size,
  });
  if (kind === "check") {
    return [{ points: [at(-0.45, 0.02), at(-0.12, 0.38), at(0.48, -0.42)] }];
  }
  return [
    { points: [at(-0.4, -0.4), at(0.4, 0.4)] },
    { points: [at(0.4, -0.4), at(-0.4, 0.4)] },
  ];
}

function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `mark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

/** 一条记号批注（落在页内：靠边时整体挪进来）。 */
export function pdfMarkAnnotation(
  kind: PdfMarkKind,
  pageIndex: number,
  point: Point,
  options: {
    strokeColor?: string;
    strokeWidth?: number;
    size?: number;
    pageSize?: { width: number; height: number };
    id?: string;
  } = {},
) {
  const size = options.size ?? PDF_MARK_SIZE;
  const strokeWidth = options.strokeWidth ?? PDF_MARK_DEFAULTS[kind].strokeWidth;
  const strokeColor = options.strokeColor ?? PDF_MARK_DEFAULTS[kind].strokeColor;
  const half = size / 2 + strokeWidth;
  const page = options.pageSize;
  const center = {
    x: page ? Math.min(Math.max(point.x, half), Math.max(half, page.width - half)) : point.x,
    y: page ? Math.min(Math.max(point.y, half), Math.max(half, page.height - half)) : point.y,
  };
  const inkList = pdfMarkStrokes(kind, center, size);
  const xs = inkList.flatMap((stroke) => stroke.points.map((p) => p.x));
  const ys = inkList.flatMap((stroke) => stroke.points.map((p) => p.y));
  const pad = strokeWidth;
  const left = Math.min(...xs) - pad;
  const top = Math.min(...ys) - pad;
  return {
    id: options.id ?? newId(),
    type: PDF_SUBTYPE.INK,
    pageIndex,
    rect: {
      origin: { x: left, y: top },
      size: {
        width: Math.max(...xs) + pad - left,
        height: Math.max(...ys) + pad - top,
      },
    },
    inkList,
    strokeColor,
    color: strokeColor,
    opacity: 1,
    strokeWidth,
    flags: ["print"],
    subject: kind === "check" ? "Check" : "Cross",
    created: new Date(),
  };
}

interface MarkHandlerContext {
  pageIndex: number;
  pageSize: { width: number; height: number };
  getTool: () => { defaults: Record<string, unknown> } | undefined;
  onCommit: (annotation: never) => void;
}

/** 交给 `config.annotations.tools` 的两条工具定义。 */
export function pdfMarkTools() {
  return (["check", "cross"] as const).map((kind) => ({
    id: PDF_MARK_TOOL_IDS[kind],
    name: kind === "check" ? "Check" : "Cross",
    categories: ["annotation", "markup"],
    matchScore: () => 0,
    interaction: { exclusive: false, cursor: "crosshair" },
    defaults: { type: PDF_SUBTYPE.INK, ...PDF_MARK_DEFAULTS[kind], opacity: 1 },
    behavior: { deactivateToolAfterCreate: false, selectAfterCreate: false },
    pointerHandler: {
      annotationType: PDF_SUBTYPE.INK,
      create(context: MarkHandlerContext) {
        return {
          onPointerDown(position: Point) {
            const defaults = context.getTool()?.defaults ?? {};
            const annotation = pdfMarkAnnotation(kind, context.pageIndex, position, {
              strokeColor:
                typeof defaults.strokeColor === "string" ? defaults.strokeColor : undefined,
              strokeWidth:
                typeof defaults.strokeWidth === "number" ? defaults.strokeWidth : undefined,
              pageSize: context.pageSize,
            });
            context.onCommit(annotation as never);
          },
        };
      },
    },
  }));
}
