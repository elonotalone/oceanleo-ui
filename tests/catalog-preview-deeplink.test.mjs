// 「预览&编辑」深链的**端到端方向性**契约（合同 §0.4 / §3.1；V5 判定书 BLOCKER-3）。
//
// 为什么必须是方向性的：这条链上的每一段单独测都是绿的——
//   `workspaceTemplatePreviewHref()` 产出的 href 逐字符正确（V1 判据 12 判过 PASS）、
//   `libraryPreviewIntentFromSearch()` 解析正确、`libraryPreviewIntentAction()` 造的
//   action 也正确——但中间**没有任何人把 URL 变成一次派发**，两个 helper 只在
//   `index.ts` 里被 re-export，零调用者。于是用户点「预览&编辑」落到的是 app 操作台，
//   恰恰是操作员要防的「探索时误入重型功能」（law / threed / website 三站一致复现）。
//
// 所以本文件一律走真实方向：
//   href（W3 产出）
//     → resolveSiteCatalogRoute（认出 app，BLOCKER-1 那一层）
//     → useCatalogDeepLink（**本轮补的接线**：解析 + 派发）
//     → oceanleo:workspace-action 总线
//     → useLibraryEditIntent（W4 的消费端）
//     → onPreviewItem（库只读预览落点）
// 每一跳都用**上一跳的真实产出**当输入，中途不手写任何字面量：手写的话任何一段改了
// 形状，测试都会继续绿着骗人。

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
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

const compiled = new Map();
const inFlight = new Set();

async function compileModule(relativePath, overrides = {}) {
  const sourcePath = resolve(relativePath);
  const cached = compiled.get(sourcePath);
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
  compiled.set(sourcePath, url);
  return url;
}

// 库条目按 artifact id 取数的那一跳换成替身：本文件测的是**接线方向**，不是 HTTP。
// 替身同时记录被问过哪些 id——「派发的是不是 href 里那一份」靠它证明。
const FETCHED = [];
const ARTIFACT = {
  id: "lib-1",
  artifactId: "22a009ad-6c31-4f0e-b0d2-9e4f77a1c5bb",
  kind: "document",
  title: "离婚咨询意见书样例",
  updatedAt: "2026-07-27T00:00:00.000Z",
};
const artifactClientStub = dataModule(
  "export async function getCurrentArtifactItem(id){\n" +
    "  globalThis.__W3_FETCHED.push(id);\n" +
    "  return { ok: true, status: 200, data: { ...globalThis.__W3_ARTIFACT, artifactId: id } };\n" +
    "}\n" +
    "export async function getArtifactEditDecision(){ throw new Error('预览链路不得走 fork 判定'); }\n",
);
globalThis.__W3_FETCHED = FETCHED;
globalThis.__W3_ARTIFACT = ARTIFACT;

const OVERRIDES = { "./artifact-client": artifactClientStub };

const controllerUrl = await compileModule("src/shell/site-catalog-controller.ts", OVERRIDES);
const deeplinkUrl = await compileModule("src/shell/site-catalog-deeplink.tsx", OVERRIDES);
const intentUrl = await compileModule("src/shell/library-edit-intent.ts", OVERRIDES);
const actionsUrl = await compileModule("src/shell/workspace-actions.ts", OVERRIDES);

const { workspaceTemplatePreviewHref, resolveSiteCatalogRoute } = await import(controllerUrl);
const { useCatalogDeepLink } = await import(deeplinkUrl);
const { useLibraryEditIntent } = await import(intentUrl);
const { WORKSPACE_ACTION_EVENT } = await import(actionsUrl);

const APP = { id: "divorce-consult", name: "离婚咨询", icon: "⚖️" };
const SITE_KEY = "law";

async function withDom(url, run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url,
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
    CustomEvent: window.CustomEvent,
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

  try {
    await run({ window, root });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

/**
 * 走完整条链，返回沿途每一跳的真实产出。
 *
 * `knownAppIds` 与站点真实 catalog 同源；`stripped` 记录地址栏有没有被改写
 * ——库预览是一个**位置**，不该像 `?fill=preset` 那样被抹掉（刷新即掉回操作台）。
 */
async function runChain({ appId = APP.id, artifactId = ARTIFACT.artifactId } = {}) {
  const href = workspaceTemplatePreviewHref(appId, artifactId);
  const url = new URL(href, "https://law.oceanleo.com");
  const route = resolveSiteCatalogRoute({
    pathname: url.pathname,
    search: url.search,
    knownAppIds: new Set([APP.id, "contract-review"]),
  });

  const dispatched = [];
  const stripped = [];
  const delivered = { preview: [], editor: [], failure: [] };

  await withDom(url.toString(), async ({ window, root }) => {
    window.addEventListener(WORKSPACE_ACTION_EVENT, (event) => {
      dispatched.push(event.detail);
    });

    // ① 发送端：目录深链 hook（本轮补的接线就在这里）。
    function Sender() {
      useCatalogDeepLink({
        activeAppId: route.activeAppId,
        apps: [APP],
        siteKey: SITE_KEY,
        locationSearch: url.search,
        onDeepLinkQueryStripped: (nextSearch) => stripped.push(nextSearch),
      });
      return null;
    }
    await act(async () => root.render(React.createElement(Sender)));

    // ② 接收端：W4 的库意图 hook，喂的是**总线上真实收到的那一份 envelope**。
    const envelope = dispatched[dispatched.length - 1];
    if (envelope) {
      function Receiver() {
        useLibraryEditIntent({
          action: envelope,
          items: [],
          onOpenItem: (item) => delivered.editor.push(item),
          onPreviewItem: (item) => delivered.preview.push(item),
          onFailure: (failure) => delivered.failure.push(failure),
        });
        return null;
      }
      await act(async () => root.render(React.createElement(Receiver)));
      await act(async () => {});
    }
  });

  return { href, route, dispatched, stripped, delivered };
}

test("端到端：「预览&编辑」的 href 最终落到库只读预览，不是 app 操作台", async () => {
  FETCHED.length = 0;
  const { href, route, dispatched, delivered } = await runChain();

  // 起点：确实是那条契约形状的 href。`tab=materials` 是接口 A 的落点栏位——官方模板
  // 素材属于平台，永远不在「我的库」里，落 `mine` 得到的必然是一个空面板。
  assert.equal(
    href,
    "/workspace?tab=materials&item=22a009ad-6c31-4f0e-b0d2-9e4f77a1c5bb&mode=preview&app=divorce-consult",
  );
  // BLOCKER-1 那一层仍然成立（app 认得出来，否则整条链根本不启动）。
  assert.equal(route.activeAppId, APP.id);
  assert.equal(route.invalidAppId, "");

  // 接线存在：URL 变成了**一次真实派发**。这条就是 BLOCKER-3 的判据——
  // 修复前 helper 零调用者，这里会是 0 条。
  assert.equal(dispatched.length, 1, "「预览&编辑」深链必须派发且只派发一次");
  const [envelope] = dispatched;
  assert.match(envelope.nonce, /^catalog-preview:divorce-consult:22a009ad-/);
  assert.deepEqual(envelope.action, {
    version: 1,
    tab: "materials",
    itemId: ARTIFACT.artifactId,
    intent: "open",
  });

  // 终点：落在**只读预览**回调上，而不是编辑器回调上。
  assert.equal(delivered.preview.length, 1, "库只读预览没被打开");
  assert.equal(delivered.preview[0].artifactId, ARTIFACT.artifactId);
  assert.deepEqual(delivered.editor, [], "预览链路绝不能直接进 typed 编辑器");
  assert.deepEqual(delivered.failure, []);
  // 取的正是 href 里指名的那一份。
  assert.deepEqual(FETCHED, [ARTIFACT.artifactId]);
});

test("端到端：派发的**不是** app 操作台那几种意图", async () => {
  const { dispatched } = await runChain();
  const [envelope] = dispatched;
  // 操作台/进阶编辑器那三条深链的特征，一个都不许出现在预览链上。
  assert.notEqual(envelope.action.tab, "ops");
  assert.notEqual(envelope.action.tab, "preview");
  assert.notEqual(envelope.action.intent, "edit", "intent=edit 会直接推进重型编辑器");
  assert.equal(envelope.action.query, undefined, "预览不得夹带操作台预填");
  assert.doesNotMatch(envelope.nonce, /catalog-(advanced|template|fill)/);
});

test("库预览是一个位置，不是一次性注入：地址栏不得被抹掉", async () => {
  const { stripped } = await runChain();
  // `?fill=preset` 那种一次性意图消费后要抹掉；库预览抹掉的话，用户一刷新就掉回
  // 操作台——BLOCKER-3 等于只修了一半。
  assert.deepEqual(stripped, []);
});

test("重复渲染不得重复派发（latch 生效）", async () => {
  const dispatched = [];
  const href = workspaceTemplatePreviewHref(APP.id, ARTIFACT.artifactId);
  const url = new URL(href, "https://law.oceanleo.com");
  await withDom(url.toString(), async ({ window, root }) => {
    window.addEventListener(WORKSPACE_ACTION_EVENT, (event) => dispatched.push(event.detail));
    function Sender() {
      useCatalogDeepLink({
        activeAppId: APP.id,
        apps: [APP],
        siteKey: SITE_KEY,
        locationSearch: url.search,
        onDeepLinkQueryStripped: () => {},
      });
      return null;
    }
    for (let i = 0; i < 4; i += 1) {
      await act(async () => root.render(React.createElement(Sender, { key: "same" })));
    }
  });
  assert.equal(dispatched.length, 1, "同一条预览深链重渲染只能派发一次");
});

// ————————————————————————————————————————————————————————————————
// 缺 app 锚点这一类（V5 残余 R-3）。
//
// 背景：`?app=` 看着像可选装饰，其实**承重**——库预览面板挂在 app 操作台的右栏里
// （`OperatorConsole` → `ResultCanvas` → `MyLibrary`）；没有 app 时 `OperatorConsole`
// 渲染的是目录页，右栏整块不挂载，总线上没有任何 `useLibraryEditIntent` 在听。
//
// 本文件上一版这里只有一条「app 还没解析出来时不派发」，把**两种完全不同的情况**
// 混成了一条「预期行为」，等于用测试给静默失效上了锁（V5 判词）。现在拆开：
//   ① URL 写了锚点、此刻还没解析出来 → 加载中的一帧，安静等待，**不许告警**（否则每次
//      正常预览都刷 console）；解析出来之后要正常派发，且只派发一次。
//   ② URL 压根没有锚点             → 永远不会解析出来，这条链接结构上落不了地
//      → 不派发，但**必须出声**。
//
// 「那就照样派发」这条路被明确否决：总线上没有接收者，派出去只会变成「看起来接上了、
// 其实掉进真空」，比静默失效更难查。所以修法放在**生产侧**（不产出这种链接）+
// **消费侧告警**两端，而不是硬派发。
// ————————————————————————————————————————————————————————————————

/** 收集 console.warn，同时保证测试之间互不串味。 */
async function captureWarnings(run) {
  const warnings = [];
  const previous = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    await run();
  } finally {
    console.warn = previous;
  }
  return warnings;
}

async function dispatchWithApp(activeAppId, search, artifactId = ARTIFACT.artifactId) {
  const dispatched = [];
  const warnings = await captureWarnings(async () => {
    await withDom(`https://law.oceanleo.com/workspace${search}`, async ({ window, root }) => {
      window.addEventListener(WORKSPACE_ACTION_EVENT, (event) => dispatched.push(event.detail));
      function Sender({ appId }) {
        useCatalogDeepLink({
          activeAppId: appId,
          apps: [APP],
          siteKey: SITE_KEY,
          locationSearch: search,
          onDeepLinkQueryStripped: () => {},
        });
        return null;
      }
      // 先按「还没解析出来」渲染一帧，再按传入的 activeAppId 渲染——真实加载顺序。
      await act(async () => root.render(React.createElement(Sender, { key: "s", appId: "" })));
      await act(async () => root.render(React.createElement(Sender, { key: "s", appId: activeAppId })));
    });
  });
  return { dispatched, warnings, artifactId };
}

test("① 有 app 锚点但尚未解析：安静等待，解析后正常派发且只派发一次", async () => {
  const search = new URL(
    workspaceTemplatePreviewHref(APP.id, ARTIFACT.artifactId),
    "https://law.oceanleo.com",
  ).search;
  const { dispatched, warnings } = await dispatchWithApp(APP.id, search);

  assert.equal(dispatched.length, 1, "app 解析出来之后必须派发，且只派发一次");
  assert.equal(dispatched[0].action.itemId, ARTIFACT.artifactId);
  // 加载中的那一帧不许刷告警——否则每一次正常预览都会污染 console，
  // 真正坏掉的链接反而被淹没。
  assert.deepEqual(
    warnings.filter((line) => line.includes("catalog-deeplink")),
    [],
    "正常加载过程不得告警",
  );
});

test("② 没有 app 锚点：不派发，但必须出声（不得静默失效）", async () => {
  // 手写/历史遗留的链接：有 item 与 mode，就是没有 app。
  const search = `?tab=library&item=${ARTIFACT.artifactId}&mode=preview`;
  const { dispatched, warnings } = await dispatchWithApp("", search);

  assert.deepEqual(dispatched, [], "没有接收者，派发只会掉进真空");
  const warned = warnings.filter((line) => line.includes("[catalog-deeplink]"));
  assert.equal(warned.length, 1, "缺 app 锚点必须告警且只告一次");
  // 告警要能直接指导修复：说清缺什么、为什么落不了地、该怎么生成正确链接。
  assert.match(warned[0], /缺少 \?app= 锚点/);
  assert.match(warned[0], new RegExp(ARTIFACT.artifactId));
  assert.match(warned[0], /右栏/);
  assert.match(warned[0], /workspaceTemplatePreviewHref/);
});

test("③ 生产侧不产出注定落不了地的预览链接", async () => {
  const warnings = await captureWarnings(async () => {
    const href = workspaceTemplatePreviewHref("", "art-orphan");
    // 缺 app 时**不产出** `mode=preview`：与其给一条看着像预览、点了没反应的链接，
    // 不如退回工作台目录——用户至少落在一个正常页面上，而不是对着没反应的按钮发呆。
    assert.equal(href, "/workspace");
    assert.doesNotMatch(href, /mode=preview/);
    assert.doesNotMatch(href, /item=/);
  });
  const warned = warnings.filter((line) => line.includes("[catalog-deeplink]"));
  assert.equal(warned.length, 1, "生产侧也要出声，否则调用点永远不知道自己传空了");
  assert.match(warned[0], /workspaceTemplatePreviewHref/);
});

test("非预览深链一条都不许触发这条链", async () => {
  for (const search of [
    "?fill=preset",
    "?open=advanced",
    "?open=template&template=tpl-1",
    "?tab=library&item=art-1", // 缺 mode=preview
    "?item=art-1&mode=preview", // 缺 tab
    "?tab=ops&item=art-1&mode=preview", // tab 不是库
  ]) {
    const dispatched = [];
    await withDom(`https://law.oceanleo.com/workspace/divorce-consult${search}`, async ({ window, root }) => {
      window.addEventListener(WORKSPACE_ACTION_EVENT, (event) => {
        if (String(event.detail?.nonce || "").startsWith("catalog-preview:")) {
          dispatched.push(event.detail);
        }
      });
      function Sender() {
        useCatalogDeepLink({
          activeAppId: APP.id,
          apps: [APP],
          siteKey: SITE_KEY,
          locationSearch: search,
          onDeepLinkQueryStripped: () => {},
        });
        return null;
      }
      await act(async () => root.render(React.createElement(Sender)));
    });
    assert.deepEqual(dispatched, [], `${search} 不该被当成库预览深链`);
  }
});

// V5 的三个必选站（判定书 BLOCKER-3 里一致复现的那三个）。app id 取自各站真实
// `lib/app-catalog.ts`，不是编的：law=divorce-consult、threed=custom-model、
// website=corp-site。这条链住在共享包里、与站点无关，所以三站走同一段代码——正因如此
// 当初才会三站一起坏。这里逐站钉一遍，把「是机制不是个别站」这件事写进回归网。
const V5_SITES = [
  { siteKey: "law", appId: "divorce-consult", artifactId: "22a009ad-6c31-4f0e-b0d2-9e4f77a1c5bb" },
  { siteKey: "threed", appId: "custom-model", artifactId: "7c1e4d88-2b90-4f31-8a55-1d0c6b93ee22" },
  { siteKey: "website", appId: "corp-site", artifactId: "e93b70a4-51cc-4d27-9f88-33b1a2c47f60" },
];

test("law / threed / website 三站的「预览&编辑」都落到库只读预览", async () => {
  for (const site of V5_SITES) {
    FETCHED.length = 0;
    const href = workspaceTemplatePreviewHref(site.appId, site.artifactId);
    const url = new URL(href, `https://${site.siteKey}.oceanleo.com`);
    const route = resolveSiteCatalogRoute({
      pathname: url.pathname,
      search: url.search,
      knownAppIds: new Set([site.appId]),
    });
    assert.equal(route.activeAppId, site.appId, `${site.siteKey}: app 没认出来`);

    const dispatched = [];
    const preview = [];
    const editor = [];
    await withDom(url.toString(), async ({ window, root }) => {
      window.addEventListener(WORKSPACE_ACTION_EVENT, (event) => dispatched.push(event.detail));
      function Sender() {
        useCatalogDeepLink({
          activeAppId: route.activeAppId,
          apps: [{ id: site.appId, name: site.appId, icon: "✨" }],
          siteKey: site.siteKey,
          locationSearch: url.search,
          onDeepLinkQueryStripped: () => {},
        });
        return null;
      }
      await act(async () => root.render(React.createElement(Sender)));

      const envelope = dispatched[dispatched.length - 1];
      assert.ok(envelope, `${site.siteKey}: 没有派发任何 action`);
      function Receiver() {
        useLibraryEditIntent({
          action: envelope,
          items: [],
          onOpenItem: (item) => editor.push(item),
          onPreviewItem: (item) => preview.push(item),
          onFailure: () => {},
        });
        return null;
      }
      await act(async () => root.render(React.createElement(Receiver)));
      await act(async () => {});
    });

    assert.equal(dispatched.length, 1, `${site.siteKey}: 应当恰好派发一次`);
    assert.deepEqual(
      dispatched[0].action,
      { version: 1, tab: "materials", itemId: site.artifactId, intent: "open" },
      `${site.siteKey}: 派发的不是素材库只读预览`,
    );
    assert.equal(preview.length, 1, `${site.siteKey}: 库只读预览没被打开`);
    assert.equal(preview[0].artifactId, site.artifactId);
    assert.deepEqual(editor, [], `${site.siteKey}: 不该进 typed 编辑器`);
    assert.deepEqual(FETCHED, [site.artifactId], `${site.siteKey}: 取的不是深链指名那一份`);
  }
});

test("落点按素材归属分流：官方模板落素材库，用户自有 artifact 仍落我的库", async () => {
  // 归属写在 URL 的 `tab` 上（接口 A）：`materials` 一族 = 平台官方模板素材；
  // `library` / `mine` 一族 = 用户自己的 artifact，也是历史链接的形状，语义必须逐字不变。
  // 修法是**按归属分流**，不是把那个常量从 mine 换成 materials —— 后者会把用户自有
  // artifact 的预览也一起推进素材库，等于用一个新缺陷换掉旧缺陷。
  for (const [tab, expected] of [
    ["materials", "materials"],
    ["material", "materials"],
    ["inspiration", "materials"],
    ["library", "mine"],
    ["mine", "mine"],
    ["my_library", "mine"],
  ]) {
    const search = `?tab=${tab}&item=${ARTIFACT.artifactId}&mode=preview&app=${APP.id}`;
    const { dispatched } = await dispatchWithApp(APP.id, search);
    assert.equal(dispatched.length, 1, `tab=${tab}: 应当派发且只派发一次`);
    assert.equal(
      dispatched[0].action.tab,
      expected,
      `tab=${tab} 的落点栏位不对`,
    );
    assert.equal(dispatched[0].action.itemId, ARTIFACT.artifactId);
    assert.equal(dispatched[0].action.intent, "open");
  }
});

test("链条上没有任何一段是「导出了但没人调」", async () => {
  // 本轮第三次同型缺陷（i18n 时序 / 下载按钮 / 本条）都是这个形状，直接钉死。
  const deeplink = await readFile(resolve("src/shell/site-catalog-deeplink.tsx"), "utf8");
  assert.match(deeplink, /libraryPreviewIntentFromSearch\(/, "解析 helper 必须真的被调用");
  assert.match(deeplink, /libraryPreviewIntentAction\(/, "造 action 的 helper 必须真的被调用");
  assert.match(deeplink, /dispatchWorkspaceAction\(\{[\s\S]*?catalog-preview:/, "必须真的派发");

  // 最后一跳在 W4 的组件里：MyLibrary 必须把只读落点注册进 useLibraryEditIntent，
  // 否则 hook 会退回「列表内揭示」——官方模板素材不在「我的库」里，等于静默失败。
  const myLibrary = await readFile(resolve("src/shell/MyLibrary.tsx"), "utf8");
  assert.match(myLibrary, /useLibraryEditIntent\(\{/);
  assert.match(myLibrary, /onPreviewItem:/, "W4 的库组件必须注册 onPreviewItem 只读落点");
});
