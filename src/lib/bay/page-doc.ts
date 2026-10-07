// LeoBay 个人主页的版面文档：一份 JSON，由我们自己的组件画出来。
// 不接受用户写的 HTML / CSS / JS —— 用户代码放在家族域名下会拿到别人的登录态（untrusted-content UC-1）。
// 纯函数，不碰 React、DOM 与网络；后端同一套规则在 `backend/app/talent/page_doc.py`。

export type BayPageTone = "light" | "warm" | "dark" | "ocean" | "sunset" | "forest";
export type BayPageFont = "sans" | "serif" | "rounded" | "mono";
export type BayPageCoverStyle = "image" | "gradient" | "none";

export interface BayPageTheme {
  accent: string;
  tone: BayPageTone;
  font: BayPageFont;
  cover_url: string;
  cover_style: BayPageCoverStyle;
}

export type BayPageBlockType =
  | "hero"
  | "text"
  | "gallery"
  | "stats"
  | "services"
  | "showcase"
  | "reviews"
  | "contact"
  | "quote"
  | "links";

export interface BayPageImage {
  url: string;
  caption: string;
}

export interface BayPageStat {
  value: string;
  label: string;
}

export interface BayPageLink {
  label: string;
  url: string;
}

export interface BayPageBlock {
  id: string;
  type: BayPageBlockType;
  title?: string;
  subtitle?: string;
  body?: string;
  by?: string;
  cta_label?: string;
  images?: BayPageImage[];
  items?: BayPageStat[];
  links?: BayPageLink[];
}

export interface BayPageDoc {
  version: 1;
  theme: BayPageTheme;
  blocks: BayPageBlock[];
}

export const BAY_PAGE_TONES: readonly BayPageTone[] = ["light", "warm", "dark", "ocean", "sunset", "forest"];
export const BAY_PAGE_FONTS: readonly BayPageFont[] = ["sans", "serif", "rounded", "mono"];
export const BAY_PAGE_BLOCK_TYPES: readonly BayPageBlockType[] = [
  "hero",
  "text",
  "gallery",
  "stats",
  "services",
  "showcase",
  "reviews",
  "contact",
  "quote",
  "links",
];
export const BAY_PAGE_ACCENTS: readonly string[] = [
  "#0ea5e9",
  "#6366f1",
  "#ec4899",
  "#f97316",
  "#eab308",
  "#10b981",
  "#14b8a6",
  "#ef4444",
  "#171717",
];
export const BAY_PAGE_MAX_BLOCKS = 30;
export const BAY_PAGE_MAX_ITEMS = 24;
export const BAY_PAGE_MAX_TEXT = 4000;
export const BAY_PAGE_MAX_BYTES = 48 * 1024;

/** 版块在「添加版块」菜单里的名字与一句说明（中文原文，调用方过 tt）。 */
export const BAY_PAGE_BLOCK_LABELS: Readonly<Record<BayPageBlockType, { name: string; hint: string }>> = {
  hero: { name: "开场", hint: "一句大标题，说清你是谁、做什么" },
  text: { name: "文字", hint: "一段介绍：经历、做事方式、擅长的方向" },
  gallery: { name: "图集", hint: "几张图排成一面墙" },
  stats: { name: "数字", hint: "几个数字：年限、项目数、客户数" },
  services: { name: "我的发布", hint: "你上架的商品和服务，自动列出" },
  showcase: { name: "作品集", hint: "从「我的库」放进主页的作品，自动列出" },
  reviews: { name: "评价", hint: "买家给你的评价，自动列出" },
  contact: { name: "联系我", hint: "一句邀请 + 一个「先聊聊」按钮" },
  quote: { name: "引言", hint: "一句话，或一位客户的原话" },
  links: { name: "链接", hint: "你的作品站、社交账号" },
};

const ACCENT_RE = /^#[0-9a-fA-F]{6}$/;
const BLOCK_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function safePageUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > 1024) return "";
  return /^https:\/\//i.test(text) ? text : "";
}

function text(value: unknown, max = BAY_PAGE_MAX_TEXT): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

let idSeq = 0;
export function newBlockId(): string {
  idSeq += 1;
  return `b${Date.now().toString(36)}${idSeq.toString(36)}`;
}

export function defaultPageTheme(accent?: string): BayPageTheme {
  return {
    accent: accent && ACCENT_RE.test(accent) ? accent : "#0ea5e9",
    tone: "light",
    font: "sans",
    cover_url: "",
    cover_style: "gradient",
  };
}

/** 新加一个版块时的初始内容（中文原文；调用方可先过 tt 再放进文档）。 */
export function newBlock(type: BayPageBlockType, tt: (zh: string) => string = (zh) => zh): BayPageBlock {
  const id = newBlockId();
  switch (type) {
    case "hero":
      return { id, type, title: tt("你好，我是……"), subtitle: tt("一句话说清你能帮别人做什么。"), cta_label: tt("先聊聊") };
    case "text":
      return { id, type, title: tt("关于我"), body: tt("写一写你的经历、做事的方式，以及最擅长的方向。") };
    case "gallery":
      return { id, type, title: tt("作品"), images: [] };
    case "stats":
      return {
        id,
        type,
        items: [
          { value: "5+", label: tt("年经验") },
          { value: "120", label: tt("完成项目") },
          { value: "98%", label: tt("好评") },
        ],
      };
    case "services":
      return { id, type, title: tt("我的发布") };
    case "showcase":
      return { id, type, title: tt("作品集") };
    case "reviews":
      return { id, type, title: tt("买家评价") };
    case "contact":
      return { id, type, title: tt("有想法？聊一聊"), body: tt("说说你想做的事，我通常当天回复。"), cta_label: tt("先聊聊") };
    case "quote":
      return { id, type, body: tt("把一件事做到让人愿意再来找你。"), by: "" };
    case "links":
      return { id, type, title: tt("在别处找到我"), links: [] };
    default:
      return { id, type: "text", title: "", body: "" };
  }
}

/** 没编辑过主页的人看到的默认版面：由资料现有的几项拼出来，所以不会是一张空页。 */
export function defaultPageDoc(
  profile: { display_name?: string | null; headline?: string | null; bio?: string | null } | null,
  tt: (zh: string) => string = (zh) => zh,
  accent?: string,
): BayPageDoc {
  const name = (profile?.display_name || "").trim();
  const blocks: BayPageBlock[] = [
    {
      id: "hero",
      type: "hero",
      title: name || tt("你好，我是……"),
      subtitle: (profile?.headline || "").trim() || tt("一句话说清你能帮别人做什么。"),
      cta_label: tt("先聊聊"),
    },
  ];
  const bio = (profile?.bio || "").trim();
  if (bio) blocks.push({ id: "about", type: "text", title: tt("关于我"), body: bio });
  blocks.push({ id: "services", type: "services", title: tt("我的发布") });
  blocks.push({ id: "showcase", type: "showcase", title: tt("作品集") });
  blocks.push({ id: "reviews", type: "reviews", title: tt("买家评价") });
  return { version: 1, theme: defaultPageTheme(accent), blocks };
}

function normalizeBlock(raw: unknown, seen: Set<string>): BayPageBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = row.type as BayPageBlockType;
  if (!BAY_PAGE_BLOCK_TYPES.includes(type)) return null;
  let id = typeof row.id === "string" && BLOCK_ID_RE.test(row.id) ? row.id : newBlockId();
  if (seen.has(id)) id = newBlockId();
  seen.add(id);
  const block: BayPageBlock = { id, type };
  if (typeof row.title === "string") block.title = text(row.title, 200);
  if (typeof row.subtitle === "string") block.subtitle = text(row.subtitle, 400);
  if (typeof row.body === "string") block.body = text(row.body);
  if (typeof row.by === "string") block.by = text(row.by, 120);
  if (typeof row.cta_label === "string") block.cta_label = text(row.cta_label, 40);
  if (Array.isArray(row.images)) {
    block.images = row.images
      .slice(0, BAY_PAGE_MAX_ITEMS)
      .map((item) => {
        const image = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return { url: safePageUrl(image.url), caption: text(image.caption, 200) };
      })
      .filter((image) => image.url);
  }
  if (Array.isArray(row.items)) {
    block.items = row.items.slice(0, 8).map((item) => {
      const stat = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return { value: text(stat.value, 24), label: text(stat.label, 60) };
    });
  }
  if (Array.isArray(row.links)) {
    block.links = row.links
      .slice(0, BAY_PAGE_MAX_ITEMS)
      .map((item) => {
        const link = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return { label: text(link.label, 80), url: safePageUrl(link.url) };
      })
      .filter((link) => link.url);
  }
  return block;
}

/** 把服务端给的（或本机草稿里的）文档收拾成界面能直接画的形状；认不出就返回 null。 */
export function normalizePageDoc(raw: unknown): BayPageDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.version !== 1 || !Array.isArray(row.blocks)) return null;
  const themeRaw = (row.theme && typeof row.theme === "object" ? row.theme : {}) as Record<string, unknown>;
  const base = defaultPageTheme();
  const theme: BayPageTheme = {
    accent: typeof themeRaw.accent === "string" && ACCENT_RE.test(themeRaw.accent) ? themeRaw.accent : base.accent,
    tone: BAY_PAGE_TONES.includes(themeRaw.tone as BayPageTone) ? (themeRaw.tone as BayPageTone) : base.tone,
    font: BAY_PAGE_FONTS.includes(themeRaw.font as BayPageFont) ? (themeRaw.font as BayPageFont) : base.font,
    cover_url: safePageUrl(themeRaw.cover_url),
    cover_style:
      themeRaw.cover_style === "image" || themeRaw.cover_style === "none" || themeRaw.cover_style === "gradient"
        ? themeRaw.cover_style
        : base.cover_style,
  };
  if (theme.cover_style === "image" && !theme.cover_url) theme.cover_style = "gradient";
  const seen = new Set<string>();
  const blocks = row.blocks
    .slice(0, BAY_PAGE_MAX_BLOCKS)
    .map((block) => normalizeBlock(block, seen))
    .filter((block): block is BayPageBlock => Boolean(block));
  return { version: 1, theme, blocks };
}

export function moveBlock(doc: BayPageDoc, id: string, direction: -1 | 1): BayPageDoc {
  const index = doc.blocks.findIndex((block) => block.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= doc.blocks.length) return doc;
  const blocks = doc.blocks.slice();
  const [moved] = blocks.splice(index, 1);
  blocks.splice(target, 0, moved);
  return { ...doc, blocks };
}

export function removeBlock(doc: BayPageDoc, id: string): BayPageDoc {
  const blocks = doc.blocks.filter((block) => block.id !== id);
  return blocks.length === doc.blocks.length ? doc : { ...doc, blocks };
}

export function patchBlock(doc: BayPageDoc, id: string, patch: Partial<BayPageBlock>): BayPageDoc {
  let changed = false;
  const blocks = doc.blocks.map((block) => {
    if (block.id !== id) return block;
    changed = true;
    return { ...block, ...patch, id: block.id, type: block.type };
  });
  return changed ? { ...doc, blocks } : doc;
}

/** 在某个版块后面插入（`afterId` 为 null 时插到最后）；满 30 个就不加。 */
export function insertBlock(doc: BayPageDoc, block: BayPageBlock, afterId: string | null = null): BayPageDoc {
  if (doc.blocks.length >= BAY_PAGE_MAX_BLOCKS) return doc;
  const index = afterId ? doc.blocks.findIndex((item) => item.id === afterId) : -1;
  const blocks = doc.blocks.slice();
  if (index < 0) blocks.push(block);
  else blocks.splice(index + 1, 0, block);
  return { ...doc, blocks };
}

export function patchTheme(doc: BayPageDoc, patch: Partial<BayPageTheme>): BayPageDoc {
  return { ...doc, theme: { ...doc.theme, ...patch } };
}

/** 序列化后的字节数（保存前在界面上先拦一道，后端还会再判）。 */
export function pageDocBytes(doc: BayPageDoc): number {
  const json = JSON.stringify(doc);
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(json).length;
  return json.length * 3;
}

// ---- 主题：底色风格与字体 → 一组颜色（行内 style 用，不依赖消费站的样式表） -------------

export interface BayPagePalette {
  bg: string;
  surface: string;
  fg: string;
  muted: string;
  border: string;
  /** 封面渐变的两端（主色之外的那一端）。 */
  glow: string;
  dark: boolean;
}

export const BAY_PAGE_PALETTES: Readonly<Record<BayPageTone, BayPagePalette>> = {
  light: { bg: "#ffffff", surface: "#f6f6f7", fg: "#111113", muted: "#6b6b76", border: "rgba(17,17,19,0.08)", glow: "#f1f5f9", dark: false },
  warm: { bg: "#fbf7f1", surface: "#f3ebdf", fg: "#2a211a", muted: "#7a6a5b", border: "rgba(42,33,26,0.10)", glow: "#fde9cf", dark: false },
  dark: { bg: "#0d0d10", surface: "#17171c", fg: "#f5f5f7", muted: "#9b9ba8", border: "rgba(255,255,255,0.10)", glow: "#1f1f2a", dark: true },
  ocean: { bg: "#06141f", surface: "#0c2233", fg: "#eaf6ff", muted: "#8fb1c7", border: "rgba(234,246,255,0.12)", glow: "#0b3a55", dark: true },
  sunset: { bg: "#fff5f0", surface: "#ffe8dd", fg: "#3a1a12", muted: "#8a5b4d", border: "rgba(58,26,18,0.10)", glow: "#ffd0b8", dark: false },
  forest: { bg: "#0c1a14", surface: "#13271e", fg: "#ecf7f0", muted: "#93b3a2", border: "rgba(236,247,240,0.12)", glow: "#17402e", dark: true },
};

export const BAY_PAGE_TONE_LABELS: Readonly<Record<BayPageTone, string>> = {
  light: "明亮",
  warm: "暖纸",
  dark: "深色",
  ocean: "深海",
  sunset: "晚霞",
  forest: "森林",
};

export const BAY_PAGE_FONT_LABELS: Readonly<Record<BayPageFont, string>> = {
  sans: "现代",
  serif: "书卷",
  rounded: "圆润",
  mono: "等宽",
};

export const BAY_PAGE_FONT_STACKS: Readonly<Record<BayPageFont, string>> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  serif: 'ui-serif, "Iowan Old Style", "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Yuanti SC", "PingFang SC", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", Menlo, monospace',
};

function hexToRgb(hex: string): [number, number, number] {
  const value = ACCENT_RE.test(hex) ? hex.slice(1) : "0ea5e9";
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

/** 主色上面压什么颜色的字看得清（按亮度选黑或白）。 */
export function accentInk(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#111113" : "#ffffff";
}

export function accentAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 整张主页的 CSS 变量（挂在主页根节点的 style 上）。 */
export function pageThemeVars(theme: BayPageTheme): Record<string, string> {
  const palette = BAY_PAGE_PALETTES[theme.tone] ?? BAY_PAGE_PALETTES.light;
  return {
    "--bp-bg": palette.bg,
    "--bp-surface": palette.surface,
    "--bp-fg": palette.fg,
    "--bp-muted": palette.muted,
    "--bp-border": palette.border,
    "--bp-accent": theme.accent,
    "--bp-accent-ink": accentInk(theme.accent),
    "--bp-accent-soft": accentAlpha(theme.accent, palette.dark ? 0.22 : 0.12),
    "--bp-font": BAY_PAGE_FONT_STACKS[theme.font] ?? BAY_PAGE_FONT_STACKS.sans,
  };
}

/** 没有封面图时的渐变封面。 */
export function coverGradient(theme: BayPageTheme): string {
  const palette = BAY_PAGE_PALETTES[theme.tone] ?? BAY_PAGE_PALETTES.light;
  return [
    `radial-gradient(120% 140% at 0% 0%, ${accentAlpha(theme.accent, 0.95)} 0%, transparent 60%)`,
    `radial-gradient(90% 120% at 100% 10%, ${accentAlpha(theme.accent, 0.45)} 0%, transparent 55%)`,
    `linear-gradient(135deg, ${palette.glow} 0%, ${palette.surface} 100%)`,
  ].join(", ");
}
