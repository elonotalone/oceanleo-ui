// ============================================================================
// @oceanleo/ui — 品牌色 / 卡片图标上色（单一事实源，宗旨 v13 2026-07-02）
// ----------------------------------------------------------------------------
// 操作员要求：playground 各分区（网站 / app / agent / prompt / organization /
// workflow）以及全家桶各站 workspace 目录里的卡片，不再统一「深色底 + 白图标」，
// 改为「浅色 tint 底 + 每张卡自己的彩色 SVG 图标」——像 OceanLeo 侧边栏 logo 那样
// （SVG stroke=currentColor + 品牌色）。同一条目 id 永远稳定同色。
//
// 用法：
//   const color = brandColorFor(id);         // 稳定选一款品牌色（hex，如 "#6366f1"）
//   const bg    = tintOf(color);             // 浅色 tint（rgba(...,0.12)）做圆角底
//   // 图标节点 style={{ color }} 让内部 SVG 走 currentColor 天生上色。
// ============================================================================

/** 16 色精选调色板（饱和度中等、观感现代；与 Tailwind 各系列 500 大致对齐）。 */
export const BRAND_PALETTE: readonly string[] = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#f97316", // orange
  "#06b6d4", // cyan
  "#d946ef", // fuchsia
  "#84cc16", // lime
  "#3b82f6", // blue
  "#ec4899", // pink
  "#22c55e", // green
  "#ef4444", // red
  "#a855f7", // purple
];

/** djb2 hash（32-bit unsigned）——稳定、无外部依赖、对短字符串足够均匀。 */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** 对 seed 稳定映射一款品牌色。空 seed 回退到调色板第一色。 */
export function brandColorFor(seed: string | null | undefined): string {
  const s = (seed || "").trim();
  if (!s) return BRAND_PALETTE[0];
  return BRAND_PALETTE[djb2(s) % BRAND_PALETTE.length];
}

/** hex（#rrggbb 或 #rgb）→ rgba 浅底。alpha 默认 0.12（卡片图标底块观感）。 */
export function tintOf(hex: string, alpha = 0.12): string {
  const h = (hex || "").replace("#", "").trim();
  if (h.length !== 3 && h.length !== 6) return `rgba(99,102,241,${alpha})`;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return `rgba(99,102,241,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}
