// 首页 app 卡片（合同 §0，操作员 2026-07-25）的行为契约。
// 覆盖：① 代表 prompt 为空的 app 不渲染 prompt / 生成类似按钮（也绝不灌空串）；
//      ② hover / 轻点展开态的铺满层 + 预览 + 下缘按钮条结构存在；
//      ③ lightbox 三按钮（prompt / 生成类似 / 高级编辑）与无 prompt 时的降级；
//      ④ 用户自建卡仍从 localStorage 读出并以无图 emoji 版式与 app 卡混排；
//      ⑤ 首页两段废文案（intro 段渲染、BillingNotice）在共享包零残留。
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
// W2 的深链层复用 W3 的代表 prompt 取值（`catalogRepresentativePrompt` /
// `catalogPresetFill`），所以控制器也要接真实的 app-catalog，不能留裸相对路径。
const controllerUrl = await compileModule("src/shell/site-catalog-controller.ts", {
  "./app-catalog": appCatalogUrl,
  "./workspace-route": workspaceRouteUrl,
  "./workspace-actions": workspaceActionsUrl,
});
const lightboxUrl = await compileModule("src/shell/ImageLightbox.tsx", {
  "../lib/asset-thumb": assetThumbUrl,
  "../i18n/ui/useUI": uiStubUrl,
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

const { ImageLightbox } = await import(lightboxUrl);
const {
  HomeAppCards,
  HOME_APP_ALL_GROUP,
  HOME_APP_FEATURED_LIMIT,
  HOME_APP_SEE_ALL_HREF,
  appPreviewImageKey,
  featuredHomeApps,
  homeAppGroups,
} = await import(homeAppCardsUrl);
const { representativePrompt } = await import(appCatalogUrl);
const { workspaceAppAdvancedHref, workspaceAppFillHref } = await import(
  controllerUrl
);

const THUMB =
  "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/cover-app/image-poster.thumb.webp";

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

test("常态左图右文：1:1 缩略图 + 15px 半粗 app 名 + 13px 两行截断 tagline", () => {
  const markup = renderCards({ apps: [POSTER] });
  assert.match(markup, /aspect-square w-\[86px\]/);
  assert.match(markup, new RegExp(`src="${THUMB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(markup, /text-\[15px\] font-semibold text-stone-800[^>]*>海报生成</);
  assert.match(markup, /line-clamp-2 text-\[13px\][^>]*>活动与产品宣传海报/);

  // 无图的 app 用 emoji tint 占满同一个方块，不留白。
  const noThumb = renderCards({ apps: [AMBIENT] });
  assert.doesNotMatch(noThumb, /<img/);
  assert.match(noThumb, /aspect-square w-\[86px\]/);
  assert.match(noThumb, /🎵/);
});

test("hover / 轻点展开态：图片铺满 + 图上预览 + 下缘 prompt、生成类似", () => {
  const markup = renderCards({ apps: [POSTER] });
  // 常态收起（触屏轻点一次会把它翻成 "1"）。
  assert.match(markup, /data-expanded="0"/);
  // 铺满层与预览层默认透明，hover 时显形。
  assert.match(markup, /data-home-app-card-fill[^>]*opacity-0 group-hover:opacity-100/);
  assert.match(markup, /data-home-app-card-preview[^>]*opacity-0 group-hover:opacity-100/);
  assert.match(markup, /预览/);
  // 下缘按钮条从卡片外浮进来。
  assert.match(markup, /data-home-app-card-actions[^>]*translate-y-full group-hover:translate-y-0/);
  assert.match(markup, />prompt</);
  assert.match(markup, />生成类似</);
  assert.match(markup, /href="\/workspace\/poster\?fill=preset"/);
  assert.equal(workspaceAppFillHref("poster"), "/workspace/poster?fill=preset");
});

test("代表 prompt 为空的 app：不渲染 prompt / 生成类似，仍可预览", () => {
  assert.equal(representativePrompt(AMBIENT), null);
  assert.equal(representativePrompt(HEADSHOT), "生成一张白底证件照。");

  const markup = renderCards({ apps: [AMBIENT] });
  assert.doesNotMatch(markup, /data-home-app-card-actions/);
  assert.doesNotMatch(markup, />prompt</);
  assert.doesNotMatch(markup, />生成类似</);
  // 空 prompt 不得被当成可用文案渲染进按钮（不灌空串）。
  assert.doesNotMatch(markup, /fill=preset/);
  assert.match(markup, /data-home-app-card-preview/);
  assert.match(markup, /预览/);

  // 混排时三张卡里只有有代表 prompt 的两张带按钮条。
  const mixed = renderCards();
  assert.equal(mixed.match(/data-home-app-card="true"/g).length, 3);
  assert.equal(mixed.match(/data-home-app-card-actions/g).length, 2);
  assert.equal(mixed.match(/data-home-app-card-preview/g).length, 3);
});

test("lightbox：大图 + app 名 + 代表 prompt 全文 + 三个按钮", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ImageLightbox, {
      title: "海报生成",
      imageKey: appPreviewImageKey(POSTER),
      fallbackIcon: "🖼️",
      accent: "#6366f1",
      prompt: representativePrompt(POSTER),
      onUsePrompt() {},
      fillHref: workspaceAppFillHref(POSTER.id),
      advancedHref: workspaceAppAdvancedHref(POSTER.id),
      onClose() {},
    }),
  );
  assert.match(markup, /data-image-lightbox/);
  assert.match(markup, /role="dialog"[^>]*aria-modal="true"/);
  // 大图用 `<key>.webp`，不是那张 `.thumb.webp`。
  assert.match(markup, /cover-app\/image-poster\.webp/);
  assert.doesNotMatch(markup, /image-poster\.thumb\.webp/);
  assert.match(markup, />海报生成</);
  assert.match(markup, /生成一张 \[活动\] 宣传海报/);
  assert.match(markup, />prompt</);
  assert.match(markup, />生成类似</);
  assert.match(markup, />高级编辑</);
  assert.match(markup, /href="\/workspace\/poster\?fill=preset"/);
  assert.match(markup, /href="\/workspace\/poster\?fill=preset&amp;open=advanced"/);
  // 关闭键可聚焦（a11y：打开即聚焦它，Esc / 点遮罩关闭）。
  assert.match(markup, /aria-label="关闭"/);

  // 无代表 prompt：只剩「高级编辑」，prompt / 生成类似都不给。
  const bare = renderToStaticMarkup(
    React.createElement(ImageLightbox, {
      title: "氛围音乐",
      fallbackIcon: "🎵",
      prompt: representativePrompt(AMBIENT),
      onUsePrompt() {},
      fillHref: workspaceAppFillHref(AMBIENT.id),
      advancedHref: workspaceAppAdvancedHref(AMBIENT.id),
      onClose() {},
    }),
  );
  assert.doesNotMatch(bare, />prompt</);
  assert.doesNotMatch(bare, />生成类似</);
  assert.match(bare, />高级编辑</);
  // 无图也不留白：emoji tint 占满图位。
  assert.doesNotMatch(bare, /<img/);
  assert.match(bare, /🎵/);
});

test("appPreviewImageKey 把缩略图变体换成大图变体，素材 key 原样透传", () => {
  assert.equal(
    appPreviewImageKey(POSTER),
    "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/cover-app/image-poster.webp",
  );
  assert.equal(appPreviewImageKey({ ...POSTER, thumb: "cover-app/image-poster" }), "cover-app/image-poster");
  assert.equal(appPreviewImageKey(AMBIENT), undefined);
});

test("用户自建卡仍从 localStorage 读出，并以无图 emoji 版式与 app 卡混排", async () => {
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
          apps: [POSTER, AMBIENT],
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

    // 点自建卡 = 把它的 prompt 灌进输入框（与旧 prompt 卡一致）。
    await act(async () => mine.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.deepEqual(picked, ["帮我写周报：[要点]"]);

    // 点整张 app 卡（未命中按钮）= 灌代表 prompt；没有代表 prompt 的卡点了什么都不发生。
    await act(async () => cards[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.deepEqual(picked, ["帮我写周报：[要点]", POSTER.preset.prompt]);
    await act(async () => cards[2].dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(picked.length, 2);

    // 触屏没有 hover：第一次轻点只展开成 hover 等价态，不灌 prompt。
    // jsdom 20 没有 PointerEvent 构造器 → 用 MouseEvent 冒充 pointerdown 并带上
    // pointerType（React 的合成事件直接读原生事件的这个字段）。
    const tapped = cards[1];
    const touchDown = new window.MouseEvent("pointerdown", { bubbles: true });
    Object.defineProperty(touchDown, "pointerType", { value: "touch" });
    await act(async () => {
      tapped.dispatchEvent(touchDown);
      tapped.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(tapped.getAttribute("data-expanded"), "1");
    assert.equal(picked.length, 2);

    // 同一时刻只展开一张：轻点另一张卡，上一张必须收起（V1-verdict RR-2）。
    const other = cards[2];
    const otherDown = new window.MouseEvent("pointerdown", { bubbles: true });
    Object.defineProperty(otherDown, "pointerType", { value: "touch" });
    await act(async () => {
      other.dispatchEvent(otherDown);
      other.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(other.getAttribute("data-expanded"), "1");
    assert.equal(tapped.getAttribute("data-expanded"), "0");

    // 点卡片以外的地方 → 收起（触屏没有 :hover 兜底，否则会永远停在展开态）。
    await act(async () =>
      window.document.body.dispatchEvent(
        new window.MouseEvent("pointerdown", { bubbles: true }),
      ),
    );
    assert.equal(other.getAttribute("data-expanded"), "0");
    assert.equal(picked.length, 2);

    // 重新展开第一张，供下面的「预览」步骤使用。
    const reDown = new window.MouseEvent("pointerdown", { bubbles: true });
    Object.defineProperty(reDown, "pointerType", { value: "touch" });
    await act(async () => {
      tapped.dispatchEvent(reDown);
      tapped.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(tapped.getAttribute("data-expanded"), "1");

    // 点图上「预览」→ 开 lightbox（三按钮由上一条用例断言）。
    const preview = tapped.querySelector("[data-home-app-card-preview] button");
    assert.ok(preview);
    await act(async () => preview.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.ok(container.querySelector("[data-image-lightbox]"));
    assert.equal(picked.length, 2);

    // 分类 tab 过滤：切到「图像生成」只剩 poster（自建卡不受 group 影响，始终在）。
    await act(async () =>
      container
        .querySelector("[data-image-lightbox] [aria-label='关闭']")
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );
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
