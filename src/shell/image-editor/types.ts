"use client";

// ============================================================================
// @oceanleo/ui — fabric 对象化图片编辑器（高级内容工作台 v2 image 路线）类型
// ----------------------------------------------------------------------------
// 三件套模式同 AdvancedImageEditor / video-editor：useFabricImageEditor 持有
// 全部状态，FabricImageControls（左栏工具）与 FabricImageStage（右区画布）
// 消费同一个 FabricImageEditorState。fabric 模块只在运行时动态 import，
// 公开接口全部是纯数据 + 动作函数，宿主与子组件都不直接触碰 fabric 对象。
// ============================================================================

import type { MutableRefObject } from "react";

export type ExportFormat = "png" | "jpeg" | "webp";

export type ToolId = "select" | "draw" | "erase";

export type ShapeKind = "rect" | "circle" | "ellipse" | "line" | "arrow";

export type CropRatio = "free" | "1:1" | "4:3" | "16:9" | "9:16";

export const CROP_RATIOS: CropRatio[] = ["free", "1:1", "4:3", "16:9", "9:16"];

export type LayerKind =
  | "background"
  | "image"
  | "text"
  | "rect"
  | "circle"
  | "ellipse"
  | "line"
  | "arrow"
  | "path"
  | "note"
  | "signature"
  | "table"
  | "shape";

export type TransformScope = "selected" | "background";

export interface DocSize {
  width: number;
  height: number;
}

export interface CanvasClientPoint {
  clientX: number;
  clientY: number;
}

/** 滤镜滑杆值全部用 UI 尺度（-100..100 / 0..100），换算到 fabric 尺度在 helpers。 */
export interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  pixelate: number;
  grayscale: boolean;
  sepia: boolean;
  invert: boolean;
}

export const INITIAL_FILTERS: FilterSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  pixelate: 0,
  grayscale: false,
  sepia: false,
  invert: false,
};

export interface ShadowSettings {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface TextSettings {
  value: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
  backgroundColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  linethrough: boolean;
  lineHeight: number;
  charSpacing: number;
  align: "left" | "center" | "right";
  stroke: string;
  strokeWidth: number;
}

export interface SelectedSnapshot {
  id: string;
  kind: LayerKind;
  isBackground: boolean;
  opacity: number;
  angle: number;
  flipX: boolean;
  flipY: boolean;
  fill: string;
  stroke: string;
  strokeWidth: number;
  shadow: ShadowSettings;
  /** 仅图片对象有值（clipPath 圆角，画布像素）。 */
  radius: number | null;
  /** 仅文字对象有值。 */
  text: TextSettings | null;
}

export interface TransformInfo {
  scope: TransformScope;
  angle: number;
  flipX: boolean;
  flipY: boolean;
}

export interface FilterInfo {
  scope: TransformScope;
  settings: FilterSettings;
}

export interface LayerEntry {
  id: string;
  kind: LayerKind;
  locked: boolean;
  visible: boolean;
  isBackground: boolean;
  selected: boolean;
}

export interface BrushSettings {
  color: string;
  width: number;
}

export interface CanvasPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: "square", label: "1:1 方形", width: 1080, height: 1080 },
  { id: "classic", label: "4:3 横版", width: 1440, height: 1080 },
  { id: "wide", label: "16:9 宽屏", width: 1920, height: 1080 },
  { id: "xhs", label: "3:4 小红书", width: 1080, height: 1440 },
];

export interface FabricImageEditorOptions {
  /** 宿主注入的 AI 编辑执行器：给 prompt + 当前画布 PNG，回结果图 URL。 */
  onAiEdit?: (prompt: string, image: Blob) => Promise<string>;
  /** 「保存到我的库」成功后的回调（参数为成品 URL）。 */
  onSaved?: (url: string) => void;
}

export interface FabricImageEditorState {
  // ---- 状态 ----
  loading: boolean;
  saving: boolean;
  aiBusy: boolean;
  error: string;
  notice: string;
  savedUrl: string;
  dirty: boolean;
  // ---- 画布挂载 ----
  stageCanvasRef: (element: HTMLCanvasElement | null) => void;
  stageContainerRef: MutableRefObject<HTMLDivElement | null>;
  // ---- 画布设置 ----
  doc: DocSize;
  canvasBackground: string;
  setCanvasBackground: (color: string) => void;
  resizeDoc: (width: number, height: number) => void;
  // ---- 视图 ----
  zoom: number;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  zoomTo100: () => void;
  // ---- 工具 ----
  activeTool: ToolId;
  setActiveTool: (tool: ToolId) => void;
  brush: BrushSettings;
  setBrush: (patch: Partial<BrushSettings>) => void;
  // ---- 添加对象 ----
  addText: () => void;
  addShape: (kind: ShapeKind) => void;
  addStickyNote: () => void;
  addSignature: () => void;
  addTable: (rows?: number, columns?: number) => void;
  addImageFromUrl: (url: string, point?: CanvasClientPoint) => Promise<void>;
  replaceSelectedImageFromUrl: (url: string) => Promise<void>;
  addImageFromFile: (file: File) => Promise<void>;
  // ---- 图层 ----
  layers: LayerEntry[];
  selectLayer: (id: string) => void;
  moveLayer: (id: string, direction: "up" | "down" | "top" | "bottom") => void;
  toggleLayerLock: (id: string) => void;
  toggleLayerVisible: (id: string) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => Promise<void>;
  // ---- 选中对象样式 ----
  selected: SelectedSnapshot | null;
  setSelectedOpacity: (value: number) => void;
  setSelectedShadow: (patch: Partial<ShadowSettings>) => void;
  setSelectedStroke: (patch: { color?: string; width?: number }) => void;
  setSelectedFill: (color: string) => void;
  setSelectedRadius: (px: number) => void;
  setSelectedText: (patch: Partial<TextSettings>) => void;
  deleteSelected: () => void;
  duplicateSelected: () => Promise<void>;
  // ---- 变换（选中对象，否则背景图） ----
  transformInfo: TransformInfo | null;
  rotateTarget: (delta: 90 | -90) => void;
  setTargetAngle: (angle: number) => void;
  flipTarget: (axis: "x" | "y") => void;
  // ---- 滤镜（选中图片对象，否则背景图） ----
  filterInfo: FilterInfo | null;
  setFilter: <K extends keyof FilterSettings>(
    key: K,
    value: FilterSettings[K],
  ) => void;
  resetFilters: () => void;
  // ---- 裁剪 ----
  cropping: boolean;
  cropRatio: CropRatio;
  startCrop: () => void;
  setCropRatio: (ratio: CropRatio) => void;
  confirmCrop: () => Promise<void>;
  cancelCrop: () => void;
  // ---- 撤销 / 重做 ----
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  // ---- 导出 / 保存 ----
  exportFormat: ExportFormat;
  setExportFormat: (format: ExportFormat) => void;
  exportQuality: number;
  setExportQuality: (quality: number) => void;
  exportScale: number;
  setExportScale: (scale: number) => void;
  download: () => void;
  save: () => Promise<string | null>;
  // ---- AI 编辑 ----
  aiAvailable: boolean;
  aiPrompt: string;
  setAiPrompt: (prompt: string) => void;
  runAiEdit: () => Promise<void>;
}
