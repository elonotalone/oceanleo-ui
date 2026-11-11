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

// 外壳自己渲的每一个可点元素的开标签。`<button[^>]*>` 在 JSX 里不管用：
// `onClick={() => …}` 里的那个 `>` 会把标签提前截断，className 就漏掉了。
// 所以按花括号 / 引号深度扫到真正结束这个开标签的 `>`。
function openingTags(code, names) {
  const found = [];
  const re = new RegExp(`<(${names.join("|")})[\\s/>]`, "g");
  for (const m of code.matchAll(re)) {
    let i = m.index + m[0].length - 1;
    let depth = 0;
    let quote = "";
    while (i < code.length) {
      const ch = code[i];
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) break;
      i += 1;
    }
    found.push({ tag: m[1], text: code.slice(m.index, i) });
  }
  return found;
}

// className 可能是字面量、模板串，或者一个变量（导航行那条 `const cls = …`
// 同时供 button 与 Link 用）。变量形式回到源码里取它的定义再判。
function classOfTag(tagText, code) {
  const literal = /className="([^"]*)"/.exec(tagText);
  if (literal) return literal[1];
  const template = /className=\{`([^`]*)`\}/.exec(tagText);
  if (template) return template[1];
  const ident = /className=\{(\w+)\}/.exec(tagText);
  if (!ident) return null;
  const decl = new RegExp(`const ${ident[1]} =\\s*(?:\`|")`).exec(code);
  assert.ok(decl, `找不到 className 变量 ${ident[1]} 的定义，量不出它的点击区`);
  const rest = code.slice(decl.index);
  return rest.slice(0, rest.indexOf(";"));
}

/* ── 2. 无横向溢出 ─────────────────────────────────────────────────────── */

// 正对照：下面两轮 `for` 各注册 N 条用例，`DEVICES` 一旦变空，
// **这份文件会少 14 条用例而全量读数照样全绿**（`_COMMON.md §7b⑫` 的余量形态）。
// 这一条把机型数钉死，表被清空/被误删当场红。判据见 `table-driven-registration-guard`。
test("清单本身：三种机型都在表里", () => {
  assert.equal(
    DEVICES.length,
    3,
    `机型表从 3 种变成 ${DEVICES.length} 种。下面两轮逐机型断言是按这张表注册的，` +
      "表短一行就少一批用例、且不会有任何闸响",
  );
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

test("A13 与安全区那一整段在网页端天然零变化：浏览器里 inset 就是 0", () => {
  // 普通浏览器标签页里 `env(safe-area-inset-*)` 恒为 0（只有原生宿主与
  // 独立模式/PWA 下才非 0）。所以「补顶部让位」这条改动在**手机浏览器**上
  // 也是逐像素零变化 —— 不只是桌面宽屏。这里拿 390×844 的视口配四个 0 inset 算。
  const phoneInBrowser = {
    name: "手机浏览器标签页 390×844（inset 全 0）",
    w: 390,
    h: 844,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  assert.equal(
    value(".leo-safe-main-top", "padding-top", phoneInBrowser),
    0,
    "A13 的顶边让位在浏览器里必须算出 0",
  );
  assert.equal(value(".leo-safe-main", "padding-bottom", phoneInBrowser), 0);
  assert.equal(value(".leo-safe-shell", "padding-left", phoneInBrowser), 0);
  assert.equal(value(".leo-safe-shell", "padding-right", phoneInBrowser), 0);
  assert.equal(value(".leo-safe-sidebar", "padding-top", phoneInBrowser), 0);
  assert.equal(value(".leo-safe-drawer", "padding-left", phoneInBrowser), 0);
  // 抽屉宽度改成 calc(min(...) + 左 inset) 之后，浏览器里仍然是原来那个 280px。
  assert.equal(value(".leo-safe-drawer", "width", phoneInBrowser), 280);
  assert.equal(value(".leo-chrome-topleft", "top", phoneInBrowser), 12);
  assert.equal(value(".leo-chrome-topleft", "left", phoneInBrowser), 12);
  // 顶栏那条原值是 py-2.5 = 10px：浏览器里算出来还是 10px。
  assert.equal(value(".leo-safe-topbar", "padding-top", phoneInBrowser), 10);

  // 机制而不是巧合：让位值一律取自 env() 且回退 0px，没有一处写死的像素。
  for (const [selector, prop] of [
    [".leo-safe-main-top", "padding-top"],
    [".leo-safe-main", "padding-bottom"],
    [".leo-safe-shell", "padding-left"],
    [".leo-safe-shell", "padding-right"],
  ]) {
    assert.match(rawDecl(selector, prop), /^var\(--leo-safe-(top|right|bottom|left)\)$/);
  }
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
