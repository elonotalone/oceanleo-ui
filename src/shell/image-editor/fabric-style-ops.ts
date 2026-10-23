/**
 * 统一编辑栏（D9）补上的几项样式能力：描边虚线、矩形圆角、便签底色、
 * 文字列表（无 / 项目符号 / 编号）、清除文字样式。
 *
 * 纯函数，`fabric-controller.ts` 调用；控制器本身已经很大，新逻辑放这里。
 */
import type { FabricObject, Group } from "fabric";
import type { FabricNS } from "./editor-objects";

export type StrokeDash = "solid" | "dashed" | "dotted";
export type TextListMode = "none" | "bullet" | "ordered";

export const STROKE_DASHES: readonly StrokeDash[] = ["solid", "dashed", "dotted"];

/** 箭头、便签、表格这些组：真正有描边的是里面的线条 / 路径。 */
function strokeCarriers(fabric: FabricNS, object: FabricObject): FabricObject[] {
  if (object instanceof fabric.Group) {
    return (object as Group)
      .getObjects()
      .filter((child) => child instanceof fabric.Line || child instanceof fabric.Path);
  }
  return [object];
}

export function readStrokeDash(fabric: FabricNS, object: FabricObject): StrokeDash {
  const carrier = strokeCarriers(fabric, object)[0] || object;
  const dash = carrier.strokeDashArray;
  if (!Array.isArray(dash) || dash.length < 2) return "solid";
  const width = Math.max(1, carrier.strokeWidth || 1);
  return dash[0] <= width * 0.6 ? "dotted" : "dashed";
}

export function strokeDashArray(
  dash: StrokeDash,
  width: number,
): number[] | undefined {
  const unit = Math.max(1, width);
  if (dash === "dashed") return [unit * 3, unit * 2];
  if (dash === "dotted") return [Math.max(0.5, unit * 0.2), unit * 1.8];
  return undefined;
}

export function applyStrokeDash(
  fabric: FabricNS,
  object: FabricObject,
  dash: StrokeDash,
): void {
  for (const carrier of strokeCarriers(fabric, object)) {
    carrier.set({
      strokeDashArray: strokeDashArray(dash, carrier.strokeWidth || 1),
      strokeLineCap: dash === "dotted" ? "round" : carrier.strokeLineCap,
    });
    carrier.set("dirty", true);
  }
  object.set("dirty", true);
}

/** 矩形类形状的圆角（rx/ry，对象本地像素）；不是矩形返回 null。 */
export function readRectRadius(fabric: FabricNS, object: FabricObject): number | null {
  if (!(object instanceof fabric.Rect)) return null;
  return Math.round(Number((object as FabricObject & { rx?: number }).rx) || 0);
}

export function applyRectRadius(
  fabric: FabricNS,
  object: FabricObject,
  px: number,
): boolean {
  if (!(object instanceof fabric.Rect)) return false;
  const limit = Math.min(object.width || 0, object.height || 0) / 2;
  const radius = Math.max(0, Math.min(px, limit));
  object.set({ rx: radius, ry: radius });
  return true;
}

/** 便签是「底板矩形 + 文字」的组：填充色改的是底板。 */
export function noteBackground(fabric: FabricNS, object: FabricObject): FabricObject | null {
  if (!(object instanceof fabric.Group)) return null;
  return (
    (object as Group).getObjects().find((child) => child instanceof fabric.Rect) || null
  );
}

const BULLET = /^• /;
const ORDERED = /^\d+\.\s/;

export function textListMode(value: string): TextListMode {
  const lines = value.split("\n");
  if (lines.every((line) => BULLET.test(line))) return "bullet";
  if (lines.every((line) => ORDERED.test(line))) return "ordered";
  return "none";
}

/** 先去掉本功能自己加过的前缀，再按目标形态重新加；别的文字不动。 */
export function applyTextListMode(value: string, mode: TextListMode): string {
  const current = textListMode(value);
  const lines = value.split("\n").map((line) =>
    current === "bullet"
      ? line.replace(BULLET, "")
      : current === "ordered"
        ? line.replace(ORDERED, "")
        : line,
  );
  if (mode === "bullet") return lines.map((line) => `• ${line}`).join("\n");
  if (mode === "ordered") {
    return lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
  }
  return lines.join("\n");
}

/** 清除样式：粗斜体、下划线、删除线、高亮、字距、文字描边回到默认；字体、字号、颜色保留。 */
export const CLEARED_TEXT_PROPS = {
  fontWeight: "normal",
  fontStyle: "normal",
  underline: false,
  linethrough: false,
  textBackgroundColor: "",
  charSpacing: 0,
  stroke: undefined,
  strokeWidth: 0,
} as const;
