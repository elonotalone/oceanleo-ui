// OrgAgreement（W24）：企业服务协议草稿页。
//
// 判两件事：
//   ① 导出 `ENTERPRISE_AGREEMENT_SECTIONS` 六节，标题覆盖任务书列的范围；
//   ② 渲染后六节都在，页面含版本号 `2026-09-20` 与「草稿，待操作员定稿」。
//
// 跑法（**必须带 loader**）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/org-agreement.test.mjs

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

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/org/agreement",
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
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createRoot } = await import("react-dom/client");

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const orgApiStubUrl = dataModule(`
  export const ENTERPRISE_AGREEMENT_VERSION = "2026-09-20";
`);

const agreementModule = await import(
  await compileModule("src/pages/OrgAgreement.tsx", {
    "../lib/org-api": orgApiStubUrl,
    "../i18n/ui/useUI": uiStubUrl,
  })
);
const { OrgAgreement, ENTERPRISE_AGREEMENT_SECTIONS } = agreementModule;

const REQUIRED_TITLE_BITS = [
  "服务范围与付费主体",
  "组织能看到什么",
  "数据不用于训练",
  "成员离开与组织停用",
  "发票与采购",
  "争议与终止",
];

test("ENTERPRISE_AGREEMENT_SECTIONS 六节，标题覆盖任务书范围", () => {
  assert.equal(ENTERPRISE_AGREEMENT_SECTIONS.length, 6);
  const titles = ENTERPRISE_AGREEMENT_SECTIONS.map((section) => section.title).join("\n");
  for (const bit of REQUIRED_TITLE_BITS) {
    assert.ok(titles.includes(bit), `缺节标题：${bit}`);
  }
  for (const section of ENTERPRISE_AGREEMENT_SECTIONS) {
    assert.ok(section.id, `节 ${section.title} 缺 id`);
    assert.ok(section.body && section.body.length > 40, `节 ${section.title} 正文太短`);
    assert.ok(!/第[一二三四五六七八九十0-9]+条/.test(section.body), `节 ${section.title} 写了法条编号`);
  }
});

test("页面渲染六节，含版本号与草稿标记", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(OrgAgreement));
  });
  const article = host.querySelector('[data-org-agreement="1"]');
  assert.ok(article);
  assert.equal(article.getAttribute("data-agreement-version"), "2026-09-20");
  const text = host.textContent || "";
  assert.ok(text.includes("2026-09-20"), "页上要印版本号");
  assert.ok(text.includes("草稿，待操作员定稿"));
  assert.ok(host.querySelector('[data-agreement-draft="1"]'));
  for (const section of ENTERPRISE_AGREEMENT_SECTIONS) {
    const node = host.querySelector(`[data-agreement-section="${section.id}"]`);
    assert.ok(node, `缺节 ${section.id}`);
    assert.ok((node.textContent || "").includes(section.title));
    assert.ok((node.textContent || "").includes(section.body.slice(0, 12)));
  }
  assert.equal(host.querySelectorAll("[data-agreement-section]").length, 6);
  act(() => root.unmount());
  host.remove();
});
