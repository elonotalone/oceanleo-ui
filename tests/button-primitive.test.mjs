// ============================================================================
// `src/ui/Button.tsx` 原语的行为契约（W04，2026-08-31）
// ----------------------------------------------------------------------------
// 为什么这道闸值得写死（`01-verified-facts.md` §1.6 §2.5 实测）：
//   · 全家桶 823 个裸 `<button>`；`oceanleo-sites/apps` 里 0 个 `use client`，
//     31 个租户站的交互全在 `@oceanleo/ui` —— **本原语改一行等于改 31 个站**；
//   · `outline-none` 140 处对 `focus-visible` 61 处，约一半的焦点抑制点没有把环补回来。
//
// 原语立的两条承诺是**结构性**的，所以必须由机检守着，不能只写在文档里：
//   ① **焦点环不可关闭**：没有 `disableFocusRing` 这类 prop，
//      且调用方连 `className="focus-visible:ring-0"` 都传不进来（就地剥掉）。
//   ② **默认 size 是 `lg`(44px)**：不去想命中区的人自动拿到合规命中区。
//
// 本文件分两半，缺一不可：
//   · **AST 半**判「源码的形状」——props 面上没有关环的口子、`FOCUS_RING` 永远拼在
//     最后、像素表与 `h-*` 类名不许各说各话。形状判据挡的是**下一个人**：
//     光有渲染断言的话，加一个 `disableFocusRing` 只要默认不传就照样绿。
//   · **渲染半**判「跑起来真是那样」——形状对了但 `cx()` 顺序错了、
//     `{...rest}` 漏了，AST 看不出来。
//
// **`size="sm"` 只许出现在白名单文件里**这一条不在本文件，在
// `tests/hit-target-budget.test.mjs`：那里才是白名单的家，两处各存一份必然漂移。
//
// 组件用 `tests/helpers/module-bench.mjs` 的 `compileModule` 编译。
// `Button.tsx` 自 `cf45ab7` 起**零内部依赖**（只 import `react`），所以桩表是空的——
// 这本身就是那次改动想要的结果：谁都不用为它加替身。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import ts from "typescript";

import { compileModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const BUTTON_REL = "src/ui/Button.tsx";
const BUTTON_ABS = join(REPO, BUTTON_REL);

const source = readFileSync(BUTTON_ABS, "utf8");
const sourceFile = ts.createSourceFile(
  BUTTON_ABS,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

// ---------------------------------------------------------------- AST 工具

function eachNode(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => eachNode(child, visit));
}

/** Tailwind `h-<n>` 的像素值（`n * 4`）。判据靠它把类名与像素表对齐。 */
function tailwindHeightPx(classString) {
  const match = /\bh-(\d+(?:\.\d+)?)\b/.exec(classString);
  return match ? Number(match[1]) * 4 : null;
}

/** 读一个模块级 `const NAME = { key: value }` 的字面量对象。 */
function objectLiteralConst(name) {
  let found = null;
  eachNode(sourceFile, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const out = {};
      for (const prop of node.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)
          ? prop.name.text
          : null;
        if (!key) continue;
        const init = prop.initializer;
        if (ts.isNumericLiteral(init)) out[key] = Number(init.text);
        else if (ts.isStringLiteral(init)) out[key] = init.text;
        else if (ts.isNoSubstitutionTemplateLiteral(init)) out[key] = init.text;
      }
      found = out;
    }
  });
  return found;
}

/** 读一个模块级 `const NAME = "…"`（含 `"a" + "b"` 这种拼接）。 */
function stringConst(name) {
  let found = null;
  const flatten = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = flatten(node.left);
      const right = flatten(node.right);
      return left === null || right === null ? null : left + right;
    }
    if (ts.isParenthesizedExpression(node)) return flatten(node.expression);
    return null;
  };
  eachNode(sourceFile, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      found = flatten(node.initializer);
    }
  });
  return found;
}

// ------------------------------------------------- 关环 prop 的判定器

/**
 * 「这个 prop 名看起来是想把焦点环关掉吗」。
 *
 * 判**名字**而不是判实现，是刻意的：实现可以写得很委婉（`ringless` 只是少拼一段
 * 类名），但名字骗不了人——一个叫 `disableFocusRing` 的 prop 无论怎么实现，
 * 都是在向调用方承诺「你可以关掉它」，而这条承诺本身就是本原语要消灭的东西。
 *
 * 判据器自己也要被验（见下面「判据器自证」那个用例）：判据太松就等于没判，
 * 而这正是三次反面验证里第一次要打的靶。
 */
function isRingOptOutProp(name) {
  const n = String(name);
  if (/^(unstyled|bare|raw|naked)$/i.test(n)) return true;
  // disableFocusRing / noRing / hideOutline / withoutFocusRing / suppressRing …
  if (/^(disable|no|hide|without|suppress|skip|remove|omit|kill|drop)[A-Z_]?[A-Za-z]*?(ring|outline|focus)/i.test(n)) {
    return true;
  }
  // ringOff / outlineNone / focusRingDisabled / ringHidden …
  if (/(ring|outline)[A-Za-z]*(off|none|disabled|hidden|false)$/i.test(n)) return true;
  return false;
}

/** props 面 = 所有 `*Props` 接口的成员 ＋ 两个渲染函数解构出来的形参名。 */
function propNames() {
  const names = new Set();
  eachNode(sourceFile, (node) => {
    if (
      (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
      /Props$/.test(node.name.text)
    ) {
      eachNode(node, (member) => {
        if (ts.isPropertySignature(member) && member.name && ts.isIdentifier(member.name)) {
          names.add(member.name.text);
        }
      });
    }
    if (ts.isObjectBindingPattern(node)) {
      for (const element of node.elements) {
        if (ts.isIdentifier(element.name)) names.add(element.name.text);
        if (element.propertyName && ts.isIdentifier(element.propertyName)) {
          names.add(element.propertyName.text);
        }
      }
    }
  });
  return [...names].sort();
}

/**
 * 全部字符串字面量的正文（含模板串的各段）。
 *
 * 「有没有裸时长」只能对着**字面量**判，不能对着整份源码 grep：本文件的注释里就写着
 * 「用内联 style 而不是 Tailwind 的 `duration-[…]`」——那句话是在解释**为什么不用它**，
 * 拿 grep 扫会被自己的注释判红。W03 在 `2ff548b` 踩过同一个坑
 * （overlay-motion 判据改读 AST 才不再被自己的注释判红），`_COMMON.md` §7b③ 也写着
 * 「判『不存在』必须用 AST 而不是 grep」。
 */
function literalTexts() {
  const texts = [];
  eachNode(sourceFile, (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) texts.push(node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) texts.push(node.text);
    else if (ts.isJsxText(node)) texts.push(node.text);
  });
  return texts;
}

/** 每个 `cx(...)` 调用的实参原文，按出现顺序。 */
function cxCallArguments() {
  const calls = [];
  eachNode(sourceFile, (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "cx") {
      calls.push(node.arguments.map((arg) => arg.getText(sourceFile)));
    }
  });
  return calls;
}

// ---------------------------------------------------------------- AST 用例

test("像素表与默认档：BUTTON_SIZE_PX 三档 36/40/44，默认 lg", () => {
  const sizePx = objectLiteralConst("BUTTON_SIZE_PX");
  assert.deepEqual(sizePx, { sm: 36, md: 40, lg: 44 }, "三档命中区的像素事实变了");
  assert.equal(
    stringConst("BUTTON_DEFAULT_SIZE"),
    "lg",
    "默认档不再是 lg：不去想命中区的人会自动拿到一个不合规的命中区，"
      + "这正是本原语存在的第二条理由。",
  );
  assert.equal(sizePx.lg, 44, "44 与 edit-bar-surface.ts 的 EDIT_BAR_CONTROL_SIZE_PX 同源");
});

test("类名与像素表不许各说各话：SIZE_CLASS / ICON_SIZE_CLASS 的 h-* 必须换算得上", () => {
  const sizePx = objectLiteralConst("BUTTON_SIZE_PX");
  for (const table of ["SIZE_CLASS", "ICON_SIZE_CLASS"]) {
    const classes = objectLiteralConst(table);
    assert.ok(classes, `读不到 ${table}`);
    for (const [size, px] of Object.entries(sizePx)) {
      assert.equal(
        tailwindHeightPx(classes[size]),
        px,
        `${table}.${size} 是 "${classes[size]}"，换算不出 ${px}px；`
          + "常量与类名对不上时，预算锁读到的数字就是假的。",
      );
    }
  }
  const iconClasses = objectLiteralConst("ICON_SIZE_CLASS");
  for (const [size, cls] of Object.entries(iconClasses)) {
    const h = /\bh-(\d+)\b/.exec(cls)?.[1];
    const w = /\bw-(\d+)\b/.exec(cls)?.[1];
    assert.equal(w, h, `IconButton 的 ${size} 档不是正方形："${cls}"`);
  }
});

test("props 面上没有任何关掉焦点环的口子", () => {
  const offenders = propNames().filter(isRingOptOutProp);
  assert.deepEqual(
    offenders,
    [],
    "原语出现了形似「关掉焦点环」的 prop。焦点环不可关闭是本原语存在的主要理由："
      + "承诺要是只靠「大家别这么写」，140 对 61 这个比例就是它的下场。"
      + "需要不同的环色请改 FOCUS_RING 的三级兜底变量，不要开一个关它的口子。",
  );
});

test("判据器自证：上面那条判据真的认得出关环的 prop 名", () => {
  // 判据太松等于没判。这里把靶子钉死，免得有人「顺手」把正则改宽让红变绿。
  for (const name of [
    "disableFocusRing",
    "noRing",
    "noFocusRing",
    "hideOutline",
    "withoutFocusRing",
    "suppressRing",
    "unstyled",
    "ringOff",
    "outlineNone",
    "focusRingDisabled",
  ]) {
    assert.equal(isRingOptOutProp(name), true, `${name} 应被判为关环 prop`);
  }
  // 现有的正当 prop 一个都不许误伤。
  for (const name of [
    "variant", "size", "loading", "loadingLabel", "block", "pill",
    "selected", "align", "label", "icon", "className", "style", "children",
    "onClick", "type", "disabled", "ref", "rest", "title",
  ]) {
    assert.equal(isRingOptOutProp(name), false, `${name} 被误判成关环 prop 了`);
  }
});

test("FOCUS_RING 永远拼在最后，且调用方的 className 先过一遍剥离", () => {
  const calls = cxCallArguments();
  assert.ok(calls.length >= 2, `只找到 ${calls.length} 处 cx() 调用，Button 与 IconButton 各应有一处`);
  for (const args of calls) {
    assert.equal(
      args.at(-1),
      "FOCUS_RING",
      "cx() 的最后一个实参不是 FOCUS_RING。同类 Tailwind 工具类谁赢由样式表顺序决定，"
        + "但把环放在最后是这份文件自己的不变量，别人的 className 不该有机会排在它后面。",
    );
    assert.ok(
      args.some((arg) => /^stripFocusRingOptOuts\(\s*className\s*\)$/.test(arg)),
      "调用方的 className 没有先过 stripFocusRingOptOuts()："
        + "那样 focus-visible:ring-0 就能从外面传进来把环关掉。",
    );
  }
});

test("焦点环常量本身同时含抑制与补偿，不是只写了一半", () => {
  const ring = stringConst("FOCUS_RING");
  assert.ok(ring, "读不到 FOCUS_RING");
  assert.match(ring, /\boutline-none\b/, "FOCUS_RING 少了 outline-none");
  assert.match(ring, /\bfocus-visible:ring-2\b/, "FOCUS_RING 少了补偿环");
  assert.match(
    ring,
    /--pchrome-accent.*--awb-accent/s,
    "环色不再是三级兜底：插件主题 → 工作台 → 站点语义",
  );
});

test("不写裸时长与裸曲线（红线 9）—— 只扫字面量，不扫注释", () => {
  const literals = literalTexts();
  const shipped = literals.join("\n");
  const bare = [];
  if (/\b\d+m?s\b/.test(shipped)) bare.push("裸时长");
  if (/cubic-bezier\s*\(/.test(shipped)) bare.push("裸 cubic-bezier");
  if (/\bduration-(?:\d+|\[)/.test(shipped)) bare.push("Tailwind duration 工具类");
  if (/\bease-(?:in|out|linear|\[)/.test(shipped)) bare.push("Tailwind ease 工具类");
  assert.deepEqual(bare, [], "动效必须只从 --leo-* token 取");

  assert.match(shipped, /var\(--leo-dur-/, "没有从 --leo-dur-* 取时长");
  assert.match(shipped, /var\(--leo-ease-/, "没有从 --leo-ease-* 取曲线");
  // token 缺席时退化为 0s＝不动，所以刻意不写 fallback 裸值（裁定 A-2）。
  assert.doesNotMatch(
    shipped,
    /var\(--leo-(?:dur|ease)-[a-z0-9-]+\s*,/,
    "给 --leo-* token 写了 fallback 原始值：裁定 A-2 要求缺 token 时退化为「无过渡」，"
      + "而不是落一个违反红线 9 的裸值。",
  );

  // 判据器自证：这套正则确实认得出裸值——否则「零命中」只是工具用错（§7b③）。
  assert.match("duration-150", /\bduration-(?:\d+|\[)/);
  assert.match("transition-duration: 200ms", /\b\d+m?s\b/);
  assert.match("cubic-bezier(.21,1.02,.73,1)", /cubic-bezier\s*\(/);
  // 而注释里那句「不要用 duration-[…]」不在字面量里，所以扫不到它。
  assert.ok(
    /duration-\[/.test(source) && !/duration-\[/.test(shipped),
    "本文件注释里本该有一处 `duration-[…]` 的反面说明；它必须出现在源码里、"
      + "但不出现在字面量里，这条断言正是「读 AST 而不是 grep」的实证。",
  );
});

test("零内部依赖：本原语不 import 仓内任何模块（cf45ab7 的不变量）", () => {
  const relativeImports = [];
  eachNode(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (spec.startsWith(".")) relativeImports.push(spec);
    }
  });
  assert.deepEqual(
    relativeImports,
    [],
    "原语又 import 了仓内模块。`W03` 已把 Button 并进 ui/index.tsx，一旦本文件反向 import"
      + " ./index 就成环；运行期靠函数声明提升还能活，但 module-bench 用 data: 模块编译、"
      + "表达不了环，会红一片既有测试且有传染性（cf45ab7 实测红了三份）。",
  );
});

// ---------------------------------------------------------------- 渲染夹具

/**
 * jsdom 取自 `fabric/node` 自带那份（仓内唯一可用），它的 `canvas` 依赖在本容器里
 * 装不上，所以先拿空对象把 require 缓存顶掉，建完再还回去。
 * 与 `tests/auth-dialog.test.mjs:261-330` 同一套写法。
 */
async function withDom(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const render = (Component, props, children) =>
    act(async () => root.render(React.createElement(Component, props, children)));
  const find = (selector) => window.document.querySelector(selector);
  const click = (selector) => {
    const node = find(selector);
    assert.ok(node, `点不到 ${selector}`);
    return act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  };

  try {
    await run({ window, render, find, click });
  } finally {
    await act(async () => root.unmount());
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

let buttonModule;
async function loadButton() {
  // 桩表为空：本原语零内部依赖（见上面那个用例），谁都不用为它加替身。
  buttonModule ??= await import(await compileModule(BUTTON_REL));
  return buttonModule;
}

const classesOf = (node) => new Set(String(node.getAttribute("class") || "").split(/\s+/).filter(Boolean));

// ---------------------------------------------------------------- 渲染用例

test("默认渲染就是 44px 的命中区，不用调用方记得去选", async () => {
  const { Button, IconButton, BUTTON_SIZE_PX, BUTTON_DEFAULT_SIZE } = await loadButton();
  assert.equal(BUTTON_DEFAULT_SIZE, "lg");
  assert.equal(BUTTON_SIZE_PX.lg, 44);

  await withDom(async ({ render, find }) => {
    await render(Button, {}, "保存");
    const button = find("button");
    assert.equal(button.getAttribute("data-leo-button-size"), "lg");
    assert.ok(classesOf(button).has("h-11"), `默认档不是 h-11(44)：${button.getAttribute("class")}`);

    await render(IconButton, { label: "全屏", icon: "⤢" });
    const icon = find("button");
    assert.equal(icon.getAttribute("data-leo-button-size"), "lg");
    const iconClasses = classesOf(icon);
    assert.ok(iconClasses.has("h-11") && iconClasses.has("w-11"), "图标按钮默认不是 44×44");
    assert.ok(iconClasses.has("rounded-full"), "图标按钮默认不是胶囊（样板 EDIT_BAR_BUTTON_CLASS 是 rounded-full）");
  });
});

test("焦点环关不掉：调用方传进来的关环类名被就地剥掉，环仍在", async () => {
  const { Button } = await loadButton();
  await withDom(async ({ render, find }) => {
    await render(
      Button,
      { className: "ring-0 outline-none focus-visible:ring-0 ring-transparent outline-0 my-layout-class" },
      "删除",
    );
    const classes = classesOf(find("button"));
    for (const optOut of ["ring-0", "focus-visible:ring-0", "ring-transparent", "outline-0"]) {
      assert.equal(classes.has(optOut), false, `关环类名 ${optOut} 漏进了最终类名串`);
    }
    assert.ok(classes.has("focus-visible:ring-2"), "补偿环被关掉了");
    assert.ok(classes.has("outline-none"), "outline-none 应由 FOCUS_RING 自己带回来");
    assert.ok(classes.has("my-layout-class"), "布局类名被误伤了：只该剥关环的那几个");
  });
});

test("loading：aria-busy 为真、不设 disabled 属性、**仍然可聚焦**、点击被拦下", async () => {
  const { Button } = await loadButton();
  await withDom(async ({ render, find, click, window }) => {
    let clicks = 0;
    await render(Button, { loading: true, loadingLabel: "保存中", onClick: () => { clicks += 1; } }, "保存");
    const button = find("button");

    assert.equal(button.getAttribute("aria-busy"), "true", "读屏念不出「忙」");
    assert.equal(button.hasAttribute("disabled"), false,
      "loading 时设了原生 disabled：禁用元素不可聚焦，会把焦点从正在等待的用户脚下抽走");
    assert.equal(button.getAttribute("aria-disabled"), "true", "缺 aria-disabled，读屏不知道它现在点不动");

    button.focus();
    assert.equal(window.document.activeElement, button, "loading 时按钮不可聚焦了——这正是本条要防的");

    await click("button");
    assert.equal(clicks, 0, "loading 时的点击没被拦下");
  });
});

test("透传任意属性：既有测试靠 data-* 与 aria-label 选按钮，丢一个就静默弄红别人", async () => {
  const { Button, IconButton } = await loadButton();
  await withDom(async ({ render, find }) => {
    await render(Button, {
      "data-advanced-viewport-controls": "zoom-in",
      "data-testid": "probe",
      "aria-pressed": true,
      "aria-expanded": false,
      title: "放大",
      name: "zoom",
    }, "放大");
    const button = find("button");
    assert.equal(button.getAttribute("data-advanced-viewport-controls"), "zoom-in");
    assert.equal(button.getAttribute("data-testid"), "probe");
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.equal(button.getAttribute("aria-expanded"), "false");
    assert.equal(button.getAttribute("title"), "放大");
    assert.equal(button.getAttribute("name"), "zoom");
    assert.equal(button.getAttribute("type"), "button", "默认 type 不是 button，会在表单里误提交");

    // IconButton 的 label 必须变成无障碍名，title 默认取同一句话。
    await render(IconButton, { label: "编辑区域全屏", icon: "⤢", "data-probe": "fs" });
    const icon = find("button");
    assert.equal(icon.getAttribute("aria-label"), "编辑区域全屏");
    assert.equal(icon.getAttribute("title"), "编辑区域全屏");
    assert.equal(icon.getAttribute("data-probe"), "fs");
  });
});

test("真 disabled 仍走原生属性（既有行为不变），与 loading 不是一回事", async () => {
  const { Button } = await loadButton();
  await withDom(async ({ render, find }) => {
    await render(Button, { disabled: true }, "不可用");
    const button = find("button");
    assert.equal(button.hasAttribute("disabled"), true,
      "真 disabled 被改成 aria-disabled 了：既有测试与原生表单语义会一起变");
    assert.equal(button.getAttribute("aria-busy"), null, "没在 loading 却报了忙");
  });
});

test("选中态整体换配色而不是叠加，几何不跳（选中/未选中都有 border）", async () => {
  const { Button } = await loadButton();
  await withDom(async ({ render, find }) => {
    await render(Button, { selected: false, variant: "secondary" }, "图层");
    const idle = classesOf(find("button"));
    await render(Button, { selected: true, variant: "secondary" }, "图层");
    const active = classesOf(find("button"));

    const hasBorder = (set) => [...set].some((c) => c === "border" || c.startsWith("border-"));
    assert.ok(hasBorder(idle), "未选中态没有声明边框：一选中就多出 1px，整条工具条会抖");
    assert.ok(hasBorder(active), "选中态没有声明边框");
    assert.equal(find("button").getAttribute("data-leo-button-selected"), "true");
    // 两套配色不该同时在场——那正是同类工具类相撞、胜负由样式表顺序决定的情形。
    const idleOnly = [...idle].filter((c) => c.startsWith("bg-[var(--pchrome-surface"));
    assert.deepEqual(
      idleOnly.filter((c) => active.has(c)),
      [],
      "选中态没有整体替换变体配色，而是叠在它上面了",
    );
  });
});
