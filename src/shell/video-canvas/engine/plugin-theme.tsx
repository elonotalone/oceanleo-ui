"use client";

// --vc-* token 表。
//
// **这里不再有主题状态。** dark/light 与 accent 一律取自 @oceanleo/ui 的
// `PLUGIN_THEME_SPECS`（统一外壳的单一事实源），本文件只负责把那份决定
// 翻译成视频画布自己那套变量名。
//
// 收掉状态是因为同一件插件曾经有两个真相：统一表里 video-canvas 的 accent 是
// #2dd4bf，这份文件里的 PLUGIN_ACCENT 却是 #34d399，于是顶栏的强调色与画布里
// 节点、选中框的强调色是两个绿；主题开关也各存各的 localStorage，切了一边
// 另一边不动。现在 --vc-accent 直接别名到 --pchrome-accent，想漂也漂不了。
//
// 兜底值留着是给嵌入态用的：宿主自己接管 chrome 时页面上没有
// PluginChromeFrame，--pchrome-* 一个都没注入，此时退回统一表里
// video-canvas 那两个值（dark #2dd4bf / light #0d9488），与挂在陈列馆里一致。

/**
 * 实底按钮用的深一档青，不跟 --pchrome-accent 走。
 * accent 本身在暗档是亮青，白字压上去对比度不足 3:1；按钮要 ≥ 4.5:1，
 * 所以这一档单独钉死，与 accent 同色系但压暗。
 *
 * --vc-accent-text 是「accent 当文字用」的那一档，两档指向不同来源：
 * 暗档 accent（#2dd4bf）压在近黑面上有 9:1 以上，直接用；纯白档 accent
 * （#0d9488）压在白面上只有 3.3–3.7:1，8–10px 的小字读不清，退到已经存在的
 * accent-strong（#0f766e，白面 5.5:1）。不新增第三个绿，只是换指向。
 *
 * --vc-letterbox 两档都是纯黑：那是 <video> object-contain/cover 之外露出的
 * 黑边，跟着主题变白会让片子看起来漏光，影棚里从来是黑的。它有名字只是为了
 * 不再有人往 className 里写 bg-black——散写一次，下一次就轮到别的调色板色。
 */
const PLUGIN_THEME_CSS = `
[data-plugin-chrome="video-canvas"][data-plugin-theme="dark"],
[data-canvas-workflow][data-plugin-theme="dark"] {
  color-scheme: dark;
  --vc-canvas: #0b1120;
  --vc-dot: #2c3a54;
  --vc-surface: #101828;
  --vc-surface-glass: rgba(16, 24, 40, 0.93);
  --vc-surface-2: rgba(148, 163, 184, 0.08);
  --vc-media: #131c2e;
  --vc-overlay: rgba(8, 12, 22, 0.82);
  --vc-border: rgba(148, 163, 184, 0.17);
  --vc-border-strong: rgba(148, 163, 184, 0.32);
  --vc-hover: rgba(148, 163, 184, 0.13);
  --vc-shadow-float: 0 30px 90px rgba(0, 0, 0, 0.56);
  --vc-text: #f2f6fb;
  --vc-text-2: #b9c3d2;
  --vc-text-3: #8292a8;
  --vc-accent: var(--pchrome-accent, #2dd4bf);
  --vc-accent-strong: #0f766e;
  --vc-accent-strong-hover: #115e59;
  --vc-accent-text: var(--vc-accent);
  --vc-accent-soft: color-mix(in srgb, var(--vc-accent) 14%, transparent);
  --vc-accent-border: color-mix(in srgb, var(--vc-accent) 35%, transparent);
  --vc-on-accent: #ffffff;
  --vc-video: #f472b6;
  --vc-video-strong: #be185d;
  --vc-video-border: rgba(244, 114, 182, 0.32);
  --vc-info: #7dd3fc;
  --vc-info-strong: #0369a1;
  --vc-info-border: rgba(56, 189, 248, 0.32);
  --vc-plan: #c4b5fd;
  --vc-plan-strong: #6d28d9;
  --vc-warn: #fcd34d;
  --vc-warn-border: rgba(251, 191, 36, 0.32);
  --vc-danger: #fda4af;
  --vc-danger-border: rgba(251, 113, 133, 0.34);
  --vc-minimap-mask: rgba(11, 17, 32, 0.72);
  --vc-edge: #64748b;
  --vc-media-scrim: rgba(0, 0, 0, 0.8);
  --vc-letterbox: #000000;
  --vc-on-media: #ffffff;
}
[data-plugin-chrome="video-canvas"][data-plugin-theme="light"],
[data-canvas-workflow][data-plugin-theme="light"] {
  color-scheme: light;
  --vc-canvas: #ffffff;
  --vc-dot: #cfd8e6;
  --vc-surface: #ffffff;
  --vc-surface-glass: rgba(255, 255, 255, 0.94);
  --vc-surface-2: rgba(15, 23, 42, 0.05);
  --vc-media: #eef2f8;
  --vc-overlay: rgba(255, 255, 255, 0.93);
  --vc-border: rgba(15, 23, 42, 0.13);
  --vc-border-strong: rgba(15, 23, 42, 0.26);
  --vc-hover: rgba(15, 23, 42, 0.06);
  --vc-shadow-float: 0 24px 64px rgba(15, 23, 42, 0.18);
  --vc-text: #101828;
  --vc-text-2: #3d4b61;
  --vc-text-3: #5d6b81;
  --vc-accent: var(--pchrome-accent, #0d9488);
  --vc-accent-strong: #0f766e;
  --vc-accent-strong-hover: #115e59;
  --vc-accent-text: var(--vc-accent-strong);
  --vc-accent-soft: color-mix(in srgb, var(--vc-accent) 10%, transparent);
  --vc-accent-border: color-mix(in srgb, var(--vc-accent) 35%, transparent);
  --vc-on-accent: #ffffff;
  --vc-video: #be185d;
  --vc-video-strong: #be185d;
  --vc-video-border: rgba(190, 24, 93, 0.32);
  --vc-info: #0369a1;
  --vc-info-strong: #0369a1;
  --vc-info-border: rgba(3, 105, 161, 0.32);
  --vc-plan: #6d28d9;
  --vc-plan-strong: #6d28d9;
  --vc-warn: #92400e;
  --vc-warn-border: rgba(180, 83, 9, 0.36);
  --vc-danger: #be123c;
  --vc-danger-border: rgba(190, 18, 60, 0.36);
  --vc-minimap-mask: rgba(255, 255, 255, 0.74);
  --vc-edge: #94a3b8;
  --vc-media-scrim: rgba(0, 0, 0, 0.8);
  --vc-letterbox: #000000;
  --vc-on-media: #ffffff;
}
`;

/** 随插件根一起渲染；选择器限定在插件根，不污染 document/body。 */
export function PluginThemeStyles() {
  return <style data-plugin-theme-styles>{PLUGIN_THEME_CSS}</style>;
}
