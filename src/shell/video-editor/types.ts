// ============================================================================
// @oceanleo/ui — 多轨视频时间线剪辑器：数据合同（单一事实源）
// ----------------------------------------------------------------------------
// TimelineDoc / TimelineClip 与网关服务端渲染端点
// `POST /v1/video/render-timeline` 的 wire 合同一字不差：字段名、单位（ms）、
// 取值范围都是后端 ffmpeg filter graph 的输入，不得改名/换义。
// ============================================================================

export type TrackKind = "video" | "audio" | "text" | "image";

export type TransitionType = "fade" | "crossfade" | "black";

/** 浏览器和渲染器共享的安全字体；每一项均带中文字体回退。 */
export const TIMELINE_FONT_FAMILIES = [
  "sans-serif", "serif", "monospace", "Noto Sans CJK SC", "DejaVu Sans",
] as const;

export interface TimelineTransition {
  type: TransitionType;
  duration_ms: number;
}

export interface TimelineTextStyle {
  font_size?: number;
  font_family?: string;
  color?: string;
  background?: string;
  /** 文字锚点横向位置，0..1（合成画面宽度的比例）。 */
  x?: number;
  /** 文字块纵向中心位置，0..1（合成画面高度的比例）。 */
  y?: number;
  align?: "left" | "center" | "right" | "justify";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** 行高倍数，0.5..3，默认 1.3。 */
  line_height?: number;
  /** 字符间距（px），-10..100，默认 0。 */
  letter_spacing?: number;
  /** 逐 Unicode 字符换行，保留原有首尾空行。 */
  vertical_text?: boolean;
}

export interface TimelineClip {
  id: string;
  /** 时间线位置。 */
  start_ms: number;
  /** 时间线时长（变速后）。 */
  duration_ms: number;
  /** video/audio/image 源。 */
  source_url?: string;
  /** Owner-checked immutable Library dependency; URLs are resolved only for playback/render. */
  source_ref?: { artifactId: string; revisionId: string; path: string };
  /** 源内起点。 */
  in_ms?: number;
  /** 浏览器元数据探针得到的源总时长，用于阻止预览冻结而导出提前结束。 */
  source_duration_ms?: number;
  /** 默认 1。源消耗时长 = duration_ms * speed。 */
  speed?: number;
  /** 0..2 默认 1；预览通过 Web Audio GainNode 与导出保持同一增益。 */
  volume?: number;
  muted?: boolean;
  /** 文字 clip 内容。 */
  text?: string;
  /** 编辑器的列表内容转换记录；渲染仍只读 text。仅在生成文字未被手工改动时可还原。 */
  text_list?: Readonly<{ kind: "bullet" | "ordered"; source_text: string }>;
  style?: TimelineTextStyle;
  /** 视觉素材（视频/贴图）的中心点位置，0..1。 */
  x?: number;
  y?: number;
  /** 视觉素材宽度占合成画面宽度的比例（0.3 = 30%，视频默认 1）。 */
  scale?: number;
  /** 0..1 默认 1。 */
  opacity?: number;
  /** 顺时针旋转角度，单位 degree。 */
  rotation?: number;
  /** 视觉素材（视频/贴图）水平 / 垂直镜像；先翻转再旋转（与 FFmpeg hflip/vflip→rotate 同序）。 */
  flip_x?: boolean;
  flip_y?: boolean;
  /** 时间线片段块上显示的名字（素材标题）；渲染端不读。 */
  label?: string;
  /** 视觉素材在合成画面比例的缩放框内适配。 */
  fit?: "contain" | "cover" | "stretch";
  /** 源图片裁剪矩形，0..1，相对原图；缺省为完整图片。 */
  crop?: { x: number; y: number; width: number; height: number };
  /** 图片圆角（合成画面的 px），0..1000。 */
  radius?: number;
  border?: { width: number; color: string };
  /** 无障碍文字，仅元数据，不绘入视频。 */
  alt?: string;
  /** 视觉素材基础调色（FFmpeg eq 范围）。 */
  brightness?: number;
  contrast?: number;
  saturation?: number;
  /** 与前一 clip 之间的转场。 */
  transition_in?: TimelineTransition;
}

export interface TimelineTrack {
  id: string;
  kind: TrackKind;
  clips: TimelineClip[];
}

export interface TimelineDoc {
  width: number;
  height: number;
  fps: number;
  tracks: TimelineTrack[];
}
