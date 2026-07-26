// 首页 app 卡片（合同 2026-07-26 §0.1 / §0.2）的行为契约。
// 覆盖：① 点卡片主体 = 打开大卡片（**不再是**灌 prompt，推翻 2026-07-25 那版第 4 条）；
//      ② hover = 整张卡片放大（`hover:scale-105` + `hover:z-10`），功能图同时铺满；
//      ③ 「预览」按钮已删除，卡片下缘只剩 `prompt` 一个按钮，且触屏常驻可见；
//      ④ 缩略图取 `capabilityImage`（功能图），`thumb` 只是铺开窗口期的回退；
//      ⑤ 卡片根不是 role=button、也没有整卡 onKeyDown（ARIA 嵌套违规 + 键盘双触发）；
//      ⑥ 代表 prompt 为空的 app 不渲染 prompt 按钮（也绝不灌空串），但仍能开大卡片；
//      ⑦ 自建卡没有功能图也没有模板，主动作单独定义 = 灌它自己的 prompt，不得变死卡；
//      ⑧ 大卡片（W2 的 TemplateShowcase）的接线：模板集合、切换条、三按钮目标；
//      ⑨ 用户自建卡仍从 localStorage 读出并以无图 emoji 版式与 app 卡混排；
//      ⑩ 首页两段废文案（intro 段渲染、BillingNotice）在共享包零残留 + 栏宽拆列。
// 组件源码经 typescript.transpileModule 编译成 data: 模块后导入，所以本文件可以直接
// `node --test tests/home-app-cards.test.mjs` 跑，不需要仓库的 ts-extension-loader。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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

async function compileModule(relativePath, replacements = {}) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries(replacements)) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    })
    .outputText.replaceAll('from "react";', `from ${JSON.stringify(reactUrl)};`)
    .replaceAll(
      'from "react/jsx-runtime";',
      `from ${JSON.stringify(jsxRuntimeUrl)};`,
    );
  return `${dataModule(compiled)}#${encodeURIComponent(relativePath)}`;
}

// tt() 未命中词典时回退中文原文，测试里直接用恒等翻译。
const uiStubUrl = dataModule("export function useUI(){ return (zh) => zh; }");
// 两个弹窗（AddPromptModal / PromptCardModal）由 HomePromptModals 独立测试面负责，
// 这里只要它们不把 ../ui 的 portal Modal 链拖进来。
const modalsStubUrl = dataModule(
  "export function AddPromptModal(){ return null; }\n" +
    "export function PromptCardModal(){ return null; }\n",
);

const brandColorUrl = await compileModule("src/lib/brand-color.ts");
const assetThumbUrl = await compileModule("src/lib/asset-thumb.ts");
const homeCardsUrl = await compileModule("src/shell/home-cards.ts");
const appCatalogUrl = await compileModule("src/shell/app-catalog.ts");
const workspaceRouteUrl = await compileModule("src/shell/workspace-route.ts");
const workspaceActionsUrl = await compileModule("src/shell/workspace-actions.ts");
// 深链层复用 W3 的代表 prompt 取值（`catalogRepresentativePrompt` / `catalogPresetFill`），
// 所以控制器也要接真实的 app-catalog，不能留裸相对路径。「下载」的 href 由真控制器现算，
// 本文件断言的是用户最终点到的那条 URL——所以 `GATEWAY_BASE` 也接真配置。
const authConfigUrl = await compileModule("src/lib/auth/config.ts");
// `library-data` 只被控制器用来把 artifactType 映射成「我的库」分类（`?open=template`
// 派发计划，W4 的面）。它的真实模块会把整棵 artifact / database 依赖树拖进来，而本文件
// 一条都不断言那个分支，所以按同一签名给最小替身。
const libraryDataStubUrl = dataModule(
  "export function libraryKindForArtifactType(t){ return t === 'single_file_image' ? 'image' : undefined; }",
);
const controllerUrl = await compileModule("src/shell/site-catalog-controller.ts", {
  "../lib/auth/config": authConfigUrl,
  "./app-catalog": appCatalogUrl,
  "./library-data": libraryDataStubUrl,
  "./workspace-route": workspaceRouteUrl,
  "./workspace-actions": workspaceActionsUrl,
});
const lightboxUrl = await compileModule("src/shell/ImageLightbox.tsx", {
  "../lib/asset-thumb": assetThumbUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./app-catalog": appCatalogUrl,
  "./site-catalog-controller": controllerUrl,
});
const homeAppCardsUrl = await compileModule("src/shell/HomeAppCards.tsx", {
  "./app-catalog": appCatalogUrl,
  "./site-catalog-controller": controllerUrl,
  "./home-cards": homeCardsUrl,
  "./HomePromptModals": modalsStubUrl,
  "./ImageLightbox": lightboxUrl,
  "../lib/brand-color": brandColorUrl,
  "../i18n/ui/useUI": uiStubUrl,
});

const {
  HomeAppCards,
  HOME_APP_ALL_GROUP,
  HOME_APP_FEATURED_LIMIT,
  HOME_APP_SEE_ALL_HREF,
  appPreviewImageKey,
  featuredHomeApps,
  homeAppGroups,
} = await import(homeAppCardsUrl);
// 功能图 / 模板素材的取值口径归 W3 的 app-catalog 独家持有（`W3-marker.md` §3）：
// 卡片侧只许消费它们，不许在 HomeAppCards 里再写一份 `capabilityImage || thumb`。
const { appTemplates, capabilityImageOf, representativePrompt } = await import(
  appCatalogUrl
);
const {
  templateDownloadHref,
  workspaceAppAdvancedHref,
  workspaceAppFillHref,
  workspaceTemplateEditHref,
} = await import(controllerUrl);

// 上一轮那批「渐变底 + 白色线框图标」封面（`thumb`）。本轮 W5 用功能图 `capabilityImage`
// 全量替换它；铺开窗口期内两者并存，功能图无条件优先。
const THUMB =
  "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/cover-app/image-poster.thumb.webp";
// 合同 §3 的功能图 key 约定：`assets/image/cap-app/<siteKey>-<appId>.thumb.webp`。
const CAPABILITY =
  "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/cap-app/image-poster.thumb.webp";
// W3 的 `TemplateMaterial`（`src/shell/app-catalog.ts`）。每个 app 挂 1–2 份。
const TEMPLATE = {
  id: "poster-tpl-1",
  title: "夏季促销海报",
  summary: "3:4 竖版，主体居中、上方留文案区",
  tags: ["营销"],
  previewUrl: "tpl-material/image-poster-1",
  artifactId: "art-poster-1",
  artifactType: "single_file_image",
};
const TEMPLATE_2 = {
  id: "poster-tpl-2",
  title: "新品发布海报",
  summary: "1:1 方版，产品居中",
  tags: ["电商"],
  previewUrl: "tpl-material/image-poster-2",
  artifactId: "art-poster-2",
  artifactType: "single_file_image",
};

const POSTER = {
  id: "poster",
  name: "海报生成",
  icon: "🖼️",
  thumb: THUMB,
  tagline: "活动与产品宣传海报，主体突出、留出文案区",
  scenes: ["营销物料"],
  group: "图像生成",
  preset: { prompt: "生成一张 [活动] 宣传海报，风格 [风格]。", set: { ratio: "3:4" } },
};
// music 站那种「preset / guideSections 都没有」的正常数据形态。
const AMBIENT = {
  id: "ambient",
  name: "氛围音乐",
  icon: "🎵",
  tagline: "没有代表 prompt 的 app",
  scenes: ["创作"],
  group: "音频",
};
// 代表 prompt 只在导航示例卡里的 app（回退分支）。
const HEADSHOT = {
  id: "headshot",
  name: "证件照生成",
  icon: "👤",
  tagline: "白底证件照",
  scenes: ["职场"],
  preset: { set: { ratio: "1:1" } },
  guideSections: [{ id: "s1", title: "起手", examples: [{ id: "e1", title: "白底", prompt: "生成一张白底证件照。" }] }],
};

function renderCards(props = {}) {
  return renderToStaticMarkup(
    React.createElement(HomeAppCards, {
      apps: [POSTER, AMBIENT, HEADSHOT],
      siteId: "image",
      accent: "#6366f1",
      onPick() {},
      ...props,
    }),
  );
}

test("首页只放精选、按 group 出 tab、末位一张查看全部", () => {
  assert.equal(HOME_APP_FEATURED_LIMIT, 12);
  assert.equal(HOME_APP_SEE_ALL_HREF, "/workspace");
  assert.deepEqual(homeAppGroups([POSTER, AMBIENT, HEADSHOT]), ["图像生成", "音频"]);
  // 无 group 的 app 不产生 tab，但在「全部」里出现。
  assert.deepEqual(
    featuredHomeApps([POSTER, AMBIENT, HEADSHOT], 12, HOME_APP_ALL_GROUP).map((a) => a.id),
    ["poster", "ambient", "headshot"],
  );
  assert.deepEqual(
    featuredHomeApps([POSTER, AMBIENT, HEADSHOT], 12, "图像生成").map((a) => a.id),
    ["poster"],
  );
  // 精选上限生效；hiddenFromDirectory 的运行时不上首页。
  assert.deepEqual(featuredHomeApps([POSTER, AMBIENT, HEADSHOT], 2).map((a) => a.id), [
    "poster",
    "ambient",
  ]);
  assert.deepEqual(
    featuredHomeApps([{ ...POSTER, hiddenFromDirectory: true }, AMBIENT]).map((a) => a.id),
    ["ambient"],
  );

  const markup = renderCards();
  assert.match(markup, /data-home-app-cards/);
  assert.match(markup, />全部</);
  assert.match(markup, />图像生成</);
  assert.match(markup, /data-home-app-see-all[^>]*href="\/workspace"/);
  assert.match(markup, /查看全部/);
  assert.match(markup, /添加 prompt/);
  // 「查看全部」在网格末位（在最后一张 app 卡之后）。
  assert.ok(markup.lastIndexOf("data-home-app-see-all") > markup.lastIndexOf("data-home-app-card"));
});

test("常态左图右文：1:1 功能图 + 15px 半粗 app 名 + 13px 两行截断 tagline", () => {
  const markup = renderCards({ apps: [POSTER] });
  assert.match(markup, /aspect-square w-\[96px\]/);
  assert.match(markup, new RegExp(`src="${THUMB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(markup, /text-\[15px\] font-semibold text-stone-800[^>]*>海报生成</);
  assert.match(markup, /line-clamp-2 text-\[13px\][^>]*>活动与产品宣传海报/);

  // 无图的 app 用 emoji tint 占满同一个方块，不留白。
  const noThumb = renderCards({ apps: [AMBIENT] });
  assert.doesNotMatch(noThumb, /<img/);
  assert.match(noThumb, /aspect-square w-\[96px\]/);
  assert.match(noThumb, /🎵/);
});

test("缩略图取功能图 capabilityImage；thumb 只是铺开窗口期的回退", () => {
  // 合同 §0.1：首页卡片缩略图 = 功能图，不是模板图、不是上一轮那批封面。取值口径由
  // W3 的 capabilityImageOf 独家持有，这里先钉死它的裁决，再钉死卡片确实用了它。
  assert.equal(capabilityImageOf({ ...POSTER, capabilityImage: CAPABILITY }), CAPABILITY);
  assert.equal(capabilityImageOf(POSTER), THUMB);
  assert.equal(capabilityImageOf(AMBIENT), undefined);

  // 渲染面：功能图真的被用在了卡面与 hover 铺满层上，旧 thumb 一次都不出现。
  const markup = renderCards({ apps: [{ ...POSTER, capabilityImage: CAPABILITY }] });
  assert.ok(markup.includes(`src="${CAPABILITY}"`));
  assert.ok(!markup.includes(THUMB));

  // 模板素材**绝不**上首页缩略图：挂了模板也不影响卡面那张功能图（合同 §0.1 两层分离）。
  const withTemplates = renderCards({
    apps: [{ ...POSTER, capabilityImage: CAPABILITY, templates: [TEMPLATE, TEMPLATE_2] }],
  });
  assert.ok(withTemplates.includes(`src="${CAPABILITY}"`));
  assert.ok(!withTemplates.includes("tpl-material"));
});

test("hover = 整张卡片放大；「预览」按钮已删除；下缘只剩 prompt 且触屏常驻", () => {
  const markup = renderCards({ apps: [POSTER] });

  // 整卡放大（不只是卡内图片铺满），并靠 z-10 压在邻卡之上。
  assert.match(markup, /data-home-app-card="true"[^>]*hover:scale-105/);
  assert.match(markup, /data-home-app-card="true"[^>]*hover:z-10/);
  // 功能图仍在 hover 时淡入铺满整卡。
  assert.match(markup, /data-home-app-card-fill[^>]*opacity-0 transition-opacity duration-200 group-hover:opacity-100/);

  // 「预览」按钮删除：既没有那一层，也没有那两个字（点卡片本身即预览）。
  assert.doesNotMatch(markup, /data-home-app-card-preview/);
  assert.doesNotMatch(markup, /预览/);

  // 下缘按钮条里**只有** prompt 一个按钮：「生成类似」已移进大卡片。
  assert.match(markup, /data-home-app-card-actions[^>]*translate-y-full/);
  assert.match(markup, /data-home-app-card-actions[^>]*group-hover:translate-y-0/);
  assert.match(markup, />prompt</);
  assert.doesNotMatch(markup, />生成类似</);
  assert.doesNotMatch(markup, /href="\/workspace\/poster\?fill=preset"/);
  // 深链 helper 本身没坏（大卡片还在用），只是不再挂在卡面上。
  assert.equal(workspaceAppFillHref("poster"), "/workspace/poster?fill=preset");

  // 触屏没有 hover：prompt 按钮必须常驻可见，且去掉那层压暗渐变（触屏不出铺满层）。
  assert.ok(markup.includes("[@media(hover:none)]:translate-y-0"));
  assert.ok(markup.includes("[@media(hover:none)]:bg-none"));
  // 常驻按钮不许压住 tagline：文字块在触屏上让出一条。
  assert.ok(markup.includes("[@media(hover:none)]:pb-8"));
});

test("卡片根不是 role=button，主动作由覆盖式 <button> 承担（ARIA + 键盘）", async () => {
  const markup = renderCards({ apps: [POSTER] });
  // 既有违规：role=button 的祖先里嵌 <button>/<a>。改法 = 根退回普通 div。
  assert.doesNotMatch(markup, /data-home-app-card="true"[^>]*role="button"/);
  assert.doesNotMatch(markup, /data-home-app-card="true"[^>]*tabindex/i);
  // 覆盖整卡的原生按钮承载「打开大卡片」，有独立无障碍名。
  assert.match(markup, /<button[^>]*data-home-app-card-main[^>]*aria-label="查看 海报生成"/);
  assert.match(markup, /data-home-app-card-main[^>]*absolute inset-0/);

  // 整卡 onKeyDown 已不存在：源码里连一个 keydown 处理器都不该有（有的话就会重演
  // 「在内部按钮上按 Enter 额外触发一次整卡动作」那个既有 bug）。注释里还留着这两个词
  // 是**故意**的——它们记录了为什么不能加回来——所以扫描前先把注释剥掉。
  const source = (await readFile(resolve("src/shell/HomeAppCards.tsx"), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(source, /onKeyDown/);
  assert.doesNotMatch(source, /role="button"/);
});

test("代表 prompt 为空的 app：不渲染 prompt 按钮，但仍能点开大卡片", () => {
  assert.equal(representativePrompt(AMBIENT), null);
  assert.equal(representativePrompt(HEADSHOT), "生成一张白底证件照。");

  const markup = renderCards({ apps: [AMBIENT] });
  assert.doesNotMatch(markup, /data-home-app-card-actions/);
  assert.doesNotMatch(markup, />prompt</);
  // 空 prompt 不得被当成可用文案渲染进按钮（不灌空串）。
  assert.doesNotMatch(markup, /fill=preset/);
  // 但它不是死卡：主动作按钮照常在（点开大卡片看模板素材）。
  assert.match(markup, /data-home-app-card-main/);

  // 混排时三张卡都有主动作，只有有代表 prompt 的两张带按钮条。
  const mixed = renderCards();
  assert.equal(mixed.match(/data-home-app-card="true"/g).length, 3);
  assert.equal(mixed.match(/data-home-app-card-actions/g).length, 2);
  assert.equal(mixed.match(/data-home-app-card-main/g).length, 3);
});

test("appPreviewImageKey = 大卡片**无模板时**的回退大图（功能图的大图变体）", () => {
  // 有模板的 app 走不到这里：主预览由 TemplateShowcase 从选中模板的 previewUrl 解析，
  // 所以本函数只认功能图——挂了模板也不许它改口，否则两层图像又混回一个字段。
  assert.equal(
    appPreviewImageKey({ ...POSTER, capabilityImage: CAPABILITY, templates: [TEMPLATE] }),
    "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/cap-app/image-poster.webp",
  );
  // 完整 URL 的 `.thumb.webp` 要换成大图变体（assetPreviewUrl 对完整 URL 原样透传）。
  assert.equal(
    appPreviewImageKey(POSTER),
    "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/cover-app/image-poster.webp",
  );
  // 素材 key 原样透传（拼 URL 是 assetPreviewUrl 的事）。
  assert.equal(appPreviewImageKey({ ...POSTER, thumb: "cover-app/image-poster" }), "cover-app/image-poster");
  assert.equal(appPreviewImageKey(AMBIENT), undefined);
});

test("点卡主体 = 开大卡片（模板齐全）；点 prompt = 灌文案；自建卡另有主动作；键盘不双触发", async () => {
  const store = new Map([
    [
      "oceanleo_home_prompts:image",
      JSON.stringify([
        { id: "custom-1", icon: "📝", title: "我的周报卡", desc: "老数据不得丢", prompt: "帮我写周报：[要点]", category: "我的" },
      ]),
    ],
  ]);
  const localStorageStub = {
    get length() {
      return store.size;
    },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
  };

  // jsdom 只经 fabric 的依赖树可见，且它会 require canvas 的原生绑定（本机没编译）。
  // 照抄 material-cover-rendering.test.mjs 的做法：加载 jsdom 期间先给 canvas 塞一个
  // 空 require.cache 条目，加载完立刻还原。
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
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
    localStorage: localStorageStub,
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
  const picked = [];
  try {
    await act(async () =>
      root.render(
        React.createElement(HomeAppCards, {
          // 海报卡挂两份模板素材（合同 §0.1：每 app 1–2 份），氛围音乐一份都没有——
          // 大卡片的「有模板 / 无模板」两条支路都要在同一棵树里被走到。
          apps: [{ ...POSTER, capabilityImage: CAPABILITY, templates: [TEMPLATE, TEMPLATE_2] }, AMBIENT],
          siteId: "image",
          accent: "#6366f1",
          onPick: (p) => picked.push(p),
        }),
      ),
    );

    const cards = [...container.querySelectorAll("[data-home-app-card]")];
    // 自建卡 + 两张 app 卡混排，自建卡排在最前且无图。
    assert.equal(cards.length, 3);
    const mine = cards[0];
    assert.match(mine.textContent, /我的周报卡/);
    assert.match(mine.textContent, /我的/);
    assert.equal(mine.querySelector("img"), null);
    assert.match(mine.innerHTML, /📝/);

    // 卡片主体的命中区 = 那枚覆盖式 <button>（浏览器里它铺满整卡，jsdom 没有命中测试，
    // 所以直接派发到它身上——这也正好钉死「主动作挂在覆盖按钮上，不是挂在卡片根上」）。
    const main = (card) => card.querySelector("[data-home-app-card-main]");
    const click = (el) =>
      act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    const showcase = () => container.querySelector("[data-template-showcase]");
    const closeBigCard = () =>
      click(container.querySelector("[data-template-showcase] [aria-label='关闭']"));

    // 自建卡既没有功能图也没有模板素材，「点卡=开大卡片」不套用在它身上：它的主动作
    // 单独定义 = 灌它自己的 prompt（否则它会变成一张打不开任何东西的死卡）。
    await click(main(mine));
    assert.deepEqual(picked, ["帮我写周报：[要点]"]);
    assert.equal(showcase(), null);

    // 点 app 卡主体 = **打开大卡片**，不再灌 prompt（推翻 2026-07-25 那版第 4 条）。
    await click(main(cards[1]));
    assert.ok(showcase());
    assert.equal(picked.length, 1);

    // 接线断言：卡片侧必须把 W3 的 `appTemplates()` 原样交给 W2 的 TemplateShowcase，
    // 两份模板 → 出切换条；三个按钮的目标走 W4 的 helper，不许卡片侧另拼一套。
    const thumbs = [...container.querySelectorAll("[data-template-thumb]")];
    assert.deepEqual(thumbs.map((t) => t.dataset.templateId), [TEMPLATE.id, TEMPLATE_2.id]);
    const action = (name) =>
      container.querySelector(`[data-showcase-action="${name}"]`)?.getAttribute("href");
    assert.equal(action("edit"), workspaceTemplateEditHref(POSTER.id, TEMPLATE.id));
    assert.equal(action("similar"), workspaceAppFillHref(POSTER.id));
    assert.equal(action("download"), templateDownloadHref(TEMPLATE));
    assert.ok(action("download").includes(TEMPLATE.artifactId));

    // 切到第二份模板：编辑与下载的目标必须跟着换（`templateDownloadHref` 按 artifact id
    // 定位素材，而回调只拿得到 `TemplateMaterial.id`——卡片侧的按 id 取回整份不能丢）。
    await click(thumbs[1]);
    assert.equal(action("edit"), workspaceTemplateEditHref(POSTER.id, TEMPLATE_2.id));
    assert.equal(action("download"), templateDownloadHref(TEMPLATE_2));
    assert.ok(action("download").includes(TEMPLATE_2.artifactId));
    await closeBigCard();
    assert.equal(showcase(), null);

    // 没有代表 prompt、也没有模板的 app 一样能打开大卡片（它只是降级，不是死卡）：
    // 无模板 → 不出切换条、不出下载，「编辑模板」退回 app 级编辑器（旧「高级编辑」目标）。
    await click(main(cards[2]));
    assert.ok(showcase());
    assert.equal(picked.length, 1);
    assert.equal(container.querySelector("[data-template-thumb]"), null);
    assert.equal(container.querySelector('[data-showcase-action="download"]'), null);
    assert.equal(container.querySelector('[data-showcase-action="similar"]'), null);
    assert.equal(
      container.querySelector('[data-showcase-action="edit"]').getAttribute("href"),
      workspaceAppAdvancedHref(AMBIENT.id),
    );
    await closeBigCard();

    // 卡片下缘唯一的按钮 `prompt` = 灌代表 prompt，且**不得**顺带打开大卡片。
    const promptBtn = cards[1].querySelector("[data-home-app-card-actions] button");
    assert.ok(promptBtn);
    assert.equal(promptBtn.textContent, "prompt");
    assert.equal(cards[2].querySelector("[data-home-app-card-actions]"), null);
    await click(promptBtn);
    assert.deepEqual(picked, ["帮我写周报：[要点]", POSTER.preset.prompt]);
    assert.equal(showcase(), null);

    // 键盘守卫：在内部按钮上按 Enter 不得冒泡出**第二次**整卡动作。旧实现的
    // CardShell.onKeyDown 无条件 preventDefault + onActivate，缺 `e.target !==
    // e.currentTarget` 守卫；新实现把整卡动作交给原生 <button>，卡片根上根本没有
    // keydown 处理器，所以这一发 keydown 什么都不该发生。
    await act(async () =>
      promptBtn.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    assert.equal(picked.length, 2);
    assert.equal(showcase(), null);

    // 分类 tab 过滤：切到「图像生成」只剩 poster（自建卡不受 group 影响，始终在）。
    const groupTab = [...container.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "图像生成",
    );
    assert.ok(groupTab);
    await act(async () => groupTab.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    const afterFilter = [...container.querySelectorAll("[data-home-app-card]")];
    assert.equal(afterFilter.length, 2);
    assert.match(afterFilter[0].textContent, /我的周报卡/);
    assert.match(afterFilter[1].textContent, /海报生成/);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});

// V1-verdict R1：本轮新交付面里有两条中文串没进 17 语词典，15 个非中文 locale 会露出中文。
// 词典（`src/i18n/**`）是 W3 独占目录，所以 W1 这侧的闭合方式 = **不再产出未翻译文案**，
// 并用本用例钉死：我的两个组件里每一条 `tt("<含中文>")` 字面量都必须已在词典里。
test("W1 组件不产出未进词典的中文文案（R1 回归守卫）", async () => {
  // 既有缺陷豁免：`添加 prompt` 在基线 `HomeCards.tsx` 就已是无译文的中文串
  // （`git show HEAD:src/shell/HomeCards.tsx` L130），本轮只是把它搬进新网格，不算新增。
  const PRE_EXISTING = new Set(["添加 prompt"]);
  const dictionary = await readFile(resolve("src/i18n/ui/messages/en.ts"), "utf8");
  const missing = [];
  for (const file of ["src/shell/HomeAppCards.tsx", "src/shell/ImageLightbox.tsx"]) {
    const source = await readFile(resolve(file), "utf8");
    for (const [, literal] of source.matchAll(/tt\("((?:[^"\\]|\\.)*)"\)/g)) {
      if (!/[\u4e00-\u9fff]/.test(literal)) continue;
      if (PRE_EXISTING.has(literal)) continue;
      if (!dictionary.includes(`${JSON.stringify(literal)}:`)) missing.push(`${literal}  [${file}]`);
    }
  }
  assert.deepEqual(missing, [], `未进词典的中文文案:\n${missing.join("\n")}`);
  // R1 点名的那两条必须真的不在源码里了（改回来即变红）。
  const cards = await readFile(resolve("src/shell/HomeAppCards.tsx"), "utf8");
  const lightbox = await readFile(resolve("src/shell/ImageLightbox.tsx"), "utf8");
  assert.doesNotMatch(cards, /进入工作台/);
  assert.doesNotMatch(lightbox, /还没有代表 prompt/);
});

test("共享包里 intro 段与 BillingNotice 零残留", async () => {
  const homeIntro = await readFile(resolve("src/shell/HomeIntro.tsx"), "utf8");
  const shellIndex = await readFile(resolve("src/shell/index.ts"), "utf8");
  for (const [name, source] of [
    ["HomeIntro.tsx", homeIntro],
    ["src/shell/index.ts", shellIndex],
  ]) {
    assert.doesNotMatch(source, /BillingNotice/, name);
    assert.doesNotMatch(source, /成本价/, name);
    assert.doesNotMatch(source, /属于 OceanLeo 系列/, name);
    assert.doesNotMatch(source, /BYOK_PROVIDERS/, name);
  }
  // intro 只剩「被忽略的 deprecated 可选 prop」——签名在（30 个站还在传），但不渲染。
  assert.match(homeIntro, /intro\?: ReactNode/);
  assert.doesNotMatch(homeIntro, /\{intro\}/);
  // apps / featuredLimit 已接线，且未传 apps 的站仍走旧 prompt 卡路径。
  assert.match(homeIntro, /apps\?: GoalApp\[\]/);
  assert.match(homeIntro, /featuredLimit\?: number/);
  assert.match(homeIntro, /<HomeAppCards/);
  assert.match(homeIntro, /<HomePromptCards/);
});

test("栅格加宽：外层放宽到 max-w-6xl，输入框留在 768px 阅读列，仍是每行三个", async () => {
  const homeIntro = await readFile(resolve("src/shell/HomeIntro.tsx"), "utf8");
  // 改版前那个包住一切的 `max-w-3xl` 已经不在最外层容器上了。
  assert.doesNotMatch(homeIntro, /mx-auto flex w-full max-w-3xl/);
  // 拆成两层：外层按「有没有 app 卡」在 1152px / 768px 之间选，H1 与输入框各自套回阅读列。
  assert.match(homeIntro, /const READING_COLUMN = "max-w-3xl";/);
  assert.match(homeIntro, /withAppCards \? "max-w-6xl" : "max-w-3xl"/);
  assert.equal(homeIntro.match(/\$\{READING_COLUMN\}/g).length, 2);
  // 放宽只在传了 apps 时生效：agent 那种走 HomePromptCards 的站版式零变化。
  assert.match(homeIntro, /withAppCards\s*=\s*withCards && Boolean\(apps && apps\.length > 0\)/);

  // 卡片区吃满外层，但列数仍是三列（合同 §0.2 第 5 条：更宽，不是更多列）。
  const cards = await readFile(resolve("src/shell/HomeAppCards.tsx"), "utf8");
  assert.match(cards, /grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3/);
  assert.doesNotMatch(cards, /xl:grid-cols-4/);
});
