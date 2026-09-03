/**
 * Filerobot-style photo adjustment definitions — criterion 3.
 *
 * Pure data: the adjustment presets, crop ratios, annotation tools, and
 * watermark config that drive the photo-mode L2 panels. No React here;
 * the TSX panels import these constants.
 */

// ---------------------------------------------------------------------------
// Crop presets (Filerobot convention)
// ---------------------------------------------------------------------------

export interface CropPreset {
  id: string;
  label: string;
  ratio: number | null;
}

export const PHOTO_CROP_PRESETS: readonly CropPreset[] = Object.freeze([
  { id: "free", label: "自由裁剪", ratio: null },
  { id: "1:1", label: "1:1 正方形", ratio: 1 },
  { id: "4:3", label: "4:3 横版", ratio: 4 / 3 },
  { id: "3:4", label: "3:4 竖版", ratio: 3 / 4 },
  { id: "16:9", label: "16:9 宽屏", ratio: 16 / 9 },
  { id: "9:16", label: "9:16 竖屏", ratio: 9 / 16 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "2:3", label: "2:3", ratio: 2 / 3 },
]);

// ---------------------------------------------------------------------------
// Color adjustment sliders (maps to Fabric filters)
// ---------------------------------------------------------------------------

export interface AdjustmentSlider {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  fabricFilter: string;
}

export const PHOTO_ADJUSTMENTS: readonly AdjustmentSlider[] = Object.freeze([
  { id: "brightness", label: "亮度", min: -100, max: 100, step: 1, defaultValue: 0, fabricFilter: "Brightness" },
  { id: "contrast", label: "对比度", min: -100, max: 100, step: 1, defaultValue: 0, fabricFilter: "Contrast" },
  { id: "saturation", label: "饱和度", min: -100, max: 100, step: 1, defaultValue: 0, fabricFilter: "Saturation" },
  { id: "hue", label: "色相", min: -180, max: 180, step: 1, defaultValue: 0, fabricFilter: "HueRotation" },
  { id: "blur", label: "模糊", min: 0, max: 100, step: 1, defaultValue: 0, fabricFilter: "Blur" },
  { id: "noise", label: "噪点", min: 0, max: 100, step: 1, defaultValue: 0, fabricFilter: "Noise" },
  { id: "pixelate", label: "像素化", min: 1, max: 20, step: 1, defaultValue: 1, fabricFilter: "Pixelate" },
]);

// ---------------------------------------------------------------------------
// Filter presets (one-click looks)
// ---------------------------------------------------------------------------

export interface FilterPreset {
  id: string;
  label: string;
  adjustments: Partial<Record<string, number | boolean>>;
}

export const PHOTO_FILTER_PRESETS: readonly FilterPreset[] = Object.freeze([
  { id: "none", label: "无", adjustments: {} },
  { id: "grayscale", label: "黑白", adjustments: { grayscale: true } },
  { id: "sepia", label: "怀旧", adjustments: { sepia: true } },
  { id: "warm", label: "暖色", adjustments: { brightness: 5, saturation: 15 } },
  { id: "cool", label: "冷色", adjustments: { brightness: -5, hue: -15 } },
  { id: "vivid", label: "鲜艳", adjustments: { contrast: 20, saturation: 30 } },
  { id: "muted", label: "柔和", adjustments: { contrast: -15, saturation: -20 } },
  { id: "vintage", label: "复古", adjustments: { contrast: -10, saturation: -30, brightness: 5, sepia: true } },
]);

// ---------------------------------------------------------------------------
// Annotation tools
// ---------------------------------------------------------------------------

export interface AnnotationTool {
  id: string;
  label: string;
  icon: string;
  fabricType: "rect" | "circle" | "line" | "path" | "text" | "arrow";
}

export const ANNOTATION_TOOLS: readonly AnnotationTool[] = Object.freeze([
  { id: "anno-rect", label: "矩形标注", icon: "shape", fabricType: "rect" },
  { id: "anno-circle", label: "圆形标注", icon: "circle", fabricType: "circle" },
  { id: "anno-arrow", label: "箭头", icon: "arrow", fabricType: "arrow" },
  { id: "anno-line", label: "直线", icon: "line", fabricType: "line" },
  { id: "anno-text", label: "文字标注", icon: "text", fabricType: "text" },
  { id: "anno-draw", label: "自由画笔", icon: "draw", fabricType: "path" },
]);

// ---------------------------------------------------------------------------
// Watermark placement
// ---------------------------------------------------------------------------

export type WatermarkPosition =
  | "tile"
  | "center"
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export interface WatermarkConfig {
  text: string;
  position: WatermarkPosition;
  fontSize: number;
  color: string;
  opacity: number;
  angle: number;
}

export const DEFAULT_WATERMARK: Readonly<WatermarkConfig> = Object.freeze({
  text: "",
  position: "tile",
  fontSize: 24,
  color: "#000000",
  opacity: 0.15,
  angle: -30,
});
