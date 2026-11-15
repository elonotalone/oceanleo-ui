import type { Editor } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { richDocImageBorderColor } from "./rich-doc-image-style";
import type { DOMOutputSpec } from "@tiptap/pm/model";

export const RICHDOC_IMAGE_TRANSFORM_DEFAULTS = {
  cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0,
  flipX: false, flipY: false, rotation: 0,
  brightness: 100, contrast: 100, saturation: 100, imageFit: "contain",
};
export type RichDocImageTransform = typeof RICHDOC_IMAGE_TRANSFORM_DEFAULTS;
const keys = Object.keys(RICHDOC_IMAGE_TRANSFORM_DEFAULTS) as Array<keyof RichDocImageTransform>;
const dataKey = (key: string) => `data-richdoc-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
function number(value: unknown, fallback: number, min: number, max: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const result = Number(value);
  return Number.isFinite(result) ? Math.min(max, Math.max(min, result)) : fallback;
}
export function normalizeRichDocImageTransform(attrs: Record<string, unknown>): RichDocImageTransform {
  const crop = (key: string) => number(attrs[key], 0, 0, 90);
  const cropTop = crop("cropTop"), cropLeft = crop("cropLeft");
  return {
    cropTop, cropLeft, cropRight: Math.min(crop("cropRight"), 95 - cropLeft),
    cropBottom: Math.min(crop("cropBottom"), 95 - cropTop),
    flipX: attrs.flipX === true || attrs.flipX === "true",
    flipY: attrs.flipY === true || attrs.flipY === "true",
    rotation: ((number(attrs.rotation, 0, -36000, 36000) % 360) + 360) % 360,
    brightness: number(attrs.brightness, 100, 0, 200), contrast: number(attrs.contrast, 100, 0, 200),
    saturation: number(attrs.saturation, 100, 0, 200),
    imageFit: ["contain", "cover", "fill"].includes(String(attrs.imageFit)) ? String(attrs.imageFit) : "contain",
  };
}
export function selectedRichDocImageAttrs(editor: Editor | null): Record<string, unknown> | null {
  const node = (editor?.state.selection as { node?: { type: { name: string }; attrs: Record<string, unknown> } } | undefined)?.node;
  return node?.type.name === "image" ? node.attrs : null;
}

/** 首次操作未声明尺寸的图片时保留其已渲染尺寸，翻转不应把原图改成 560×315。 */
export function richDocImageFrameAttrs(editor: Editor): Record<string, number> {
  const attrs = selectedRichDocImageAttrs(editor);
  if (!attrs) return {};
  const dom = editor.view.nodeDOM(editor.state.selection.from);
  const element = dom instanceof HTMLElement ? dom : null;
  const image = element?.tagName === "IMG" ? element as HTMLImageElement : element?.querySelector("img");
  const width = Number(attrs.width) || Number(image?.getAttribute("data-richdoc-base-width")) || element?.clientWidth || image?.naturalWidth || 0;
  const height = Number(attrs.height) || Number(image?.getAttribute("data-richdoc-base-height")) || element?.clientHeight || image?.naturalHeight || 0;
  return { ...(width > 0 ? { width } : {}), ...(height > 0 ? { height } : {}) };
}

/** 共享属性入口；不把焦点从浮层数字输入框抢回正文。 */
export function patchRichDocImageTransform(editor: Editor, patch: Record<string, unknown>): boolean {
  const attrs = selectedRichDocImageAttrs(editor);
  if (!editor.isEditable || !attrs) return false;
  return editor.commands.updateAttributes("image", { ...richDocImageFrameAttrs(editor), ...normalizeRichDocImageTransform({ ...attrs, ...patch }) });
}
export function hasRichDocImageTransform(attrs: Record<string, unknown>): boolean {
  return keys.some((key) => attrs[key] !== null && attrs[key] !== undefined);
}
/** DOCX 中旧的圆角/边框/透明度也走同一份真实图像交付。 */
export function hasRichDocImageRendering(attrs: Record<string, unknown>): boolean {
  return hasRichDocImageTransform(attrs) || ["radius", "borderWidth", "borderColor", "opacity"].some((key) => attrs[key] !== null && attrs[key] !== undefined);
}
export function richDocImageGeometry(attrs: Record<string, unknown>) {
  const state = normalizeRichDocImageTransform(attrs);
  const width = number(attrs.width, 560, 1, 20000), height = number(attrs.height, 315, 1, 20000);
  // 裁剪缩小可见窗口，保留原像素比例；旋转后的包围框容纳整个窗口。
  const cropWidth = width * (1 - (state.cropLeft + state.cropRight) / 100);
  const cropHeight = height * (1 - (state.cropTop + state.cropBottom) / 100);
  const angle = state.rotation * Math.PI / 180;
  const precise = (value: number) => Math.round(value * 1e6) / 1e6;
  const frameWidth = precise(Math.abs(cropWidth * Math.cos(angle)) + Math.abs(cropHeight * Math.sin(angle)));
  const frameHeight = precise(Math.abs(cropWidth * Math.sin(angle)) + Math.abs(cropHeight * Math.cos(angle)));
  return { ...state, width, height, cropWidth, cropHeight, frameWidth, frameHeight,
    left: -width * state.cropLeft / 100, top: -height * state.cropTop / 100 };
}

/** 图片仍是一个 block image 节点；裁剪框、变换层都由同一节点序列化。 */
export const RichDocImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), ...Object.fromEntries(keys.map((key) => [key, {
      default: null,
      parseHTML: (element: HTMLElement) => {
        const value = element.getAttribute(dataKey(key));
        return value === null ? null : normalizeRichDocImageTransform({ [key]: value })[key];
      },
      renderHTML: (attrs: Record<string, unknown>) => attrs[key] === null || attrs[key] === undefined
        ? {} : { [dataKey(key)]: String(normalizeRichDocImageTransform(attrs)[key]) },
    }])) };
  },
  renderHTML({ node, HTMLAttributes }): DOMOutputSpec {
    if (!hasRichDocImageTransform(node.attrs)) return ["img", HTMLAttributes];
    const g = richDocImageGeometry(node.attrs);
    const { style, ...imageAttrs } = HTMLAttributes;
    return ["div", { "data-richdoc-image": "1", style: `position:relative;overflow:hidden;box-sizing:content-box;width:${g.frameWidth}px;height:auto;max-width:100%;border-radius:${number(node.attrs.radius, 8, 0, 200)}px;display:${node.attrs.wrap === "inline" ? "inline-block" : "block"};margin:${node.attrs.wrap === "inline" ? "0 .2em" : ".8em auto"};${style || ""}` },
      ["span", { "aria-hidden": "true", style: `display:block;height:0;padding-top:${g.frameHeight / g.frameWidth * 100}%;pointer-events:none` }],
      ["div", { style: `position:absolute;overflow:hidden;width:${g.cropWidth / g.frameWidth * 100}%;height:${g.cropHeight / g.frameHeight * 100}%;left:${(g.frameWidth - g.cropWidth) / 2 / g.frameWidth * 100}%;top:${(g.frameHeight - g.cropHeight) / 2 / g.frameHeight * 100}%;transform:rotate(${g.rotation}deg) scale(${g.flipX ? -1 : 1},${g.flipY ? -1 : 1});filter:brightness(${g.brightness}%) contrast(${g.contrast}%) saturate(${g.saturation}%)` },
        ["img", { ...imageAttrs, "data-richdoc-base-width": g.width, "data-richdoc-base-height": g.height, style: `position:absolute;width:${g.width / g.cropWidth * 100}%;height:${g.height / g.cropHeight * 100}%;left:${g.left / g.cropWidth * 100}%;top:${g.top / g.cropHeight * 100}%;max-width:none;border-radius:0;margin:0;display:block;object-fit:${g.imageFit}` }],
      ],
    ];
  },
});

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
/** 与 HTML 使用同一几何与调色参数。媒体字节内嵌，SVG 不再访问外部资源。 */
export function richDocImageSvg(attrs: Record<string, unknown>, sourceDataUrl: string): string {
  if (!/^data:image\/(?:png|jpeg|gif|bmp|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(sourceDataUrl)) throw new Error("文档图片导出失败");
  const g = richDocImageGeometry(attrs);
  const fit = g.imageFit === "fill" ? "none" : `xMidYMid ${g.imageFit === "cover" ? "slice" : "meet"}`;
  const filterExtent = Math.ceil(Math.hypot(g.frameWidth, g.frameHeight));
  const bitmapScale = Math.min(1, 1024 / Math.max(g.frameWidth, g.frameHeight));
  const bitmapWidth = Math.max(1, Math.round(g.frameWidth * bitmapScale)), bitmapHeight = Math.max(1, Math.round(g.frameHeight * bitmapScale));
  const contrast = g.contrast / 100, slope = g.brightness / 100 * contrast, intercept = (1 - contrast) / 2;
  const radius = number(attrs.radius, 8, 0, 200), border = number(attrs.borderWidth, 0, 0, 24);
  const color = richDocImageBorderColor(attrs.borderColor) || "#a8a29e";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bitmapWidth}" height="${bitmapHeight}" viewBox="0 0 ${g.frameWidth} ${g.frameHeight}"><defs><clipPath id="frame"><rect width="${g.frameWidth}" height="${g.frameHeight}" rx="${radius}"/></clipPath><clipPath id="crop"><rect width="${g.cropWidth}" height="${g.cropHeight}"/></clipPath><filter id="tone" filterUnits="userSpaceOnUse" x="${-filterExtent}" y="${-filterExtent}" width="${filterExtent * 3}" height="${filterExtent * 3}" color-interpolation-filters="sRGB"><feComponentTransfer>${["R", "G", "B"].map((channel) => `<feFunc${channel} type="linear" slope="${slope}" intercept="${intercept}"/>`).join("")}</feComponentTransfer><feColorMatrix type="saturate" values="${g.saturation / 100}"/></filter></defs><g opacity="${number(attrs.opacity, 100, 0, 100) / 100}" clip-path="url(#frame)"><g transform="translate(${g.frameWidth / 2} ${g.frameHeight / 2}) rotate(${g.rotation}) scale(${g.flipX ? -1 : 1} ${g.flipY ? -1 : 1}) translate(${-g.cropWidth / 2} ${-g.cropHeight / 2})"><g clip-path="url(#crop)" filter="url(#tone)"><image x="${g.left}" y="${g.top}" width="${g.width}" height="${g.height}" preserveAspectRatio="${fit}" href="${escapeXml(sourceDataUrl)}"/></g></g><rect x="${border / 2}" y="${border / 2}" width="${Math.max(0, g.frameWidth - border)}" height="${Math.max(0, g.frameHeight - border)}" rx="${radius}" fill="none" stroke="${escapeXml(color)}" stroke-width="${border}"/></g></svg>`;
}

export async function rasterizeRichDocImageSvg(svg: string): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("文档图片导出失败")); image.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("文档图片导出失败");
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((next) => next ? resolve(next) : reject(new Error("文档图片导出失败")), "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}
