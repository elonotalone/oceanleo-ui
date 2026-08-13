// ============================================================================
// 查看器诚实法（素材去模板化 · W3）
// ----------------------------------------------------------------------------
// 操作员报的症状：website 站打开一件素材，看到的是一屏乱码。
//
// 那一屏的来路是：货架 500 件网站素材存的都是 `website_source_zip`，而承载过去
// 只拒绝 `image/*`，别的媒体类型一律送进 iframe；判读器又只看「元素少 + 有脚本」，
// zip 被按 UTF-8 读出来是一大堆字，于是被认证成「自绘型网站」放行。
//
// 这份测试守的是一条通则，不是那一件素材：
//
//   凡是拿不到可安全显示的本体，就显示这一件为什么现在看不了 + 用户现在能做什么，
//   绝不显示原始字节。
//
// 三档各一条，外加一条「任何路径都不会把二进制渲染成文本」的横向断言。
// 隔离面不在本轮改动范围内：CSP 与 frame sandbox 一个字符都没动，最后一组守着这点。
// ============================================================================

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import {
  isDisplayableText,
  looksLikeHtmlDocument,
  websiteFrameAdmission,
  websiteViewerPlan,
} from "../src/shell/website-inline-preview.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
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
  url: "https://website.oceanleo.com/library",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  DOMParser: window.DOMParser,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── fixture：三档各自的真实形状 ──────────────────────────────────────────────

const PAGE_URL =
  "https://api.oceanleo.com/v1/artifact-renditions/access/eyJhcnRpZmFjdCI6IndlYiJ9";
const COVER_URL =
  "https://api.oceanleo.com/v1/artifact-renditions/access/public?purpose=preview";

/** 自绘型：DOM 里就有内容，直接 iframe 能看到页面。 */
const SELF_PAINTING_HTML = `<!doctype html><html><body>${Array.from(
  { length: 40 },
  (_, index) => `<section><h2>板块 ${index + 1}</h2><p>这是一段真的正文内容。</p></section>`,
).join("")}</body></html>`;

/** 脚本引导型：body 只有空容器 + 内联脚本，站点结构在内联的 site.json 里。 */
const BOOTSTRAP_SITE = {
  siteName: "礼品定制传媒",
  pages: [
    { path: "/", title: "首页", sections: [{}, {}, {}] },
    { path: "/about", title: "关于我们", sections: [{}] },
  ],
};
const SCRIPT_BOOTSTRAPPED_HTML = `<!doctype html><html><body><div id="root"></div>
<script>(function(){ var FILES = ${JSON.stringify({
  "site.json": JSON.stringify(BOOTSTRAP_SITE),
})}; window.__FILES = FILES; })();</script></body></html>`;

/**
 * 打包字节按 UTF-8 读出来的样子 —— 就是截图里那一屏。
 * 前四个字节是 zip 的 `PK\x03\x04`，其后是 local file header 与压缩流的形状。
 */
function zipBytesAsText() {
  const bytes = new Uint8Array(2048);
  bytes.set([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00], 0);
  for (let index = 10; index < bytes.length; index += 1) {
    bytes[index] = (index * 37 + 11) % 256;
  }
  return new TextDecoder("utf-8").decode(bytes);
}
const ZIP_TEXT = zipBytesAsText();

/** 二进制被摆进 DOM 的证据：NUL、C0 控制字符、成片的 U+FFFD。 */
const BINARY_IN_DOM =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/;

function websiteItem() {
  return {
    key: "artifact:web-1",
    id: "web-1",
    title: "礼品定制资讯内容站",
    kind: "website",
    siteId: "website",
    artifactType: "website",
    url: PAGE_URL,
    previewUrl: COVER_URL,
    thumbUrl: COVER_URL,
    favorite: false,
    meta: {},
  };
}

// ── 判读层：纯函数，三档 + 那一屏乱码 ───────────────────────────────────────

test("W3/1 判读三档：自绘型进 frame、脚本引导型走说明、拿不到本体走空状态", () => {
  const shapeOf = (elementCount, textLength, scriptCount) => ({
    elementCount,
    textLength,
    scriptCount,
  });

  assert.deepEqual(
    websiteViewerPlan({
      hasUrl: true,
      mediaType: "text/html; charset=utf-8",
      body: {
        status: "read",
        html: SELF_PAINTING_HTML,
        shape: shapeOf(240, 3800, 0),
      },
    }),
    { surface: "page", reason: "self-painting" },
  );

  assert.deepEqual(
    websiteViewerPlan({
      hasUrl: true,
      mediaType: "text/html",
      body: {
        status: "read",
        html: SCRIPT_BOOTSTRAPPED_HTML,
        shape: shapeOf(1, 0, 1),
      },
    }),
    { surface: "script-explainer", reason: "script-bootstrapped" },
  );

  assert.deepEqual(
    websiteViewerPlan({ hasUrl: false, body: { status: "unread" } }),
    { surface: "unavailable", reason: "no-body" },
  );
  assert.deepEqual(
    websiteViewerPlan({
      hasUrl: true,
      mediaType: "image/webp",
      body: { status: "unread" },
    }),
    { surface: "unavailable", reason: "cover-image-only" },
  );
});

test("W3/2 打包字节永远进不了 frame —— 操作员截图那一屏的两条来路都堵死", () => {
  // 来路一：rendition 自报是 zip / octet-stream，过去只要不是位图就放行。
  for (const mediaType of [
    "application/zip",
    "application/octet-stream",
    "application/json",
    "text/plain; charset=utf-8",
  ]) {
    assert.deepEqual(
      websiteViewerPlan({
        hasUrl: true,
        mediaType,
        body: { status: "unread" },
      }),
      { surface: "unavailable", reason: "opaque-bytes" },
      mediaType,
    );
  }

  // 来路二：媒体类型说自己是网页，正文却是打包字节。过去判读器会把它认成
  // 「自绘型」——因为 zip 读出来字很多，正好躲过「元素少 + 有脚本」那条判据。
  assert.deepEqual(
    websiteViewerPlan({
      hasUrl: true,
      mediaType: "text/html",
      body: {
        status: "read",
        html: ZIP_TEXT,
        shape: { elementCount: 0, textLength: ZIP_TEXT.length, scriptCount: 0 },
      },
    }),
    { surface: "unavailable", reason: "opaque-bytes" },
  );

  assert.equal(isDisplayableText(ZIP_TEXT), false);
  assert.equal(isDisplayableText("这是一段正常的中文正文，带换行。\n第二行。"), true);
  assert.equal(isDisplayableText(""), false);
  assert.equal(looksLikeHtmlDocument(ZIP_TEXT), false);
  assert.equal(looksLikeHtmlDocument('{"schema":"oceanleo.design-document.v1"}'), false);
  assert.equal(looksLikeHtmlDocument(SELF_PAINTING_HTML), true);

  // 没有 rendition 元数据的老条目不许被这条新判据误伤成「打不开」：正文读回来
  // 确实是一份网页，就照常进 frame。
  assert.equal(websiteFrameAdmission(undefined), "unknown");
  assert.deepEqual(
    websiteViewerPlan({
      hasUrl: true,
      body: {
        status: "read",
        html: SELF_PAINTING_HTML,
        shape: { elementCount: 240, textLength: 3800, scriptCount: 0 },
      },
    }),
    { surface: "page", reason: "self-painting" },
  );
});

/**
 * 编号按加入先后走，不按文件位置：W3/1–W3/6 在别处的判词里已被引用，重编会让
 * 那些引用指向别的用例。
 *
 * 缺口的原形（`V1-signals.md` S1）：`unread` 那一支曾经无视 `admission` 直接回
 * `surface: "page"`，注释写的是「媒体类型已经说了它是网页」——可 `admission` 是
 * `unknown` 时它什么都没说。触发条件是真的：判读要先把字节取回来，上限
 * `MAX_PROBE_BYTES = 8 MB`，超限或网络抖动都会抛错并落成 `unread`；一份大于 8 MB
 * 的整站包 URL 完全正常，旧判读会让 iframe 把它照常渲成一屏乱码。
 */
test("W3/7 没有媒体类型、正文又读不回来时不许赌一把", () => {
  for (const mediaType of [undefined, "", "   "]) {
    assert.deepEqual(
      websiteViewerPlan({ hasUrl: true, mediaType, body: { status: "unread" } }),
      { surface: "unavailable", reason: "unverified" },
      `mediaType=${JSON.stringify(mediaType)}：没有证据就不许放行`,
    );
  }

  // 媒体类型自己声明过是网页，那是站得住的证据：判读跑不成也照常进 frame，
  // 不因为判读器的问题就先斩后奏。
  for (const mediaType of ["text/html", "text/html; charset=utf-8"]) {
    assert.deepEqual(
      websiteViewerPlan({ hasUrl: true, mediaType, body: { status: "unread" } }),
      { surface: "page", reason: "self-painting" },
      mediaType,
    );
  }

  // 整张判读表：只有这两格进 frame，其余一格都不许。
  const surfaceOf = (mediaType, body) =>
    websiteViewerPlan({ hasUrl: true, mediaType, body }).surface;
  const readHtml = {
    status: "read",
    html: SELF_PAINTING_HTML,
    shape: { elementCount: 240, textLength: 3800, scriptCount: 0 },
  };
  const readBytes = {
    status: "read",
    html: ZIP_TEXT,
    shape: { elementCount: 0, textLength: ZIP_TEXT.length, scriptCount: 0 },
  };
  const unread = { status: "unread" };
  for (const [mediaType, body, expected] of [
    ["text/html", readHtml, "page"],
    ["text/html", readBytes, "unavailable"],
    ["text/html", unread, "page"],
    ["", readHtml, "page"],
    ["", readBytes, "unavailable"],
    ["", unread, "unavailable"],
    ["application/zip", readHtml, "unavailable"],
    ["application/zip", unread, "unavailable"],
    ["image/webp", readHtml, "unavailable"],
    ["image/webp", unread, "unavailable"],
  ]) {
    assert.equal(
      surfaceOf(mediaType, body),
      expected,
      `mediaType=${mediaType || "(空)"} body=${body.status}`,
    );
  }
});

// ── 承载层：真组件渲染，三档各看一遍 DOM ────────────────────────────────────

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStubUrl = dataModule(`
  export function useUI() { return (value) => value; }
`);
/**
 * 只把网络与 rendition 选择换成替身。判读器（`website-inline-preview`）与沙箱值
 * （`editor-sandbox-origin`）都用真件——它们正是本份测试的判据落点。
 */
const renditionStubUrl = dataModule(`
  import { createElement } from ${JSON.stringify(reactUrl)};
  export function useArtifactRendition() {
    return { ...globalThis.__rendition, retry() {}, resourceFailed() {} };
  }
  export function ArtifactRenditionFailure() { return createElement("div", null, "failure"); }
  export function withResolvedRendition(item) { return item; }
`);
const mediaProxyStubUrl = dataModule(`
  export async function fetchMediaBlob(url) {
    globalThis.__probeUrls.push(url);
    const body = globalThis.__probeBody;
    if (body === null) throw new Error("probe failed");
    return { text: async () => body };
  }
`);
const viewerModuleUrl = await compileModule(
  "src/shell/WebsiteArtifactViewer.tsx",
  {
    "../i18n/ui/useUI": uiStubUrl,
    "./ArtifactRendition": renditionStubUrl,
    "../lib/media-proxy": mediaProxyStubUrl,
  },
);
const { WebsiteArtifactViewer } = await import(viewerModuleUrl);

async function mountViewer({ rendition, body }) {
  globalThis.__rendition = {
    url: "",
    purpose: "full",
    rendition: null,
    loading: false,
    error: "",
    version: 0,
    ...rendition,
  };
  globalThis.__probeBody = body ?? null;
  globalThis.__probeUrls = [];
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(WebsiteArtifactViewer, { item: websiteItem() }));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** 每一档共用的横向判据：屏幕上不许出现任何二进制痕迹。 */
function assertNoRawBytes(container, label) {
  assert.equal(
    BINARY_IN_DOM.test(container.innerHTML),
    false,
    `${label}：DOM 里出现了二进制字符`,
  );
  assert.equal(
    container.textContent.includes(ZIP_TEXT.slice(0, 24)),
    false,
    `${label}：打包字节被当文字摆了出来`,
  );
}

test("W3/3 自绘型网站照常在受限 iframe 里渲染", async () => {
  const mounted = await mountViewer({
    rendition: { url: PAGE_URL, rendition: { mediaType: "text/html" } },
    body: SELF_PAINTING_HTML,
  });
  try {
    const frame = mounted.container.querySelector("iframe");
    assert.ok(frame, "自绘型必须真的渲染出来");
    assert.equal(frame.getAttribute("src"), PAGE_URL);
    // 隔离面一个字符没松：不含同源授权。
    assert.equal(
      frame.getAttribute("sandbox").includes("allow-same-origin"),
      false,
    );
    assert.equal(frame.getAttribute("referrerpolicy"), "no-referrer");
    assertNoRawBytes(mounted.container, "自绘型");
  } finally {
    await mounted.unmount();
  }
});

test("W3/4 脚本引导型走说明态：静态封面 + 产物性质 + 出口，不硬渲染", async () => {
  const mounted = await mountViewer({
    rendition: { url: PAGE_URL, rendition: { mediaType: "text/html" } },
    body: SCRIPT_BOOTSTRAPPED_HTML,
  });
  try {
    const text = mounted.container.textContent;
    assert.equal(
      mounted.container.querySelector("iframe"),
      null,
      "脚本引导型不硬渲染",
    );
    const cover = mounted.container.querySelector("img");
    assert.ok(cover, "有静态封面就要用上");
    assert.equal(cover.getAttribute("src"), COVER_URL);
    assert.match(text, /脚本/, "要说清这一件的性质");
    assert.match(text, /下载|编辑/, "要给出用户现在能做什么");
    // 内联 site.json 读得出的页面清单要摆出来，那是用户能拿到的真信息。
    assert.match(text, /关于我们/);
    assert.match(text, /礼品定制传媒/);
    // 说明是关于产物性质的，不是替产品的缺陷道歉。
    assert.doesNotMatch(text, /暂时|抱歉|制作得较早|敬请谅解/);
    assertNoRawBytes(mounted.container, "脚本引导型");
  } finally {
    await mounted.unmount();
  }
});

test("W3/5 拿不到可显示物走空状态：打包字节连取都不取，更不摆出来", async () => {
  const packaged = await mountViewer({
    rendition: {
      url: PAGE_URL,
      rendition: { mediaType: "application/zip" },
    },
    body: ZIP_TEXT,
  });
  try {
    assert.equal(packaged.container.querySelector("iframe"), null);
    assert.deepEqual(
      globalThis.__probeUrls,
      [],
      "自报是打包字节的 rendition 连取都不该取",
    );
    assert.match(packaged.container.textContent, /源码|构建/);
    assert.match(packaged.container.textContent, /下载|编辑/);
    assertNoRawBytes(packaged.container, "打包字节");
  } finally {
    await packaged.unmount();
  }

  // 媒体类型说自己是网页、正文却是 zip：取回来判读之后一样落到空状态。
  const mislabelled = await mountViewer({
    rendition: { url: PAGE_URL, rendition: { mediaType: "text/html" } },
    body: ZIP_TEXT,
  });
  try {
    assert.equal(mislabelled.container.querySelector("iframe"), null);
    assert.deepEqual(globalThis.__probeUrls, [PAGE_URL]);
    assertNoRawBytes(mislabelled.container, "媒体类型说谎的打包字节");
  } finally {
    await mislabelled.unmount();
  }

  // 一个 rendition 都没有：空状态 + 出口，不是白屏。
  const empty = await mountViewer({
    rendition: { url: "", error: "当前 revision 没有可用 rendition。" },
    body: null,
  });
  try {
    assert.equal(empty.container.querySelector("iframe"), null);
    assert.match(empty.container.textContent, /没有可打开的文件/);
    assert.match(empty.container.textContent, /下载|编辑/);
    assert.ok(
      empty.container.querySelector("button"),
      "空状态也要留一个重试入口",
    );
    assertNoRawBytes(empty.container, "无本体");
  } finally {
    await empty.unmount();
  }
});

// ── 横向：四份源码里不许有「把字节字符串化往 DOM 里塞」的手法 ────────────────

test("W3/6 查看器源码里没有 atob / 字符串化二进制，隔离面也没被放宽", async () => {
  const files = [
    "src/shell/WebsiteArtifactViewer.tsx",
    "src/shell/website-inline-preview.ts",
    "src/shell/library-viewers.tsx",
    "src/shell/ArtifactRendition.tsx",
  ];
  /**
   * 判的是**代码**，不是注释：这几份文件的注释里本来就要引用 `allow-same-origin`
   * 与那条网关 CSP —— 它们是判据的出处说明，删掉反而丢证据。
   */
  const codeOnly = (source) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const sources = new Map();
  for (const file of files) {
    sources.set(
      file,
      codeOnly(await readFile(new URL(`../${file}`, import.meta.url), "utf8")),
    );
  }
  for (const [file, source] of sources) {
    assert.doesNotMatch(source, /\batob\s*\(/, `${file}：不许 atob`);
    assert.doesNotMatch(
      source,
      /String\.fromCharCode/,
      `${file}：不许把字节码点拼成字符串`,
    );
    // CSP 由网关下发（`artifacts_router.py`），查看器不许自己写一份、也不许用
    // meta 覆盖掉它。注释里引用那条 CSP 是允许的，那是判据的出处说明。
    assert.doesNotMatch(
      source,
      /http-?equiv/i,
      `${file}：不许用 meta 覆盖网关下发的 CSP`,
    );
    assert.doesNotMatch(
      source,
      /allow-same-origin/,
      `${file}：沙箱授权的唯一出处是 editor-sandbox-origin`,
    );
    assert.doesNotMatch(
      source,
      /sandbox=["'{]\s*["'`]/,
      `${file}：sandbox 值不许写成字面量`,
    );
  }
  assert.match(
    sources.get("src/shell/WebsiteArtifactViewer.tsx"),
    /sandbox=\{webViewerFrameSandbox\(false\)\}/,
    "网站 frame 仍走不可信档，不含同源授权",
  );
  // 唯一一处 innerHTML 注入仍然只吃 DOMPurify 的产物。
  const viewers = sources.get("src/shell/library-viewers.tsx");
  const injections = viewers.match(/dangerouslySetInnerHTML/g) ?? [];
  assert.equal(injections.length, 1);
  assert.match(viewers, /setHtml\(DOMPurify\.sanitize\(/);
  assert.doesNotMatch(
    sources.get("src/shell/WebsiteArtifactViewer.tsx"),
    /dangerouslySetInnerHTML/,
  );
});

// ── 承载层：`unknown` + 判读失败那一格（V1-signals S1 的复现条件） ────────────

test("W3/8 老条目判读失败时走空状态，不把未知字节塞进 frame", async () => {
  // 老的非 durable 条目：`rendition` 元数据整个是空的。判读取字节抛错
  //（>8 MB 的整站包、网络抖动）——两头都没有证据，不许放行。
  for (const renditionMeta of [null, { mediaType: "" }]) {
    const mounted = await mountViewer({
      rendition: { url: PAGE_URL, rendition: renditionMeta },
      body: null,
    });
    try {
      const label = `mediaType=${renditionMeta ? "(空串)" : "(无元数据)"}`;
      assert.equal(
        mounted.container.querySelector("iframe"),
        null,
        `${label}：未知字节被塞进了 frame`,
      );
      assert.deepEqual(
        globalThis.__probeUrls,
        [PAGE_URL],
        `${label}：该取的字节还是要取，取不回来才落到空状态`,
      );
      const text = mounted.container.textContent;
      assert.match(text, /没有登记文件类型|没能读回来核对/, `${label}：要说清是哪种情况`);
      assert.match(text, /下载|编辑/, `${label}：要给出用户现在能做什么`);
      assert.doesNotMatch(text, /暂时|抱歉|制作得较早|敬请谅解/);
      assertNoRawBytes(mounted.container, label);
    } finally {
      await mounted.unmount();
    }
  }

  // 不许误伤：同样没有元数据，正文读回来确实是一份网页，就照常渲染。
  const legacyPage = await mountViewer({
    rendition: { url: PAGE_URL, rendition: null },
    body: SELF_PAINTING_HTML,
  });
  try {
    const frame = legacyPage.container.querySelector("iframe");
    assert.ok(frame, "老条目只要正文是网页就该照常打开");
    assert.equal(frame.getAttribute("src"), PAGE_URL);
    assert.equal(
      frame.getAttribute("sandbox").includes("allow-same-origin"),
      false,
    );
  } finally {
    await legacyPage.unmount();
  }
});

test("W3/9 空状态那颗「重试」对老条目也真的重跑判读", async () => {
  /**
   * 非 durable 条目拿到的 `rendition.retry` 是空动作（`ArtifactRendition.tsx:276`），
   * 而判读失败最常见的来路正是取字节这一步。查看器不自己重跑一次判读的话，
   * 这颗按钮按下去什么都不会发生 —— 那是另一种形式的不诚实。
   * 替身里的 `retry` 本来就是空动作，所以这条只能靠查看器自己重跑判读来过。
   */
  const mounted = await mountViewer({
    rendition: { url: PAGE_URL, rendition: null },
    body: null,
  });
  try {
    assert.deepEqual(globalThis.__probeUrls, [PAGE_URL]);
    const button = mounted.container.querySelector("button");
    assert.ok(button, "空状态要留一个重试入口");
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(
      globalThis.__probeUrls,
      [PAGE_URL, PAGE_URL],
      "重试没有重新取字节：这颗按钮对老条目是空的",
    );
  } finally {
    await mounted.unmount();
  }
});
