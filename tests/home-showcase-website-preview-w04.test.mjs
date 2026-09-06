// ============================================================================
// W04 · 首页 prompt 卡片点开落到真站（裁定 A11）
// ----------------------------------------------------------------------------
// 操作员抱怨的第二条原话：「首页的 prompt 卡片打开后，没有显示真实的网站素材。」
//
// 首页那一层与探索页**不同源**（逐跳表在
// `docs/work-logs/2026-08/material-axis-and-mobile-native/signals/W04-signal.md` S2）：
// 卡片来自站点静态 app 目录，点开是 `ImageLightbox.tsx` 的 `TemplateShowcase`，
// 主预览位原本一律是 `assetPreviewUrl()` 拼出的 OSS 封面大图 —— 网站模板因此在首页
// 永远是一张图，哪怕素材库那一侧已经能看站本身。
//
// 本份守五条：
//   1. 网站类模板的主预览是 iframe 里的**站本身**，同一屏里没有封面 `<img>`；
//   2. catalog id 两条来路都要通（同步反查表 / 向 `/v1/template-materials` 问一次），
//      两条都落空就**退回封面图**，不许编一个 id 去撞端点；
//   3. 图片 / 音频 / PPT / 文档四类点开行为**逐字不变**，连目录请求都不许多发一次；
//   4. 右侧三颗按钮与缩略图切换不受影响（切回图片类模板，主预览也要跟着切回图）；
//   5. 隔离面一个字没松：frame 沙箱值仍不含 `allow-same-origin`。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import {
  invalidateTemplateMaterialCache,
  normalizeTemplateMaterial,
  templateMaterialPreviewUrl,
} from "../src/shell/material-library-template-source.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const SITE_KEY = "website";
const APP_ID = "blog";
const WEBSITE_TEMPLATE_ID = "blog-3";
const WEBSITE_ARTIFACT_ID = "5e8b6f06-2e37-4892-bc4e-a5312ff730a1";
const PREVIEW_BASE = templateMaterialPreviewUrl(WEBSITE_TEMPLATE_ID);

/** app 目录（`app-catalog.ts`）登记的模板素材：只有 `artifactId`，没有目录行 id。 */
function websiteTemplate(overrides = {}) {
  return {
    id: "tpl-website",
    title: "礼品定制资讯内容站",
    summary: "五页的内容站，含首页、关于、联系方式。",
    tags: ["资讯", "内容站"],
    previewUrl: "image/blog-3",
    artifactId: WEBSITE_ARTIFACT_ID,
    artifactType: "website",
    ...overrides,
  };
}

function imageTemplate(artifactType = "single_file_image") {
  return {
    id: `tpl-${artifactType}`,
    title: `${artifactType} 模板`,
    summary: "",
    tags: [],
    previewUrl: `image/${artifactType}-cover`,
    artifactId: `artifact-${artifactType}`,
    artifactType,
  };
}

/** 目录响应里的那一行（`GET /v1/template-materials` 的形状，与真响应同构）。 */
function catalogRow() {
  return {
    id: WEBSITE_TEMPLATE_ID,
    title: "礼品定制资讯内容站",
    summary: "",
    tags: [],
    previewUrl: "image/blog-3",
    artifactId: WEBSITE_ARTIFACT_ID,
    artifactType: "website",
    siteKey: SITE_KEY,
    appId: APP_ID,
  };
}

// ── JSDOM（`TemplateShowcase` 要 document：条件 portal + Esc 监听） ───────────

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
  url: "https://website.oceanleo.com/",
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
const linkStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export default function Link({ children, href, ...props }) {
    return React.createElement("a", { ...props, href }, children);
  }
`);
/**
 * 只把 rendition 与页面字节探针换成替身（首页这条路根本走不到它们，但 `TemplateShowcase`
 * 借用的是查看器里那份预览实现，图里带着它们）。网络一律走 `globalThis.fetch` 计数桩：
 * 「有没有多问一次目录」正是本份的判据之一。
 */
const renditionStubUrl = dataModule(`
  import { createElement } from ${JSON.stringify(reactUrl)};
  export function useArtifactRendition() {
    return { url: "", purpose: "full", rendition: null, loading: false, error: "", version: 0, retry() {}, resourceFailed() {} };
  }
  export function ArtifactRenditionFailure() { return createElement("div", null, "failure"); }
  export function withResolvedRendition(item) { return item; }
`);
const mediaProxyStubUrl = dataModule(`
  export async function fetchMediaBlob() { throw new Error("首页这条路不该取页面字节"); }
`);
const showcaseModuleUrl = await compileModule("src/shell/ImageLightbox.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "next/link": linkStubUrl,
  "./ArtifactRendition": renditionStubUrl,
  "../lib/media-proxy": mediaProxyStubUrl,
});
const { TemplateShowcase } = await import(showcaseModuleUrl);

/**
 * 网络桩：目录端点回 `items`，清单端点回 `manifest`。两串 URL 都记下来 ——
 * 「其余类型逐字不变」要靠「一次目录请求都没发」来证，不能只看屏幕。
 */
function installFetch({ items, manifest }) {
  globalThis.__catalogUrls = [];
  globalThis.__manifestUrls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/preview/manifest")) {
      globalThis.__manifestUrls.push(url);
      if (manifest === undefined) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => manifest };
    }
    globalThis.__catalogUrls.push(url);
    if (items === undefined) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ items }) };
  };
}

async function mountShowcase(props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(TemplateShowcase, {
        appId: APP_ID,
        siteKey: SITE_KEY,
        title: "内容站",
        onClose() {},
        ...props,
      }),
    );
  });
  /** 浮层 mount 之后 portal 到 body，所以断言要在整个 document 上找。 */
  const overlay = () => document.querySelector("[data-template-showcase]");
  const stage = () => document.querySelector("[data-template-showcase-preview]");
  return {
    overlay,
    stage,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("W04/H1 首页点开网站模板：主预览是那个站本身，不是封面大图", async () => {
  // 反查表先命中（用户先逛过素材库/探索页那条路）：不该为了拿 id 再问一次目录，
  // 更不该先闪一张封面图。
  invalidateTemplateMaterialCache();
  normalizeTemplateMaterial(catalogRow());
  installFetch({
    items: [catalogRow()],
    manifest: {
      templateId: WEBSITE_TEMPLATE_ID,
      pages: [
        { slug: "index", title: "首页" },
        { slug: "about", title: "关于我们" },
      ],
      pageCount: 2,
    },
  });
  const mounted = await mountShowcase({ templates: [websiteTemplate()] });
  try {
    const stage = mounted.stage();
    assert.ok(stage, "主预览位必须在");
    assert.equal(stage.getAttribute("data-preview-fit"), "site");
    const frame = stage.querySelector("iframe");
    assert.ok(frame, "首页第一次点开就要落到站本身");
    assert.equal(frame.getAttribute("src"), PREVIEW_BASE);
    assert.equal(
      stage.querySelector("img"),
      null,
      "同一屏里不许再有那张封面图",
    );
    // 隔离面一个字没松（沙箱值的单一事实源仍是 `webViewerFrameSandbox(false)`）。
    assert.equal(frame.getAttribute("sandbox").includes("allow-same-origin"), false);
    assert.equal(frame.getAttribute("referrerpolicy"), "no-referrer");
    // 反查表命中就够了，不许为了同一件事再问一次目录。
    assert.deepEqual(globalThis.__catalogUrls, []);
    // 多页就要能翻页，且界线说明与登录入口跟着一起来（与探索页同一份实现）。
    const tabs = [...stage.querySelectorAll("nav button")];
    assert.deepEqual(tabs.map((tab) => tab.textContent), ["首页", "关于我们"]);
    await act(async () => {
      tabs[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(
      stage.querySelector("iframe").getAttribute("src"),
      `${PREVIEW_BASE}/about`,
    );
    assert.match(stage.textContent, /翻页看完整个站/);
    assert.ok(stage.querySelector('a[href="/account"]'), "界线说明要给登录入口");
  } finally {
    await mounted.unmount();
  }
});

test("W04/H2 反查表是空的（首页直接开）：按 siteKey+appId 问一次目录就能落到站", async () => {
  invalidateTemplateMaterialCache();
  installFetch({
    items: [catalogRow()],
    manifest: { templateId: WEBSITE_TEMPLATE_ID, pages: [], pageCount: 1 },
  });
  const mounted = await mountShowcase({ templates: [websiteTemplate()] });
  try {
    assert.equal(globalThis.__catalogUrls.length, 1, "只问一次");
    const asked = new URL(globalThis.__catalogUrls[0]);
    assert.equal(asked.pathname, "/v1/template-materials");
    assert.equal(asked.searchParams.get("siteKey"), SITE_KEY);
    assert.equal(asked.searchParams.get("appId"), APP_ID);
    const stage = mounted.stage();
    assert.equal(
      stage.querySelector("iframe").getAttribute("src"),
      PREVIEW_BASE,
      "按 artifactId 对上目录行之后，主预览就是站本身",
    );
    assert.equal(stage.querySelector("img"), null);
    // 单页不出空页签（首页这一侧与查看器同一条判据）。
    assert.equal(stage.querySelector("nav"), null);
  } finally {
    await mounted.unmount();
  }
});

test("W04/H3 图片 / 音频 / PPT / 文档四类逐字不变：仍是封面大图，连目录都不问", async () => {
  for (const artifactType of ["single_file_image", "audio", "deck", "document"]) {
    invalidateTemplateMaterialCache();
    installFetch({ items: [catalogRow()] });
    const mounted = await mountShowcase({
      templates: [imageTemplate(artifactType)],
    });
    try {
      const stage = mounted.stage();
      assert.equal(
        stage.getAttribute("data-preview-fit"),
        "contain",
        `${artifactType}：舞台形态不许变`,
      );
      const image = stage.querySelector("img");
      assert.ok(image, `${artifactType}：主预览仍是封面大图`);
      assert.match(image.getAttribute("src"), /-cover\.webp/);
      assert.equal(
        stage.querySelector("iframe"),
        null,
        `${artifactType}：不许出现 iframe`,
      );
      assert.deepEqual(
        globalThis.__catalogUrls,
        [],
        `${artifactType}：不许为了非网站类多问一次目录`,
      );
      assert.deepEqual(globalThis.__manifestUrls, []);
    } finally {
      await mounted.unmount();
    }
  }
});

test("W04/H4 拿不到 catalog id 就退回封面图，不许编一个 id 去撞端点", async () => {
  // 目录里没有这一行（素材下架 / app 目录里的 artifactId 已经漂了）。
  invalidateTemplateMaterialCache();
  installFetch({ items: [{ ...catalogRow(), artifactId: "别人的 artifact" }] });
  const missing = await mountShowcase({ templates: [websiteTemplate()] });
  try {
    assert.equal(missing.stage().querySelector("iframe"), null);
    assert.ok(missing.stage().querySelector("img"), "退回封面大图，与今天一样");
    assert.deepEqual(globalThis.__manifestUrls, [], "没有 id 就不许问清单");
  } finally {
    await missing.unmount();
  }

  // 目录取不回来（网关 503）：也是退回封面图，不是错误态。
  invalidateTemplateMaterialCache();
  installFetch({ items: undefined });
  const offline = await mountShowcase({ templates: [websiteTemplate()] });
  try {
    assert.equal(offline.stage().querySelector("iframe"), null);
    assert.ok(offline.stage().querySelector("img"));
  } finally {
    await offline.unmount();
  }

  // 调用方没给 `siteKey`（未迁移的站）：连目录都不问，行为与这条通道上线前一致。
  invalidateTemplateMaterialCache();
  installFetch({ items: [catalogRow()] });
  const noSite = await mountShowcase({
    siteKey: "",
    templates: [websiteTemplate()],
  });
  try {
    assert.equal(noSite.stage().querySelector("iframe"), null);
    assert.ok(noSite.stage().querySelector("img"));
    assert.deepEqual(globalThis.__catalogUrls, []);
  } finally {
    await noSite.unmount();
  }
});

test("W04/H5 三颗按钮与缩略图切换不受影响：切回图片类模板，主预览跟着切回图", async () => {
  invalidateTemplateMaterialCache();
  normalizeTemplateMaterial(catalogRow());
  installFetch({
    items: [catalogRow()],
    manifest: { templateId: WEBSITE_TEMPLATE_ID, pages: [], pageCount: 1 },
  });
  const mounted = await mountShowcase({
    templates: [websiteTemplate(), imageTemplate("deck")],
    prompt: "帮我做一个礼品定制的内容站",
    fillHref: "/workspace?app=blog&fill=preset",
  });
  try {
    const overlay = mounted.overlay();
    // 「预览&编辑」仍按 artifactId 拼库预览页深链（合同 §3.1，与主预览换没换无关）。
    const preview = overlay.querySelector('[data-showcase-action="preview"]');
    assert.ok(preview);
    assert.match(preview.getAttribute("href"), new RegExp(WEBSITE_ARTIFACT_ID));
    assert.ok(overlay.querySelector('[data-showcase-action="similar"]'));
    assert.ok(overlay.querySelector('[data-showcase-action="more"]'));
    assert.ok(mounted.stage().querySelector("iframe"), "第一份是网站类");

    const thumbs = [...overlay.querySelectorAll("[data-template-thumb]")];
    assert.equal(thumbs.length, 2, "两份模板要有切换条");
    await act(async () => {
      thumbs[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    const stage = mounted.stage();
    assert.equal(
      stage.querySelector("iframe"),
      null,
      "切到 PPT 模板就不该再挂着上一份的站",
    );
    assert.ok(stage.querySelector("img"), "PPT 模板的主预览是封面大图");
    assert.match(
      overlay.querySelector('[data-showcase-action="preview"]').getAttribute("href"),
      /artifact-deck/,
      "按钮目标跟着选中项走",
    );
  } finally {
    await mounted.unmount();
  }
});
