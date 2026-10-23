// ============================================================================
// @oceanleo/ui — 文档里图片的圆角 / 边框 / 不透明度（统一图片栏，D9）
// ----------------------------------------------------------------------------
// 只做 `addGlobalAttributes`，不重名任何已注册扩展。属性落在 image 节点上，
// 进工程 JSON（重开编辑器原样还在），渲染成内联 style（html 交付同样带着）。
// docx / md / txt 这三种格式本身装不下这些样式，交付件里不出现，不算丢：
// 编辑器重开读的是工程 JSON。
// ============================================================================

import { Extension } from "@tiptap/core";

export const RICHDOC_IMAGE_RADIUS_MAX = 200;
export const RICHDOC_IMAGE_BORDER_MAX = 24;

function bounded(value: unknown, minimum: number, maximum: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return null;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

const COLOR_PATTERN = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;

export function richDocImageBorderColor(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text && COLOR_PATTERN.test(text) ? text : null;
}

export interface RichDocImageStyleAttrs {
  radius?: number | null;
  borderWidth?: number | null;
  borderColor?: string | null;
  opacity?: number | null;
}

/** 规范化一组图片样式属性（命令入口与载入都过这里，越界的值夹回范围）。 */
export function normalizeRichDocImageStyle(
  attrs: RichDocImageStyleAttrs,
): RichDocImageStyleAttrs {
  const out: RichDocImageStyleAttrs = {};
  if ("radius" in attrs) out.radius = bounded(attrs.radius, 0, RICHDOC_IMAGE_RADIUS_MAX);
  if ("borderWidth" in attrs) {
    out.borderWidth = bounded(attrs.borderWidth, 0, RICHDOC_IMAGE_BORDER_MAX) || null;
  }
  if ("borderColor" in attrs) out.borderColor = richDocImageBorderColor(attrs.borderColor);
  if ("opacity" in attrs) {
    const opacity = bounded(attrs.opacity, 0, 100);
    out.opacity = opacity === 100 ? null : opacity;
  }
  return out;
}

export const RichDocImageStyle = Extension.create({
  name: "richDocImageStyle",

  addGlobalAttributes() {
    return [
      {
        types: ["image"],
        attributes: {
          radius: {
            default: null,
            parseHTML: (element) => bounded(element.style.borderRadius, 0, RICHDOC_IMAGE_RADIUS_MAX),
            renderHTML: (attributes) => {
              const radius = bounded(attributes.radius, 0, RICHDOC_IMAGE_RADIUS_MAX);
              return radius === null ? {} : { style: `border-radius:${radius}px` };
            },
          },
          borderWidth: {
            default: null,
            parseHTML: (element) =>
              bounded(element.style.borderWidth, 0, RICHDOC_IMAGE_BORDER_MAX) || null,
            renderHTML: (attributes) => {
              const width = bounded(attributes.borderWidth, 0, RICHDOC_IMAGE_BORDER_MAX);
              if (!width) return {};
              const color = richDocImageBorderColor(attributes.borderColor) || "currentColor";
              return { style: `border:${width}px solid ${color}` };
            },
          },
          borderColor: {
            default: null,
            parseHTML: (element) => richDocImageBorderColor(element.style.borderColor),
            // 颜色并进 border 简写里输出；单独再写一次会和宽度为 0 的情况打架。
            renderHTML: () => ({}),
          },
          opacity: {
            default: null,
            parseHTML: (element) => {
              const raw = element.style.opacity;
              if (!raw) return null;
              const value = Number.parseFloat(raw);
              return Number.isFinite(value) && value < 1
                ? Math.max(0, Math.round(value * 100))
                : null;
            },
            renderHTML: (attributes) => {
              const opacity = bounded(attributes.opacity, 0, 100);
              return opacity === null || opacity >= 100
                ? {}
                : { style: `opacity:${opacity / 100}` };
            },
          },
        },
      },
    ];
  },
});
