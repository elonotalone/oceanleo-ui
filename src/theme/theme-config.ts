// @oceanleo/ui — 主题基础配置 + 数据驱动配色包（单一事实源）。
// 全家桶共用 cookie 名 / localStorage key / 模式类型。
// 决策见 oceandino repo docs/architecture/oceanleo-theme-and-17-locales.md
//   （class 策略 + 顶级域 cookie 同步 + 防闪脚本）与
//   docs/architecture/oceanleo-theme-two-tiers-data-driven.md（v3 数据驱动配色包）。
//
// 主题体系 v3（2026-07-04，操作员「按建议全做」）——【两大基座 + 数据驱动配色包】：
//   ① 顶层 = 2 个基座：Light 基座 / Dark 基座（+ Auto 在二者间按系统偏好解析）。
//   ② 每个基座挂 N 个「配色包」= 一组 CSS 令牌数据（见 DARK_THEME_TOKENS /
//      LIGHT_THEME_TOKENS）。加/改一个主题 = 改那份数据，`html.<slug>{…}` 的整段 CSS
//      由 scripts/gen-theme-css.mjs 生成到 globals.css 的 THEME:GENERATED 区，零手写 CSS。
//   ③ 深色配色包（生效类名 `dark <slug>`）：复用整套 html.dark 覆盖层，只换 --leo-d-*
//      配色令牌 + 主按钮渐变。共 6 个：
//        cyberpunk 霓虹（深海军蓝 + 蓝→黄发光按键；2026-07-04 由「赛博朋克」更名、
//                        配色从粉/玫红改蓝黄，slug 不变以保住存量 cookie）
//        warm  暖褐（暖陶土暗色）· night 极夜（Nord Polar Night）·
//        lilac 薰紫（Catppuccin Mocha）· teal 墨青（Solarized Dark）· oled 曜黑（纯黑）
//        —— warm/night/lilac/teal 于 2026-07-04 整体加深一档（操作员反馈「不够深」）。
//   ④ 浅色配色包（生效类名 `<slug>`，不带 .dark）：走浅色基座，覆盖浅色语义令牌 +
//      浅底渐变。共 4 个：paper 宣纸（暖米黄）· mist 晨雾（冷雾蓝白）·
//        dawn 天青（Solarized Light，呼应深色墨青）· sakura 樱粉（Catppuccin Latte，
//        呼应深色薰紫）。
//   ⑤ 每个特色主题都是【显式】主题（不随系统偏好变，auto 只在 light/dark 间解析）。
//   （历史：早先的 9 个「主题盘」ocean…mint 是「同底换色相」的廉价滤镜，已删。）

// ---------------------------------------------------------------------------
// 特色主题登记（顺序即 UI 展示顺序）。分「暗色系」与「浅色系」两组，因为二者
// 生成的 <html> 类名不同（暗色系带 .dark 基座、浅色系不带）。
// ---------------------------------------------------------------------------

// 暗色特色主题：生效类名 `dark <slug>`，复用 html.dark 基础覆盖层。
export const DARK_VARIANT_THEMES = [
  "cyberpunk",
  "warm",
  "night",
  "lilac",
  "teal",
  "oled",
] as const;

// 浅色特色主题：生效类名 `<slug>`（浅色基座，不带 .dark）。
export const LIGHT_VARIANT_THEMES = ["paper", "mist", "dawn", "sakura"] as const;

// 全部特色主题（登记 + 迭代用）。UI 展示顺序 = 暗色组在前、浅色组在后。
export const VARIANT_THEMES = [
  ...DARK_VARIANT_THEMES,
  ...LIGHT_VARIANT_THEMES,
] as const;

export type DarkVariantTheme = (typeof DARK_VARIANT_THEMES)[number];
export type LightVariantTheme = (typeof LIGHT_VARIANT_THEMES)[number];
export type VariantTheme = (typeof VARIANT_THEMES)[number];

// 每个特色主题的展示元数据：
//   label   中文名（i18n key，"中文原文即 key" 体系）
//   swatch/swatch2  代表色（UI 圆点/预览用；取该主题主按钮或强调渐变的两端）
//   base    "dark" | "light"（决定生成的类名与 color-scheme），迭代时无需再查两个数组
export const VARIANT_META: Record<
  VariantTheme,
  { label: string; swatch: string; swatch2: string; base: "dark" | "light" }
> = {
  // cyberpunk：slug 保持不变（cookie 存 slug，改 slug 会让存量用户主题失效），
  // 只改中文名（赛博朋克 → 霓虹）与配色（蓝→黄，去掉旧的粉/玫红火山感）。
  cyberpunk: { label: "霓虹", swatch: "#38bdf8", swatch2: "#ffd23f", base: "dark" },
  warm: { label: "暖褐", swatch: "#c8a27a", swatch2: "#a8785a", base: "dark" },
  night: { label: "极夜", swatch: "#88c0d0", swatch2: "#5e81ac", base: "dark" },
  lilac: { label: "薰紫", swatch: "#cba6f7", swatch2: "#f5c2e7", base: "dark" },
  teal: { label: "墨青", swatch: "#2aa198", swatch2: "#268bd2", base: "dark" },
  oled: { label: "曜黑", swatch: "#e5e7eb", swatch2: "#6b7280", base: "dark" },
  paper: { label: "宣纸", swatch: "#c8a15a", swatch2: "#a9743a", base: "light" },
  mist: { label: "晨雾", swatch: "#7c93ad", swatch2: "#3b4a5c", base: "light" },
  dawn: { label: "天青", swatch: "#2aa198", swatch2: "#268bd2", base: "light" },
  sakura: { label: "樱粉", swatch: "#ea76cb", swatch2: "#8839ef", base: "light" },
};

export type ThemeMode = "light" | "dark" | "auto" | VariantTheme;

export const THEME_MODES: readonly ThemeMode[] = [
  "light",
  "dark",
  "auto",
  ...VARIANT_THEMES,
] as const;

export const DEFAULT_THEME_MODE: ThemeMode = "auto";

// 实际生效的外观。light/dark 与各特色主题同名；auto 解析成 light/dark。
export type ThemeAppearance = "light" | "dark" | VariantTheme;

// 与语言 cookie（NEXT_LOCALE）同款机制：写在 `.oceanleo.com` 顶级域，跨全部
// *.oceanleo.com 子站共享主题选择。浏览器与服务端读写同一个 cookie。
export const THEME_COOKIE = "oceanleo-theme";

// 同源快速兜底（cookie 尚未回传时的同站二次访问）。跨子域不通，仅辅助。
export const THEME_STORAGE_KEY = "oceanleo-theme";

// 一年，主题选择长期生效。
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isDarkVariant(value: unknown): value is DarkVariantTheme {
  return typeof value === "string" && (DARK_VARIANT_THEMES as readonly string[]).includes(value);
}

export function isLightVariant(value: unknown): value is LightVariantTheme {
  return typeof value === "string" && (LIGHT_VARIANT_THEMES as readonly string[]).includes(value);
}

export function isVariantTheme(value: unknown): value is VariantTheme {
  return typeof value === "string" && (VARIANT_THEMES as readonly string[]).includes(value);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  return isThemeMode(value) ? value : DEFAULT_THEME_MODE;
}

// 把「模式 + 系统偏好」解析成实际生效的外观。
// 显式 light/dark/特色主题直接返回；auto 模式下 systemPrefersDark=true → dark，
// 否则 light（auto 永不解析成任何特色主题 —— 它们必须由用户显式选择）。
export function resolveThemeClass(
  mode: ThemeMode,
  systemPrefersDark: boolean,
): ThemeAppearance {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  if (isVariantTheme(mode)) return mode;
  return systemPrefersDark ? "dark" : "light";
}

// 外观 → <html> 类名字符串（首帧/客户端共用的单一事实源）。
//   light             → "light"
//   dark              → "dark"
//   <暗色特色主题>     → "dark <slug>"（复用 html.dark 基础规则 + 覆盖配色令牌）
//   <浅色特色主题>     → "<slug>"（浅色基座 + 覆盖浅色底/令牌）
export function appearanceToHtmlClass(appearance: ThemeAppearance): string {
  if (isDarkVariant(appearance)) return `dark ${appearance}`;
  if (isLightVariant(appearance)) return appearance;
  return appearance;
}

// 某外观是否走浅色基座（供 color-scheme 判定：light + 浅色特色主题 = light UA 样式）。
export function isLightAppearance(appearance: ThemeAppearance): boolean {
  return appearance === "light" || isLightVariant(appearance);
}

// 应用/清除类名时要移除的全部主题类（防止切换残留）。
export function allThemeClassNames(): string[] {
  return ["light", "dark", ...VARIANT_THEMES];
}

// ===========================================================================
// 数据驱动配色包（主题体系 v3，2026-07-04）——单一事实源。
// ---------------------------------------------------------------------------
// 决策见 oceandino repo docs/architecture/oceanleo-theme-two-tiers-data-driven.md。
// 每个特色主题 = 一组令牌数据；`html.<slug>{…}` 的整段 CSS 由 scripts/gen-theme-css.mjs
// 从这些数据生成，写进 globals.css 的 THEME:GENERATED 标记区。加主题 = 加一条数据，
// 不再手写 CSS。深色包与浅色包字段不同（基座不同：深色复用 html.dark 覆盖层只换
// --leo-d-* 令牌；浅色走浅色基座、覆盖浅色语义令牌 + 浅底渐变）。
// ===========================================================================

/** 深色配色包：一组 --leo-d-* 令牌 + 主按钮渐变 + 画布背景 + 可选发光。 */
export interface DarkThemeTokens {
  /** body/html 背景（整段 CSS background 值，可含多层 radial+linear 渐变）。 */
  canvas: string;
  bg: string;        // --leo-d-bg 主区最底
  sidebar: string;   // --leo-d-sidebar 侧栏（比主区浅一档）
  surface: string;   // --leo-d-surface 次级面
  card: string;      // --leo-d-card 卡片（最亮层）
  card2: string;     // --leo-d-card-2 hover/选中
  border: string;    // --leo-d-border 低对比描边
  borderS: string;   // --leo-d-border-s 更弱分隔线
  fg: string;        // 主文字
  fg2: string;       // 次要文字
  muted: string;     // 弱化文字
  faint: string;     // 极弱 / 占位
  ring: string;      // focus 环
  borderStrong: string; // 强描边（选中 / hover）
  divider: string;   // 语义 --divider
  /** 主按钮渐变两端 + 字色。 */
  btnFrom: string;
  btnTo: string;
  btnText: string;
  /** 主按钮阴影（可选，默认给一条柔和投影）。 */
  btnShadow?: string;
  /** 可选：霓虹发光色（cyberpunk 用；给了则主按钮/描边/卡片带 glow）。 */
  glow?: string;
}

/** 浅色配色包：一组浅色语义令牌 + 浅底渐变 + 主按钮。 */
export interface LightThemeTokens {
  /** body 浅色背景（整段 CSS background 值）。 */
  canvas: string;
  /** body 文字色。 */
  bodyFg: string;
  bg: string;
  surface: string;
  card: string;
  card2: string;
  sidebar: string;
  chrome: string;      // 外壳容器（侧栏/顶栏）底色
  cardWhite: string;   // bg-white 压成的"纸白"，避免刺眼正白
  border: string;
  borderS: string;
  borderStrong: string;
  divider: string;
  ring: string;
  fg: string;
  fg2: string;
  muted: string;
  faint: string;
  /** 主按钮渐变两端 + 字色（浅底上要够深）。 */
  btnFrom: string;
  btnTo: string;
  btnText: string;
  btnShadow?: string;
  /** focus 环 box-shadow 色 + 描边色。 */
  focusBorder: string;
  focusRing: string;
  /** 滚动条拇指色。 */
  scrollThumb: string;
}

// ---------------------------------------------------------------------------
// 深色配色包数据（口径对齐 Manus v2：层次靠明度微差、边框几乎不可见；侧栏比主区浅一档）。
// 2026-07-04：warm/night/lilac/teal 整体加深一档（操作员反馈"深色 theme 不够深"）；
// oled 维持纯黑；cyberpunk 改深蓝 + 蓝黄按键（去旧的粉/玫红）。
// ---------------------------------------------------------------------------
export const DARK_THEME_TOKENS: Record<DarkVariantTheme, DarkThemeTokens> = {
  // 霓虹（原赛博朋克）：深海军蓝底 + 蓝/黄双色光晕（去旧的玫红火山感）+ 蓝→黄发光按键。
  cyberpunk: {
    canvas:
      "radial-gradient(130% 95% at 10% 0%, rgba(56,189,248,0.16) 0%, rgba(56,189,248,0) 46%), " +
      "radial-gradient(140% 105% at 100% 6%, rgba(255,210,63,0.12) 0%, rgba(255,210,63,0) 48%), " +
      "radial-gradient(150% 120% at 90% 100%, rgba(56,189,248,0.14) 0%, rgba(56,189,248,0) 55%), " +
      "linear-gradient(150deg, #050b1f 0%, #081226 48%, #0a1020 100%)",
    bg: "#050b1f",
    sidebar: "#0a1330",
    surface: "#081027",
    card: "#0d1838cc",
    card2: "#142250",
    border: "rgba(56, 189, 248, 0.20)",
    borderS: "rgba(56, 189, 248, 0.12)",
    fg: "#eaf2ff",
    fg2: "#aebfe4",
    muted: "#8194c0",
    faint: "#5f719c",
    ring: "rgba(255, 210, 63, 0.55)",
    borderStrong: "rgba(56, 189, 248, 0.40)",
    divider: "rgba(56, 189, 248, 0.16)",
    btnFrom: "#38bdf8",
    btnTo: "#ffd23f",
    btnText: "#06121f",
    glow: "rgba(56, 189, 248, 0.55)",
  },
  // 暖褐：暖陶土低饱和暗色（加深一档：#1c1712 → #15110c）。
  warm: {
    canvas:
      "radial-gradient(115% 85% at 0% 0%, rgba(200,162,122,0.08) 0%, rgba(200,162,122,0) 46%), " +
      "radial-gradient(125% 95% at 100% 100%, rgba(150,140,90,0.06) 0%, rgba(150,140,90,0) 50%), " +
      "#15110c",
    bg: "#15110c",
    sidebar: "#1d1811",
    surface: "#19140d",
    card: "#241d14",
    card2: "#30271b",
    border: "rgba(200, 162, 122, 0.13)",
    borderS: "rgba(200, 162, 122, 0.07)",
    fg: "#efe6da",
    fg2: "#c9b9a4",
    muted: "#988771",
    faint: "#6d6051",
    ring: "rgba(200, 162, 122, 0.45)",
    borderStrong: "rgba(200, 162, 122, 0.30)",
    divider: "rgba(200, 162, 122, 0.14)",
    btnFrom: "#c8a27a",
    btnTo: "#a8785a",
    btnText: "#211610",
    btnShadow: "0 6px 18px -8px rgba(168,120,90,0.55), inset 0 1px 0 rgba(255,255,255,0.14)",
  },
  // 极夜：Nord Polar Night（加深一档：#2e3440 → #20252e，压掉 Nord 偏亮的底，仍是冷蓝灰）。
  night: {
    canvas:
      "radial-gradient(120% 90% at 100% 0%, rgba(136,192,208,0.09) 0%, rgba(136,192,208,0) 48%), " +
      "radial-gradient(120% 90% at 0% 100%, rgba(94,129,172,0.08) 0%, rgba(94,129,172,0) 50%), " +
      "#20252e",
    bg: "#20252e",
    sidebar: "#2a303c",
    surface: "#252b35",
    card: "#333a48",
    card2: "#3d4554",
    border: "rgba(136, 192, 208, 0.14)",
    borderS: "rgba(136, 192, 208, 0.08)",
    fg: "#eceff4",
    fg2: "#cfd6e2",
    muted: "#909cb0",
    faint: "#646d80",
    ring: "rgba(136, 192, 208, 0.50)",
    borderStrong: "rgba(136, 192, 208, 0.34)",
    divider: "rgba(136, 192, 208, 0.16)",
    btnFrom: "#88c0d0",
    btnTo: "#5e81ac",
    btnText: "#1a1f27",
    btnShadow: "0 6px 18px -8px rgba(94,129,172,0.55), inset 0 1px 0 rgba(255,255,255,0.16)",
  },
  // 薰紫：Catppuccin Mocha（加深一档：#1e1e2e → #16161f）。
  lilac: {
    canvas:
      "radial-gradient(120% 90% at 0% 0%, rgba(203,166,247,0.10) 0%, rgba(203,166,247,0) 46%), " +
      "radial-gradient(120% 90% at 100% 100%, rgba(245,194,231,0.07) 0%, rgba(245,194,231,0) 50%), " +
      "#16161f",
    bg: "#16161f",
    sidebar: "#1e1e2b",
    surface: "#1a1a26",
    card: "#26263a",
    card2: "#31314a",
    border: "rgba(203, 166, 247, 0.14)",
    borderS: "rgba(203, 166, 247, 0.08)",
    fg: "#eef0fb",
    fg2: "#c4c3e2",
    muted: "#918fb6",
    faint: "#68668d",
    ring: "rgba(203, 166, 247, 0.50)",
    borderStrong: "rgba(203, 166, 247, 0.34)",
    divider: "rgba(245, 194, 231, 0.16)",
    btnFrom: "#cba6f7",
    btnTo: "#f5c2e7",
    btnText: "#201b2e",
    btnShadow: "0 6px 18px -8px rgba(203,166,247,0.55), inset 0 1px 0 rgba(255,255,255,0.20)",
  },
  // 墨青：Solarized Dark（加深一档：#002b36 → #001b23，仍保留 Solarized 青墨识别度）。
  teal: {
    canvas:
      "radial-gradient(120% 90% at 100% 0%, rgba(42,161,152,0.11) 0%, rgba(42,161,152,0) 48%), " +
      "radial-gradient(120% 90% at 0% 100%, rgba(38,139,210,0.09) 0%, rgba(38,139,210,0) 50%), " +
      "#001b23",
    bg: "#001b23",
    sidebar: "#04262f",
    surface: "#022029",
    card: "#083640",
    card2: "#0d4650",
    border: "rgba(42, 161, 152, 0.16)",
    borderS: "rgba(42, 161, 152, 0.09)",
    fg: "#eaf3f2",
    fg2: "#8b9a9a",
    muted: "#647a7e",
    faint: "#495c61",
    ring: "rgba(42, 161, 152, 0.52)",
    borderStrong: "rgba(42, 161, 152, 0.36)",
    divider: "rgba(42, 161, 152, 0.18)",
    btnFrom: "#2aa198",
    btnTo: "#268bd2",
    btnText: "#012028",
    btnShadow: "0 6px 18px -8px rgba(42,161,152,0.55), inset 0 1px 0 rgba(255,255,255,0.16)",
  },
  // 曜黑：纯黑高对比（OLED 省电 / 极简）——维持纯黑，不动。
  oled: {
    canvas:
      "radial-gradient(120% 70% at 50% 0%, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0) 42%), #000000",
    bg: "#000000",
    sidebar: "#0b0b0c",
    surface: "#070708",
    card: "#141416",
    card2: "#1e1e21",
    border: "rgba(255, 255, 255, 0.10)",
    borderS: "rgba(255, 255, 255, 0.055)",
    fg: "#f4f4f5",
    fg2: "#c4c4c8",
    muted: "#8a8a90",
    faint: "#5c5c62",
    ring: "rgba(255, 255, 255, 0.40)",
    borderStrong: "rgba(255, 255, 255, 0.24)",
    divider: "rgba(255, 255, 255, 0.10)",
    btnFrom: "#f4f4f5",
    btnTo: "#c7c7cc",
    btnText: "#0a0a0b",
    btnShadow: "0 0 20px -6px rgba(255,255,255,0.25)",
  },
};

// ---------------------------------------------------------------------------
// 浅色配色包数据。paper 保留；新增 mist（冷雾蓝白）/ dawn（Solarized Light 浅青墨，
// 呼应深色墨青）/ sakura（Catppuccin Latte 奶油粉彩，呼应深色薰紫）。
// ---------------------------------------------------------------------------
export const LIGHT_THEME_TOKENS: Record<LightVariantTheme, LightThemeTokens> = {
  // 宣纸：暖米黄纸感（护眼阅读向）。
  paper: {
    canvas:
      "radial-gradient(120% 120% at 0% 0%, #fbf6ea 0%, rgba(251,246,234,0) 46%), " +
      "radial-gradient(120% 120% at 100% 100%, #efe3cf 0%, rgba(239,227,207,0) 52%), " +
      "linear-gradient(135deg, #f7efdf 0%, #f3ead6 48%, #eee2cc 100%)",
    bodyFg: "#4a4034",
    bg: "#f4ebd8",
    surface: "#fbf5e8",
    card: "#fdf9ee",
    card2: "#f3e8d2",
    sidebar: "#f6eeda",
    chrome: "#f6eeda",
    cardWhite: "#fdf9ee",
    border: "rgba(120, 96, 60, 0.16)",
    borderS: "rgba(120, 96, 60, 0.10)",
    borderStrong: "rgba(120, 96, 60, 0.30)",
    divider: "rgba(120, 96, 60, 0.14)",
    ring: "rgba(168, 120, 60, 0.40)",
    fg: "#4a4034",
    fg2: "#6b5f4d",
    muted: "#8a7c66",
    faint: "#a89a80",
    btnFrom: "#6b5335",
    btnTo: "#4a3925",
    btnText: "#f7efdf",
    btnShadow: "0 6px 16px -8px rgba(74,57,37,0.45)",
    focusBorder: "rgba(168, 120, 60, 0.55)",
    focusRing: "rgba(168, 120, 60, 0.16)",
    scrollThumb: "rgba(120, 96, 60, 0.24)",
  },
  // 晨雾：冷调雾蓝白（对标 paper 的暖，做一个冷的）。
  mist: {
    canvas:
      "radial-gradient(120% 120% at 0% 0%, #f3f6fb 0%, rgba(243,246,251,0) 46%), " +
      "radial-gradient(120% 120% at 100% 100%, #e5ebf3 0%, rgba(229,235,243,0) 52%), " +
      "linear-gradient(135deg, #eef2f8 0%, #e9eef5 48%, #e6ecf3 100%)",
    bodyFg: "#33404f",
    bg: "#e9eef5",
    surface: "#f4f7fb",
    card: "#fbfcfe",
    card2: "#eaf0f7",
    sidebar: "#eef3f9",
    chrome: "#eef3f9",
    cardWhite: "#fbfcfe",
    border: "rgba(60, 82, 110, 0.15)",
    borderS: "rgba(60, 82, 110, 0.09)",
    borderStrong: "rgba(60, 82, 110, 0.28)",
    divider: "rgba(60, 82, 110, 0.12)",
    ring: "rgba(59, 74, 92, 0.35)",
    fg: "#2b3644",
    fg2: "#4c5c6e",
    muted: "#72808f",
    faint: "#97a3b1",
    btnFrom: "#3b4a5c",
    btnTo: "#2b3644",
    btnText: "#eef3f9",
    btnShadow: "0 6px 16px -8px rgba(43,54,68,0.40)",
    focusBorder: "rgba(59, 74, 92, 0.50)",
    focusRing: "rgba(59, 74, 92, 0.16)",
    scrollThumb: "rgba(60, 82, 110, 0.22)",
  },
  // 天青：Solarized Light 浅青墨（呼应深色墨青 teal）。
  dawn: {
    canvas:
      "radial-gradient(120% 120% at 0% 0%, #fdf6e3 0%, rgba(253,246,227,0) 46%), " +
      "radial-gradient(120% 120% at 100% 100%, #eee8d5 0%, rgba(238,232,213,0) 52%), " +
      "linear-gradient(135deg, #fbf5e0 0%, #f3edd8 48%, #eee8d5 100%)",
    bodyFg: "#3d4a4a",
    bg: "#eee8d5",
    surface: "#fbf6e6",
    card: "#fdf9ee",
    card2: "#f1ead3",
    sidebar: "#f5efdc",
    chrome: "#f5efdc",
    cardWhite: "#fdf9ee",
    border: "rgba(42, 108, 108, 0.16)",
    borderS: "rgba(42, 108, 108, 0.10)",
    borderStrong: "rgba(42, 108, 108, 0.30)",
    divider: "rgba(42, 108, 108, 0.13)",
    ring: "rgba(38, 139, 210, 0.38)",
    fg: "#37474a",
    fg2: "#586e6e",
    muted: "#7c8f8c",
    faint: "#9aa8a3",
    btnFrom: "#2aa198",
    btnTo: "#268bd2",
    btnText: "#04252c",
    btnShadow: "0 6px 16px -8px rgba(42,161,152,0.40)",
    focusBorder: "rgba(38, 139, 210, 0.50)",
    focusRing: "rgba(38, 139, 210, 0.16)",
    scrollThumb: "rgba(42, 108, 108, 0.22)",
  },
  // 樱粉：Catppuccin Latte 奶油粉彩（呼应深色薰紫 lilac）。
  sakura: {
    canvas:
      "radial-gradient(120% 120% at 0% 0%, #fdf2f8 0%, rgba(253,242,248,0) 46%), " +
      "radial-gradient(120% 120% at 100% 100%, #f3e6ef 0%, rgba(243,230,239,0) 52%), " +
      "linear-gradient(135deg, #fbf0f6 0%, #f6ecf3 48%, #f2e8f0 100%)",
    bodyFg: "#4c3a4a",
    bg: "#f2e8f0",
    surface: "#fdf4fa",
    card: "#fefafd",
    card2: "#f5e7f1",
    sidebar: "#f8eef5",
    chrome: "#f8eef5",
    cardWhite: "#fefafd",
    border: "rgba(136, 57, 239, 0.14)",
    borderS: "rgba(136, 57, 239, 0.08)",
    borderStrong: "rgba(136, 57, 239, 0.26)",
    divider: "rgba(234, 118, 203, 0.16)",
    ring: "rgba(234, 118, 203, 0.38)",
    fg: "#443244",
    fg2: "#6a556a",
    muted: "#8c7690",
    faint: "#ab97b0",
    btnFrom: "#ea76cb",
    btnTo: "#8839ef",
    btnText: "#fdf4fa",
    btnShadow: "0 6px 16px -8px rgba(136,57,239,0.40)",
    focusBorder: "rgba(136, 57, 239, 0.50)",
    focusRing: "rgba(136, 57, 239, 0.16)",
    scrollThumb: "rgba(136, 57, 239, 0.20)",
  },
};
