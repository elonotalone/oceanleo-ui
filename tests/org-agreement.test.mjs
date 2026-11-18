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
  "团队能看到什么",
  "数据不用于训练",
  "成员离开与团队解散",
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

test("「团队能看到什么」只写现行规则：只看花费与上限，不看任务、对话和文件", async () => {
  const visibility = ENTERPRISE_AGREEMENT_SECTIONS.find((section) => section.id === "visibility");
  assert.ok(visibility);
  for (const bit of ["花了多少钱", "按天", "按模型", "上限", "看不到任务标题", "和 AI 的对话", "文件", "项目", "团队库"]) {
    assert.ok(visibility.body.includes(bit), `缺：${bit}`);
  }
  // The agreement page is Chinese only (no tt / dictionary); scan every section and the rendered page.
  const all = ENTERPRISE_AGREEMENT_SECTIONS.map((section) => `${section.title}\n${section.body}`).join("\n");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(OrgAgreement));
  });
  for (const text of [all, host.textContent || ""]) {
    for (const retired of ["打开全部内容", "被明确授予查看权限", "每一次查看都会留下记录", "谁看过我", "团队的任务列表"]) {
      assert.ok(!text.includes(retired), `仍含旧规则：${retired}`);
    }
  }
  act(() => root.unmount());
  host.remove();
});

test("「成员离开与团队解散时，数据归谁」只写代码真正做的事", () => {
  const section = ENTERPRISE_AGREEMENT_SECTIONS.find((item) => item.id === "departure-and-offboard");
  assert.ok(section);
  for (const bit of [
    "退出或被移出", "仍是他自己的", "团队本来就看不到", "仍留在团队库里", "个人库里，不会被删除", "仍记在团队的账单和花费统计里",
    "输入团队名", "全部余额退回负责人的个人钱包", "所有成员（包括负责人）都被移出", "邀请链接", "加入申请作废", "充值单取消",
    "生成任务没结束时不能解散", "最多约 2 小时", "币种不同", "账单和充值记录保留", "条目转入负责人的个人库", "署名不变", "成员个人库里的副本不受影响",
  ]) {
    assert.ok(section.body.includes(bit), `缺：${bit}`);
  }
  // Retired claims: team-paid tasks belonged to the team; on closing the team wallet was archived or deleted.
  for (const retired of ["用团队钱包完成的任务与已发布到团队库的成果仍留在团队里", "归档或删除", "团队任务", "停用", "条目留在已解散的团队里"]) {
    assert.ok(!`${section.title}${section.body}`.includes(retired), `仍含旧说法：${retired}`);
  }
});


test("争议与终止保持操作员尚未批准修改的原文", () => {
  assert.equal(ENTERPRISE_AGREEMENT_SECTIONS.find((item) => item.id === "dispute-and-termination").body,
    "对某笔扣费有疑问，团队负责人可以在账单与用量里核对，并在合理期限内提出复核。任何一方可以终止企业服务：你这边停用团队或不再续费即可；我们这边若发现滥用、违法或长期欠费，也可以暂停或关闭该团队。终止后，未用完的团队余额按当时公示的退款规则处理，已消耗的模型调用不退。");
});
