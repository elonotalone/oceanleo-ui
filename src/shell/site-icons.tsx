// ============================================================================
// @oceanleo/ui — 全家桶站点几何图标（单一事实源，2026-07-03）
// ----------------------------------------------------------------------------
// 这里是 playground / app-directory / 工作台目录 卡片共用的**几何站点图标**唯一来源。
// 图标从主站 `oceanleo/lib/sites.tsx` 的 SITES 数组「原样搬」过来（内部 path/rect/
// circle 逐字复制，仅统一外层 <svg> 包裹为 `viewBox 0 0 24 24 / fill none /
// h-full w-full`），这样 29 个功能站 + playground 都渲染同一套干净的彩色几何图标
// （告别 emoji / 占位符——操作员截图投诉）。
//
// 上色约定（关键）：内部形状一律保留 `stroke="currentColor"` / `fill="currentColor"`，
// **不硬编码 hex**。卡片（DirectoryCard）把图标塞进一个浅色 tint 圆角块里、并设
// `style={{ color: logoColor }}`，于是 currentColor 天然继承站点品牌色。品牌色由
// SITE_BRAND_COLOR 给出（从每个站的 tailwind 渐变 `to-*`（回退 `from-*`）取代表色）。
//
// 用法：
//   siteIconFor("image")        // → <svg …> 几何图标节点（或 null）
//   siteBrandColorFor("image")  // → "#0284c7"（或 null）
// ============================================================================

import type { ReactNode } from "react";

/**
 * site_id → 几何 SVG 图标节点。
 * 内部形状逐字来自主站 SITES；外层 <svg> 统一为 `h-full w-full`，填满卡片图标圆底。
 * currentColor 保持不变 → 继承卡片 logoColor。
 */
export const SITE_ICONS: Record<string, ReactNode> = {
  agent: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.2" cy="17.2" r="3.8" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  website: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="2" />
      <circle cx="6.4" cy="6.6" r="0.9" fill="currentColor" />
      <circle cx="9.1" cy="6.6" r="0.9" fill="currentColor" />
    </svg>
  ),
  aitools: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.8" fill="currentColor" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8" fill="currentColor" />
    </svg>
  ),
  ecommerce: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M6 6h12l-1.2 10.5a1.5 1.5 0 01-1.5 1.3H8.7a1.5 1.5 0 01-1.5-1.3L6 6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 6V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V6" stroke="currentColor" strokeWidth="2" />
      <path d="M9 11h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  ppt: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="4" y="5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 16v3M8 19h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  excel: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 9h18M3 14h18M9 4v16M15 4v16" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  word: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M7 4h7l4 4v12a1 1 0 01-1 1H7a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 4v4h4M8 12h8M8 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  converter: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M7 7h6l-2-2M13 7l-2 2M17 17H11l2 2M11 17l2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" />
    </svg>
  ),
  aihuman: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 20c.8-3.2 3-5 6.5-5s5.7 1.8 6.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 10l2 1.5v3L17 16" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="8.5" cy="9" r="1.6" fill="currentColor" />
      <path d="M5 17l4.5-4.5 3 3L16 12l3 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M10 9.5l4.5 2.5-4.5 2.5v-5z" fill="currentColor" />
    </svg>
  ),
  resume: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M7 3.5h7l4 4V20a1 1 0 01-1 1H7a1 1 0 01-1-1V4.5a1 1 0 011-1z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="10.2" cy="10" r="1.7" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7.6 15.4c.5-1.4 1.5-2.1 2.6-2.1s2.1.7 2.6 2.1M15.5 11h2M15.5 14h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  bizdev: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  logo: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.7l5.4-.8L12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  interior: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M4 11l8-7 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9h12v-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 19v-5h4v5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H9l-4 3.5V6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="9" cy="10.5" r="1" fill="currentColor" />
      <circle cx="12.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="16" cy="10.5" r="1" fill="currentColor" />
    </svg>
  ),
  threed: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 12l8-4.5M12 12L4 7.5M12 12v9" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  ),
  music: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M9 18.5V6l10-2v12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.8" cy="18.5" r="2.3" stroke="currentColor" strokeWidth="2" />
      <circle cx="16.8" cy="16.5" r="2.3" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  meeting: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  paper: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M5 4.5A1.5 1.5 0 016.5 3H17a2 2 0 012 2v14a2 2 0 01-2 2H6.5A1.5 1.5 0 015 19.5v-15z" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  law: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M12 3v3M5 8h14M7 8l-2.5 6a3 3 0 005 0L7 8zM17 8l-2.5 6a3 3 0 005 0L17 8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 6v13M8 20h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  study: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M12 4L3 8l9 4 9-4-9-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M7 10v5c0 1.1 2.2 2 5 2s5-.9 5-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 8v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  novel: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M6 4h9l3 3v13a1 1 0 01-1 1H6a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 9h6M9 12.5h6M9 16h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  script: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 3v18M8 7h-4M8 11h-4M8 15h-4M8 19h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11.5 8h5M11.5 11.5h5M11.5 15h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  design: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4 7.2 17.9l.9-5.4L4.2 8.7l5.4-.8L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 14l-3 6 6-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  make: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 8l8 4 8-4M12 12v8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.5 11a2.5 2.5 0 012.5-2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  money: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
      <path d="M9 9.5h6M9 12.5h6M12 7.5v9M9.5 16l2.5-3.5L14.5 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0" />
      <path d="M9.2 8.2L12 12m0 0l2.8-3.8M12 12v5M9.5 13.5h5M9.5 15.5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  asset: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M3 15l4.5-4 3.5 3 3-3.5L21 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="9" r="1.5" fill="currentColor" />
    </svg>
  ),
};

/**
 * Tailwind v3 调色板 token → hex（仅覆盖 SITES 用到的档；缺失回退 undefined）。
 * 用于把每个站的渐变 class（如 "to-sky-600" / "from-violet-400"）解析成代表色。
 */
const TAILWIND_HEX: Record<string, string> = {
  "violet-400": "#a78bfa",
  "violet-500": "#8b5cf6",
  "violet-600": "#7c3aed",
  "fuchsia-400": "#e879f9",
  "fuchsia-500": "#d946ef",
  "fuchsia-600": "#c026d3",
  "sky-400": "#38bdf8",
  "sky-600": "#0284c7",
  "blue-400": "#60a5fa",
  "blue-600": "#2563eb",
  "blue-700": "#1d4ed8",
  "emerald-400": "#34d399",
  "emerald-500": "#10b981",
  "emerald-600": "#059669",
  "teal-400": "#2dd4bf",
  "teal-600": "#0d9488",
  "green-600": "#16a34a",
  "green-700": "#15803d",
  "cyan-400": "#22d3ee",
  "cyan-500": "#06b6d4",
  "cyan-600": "#0891b2",
  "indigo-400": "#818cf8",
  "indigo-500": "#6366f1",
  "indigo-600": "#4f46e5",
  "indigo-700": "#4338ca",
  "amber-300": "#fcd34d",
  "amber-400": "#fbbf24",
  "amber-600": "#d97706",
  "orange-400": "#fb923c",
  "orange-600": "#ea580c",
  "rose-400": "#fb7185",
  "rose-500": "#f43f5e",
  "rose-600": "#e11d48",
  "red-600": "#dc2626",
  "purple-400": "#c084fc",
  "purple-600": "#9333ea",
  "pink-400": "#f472b6",
  "pink-600": "#db2777",
  "lime-400": "#a3e635",
  "lime-600": "#65a30d",
};

/** 把 "to-sky-600" / "from-violet-400" 之类的 class 去掉方向前缀后查 hex。 */
function tailwindClassToHex(cls: string): string | undefined {
  const token = cls.replace(/^(from|to|via)-/, "");
  return TAILWIND_HEX[token];
}

/**
 * site_id → 代表品牌色（hex）。取自主站每个站的渐变 `to-*`（回退 `from-*`）。
 * 与 SITE_ICONS 同源、逐站对齐——渲染时作为卡片 logoColor 让 currentColor 上色。
 */
export const SITE_BRAND_COLOR: Record<string, string> = {
  agent: tailwindClassToHex("to-fuchsia-600")!, // #c026d3
  website: tailwindClassToHex("to-blue-600")!, // #2563eb
  aitools: tailwindClassToHex("to-teal-600")!, // #0d9488
  ecommerce: tailwindClassToHex("to-orange-600")!, // #ea580c
  ppt: tailwindClassToHex("to-sky-600")!, // #0284c7
  excel: tailwindClassToHex("to-cyan-600")!, // #0891b2
  word: tailwindClassToHex("to-green-600")!, // #16a34a
  converter: tailwindClassToHex("to-red-600")!, // #dc2626
  aihuman: tailwindClassToHex("to-fuchsia-600")!, // #c026d3
  image: tailwindClassToHex("to-sky-600")!, // #0284c7
  video: tailwindClassToHex("to-indigo-600")!, // #4f46e5
  resume: tailwindClassToHex("to-indigo-600")!, // #4f46e5
  bizdev: tailwindClassToHex("to-blue-600")!, // #2563eb
  logo: tailwindClassToHex("to-amber-600")!, // #d97706
  interior: tailwindClassToHex("to-rose-500")!, // #f43f5e
  chat: tailwindClassToHex("to-indigo-600")!, // #4f46e5
  threed: tailwindClassToHex("to-emerald-600")!, // #059669
  music: tailwindClassToHex("to-purple-600")!, // #9333ea
  meeting: tailwindClassToHex("to-cyan-600")!, // #0891b2
  paper: tailwindClassToHex("to-blue-700")!, // #1d4ed8
  law: tailwindClassToHex("to-indigo-700")!, // #4338ca
  study: tailwindClassToHex("to-purple-600")!, // #9333ea
  novel: tailwindClassToHex("to-teal-600")!, // #0d9488
  script: tailwindClassToHex("to-blue-600")!, // #2563eb
  design: tailwindClassToHex("to-fuchsia-600")!, // #c026d3
  make: tailwindClassToHex("to-rose-600")!, // #e11d48
  search: tailwindClassToHex("to-sky-600")!, // #0284c7
  money: tailwindClassToHex("to-green-700")!, // #15803d
  asset: tailwindClassToHex("to-emerald-600")!, // #059669
};

/** site_id → 几何图标节点，缺失返回 null。 */
export function siteIconFor(siteId: string | undefined | null): ReactNode | null {
  if (!siteId) return null;
  return SITE_ICONS[siteId] ?? null;
}

/** site_id → 代表品牌色 hex，缺失返回 null。 */
export function siteBrandColorFor(siteId: string | undefined | null): string | null {
  if (!siteId) return null;
  return SITE_BRAND_COLOR[siteId] ?? null;
}
