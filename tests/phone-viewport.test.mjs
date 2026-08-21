// 窄屏闸门（共享外壳）：全家桶子站在手机上也得是「一个 app」，不是「手机壳里套网页」。
//
// 这道闸把 CSS 真的**算出来**：把 `env(safe-area-inset-*)` 灌成真机读数
// （iPhone 14 竖屏 47/34、安卓 24/24、横屏侧边 47），沿着 `:root` →
// `var(--leo-safe-*)` → `calc()` / `min()` 这条链求值，再拿算出来的像素数去判
// 「有没有横向溢出、底部那条会不会被手势条吞、手指点得中点不中」。把
// `var(--leo-safe-bottom)` 悄悄写成 `0px` 这类回归会当场红，不是靠 grep 判绿。
//
// 守四件用户一眼能看见的事：
//   1. 390×844 与 360×800 下没有东西把页面撑得要横向滚动；
//   2. 底部那条（抽屉账户行、主区底边）不被系统手势条吞掉；
//   3. 手指点的东西不小于 44×44，而鼠标设备一个像素都不变；
//   4. 骨架长按不弹系统菜单，**正文/消息/代码块照旧可选中可复制**
//      （一刀切禁选是退化：用户复制不了 AI 的回答）。
//
// 外加两条回归闸：桌面浏览器逐像素等于改动前；`sidebar` 与 `topbar` 两种布局
// 都被算过（`topbar` 的顶栏是 `sticky top-0`，刘海正压在它上面）。
//
// 门户 `oceanleo` 走它自己的 CloneShell 且把本包钉在已发布版本上，所以那边
// `app/globals.css` 存着一份逐条等价的拷贝，并有一份同样的闸
// （`oceanleo:tests/phone-viewport.test.mjs`）。两份闸的期望值表是同一张，
// 谁先漂谁先红 —— 跨仓读文件不可靠，这是唯一守得住「两边一致」的办法。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/shell/phone-shell.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/shell/AppShell.tsx", import.meta.url), "utf8");

/* ── CSS 读取：选择器 → 声明，带 @media 上下文与源序 ─────────────────────── */

function readDecls(body) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === ";" && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);

  const decls = new Map();
  for (const raw of parts) {
    const item = raw.trim();
    if (!item) continue;
    let d = 0;
    let cut = -1;
    for (let i = 0; i < item.length; i += 1) {
      const ch = item[i];
      if (ch === "(") d += 1;
      else if (ch === ")") d -= 1;
      else if (ch === ":" && d === 0) {
        cut = i;
        break;
      }
    }
    if (cut < 0) continue;
    decls.set(item.slice(0, cut).trim(), item.slice(cut + 1).trim());
  }
  return decls;
}

function readRules(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const atStack = [];
  let head = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "{") {
      const prelude = head.trim();
      head = "";
      i += 1;
      if (prelude.startsWith("@")) {
        atStack.push(prelude);
        continue;
      }
      let depth = 1;
      let body = "";
      while (i < text.length) {
        if (text[i] === "{") depth += 1;
        else if (text[i] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
        body += text[i];
        i += 1;
      }
      i += 1;
      rules.push({
        media: [...atStack],
        selectors: prelude.split(",").map((s) => s.trim()).filter(Boolean),
        decls: readDecls(body),
        order: rules.length,
      });
      continue;
    }
    if (ch === "}") {
      atStack.pop();
      head = "";
      i += 1;
      continue;
    }
    head += ch;
    i += 1;
  }
  return rules;
}

const RULES = readRules(css);
const COARSE = "@media (pointer: coarse)";
const NARROW = "@media (max-width: 767px)";

function rulesFor(selector, media = []) {
  return RULES.filter(
    (r) =>
      r.selectors.includes(selector) &&
      r.media.length === media.length &&
      r.media.every((m, idx) => m === media[idx]),
  );
}

function ruleFor(selector, media = []) {
  const found = rulesFor(selector, media);
  assert.equal(
    found.length,
    1,
    `期望恰好一条 \`${selector}\`${media.length ? ` in ${media.join(" ")}` : ""} 规则，实得 ${found.length} 条`,
  );
  return found[0];
}

// 按「哪条规则真的声明了这个属性」找，而不是按「哪条规则带这个选择器」——
// `[data-oceanleo-scroll-nav]` 之类的选择器同时出现在禁选分组和滚动分组里。
function rawDecl(selector, prop, media = []) {
  const found = rulesFor(selector, media).filter((r) => r.decls.has(prop));
  assert.equal(
    found.length,
    1,
    `期望恰好一条为 \`${selector}\` 声明 ${prop} 的规则，实得 ${found.length} 条`,
  );
  return found[0].decls.get(prop);
}

/* ── 求值：env() / var() / calc() / min() / rem / vw ─────────────────────── */

function splitArgs(text) {
  const args = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      args.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  args.push(cur);
  return args.map((a) => a.trim());
}

function splitSum(text) {
  const terms = [];
  let depth = 0;
  let cur = "";
  let sign = 1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    const spaced = i > 0 && text[i - 1] === " " && text[i + 1] === " ";
    if (depth === 0 && spaced && (ch === "+" || ch === "-")) {
      terms.push({ sign, text: cur });
      cur = "";
      sign = ch === "+" ? 1 : -1;
      continue;
    }
    cur += ch;
  }
  terms.push({ sign, text: cur });
  return terms;
}

const DEVICES = [
  {
    name: "iPhone 14 竖屏 390×844",
    w: 390,
    h: 844,
    insets: { top: 47, right: 0, bottom: 34, left: 0 },
  },
  {
    name: "安卓 竖屏 360×800",
    w: 360,
    h: 800,
    insets: { top: 24, right: 0, bottom: 24, left: 0 },
  },
  {
    // 横屏时刘海跑到侧边，而且 844 ≥ md(768)：桌面固定侧栏在真机上是看得见的。
    name: "iPhone 14 横屏 844×390",
    w: 844,
    h: 390,
    insets: { top: 0, right: 47, bottom: 21, left: 47 },
  },
];

const DESKTOP = {
  name: "桌面 1440×900",
  w: 1440,
  h: 900,
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
};

const ENV_TO_INSET = {
  "safe-area-inset-top": "top",
  "safe-area-inset-right": "right",
  "safe-area-inset-bottom": "bottom",
  "safe-area-inset-left": "left",
};

function rootVar(name) {
  const declared = RULES.filter((r) => r.selectors.includes(":root") && r.media.length === 0)
    .map((r) => r.decls.get(name))
    .filter(Boolean);
  assert.ok(declared.length >= 1, `:root 必须定义 ${name}`);
  return declared[declared.length - 1];
}

function px(expr, device) {
  const text = String(expr).trim();

  const fn = /^([a-zA-Z-]+)\(([\s\S]*)\)$/.exec(text);
  if (fn) {
    const name = fn[1].toLowerCase();
    const args = splitArgs(fn[2]);
    if (name === "calc") {
      return splitSum(args[0]).reduce((sum, t) => sum + t.sign * px(t.text, device), 0);
    }
    if (name === "min") return Math.min(...args.map((a) => px(a, device)));
    if (name === "max") return Math.max(...args.map((a) => px(a, device)));
    if (name === "var") {
      const declared = (() => {
        try {
          return rootVar(args[0]);
        } catch {
          return undefined;
        }
      })();
      if (declared !== undefined) return px(declared, device);
      assert.ok(args[1] !== undefined, `${args[0]} 既没有 :root 定义也没有回退值`);
      return px(args[1], device);
    }
    if (name === "env") {
      const key = ENV_TO_INSET[args[0]];
      assert.ok(key, `未知的 env() 变量：${args[0]}`);
      // 回退值必须写出来：不写的话，不认识 env() 的宿主会整条声明作废。
      assert.ok(args[1] !== undefined, `env(${args[0]}) 必须带回退值`);
      return device.insets[key];
    }
    assert.fail(`求值器不认识 ${name}()：${text}`);
  }

  const num = /^(-?[\d.]+)(px|rem|em|vw|vh|%)?$/.exec(text);
  assert.ok(num, `无法求值：${text}`);
  const n = Number(num[1]);
  switch (num[2]) {
    case undefined:
      assert.equal(n, 0, `无单位的值只允许 0，实得 ${text}`);
      return 0;
    case "px":
      return n;
    case "rem":
    case "em":
      return n * 16;
    case "vw":
      return (n * device.w) / 100;
    case "vh":
      return (n * device.h) / 100;
    default:
      assert.fail(`百分比要按包含块算，这里不该出现：${text}`);
  }
}

const value = (selector, prop, device, media = []) =>
  px(rawDecl(selector, prop, media), device);

/* ── 外壳里的 Tailwind 尺寸（闸门要算总宽，就得认得这些类） ──────────────── */

function twPx(token) {
  const arbitrary = /^[a-z]+-\[(-?[\d.]+)px\]$/.exec(token);
  if (arbitrary) return Number(arbitrary[1]);
  const scale = /^[a-z]+-(\d+(?:\.\d+)?)$/.exec(token);
  assert.ok(scale, `不认识的 Tailwind 尺寸类：${token}`);
  return Number(scale[1]) * 4;
}

// 注释里也写着 leo-safe-* / data-oceanleo-shell 这些词，数元素之前先去注释。
const SHELL_CODE = shell
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

const CLASS_ATTRS = [...SHELL_CODE.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
  (m) => (m[1] ?? m[2]).replace(/\s+/g, " "),
);

function classAttr(...markers) {
  const hits = CLASS_ATTRS.filter((c) => markers.every((m) => c.includes(m)));
  assert.equal(
    hits.length,
    1,
    `期望恰好一个含 ${markers.join(" + ")} 的 className，实得 ${hits.length} 个`,
  );
  return hits[0];
}

const SIDEBAR_ROOT_CLASS = classAttr("leo-safe-shell", "min-h-screen bg-transparent");
const TOPBAR_ROOT_CLASS = classAttr("leo-safe-shell", "flex-col");
const TOPBAR_HEADER_CLASS = classAttr("leo-safe-topbar");
const TOPBAR_MAIN_CLASS = classAttr("leo-safe-main", "min-w-0");
const SIDEBAR_CLASS = classAttr("md:fixed", "md:start-0");
const SPACER_CLASS = classAttr("shrink-0", "md:block");
const DRAWER_CLASS = classAttr("leo-safe-drawer");
const DRAWER_WRAP_CLASS = classAttr("z-[80]");
const MAIN_CLASS = classAttr("leo-safe-main", "pl-14");
const HAMBURGER_CLASS = classAttr("leo-chrome-topleft", "md:hidden");
const EXPAND_CLASS = classAttr("leo-chrome-topleft", "md:flex");
const TOPRIGHT_CLASS = classAttr("leo-chrome-topright");

// 文档流里横向占掉的那些像素。固定定位的侧栏、抽屉、浮出键都逃出了文档流，
// 不进这笔账（它们各自单独让位，另有断言）。
function inFlowChrome(device, { collapsed, layout = "sidebar" }) {
  const md = device.w >= 768;
  const shellPad =
    value(".leo-safe-shell", "padding-left", device) +
    value(".leo-safe-shell", "padding-right", device);

  if (layout === "topbar") {
    // 顶栏布局没有侧栏，也没有给浮出键留的那条 pl-14。
    assert.doesNotMatch(TOPBAR_MAIN_CLASS, /pl-14/);
    return shellPad;
  }

  assert.match(SIDEBAR_CLASS, /(^| )hidden( |$)/, "桌面侧栏必须默认 display:none");
  assert.match(SIDEBAR_CLASS, /md:fixed/, "桌面侧栏必须 fixed —— 它不该进文档流");
  const spacer = md && !collapsed ? twPx("w-[256px]") : 0;

  assert.match(SPACER_CLASS, /(^| )hidden( |$)/, "占位块在窄屏必须 display:none");
  assert.match(MAIN_CLASS, /(^| )pl-14( |$)/, "主区常驻给浮出键留的那条左侧空位");
  const mainPad = md ? (collapsed ? twPx("pl-14") : 0) : twPx("pl-14");

  return shellPad + spacer + mainPad;
}

/* ── 1. 前提：安全区变量取自 env() 且带 0px 回退 ─────────────────────────── */

test("安全区四变量取自 env() 且回退 0px（宿主没开 viewport-fit=cover 时退回今天的样子）", () => {
  for (const side of ["top", "right", "bottom", "left"]) {
    assert.match(
      rootVar(`--leo-safe-${side}`),
      new RegExp(`^env\\(safe-area-inset-${side},\\s*0px\\)$`),
      `--leo-safe-${side} 必须取自 env() 且回退 0px`,
    );
  }
  // 消费站拿到的是本包源码（transpilePackages），样式表必须由外壳自己引进来，
  // 否则整套修复只是躺在仓里的死文件。
  assert.match(shell, /import "\.\/phone-shell\.css";/);
});

/* ── 2. 无横向溢出 ─────────────────────────────────────────────────────── */

for (const device of DEVICES) {
  test(`无横向溢出：两种布局算下来都还剩一条可用正文（${device.name}）`, () => {
    for (const layout of ["sidebar", "topbar"]) {
      for (const collapsed of [false, true]) {
        const chrome = inFlowChrome(device, { collapsed, layout });
        const content = device.w - chrome;
        assert.ok(
          chrome < device.w,
          `外壳自己就占了 ${chrome}px ≥ 视口 ${device.w}px（${layout}/collapsed=${collapsed}）`,
        );
        assert.ok(
          content >= 240,
          `正文只剩 ${content}px，窄屏上读不了（${layout}/collapsed=${collapsed}，${device.name}）`,
        );
      }
    }
  });

  test(`无横向溢出：宽表格 / 长代码块 / 大图在自己内部横滚（${device.name}）`, () => {
    if (device.w >= 768) return; // 这一段只在 max-width:767 生效，横屏不进这个断点

    // clip 而不是 hidden：hidden 会造出滚动容器，把 main 里的 sticky 表头钉过来。
    assert.equal(
      rawDecl("html[data-leo-native-shell] [data-oceanleo-shell]", "overflow-x", [NARROW]),
      "clip",
    );

    const content = device.w - inFlowChrome(device, { collapsed: false });
    for (const selector of [
      "html[data-leo-native-shell] main table",
      "html[data-leo-native-shell] main pre",
    ]) {
      assert.equal(rawDecl(selector, "max-width", [NARROW]), "100%");
      assert.match(rawDecl(selector, "overflow-x", [NARROW]), /^(auto|scroll)$/);
    }
    assert.equal(rawDecl("html[data-leo-native-shell] main img", "max-width", [NARROW]), "100%");

    // 一张 1200px 宽的表格在 max-width:100% 下摊到正文宽度，页面宽度不变。
    assert.equal(
      Math.min(1200, content) + inFlowChrome(device, { collapsed: false }),
      device.w,
      "内容再宽也不该把页面推出视口",
    );
  });
}

/* ── 3. 底部那条不被 inset 吞掉 ─────────────────────────────────────────── */

for (const device of DEVICES) {
  test(`底部条不被 inset 吞：主区与抽屉底边都抬到手势条之上（${device.name}）`, () => {
    // 值必须是变量而不是写死的 34px，否则桌面就跟着一起塌。
    assert.match(rawDecl(".leo-safe-main", "padding-bottom"), /var\(--leo-safe-bottom\)/);
    assert.match(rawDecl(".leo-safe-drawer", "padding-bottom"), /var\(--leo-safe-bottom\)/);

    assert.equal(
      value(".leo-safe-main", "padding-bottom", device),
      device.insets.bottom,
      "主区底边让位必须正好等于手势条高度",
    );
    assert.equal(
      value(".leo-safe-drawer", "padding-bottom", device),
      device.insets.bottom,
      "抽屉底部的账户行必须整条露出来",
    );
    assert.equal(value(".leo-safe-drawer", "padding-top", device), device.insets.top);

    const usable =
      device.h -
      value(".leo-safe-drawer", "padding-top", device) -
      value(".leo-safe-drawer", "padding-bottom", device);
    assert.ok(usable > 0, "抽屉被上下 inset 吃到没有高度了");
    assert.ok(usable >= 300, `抽屉只剩 ${usable}px 高，导航加账户行放不下（${device.name}）`);

    // 横屏时桌面固定侧栏是可见的，它的底边同样不许被手势条压住。
    assert.equal(value(".leo-safe-sidebar", "padding-bottom", device), device.insets.bottom);
  });

  test(`顶栏布局的站名与账户按钮不落在刘海底下（${device.name}）`, () => {
    // 原来是 py-2.5（上下各 10px）。上半段交给 CSS 变成 `10 + 刘海`，
    // 所以元素上必须只剩 pb-2.5 —— 留着 py-2.5 就会把 CSS 那条盖回去。
    assert.match(TOPBAR_HEADER_CLASS, /(^| )pb-2\.5( |$)/);
    assert.doesNotMatch(TOPBAR_HEADER_CLASS, /(^| )py-2\.5( |$)/);
    assert.match(TOPBAR_HEADER_CLASS, /sticky/, "顶栏是 sticky top-0，刘海正压在它上面");
    assert.equal(
      value(".leo-safe-topbar", "padding-top", device),
      10 + device.insets.top,
      "顶栏上内边距必须是 10px + 刘海高度",
    );
    assert.match(TOPBAR_ROOT_CLASS, /leo-safe-shell/, "顶栏布局的根也要吃横向 inset");
    assert.match(TOPBAR_MAIN_CLASS, /leo-safe-main/, "顶栏布局的主区也要让出底部手势条");
  });

  test(`浮出键与右上浮层从刘海底下挪出来（${device.name}）`, () => {
    assert.equal(
      value(".leo-chrome-topleft", "top", device),
      12 + device.insets.top,
      "汉堡键必须落在刘海下方 12px（原值就是 12px）",
    );
    assert.equal(value(".leo-chrome-topleft", "left", device), 12 + device.insets.left);
    assert.equal(value(".leo-chrome-topright", "top", device), 12 + device.insets.top);
    assert.equal(value(".leo-safe-sidebar", "padding-top", device), device.insets.top);
    assert.equal(value(".leo-safe-shell", "padding-left", device), device.insets.left);
    assert.equal(value(".leo-safe-shell", "padding-right", device), device.insets.right);
    assert.match(SIDEBAR_ROOT_CLASS, /leo-safe-shell/);
  });

  test(`抽屉不糊满屏，旁边留得下「点空白关掉」（${device.name}）`, () => {
    // 抽屉本身只在 md 以下出现（横屏 844px 走的是桌面固定侧栏那条路）。
    assert.match(DRAWER_WRAP_CLASS, /md:hidden/, "抽屉整层必须只在窄屏出现");
    if (device.w >= 768) return;

    const width = value(".leo-safe-drawer", "width", device);
    const outside = device.w - width;
    assert.ok(
      outside >= 44,
      `抽屉宽 ${width}px，旁边只剩 ${outside}px，点不中空白就关不掉（${device.name}）`,
    );
    const inner = width - value(".leo-safe-drawer", "padding-left", device);
    assert.ok(inner >= 240, `抽屉里只剩 ${inner}px，导航标题会挤断行`);
    // 写成 min(定值, vw)：再窄的机型也按比例留出那条空白。
    assert.match(rawDecl(".leo-safe-drawer", "width"), /^min\(\s*[\d.]+px\s*,\s*[\d.]+vw\s*\)$/);
    assert.doesNotMatch(
      DRAWER_CLASS,
      /w-\[/,
      "抽屉宽度只能由 leo-safe-drawer 说，不许再挂 Tailwind 定宽",
    );
  });
}

/* ── 4. 点击目标 ≥ 44×44，且只对手指生效 ─────────────────────────────── */

test("点击目标 ≥ 44×44（只在 pointer: coarse 下发生）", () => {
  const rule = ruleFor(".leo-tap-target", [COARSE]);
  assert.ok(px(rule.decls.get("min-width"), DESKTOP) >= 44);
  assert.ok(px(rule.decls.get("min-height"), DESKTOP) >= 44);

  assert.equal(
    rulesFor(".leo-tap-target").length,
    0,
    "leo-tap-target 不许出现在 @media (pointer: coarse) 之外，否则鼠标设备也跟着变",
  );

  // 只许写尺寸。这里再声明一次 display 会把外壳按钮的 hidden / md:hidden 全部掀翻，
  // 汉堡键会在横屏手机上跟桌面侧栏一起冒出来。
  assert.deepEqual([...rule.decls.keys()].sort(), ["min-height", "min-width"]);

  for (const [name, attr] of [
    ["汉堡键", HAMBURGER_CLASS],
    ["展开键", EXPAND_CLASS],
  ]) {
    assert.match(attr, /leo-tap-target/, `${name}必须挂 leo-tap-target`);
    assert.match(attr, /items-center/, `${name}的图标要靠自身 flex 居中`);
    assert.match(attr, /(inline-flex|md:flex)/, `${name}要保留自己的 display 工具类`);
  }
  assert.match(HAMBURGER_CLASS, /md:hidden/, "汉堡键只在窄屏出现");
  assert.match(EXPAND_CLASS, /(^| )hidden( |$)/, "展开键在窄屏不出现");
});

/* ── 5. 正文仍可选中可复制 ───────────────────────────────────────────── */

test("骨架禁选，但正文 / 消息 / 代码块 / 输入框照旧可选中可复制", () => {
  const none = RULES.filter((r) => r.decls.get("user-select") === "none");
  const text = RULES.filter((r) => r.decls.get("user-select") === "text");
  assert.equal(none.length, 1, "禁选规则应当只有一条集中的");
  assert.equal(text.length, 1, "放行规则应当只有一条集中的");

  for (const selector of none[0].selectors) {
    assert.match(
      selector,
      /^html\[data-leo-native-shell\] \S/,
      `禁选只许在原生宿主下、且必须带下级选择器：${selector}`,
    );
    assert.doesNotMatch(selector, /\*/, `禁选不许用 * 后代选择器（会锁死输入框）：${selector}`);
    assert.doesNotMatch(
      selector,
      /\b(body|main|p|pre|code|table|article)$/,
      `禁选不许命中正文元素：${selector}`,
    );
  }

  const allowed = text[0].selectors.map((s) => s.replace("html[data-leo-native-shell] ", ""));
  for (const tag of [
    "main",
    "p",
    "li",
    "pre",
    "code",
    "blockquote",
    "table",
    "td",
    "th",
    "input",
    "textarea",
    "select",
    "[contenteditable]",
  ]) {
    assert.ok(allowed.includes(tag), `${tag} 必须仍可选中`);
  }
  assert.ok(
    allowed.includes("[data-leo-selectable]"),
    "留一个 data-leo-selectable 逃生口，页面自己也能把一段标成可选",
  );

  assert.equal(text[0].decls.get("-webkit-user-select"), "text");
  assert.equal(text[0].decls.get("-webkit-touch-callout"), "default", "iOS 上要把长按菜单还回来");
  assert.ok(text[0].order > none[0].order, "放行规则必须写在禁选规则之后");

  assert.equal(none[0].decls.get("-webkit-touch-callout"), "none");
  assert.equal(none[0].decls.get("-webkit-user-select"), "none");
});

test("触感三项都在，且滚动容器内照常滚", () => {
  const root = ruleFor("html[data-leo-native-shell]");
  assert.equal(root.decls.get("-webkit-tap-highlight-color"), "transparent");
  assert.equal(root.decls.get("overscroll-behavior"), "none");
  assert.equal(
    ruleFor("html[data-leo-native-shell] body").decls.get("overscroll-behavior"),
    "none",
  );
  assert.equal(
    rawDecl("html[data-leo-native-shell] [data-oceanleo-scroll-nav]", "overscroll-behavior-y"),
    "contain",
    "侧栏这类内部滚动区要 contain，不是 none —— none 会连它自己的滚动都变生硬",
  );
});

/* ── 6. 浏览器端零变化 ───────────────────────────────────────────────── */

test("桌面浏览器逐像素等于改动前", () => {
  assert.equal(value(".leo-safe-shell", "padding-left", DESKTOP), 0);
  assert.equal(value(".leo-safe-shell", "padding-right", DESKTOP), 0);
  assert.equal(value(".leo-safe-main", "padding-bottom", DESKTOP), 0);
  assert.equal(value(".leo-safe-sidebar", "padding-top", DESKTOP), 0);
  assert.equal(value(".leo-safe-sidebar", "padding-bottom", DESKTOP), 0);
  assert.equal(value(".leo-safe-sidebar", "padding-left", DESKTOP), 0);
  // 原值是 Tailwind 的 top-3 / left-3 = 12px。
  assert.equal(value(".leo-chrome-topleft", "top", DESKTOP), 12);
  assert.equal(value(".leo-chrome-topleft", "left", DESKTOP), 12);
  assert.equal(value(".leo-chrome-topright", "top", DESKTOP), 12);
  // 原值是 py-2.5 = 10px（上半段现在由 CSS 说，下半段留在元素的 pb-2.5 上）。
  assert.equal(value(".leo-safe-topbar", "padding-top", DESKTOP), 10);
  assert.equal(value(".leo-safe-drawer", "width", DESKTOP), 280);
  assert.equal(
    inFlowChrome(DESKTOP, { collapsed: false }),
    256,
    "展开态：侧栏占位 256px",
  );
  assert.equal(
    inFlowChrome(DESKTOP, { collapsed: true }),
    56,
    "收起态：只留浮出键那条 pl-14",
  );
  assert.equal(inFlowChrome(DESKTOP, { collapsed: false, layout: "topbar" }), 0);

  // 位置类被 CSS 接管后，元素上不许再留 top-3 / left-3，否则两边打架。
  for (const attr of [HAMBURGER_CLASS, EXPAND_CLASS]) {
    assert.doesNotMatch(attr, /(^| )(top|left)-3( |$)/);
  }
  assert.doesNotMatch(TOPRIGHT_CLASS, /(^| )top-3( |$)/);
});

test("触感与窄屏两段一条都不落到浏览器身上", () => {
  const nativeOnly = [
    "-webkit-tap-highlight-color",
    "overscroll-behavior",
    "overscroll-behavior-y",
    "user-select",
    "-webkit-touch-callout",
  ];
  for (const rule of RULES) {
    if (![...rule.decls.keys()].some((p) => nativeOnly.includes(p))) continue;
    for (const selector of rule.selectors) {
      assert.match(
        selector,
        /^html\[data-leo-native-shell\]/,
        `触感规则必须挂在原生宿主下：${selector}`,
      );
    }
  }

  for (const rule of RULES.filter((r) => r.media.includes(NARROW))) {
    for (const selector of rule.selectors) {
      assert.match(
        selector,
        /^html\[data-leo-native-shell\]/,
        `窄屏段也只在原生宿主下动手（浏览器窄屏保持原样）：${selector}`,
      );
    }
  }
});

/* ── 7. 手机没有单开一套外壳 ─────────────────────────────────────────── */

test("原生宿主判据只认宿主注入的全局，不碰 W06 那条桥", () => {
  assert.match(shell, /const NATIVE_SHELL_ATTR = "data-leo-native-shell"/);
  assert.match(shell, /Capacitor\?\.isNativePlatform\?\.\(\) === true/);
  assert.match(shell, /Boolean\(host\.__oceanleoNative\)/);
  assert.match(shell, /document\.documentElement\.setAttribute\(NATIVE_SHELL_ATTR/);
  assert.doesNotMatch(SHELL_CODE, /mobile-bridge/, "样式层不许 import 那条桥（并发改动的面）");
  assert.doesNotMatch(SHELL_CODE, /dangerouslySetInnerHTML/, "不许为了早一帧置属性新开注入点");
});

test("窄屏靠响应式，不是给手机单开外壳 / 布局分支", () => {
  assert.doesNotMatch(SHELL_CODE, /innerWidth/, "不许按 JS 量出来的宽度分叉布局");
  assert.doesNotMatch(SHELL_CODE, /userAgent/, "不许按 UA 分叉布局");

  // 外壳只有 sidebar / topbar 两种布局，那是消费站显式传的 layout prop，
  // 不是按屏幕宽度分叉。两个根都必须吃到同一套安全区类。
  const roots = CLASS_ATTRS.filter((c) => c.includes("leo-safe-shell"));
  assert.equal(roots.length, 2, "外壳根只有 sidebar / topbar 两个");
  const inner = SHELL_CODE.slice(
    SHELL_CODE.indexOf("function AppShellInner"),
    SHELL_CODE.length,
  );
  for (const match of inner.matchAll(/^ {2}if \((.+)\) \{$/gm)) {
    assert.match(
      match[1],
      /layout ===/,
      `外壳顶层只许按 layout 分支，不许按别的条件另开一棵树：${match[1]}`,
    );
  }
});
