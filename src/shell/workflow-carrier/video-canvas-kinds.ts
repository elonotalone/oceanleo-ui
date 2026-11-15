/**
 * 视频画布节点种类：显示名、色带、「加节点」抽屉里的可选项。
 *
 * 显示名是中文原文，渲染处一律过 `tt()`（译文在 `editor-overhaul-copy-w16.ts`）。
 * 色带是节点卡左侧的细条和种类小标签，**不是**节点底色：底色跟主题走
 * （`video-canvas-theme.ts`）。两档各给一组色值，保证在各自底色上 ≥3:1。
 */

export type VideoKindFamily = "input" | "media" | "structure" | "output" | "logic";

export interface VideoKindSpec {
  label: string;
  family: VideoKindFamily;
}

/**
 * v2 core 的 12 种、官方模板的 `prompt` / `generate`、以及 v1 本地图的 10 种。
 * 认不出的 kind 不报错：按 `structure` 族显示原始 kind 名。
 */
const KIND_SPECS: Readonly<Record<string, VideoKindSpec>> = {
  // 官方模板（v2 文件里的原样 kind）
  prompt: { label: "创意简报", family: "input" },
  generate: { label: "生成镜头", family: "media" },
  // v2 core
  text: { label: "文字", family: "input" },
  script: { label: "脚本", family: "input" },
  subtitle: { label: "字幕", family: "input" },
  image: { label: "图片", family: "media" },
  video: { label: "视频", family: "media" },
  audio: { label: "音频", family: "media" },
  model: { label: "模型", family: "media" },
  storyboard: { label: "分镜", family: "structure" },
  director: { label: "导演台", family: "structure" },
  timeline: { label: "时间线", family: "structure" },
  composite: { label: "合成", family: "structure" },
  delivery: { label: "成片输出", family: "output" },
  // v1 本地图
  source: { label: "素材源", family: "media" },
  trim: { label: "裁剪", family: "logic" },
  concat: { label: "拼接", family: "structure" },
  overlay: { label: "叠加", family: "structure" },
  transition: { label: "转场", family: "logic" },
  filter: { label: "滤镜", family: "logic" },
  "audio-mix": { label: "混音", family: "media" },
  branch: { label: "分支", family: "logic" },
  output: { label: "输出", family: "output" },
};

export function videoKindSpec(kind: string): VideoKindSpec {
  return KIND_SPECS[kind] || { label: kind || "节点", family: "structure" };
}

/** Every label above, so the copy book can be checked against it. */
export const VIDEO_KIND_LABELS: readonly string[] = [
  ...new Set(Object.values(KIND_SPECS).map((spec) => spec.label)),
  "节点",
];

/**
 * 色带（accent）。light 档放在白卡上、dark 档放在 #1f2329 卡上，都 ≥3:1
 * （非文本对比，WCAG 1.4.11）。
 */
const FAMILY_ACCENTS: Readonly<Record<VideoKindFamily, { light: string; dark: string }>> = {
  input: { light: "#0f766e", dark: "#2dd4bf" },
  media: { light: "#6d28d9", dark: "#a78bfa" },
  structure: { light: "#b45309", dark: "#fbbf24" },
  output: { light: "#be123c", dark: "#fb7185" },
  logic: { light: "#1d4ed8", dark: "#60a5fa" },
};

export function videoKindAccent(kind: string, theme: "light" | "dark"): string {
  return FAMILY_ACCENTS[videoKindSpec(kind).family][theme];
}

