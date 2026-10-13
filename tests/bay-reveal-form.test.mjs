// 安全矩阵：不适用（填写页常开表单，无不可信注入）
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://video.oceanleo.com/bay",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLSelectElement: window.HTMLSelectElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  FocusEvent: window.FocusEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const { BayRevealForm } = await import(
  await compileModule("src/shell/bay/form/BayRevealForm.tsx", {
    "../../../i18n/ui/useUI": uiStub,
  }),
);
const h = React.createElement;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function fixture(overrides = {}) {
  return [
    {
      id: "title",
      label: "名称",
      done: false,
      children: h("input", { "data-field": "title" }),
      ...overrides.title,
    },
    {
      id: "body",
      label: "简介",
      done: false,
      children: h("textarea", { "data-field": "body" }),
      ...overrides.body,
    },
    {
      id: "kind",
      label: "类目",
      done: false,
      children: h("select", { "data-field": "kind" }, h("option", { value: "a" }, "A")),
      ...overrides.kind,
    },
  ];
}

async function mountForm(props) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(h(BayRevealForm, props));
  });
  await flush();
  return {
    host,
    async rerender(next) {
      await act(async () => {
        root.render(h(BayRevealForm, typeof next.length === "number" ? { items: next } : next));
      });
      await flush();
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function mount(items) {
  return mountForm({ items });
}

test("每一行都开着，输入框随时能改，没有填写/修改", async () => {
  const { host, unmount } = await mount(fixture());
  const rows = host.querySelectorAll("[data-bay-reveal-item]");
  assert.equal(rows.length, 3);
  assert.equal(host.querySelectorAll("[data-bay-reveal-open]").length, 3);
  assert.ok(host.querySelector('[data-field="title"]'));
  assert.ok(host.querySelector('[data-field="body"]'));
  assert.ok(host.querySelector('[data-field="kind"]'));
  assert.equal(host.textContent.includes("名称"), true);
  assert.equal(host.textContent.includes("简介"), true);
  assert.equal(host.textContent.includes("类目"), true);
  assert.equal(host.querySelector("[data-bay-reveal-action]"), null);
  assert.equal(host.textContent.includes("填写"), false);
  assert.equal(host.textContent.includes("修改"), false);
  assert.equal(host.textContent.includes("未填"), false);
  await unmount();
});

test("填过的行也仍开着，看得见输入框", async () => {
  const { host, unmount } = await mount(
    fixture({
      title: { done: true, summary: "Hello" },
      body: { done: true, summary: "Hi" },
      kind: { done: true, summary: "A" },
    }),
  );
  assert.equal(host.querySelectorAll("[data-bay-reveal-open]").length, 3);
  assert.ok(host.querySelector('[data-field="title"]'));
  assert.ok(host.querySelector('[data-field="body"]'));
  await unmount();
});

test("alwaysOpen 只作标记，所有行都开着", async () => {
  const { host, unmount } = await mount([
    {
      id: "cover",
      label: "作品图",
      done: false,
      alwaysOpen: true,
      children: h("div", { "data-field": "cover" }),
    },
    {
      id: "title",
      label: "名称",
      done: false,
      children: h("input", { "data-field": "title" }),
    },
  ]);
  assert.ok(host.querySelector('[data-bay-reveal-item="cover"][data-bay-reveal-pinned][data-bay-reveal-open]'));
  assert.ok(host.querySelector('[data-bay-reveal-item="title"][data-bay-reveal-open] [data-field="title"]'));
  assert.equal(host.querySelectorAll("[data-bay-reveal-open]").length, 2);
  await unmount();
});

test("groups 每组的字段都开着，组标签看得见", async () => {
  const { host, unmount } = await mountForm({
    groups: [
      {
        id: "product",
        label: "产品信息",
        items: [
          { id: "title", label: "标题", done: false, children: h("input", { "data-field": "title" }) },
          { id: "cover", label: "封面", done: false, children: h("div", { "data-field": "cover" }) },
        ],
      },
      {
        id: "price",
        label: "价格",
        items: [{ id: "price", label: "价格", done: false, children: h("input", { "data-field": "price" }) }],
      },
    ],
  });
  assert.equal(host.querySelectorAll("[data-bay-section]").length, 2);
  assert.ok(host.querySelector('[data-bay-section="product"][data-bay-reveal]'));
  assert.equal(host.textContent.includes("产品信息"), true);
  assert.equal(host.textContent.includes("封面"), true);
  assert.equal(host.textContent.includes("价格"), true);
  assert.equal(host.querySelectorAll("[data-bay-reveal-open]").length, 3);
  assert.ok(host.querySelector("[data-bay-section='price'] [data-bay-reveal-open] [data-field='price']"));
  await unmount();
});

test("collapsedByDefault 的组进页时收着，点标题才展开", async () => {
  const { host, unmount } = await mountForm({
    groups: [
      {
        id: "product",
        label: "产品信息",
        items: [{ id: "title", label: "标题", done: false, children: h("input", { "data-field": "title" }) }],
      },
      {
        id: "terms",
        label: "交付条款",
        collapsedByDefault: true,
        items: [{ id: "days", label: "交付天数", done: false, children: h("input", { "data-field": "days" }) }],
      },
    ],
  });
  const terms = host.querySelector('[data-bay-section="terms"]');
  assert.equal(terms.getAttribute("data-bay-section-collapsed"), "");
  assert.equal(terms.querySelector("[data-bay-section-toggle]").getAttribute("aria-expanded"), "false");
  assert.equal(terms.querySelector("[data-field='days']").closest("[hidden]") != null, true);
  await act(async () => {
    terms.querySelector("[data-bay-section-toggle]").click();
  });
  await flush();
  assert.equal(host.querySelector('[data-bay-section="terms"]').getAttribute("data-bay-section-collapsed"), null);
  assert.equal(host.querySelector("[data-bay-section-toggle]").getAttribute("aria-expanded"), "true");
  await unmount();
});

test("收着时按钮文本含展开，没有三角", async () => {
  const { host, unmount } = await mountForm({
    groups: [
      {
        id: "terms",
        label: "交付条款",
        collapsedByDefault: true,
        items: [{ id: "days", label: "交付天数", done: false, children: h("input", { "data-field": "days" }) }],
      },
    ],
  });
  const toggle = host.querySelector("[data-bay-section-toggle]");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.textContent.includes("展开"), true);
  assert.equal(toggle.textContent.includes("▸"), false);
  assert.equal(toggle.textContent.includes("▾"), false);
  await unmount();
});

test("缺项高亮时 collapsedByDefault 的组也打开", async () => {
  const { host, unmount } = await mountForm({
    groups: [
      {
        id: "terms",
        label: "交付条款",
        collapsedByDefault: true,
        highlight: true,
        missing: ["交付天数"],
        items: [{ id: "days", label: "交付天数", done: false, children: h("input", { "data-field": "days" }) }],
      },
    ],
  });
  assert.equal(host.querySelector('[data-bay-section="terms"]').getAttribute("data-bay-section-collapsed"), null);
  assert.equal(host.querySelector("[data-bay-section-toggle]").getAttribute("aria-expanded"), "true");
  await unmount();
});

test("间距三档、组标题是黑色加粗标题，项之间不画线", async () => {
  const { host, unmount } = await mountForm({
    groups: [
      { id: "product", label: "产品信息", items: fixture() },
      { id: "price", label: "价格", items: [{ id: "price", label: "价格", done: false, children: h("input", {}) }] },
    ],
  });
  const form = host.querySelector("[data-bay-reveal-form]");
  assert.match(form.className, /\bspace-y-12\b/, "组与组 48px");
  const heading = host.querySelector("[data-bay-section='product'] [data-bay-section-title]");
  assert.equal(heading.tagName, "H3");
  assert.equal(heading.textContent, "产品信息");
  assert.match(heading.className, /text-\[15px\]/);
  assert.match(heading.className, /font-semibold/);
  assert.match(heading.className, /text-neutral-900/);
  assert.match(heading.nextElementSibling.className, /\bgap-6\b/, "项与项 24px");
  assert.equal(host.querySelector("[data-bay-reveal-open] > div").className, "mt-2", "标签到自己的控件 8px");
  assert.equal(host.innerHTML.includes("divide-y"), false);
  assert.equal(host.innerHTML.includes("text-neutral-400"), false, "要读的字不用浅灰");
  await unmount();
});
