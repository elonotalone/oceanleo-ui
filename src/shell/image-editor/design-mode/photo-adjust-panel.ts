/**
 * Filerobot-style photo adjustment surface for photo mode (task criterion 3):
 * crop, flip, rotate, colour, filters, annotation, watermark.
 *
 * Definitions only — no React and no Fabric. The panels render these and the
 * controller applies them, which keeps "does the panel offer something the
 * engine cannot do" answerable by a test.
 *
 * Every slider here maps onto a field of the existing `FilterSettings`
 * (`types.ts`) that `buildFilters` (`editor-objects.ts`) already honours.
 * That constraint is enforced by a test rather than by good intentions: a
 * slider with no filter behind it looks broken to the user and is invisible to
 * a reviewer reading only this file.
 */

import { INITIAL_FILTERS, type CropRatio, type FilterSettings } from "../types";

export type PhotoAdjustGroup =
  | "crop"
  | "transform"
  | "color"
  | "filter"
  | "annotate"
  | "watermark";

export const PHOTO_ADJUST_GROUPS: readonly PhotoAdjustGroup[] = Object.freeze([
  "crop",
  "transform",
  "color",
  "filter",
  "annotate",
  "watermark",
]);

export interface PhotoCropPreset {
  id: CropRatio;
  label: string;
  /** Width ÷ height; `null` means unconstrained. */
  ratio: number | null;
}

/**
 * Crop presets reuse the editor's own `CropRatio` union rather than inventing
 * ids. The existing crop command takes those values, so a preset that is not
 * one of them could be shown but never executed.
 */
export const PHOTO_CROP_PRESETS: readonly PhotoCropPreset[] = Object.freeze([
  { id: "free", label: "自由裁剪", ratio: null },
  { id: "1:1", label: "正方形 1:1", ratio: 1 },
  { id: "4:3", label: "横版 4:3", ratio: 4 / 3 },
  { id: "16:9", label: "宽屏 16:9", ratio: 16 / 9 },
  { id: "9:16", label: "竖屏 9:16", ratio: 9 / 16 },
]);

export type PhotoTransformAction =
  | "rotate-left"
  | "rotate-right"
  | "flip-horizontal"
  | "flip-vertical";

export const PHOTO_TRANSFORM_ACTIONS: readonly {
  id: PhotoTransformAction;
  label: string;
}[] = Object.freeze([
  { id: "rotate-left", label: "向左旋转 90°" },
  { id: "rotate-right", label: "向右旋转 90°" },
  { id: "flip-horizontal", label: "水平翻转" },
  { id: "flip-vertical", label: "垂直翻转" },
]);

/** Numeric adjustments; `key` is the `FilterSettings` field each one drives. */
export interface PhotoAdjustSlider {
  key: Extract<
    keyof FilterSettings,
    "brightness" | "contrast" | "saturation" | "blur" | "pixelate"
  >;
  label: string;
  minimum: number;
  maximum: number;
  step: number;
}

export const PHOTO_ADJUST_SLIDERS: readonly PhotoAdjustSlider[] = Object.freeze([
  { key: "brightness", label: "亮度", minimum: -100, maximum: 100, step: 1 },
  { key: "contrast", label: "对比度", minimum: -100, maximum: 100, step: 1 },
  { key: "saturation", label: "饱和度", minimum: -100, maximum: 100, step: 1 },
  { key: "blur", label: "模糊", minimum: 0, maximum: 100, step: 1 },
  { key: "pixelate", label: "像素化", minimum: 0, maximum: 40, step: 1 },
]);

/** On/off adjustments, same rule: each one is a real `FilterSettings` field. */
export interface PhotoAdjustToggle {
  key: Extract<keyof FilterSettings, "grayscale" | "sepia" | "invert">;
  label: string;
}

export const PHOTO_ADJUST_TOGGLES: readonly PhotoAdjustToggle[] = Object.freeze([
  { key: "grayscale", label: "黑白" },
  { key: "sepia", label: "怀旧" },
  { key: "invert", label: "反相" },
]);

export interface PhotoFilterPreset {
  id: string;
  label: string;
  settings: Partial<FilterSettings>;
}

/**
 * One-click looks. Each is a partial `FilterSettings`, applied over the
 * current values by `applyPhotoFilterPreset`, so presets compose with manual
 * slider tweaks instead of silently discarding them.
 */
export const PHOTO_FILTER_PRESETS: readonly PhotoFilterPreset[] = Object.freeze([
  { id: "none", label: "原图", settings: {} },
  { id: "mono", label: "黑白", settings: { grayscale: true, sepia: false, invert: false } },
  { id: "vintage", label: "复古", settings: { sepia: true, grayscale: false, contrast: -10, saturation: -30, brightness: 5 } },
  { id: "vivid", label: "鲜艳", settings: { contrast: 20, saturation: 30, grayscale: false, sepia: false } },
  { id: "soft", label: "柔和", settings: { contrast: -15, saturation: -20, blur: 4 } },
  { id: "sharp-cool", label: "冷冽", settings: { contrast: 15, saturation: -10, brightness: -5 } },
]);

/**
 * Applies a preset without dropping the fields it does not mention.
 * `PHOTO_FILTER_PRESETS[none]` restores the editor's initial values, which is
 * how "back to original" stays a preset rather than a special case.
 */
export function applyPhotoFilterPreset(
  current: FilterSettings,
  preset: PhotoFilterPreset,
): FilterSettings {
  if (preset.id === "none") return { ...INITIAL_FILTERS };
  return { ...current, ...preset.settings };
}

export interface PhotoAnnotationTool {
  id: string;
  label: string;
  /** Fabric object type the tool draws; `path` is the freehand brush. */
  shape: "rect" | "circle" | "line" | "arrow" | "textbox" | "path";
}

export const PHOTO_ANNOTATION_TOOLS: readonly PhotoAnnotationTool[] = Object.freeze([
  { id: "annotate-rect", label: "矩形", shape: "rect" },
  { id: "annotate-circle", label: "圆形", shape: "circle" },
  { id: "annotate-arrow", label: "箭头", shape: "arrow" },
  { id: "annotate-line", label: "直线", shape: "line" },
  { id: "annotate-text", label: "文字标注", shape: "textbox" },
  { id: "annotate-draw", label: "画笔", shape: "path" },
]);

export interface PhotoAdjustSection {
  group: PhotoAdjustGroup;
  label: string;
  /** Photo mode is the point of this panel; design mode keeps colour work. */
  availableInDesignMode: boolean;
}

export const PHOTO_ADJUST_SECTIONS: readonly PhotoAdjustSection[] = Object.freeze([
  { group: "crop", label: "裁剪", availableInDesignMode: false },
  { group: "transform", label: "旋转与翻转", availableInDesignMode: true },
  { group: "color", label: "调色", availableInDesignMode: true },
  { group: "filter", label: "滤镜", availableInDesignMode: true },
  { group: "annotate", label: "标注", availableInDesignMode: false },
  { group: "watermark", label: "水印", availableInDesignMode: true },
]);

export function photoAdjustSectionsFor(
  mode: "photo" | "design",
): readonly PhotoAdjustSection[] {
  return mode === "photo"
    ? PHOTO_ADJUST_SECTIONS
    : PHOTO_ADJUST_SECTIONS.filter((section) => section.availableInDesignMode);
}
