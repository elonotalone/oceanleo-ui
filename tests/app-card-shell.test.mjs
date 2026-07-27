// app 卡片外壳（合同 2026-07-27 §0.3 / §3.1 决策 D3）的契约。
// 这份文件真正要守住的是操作员那句「工作台卡片要和首页卡片**完完全全一样的格式**」：
//   ① 两个 variant 渲染出的 DOM，除 `data-*` 钩子与调用方给的文案外**逐字符相同**；
//   ② 尺寸/圆角/边框/阴影/hover 放大(`hover:scale-105`)/`hover:z-10`/铺满层/栅格
//      全部只有一份定义（`APP_CARD_FRAME_CLASS` / `APP_CARD_GRID_CLASS`）；
//   ③ 主按钮在无 hover 环境（触屏）常驻可见，且不压住 tagline；
//   ④ 没有功能图、没有代表 prompt 的 app 不得变成死卡（主动作按钮照常在）；
//   ⑤ 卡片根不是 role=button、外壳里没有 onKeyDown（ARIA 嵌套 + 键盘双触发的老坑）；
//   ⑥ 点主按钮不得顺带触发「点卡片主体」。
// 组件源码经 typescript.transpileModule 编译成 data: 模块后导入，所以可以直接
// `node --test tests/app-card-shell.test.mjs`，不需要仓库的 ts-extension-loader。

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function resolveRelative(fromPath, specifier) {
  for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = resolve(dirname(fromPath), specifier + suffix);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const compiledModules = new Map();
const inFlight = new Set();

/** 把一个 TS 源文件及其全部相对依赖递归编译成 data: 模块（同 home-app-cards.test.mjs）。 */
async function compileModule(relativePath, overrides = {}) {
  const sourcePath = resolve(relativePath);
  const cached = compiledModules.get(sourcePath);
  if (cached) return cached;
  assert.ok(!inFlight.has(sourcePath), `循环依赖，data: 模块无法表达：${relativePath}`);
  inFlight.add(sourcePath);

  let output = ts.transpileModule(await readFile(sourcePath, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;

  for (const specifier of new Set(
    [...output.matchAll(/from\s+"([^"]+)"/g)].map(([, spec]) => spec),
  )) {
    let replacement = overrides[specifier];
    if (!replacement && specifier === "react") replacement = reactUrl;
    if (!replacement && specifier === "react/jsx-runtime") replacement = jsxRuntimeUrl;
    if (!replacement && specifier.startsWith(".")) {
      const target = resolveRelative(sourcePath, specifier);
      assert.ok(target, `${relativePath} 里解析不到 ${specifier}`);
      replacement = await compileModule(relative(process.cwd(), target), overrides);
    }
    assert.ok(replacement, `${relativePath} 依赖了无法在 data: 模块里解析的 ${specifier}`);
    output = output.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
  }

  inFlight.delete(sourcePath);
  const url = `${dataModule(output)}#${encodeURIComponent(relativePath)}`;
  compiledModules.set(sourcePath, url);
  return url;
}

// tt() 未命中词典时回退中文原文，测试里直接用恒等翻译。
const OVERRIDES = {
  "../i18n/ui/useUI": dataModule("export function useUI(){ return (zh) => zh; }"),
};

const shellUrl = await compileModule("src/shell/app-card-shell.tsx", OVERRIDES);
const {
  APP_CARD_DASHED_CLASS,
  APP_CARD_FRAME_CLASS,
  APP_CARD_GRID_CLASS,
  AppCardFrame,
  AppCardShell,
  AppCardText,
  AppCardThumb,
} = await import(shellUrl);

const OSS = "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image";
const IMAGE = `${OSS}/cap-app/image-poster.thumb.webp`;

const POSTER = {
  id: "poster",
  name: "海报生成",
  icon: "🖼️",
  tagline: "活动与产品宣传海报，主体突出、留出文案区",
  scenes: ["营销物料"],
  group: "图像生成",
  badge: "热",
  preset: { prompt: "生成一张 [活动] 宣传海报。", set: { ratio: "3:4" } },
};
// 自建卡那种「没有功能图、没有模板、也没有代表 prompt」的最小数据形态。
const BARE = { id: "bare", name: "空空 app", scenes: [] };

function render(props) {
  return renderToStaticMarkup(React.createElement(AppCardShell, props));
}

/** 源码级扫描前先剥注释：注释里提到某个 class 名不算「版式又被抄了一份」。 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("首页与工作台是同一份版式：两个 variant 的 DOM 除钩子与文案外逐字符相同", () => {
  const shared = { app: POSTER, image: IMAGE, onCardClick() {}, accent: "#6366f1" };
  const home = render({
    ...shared,
    variant: "home",
    primaryAction: { label: "prompt", onClick() {} },
  });
  const workspace = render({
    ...shared,
    variant: "workspace",
    primaryAction: { label: "打开", onClick() {} },
    cardActionLabel: "打开 海报生成",
  });

  // 归一化掉**允许**存在的两处差异：variant 钩子（含首页那组 data-home-app-card*）与
  // 调用方给的主按钮文案 / 无障碍名。剩下的每一个字符都必须一致——只要有人往某个
  // variant 里塞一条自己的 class（哪怕只是 `rounded-lg`），这一条立刻红。
  const normalize = (markup) =>
    markup
      .replaceAll(' data-home-app-card="true"', "")
      .replaceAll(' data-home-app-card-main="true"', "")
      .replaceAll(' data-home-app-card-fill="true"', "")
      .replaceAll(' data-home-app-card-actions="true"', "")
      .replace(/ data-app-card-variant="(home|workspace)"/g, "")
      .replace(/aria-label="[^"]*"/g, 'aria-label="·"')
      .replace(/(<button[^>]*data-app-card-primary[^>]*>)[^<]*/, "$1·");
  assert.equal(normalize(home), normalize(workspace));

  // 而且两边确实都拿到了那串唯一的几何定义（不是各自恰好写对了一次）。
  assert.ok(home.includes(APP_CARD_FRAME_CLASS));
  assert.ok(workspace.includes(APP_CARD_FRAME_CLASS));
  // 落点语义仍可区分（W2 的用例要按它取卡）。
  assert.match(home, /data-app-card-variant="home"/);
  assert.match(workspace, /data-app-card-variant="workspace"/);
  // 首页那组既有验收钩子逐字保留；workspace 只带通用钩子。
  assert.match(home, /data-home-app-card="true"/);
  assert.doesNotMatch(workspace, /data-home-app-card/);
  assert.match(workspace, /data-app-card="true"/);
});

test("版式常量是唯一事实源：几何、hover 放大、z-10、栅格都只有一份", async () => {
  assert.equal(APP_CARD_GRID_CLASS, "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3");
  // 整卡放大 + 防被 DOM 靠后的邻卡盖住（上一轮补的，抽壳时最容易弄丢）。
  assert.match(APP_CARD_FRAME_CLASS, /hover:scale-105/);
  assert.match(APP_CARD_FRAME_CLASS, /hover:z-10/);
  assert.match(APP_CARD_FRAME_CLASS, /min-h-\[100px\]/);
  assert.match(APP_CARD_FRAME_CLASS, /rounded-xl/);
  assert.match(APP_CARD_FRAME_CLASS, /shadow-sm/);
  assert.match(APP_CARD_FRAME_CLASS, /hover:shadow-lg/);

  // 首页消费的是常量，不是自己再抄一串（抄了就会漂）。注释里提到这些 class 名是**故意**
  // 的（它们记录了为什么必须成对出现），所以扫描前先把注释剥掉。
  const home = stripComments(await readFile(resolve("src/shell/HomeAppCards.tsx"), "utf8"));
  assert.match(home, /APP_CARD_GRID_CLASS/);
  assert.doesNotMatch(home, /grid-cols-1 gap-3 sm:grid-cols-2/);
  assert.doesNotMatch(home, /hover:scale-105/);
  assert.doesNotMatch(home, /xl:grid-cols-4/);
});

test("触屏常驻：无 hover 环境下主按钮可见，且不压住 tagline", () => {
  const markup = render({
    app: POSTER,
    image: IMAGE,
    variant: "workspace",
    primaryAction: { label: "打开", onClick() {} },
    onCardClick() {},
  });
  // 鼠标端从卡外浮进来，触屏常驻（不得只在 group-hover 下出现）。
  assert.match(markup, /data-app-card-actions[^>]*translate-y-full/);
  assert.match(markup, /data-app-card-actions[^>]*group-hover:translate-y-0/);
  assert.ok(markup.includes("[@media(hover:none)]:translate-y-0"));
  // 触屏上铺满层不出现，深色渐变会糊住白底卡的文字，所以要去掉。
  assert.ok(markup.includes("[@media(hover:none)]:bg-none"));
  // 常驻按钮不许压住 tagline：文字块在触屏上让出一条。
  assert.ok(markup.includes("[@media(hover:none)]:pb-8"));
  assert.match(markup, /data-app-card-primary[^>]*>打开</);
});

test("自建/裸 app 不死卡：没功能图、没 prompt 也仍可点，且不留白", () => {
  const markup = render({ app: BARE, variant: "home", onCardClick() {} });
  // 主动作按钮照常在（这是「不死」的判据）。
  assert.match(markup, /data-app-card-main/);
  // 没给 primaryAction → 整条按钮不渲染（music 站 22 个 app 的正常形态，不灌空串）。
  assert.doesNotMatch(markup, /data-app-card-actions/);
  // 让位样式也跟着不出现（没有常驻按钮就不该白留一条）。
  assert.ok(!markup.includes("[@media(hover:none)]:pb-8"));
  // 无图 → emoji tint 占满同一个方块，绝不留白。
  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, /aspect-square w-\[96px\]/);
  assert.match(markup, /✨/);
  // 无障碍名有默认值（调用方不给 cardActionLabel 时）。
  assert.match(markup, /aria-label="查看 空空 app"/);
});

test("卡片根不是 role=button，外壳里没有 onKeyDown（ARIA + 键盘双触发）", async () => {
  const markup = render({
    app: POSTER,
    image: IMAGE,
    variant: "home",
    primaryAction: { label: "prompt", onClick() {} },
    onCardClick() {},
  });
  assert.doesNotMatch(markup, /data-app-card="true"[^>]*role="button"/);
  assert.doesNotMatch(markup, /data-app-card="true"[^>]*tabindex/i);
  assert.match(markup, /data-app-card-main[^>]*absolute inset-0/);

  // 源码级守卫：整卡 keydown 处理器一旦写回来，「在内部按钮上按 Enter 额外触发一次整卡
  // 动作」那个 bug 就会重演。注释里保留这两个词是故意的，扫描前先剥注释。
  const source = (await readFile(resolve("src/shell/app-card-shell.tsx"), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(source, /onKeyDown/);
  assert.doesNotMatch(source, /role="button"/);
});

test("外壳不产出未进词典的中文文案（i18n 目录是 W3 独占，这侧只许用已有词条）", async () => {
  const dictionary = await readFile(resolve("src/i18n/ui/messages/en.ts"), "utf8");
  const source = await readFile(resolve("src/shell/app-card-shell.tsx"), "utf8");
  const missing = [];
  for (const [, literal] of source.matchAll(/tt\("((?:[^"\\]|\\.)*)"\)/g)) {
    if (!/[\u4e00-\u9fff]/.test(literal)) continue;
    if (!dictionary.includes(`${JSON.stringify(literal)}:`)) missing.push(literal);
  }
  assert.deepEqual(missing, [], `未进词典的中文文案:\n${missing.join("\n")}`);
});

// ——— W2-marker 报上来的三条接口请求（W1-1 / W1-2 / W1-4 的文档支）———

test("W1-1 入口卡虚线描边：只换描边，几何一个字不变", () => {
  const props = { app: BARE, variant: "workspace", accent: "#6366f1", onCardClick() {} };
  const plain = render(props);
  const dashed = render({ ...props, dashed: true });

  // 「＋ 新建」这类入口卡与普通卡在同一张网格里，几何必须完全一致，否则会错位。
  assert.ok(dashed.includes(APP_CARD_FRAME_CLASS));
  assert.ok(dashed.includes(`${APP_CARD_FRAME_CLASS} ${APP_CARD_DASHED_CLASS}`));
  assert.equal(APP_CARD_DASHED_CLASS, "border-dashed");
  // 虚线色跟 accent 走（不给 accent 就退回外壳默认色，不会渲染成透明）。
  assert.match(dashed, /style="border-color:#6366f1"/);
  assert.match(dashed, /data-app-card-dashed="true"/);

  // 不传 dashed 时**一个字节都不新增**（首页与工作台的普通卡不受这条影响）。
  assert.doesNotMatch(plain, /border-dashed/);
  assert.doesNotMatch(plain, /data-app-card-dashed/);
  assert.doesNotMatch(plain, /style="border-color/);
  assert.equal(plain, dashed.replace(` ${APP_CARD_DASHED_CLASS}`, "")
    .replace(' data-app-card-dashed="true"', "")
    .replace(' style="border-color:#6366f1"', ""));
});

test("W1-2 onCardClick 可选：不给就不渲染那枚会抢焦点的空按钮，但卡不死", () => {
  const markup = render({
    app: POSTER,
    image: IMAGE,
    variant: "workspace",
    primaryAction: { label: "打开", onClick() {} },
  });
  // 没有落点 → 覆盖式主按钮整枚不渲染（渲染一枚点了没反应、却能 Tab 到的按钮更糟）。
  assert.doesNotMatch(markup, /data-app-card-main/);
  // 但卡片本体与主按钮照常在：这不是死卡。
  assert.match(markup, /data-app-card="true"/);
  assert.match(markup, /data-app-card-primary[^>]*>打开</);
});

test("W1-4 extraActions 是按钮条的兄弟：自己定位，不与下缘主按钮抢位置", () => {
  const markup = render({
    app: POSTER,
    image: IMAGE,
    variant: "workspace",
    primaryAction: { label: "打开", onClick() {} },
    onCardClick() {},
    extraActions: React.createElement(
      "button",
      { type: "button", "data-extra": true, className: "pointer-events-auto absolute right-1.5 top-1.5" },
      "＋ 加入工作台",
    ),
  });
  // extraActions 在按钮条**之后**渲染，且不在 `data-app-card-actions` 内部。
  const bar = markup.indexOf("data-app-card-actions");
  const extra = markup.indexOf("data-extra");
  assert.ok(bar > -1 && extra > bar);
  assert.doesNotMatch(markup, /data-app-card-actions[^>]*>[^<]*<button[^>]*data-extra/);
});

test("低层积木可被非 GoalApp 的卡复用（自建卡与 app 卡混排时版式同源）", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      AppCardFrame,
      { variant: "home", actionLabel: "我的周报卡", onAction() {} },
      React.createElement(AppCardThumb, { icon: "📝", color: "#6366f1", alt: "我的周报卡" }),
      React.createElement(AppCardText, { name: "我的周报卡", tagline: "老数据不得丢" }),
    ),
  );
  assert.ok(markup.includes(APP_CARD_FRAME_CLASS));
  assert.match(markup, /aria-label="我的周报卡"/);
  assert.match(markup, /aspect-square w-\[96px\]/);
  assert.match(markup, /text-\[15px\] font-semibold text-stone-800[^>]*>我的周报卡</);
});

test("点主按钮 = 只跑主按钮的动作；点卡片主体 = 只跑落点动作", async () => {
  // jsdom 只经 fabric 的依赖树可见，且它会 require canvas 的原生绑定（本机没编译）。
  // 照抄 home-app-cards.test.mjs 的做法：加载期间先给 canvas 塞一个空 require.cache
  // 条目，加载完立刻还原。
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://image.oceanleo.com/",
  });
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
  const opened = [];
  const primary = [];
  try {
    await act(async () =>
      root.render(
        React.createElement(AppCardShell, {
          app: POSTER,
          image: IMAGE,
          // 工作台变体：点卡主体 = 直接进 app 操作台，主按钮 =「打开」（同落点）。
          variant: "workspace",
          onCardClick: () => opened.push("card"),
          primaryAction: { label: "打开", onClick: () => primary.push("open") },
        }),
      ),
    );

    const click = (el) =>
      act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));

    await click(container.querySelector("[data-app-card-main]"));
    assert.deepEqual(opened, ["card"]);
    assert.deepEqual(primary, []);

    // 主按钮与覆盖式主动作按钮是**兄弟**，不是祖孙：点它不会再冒泡出一次整卡动作。
    await click(container.querySelector("[data-app-card-primary]"));
    assert.deepEqual(primary, ["open"]);
    assert.deepEqual(opened, ["card"]);

    // 在主按钮上按 Enter 也不得额外触发整卡动作（外壳上根本没有 keydown 处理器）。
    await act(async () =>
      container
        .querySelector("[data-app-card-primary]")
        .dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );
    assert.deepEqual(opened, ["card"]);
    assert.deepEqual(primary, ["open"]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
