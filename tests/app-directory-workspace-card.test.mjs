// 工作台目录卡的行为契约（大工程 2026-07-27 合同 §0.3 / §4-W2）。
//
// 操作员原话：「各个网站的 workspace 页面中的 app 卡片没有更新为这种格式，我觉得也需要
// 改为这种格式，完完全全一样的格式，只不过与 homepage 不同的地方在于，workspace 页面中
// 的卡片点开后，直接到对应的 app 页面中，而不是先呈现模板。」
//
// 覆盖：
//   ① 网格卡走 W1 的 `AppCardShell`（`variant="workspace"`），版式 class 与首页同源；
//   ② 缩略图取 `capabilityImage` 并**拼成绝对 URL**——废弃的 `thumb` 渲染路径彻底消失；
//   ③ 点卡片主体 = 直接进该 app 操作台（onOpen），**不开大卡片**（无 TemplateShowcase）；
//   ④ hover 主按钮 =「打开」，触屏 `@media (hover:none)` 常驻可见，且与点卡同一落点；
//   ⑤ 列表视图保留，缩略图同样换成 capabilityImage 的 `.thumb.webp`；
//   ⑥ 自建 / 无图 app 卡不是死卡（emoji tint 占满同一方块，主动作照常在）；
//   ⑦ 三个文件的数据链：SiteCatalogConsole → ConsoleFunction → DirectoryItem 全程带
//      `capabilityImage`，且源码里再没有 `.thumb` 的读取点。
//
// 组件源码经 typescript.transpileModule 编译成 data: 模块后导入，所以本文件可以直接
// `node --test tests/app-directory-workspace-card.test.mjs` 跑。

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
const uiStubUrl = dataModule("export function useUI(){ return (zh) => zh; }");
// `app-capability-image` 与 `brand-color` **一律接真模块**：本文件要断言的正是「渲染出来
// 的 src 是绝对 URL 而不是原样 key」，换替身只会证明「组件调了个函数」。
const OVERRIDES = { "../i18n/ui/useUI": uiStubUrl };

const appDirectoryUrl = await compileModule("src/shell/AppDirectory.tsx", OVERRIDES);
const cardShellUrl = await compileModule("src/shell/app-card-shell.tsx", OVERRIDES);

const { AppDirectory } = await import(appDirectoryUrl);
const { APP_CARD_GRID_CLASS, APP_CARD_FRAME_CLASS } = await import(cardShellUrl);

const OSS = "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image";
// 站点 catalog 里的 `capabilityImage` 存的是**纯 key**（合同 §3）。
const CAPABILITY_KEY = "cap-app/image-poster";
const CAPABILITY_THUMB = `${OSS}/cap-app/image-poster.thumb.webp`;
// 上一轮那批已废弃的封面（`thumb`）。它进了 DirectoryItem 也**绝不允许**被渲染出来。
const DEPRECATED_THUMB = `${OSS}/cover-app/image-poster.thumb.webp`;

const POSTER = {
  id: "poster",
  name: "海报生成",
  icon: "🖼️",
  tagline: "活动与产品宣传海报，主体突出、留出文案区",
  capabilityImage: CAPABILITY_KEY,
  scenes: ["营销物料"],
};
// 自建 / 还没铺功能图的 app：无图，但绝不能变成死卡。
const AMBIENT = { id: "ambient", name: "氛围音乐", icon: "🎵", tagline: "还没有功能图的 app", scenes: ["创作"] };

function renderDirectory(props = {}) {
  return renderToStaticMarkup(
    React.createElement(AppDirectory, {
      items: [POSTER, AMBIENT],
      accent: "#6366f1",
      onOpen() {},
      sceneMode: true,
      ...props,
    }),
  );
}

test("网格卡走 W1 的 AppCardShell（variant=workspace），版式与首页同源", () => {
  const markup = renderDirectory();

  // 卡片确实由共享外壳渲染，且带的是 workspace 变体。
  assert.match(markup, /data-app-card-variant="workspace"/);
  assert.equal(markup.match(/data-app-card-variant="workspace"/g).length, 2);
  // 工作台卡**不得**带首页那组钩子（首页与工作台的验收面各自独立，串了 V1 会假绿）。
  assert.doesNotMatch(markup, /data-home-app-card/);

  // 几何/hover 不是抄来的字符串，而是共享外壳导出的同一个常量。抄一份就会漂。
  assert.ok(markup.includes(APP_CARD_FRAME_CLASS));
  assert.ok(markup.includes(APP_CARD_GRID_CLASS));
  // 旧版式（16:10 顶部大图卡 + xl 四列）必须彻底消失。
  assert.doesNotMatch(markup, /aspect-ratio/);
  assert.doesNotMatch(markup, /xl:grid-cols-4/);
  // 首页那套关键几何逐条在场：96px 见方图块、整卡放大 + z-10、hover 铺满层。
  assert.match(markup, /aspect-square w-\[96px\]/);
  assert.match(markup, /hover:scale-105/);
  assert.match(markup, /hover:z-10/);
  assert.match(markup, /data-app-card-fill/);
});

test("缩略图取 capabilityImage 并拼成绝对 URL；废弃的 thumb 一次都不渲染", () => {
  const markup = renderDirectory({ items: [{ ...POSTER, thumb: DEPRECATED_THUMB }] });

  const srcs = [...markup.matchAll(/<img[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
  // 卡面 96px 方块 + hover 铺满层共用同一条 thumb 直链（同一 URL 只发一次请求）。
  assert.deepEqual(srcs, [CAPABILITY_THUMB, CAPABILITY_THUMB]);
  for (const src of srcs) {
    // 咬人点①：绝不允许原样 key 落进 src（浏览器会当相对路径请求 → 30 站卡片图全 404）。
    assert.notEqual(src, CAPABILITY_KEY);
    // 咬人点②：必须是绝对 URL。
    assert.match(src, /^https:\/\/oceanleo-assets\.oss-cn-guangzhou\.aliyuncs\.com\//);
    // 咬人点③：`<key>.preview.webp` 在 OSS 上不存在，出现即判红。
    assert.match(src, /\.thumb\.webp$/);
    assert.doesNotMatch(src, /\.preview\.webp/);
  }
  assert.doesNotMatch(markup, /src="\/?cap-app\//);

  // 咬人点④：同一条 item 上同时挂了废弃的 `thumb`，渲染结果里**一次都不许出现**。
  // 这正是操作员看到的「工作台卡片没跟上首页」的根因，回退即变红。
  assert.ok(!markup.includes(DEPRECATED_THUMB));
  assert.ok(!markup.includes("cover-app"));

  // 未迁移、catalog 里仍存**完整 URL** 的站不得被拼坏（拼链层对 URL 原样透传）。
  const legacy = renderDirectory({ items: [{ ...POSTER, capabilityImage: DEPRECATED_THUMB }] });
  assert.ok(legacy.includes(`src="${DEPRECATED_THUMB}"`));
  assert.doesNotMatch(legacy, /src="[^"]*assets\/image\/https/);
});

test("hover 主按钮 =「打开」，触屏常驻可见；无图 app 不是死卡", () => {
  const markup = renderDirectory();

  // 主按钮条在场，文案是「打开」（`openLabel` 的默认值）。
  assert.match(markup, /data-app-card-actions/);
  assert.match(markup, /data-app-card-primary[^>]*>打开</);
  // 触屏没有 hover：按钮条必须常驻，且去掉压暗渐变；文字块让出一条别被压住。
  assert.ok(markup.includes("[@media(hover:none)]:translate-y-0"));
  assert.ok(markup.includes("[@media(hover:none)]:bg-none"));
  assert.ok(markup.includes("[@media(hover:none)]:pb-8"));
  // 调用方可以改文案（SiteSkillDirectory 传「开聊」）。
  assert.match(renderDirectory({ openLabel: "开聊" }), /data-app-card-primary[^>]*>开聊</);

  // 无功能图的 app：emoji 占满同一个 96px 方块（不留白），主动作按钮照常在 → 不是死卡。
  const noImage = renderDirectory({ items: [AMBIENT] });
  assert.doesNotMatch(noImage, /<img/);
  assert.match(noImage, /aspect-square w-\[96px\]/);
  assert.match(noImage, /🎵/);
  assert.match(noImage, /data-app-card-main/);
  assert.match(noImage, /data-app-card-primary/);
});

test("列表视图保留，缩略图同样换成 capabilityImage 的 .thumb.webp", async () => {
  // 列表行不经网格外壳，单独钉一发：它以前也读 `item.thumb`。
  const source = await readFile(resolve("src/shell/AppDirectory.tsx"), "utf8");
  assert.match(source, /function DirectoryListRow/);
  assert.match(source, /const rowImage = capabilityImageThumbSrc\(item\.capabilityImage\)/);
  assert.match(source, /src=\{rowImage\}/);
  // 列表缩略图只有 96×64，不许在这里拉全尺寸大图（操作员：「预览尽量快」）。
  assert.doesNotMatch(source, /capabilityImagePreviewSrc/);
});

test("废弃字段 thumb 在 W2 的三个文件里再无读取点", async () => {
  for (const file of [
    "src/shell/AppDirectory.tsx",
    "src/shell/OperatorConsole.tsx",
    "src/shell/SiteCatalogConsole.tsx",
  ]) {
    // 注释里还留着 `thumb` 是**故意**的（记录它为何被废弃 + `.thumb.webp` 是 OSS 变体名），
    // 所以扫描前先把注释剥掉，只看真正会执行的代码。
    const code = (await readFile(resolve(file), "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /\.thumb\b/, `${file} 仍在读取已废弃的 thumb`);
    assert.doesNotMatch(code, /thumb:/, `${file} 仍在透传已废弃的 thumb`);
  }
});

test("数据链全程带 capabilityImage：SiteCatalogConsole → ConsoleFunction → DirectoryItem", async () => {
  const catalog = await readFile(resolve("src/shell/SiteCatalogConsole.tsx"), "utf8");
  const console_ = await readFile(resolve("src/shell/OperatorConsole.tsx"), "utf8");

  // 站点侧：取值口径只认 app-catalog 的 `capabilityImageOf()`（`capabilityImage` 优先、
  // 未迁移站回退 thumb），且这里刻意只透传**原始取值**，拼链留给 AppDirectory。
  assert.match(catalog, /capabilityImage: capabilityImageOf\(app\)/);
  assert.match(catalog, /import \{ capabilityImageOf, type GoalApp \} from "\.\/app-catalog"/);
  assert.doesNotMatch(catalog, /capabilityImageThumbSrc/);

  // 中间层：ConsoleFunction 的新字段必须是**可选**的——36 个站点仓库直接 import 这个类型，
  // 加必填字段会让它们一起 typecheck 变红。
  assert.match(console_, /capabilityImage\?: string;/);
  assert.match(console_, /capabilityImage: f\.capabilityImage/);

  // 渲染层：DirectoryItem 同样是可选字段，且 thumb 明确标了 @deprecated。
  const directory = await readFile(resolve("src/shell/AppDirectory.tsx"), "utf8");
  assert.match(directory, /capabilityImage\?: string;/);
  assert.match(directory, /@deprecated[\s\S]{0,200}?thumb\?: string;/);
});

test("点卡片主体 = 直接进该 app 操作台，不弹大卡片", async () => {
  // jsdom 只经 fabric 的依赖树可见，且它会 require canvas 的原生绑定（本机没编译）。
  // 照抄 home-app-cards.test.mjs：加载 jsdom 期间先给 canvas 塞一个空 require.cache 条目。
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://image.oceanleo.com/workspace",
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
  const added = [];
  try {
    await act(async () =>
      root.render(
        React.createElement(AppDirectory, {
          items: [POSTER, AMBIENT],
          accent: "#6366f1",
          sceneMode: true,
          onOpen: (it) => opened.push(it.id),
          onAdd: (it) => added.push(it.id),
        }),
      ),
    );

    const cards = [...container.querySelectorAll("[data-app-card]")];
    assert.equal(cards.length, 2);
    const click = (el) =>
      act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));

    // ① 点卡片主体（那枚覆盖式 <button>）= 直接进该 app 操作台。
    await click(cards[0].querySelector("[data-app-card-main]"));
    assert.deepEqual(opened, ["poster"]);
    // 且**没有**打开大卡片：工作台这条链上根本不存在 TemplateShowcase 浮层。
    assert.equal(container.querySelector("[data-template-showcase]"), null);
    assert.equal(container.querySelector("[data-template-thumb]"), null);

    // ② hover 主按钮「打开」= 同一个落点（不是另开一条路）。
    await click(cards[1].querySelector("[data-app-card-primary]"));
    assert.deepEqual(opened, ["poster", "ambient"]);
    assert.equal(container.querySelector("[data-template-showcase]"), null);

    // ③ 「加入工作台」是卡上的独立动作，**不得**顺带触发进入操作台。
    const addBtn = [...cards[0].querySelectorAll("button")].find((b) =>
      b.textContent.includes("加入工作台"),
    );
    assert.ok(addBtn, "「＋ 加入工作台」按钮应仍在卡上");
    await click(addBtn);
    assert.deepEqual(added, ["poster"]);
    assert.equal(opened.length, 2);

    // ④ 键盘守卫：在内部按钮上按 Enter 不得冒泡出第二次整卡动作（卡片根没有 keydown）。
    await act(async () =>
      addBtn.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );
    assert.equal(opened.length, 2);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
