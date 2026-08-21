// ============================================================================
// W04 · 卡片点开落到那个站本身（官方模板 · 匿名整站预览）
// ----------------------------------------------------------------------------
// 操作员报的症状：首页 prompt 卡片、探索页素材卡片点开之后**不是真实的网站素材**，
// 而是一张图片灯箱 —— 没法滚、没法翻页、感觉不到这是个能用的站。
//
// 那张图的来路（逐跳表见
// `docs/work-logs/2026-08/material-axis-and-mobile-native/signals/W04-journal.md`）：
// 匿名访客拿不到网站 artifact 的 `full` rendition，只拿得到 `image/webp` 的封面，
// 判读器据此判成 `cover-image-only`，承载于是画 `<img>`。前提是「匿名唯一读得到的
// 字节就是那张封面」——`W03` 的匿名整站预览端点让这条前提失效了。
//
// 本份守四条：
//   1. 目录源只把**网站**这一类改成整站查看器，其余 15 类逐字不变；
//   2. 匿名态点开网站模板，屏幕上是 iframe 里的站本身，不是 `<img>`；
//   3. 清单多页才出页签，单页不出空控件；
//   4. 登录态（拿得到可读页面 rendition）走原路，连预览端点都不请求。
//
// 隔离面不在改动范围内：frame 沙箱值仍是 `webViewerFrameSandbox(false)`，
// 最后一组守着这一点。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { MATERIAL_CATALOG_TYPES } from "../src/shell/artifact-contract.ts";
import {
  TEMPLATE_MATERIAL_PREVIEW_META_KEY,
  normalizeTemplateMaterial,
  templateMaterialEntry,
  templateMaterialIdForArtifact,
  templateMaterialLibraryItem,
  templateMaterialPreviewManifestUrl,
  templateMaterialPreviewUrl,
  invalidateTemplateMaterialCache,
} from "../src/shell/material-library-template-source.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// ── 目录行 fixture：形状照 `GET /v1/template-materials` 的真响应 ──────────────

const WEBSITE_TEMPLATE_ID = "gift-media-7";
const WEBSITE_ARTIFACT_ID = "5e8b6f06-2e37-4892-bc4e-a5312ff730a1";

function catalogRow(artifactType, overrides = {}) {
  return {
    id: `${artifactType}-row-1`,
    title: `${artifactType} 模板`,
    summary: "",
    tags: [],
    previewUrl: "image/gift-media-7.webp",
    artifactId: `artifact-${artifactType}`,
    artifactType,
    siteKey: "website",
    appId: "blog",
    ...overrides,
  };
}

function websiteRow() {
  return catalogRow("website", {
    id: WEBSITE_TEMPLATE_ID,
    title: "礼品定制资讯内容站",
    artifactId: WEBSITE_ARTIFACT_ID,
  });
}

// ── 目录源：只有网站这一类换落点 ─────────────────────────────────────────────

test("W04/1 十六类里只有网站改成整站查看器，其余十五类逐字不变", () => {
  const kinds = new Map();
  for (const artifactType of MATERIAL_CATALOG_TYPES) {
    const listing = normalizeTemplateMaterial(catalogRow(artifactType));
    assert.ok(listing, `${artifactType}：目录行必须能归一化`);
    const item = templateMaterialLibraryItem(listing);
    kinds.set(artifactType, item.kind);
    // 卡片仍然是封面位图，这条产品决定没动 —— 变的只有「点开落到哪」。
    assert.ok(item.previewUrl, `${artifactType}：卡片仍然要有封面`);
    assert.equal(
      item.thumbUrl.length > 0,
      true,
      `${artifactType}：卡片缩略图不许因为落点改了而丢`,
    );
    // 条目上的 kind 与 item 同源，别处不许再拼一份。
    assert.equal(templateMaterialEntry(listing).kind, item.kind, artifactType);
  }
  assert.equal(kinds.get("website"), "website");
  const others = [...kinds].filter(([type]) => type !== "website");
  assert.equal(others.length, 15, "目录今天呈现 16 类");
  for (const [type, kind] of others) {
    assert.equal(
      kind,
      "image",
      `${type}：这一波只动网站这一类，别的类点开行为必须逐字不变`,
    );
  }
});

test("W04/2 整站预览通道只对网站这一类出现，且键缺席就是缺席", () => {
  const website = templateMaterialLibraryItem(
    normalizeTemplateMaterial(websiteRow()),
  );
  assert.equal(
    website.meta[TEMPLATE_MATERIAL_PREVIEW_META_KEY],
    `/v1/template-materials/${WEBSITE_TEMPLATE_ID}/preview`,
  );
  for (const artifactType of ["single_file_image", "audio", "deck", "document"]) {
    const item = templateMaterialLibraryItem(
      normalizeTemplateMaterial(catalogRow(artifactType)),
    );
    // 空串会让「没有这条通道」和「通道地址算空了」混成一件事。
    assert.equal(
      TEMPLATE_MATERIAL_PREVIEW_META_KEY in item.meta,
      false,
      `${artifactType}：没有整站预览通道就整个键不出现`,
    );
  }
});

test("W04/3 预览地址按目录行 id 拼，`{template_id}` 那一段永远被编码", () => {
  const base = templateMaterialPreviewUrl(WEBSITE_TEMPLATE_ID);
  assert.match(base, /^https?:\/\//);
  assert.equal(
    base.endsWith(`/v1/template-materials/${WEBSITE_TEMPLATE_ID}/preview`),
    true,
    base,
  );
  assert.equal(
    templateMaterialPreviewUrl(WEBSITE_TEMPLATE_ID, "about"),
    `${base}/about`,
  );
  assert.equal(templateMaterialPreviewManifestUrl(WEBSITE_TEMPLATE_ID), `${base}/manifest`);
  // 这两段是唯一进 URL 的响应可控字段：不编码的话一个 `../` 就能把 iframe 的 src
  // 指到网关上的别的路径去。
  assert.equal(templateMaterialPreviewUrl("../../v1/library/items").includes("../"), false);
  assert.equal(templateMaterialPreviewUrl(WEBSITE_TEMPLATE_ID, "../download").includes("../"), false);
  // 拿不到 id 就不许编一个出来。
  assert.equal(templateMaterialPreviewUrl(""), "");
  assert.equal(templateMaterialPreviewUrl("   "), "");
});

test("W04/4 详情面把 catalog id 丢掉之后，还能按 artifactId 问回来", () => {
  // 第 6 跳（`material-detail-slot.tsx:135-230`）把目录行整件换成 durable 投影，
  // catalog `id` 与 `template_material_*` meta 全部丢失；而 `W03` 的端点恰恰按
  // catalog `id` 取内容。反查表就是这一跳的补偿。
  invalidateTemplateMaterialCache();
  assert.equal(
    templateMaterialIdForArtifact(WEBSITE_ARTIFACT_ID),
    "",
    "清过之后不许还记得，更不许凭空造一个 id",
  );
  normalizeTemplateMaterial(websiteRow());
  assert.equal(
    templateMaterialIdForArtifact(WEBSITE_ARTIFACT_ID),
    WEBSITE_TEMPLATE_ID,
  );
  assert.equal(templateMaterialIdForArtifact("没见过的 artifact"), "");
  assert.equal(templateMaterialIdForArtifact(""), "");
});

// ── 承载层：真组件渲染 ───────────────────────────────────────────────────────

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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStubUrl = dataModule(`
  export function useUI() { return (value) => value; }
`);
/**
 * 只把网络与 rendition 选择换成替身。判读器、沙箱值、目录源（连同它的反查表）
 * 都用真件 —— 它们正是本份测试的判据落点。
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

/** 自绘型整站 HTML：登录态那条路要的就是这个（判读器会放它进 frame）。 */
const SELF_PAINTING_HTML = `<!doctype html><html><body>${Array.from(
  { length: 40 },
  (_, index) => `<section><h2>板块 ${index + 1}</h2><p>这是一段真的正文内容。</p></section>`,
).join("")}</body></html>`;

const COVER_URL =
  "https://api.oceanleo.com/v1/artifact-renditions/access/public?purpose=preview";
const FULL_PAGE_URL =
  "https://api.oceanleo.com/v1/artifact-renditions/access/eyJhcnRpZmFjdCI6IndlYiJ9";

/** 第 6 跳之后详情面手里的那件东西：durable 投影，只剩 `artifactId`。 */
function durableWebsiteItem() {
  return {
    key: `artifact:${WEBSITE_ARTIFACT_ID}:rev-1`,
    source: "artifact",
    id: WEBSITE_ARTIFACT_ID,
    title: "礼品定制资讯内容站",
    kind: "website",
    siteId: "website",
    artifactId: WEBSITE_ARTIFACT_ID,
    revisionId: "rev-1",
    artifactType: "website",
    artifact: { artifactId: WEBSITE_ARTIFACT_ID, revisionId: "rev-1" },
    previewUrl: COVER_URL,
    thumbUrl: COVER_URL,
    favorite: false,
    meta: {},
  };
}

/** 目录行直接渲染（passthrough）：catalog id 还在 `meta` 里。 */
function catalogWebsiteItem() {
  return templateMaterialLibraryItem(normalizeTemplateMaterial(websiteRow()));
}

async function mountViewer({ item, rendition, body, manifest }) {
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
  globalThis.__manifestUrls = [];
  globalThis.fetch = async (url) => {
    globalThis.__manifestUrls.push(String(url));
    if (manifest === undefined) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => manifest };
  };
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(WebsiteArtifactViewer, { item }));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const PREVIEW_BASE = templateMaterialPreviewUrl(WEBSITE_TEMPLATE_ID);

test("W04/5 匿名点开网站模板：屏幕上是站本身，不是那张封面图", async () => {
  // 匿名态只拿得到封面 webp —— 操作员截图那一屏的入口条件，逐字照抄。
  normalizeTemplateMaterial(websiteRow());
  for (const [label, item] of [
    ["durable 投影（详情面的真实路径）", durableWebsiteItem()],
    ["目录行 passthrough", catalogWebsiteItem()],
  ]) {
    const mounted = await mountViewer({
      item,
      rendition: { url: COVER_URL, rendition: { mediaType: "image/webp" } },
      body: null,
      manifest: { templateId: WEBSITE_TEMPLATE_ID, pages: [], pageCount: 1 },
    });
    try {
      const frame = mounted.container.querySelector("iframe");
      assert.ok(frame, `${label}：点开必须落到站本身`);
      assert.equal(frame.getAttribute("src"), PREVIEW_BASE, label);
      assert.equal(
        mounted.container.querySelector("img"),
        null,
        `${label}：不许再退回图片灯箱`,
      );
      // 隔离面一个字符没松。
      assert.equal(
        frame.getAttribute("sandbox").includes("allow-same-origin"),
        false,
        label,
      );
      assert.equal(frame.getAttribute("referrerpolicy"), "no-referrer", label);
    } finally {
      await mounted.unmount();
    }
  }
});

test("W04/6 多页才出页签，单页不出空控件；点页签换的是 iframe 的 src", async () => {
  normalizeTemplateMaterial(websiteRow());
  const single = await mountViewer({
    item: durableWebsiteItem(),
    rendition: { url: COVER_URL, rendition: { mediaType: "image/webp" } },
    manifest: {
      templateId: WEBSITE_TEMPLATE_ID,
      pages: [{ slug: "index", title: "首页" }],
      pageCount: 1,
    },
  });
  try {
    assert.equal(
      single.container.querySelector("nav"),
      null,
      "只有一页时不许出现只有一个页签的空控件",
    );
    assert.deepEqual(globalThis.__manifestUrls, [
      templateMaterialPreviewManifestUrl(WEBSITE_TEMPLATE_ID),
    ]);
  } finally {
    await single.unmount();
  }

  const many = await mountViewer({
    item: durableWebsiteItem(),
    rendition: { url: COVER_URL, rendition: { mediaType: "image/webp" } },
    manifest: {
      templateId: WEBSITE_TEMPLATE_ID,
      pages: [
        { slug: "index", title: "首页" },
        { slug: "about", title: "关于我们" },
        { slug: "contact", title: "联系方式" },
      ],
      pageCount: 3,
    },
  });
  try {
    const nav = many.container.querySelector("nav");
    assert.ok(nav, "多页要能翻页");
    const tabs = [...nav.querySelectorAll("button")];
    assert.deepEqual(
      tabs.map((tab) => tab.textContent),
      ["首页", "关于我们", "联系方式"],
    );
    assert.equal(tabs[0].getAttribute("aria-current"), "page", "默认停在第一页");
    assert.equal(
      many.container.querySelector("iframe").getAttribute("src"),
      PREVIEW_BASE,
    );
    await act(async () => {
      tabs[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(
      many.container.querySelector("iframe").getAttribute("src"),
      `${PREVIEW_BASE}/about`,
      "点了页签就要换页",
    );
    assert.equal(
      many.container.querySelector("nav").querySelectorAll("button")[1]
        .getAttribute("aria-current"),
      "page",
    );
  } finally {
    await many.unmount();
  }

  // 清单取不回来不是错误态：整站入口照常能看，只是没有页签。
  const noManifest = await mountViewer({
    item: durableWebsiteItem(),
    rendition: { url: COVER_URL, rendition: { mediaType: "image/webp" } },
    manifest: undefined,
  });
  try {
    assert.equal(
      noManifest.container.querySelector("iframe").getAttribute("src"),
      PREVIEW_BASE,
    );
    assert.equal(noManifest.container.querySelector("nav"), null);
  } finally {
    await noManifest.unmount();
  }
});

test("W04/7 响应里的 slug 形状不合格就整条丢掉，不许拼进 iframe 的 src", async () => {
  normalizeTemplateMaterial(websiteRow());
  const mounted = await mountViewer({
    item: durableWebsiteItem(),
    rendition: { url: COVER_URL, rendition: { mediaType: "image/webp" } },
    manifest: {
      templateId: WEBSITE_TEMPLATE_ID,
      pages: [
        { slug: "index", title: "首页" },
        { slug: "../../v1/library/items", title: "越界" },
        { slug: "", title: "空的" },
        { slug: "index", title: "重复的" },
        { slug: "about", title: "" },
      ],
      pageCount: 5,
    },
  });
  try {
    const tabs = [...mounted.container.querySelectorAll("nav button")];
    // 只剩合格的两条；标题缺了就退回 slug，不出现空页签。
    assert.deepEqual(tabs.map((tab) => tab.textContent), ["首页", "about"]);
    await act(async () => {
      tabs[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    const src = mounted.container.querySelector("iframe").getAttribute("src");
    assert.equal(src, `${PREVIEW_BASE}/about`);
    assert.equal(src.includes("../"), false);
  } finally {
    await mounted.unmount();
  }
});

test("W04/8 界线说明是内容下面的一行常驻文字，不是弹窗、也不遮内容", async () => {
  normalizeTemplateMaterial(websiteRow());
  const mounted = await mountViewer({
    item: durableWebsiteItem(),
    rendition: { url: COVER_URL, rendition: { mediaType: "image/webp" } },
    manifest: { templateId: WEBSITE_TEMPLATE_ID, pages: [], pageCount: 1 },
  });
  try {
    const text = mounted.container.textContent;
    assert.match(text, /翻页看完整个站/, "先说清能看什么");
    assert.match(text, /下载源码|复制到工作台/, "再说清什么要登录");
    const signIn = mounted.container.querySelector('a[href="/account"]');
    assert.ok(signIn, "要给登录入口");
    assert.match(signIn.textContent, /登录/);
    // 不弹窗、不遮内容：既没有对话框角色，也没有覆盖层定位。
    assert.equal(mounted.container.querySelector('[role="dialog"]'), null);
    assert.equal(/\b(fixed|absolute)\b/.test(mounted.container.innerHTML), false);
    // 说明排在 frame 之后，所以它在内容下面而不是压在内容上。
    const frame = mounted.container.querySelector("iframe");
    assert.equal(
      frame.compareDocumentPosition(signIn) & window.Node.DOCUMENT_POSITION_FOLLOWING,
      window.Node.DOCUMENT_POSITION_FOLLOWING,
    );
    assert.doesNotMatch(text, /暂时|抱歉|敬请谅解/);
  } finally {
    await mounted.unmount();
  }
});

test("W04/9 登录态不退化：拿得到可读页面 rendition 就走原路，预览端点连问都不问", async () => {
  normalizeTemplateMaterial(websiteRow());
  const mounted = await mountViewer({
    item: durableWebsiteItem(),
    rendition: { url: FULL_PAGE_URL, rendition: { mediaType: "text/html" } },
    body: SELF_PAINTING_HTML,
    manifest: { templateId: WEBSITE_TEMPLATE_ID, pages: [], pageCount: 1 },
  });
  try {
    const frame = mounted.container.querySelector("iframe");
    assert.equal(frame.getAttribute("src"), FULL_PAGE_URL, "登录态仍走 full");
    assert.deepEqual(globalThis.__probeUrls, [FULL_PAGE_URL]);
    assert.deepEqual(
      globalThis.__manifestUrls,
      [],
      "原路上不该多出一次预览端点请求",
    );
    assert.equal(mounted.container.querySelector('a[href="/account"]'), null);
  } finally {
    await mounted.unmount();
  }
});

test("W04/10 不是官方模板、或反查不到 catalog id 时不许瞎回退", async () => {
  invalidateTemplateMaterialCache();
  // 反查表里没有这一件（比如详情是深链直开的，目录从没在本次会话里取过）：
  // 端点按 catalog id 取内容，编一个 id 去撞只会拿到 404 或者别人的站。
  const unknown = await mountViewer({
    item: durableWebsiteItem(),
    rendition: { url: COVER_URL, rendition: { mediaType: "image/webp" } },
  });
  try {
    assert.equal(unknown.container.querySelector("iframe"), null);
    assert.deepEqual(globalThis.__manifestUrls, []);
    assert.ok(unknown.container.querySelector("img"), "退回原来的封面说明态");
  } finally {
    await unknown.unmount();
  }

  // 非网站类的 durable 条目根本不该进这条分支。
  const audio = await mountViewer({
    item: { ...durableWebsiteItem(), artifactType: "audio", kind: "audio" },
    rendition: { url: COVER_URL, rendition: { mediaType: "image/webp" } },
  });
  try {
    assert.equal(audio.container.querySelector("iframe"), null);
    assert.deepEqual(globalThis.__manifestUrls, []);
  } finally {
    await audio.unmount();
  }
});
