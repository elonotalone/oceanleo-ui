// ===========================================================================
// gen-theme-css.mjs — 从 theme-config.ts / motion.ts 的令牌数据生成 CSS，写进 globals.css。
// ---------------------------------------------------------------------------
// 主题体系 v3（数据驱动）：加/改一个特色主题 = 改 theme-config.ts 的 THEME_TOKENS 数据，
// 然后跑本脚本重新生成 globals.css 里 THEME:GENERATED 标记区内的 `html.<slug>{…}` 段。
// 决策见 oceandino repo docs/architecture/oceanleo-theme-two-tiers-data-driven.md。
//
// 动效 token（2026-08-31）挂在同一条管线上：数据源 src/theme/motion.ts，规范
// docs/architecture/motion-system.md。规范明令「不新建第二个 CSS 文件」，所以动效
// token 与配色块共用这一个标记区，动效在前、配色在后。
//
// 机制：两份数据源都自包含（零 import），用 tsc 单文件编译成临时 ESM 后 import 取数据。
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
const MOTION_TS = join(ROOT, "src/theme/motion.ts");
const GLOBALS = join(ROOT, "src/theme/globals.css");
const START = "/* THEME:GENERATED:START — do not edit by hand; run npm run build:themes */";
const END = "/* THEME:GENERATED:END */";

// 1) 单文件编译两份数据源 → 临时 ESM（都自包含、无 import，可独立编译）。
const tmp = mkdtempSync(join(tmpdir(), "leo-theme-"));
const tsc = join(ROOT, "node_modules/.bin/tsc");
execSync(
  `"${tsc}" "${CONFIG_TS}" "${MOTION_TS}" --module esnext --target es2020 --moduleResolution bundler --outDir "${tmp}"`,
  { stdio: "inherit" },
);
const mod = await import(pathToFileURL(join(tmp, "theme-config.js")).href);
const { DARK_THEME_TOKENS, LIGHT_THEME_TOKENS, DARK_VARIANT_THEMES, LIGHT_VARIANT_THEMES } = mod;
const motion = await import(pathToFileURL(join(tmp, "motion.js")).href);

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

// 动效 token 段（motion-system.md §规范一）。数据全部来自 src/theme/motion.ts。
function declList(tokens, indent = "  ") {
  const width = Math.max(...tokens.map((t) => t.name.length));
  return tokens
    .map((t) => `${indent}${(t.name + ":").padEnd(width + 2)}${t.value};`.padEnd(46) + ` /* ${t.use} */`)
    .join("\n");
}

function motionBlock() {
  const {
    MOTION_DURATION_TOKENS,
    MOTION_EASING_TOKENS,
    MOTION_MOVE_TOKENS,
    MOTION_STAGGER_TOKENS,
    MOTION_LOOP_TOKENS,
    MOTION_AMPLITUDE_TOKENS,
    REDUCED_MOTION_ZEROED,
    REDUCED_MOTION_LOOP,
    SPRING_SOURCE,
    springLinearStops,
    createSpring,
  } = motion;

  const [idealMs] = createSpring(SPRING_SOURCE);

  return `
/* ── 动效 token（motion-system.md §规范一）──────────────────────────────────
   数据源 src/theme/motion.ts；改值改那里再跑 npm run build:themes，手改本段无效。
   靶子（01-verified-facts.md §2.3）：607 条裸 transition 对 62 条显式时长，约 90%
   的动效跑在 Tailwind 默认的同一档上——同速同节奏、没有层级，这就是「死板」。
   层级规则比数值本身重要：同一视觉层级用同一档，跨层级差【恰好一档】。 */
:root {
  /* 时长阶梯（六档） */
${declList(MOTION_DURATION_TOKENS)}

  /* 曲线（五条，第五条 --leo-ease-spring 见下方 @supports） */
${declList(MOTION_EASING_TOKENS)}

  /* 入场位移幅度 */
${declList(MOTION_MOVE_TOKENS)}

  /* 列表错峰 */
${declList(MOTION_STAGGER_TOKENS)}

  /* 循环动效周期。全部长于阶梯顶格 520ms，故不进六档阶梯，单列一组；
     值逐字沿用 token 化之前 globals.css 里的现值。 */
${declList(MOTION_LOOP_TOKENS)}

  /* 载荷指示器的几何幅度——reduced-motion 下「降幅」降的就是这两个。 */
${declList(MOTION_AMPLITUDE_TOKENS)}

  /* --leo-ease-spring 的降级值：不支持 linear() 时退回品牌曲线。 */
  --leo-ease-spring: var(--leo-ease-emphasis);
}

/* --leo-ease-spring —— 物理弹簧的 linear() 近似。
   生成参数（motion-system.md §linear() 弹簧曲线的生成方式，原样留档供后人复算）：
     stiffness: ${SPRING_SOURCE.stiffness}    damping: ${SPRING_SOURCE.damping}    mass: ${SPRING_SOURCE.mass}    velocity: ${SPRING_SOURCE.velocity}
     简化 (RDP tolerance): ${SPRING_SOURCE.simplify}    舍入: ${SPRING_SOURCE.round} 位小数
   这串数字**不是手写的**：算法与 Linear Easing Generator
   (linear-easing-generator.netlify.app) 逐行一致，实现在 src/theme/motion.ts::
   springLinearStops()，每次 npm run build:themes 重算。搬算法而不是贴产物，是为了
   让参数改动在 CI 里可复算——贴一串数字做不到这件事。
   该弹簧的理想时长 ${idealMs.toFixed(3)}ms（createSpring 的 duration 产物），供调用方参考。 */
@supports (animation-timing-function: linear(0, 1)) {
  :root {
    --leo-ease-spring: linear(${springLinearStops(SPRING_SOURCE)});
  }
}

/* ── reduced-motion：一次性全局降级（motion-system.md §reduced-motion）──────
   token 化之前全仓 332,746 行里只有 2 处 prefers-reduced-motion，且只覆盖
   v-fade/scale/pop 与 .v-page。降级放在 token 层，组件不必各自处理。 */
@media (prefers-reduced-motion: reduce) {
  :root {
${declList(REDUCED_MOTION_ZEROED, "    ")}
  }

  /* 载荷指示器例外：v-spin / v-shimmer / v-bounce-dot / v-pulse-dot 表达的是
     「系统还在做事」。把它们归零，用户会以为界面卡死——那不是无障碍，那是故障。
     所以这四条【保留动画，只放慢一倍并把几何幅度减半】，不归零。
     转圈只放慢不降幅：它没有几何幅度，「降幅」对它等于停转。 */
  :root {
${declList(REDUCED_MOTION_LOOP, "    ")}
  }
}
`;
}

// 3) 拼装：动效 token + 深色组 + 浅色组（顺序 = 登记顺序，稳定 diff）。
let css = `${START}\n`;
css += `/* 本区由 scripts/gen-theme-css.mjs 生成：动效 token 来自 motion.ts，`;
css += `配色来自 theme-config.ts 的 THEME_TOKENS。 */\n`;
css += motionBlock();
css += `\n/* 深色特色主题（生效类名 dark <slug>，复用 html.dark 覆盖层，只换配色令牌）。 */\n`;
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
  `[gen-theme-css] wrote motion tokens + ${DARK_VARIANT_THEMES.length} dark + ${LIGHT_VARIANT_THEMES.length} light theme blocks into globals.css`,
);
