"use client";

// ============================================================================
// @oceanleo/ui — 时间线两档配色（2026-10-23 D6 / D7：编辑器跟随网站明暗）
// ----------------------------------------------------------------------------
// 深色档 = video-timeline.md §2.1 规范色板原值（timeline-carrier.ts，不改）。
// 浅色档按同一组义务另定：片段块对轨道底 ≥ 3:1（SC 1.4.11），块上标签与刻度文字
// ≥ 4.5:1（SC 1.4.3），播放头 ≥ 4.5:1。数值由 tests/video-timeline-theme.test.mjs 实算。
// 视频画面本身（预览 canvas）不随主题变。
// ============================================================================

import { usePluginTheme } from "../plugin-theme";
import {
  TIMELINE_CLIP_LABEL_COLORS,
  TIMELINE_PALETTE,
} from "./timeline-carrier";
import type { TrackKind } from "./types";

export type TimelineThemeMode = "light" | "dark";

export interface TimelineThemePalette {
  /** 轨道行底色。 */
  track: string;
  /** 刻度尺底色。 */
  ruler: string;
  /** 刻度线与刻度文字。 */
  grid: string;
  playhead: string;
  transition: string;
  clips: Record<TrackKind, { background: string; label: string }>;
}

export const TIMELINE_THEME_PALETTES: Readonly<
  Record<TimelineThemeMode, TimelineThemePalette>
> = Object.freeze({
  dark: Object.freeze({
    track: TIMELINE_PALETTE["tl.bg"].value,
    ruler: TIMELINE_PALETTE["tl.bg"].value,
    grid: TIMELINE_PALETTE["tl.grid"].value,
    playhead: TIMELINE_PALETTE["tl.playhead"].value,
    transition: TIMELINE_PALETTE["tl.transition"].value,
    clips: Object.freeze({
      video: TIMELINE_CLIP_LABEL_COLORS["tl.clip.video"],
      audio: TIMELINE_CLIP_LABEL_COLORS["tl.clip.audio"],
      text: TIMELINE_CLIP_LABEL_COLORS["tl.clip.text"],
      image: TIMELINE_CLIP_LABEL_COLORS["tl.clip.text"],
    }),
  }),
  light: Object.freeze({
    track: "#EEF0F3",
    ruler: "#F7F8FA",
    grid: "#5D6976",
    playhead: "#C0281C",
    transition: "#8E5BA6",
    clips: Object.freeze({
      video: Object.freeze({ background: "#1F6FEB", label: "#FFFFFF" }),
      audio: Object.freeze({ background: "#1E7A5E", label: "#FFFFFF" }),
      text: Object.freeze({ background: "#A85A12", label: "#FFFFFF" }),
      image: Object.freeze({ background: "#A85A12", label: "#FFFFFF" }),
    }),
  }),
});

/** 时间线跟随插件主题（插件主题跟随网站，W01）。 */
export function useTimelinePalette(): TimelineThemePalette {
  const { theme } = usePluginTheme("video-timeline");
  return TIMELINE_THEME_PALETTES[theme === "light" ? "light" : "dark"];
}
