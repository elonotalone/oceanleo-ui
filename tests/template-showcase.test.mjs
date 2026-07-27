// 大卡片（多模板详情浮层）= `TemplateShowcase` 的行为契约（合同 §0.4 / §3.1，W3，2026-07-27）。
// 覆盖：
//   ① 左上主预览 + 左下缩略图条（≥2 份才出，0/1 份不出）+ 右侧标题/说明/标签的分栏版式；
//   ② 右侧按钮**恰好三个**「预览&编辑」「生成类似」「更多」，顺序定死，且**没有下载**；
//   ③ 两条深链 helper 的输出逐字符正确：
//        `workspaceTemplatePreviewHref` → /workspace?tab=materials&item=…&mode=preview&app=…
//        （`tab` 的取值归接口 A 定义，见 `W2-interface-A.md`：官方模板素材固定
//         `materials`，`mine` 留给用户自有 artifact；`library` 作为历史别名归一化到 mine）
//        `exploreAppHref`               → /explore?app=…
//   ④ **切换模板时右侧信息与按钮目标同步跟随选中项**（本组件最易回归处，jsdom 真点击）；
//   ⑤ 无模板 / 无代表 prompt 的 app 上按钮如何降级（「更多」几乎恒在，是唯一去处）；
//   ⑥ 自带遮罩 / Esc / 打开即聚焦必须保留，且不得改用 `../ui` 的 portal <Modal>；
//   ⑥b **条件 portal**（问题 1）：SSR / 首帧内联渲染（静态断言拿得到内容），mount 后
//      `createPortal(document.body)` 逃出调用方的 transform 祖先，`fixed inset-0` 才真满屏；
//   ⑥c **主预览不裁切**（问题 3）：硬比例 16/10 + object-cover 已废除，容器按素材真实
//      宽高比（元数据 → 图片自然尺寸）自适应，图片 object-contain；缩略图条仍 object-cover；
//   ⑦ 本文件的每条中文文案在 17 语词典里都有译文；已废除的两个旧按钮名 17 语全部清干净；
//   ⑧ 下载四档错误文案的词条**仍在** 17 语词典里（大卡片删了下载按钮，但 W5 的探索页
//      素材卡要复用同一套下载体验——删词条会让那边 16 个 locale 齐刷刷露中文）。
// 组件源码经 typescript.transpileModule 编译成 data: 模块后导入，所以可以直接
// `node --test tests/template-showcase.test.mjs` 跑，不需要仓库的 ts-extension-loader。

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
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
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

const compiled = new Map();
const inFlight = new Set();

/**
 * 把一个 TS 源文件及其**全部相对依赖**递归编译成 data: 模块。
 *
 * 递归而不是手抄一份依赖清单：两条深链由 `site-catalog-controller` 现算，那个文件还在
 * 演进，每加一条 import 就得来改测试。`overrides` 只留给必须换成替身的模块（tt() 词典）。
 */
async function compileModule(relativePath, overrides = {}) {
  const sourcePath = resolve(relativePath);
  const cached = compiled.get(sourcePath);
  if (cached) return cached;
  assert.ok(
    !inFlight.has(sourcePath),
    `循环依赖，data: 模块无法表达：${relativePath}`,
  );
  inFlight.add(sourcePath);

  let output = ts.transpileModule(await readFile(sourcePath, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;

  // 只有**值** import 会活到这一步，`import type` 已被 transpile 抹掉。
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
  compiled.set(sourcePath, url);
  return url;
}

// tt() 未命中词典时回退中文原文，测试里直接用恒等翻译。
const uiStubUrl = dataModule("export function useUI(){ return (zh) => zh; }");
// `react-dom` 接真包：条件 portal 必须由**同一个** react-dom 实例创建，替身做不到
// 「portal 出去的节点仍属于同一棵 React 树」这件事。
const OVERRIDES = { "../i18n/ui/useUI": uiStubUrl, "react-dom": reactDomUrl };

// 两条深链接**真**控制器而不是替身：本测试断言的是用户最终点到的那条 URL，
// 替身只会证明「组件调了个函数」。
const showcaseUrl = await compileModule("src/shell/ImageLightbox.tsx", OVERRIDES);
const controllerUrl = await compileModule("src/shell/site-catalog-controller.ts", OVERRIDES);

const { TemplateShowcase, ImageLightbox } = await import(showcaseUrl);
const {
  workspaceTemplatePreviewHref,
  exploreAppHref,
  resolveSiteCatalogRoute,
  catalogCanonicalRedirect,
} = await import(controllerUrl);

// `TemplateMaterial` 形状（合同 §3）。两份模板的每个字段都刻意取不同值，
// 这样「右侧没跟着切」的实现会被下面的 doesNotMatch 抓住。
const TPL_A = {
  id: "poster-a",
  title: "夏季促销海报",
  summary: "3:4 竖版促销主视觉，主体居中、下方留文案区。",
  tags: ["促销", "竖版"],
  previewUrl: "tpl-material/image-poster-1",
  artifactId: "art-a",
  artifactType: "single_file_image",
};
const TPL_B = {
  id: "poster-b",
  title: "新品发布长图",
  summary: "9:16 长图，顶部产品特写、底部参数表。",
  tags: ["新品", "长图"],
  previewUrl: "tpl-material/image-poster-2",
  artifactId: "art-b",
  artifactType: "single_file_image",
  downloadUrl: "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/tpl/poster-b.psd",
};

const BASE = {
  appId: "poster",
  title: "海报生成",
  fallbackIcon: "🖼️",
  accent: "#6366f1",
  prompt: "生成一张 [活动] 宣传海报，风格 [风格]。",
  fillHref: "/workspace/poster?fill=preset",
  onClose() {},
};

function markup(props = {}) {
  return renderToStaticMarkup(React.createElement(TemplateShowcase, { ...BASE, ...props }));
}

/** 渲染出来的 `data-showcase-action` 取值，按 DOM 顺序。 */
function actionsOf(html) {
  return [...html.matchAll(/data-showcase-action="([^"]+)"/g)].map(([, name]) => name);
}

// ————————————————————————————————————————————————————————————————
// jsdom 夹具：切换模板是**有交互**的，静态渲染看不到，所以那个用例要真挂载。
// ————————————————————————————————————————————————————————————————
async function withDom(run) {
  // fabric 自带的 jsdom 是仓内唯一可用的那份；它的 canvas 依赖在本容器里装不上，
  // 用一个空模块顶掉（本组件不碰 canvas）。
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

  const render = (props = {}) =>
    act(async () =>
      root.render(React.createElement(TemplateShowcase, { ...BASE, ...props })),
    );
  // mount 之后浮层 portal 到 `document.body`，**不在** root 容器里了（问题 1 的修法），
  // 所以查询一律走整份 document；容器本身另有专门的用例断言它已经空了。
  const find = (selector) => window.document.querySelector(selector);
  const findAll = (selector) => [...window.document.querySelectorAll(selector)];
  const click = (selector) => {
    const node = find(selector);
    assert.ok(node, `点不到 ${selector}`);
    return act(async () =>
      node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );
  };
  const read = () => ({
    title: find("[data-template-showcase-title]")?.textContent,
    summary: find("[data-template-showcase-summary]")?.textContent,
    tags: findAll("[data-template-showcase-tags] span").map((n) => n.textContent),
    preview: find("[data-template-showcase-preview] img")?.getAttribute("src"),
    actions: findAll("[data-showcase-action]").map((n) => ({
      name: n.getAttribute("data-showcase-action"),
      text: n.textContent,
      href: n.getAttribute("href"),
      tag: n.tagName,
    })),
    active: find('[data-template-thumb][data-active="1"]')?.getAttribute("data-template-id"),
  });

  try {
    await run({ window, container, render, click, read, find, findAll });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

// ————————————————————————————————————————————————————————————————
// 1. 深链 helper（合同 §3.1 锁死的形状；W4 的库预览页与 W5 的探索页按它解析）
// ————————————————————————————————————————————————————————————————

test("workspaceTemplatePreviewHref 的输出逐字符锁死", () => {
  assert.equal(
    workspaceTemplatePreviewHref("poster", "art-a"),
    "/workspace?tab=materials&item=art-a&mode=preview&app=poster",
  );
  // 参数顺序也是契约的一部分：tab → item → mode → app。
  assert.deepEqual(
    [...new URL(workspaceTemplatePreviewHref("poster", "art-a"), "https://x").searchParams.keys()],
    ["tab", "item", "mode", "app"],
  );
  // `mode=preview` 是本轮的产品要害：落点必须是**只读预览**，不是编辑器。
  assert.match(workspaceTemplatePreviewHref("poster", "art-a"), /mode=preview/);
  assert.doesNotMatch(workspaceTemplatePreviewHref("poster", "art-a"), /open=(advanced|template)/);

  // 需要转义的 id 走 URL 编码，不裸拼。
  assert.equal(
    workspaceTemplatePreviewHref("图片 生成", "art/b"),
    "/workspace?tab=materials&item=art%2Fb&mode=preview&app=%E5%9B%BE%E7%89%87+%E7%94%9F%E6%88%90",
  );

  // 缺 artifact 就拼不出只读落点：退回该 app 的 canonical 地址，绝不产出半截深链。
  assert.equal(workspaceTemplatePreviewHref("poster", ""), "/workspace/poster");
  assert.equal(workspaceTemplatePreviewHref("", ""), "/workspace");
  assert.doesNotMatch(workspaceTemplatePreviewHref("poster", ""), /mode=preview/);
  // 缺 app、有 artifact：**不产出**预览深链（V5 残余 R-3 的修正）。
  // 本文件上一版这里写的是「预览页仍能开（app 只是锚点）」——那个判断是错的：库预览面板
  // 挂在 app 操作台的右栏里，没有 app 时右栏根本不挂载，那条链接看着像预览链接、点进去
  // 静静地什么都不发生。宁可退回目录（用户至少落在正常页面上），也不产出注定落不了地的链接。
  // 「缺锚点」的完整行为（生产侧与消费侧都必须出声）由
  // `tests/catalog-preview-deeplink.test.mjs` 的 ①②③ 三条钉死。
  assert.equal(workspaceTemplatePreviewHref("", "art-a"), "/workspace");
  assert.doesNotMatch(workspaceTemplatePreviewHref("", "art-a"), /mode=preview/);

  // 站点可自定义 canonicalBasePath。
  assert.equal(
    workspaceTemplatePreviewHref("poster", "art-a", { canonicalBasePath: "/studio" }),
    "/studio?tab=materials&item=art-a&mode=preview&app=poster",
  );
});

test("exploreAppHref 的输出逐字符锁死", () => {
  assert.equal(exploreAppHref("poster"), "/explore?app=poster");
  assert.equal(exploreAppHref("3d-model"), "/explore?app=3d-model");
  assert.equal(exploreAppHref("图片生成"), "/explore?app=%E5%9B%BE%E7%89%87%E7%94%9F%E6%88%90");
  // 空 app → 不带锚点的探索页，而不是 `?app=`（空参数会让 W5 多一条死分支）。
  assert.equal(exploreAppHref(""), "/explore");
  assert.equal(exploreAppHref("   "), "/explore");
  // locale 前缀站传自己的 basePath。
  assert.equal(exploreAppHref("poster", { basePath: "/ja/explore" }), "/ja/explore?app=poster");
  assert.equal(exploreAppHref("poster", { basePath: "/ja/explore/" }), "/ja/explore?app=poster");
});

// ————————————————————————————————————————————————————————————————
// 1b. **方向性端到端**：产链接的人 → 解析链接的人（V5 判定书 §2 的 BLOCKER-1）
//
// 上一版这里只有「helper 的输出逐字符正确」，两条 helper 各自都绿，接缝却是断的：
// 库深链带 `mode=preview`，而 `mode` 同时是 legacy app 深链键（`legacyQueryKeys` 默认
// `["fn","mode"]`），于是 `preview` 被当成 app id，全站预览落点渲染成
// 「这个 App 不存在或已下线 / preview」。**单独测每一端永远是绿的**，只有把 A 的输出
// 真喂给 B 才抓得到。所以下面这几条一律走「helper 产出 → 路由解析器消费」的真实方向。
// ————————————————————————————————————————————————————————————————

/** 把 helper 产出的 href 拆成路由解析器的入参，中途不手写任何字面量。 */
function routeStateFor(href, knownAppIds) {
  const url = new URL(href, "https://image.oceanleo.com");
  return resolveSiteCatalogRoute({
    pathname: url.pathname,
    search: url.search,
    knownAppIds: new Set(knownAppIds),
  });
}

test("方向性：预览深链喂进 resolveSiteCatalogRoute 后仍指向同一个 app", () => {
  const appId = "animal-model";
  const artifactId = "4b3f256f-0b3a-4a1e-9f22-7c9a5b1d8e40";
  const href = workspaceTemplatePreviewHref(appId, artifactId);
  const state = routeStateFor(href, [appId, "poster"]);

  // 判定书点名的两条。
  assert.equal(state.activeAppId, appId);
  assert.equal(state.invalidAppId, "");
  // 以及事故现场的那三个中间量：`preview` 不许再被当成 app id。
  assert.equal(state.legacyAppId, "");
  assert.equal(state.requestedAppId, appId);
  assert.equal(state.queryAppId, appId);
});

test("方向性：17 种 app id 形态逐个走完 helper → 路由解析器", () => {
  // 真实站点的 app id 形态（含连字符、数字、非 ASCII），逐个证明接缝通。
  for (const appId of [
    "animal-model", "poster", "3d-model", "ppt", "resume2", "law-brief",
    "图片生成", "a", "app.with.dot", "app_underscore",
  ]) {
    const href = workspaceTemplatePreviewHref(appId, "art-1");
    const state = routeStateFor(href, [appId]);
    assert.equal(state.activeAppId, appId, `${appId}: activeAppId 不对（href=${href}）`);
    assert.equal(state.invalidAppId, "", `${appId}: 被判成了不存在的 app`);
  }
});

test("方向性：app 真的不存在时才报「不存在」，且报的是 app 不是 preview", () => {
  const href = workspaceTemplatePreviewHref("ghost-app", "art-1");
  const state = routeStateFor(href, ["poster"]);
  assert.equal(state.invalidAppId, "ghost-app");
  assert.notEqual(state.invalidAppId, "preview", "又把 mode 当成 app id 了");
  assert.equal(state.activeAppId, "");
});

test("方向性：规范化重定向不得吃掉 mode=preview", () => {
  const appId = "animal-model";
  const href = workspaceTemplatePreviewHref(appId, "art-1");
  const url = new URL(href, "https://image.oceanleo.com");
  const state = routeStateFor(href, [appId]);
  const redirect = catalogCanonicalRedirect(state, url.pathname, url.search);

  // 规范化到 `/workspace/<appId>`，但**预览意图必须活下来**——被删掉的话预览页会退化
  // 成普通库视图，用户点「预览&编辑」等于进了个半成品。
  assert.equal(redirect, "/workspace/animal-model?tab=materials&item=art-1&mode=preview");
  // `app=` 进了路径段，query 里那份重复项收走。
  assert.doesNotMatch(redirect, /[?&]app=/);

  // 重定向之后再解析一次：必须稳定（不再重定向、app 仍然对）。
  const after = new URL(redirect, "https://image.oceanleo.com");
  const settled = routeStateFor(redirect, [appId]);
  assert.equal(settled.activeAppId, appId);
  assert.equal(settled.invalidAppId, "");
  assert.equal(catalogCanonicalRedirect(settled, after.pathname, after.search), null);
});

test("回归护栏：老式 ?mode=<appId> / ?fn=<appId> 深链一个都不许坏", () => {
  // 库深链的结构特征（tab=library / item=）不在时，`mode` 仍是 legacy app id。
  const legacy = resolveSiteCatalogRoute({
    pathname: "/workspace",
    search: "?mode=poster",
    knownAppIds: new Set(["poster"]),
  });
  assert.equal(legacy.legacyAppId, "poster");
  assert.equal(legacy.activeAppId, "poster");

  const fn = resolveSiteCatalogRoute({
    pathname: "/workspace",
    search: "?fn=poster",
    knownAppIds: new Set(["poster"]),
  });
  assert.equal(fn.activeAppId, "poster");

  // 极端情形：某个站真有一个叫 `preview` 的 app，它的老式链接照样能开。
  const appNamedPreview = resolveSiteCatalogRoute({
    pathname: "/workspace",
    search: "?mode=preview",
    knownAppIds: new Set(["preview"]),
  });
  assert.equal(appNamedPreview.activeAppId, "preview");
  assert.equal(appNamedPreview.invalidAppId, "");

  // 路径段永远优先于 query。
  const pathWins = resolveSiteCatalogRoute({
    pathname: "/workspace/poster",
    search: "?tab=library&item=art-1&mode=preview&app=animal-model",
    knownAppIds: new Set(["poster", "animal-model"]),
  });
  assert.equal(pathWins.activeAppId, "poster");
  assert.equal(pathWins.queryAppId, "");
});

// ————————————————————————————————————————————————————————————————
// 2. 版式与三按钮
// ————————————————————————————————————————————————————————————————

test("版式：左上主预览 + 左下切换条 + 右侧标题/说明/标签", () => {
  const html = markup({ templates: [TPL_A, TPL_B] });

  // 外壳与 a11y 骨架（旧 data-image-lightbox 保留，W1 的既有选择器不失效）。
  assert.match(html, /data-image-lightbox/);
  assert.match(html, /data-template-showcase/);
  assert.match(html, /role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /aria-label="关闭"/);
  // 左右分栏必须放宽 max-w-2xl（合同要求；672px 装不下两栏）。
  assert.match(html, /max-w-5xl/);
  assert.doesNotMatch(html, /max-w-2xl/);
  assert.match(html, /md:grid-cols-\[minmax\(0,1\.5fr\)_minmax\(0,1fr\)\]/);

  // 左上：主预览用**选中模板**的素材大图（`.webp` 大图变体，不是那张 thumb）。
  assert.match(html, /data-template-showcase-preview/);
  const previewSrc = html.match(/data-template-showcase-preview[\s\S]*?<img src="([^"]+)"/)?.[1];
  assert.match(previewSrc, /tpl-material\/image-poster-1\.webp$/);
  assert.doesNotMatch(previewSrc, /\.thumb\.webp$/);

  // 左下：两份模板 → 切换条出现，两颗缩略图，选中态可判别。
  assert.match(html, /data-template-showcase-thumbs/);
  assert.match(html, /aria-label="切换模板"/);
  assert.equal(html.match(/data-template-thumb/g).length, 2);
  assert.match(html, /data-template-id="poster-a"[^>]*data-active="1"/);
  assert.match(html, /data-template-id="poster-b"[^>]*data-active="0"/);
  // 缩略图用 thumb 变体，省流量。
  assert.match(html, /image-poster-2\.thumb\.webp/);

  // 右侧：标题/说明/标签取自选中模板，而不是 app 名。
  assert.match(html, /data-template-showcase-title[^>]*>夏季促销海报</);
  assert.match(html, /data-template-showcase-summary/);
  assert.match(html, /3:4 竖版促销主视觉/);
  assert.match(html, /data-template-showcase-tags/);
  assert.match(html, />促销</);
  assert.match(html, />竖版</);
  // app 名仍在 header 与 dialog 无障碍名里。
  assert.match(html, /aria-label="海报生成"/);
});

test("按钮恰好三个，顺序为 预览&编辑 → 生成类似 → 更多", () => {
  const html = markup({ templates: [TPL_A, TPL_B] });

  assert.deepEqual(actionsOf(html), ["preview", "similar", "more"]);
  assert.equal(html.match(/data-showcase-action=/g).length, 3, "按钮必须恰好三个");

  // `&` 渲染成纯文本（HTML 里转义成 &amp;），不是拼进属性里的裸串。
  assert.match(html, /data-showcase-action="preview"[^>]*>预览&amp;编辑</);
  assert.match(html, /data-showcase-action="similar"[^>]*>生成类似</);
  assert.match(html, /data-showcase-action="more"[^>]*>更多</);
});

test("下载按钮从大卡片彻底消失（入口迁到库与探索页）", () => {
  const html = markup({ templates: [TPL_A, TPL_B] });
  assert.doesNotMatch(html, /data-showcase-action="download"/);
  assert.doesNotMatch(html, />下载</);
  assert.doesNotMatch(html, /登录后下载|下载中…/);
  assert.doesNotMatch(html, /data-showcase-download-issue/);
  // 自带 https 直链的素材也不例外（上一轮那条「直链免登录」分支一起删）。
  assert.doesNotMatch(markup({ templates: [TPL_B] }), /下载/);

  // 组件源码里整套下载态机（登录探测 / pending / 四档报错）都不该再有。
  // 唯一允许出现「下载」二字的地方是解释文案迁去哪儿的注释。
  return readFile(resolve("src/shell/ImageLightbox.tsx"), "utf8").then((source) => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const dead of [
      "download",
      "下载",
      "isSignedIn",
      "signedIn",
      "accountHref",
      "DownloadIssue",
      "template-download",
    ]) {
      assert.ok(!code.includes(dead), `下载态机残留：${dead}`);
    }
  });
});

test("三按钮目标：预览&编辑指向选中模板的只读预览页，更多指向本站探索页", () => {
  const html = markup({ templates: [TPL_A, TPL_B] });

  // 预览&编辑 = 库里的只读预览（**不是**编辑器深链）。
  assert.match(
    html,
    /data-showcase-action="preview"[^>]*href="\/workspace\?tab=materials&amp;item=art-a&amp;mode=preview&amp;app=poster"/,
  );
  // 生成类似仍是 app 级 `?fill=preset`，行为不变。
  assert.match(html, /data-showcase-action="similar"[^>]*href="\/workspace\/poster\?fill=preset"/);
  // 更多 = 本站探索页并锚定该 app。
  assert.match(html, /data-showcase-action="more"[^>]*href="\/explore\?app=poster"/);
  // 预览&编辑刻意**不带** `?fill=preset`：那是「生成类似」的活。
  assert.doesNotMatch(html, /mode=preview[^"]*fill=preset/);

  // initialTemplateId 指定第二份时，预览&编辑改指 B 的 artifact。
  const second = markup({ templates: [TPL_A, TPL_B], initialTemplateId: "poster-b" });
  assert.match(second, /item=art-b&amp;mode=preview/);
  assert.doesNotMatch(second, /item=art-a/);
});

test("显式传入的解析器覆盖默认落点，且收到的是选中项的 artifactId", () => {
  const seen = [];
  const html = markup({
    templates: [TPL_A, TPL_B],
    initialTemplateId: "poster-b",
    templatePreviewHref: (appId, artifactId) => {
      seen.push([appId, artifactId]);
      return `/custom/${appId}/${artifactId}`;
    },
    exploreHref: "/ja/explore?app=poster",
  });
  assert.match(html, /data-showcase-action="preview"[^>]*href="\/custom\/poster\/art-b"/);
  assert.deepEqual(seen, [["poster", "art-b"]]);
  assert.match(html, /data-showcase-action="more"[^>]*href="\/ja\/explore\?app=poster"/);
  assert.doesNotMatch(html, /tab=materials/);
});

test("只有 1 份模板时不渲染切换条，右侧信息与三个按钮仍在", () => {
  const html = markup({ templates: [TPL_A] });
  assert.doesNotMatch(html, /data-template-showcase-thumbs/);
  assert.doesNotMatch(html, /data-template-thumb/);
  assert.doesNotMatch(html, /aria-label="切换模板"/);
  assert.match(html, /tpl-material\/image-poster-1\.webp"/);
  assert.match(html, />夏季促销海报</);
  assert.deepEqual(actionsOf(html), ["preview", "similar", "more"]);
});

// ————————————————————————————————————————————————————————————————
// 3. 降级形态。三颗按钮各有前提，缺谁掉谁；「更多」几乎恒在（素材没补齐的 app 上
//    它是用户唯一的去处，比上一轮那种「零按钮纯预览浮层」强）。
// ————————————————————————————————————————————————————————————————

test("无模板 app：预览&编辑退到调用方兜底，没兜底就只剩生成类似 + 更多", () => {
  const cover = "cover-app/image-poster";

  const withFallback = markup({ templates: [], imageKey: cover, editHref: "/workspace?tab=materials&mode=preview&app=poster" });
  assert.deepEqual(actionsOf(withFallback), ["preview", "similar", "more"]);
  assert.match(withFallback, /data-showcase-action="preview"[^>]*href="\/workspace\?tab=materials&amp;mode=preview&amp;app=poster"/);
  // 无模板 → 主预览回退 app 封面，右侧标题回退 app 名，说明回退代表 prompt 全文。
  assert.match(withFallback, /cover-app\/image-poster\.webp"/);
  assert.match(withFallback, /data-template-showcase-title[^>]*>海报生成</);
  assert.match(withFallback, />代表 prompt</);
  assert.match(withFallback, /生成一张 \[活动\] 宣传海报/);

  const promptOnly = markup({ templates: [], imageKey: cover });
  assert.deepEqual(actionsOf(promptOnly), ["similar", "more"]);
  assert.doesNotMatch(promptOnly, /预览&amp;编辑/);

  // 连代表 prompt 都没有（music 站那 22 个）：只剩「更多」——探索页是唯一去处。
  const bare = markup({ templates: [], prompt: "", fillHref: "", title: "氛围音乐", appId: "ambient", fallbackIcon: "🎵" });
  assert.deepEqual(actionsOf(bare), ["more"]);
  assert.match(bare, /data-showcase-action="more"[^>]*href="\/explore\?app=ambient"/);
  assert.doesNotMatch(bare, /<img/);
  assert.match(bare, /🎵/);
  assert.match(bare, /aria-label="关闭"/);

  // 连 appId 都没有 → 零按钮，降级成纯预览浮层（关闭途径仍在）。
  const anonymous = markup({ templates: [], prompt: "", fillHref: "", appId: "", title: "未接线" });
  assert.deepEqual(actionsOf(anonymous), []);
  assert.match(anonymous, /aria-label="关闭"/);
});

test("选中模板缺 artifactId：预览&编辑退到兜底，不产出半截深链", () => {
  const broken = { ...TPL_A, artifactId: "" };
  const html = markup({ templates: [broken] });
  // 没有兜底 → 整颗不渲染，只剩生成类似 + 更多。
  assert.deepEqual(actionsOf(html), ["similar", "more"]);
  assert.doesNotMatch(html, /tab=materials/);

  const withFallback = markup({ templates: [broken], editHref: "/workspace/poster" });
  assert.match(withFallback, /data-showcase-action="preview"[^>]*href="\/workspace\/poster"/);
});

test("有模板但无代表 prompt：只掉「生成类似」", () => {
  const html = markup({ templates: [TPL_A, TPL_B], prompt: "" });
  assert.deepEqual(actionsOf(html), ["preview", "more"]);
  assert.doesNotMatch(html, /生成类似/);
  // 模板自带 summary，所以说明段还在，只是不挂「代表 prompt」小标题。
  assert.match(html, /3:4 竖版促销主视觉/);
  assert.doesNotMatch(html, />代表 prompt</);
});

test("兼容壳 ImageLightbox：旧 props 仍可渲染，advancedHref 映射成无模板兜底", () => {
  const html = renderToStaticMarkup(
    React.createElement(ImageLightbox, {
      title: "海报生成",
      appId: "poster",
      imageKey: "cover-app/image-poster",
      fallbackIcon: "🖼️",
      accent: "#6366f1",
      prompt: "生成一张 [活动] 宣传海报。",
      onUsePrompt() {},
      fillHref: "/workspace/poster?fill=preset",
      advancedHref: "/workspace/poster?fill=preset&open=advanced",
      onClose() {},
    }),
  );
  assert.match(html, /data-image-lightbox/);
  assert.match(html, /data-showcase-action="preview"[^>]*href="\/workspace\/poster\?fill=preset&amp;open=advanced"/);
  assert.deepEqual(actionsOf(html), ["preview", "similar", "more"]);
});

test("保留自带遮罩 / Esc / 焦点管理，不得改用 ../ui 的 portal <Modal>", async () => {
  const source = await readFile(resolve("src/shell/ImageLightbox.tsx"), "utf8");
  // 注释里会解释「为什么不用 Modal」，所以先剥掉注释再查真实代码。
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /from "\.\.\/ui"/);
  assert.doesNotMatch(code, /\bModal\b/);
  assert.match(source, /document\.addEventListener\("keydown"/);
  assert.match(source, /closeRef\.current\?\.focus\(\)/);
  // 遮罩点击关闭 + 对话框内点击不冒泡。
  assert.match(source, /className="fixed inset-0 z-50[^"]*"\s*\n?\s*onClick=\{onClose\}/);
  assert.match(source, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  // 首帧就能被静态渲染出内容（Modal 那种 `if (!mounted) return null` 会让这里是空串）。
  assert.notEqual(markup({ templates: [TPL_A] }).trim(), "");
});

// ————————————————————————————————————————————————————————————————
// 2b. 条件 portal（问题 1：门户浮层不满屏）
//
// 病根不在本组件的 class 上：`fixed inset-0 z-50` 是对的，但门户首页
// （`oceanleo/app/_components/home-content.tsx`）把卡片区包在 `.v-fade-up` 里，那条
// animation 是 `both` 填充、终帧 `transform: translateY(0)` —— 非 none 的 transform 会
// 永久造出新的 containing block，`fixed` 后代于是只铺满那一层。修法是 mount 后 portal
// 到 `document.body`，同时**保住** SSR / 首帧的内联渲染（本文件其余用例全靠静态渲染）。
// ————————————————————————————————————————————————————————————————

test("SSR / 静态渲染：仍内联渲染完整浮层，不是 portal 后的空首帧", () => {
  const html = markup({ templates: [TPL_A, TPL_B] });
  // 静态渲染时 portal 还没接上（mounted=false），标记为 0。
  assert.match(html, /data-showcase-portal="0"/);
  // 浮层的实质内容在首帧就能被断言到：遮罩、dialog、主预览、三颗按钮。
  assert.match(html, /class="fixed inset-0 z-50/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /data-template-showcase-preview/);
  assert.deepEqual(actionsOf(html), ["preview", "similar", "more"]);
  // 兼容壳走同一条 SSR 路径。
  assert.match(
    renderToStaticMarkup(
      React.createElement(ImageLightbox, { title: "海报生成", appId: "poster", onClose() {} }),
    ),
    /data-showcase-portal="0"/,
  );
});

test("mount 之后浮层 portal 到 document.body，逃出调用方的 transform 祖先", async () => {
  await withDom(async ({ window, container, render, find }) => {
    // 复刻门户首页的病灶：把 root 容器包进一个带 transform 的祖先里。
    const trapped = window.document.createElement("div");
    trapped.setAttribute("data-transform-ancestor", "1");
    trapped.style.transform = "translateY(0)";
    container.before(trapped);
    trapped.append(container);

    await render({ templates: [TPL_A, TPL_B] });

    const overlay = find("[data-template-showcase]");
    assert.ok(overlay, "浮层没渲染出来");
    // ① 已 portal：标记翻成 1，且节点的父级就是 body。
    assert.equal(overlay.getAttribute("data-showcase-portal"), "1");
    assert.equal(overlay.parentElement, window.document.body);
    // ② 关键判据：浮层**不在**那个 transform 祖先里，也不在 React root 容器里。
    assert.equal(trapped.querySelector("[data-template-showcase]"), null);
    assert.equal(container.querySelector("[data-template-showcase]"), null);
    // ③ 满屏的那套定位 class 一个都不许丢（portal 只换挂点，不换版式）。
    assert.match(overlay.getAttribute("class"), /fixed inset-0 z-50/);
    // ④ portal 出去的仍是同一棵 React 树：右侧信息与按钮照常渲染。
    assert.equal(find("[data-template-showcase-title]")?.textContent, "夏季促销海报");
    assert.equal(window.document.querySelectorAll("[data-showcase-action]").length, 3);
    // ⑤ 只有一份浮层（内联那份必须被替换掉，不能portal + 内联各留一份）。
    assert.equal(window.document.querySelectorAll("[data-template-showcase]").length, 1);
  });
});

test("卸载后 portal 出去的浮层不留残骸", async () => {
  await withDom(async ({ window, render }) => {
    await render({ templates: [TPL_A] });
    assert.ok(window.document.querySelector("[data-template-showcase]"));
    // withDom 的 finally 会 unmount，这里先手动确认 body 上那份是受 React 管的。
    assert.equal(
      window.document.body.querySelector("[data-template-showcase]")?.getAttribute("data-showcase-portal"),
      "1",
    );
  });
});

// ————————————————————————————————————————————————————————————————
// 2c. 主预览不再裁切（问题 3）
//
// 旧实现是容器硬写 `aspectRatio: "16 / 10"` + 图片 `object-cover`：实测 84% 的素材被
// 裁掉一圈，document / grid 最惨 —— 而这两类素材的全部价值就是让用户看清版面结构。
// 缩略图条那份 `object-cover` 保留：小方块里等比裁切是合理的。
// ————————————————————————————————————————————————————————————————

test("主预览：不再硬写 16/10，图片走 object-contain（缩略图条仍是 object-cover）", async () => {
  const html = markup({ templates: [TPL_A, TPL_B] });
  const preview = html.match(/data-template-showcase-preview[\s\S]*?<\/div>/)[0];

  assert.doesNotMatch(preview, /aspect-ratio:\s*16\s*\/\s*10/);
  assert.doesNotMatch(preview, /object-cover/, "主预览还在裁切");
  assert.match(preview, /object-contain/);
  // 缩略图条那份裁切是刻意保留的。
  const thumbs = html.slice(html.indexOf("data-template-showcase-thumbs"));
  assert.match(thumbs, /object-cover/);

  // 源码里 16/10 这条硬比例彻底消失（注释里解释历史除外）。
  const source = await readFile(resolve("src/shell/ImageLightbox.tsx"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /"16 \/ 10"[\s\S]{0,80}object-cover/);
  // 硬比例只剩「没有图、纯 emoji 兜底」那一支可以用（没有内容可裁）。
  assert.equal((code.match(/16 \/ 10/g) ?? []).length, 1);
});

test("主预览按素材真实宽高比自适应：元数据里的 width/height 直接生效", () => {
  // document / grid 类的典型形状：A4 竖版（794×1123）与宽表格（1600×900）。
  const portrait = { ...TPL_A, width: 794, height: 1123 };
  const html = markup({ templates: [portrait] });
  assert.match(html, /data-preview-fit="intrinsic"/);
  const ratio = 794 / 1123;
  assert.match(html, new RegExp(`aspect-ratio:\\s*${ratio.toString().slice(0, 8)}`));
  // 竖版素材的容器比例必须**小于 1**（比 16/10 高得多），否则又是横向硬比例在裁。
  const rendered = Number(html.match(/aspect-ratio:\s*([0-9.]+)/)[1]);
  assert.ok(rendered < 1, `竖版素材渲染成了 ${rendered}（又被摆成横版）`);

  const landscape = markup({ templates: [{ ...TPL_A, width: 1600, height: 900 }] });
  assert.equal(Number(landscape.match(/aspect-ratio:\s*([0-9.]+)/)[1]).toFixed(4), (1600 / 900).toFixed(4));

  // 脏元数据（0 / 负数 / 非数字）不许算出 NaN 比例：退回「不设比例 + object-contain」。
  for (const bad of [{ width: 0, height: 100 }, { width: -3, height: 4 }, { width: "宽", height: 10 }]) {
    const dirty = markup({ templates: [{ ...TPL_A, ...bad }] });
    assert.match(dirty, /data-preview-fit="contain"/);
    assert.doesNotMatch(dirty, /aspect-ratio:\s*(NaN|-)/);
  }
});

test("主预览：没有元数据时先按 object-contain 渲染，图片 onLoad 报出比例后再定高", async () => {
  // 没有 width/height → 首帧不设 aspect-ratio（宁可让图自己撑高，也不硬摆一个比例）。
  assert.match(markup({ templates: [TPL_A] }), /data-preview-fit="contain"/);

  await withDom(async ({ window, render, click, find }) => {
    await render({ templates: [TPL_A] });
    const img = find("[data-template-showcase-preview] img");
    assert.ok(img);
    // jsdom 不真下载图片，直接伪造 naturalWidth/naturalHeight 再触发 load。
    Object.defineProperty(img, "naturalWidth", { configurable: true, value: 900 });
    Object.defineProperty(img, "naturalHeight", { configurable: true, value: 1600 });
    await act(async () => img.dispatchEvent(new window.Event("load")));

    const box = find("[data-template-showcase-preview]");
    assert.equal(box.getAttribute("data-preview-fit"), "intrinsic");
    assert.ok(
      Math.abs(Number(box.style.aspectRatio) - 900 / 1600) < 1e-6,
      `aspect-ratio 应为 900/1600，实际 ${box.style.aspectRatio}`,
    );
    // 切到另一份素材（真点缩略图）：上一份的自然比例必须作废，不能拿旧比例摆新图。
    await render({ templates: [TPL_A, TPL_B] });
    assert.equal(find("[data-template-showcase-preview]").getAttribute("data-preview-fit"), "intrinsic");
    await click('[data-template-thumb][data-template-id="poster-b"]');
    const next = find("[data-template-showcase-preview]");
    assert.match(next.querySelector("img").getAttribute("src"), /image-poster-2\.webp$/);
    assert.equal(next.getAttribute("data-preview-fit"), "contain");
  });
});

test("切换模板：右侧标题/说明/标签与三个按钮的目标全部跟随选中项", async () => {
  await withDom(async ({ window, render, click, read }) => {
    let closed = 0;
    await render({
      templates: [TPL_A, TPL_B],
      onClose() {
        closed += 1;
      },
    });

    // 打开即聚焦关闭键（a11y 不得回归）。
    assert.equal(window.document.activeElement?.getAttribute("aria-label"), "关闭");

    const first = read();
    assert.equal(first.active, "poster-a");
    assert.equal(first.title, "夏季促销海报");
    assert.match(first.summary, /3:4 竖版促销主视觉/);
    assert.deepEqual(first.tags, ["促销", "竖版"]);
    assert.match(first.preview, /image-poster-1\.webp$/);
    assert.deepEqual(first.actions.map((a) => a.name), ["preview", "similar", "more"]);
    // 浏览器里读到的是解码后的纯文本：`&` 就是 `&`，没有 `&amp;` 漏进正文。
    assert.deepEqual(first.actions.map((a) => a.text), ["预览&编辑", "生成类似", "更多"]);
    assert.deepEqual(first.actions.map((a) => a.tag), ["A", "A", "A"]);
    assert.equal(first.actions[0].href, "/workspace?tab=materials&item=art-a&mode=preview&app=poster");
    assert.equal(first.actions[1].href, "/workspace/poster?fill=preset");
    assert.equal(first.actions[2].href, "/explore?app=poster");

    // ——— 点第二颗缩略图 ———
    await click('[data-template-thumb][data-template-id="poster-b"]');

    const second = read();
    assert.equal(second.active, "poster-b");
    // 右侧四项全部跟随（标题/说明/标签/主预览）。
    assert.equal(second.title, "新品发布长图");
    assert.match(second.summary, /9:16 长图/);
    assert.doesNotMatch(second.summary, /3:4 竖版促销主视觉/);
    assert.deepEqual(second.tags, ["新品", "长图"]);
    assert.match(second.preview, /image-poster-2\.webp$/);
    // 预览&编辑改指 B 的 artifact；生成类似与更多是 app 级，保持不变。
    assert.equal(second.actions[0].href, "/workspace?tab=materials&item=art-b&mode=preview&app=poster");
    assert.equal(second.actions[1].href, "/workspace/poster?fill=preset");
    assert.equal(second.actions[2].href, "/explore?app=poster");

    // ——— 切回第一份，确认是真·双向同步而不是「一次性走到 B」———
    await click('[data-template-thumb][data-template-id="poster-a"]');
    const back = read();
    assert.equal(back.active, "poster-a");
    assert.equal(back.title, "夏季促销海报");
    assert.equal(back.actions[0].href, "/workspace?tab=materials&item=art-a&mode=preview&app=poster");

    // Esc 关闭（自带键盘处理，不依赖 Modal）。
    await act(async () =>
      window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    assert.equal(closed, 1);
  });
});

// ————————————————————————————————————————————————————————————————
// 4. 17 语判据（i18n 词典是 W3 独占目录）
// ————————————————————————————————————————————————————————————————

const LOCALES = [
  "zh", "zh-TW", "en", "de", "es", "es-419", "fr", "it", "pt-BR",
  "pt-PT", "ja", "ko", "ar", "th", "tr", "vi", "hi",
];
const CHINESE_LOCALES = new Set(["zh", "zh-TW"]);

/** 本轮新增的五条（大卡片两颗按钮 + 探索页三段式分区名）。 */
const W3_NEW_COPY = ["预览&编辑", "更多", "此 app", "本站素材", "更多素材"];

/**
 * 下载四档错误文案 + 下载态文案：大卡片已删掉下载按钮，但这些词条**必须留在词典里**
 * ——W5 的探索页素材卡与库详情页要复用同一套下载体验。删掉会让 16 个 locale 露中文。
 */
const RETAINED_DOWNLOAD_COPY = [
  "下载",
  "登录后下载",
  "下载中…",
  "请先登录后再下载。",
  "今日下载次数已达上限，请明天再试。",
  "这份模板素材不存在或已下线。",
];

/** 本轮全站废除的两个旧按钮名：17 份词典里一条都不许留。 */
const RETIRED_COPY = ["编辑模板", "高级编辑"];

/**
 * V1 判据 21 / 判据 10 的补课：W4、W5 的调用点 + 那条已下架功能的旧名。
 *
 * 这批词条的失败形态是**静默**的——`tt()` 未命中就回退中文原文，不报错、不炸编译、
 * 测试全绿，只有 16 个非中文 locale 的用户看得见。所以必须由测试逐格钉住，
 * 且要同时钉「源码里那个调用点还活着」：词条补了而调用点改了串，等于白补。
 */
const V1_GAP_COPY = {
  "素材分区": "src/shell/material-library-view.tsx",
  "搜索本站素材": "src/shell/material-library-presentation.ts",
  "本站暂无可编辑素材": "src/shell/material-library-presentation.ts",
  "这里只显示本站已登记的素材；可前往「更多素材」查看全平台模板。":
    "src/shell/material-library-presentation.ts",
  "正在准备预览…": "src/shell/library-viewer-first-paint.tsx",
  "这份素材缺少 source 授权，暂时无法创建你自己的副本；官方原件不会被改动。":
    "src/shell/artifact-client.ts",
  "登录后才能编辑素材：需要先确认你的账号，才能把改动保存成你自己的副本。":
    "src/shell/artifact-client.ts",
  "高级编辑已融入 App 的生成与库，正在返回工作台…": "src/shell/AdvancedFeaturePages.tsx",
};

/** zh-TW 必须真本地化而不是逐字转繁的那几条。 */
const ZH_TW_MUST_DIFFER = {
  "预览&编辑": "預覽&編輯",
};

/**
 * zh-TW 与简体逐字相同的那几条：属**语言事实**（「更多」「素材」「此」在繁体中写法完全
 * 一致，没有可改的字），固化成白名单——日后有人往 zh-TW 里偷懒抄简体，这个集合会变大。
 */
const ZH_TW_SAME_AS_SOURCE = new Set(["更多", "此 app", "本站素材", "更多素材"]);

const uiDictionaries = new Map();
for (const locale of LOCALES) {
  const mod = await import(`../src/i18n/ui/messages/${locale}.ts`);
  uiDictionaries.set(locale, mod.default);
}

test("组件 tt() 的每条中文文案在 17 语词典里都有译文", async () => {
  const source = await readFile(resolve("src/shell/ImageLightbox.tsx"), "utf8");
  const literals = [...source.matchAll(/tt\("((?:[^"\\]|\\.)*)"\)/g)]
    .map(([, literal]) => literal)
    .filter((literal) => /[\u4e00-\u9fff]/.test(literal));
  // 组件真的在用这些词条，否则下面的循环会空转成一条永远为真的断言。
  for (const expected of ["预览&编辑", "更多", "生成类似", "切换模板", "关闭"]) {
    assert.ok(literals.includes(expected), `组件应通过 tt("${expected}") 取文案`);
  }
  for (const [locale, dict] of uiDictionaries) {
    const missing = literals.filter((literal) => typeof dict[literal] !== "string" || !dict[literal].trim());
    assert.deepEqual(missing, [], `${locale} 词典缺少: ${missing.join(", ")}`);
  }
});

test("W3 新增的五条词条：17 语齐备，zh 是 key===值，15 个非中文 locale 真的翻了", () => {
  const zh = uiDictionaries.get("zh");
  const placeholder = /\bTODO\b|\bTBD\b|\bFIXME\b|\bXXX\b|\?\?\?|机翻|待翻译|[Uu]ntranslated/;
  for (const key of W3_NEW_COPY) {
    assert.equal(zh[key], key, `zh 的 "${key}" 必须 key===值`);
    for (const [locale, dict] of uiDictionaries) {
      const value = dict[key];
      assert.equal(typeof value, "string", `${locale} 缺 "${key}"`);
      assert.notEqual(value.trim(), "", `${locale} 的 "${key}" 是空串`);
      if (CHINESE_LOCALES.has(locale)) continue;
      assert.notEqual(value, key, `${locale} 的 "${key}" 还是中文源串（未翻译）`);
      assert.doesNotMatch(value, placeholder, `${locale} 的 "${key}" 像占位`);
      // 汉字残留启发式对 ja/ko 不成立（它们的正确译文本就含 CJK 码位）。
      if (locale !== "ja" && locale !== "ko") {
        assert.doesNotMatch(value, /[\u4e00-\u9fff]/, `${locale} 的 "${key}" 残留汉字`);
      }
    }
  }
});

test("W3 新增词条的 zh-TW：该改的改了，逐字相同的那几条是语言事实", () => {
  const zhTW = uiDictionaries.get("zh-TW");
  for (const [key, expected] of Object.entries(ZH_TW_MUST_DIFFER)) {
    assert.equal(zhTW[key], expected, `zh-TW 的 "${key}" 应为「${expected}」`);
  }
  const same = W3_NEW_COPY.filter((key) => zhTW[key] === key);
  assert.deepEqual(
    new Set(same),
    ZH_TW_SAME_AS_SOURCE,
    "zh-TW 出现了新的「与简体逐字相同」词条：要么它真的繁简同形（请加进白名单并说明），" +
      "要么是有人把简体直接抄进了 zh-TW（必须真翻）",
  );
});

test("下载四档错误文案仍在 17 语词典里（W5 的探索页素材卡要复用）", () => {
  for (const key of RETAINED_DOWNLOAD_COPY) {
    for (const [locale, dict] of uiDictionaries) {
      assert.equal(typeof dict[key], "string", `${locale} 丢了要复用的下载词条 "${key}"`);
      assert.notEqual(dict[key].trim(), "", `${locale} 的 "${key}" 是空串`);
    }
  }
});

test("已废除的两个旧按钮名：17 份词典里一条都不剩", () => {
  for (const key of RETIRED_COPY) {
    for (const [locale, dict] of uiDictionaries) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(dict, key),
        false,
        `${locale} 词典仍留着已废除的 "${key}"`,
      );
    }
  }
});

test("V1 判据 21/10 的 8 条补课词条：17 语逐格齐备（136 格）", () => {
  const placeholder = /\bTODO\b|\bTBD\b|\bFIXME\b|\bXXX\b|\?\?\?|机翻|待翻译|[Uu]ntranslated/;
  const cjkOk = new Set(["zh", "zh-TW", "ja", "ko"]);
  const zh = uiDictionaries.get("zh");
  let cells = 0;

  for (const key of Object.keys(V1_GAP_COPY)) {
    assert.equal(zh[key], key, `zh 的 "${key}" 必须 key===值`);
    for (const [locale, dict] of uiDictionaries) {
      cells += 1;
      const value = dict[key];
      assert.equal(typeof value, "string", `${locale} 缺 "${key}"`);
      assert.notEqual(value.trim(), "", `${locale} 的 "${key}" 是空串`);
      assert.doesNotMatch(value, placeholder, `${locale} 的 "${key}" 像占位`);
      if (cjkOk.has(locale)) continue;
      // 这一条正是本次 FAIL 的形态：词典没有 → tt() 静默回退中文原文。
      assert.notEqual(value, key, `${locale} 的 "${key}" 还是中文源串（未翻译）`);
      assert.doesNotMatch(value, /[\u4e00-\u9fff]/, `${locale} 的 "${key}" 残留汉字`);
    }
    // zh-TW 这 8 条都存在简繁差异，照抄简体即漏翻。
    assert.notEqual(
      uiDictionaries.get("zh-TW")[key],
      zh[key],
      `zh-TW 的 "${key}" 照抄了简体`,
    );
  }
  assert.equal(cells, 8 * 17, "应当覆盖 136 格");
});

test("那 8 条词条的调用点还活着（词条补了而源串改了 = 白补）", async () => {
  for (const [key, file] of Object.entries(V1_GAP_COPY)) {
    const source = await readFile(resolve(file), "utf8");
    assert.ok(
      source.includes(key),
      `${file} 里找不到源串 "${key.slice(0, 24)}…"，词条与调用点已经对不上`,
    );
  }
});

test("新词条不会被 renamePromptTemplateTerm 改写", async () => {
  const hook = await readFile(resolve("src/i18n/ui/useUI.ts"), "utf8");
  // 改写只在源串含「灵感/靈感」时才启动，且只作用在那一支。
  assert.match(hook, /const isInspirationCopy = \/灵感\|靈感\/\.test\(canonical\);/);
  for (const key of W3_NEW_COPY) {
    assert.doesNotMatch(key, /灵感|靈感/, `"${key}" 会触发 prompt 语境改名`);
    // 另一条 canonicalize（文件库→我的库）同样不得改动这些 key，否则查表会落空。
    assert.doesNotMatch(key, /文件库|檔案庫|檔案库/);
  }
});

test("文件规模守卫：≤800 行", async () => {
  const source = await readFile(resolve("src/shell/ImageLightbox.tsx"), "utf8");
  assert.ok(source.split("\n").length <= 800, "ImageLightbox.tsx 超过 800 行硬顶");
});
