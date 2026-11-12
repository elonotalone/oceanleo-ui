import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import {
  ARTIFACT_TYPES,
  VIEW_ONLY_ARTIFACT_TYPES,
} from "../src/shell/artifact-contract.ts";
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
    previewUrl: "image/gift-media-7",
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

test("W04/1 目录源认的类型里只有网站改了落点，其余十三类逐字不变", () => {
  const kinds = new Map();
  for (const artifactType of ARTIFACT_TYPES) {
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
  assert.equal(others.length, 13, "目录源认 14 类 typed artifact");
  for (const [type, kind] of others) {
    assert.equal(
      kind,
      "image",
      `${type}：这一波只动网站这一类，别的类点开行为必须逐字不变`,
    );
  }

  /**
   * 只读浏览的那两类（`geo_map` / `interactive_doc`）在**归一化那一步**就被丢了
   * ——`templateMaterialDropReason` 只认 `ARTIFACT_TYPES`。这是本波之前就有的行为，
   * 这里把它钉住而不是顺手改：它们根本到不了落点这一层，所以「点开行为不变」对
   * 它们同样成立；哪天有人放它们进来，这条会红，提醒先想清楚落点。
   */
  for (const artifactType of VIEW_ONLY_ARTIFACT_TYPES) {
    assert.equal(
      normalizeTemplateMaterial(catalogRow(artifactType)),
      null,
      `${artifactType}：目录源今天不收这一类`,
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
    base.endsWith(`/v1/template-materials/${WEBSITE_TEMPLATE_ID}/preview/index.html`),
    true,
    base,
  );
  assert.equal(
    templateMaterialPreviewUrl(WEBSITE_TEMPLATE_ID, "about.html"),
    base.replace("index.html", "about.html"),
  );
  assert.equal(templateMaterialPreviewManifestUrl(WEBSITE_TEMPLATE_ID), base.replace("index.html", "manifest"));
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
const realClient = await compileModule("src/shell/artifact-client.ts", {
  "../lib/auth/client": dataModule(`export async function accessToken() { return null; }`),
  "../lib/auth/config": dataModule(`export const GATEWAY_BASE = "https://gateway.invalid";`),
});
const viewerModuleUrl = await compileModule(
  "src/shell/WebsiteArtifactViewer.tsx",
  {
    "../i18n/ui/useUI": uiStubUrl,
    "./ArtifactRendition": renditionStubUrl,
    "../lib/media-proxy": mediaProxyStubUrl,
    // Keep the catalog's artifact->template cache shared with the fixtures.
    "./material-library-template-source": new URL("../src/shell/material-library-template-source.ts", import.meta.url).href,
    "./artifact-client": dataModule(`export * from ${JSON.stringify(realClient)}; export async function getArtifactWebsitePreview() {
      return globalThis.__resolvedWebsitePreview || {ok:false, status:409};
    }`),
  },
);
const { WebsiteArtifactViewer, TemplateMaterialPreview, previewPages } = await import(viewerModuleUrl);

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

async function mountViewer({ item, rendition, body, manifest, resolvedPreview }) {
  globalThis.__resolvedWebsitePreview = resolvedPreview;
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
  globalThis.fetch = async (url, options) => {
    assert.equal(options.credentials, "omit");
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


test("published HTML pages render and switch with unchanged sandbox for catalog and durable cards", async () => {
  const errors = []; const original = console.error; console.error = (...args) => errors.push(args);
  try {
    for (const item of [catalogWebsiteItem(), durableWebsiteItem()]) {
      const view = await mountViewer({ item, manifest: { entrypoint: "index.html", pages: [
        {path:"news/最新.html", title:"新闻"}, {path:"index.html", title:"首页"},
      ] } });
      try {
        const frame = view.container.querySelector('iframe'); assert.ok(frame);
        assert.equal(frame.getAttribute('src'), templateMaterialPreviewUrl(WEBSITE_TEMPLATE_ID, 'index.html'));
        assert.equal(frame.getAttribute('sandbox'), 'allow-scripts allow-forms allow-popups allow-downloads');
        assert.equal(frame.getAttribute('referrerpolicy'), 'no-referrer');
        const buttons = [...view.container.querySelectorAll('nav button')];
        assert.deepEqual(buttons.map(button=>button.textContent), ['首页','新闻']);
        await act(async()=>buttons[1].click());
        assert.equal(frame.getAttribute('src'), templateMaterialPreviewUrl(WEBSITE_TEMPLATE_ID, 'news/最新.html'));
        assert.equal(buttons[1].getAttribute('aria-current'), 'page');
        await act(async()=>buttons[0].click());
        assert.equal(frame.getAttribute('src'), templateMaterialPreviewUrl(WEBSITE_TEMPLATE_ID, 'index.html'));
        assert.deepEqual(globalThis.__probeUrls, []);
      } finally { await view.unmount(); }
    }
    assert.deepEqual(errors, []);
  } finally { console.error = original; }
});

test("manifest accepts only relative HTML files and uses file names for missing titles", () => {
 const paths = ['../index.html','/index.html','a/../b.html','a//b.html','https://x/a.html','a%2fb.html','a.html?x','a\\b.html','site.json','a.html#x'];
 for (const path of paths) assert.equal(templateMaterialPreviewUrl('template', path), '', path);
 assert.deepEqual(previewPages({entrypoint:'首页.html',pages:[...paths.map(path=>({path})),{path:'about.html'},{path:'首页.html', title:'首页'},{path:'about.html'}]}),[{path:'首页.html',title:'首页'},{path:'about.html',title:'about.html'}]);
 assert.deepEqual(previewPages(null), []);
});

test("missing or single-page manifest leaves a safe entry frame without empty tabs", async () => {
 for (const manifest of [undefined, {entrypoint:'landing.html',pages:[{path:'landing.html',title:'首页'}]}]) {
  const view = await mountViewer({item:catalogWebsiteItem(),manifest});
  assert.equal(view.container.querySelector('nav'),null);
  assert.equal(view.container.querySelector('iframe').getAttribute('src'),templateMaterialPreviewUrl(WEBSITE_TEMPLATE_ID,manifest?'landing.html':'index.html'));
  await view.unmount();
 }
});

test("inline home preview resets selection when its template changes", async () => {
 const { createRoot } = await import('react-dom/client');
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 globalThis.fetch=async url=>({ok:true,json:async()=>({entrypoint:'index.html',pages:[{path:'index.html',title:'首页'},{path:String(url).includes('/first/')?'old.html':'new.html',title:'详情'}]})});
 try {
  await act(async()=>root.render(React.createElement(TemplateMaterialPreview,{templateId:'first',title:'First',layout:'inline'})));
  await act(async()=>container.querySelectorAll('button')[1].click());
  assert.match(container.querySelector('iframe').src,/old.html$/);
  await act(async()=>root.render(React.createElement(TemplateMaterialPreview,{templateId:'second',title:'Second',layout:'inline'})));
  assert.equal(container.querySelector('iframe').getAttribute('src'),templateMaterialPreviewUrl('second','index.html'));
  assert.equal(container.querySelector('[data-template-material-preview]').getAttribute('data-template-material-preview'),'inline');
 } finally {await act(async()=>root.unmount());container.remove();}
});
