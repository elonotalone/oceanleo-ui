import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://video.oceanleo.com/bay", pretendToBeVisual: true });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  localStorage: dom.window.localStorage,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const store = await import(await compileModule("src/shell/bay/form/post-templates.ts"));
const { DIGITAL_MATERIAL_KINDS, DIGITAL_MATERIAL_LABEL } = store;
const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const previewStubs = {
  "../../../i18n/ui/useUI": uiStub,
  "./BayTypedPreview": dataModule(`export function BayTypedPreview(){ return null; }`),
  "../../artifact-client": dataModule(`export async function getCurrentArtifactItem(){ return { ok: false }; }`),
  "../../library-viewers": dataModule(`export function LibraryItemViewer(){ return null; }`),
  "../../../lib/database": dataModule(`export async function uploadFile(){ return { ok: true, data: { file: { url: "https://cdn.example/a.png" } } }; }`),
};
const { BayPublishShell } = await import(await compileModule("src/shell/bay/form/BayPublishShell.tsx", previewStubs));
const { BayListingPreview } = await import(await compileModule("src/shell/bay/form/BayListingPreview.tsx", previewStubs));

test("每种发布都有预制模板，保存和删除只动本机列表", () => {
  const { builtinTemplates, saveTemplateFromSnapshot, loadSavedTemplates, deleteSavedTemplate, POST_TEMPLATE_STORAGE_KEY } = store;
  window.localStorage.removeItem(POST_TEMPLATE_STORAGE_KEY);
  for (const kind of ["digital", "service", "consult", "app", "lesson", "need"]) {
    const rows = builtinTemplates(kind);
    assert.ok(rows.length >= 2, `${kind} 预制太少`);
    assert.equal(rows.every((row) => row.kind === kind), true);
  }
  const saved = saveTemplateFromSnapshot({ kind: "service", title: "我的剪辑", description: "三天交片", priceFen: 9900, billing: "delivery" });
  assert.equal(loadSavedTemplates("service").length, 1);
  assert.equal(loadSavedTemplates("digital").length, 0);
  assert.equal(loadSavedTemplates("service")[0].title, "我的剪辑");
  deleteSavedTemplate(saved.id);
  assert.equal(loadSavedTemplates("service").length, 0);
});

test("数字商品：每种素材类型一套模板，封面是 https 图，不把官方成品当成要卖的作品", () => {
  const { builtinTemplates } = store;
  const rows = builtinTemplates("digital");
  assert.equal(rows.length, DIGITAL_MATERIAL_KINDS.length);
  const seen = new Set();
  for (const kind of DIGITAL_MATERIAL_KINDS) {
    const row = rows.find((item) => item.id === `preset:digital:${kind}`);
    assert.ok(row, `${kind} 缺模板`);
    assert.equal(row.materialKind, kind);
    assert.equal(row.kind, "digital");
    assert.ok(row.title.trim());
    assert.ok(row.description.trim());
    assert.ok(DIGITAL_MATERIAL_LABEL[kind]);
    assert.match(row.coverUrl, /^https:\/\//);
    assert.equal(row.coverUrls.length, 1);
    assert.equal(row.coverUrls[0], row.coverUrl);
    assert.match(row.sampleArtifactId, /^[0-9a-f-]{36}$/i);
    assert.equal(row.previewArtifactId, undefined);
    assert.ok(!seen.has(row.title), `标题重复：${row.title}`);
    seen.add(row.title);
  }
});

test("右侧栏点模板能套进表单，点我的post显示能保存", async () => {
  window.localStorage.removeItem(store.POST_TEMPLATE_STORAGE_KEY);
  const applied = [];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        BayPublishShell,
        {
          kind: "service",
          snapshot: { kind: "service", title: "当前草稿", description: "自己写的", priceFen: 1200, billing: "delivery" },
          onApply: (snap) => applied.push(snap.title),
        },
        React.createElement("p", { "data-form": "" }, "form"),
      ),
    );
  });
  try {
  const rail = document.querySelector("[data-bay-post-rail]");
  assert.ok(rail);
  assert.equal(rail.parentElement, document.body, "胶囊必须挂在 body，不能塞进表单列");
  assert.equal(host.contains(rail), false);
  assert.equal(rail.style.width, "56px");
  assert.equal(rail.style.position, "fixed");
  assert.ok(!rail.style.height || rail.style.height === "auto");
  assert.equal(rail.style.top, "50%");
  assert.equal(rail.style.bottom, "");
  assert.equal(rail.style.right, "16px");
  assert.ok(document.querySelector('[data-bay-rail="templates"]'));
  assert.ok(document.querySelector('[data-bay-rail="mine"]'));
  await act(async () => document.querySelector('[data-bay-rail="templates"]').click());
  const panel = document.querySelector("[data-bay-preview-panel]");
  const dock = document.querySelector('[data-bay-preview-dock="templates"]');
  assert.ok(dock);
  assert.ok(panel);
  assert.equal(dock.parentElement, document.body);
  assert.equal(host.contains(panel), false);
  assert.equal(panel.style.position, "fixed");
  assert.equal(panel.style.left, "50%");
  assert.equal(panel.style.top, "50%");
  assert.equal(panel.style.width, "1240px");
  assert.equal(panel.getAttribute("data-bay-preview-device"), "desktop");
  assert.ok(document.querySelector('[data-bay-device-frame="desktop"]'));
  await act(async () => document.querySelector('[data-bay-preview-device-btn="phone"]').click());
  assert.equal(document.querySelector("[data-bay-preview-panel]").getAttribute("data-bay-preview-device"), "phone");
  assert.ok(document.querySelector('[data-bay-device-frame="phone"]'));
  await act(async () => document.querySelector('[data-bay-preview-device-btn="desktop"]').click());
  assert.match(document.body.textContent, /预制模板/);
  await act(async () => document.querySelector("[data-bay-template-apply]").click());
  assert.equal(applied.length, 1);
  assert.ok(applied[0]);
  await act(async () => document.querySelector('[data-bay-rail="mine"]').click());
  assert.ok(document.querySelector('[data-bay-preview-dock="mine"]'));
  assert.match(document.body.textContent, /当前草稿/);
  await act(async () => document.querySelector("[data-bay-template-save]").click());
  assert.equal(store.loadSavedTemplates("service").some((row) => row.title === "当前草稿"), true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
  assert.equal(document.querySelector("[data-bay-post-rail]"), null);
});

test("数字商品模板抽屉：每种素材都有卡片和封面图", async () => {
  const applied = [];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        BayPublishShell,
        {
          kind: "digital",
          snapshot: { kind: "digital", title: "", priceFen: 0 },
          onApply: (snap) => applied.push(snap),
        },
        React.createElement("p", { "data-form": "" }, "form"),
      ),
    );
  });
  try {
  await act(async () => document.querySelector('[data-bay-rail="templates"]').click());
  for (const kind of DIGITAL_MATERIAL_KINDS) {
    const card = document.querySelector(`[data-bay-template-kind="${kind}"]`);
    assert.ok(card, `${kind} 卡片没有出来`);
    assert.match(card.textContent, new RegExp(DIGITAL_MATERIAL_LABEL[kind]));
  }
  await act(async () => document.querySelector('[data-bay-template="preset:digital:ppt"]').click());
  const ppt = store.builtinTemplates("digital").find((row) => row.materialKind === "ppt");
  assert.ok(ppt?.sampleArtifactId);
  assert.equal(document.querySelector("[data-bay-listing-artifact]")?.getAttribute("data-bay-listing-artifact"), ppt.sampleArtifactId);
  assert.ok(document.querySelector('[data-bay-preview-device-btn="phone"]'));
  assert.ok(document.querySelector('[data-bay-preview-device-btn="desktop"]'));
  assert.ok(document.querySelector('[data-bay-device-frame="desktop"]'));
  await act(async () => document.querySelector("[data-bay-template-apply]").click());
  assert.equal(applied.length, 1);
  assert.equal(applied[0].materialKind, "ppt");
  assert.equal(applied[0].title, "商业计划书 PPT");
  assert.match(applied[0].coverUrl, /^https:\/\//);
  assert.match(applied[0].sampleArtifactId, /^[0-9a-f-]{36}$/i);
  assert.equal(applied[0].previewArtifactId, undefined);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test("素材预览：不画授权罐头句，没有条款就不画空列表", () => {
  const out = renderToStaticMarkup(
    React.createElement(BayListingPreview, {
      snapshot: { kind: "digital", title: "一套图标", priceFen: 900, license: "commercial" },
    }),
  );
  assert.match(out, /付款后立即交付/);
  assert.doesNotMatch(out, /授权范围/);
  assert.doesNotMatch(out, /可商用/);
  assert.doesNotMatch(out, /个人使用/);
  assert.doesNotMatch(out, /不得转售原文件/);
  assert.doesNotMatch(out, /已交付的数字商品不退款/);
  assert.doesNotMatch(out, /data-bay-custom-terms/);
  assert.doesNotMatch(out, /data-bay-deadline/);
});

test("素材预览：自定义条款原样出现，截止日期写成日期截止", () => {
  const out = renderToStaticMarkup(
    React.createElement(BayListingPreview, {
      snapshot: {
        kind: "digital",
        title: "一套图标",
        priceFen: 900,
        customTerms: "只给甲方用",
        deadlineLabel: "2026-12-01",
      },
    }),
  );
  assert.match(out, /data-bay-custom-terms/);
  assert.match(out, /只给甲方用/);
  assert.match(out, /data-bay-deadline/);
  assert.match(out, /2026-12-01 23:59:59 UTC\S* 截止/);
  assert.doesNotMatch(out, /可商用/);
});

test("服务预览：按天数写交付，有条款才画，不画授权罐头句", () => {
  const out = renderToStaticMarkup(
    React.createElement(BayListingPreview, {
      snapshot: {
        kind: "service",
        title: "品牌设计",
        deliveryDays: 5,
        customTerms: "含三次改稿",
        deadlineLabel: "两周内",
      },
    }),
  );
  assert.match(out, /5 天交付/);
  assert.match(out, /含三次改稿/);
  assert.match(out, /两周内/);
  assert.doesNotMatch(out, /付款后立即交付/);
  assert.doesNotMatch(out, /不得转售原文件/);
  assert.doesNotMatch(out, /个人使用/);
});
