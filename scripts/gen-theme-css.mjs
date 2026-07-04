// ===========================================================================
// gen-theme-css.mjs — 从 theme-config.ts 的令牌数据生成特色主题 CSS，写进 globals.css。
// ---------------------------------------------------------------------------
// 主题体系 v3（数据驱动）：加/改一个特色主题 = 改 theme-config.ts 的 THEME_TOKENS 数据，
// 然后跑本脚本重新生成 globals.css 里 THEME:GENERATED 标记区内的 `html.<slug>{…}` 段。
// 决策见 oceandino repo docs/architecture/oceanleo-theme-two-tiers-data-driven.md。
//
// 机制：theme-config.ts 自包含（零 import），用 tsc 单文件编译成临时 ESM 后 import 取数据。
// 用法：node scripts/gen-theme-css.mjs   （由 package.json 的 build:themes 调用）
// ===========================================================================
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CONFIG_TS = join(ROOT, "src/theme/theme-config.ts");
const GLOBALS = join(ROOT, "src/theme/globals.css");
const START = "/* THEME:GENERATED:START — do not edit by hand; run npm run build:themes */";
const END = "/* THEME:GENERATED:END */";

// 1) 单文件编译 theme-config.ts → 临时 ESM（它自包含、无 import，可独立编译）。
const tmp = mkdtempSync(join(tmpdir(), "leo-theme-"));
const tsc = join(ROOT, "node_modules/.bin/tsc");
execSync(
  `"${tsc}" "${CONFIG_TS}" --module esnext --target es2020 --moduleResolution bundler --outDir "${tmp}"`,
  { stdio: "inherit" },
);
const mod = await import(pathToFileURL(join(tmp, "theme-config.js")).href);
const { DARK_THEME_TOKENS, LIGHT_THEME_TOKENS, DARK_VARIANT_THEMES, LIGHT_VARIANT_THEMES } = mod;

// 2) 生成器：深色配色包 → 一段 `html.<slug>`（复用 html.dark 覆盖层，只换 --leo-d-* 令牌）。
function darkBlock(slug, t) {
  const glow = t.glow
    ? `\n  box-shadow: 0 0 20px -4px ${t.glow}, ${t.btnShadow || "0 6px 18px -8px rgba(0,0,0,0.5)"} !important;`
    : t.btnShadow
      ? `\n  box-shadow: ${t.btnShadow} !important;`
      : "";
  return `
/* ── ${slug} ─────────────────────────────────────────────────────────────── */
html.${slug} {
  color-scheme: dark;
  background: ${t.canvas};
  --leo-d-bg: ${t.bg};
  --leo-d-sidebar: ${t.sidebar};
  --leo-d-surface: ${t.surface};
  --leo-d-card: ${t.card};
  --leo-d-card-2: ${t.card2};
  --leo-d-border: ${t.border};
  --leo-d-border-s: ${t.borderS};
  --leo-d-fg: ${t.fg};
  --leo-d-fg-2: ${t.fg2};
  --leo-d-muted: ${t.muted};
  --leo-d-faint: ${t.faint};
  --ring: ${t.ring};
  --border-strong: ${t.borderStrong};
  --divider: ${t.divider};
  --border: ${t.border};
  --border-2: ${t.border};
  --card: ${t.card};
  --surface: ${t.card};
  --sidebar: ${t.sidebar};
  --sidebar-bg: ${t.sidebar};
  --header-bg: ${t.sidebar};${t.glow ? `\n  --accent-glow: ${t.glow};` : ""}
}
html.${slug} body {
  background: ${t.canvas};
  background-attachment: fixed;
  color: var(--leo-d-fg);
}
html.${slug} [data-oceanleo-chrome] {
  background-color: var(--leo-d-sidebar) !important;
  border-color: var(--leo-d-border) !important;${t.glow ? `\n  box-shadow: inset 0 0 0 1px ${withAlpha(t.glow, 0.06)};` : ""}
}
html.${slug} .rounded-xl, html.${slug} .rounded-2xl,
html.${slug} .rounded-\\[20px\\], html.${slug} .rounded-\\[24px\\] {
  border-color: var(--leo-d-border);
}
/* 主按钮（各站用 bg-neutral-900 等做主按钮）→ 本主题品牌渐变。 */
html.${slug} .bg-neutral-900,
html.${slug} .bg-neutral-800,
html.${slug} .bg-stone-900,
html.${slug} .bg-stone-800,
html.${slug} .bg-slate-900,
html.${slug} .bg-slate-800,
html.${slug} .bg-black {
  background: linear-gradient(135deg, ${t.btnFrom} 0%, ${t.btnTo} 100%) !important;
  color: ${t.btnText} !important;${glow}
}
html.${slug} .bg-neutral-900.text-white,
html.${slug} .bg-neutral-800.text-white,
html.${slug} .bg-stone-900.text-white,
html.${slug} .bg-slate-900.text-white,
html.${slug} .bg-black.text-white { color: ${t.btnText} !important; }
html.${slug} .hover\\:bg-neutral-800:hover,
html.${slug} .hover\\:bg-neutral-700:hover,
html.${slug} .hover\\:bg-black:hover {
  filter: brightness(1.08) saturate(1.06);
  background: linear-gradient(135deg, ${t.btnFrom} 0%, ${t.btnTo} 100%) !important;
}
html.${slug} .focus\\:border-neutral-400:focus,
html.${slug} .focus-within\\:border-neutral-400:focus-within,
html.${slug} .focus\\:border-neutral-300:focus,
html.${slug} .focus-within\\:border-neutral-300:focus-within {
  border-color: var(--border-strong) !important;
  box-shadow: 0 0 0 3px var(--ring) !important;
}
html.${slug} [data-oceanleo-shell] *::-webkit-scrollbar-thumb,
html.${slug} .v-scroll::-webkit-scrollbar-thumb { background: var(--border-strong); }
html.${slug} [data-oceanleo-shell] *,
html.${slug} .v-scroll { scrollbar-color: var(--border-strong) transparent; }
`;
}

// 浅色配色包 → 一段 `html.<slug>`（浅色基座，覆盖浅色语义令牌 + 浅底渐变）。
function lightBlock(slug, t) {
  return `
/* ── ${slug} (light) ─────────────────────────────────────────────────────── */
html.${slug} { color-scheme: light; }
html.${slug} body {
  background: ${t.canvas};
  background-attachment: fixed;
  color: ${t.bodyFg};
}
html.${slug} {
  --bg: ${t.bg};
  --surface: ${t.surface};
  --card: ${t.card};
  --card-2: ${t.card2};
  --sidebar: ${t.sidebar};
  --sidebar-bg: ${t.sidebar};
  --header-bg: ${t.sidebar};
  --border: ${t.border};
  --border-2: ${t.borderS};
  --border-strong: ${t.borderStrong};
  --divider: ${t.divider};
  --ring: ${t.ring};
  --fg: ${t.fg};
  --fg-2: ${t.fg2};
  --muted: ${t.muted};
  --faint: ${t.faint};
}
html.${slug} [data-oceanleo-chrome] {
  background-color: ${t.chrome} !important;
  border-color: ${t.border} !important;
}
html.${slug} .bg-white,
html.${slug} .bg-neutral-50,
html.${slug} .bg-stone-50,
html.${slug} .bg-slate-50,
html.${slug} .bg-gray-50 { background-color: ${t.cardWhite} !important; }
html.${slug} .bg-neutral-100,
html.${slug} .bg-stone-100,
html.${slug} .bg-gray-100 { background-color: ${t.card2} !important; }
html.${slug} .bg-neutral-900,
html.${slug} .bg-neutral-800,
html.${slug} .bg-stone-900,
html.${slug} .bg-stone-800,
html.${slug} .bg-slate-900,
html.${slug} .bg-black {
  background: linear-gradient(135deg, ${t.btnFrom} 0%, ${t.btnTo} 100%) !important;
  color: ${t.btnText} !important;${t.btnShadow ? `\n  box-shadow: ${t.btnShadow} !important;` : ""}
}
html.${slug} .bg-neutral-900.text-white,
html.${slug} .bg-neutral-800.text-white,
html.${slug} .bg-stone-900.text-white,
html.${slug} .bg-slate-900.text-white,
html.${slug} .bg-black.text-white { color: ${t.btnText} !important; }
html.${slug} .focus\\:border-neutral-400:focus,
html.${slug} .focus-within\\:border-neutral-400:focus-within {
  border-color: ${t.focusBorder} !important;
  box-shadow: 0 0 0 3px ${t.focusRing} !important;
}
html.${slug} [data-oceanleo-shell] *::-webkit-scrollbar-thumb,
html.${slug} .v-scroll::-webkit-scrollbar-thumb { background: ${t.scrollThumb}; }
`;
}

// rgba(...,a) / #hex 都可能传进来做 glow；这里只需给内辉光一个更低的 alpha。
function withAlpha(color, a) {
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (m) {
    const parts = m[1].split(",").map((s) => s.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
  }
  return color;
}

// 3) 拼装：深色组 + 浅色组（顺序 = 登记顺序，稳定 diff）。
let css = `${START}\n`;
css += `/* 本区由 scripts/gen-theme-css.mjs 从 theme-config.ts 的 THEME_TOKENS 生成。 */\n`;
css += `/* 深色特色主题（生效类名 dark <slug>，复用 html.dark 覆盖层，只换配色令牌）。 */\n`;
for (const slug of DARK_VARIANT_THEMES) css += darkBlock(slug, DARK_THEME_TOKENS[slug]);
css += `\n/* 浅色特色主题（生效类名 <slug>，浅色基座，覆盖浅色语义令牌 + 浅底渐变）。 */\n`;
for (const slug of LIGHT_VARIANT_THEMES) css += lightBlock(slug, LIGHT_THEME_TOKENS[slug]);
css += `${END}`;

// 4) 把生成结果 splice 进 globals.css 的标记区（标记不存在则追加到文件末尾建区）。
let globals = readFileSync(GLOBALS, "utf8");
const si = globals.indexOf(START);
const ei = globals.indexOf(END);
if (si !== -1 && ei !== -1) {
  globals = globals.slice(0, si) + css + globals.slice(ei + END.length);
} else {
  globals = globals.trimEnd() + "\n\n" + css + "\n";
}
writeFileSync(GLOBALS, globals);
rmSync(tmp, { recursive: true, force: true });
console.log(
  `[gen-theme-css] wrote ${DARK_VARIANT_THEMES.length} dark + ${LIGHT_VARIANT_THEMES.length} light theme blocks into globals.css`,
);
