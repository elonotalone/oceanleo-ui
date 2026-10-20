// 工作台目录卡的行为契约（2026-10-19：与我的库同一套四列等宽卡）。
//
// 覆盖：
//   ① 网格走 `CollectionCardGrid`（四列等宽），卡面是 4:3 封面 + 一行标题；
//   ② 缩略图取 `capabilityImage` 并**拼成绝对 URL**——废弃的 `thumb` 渲染路径彻底消失；
//   ③ 点卡片主体 = 直接进该 app 操作台（onOpen），**不开大卡片**（无 TemplateShowcase）；
//   ④ 列表视图保留，缩略图同样换成 capabilityImage 的 `.thumb.webp`；
//   ⑤ 自建 / 无图 app 卡不是死卡（emoji tint 占满同一 4:3 封面）；
//   ⑥ 三个文件的数据链：SiteCatalogConsole → ConsoleFunction → DirectoryItem 全程带
//      `capabilityImage`，且源码里再没有 `.thumb` 的读取点。
//
// 组件源码经 typescript.transpileModule 编译成 data: 模块后导入，所以本文件可以直接
// `node --test tests/app-directory-workspace-card.test.mjs` 跑。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
// 大卡片（`ImageLightbox.tsx`）走条件 portal，所以它 import 了 `react-dom`。这里必须接
// **真**包：portal 出去的节点得和 `react-dom/client` 建的 root 属于同一个实例，替身给不了。
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;

/** 把一个 TS 源文件及其全部相对依赖递归编译成 data: 模块（同 home-app-cards.test.mjs）。 */
// tt() 未命中词典时回退中文原文，测试里直接用恒等翻译。
const uiStubUrl = dataModule("export function useUI(){ return (zh) => zh; }");
// `app-capability-image` 与 `brand-color` **一律接真模块**：本文件要断言的正是「渲染出来
// 的 src 是绝对 URL 而不是原样 key」，换替身只会证明「组件调了个函数」。
const OVERRIDES = { "../i18n/ui/useUI": uiStubUrl, "react-dom": reactDomUrl };

const appDirectoryUrl = await compileModule("src/shell/AppDirectory.tsx", OVERRIDES);
const { AppDirectory } = await import(appDirectoryUrl);

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

test("网格卡走我的库四列等宽，卡面是 4:3 封面加标题", () => {
  const markup = renderDirectory();

  assert.match(markup, /data-collection-card-grid/);
  assert.match(markup, /repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(markup, /aspect-\[4\/3\]/);
  assert.match(markup, /data-collection-card="poster"/);
  assert.match(markup, /data-collection-card-main/);
  assert.doesNotMatch(markup, /data-app-card-variant/);
  assert.doesNotMatch(markup, /data-home-app-card/);
  assert.doesNotMatch(markup, /xl:grid-cols-4/);
  assert.doesNotMatch(markup, /lg:grid-cols-3/);
});

test("缩略图取 capabilityImage 并拼成绝对 URL；废弃的 thumb 一次都不渲染", () => {
  const markup = renderDirectory({ items: [{ ...POSTER, thumb: DEPRECATED_THUMB }] });

  const srcs = [...markup.matchAll(/<img[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(srcs, [CAPABILITY_THUMB]);
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
  assert.ok(!markup.includes(DEPRECATED_THUMB));
  assert.ok(!markup.includes("cover-app"));

  // 未迁移、catalog 里仍存**完整 URL** 的站不得被拼坏（拼链层对 URL 原样透传）。
  const legacy = renderDirectory({ items: [{ ...POSTER, capabilityImage: DEPRECATED_THUMB }] });
  assert.ok(legacy.includes(`src="${DEPRECATED_THUMB}"`));
  assert.doesNotMatch(legacy, /src="[^"]*assets\/image\/https/);
});

test("整卡可点；无图 app 不是死卡", () => {
  const markup = renderDirectory();
  assert.match(markup, /aria-label="打开 海报生成"/);
  assert.match(renderDirectory({ openLabel: "开聊" }), /aria-label="开聊 海报生成"/);

  const noImage = renderDirectory({ items: [AMBIENT] });
  assert.doesNotMatch(noImage, /<img/);
  assert.match(noImage, /aspect-\[4\/3\]/);
  assert.match(noImage, /🎵/);
  assert.match(noImage, /data-collection-card-main/);
  assert.match(noImage, /aria-label="打开 氛围音乐"/);
});

test("虚线入口卡 / 落点可选 / 不再为 scenes 造空数组", async () => {
  const withNew = renderDirectory({
    leadingCards: [{ id: "new", name: "新建 agent", tagline: "创建一个属于你自己的 agent", icon: "＋" }],
  });
  assert.match(withNew, /border-dashed/);
  assert.equal(withNew.split("border-dashed").length - 1, 1);
  assert.match(withNew, /＋/);
  assert.doesNotMatch(renderDirectory(), /border-dashed/);

  const noOpen = renderDirectory({ onOpen: undefined });
  assert.match(noOpen, /data-collection-card="poster"/);
  assert.match(noOpen, /disabled=""/);
  assert.doesNotMatch(noOpen, /aria-label="打开 /);

  const source = await readFile(resolve("src/shell/AppDirectory.tsx"), "utf8");
  assert.doesNotMatch(source, /scenes: item\.scenes \?\? \[\]/);
});

// 17 语词典（zh 是 key 本身，不必校验）。
const LOCALES = ["ar", "de", "en", "es-419", "es", "fr", "hi", "it", "ja", "ko", "pt-BR", "pt-PT", "th", "tr", "vi", "zh-TW"];

/** 从一个 messages 文件里抽出 `"key": "value"` 表。 */
async function dictionary(locale) {
  const src = await readFile(resolve(`src/i18n/ui/messages/${locale}.ts`), "utf8");
  return Object.fromEntries(
    [...src.matchAll(/^\s*"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)].map((m) => [m[1], m[2]]),
  );
}

test("默认打开词条：17 语齐备，且不是被占用的一整句话", async () => {
  const markup = renderDirectory();
  assert.match(markup, /aria-label="打开 海报生成"/);
  const label = "打开";

  const broken = [];
  for (const locale of LOCALES) {
    const value = (await dictionary(locale))[label];
    if (value === undefined) broken.push(`${locale}: 缺词条`);
    else if (value.length > 24) broken.push(`${locale}: 译文疑似被占用 → ${value.slice(0, 60)}`);
  }
  assert.deepEqual(broken, [], `打开文案「${label}」在这些语种上不可用：\n${broken.join("\n")}`);

  const industry = await dictionary("en");
  assert.equal(industry["按行业"], "By industry");
});

test("列表视图与网格卡共用同一批已进词典的文案（16 个语种不再露中文）", async () => {
  // 列表视图以前另写了「编辑 prompt」「加入工作台」「已加入」三条**没进 17 语词典**的
  // 字面量，非中文语种在列表下会露中文；网格用的三条本来就是齐的，改为复用。
  const en = await dictionary("en");
  for (const literal of ["查看 / 编辑 prompt", "＋ 加入工作台", "已在工作台 ✓"]) {
    assert.ok(en[literal], `${literal} 应已在词典里`);
  }
  const source = await readFile(resolve("src/shell/AppDirectory.tsx"), "utf8");
  for (const orphan of ["编辑 prompt", "加入工作台", "已加入"]) {
    assert.doesNotMatch(
      source,
      new RegExp(`tt\\("${orphan}"\\)`),
      `列表视图不该再用未进词典的 tt("${orphan}")`,
    );
  }
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

    const cards = [...container.querySelectorAll("[data-collection-card]")];
    assert.equal(cards.length, 2);
    const click = (el) =>
      act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));

    // ① 点卡片主体 = 直接进该 app 操作台。
    await click(cards[0].querySelector("[data-collection-card-main]"));
    assert.deepEqual(opened, ["poster"]);
    // 且**没有**打开大卡片：工作台这条链上根本不存在 TemplateShowcase 浮层。
    // 查整份 document 而不是 container：大卡片 mount 后会 portal 到 `document.body`
    // （逃出调用方的 transform 祖先），拿容器查等于「浮层真开了也照样通过」的假绿。
    assert.equal(window.document.querySelector("[data-template-showcase]"), null);
    assert.equal(window.document.querySelector("[data-template-thumb]"), null);

    await click(cards[1].querySelector("[data-collection-card-main]"));
    assert.deepEqual(opened, ["poster", "ambient"]);
    assert.equal(window.document.querySelector("[data-template-showcase]"), null);

    // ② 「加入工作台」是卡上的独立动作，**不得**顺带触发进入操作台。
    const addBtn = [...cards[0].querySelectorAll("button")].find((b) =>
      (b.getAttribute("aria-label") || "").includes("加入工作台"),
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
