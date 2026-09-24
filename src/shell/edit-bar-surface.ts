"use client";

// edit bar 的视觉配方只此一份。13 个插件此前各自写 rounded-2xl / border / shadow，
// 换一处就漂一处；把胶囊与收起圆的样式收成常量后，插件只能引用不能重写。
//
// 配色跟随插件主题（浅色插件浅色条、深色插件深色条），但**可读性优先**：
// 参照手机状态栏时间的做法——背景高不透明度 + 强模糊 + 降饱和，
// 使画布上无论是白底稿、深色视频帧还是高饱和插画，条上的文字都保持清晰。
// 纯半透明玻璃在高对比画面上会糊掉文字，所以这里刻意不做低透明度。

import type { CSSProperties } from "react";

/** 控件 28 + 上下内边距 4 + 上下边框 1 = 38。 */
export const EDIT_BAR_PILL_PADDING_PX = 4;
export const EDIT_BAR_CONTROL_SIZE_PX = 28;
export const EDIT_BAR_BORDER_PX = 1;
/** 收起态圆形直径。32 + 触屏各向外 4 得到约 40 的可点区。 */
export const EDIT_BAR_COLLAPSED_SIZE_PX = 32;
export const EDIT_BAR_HEIGHT_PX =
  EDIT_BAR_CONTROL_SIZE_PX +
  EDIT_BAR_PILL_PADDING_PX * 2 +
  EDIT_BAR_BORDER_PX * 2;

/**
 * 触屏把可点区扩到约 40px，不改变布局高度。
 * 只用于条上的紧凑控件；More 弹层菜单行已经是 min-h-11。
 */
export const EDIT_BAR_TOUCH_EXTEND_CLASS =
  "relative [@media(pointer:coarse)]:before:pointer-events-auto [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-x-0 [@media(pointer:coarse)]:before:-inset-y-1.5 [@media(pointer:coarse)]:before:content-['']";
export const EDIT_BAR_COLLAPSED_TOUCH_EXTEND_CLASS =
  "relative [@media(pointer:coarse)]:before:pointer-events-auto [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:-inset-1 [@media(pointer:coarse)]:before:content-['']";

/** 背景：主题表面色兜到站点 card，再兜到白。94% 不透明度是可读性下限。 */
const SURFACE =
  "color-mix(in srgb, var(--pchrome-surface, var(--awb-chrome-bg, var(--card, #ffffff))) 94%, transparent)";
const LINE =
  "var(--pchrome-line, var(--awb-border, var(--border, #e7e5e4)))";
const INK = "var(--pchrome-ink, var(--awb-text, var(--fg, #292524)))";

/**
 * 双层阴影 + 内高光：内高光让胶囊在深色主题下有边缘，外阴影让它在浅色画布上
 * 浮起来。只靠 border 在两种主题里总有一种会消失。
 */
const ELEVATION =
  "inset 0 1px 0 0 color-mix(in srgb, var(--pchrome-ink, #fff) 8%, transparent), 0 12px 40px -8px rgba(15, 23, 42, 0.28), 0 2px 8px -2px rgba(15, 23, 42, 0.16)";
/** 拖动中抬高一档，给「它被拿起来了」的物理反馈。 */
const ELEVATION_LIFTED =
  "inset 0 1px 0 0 color-mix(in srgb, var(--pchrome-ink, #fff) 12%, transparent), 0 24px 64px -12px rgba(15, 23, 42, 0.38), 0 4px 12px -2px rgba(15, 23, 42, 0.2)";

/** saturate 是关键：降低背后画面的彩度，文字才不会被高饱和背景吃掉。 */
const BLUR = "blur(24px) saturate(180%)";

export function editBarSurfaceStyle(lifted = false): CSSProperties {
  return {
    background: SURFACE,
    color: INK,
    borderWidth: `${EDIT_BAR_BORDER_PX}px`,
    borderStyle: "solid",
    borderColor: LINE,
    boxShadow: lifted ? ELEVATION_LIFTED : ELEVATION,
    backdropFilter: BLUR,
    WebkitBackdropFilter: BLUR,
  };
}

/** 展开胶囊：圆角取满高度，这是 Manus 那种「仪器感」的来源。 */
export function editBarPillStyle(lifted = false): CSSProperties {
  return {
    ...editBarSurfaceStyle(lifted),
    borderRadius: 9999,
    padding: EDIT_BAR_PILL_PADDING_PX,
  };
}

export function editBarCollapsedStyle(lifted = false): CSSProperties {
  return {
    ...editBarSurfaceStyle(lifted),
    borderRadius: 9999,
    width: EDIT_BAR_COLLAPSED_SIZE_PX,
    height: EDIT_BAR_COLLAPSED_SIZE_PX,
  };
}

/** 分段之间的竖线。四段分区靠它区分，插件不得自定义粗细颜色。 */
export const EDIT_BAR_DIVIDER_CLASS =
  "mx-1 h-4 w-px shrink-0 bg-[var(--pchrome-line,var(--divider,#e7e5e4))] opacity-60";

/** 段内单个图标按钮。圆形 hover 与胶囊外形呼应。 */
export const EDIT_BAR_BUTTON_CLASS =
  `grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--pchrome-ink-mid,var(--awb-muted,#57534e))] outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-[var(--pchrome-muted,var(--awb-hover,rgba(0,0,0,.06)))] hover:text-[var(--pchrome-ink,var(--awb-text,#292524))] focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,#7c3aed))]/40 ${EDIT_BAR_TOUCH_EXTEND_CLASS}`;
