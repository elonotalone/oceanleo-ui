/**
 * 视频画布的两档配色（D6 / D7）：画布底色、点阵、节点卡、连线、小地图都跟网站走。
 *
 * - light 不是 dark 反色：白卡 + 浅灰画布 + 细边 + 轻投影；
 * - dark：近黑画布 + #1f2329 卡 + 暗边；
 * - 节点里的媒体缩略图保持原色（不加滤镜）。
 *
 * 外壳已在插件根上注入 `--awb-*`；这里能用 token 的都用 token，只把 xyflow
 * 自己的变量（`--xy-*`）对齐过去，保证控件、小地图、选框和画布同档。
 */
import type { CSSProperties } from "react";

export type VideoCanvasThemeMode = "light" | "dark";

export interface VideoCanvasPalette {
  canvas: string;
  dots: string;
  nodeBg: string;
  nodeBorder: string;
  nodeText: string;
  nodeMuted: string;
  nodeShadow: string;
  edge: string;
  minimapBg: string;
  minimapMask: string;
  minimapNode: string;
  controlsBg: string;
  controlsBorder: string;
  controlsText: string;
}

export const VIDEO_CANVAS_PALETTES: Readonly<Record<VideoCanvasThemeMode, VideoCanvasPalette>> = {
  light: {
    canvas: "var(--awb-stage-bg, #f3f4f6)",
    dots: "#d4d4d8",
    nodeBg: "#ffffff",
    nodeBorder: "#e4e4e7",
    nodeText: "#18181b",
    nodeMuted: "#71717a",
    nodeShadow: "0 1px 2px rgba(15,23,42,.06), 0 4px 12px rgba(15,23,42,.06)",
    edge: "#a1a1aa",
    minimapBg: "#ffffff",
    minimapMask: "rgba(228,228,231,.55)",
    minimapNode: "#d4d4d8",
    controlsBg: "#ffffff",
    controlsBorder: "#e4e4e7",
    controlsText: "#3f3f46",
  },
  dark: {
    canvas: "var(--awb-stage-bg, #111317)",
    dots: "#2e3138",
    nodeBg: "#1f2329",
    nodeBorder: "#30353d",
    nodeText: "#f4f4f5",
    nodeMuted: "#a1a1aa",
    nodeShadow: "0 1px 2px rgba(0,0,0,.4), 0 6px 16px rgba(0,0,0,.35)",
    edge: "#5b616b",
    minimapBg: "#1a1d22",
    minimapMask: "rgba(10,11,14,.6)",
    minimapNode: "#3a3f47",
    controlsBg: "#1f2329",
    controlsBorder: "#30353d",
    controlsText: "#e4e4e7",
  },
};

export function videoCanvasPalette(mode: VideoCanvasThemeMode): VideoCanvasPalette {
  return VIDEO_CANVAS_PALETTES[mode];
}

/** CSS variables on the canvas root; node cards and xyflow chrome read them. */
export function videoCanvasThemeStyle(mode: VideoCanvasThemeMode): CSSProperties {
  const p = videoCanvasPalette(mode);
  return {
    colorScheme: mode,
    background: p.canvas,
    "--vc-node-bg": p.nodeBg,
    "--vc-node-border": p.nodeBorder,
    "--vc-node-text": p.nodeText,
    "--vc-node-muted": p.nodeMuted,
    "--vc-node-shadow": p.nodeShadow,
    "--vc-accent": "var(--awb-accent, #0d9488)",
    "--xy-background-color": p.canvas,
    "--xy-edge-stroke": p.edge,
    "--xy-edge-stroke-selected": "var(--awb-accent, #0d9488)",
    "--xy-connectionline-stroke": "var(--awb-accent, #0d9488)",
    "--xy-handle-background-color": p.nodeBg,
    "--xy-handle-border-color": p.edge,
    "--xy-minimap-background-color": p.minimapBg,
    "--xy-minimap-mask-background-color": p.minimapMask,
    "--xy-minimap-node-background-color": p.minimapNode,
    "--xy-controls-button-background-color": p.controlsBg,
    "--xy-controls-button-background-color-hover": mode === "dark" ? "#2a2f36" : "#f4f4f5",
    "--xy-controls-button-color": p.controlsText,
    "--xy-controls-button-color-hover": p.nodeText,
    "--xy-controls-button-border-color": p.controlsBorder,
    "--xy-selection-background-color": "color-mix(in srgb, var(--awb-accent, #0d9488) 10%, transparent)",
    "--xy-selection-border": "1px dashed var(--awb-accent, #0d9488)",
    "--xy-attribution-background-color": "transparent",
  } as CSSProperties;
}
