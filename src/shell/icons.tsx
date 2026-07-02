// @oceanleo/ui — 统一图标集（单一事实源）。全部为内联 SVG，无外部资源、无网络。
//
// 2026-07-02 图标体系 v2（操作员：告别「最简陋的纯线条」，对齐 Manus 的定制感，
// 但**不用 Manus 的纯色**——每个图标带一层柔和的品牌色渐变填充）：
//   · 双色调（duotone）：底层 = 低透明度彩色渐变填充（每个图标固定一个色相），
//     顶层 = currentColor 描边（1.6，圆角端点）。
//   · 描边跟随 currentColor → 侧栏 active/hover 的状态变色、各站 accent 注入
//     全部照常工作；彩色填充只是「常亮的一抹色」，浅色/深色主题下都成立。
//   · 渐变 id 全局唯一前缀 lgi-*；同一图标多实例共享同一 id（内容一致，安全）。
import type { ReactNode } from "react";

type IconProps = { className?: string };

/** 每个图标一个固定色相的柔和渐变（from→to 都是 tailwind 400 档观感的柔色）。 */
function Grad({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={from} />
        <stop offset="100%" stopColor={to} />
      </linearGradient>
    </defs>
  );
}

export function IconSearch({ className = "h-4 w-4" }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <Grad id="lgi-search" from="#38bdf8" to="#818cf8" />
      <circle cx="11" cy="11" r="7" fill="url(#lgi-search)" fillOpacity="0.22" />
      <circle cx="11" cy="11" r="7" />
      <path d="M20.2 20.2l-4-4" />
    </svg>
  );
}

export function IconPanel({ className = "h-4 w-4" }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <Grad id="lgi-panel" from="#94a3b8" to="#818cf8" />
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <rect x="3" y="4" width="7.5" height="16" rx="2.5" fill="url(#lgi-panel)" fillOpacity="0.25" stroke="none" />
      <path d="M10.5 4v16" />
    </svg>
  );
}

export function IconGift({ className = "h-4 w-4" }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <Grad id="lgi-gift" from="#fb7185" to="#f59e0b" />
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="1.5" fill="url(#lgi-gift)" fillOpacity="0.18" />
      <rect x="3" y="7" width="18" height="3.5" rx="1.2" fill="url(#lgi-gift)" fillOpacity="0.32" />
      <path d="M12 7v13" />
      <path d="M12 7c-1.8-.2-3.6-1-3.6-2.5C8.4 3.2 9.6 2.6 10.6 3c1.2.4 1.4 2.4 1.4 4zM12 7c1.8-.2 3.6-1 3.6-2.5 0-1.3-1.2-1.9-2.2-1.5C12.2 3.4 12 5.4 12 7z" />
    </svg>
  );
}

export function IconChat({ className = "h-4 w-4" }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <Grad id="lgi-chat" from="#34d399" to="#38bdf8" />
      <path d="M4.5 5h15A1.5 1.5 0 0121 6.5v8a1.5 1.5 0 01-1.5 1.5H9.5L5 20v-4h-.5A1.5 1.5 0 013 14.5v-8A1.5 1.5 0 014.5 5z" fill="url(#lgi-chat)" fillOpacity="0.2" />
      <path d="M4.5 5h15A1.5 1.5 0 0121 6.5v8a1.5 1.5 0 01-1.5 1.5H9.5L5 20v-4h-.5A1.5 1.5 0 013 14.5v-8A1.5 1.5 0 014.5 5z" />
      <circle cx="8.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconBell({ className = "h-4 w-4" }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <Grad id="lgi-bell" from="#fbbf24" to="#fb7185" />
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" fill="url(#lgi-bell)" fillOpacity="0.22" />
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 01-3.4 0" />
    </svg>
  );
}

export function IconChevronDown({ className = "h-3.5 w-3.5" }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconChevronRight({ className = "h-4 w-4" }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCheck({ className = "h-4 w-4" }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 站级四页导航图标（首页 / 工作台 / 文件库 / 历史记录）
export function IconHome({ className = "h-4 w-4" }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <Grad id="lgi-home" from="#38bdf8" to="#818cf8" />
      <path d="M5 10v9a1 1 0 001 1h12a1 1 0 001-1v-9L12 4l-7 6z" fill="url(#lgi-home)" fillOpacity="0.2" stroke="none" />
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v9a1 1 0 001 1h12a1 1 0 001-1v-9" />
      <path d="M9.5 20v-5.5a1 1 0 011-1h3a1 1 0 011 1V20" fill="url(#lgi-home)" fillOpacity="0.35" />
    </svg>
  );
}

export function IconWorkspace({ className = "h-4 w-4" }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <Grad id="lgi-workspace" from="#818cf8" to="#c084fc" />
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18" />
      <path d="M9.5 9.5V20" />
      <rect x="3.8" y="4.8" width="16.4" height="4" rx="1.6" fill="url(#lgi-workspace)" fillOpacity="0.3" stroke="none" />
      <rect x="10.4" y="10.4" width="9.8" height="8.8" rx="1.4" fill="url(#lgi-workspace)" fillOpacity="0.16" stroke="none" />
    </svg>
  );
}

export function IconLibrary({ className = "h-4 w-4" }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <Grad id="lgi-library" from="#fbbf24" to="#fb923c" />
      <rect x="4" y="4" width="4.2" height="16" rx="1.1" />
      <rect x="10" y="4" width="4.2" height="16" rx="1.1" fill="url(#lgi-library)" fillOpacity="0.32" />
      <path d="M16.6 5.2l3.5.8-2.9 14.2-3.4-.8 2.8-14.2z" fill="url(#lgi-library)" fillOpacity="0.16" />
    </svg>
  );
}

export function IconHistory({ className = "h-4 w-4" }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <Grad id="lgi-history" from="#a78bfa" to="#f472b6" />
      <circle cx="12" cy="12" r="9" fill="url(#lgi-history)" fillOpacity="0.18" stroke="none" />
      <path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.3M3 4v3.3h3.3" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

// Playground 入口图标（火花 / 试玩）
export function IconSparkles({ className = "h-4 w-4" }: IconProps): ReactNode {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <Grad id="lgi-sparkles" from="#818cf8" to="#e879f9" />
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" fill="url(#lgi-sparkles)" fillOpacity="0.3" />
      <path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" fill="url(#lgi-sparkles)" fillOpacity="0.5" stroke="none" />
      <path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
    </svg>
  );
}

// 模型类目图标（ModelPicker 分组标题用）
export function IconCategory({ category, className = "h-4 w-4" }: { category: string; className?: string }): ReactNode {
  switch (category) {
    case "text":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <Grad id="lgi-cat-text" from="#94a3b8" to="#818cf8" />
          <rect x="3" y="4" width="18" height="16" rx="2.5" fill="url(#lgi-cat-text)" fillOpacity="0.14" stroke="none" />
          <path d="M6 8h12M6 12h12M6 16h7" />
        </svg>
      );
    case "image":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <Grad id="lgi-cat-image" from="#38bdf8" to="#34d399" />
          <rect x="3" y="4" width="18" height="16" rx="2.5" fill="url(#lgi-cat-image)" fillOpacity="0.16" />
          <circle cx="8.5" cy="9.5" r="1.7" fill="url(#lgi-cat-image)" fillOpacity="0.6" stroke="none" />
          <circle cx="8.5" cy="9.5" r="1.7" />
          <path d="M4 17l5-5 4 4 3-3 4 4" />
        </svg>
      );
    case "video":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <Grad id="lgi-cat-video" from="#fb7185" to="#c084fc" />
          <rect x="3" y="6" width="18" height="12" rx="2.5" fill="url(#lgi-cat-video)" fillOpacity="0.16" />
          <path d="M10 9.5l4.5 2.5-4.5 2.5v-5z" fill="url(#lgi-cat-video)" stroke="none" />
        </svg>
      );
    case "threed":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <Grad id="lgi-cat-threed" from="#818cf8" to="#38bdf8" />
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" fill="url(#lgi-cat-threed)" fillOpacity="0.16" />
          <path d="M12 12l8-4.5M12 12L4 7.5M12 12v9" />
        </svg>
      );
    case "audio":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <Grad id="lgi-cat-audio" from="#34d399" to="#fbbf24" />
          <rect x="9" y="3" width="6" height="11" rx="3" fill="url(#lgi-cat-audio)" fillOpacity="0.28" />
          <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <Grad id="lgi-cat-default" from="#94a3b8" to="#c084fc" />
          <circle cx="12" cy="12" r="9" fill="url(#lgi-cat-default)" fillOpacity="0.14" />
        </svg>
      );
  }
}
