// W07：举报对话框与举报接口层。
// 覆盖：请求体（原因、说明截断、拉黑只对消息/人、会话上下文）、错误归类、表单渲染与一次完整的提交流程（jsdom）。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

class StubApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
globalThis.__W07_ApiError = StubApiError;

const uiStub = dataModule("export function useUI(){ return (zh) => zh; }");
const clientStub = dataModule(`
  export const ImApiError = globalThis.__W07_ApiError;
  export async function imFetch(){ throw new Error("network is stubbed"); }
`);

const apiUrl = await compileModule("src/lib/im/reports-api.ts", { "./client": clientStub });
const api = await import(apiUrl);

const dialogUrl = await compileModule("src/shell/messages/report/ReportDialog.tsx", {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/im/client": clientStub,
});
const { ReportForm, reasonLabel, failureMessage } = await import(dialogUrl);

const html = (node) => renderToStaticMarkup(node);

test("请求体：原因、说明去空白并截断、拉黑只对消息和人", () => {
  assert.deepEqual(api.buildReportBody({ target: { kind: "message", id: "talent:m1" }, reason: "spam" }), {
    target: { kind: "message", id: "talent:m1" },
    reason: "spam",
  });
  const long = api.buildReportBody({ target: { kind: "user", id: "u1" }, reason: "fraud", note: `  ${"字".repeat(1500)}  `, alsoBlock: true, conversationId: "talent:th1" });
  assert.equal(long.note.length, api.REPORT_NOTE_LIMIT);
  assert.equal(long.also_block, true);
  assert.equal(long.conversation_id, "talent:th1");
  const conv = api.buildReportBody({ target: { kind: "conversation", id: "talent:th1" }, reason: "other", alsoBlock: true });
  assert.equal("also_block" in conv, false, "举报会话没有「同时拉黑」");
  assert.equal("note" in api.buildReportBody({ target: { kind: "user", id: "u" }, reason: "spam", note: "   " }), false);
  assert.deepEqual([...api.REPORT_REASONS], ["spam", "harassment", "fraud", "illegal", "other"]);
});

test("提交：POST /v1/im/reports，返回工单号", async () => {
  const calls = [];
  const result = await api.submitReport(
    { target: { kind: "message", id: "m1" }, reason: "harassment", note: "他骂人" },
    async (path, init) => {
      calls.push({ path, init });
      return { case_id: "case-1", blocked: false };
    },
  );
  assert.equal(result.case_id, "case-1");
  assert.equal(calls[0].path, "/v1/im/reports");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.json.reason, "harassment");
});

test("错误归类", () => {
  const E = StubApiError;
  assert.equal(api.classifyReportError(new E(429, "quota_exceeded", "")), "quota");
  assert.equal(api.classifyReportError(new E(429, "rate_limited", "")), "quota");
  assert.equal(api.classifyReportError(new E(404, "not_member", "")), "not_found");
  assert.equal(api.classifyReportError(new E(404, "not_found", "")), "not_found");
  assert.equal(api.classifyReportError(new E(422, "too_long", "")), "too_long");
  assert.equal(api.classifyReportError(new E(422, "invalid", "")), "invalid");
  assert.equal(api.classifyReportError(new E(0, "network", "")), "network");
  assert.equal(api.classifyReportError(new E(401, "unauthorized", "")), "unauthorized");
  assert.equal(api.classifyReportError(new E(500, "http_500", "")), "other");
  assert.equal(api.classifyReportError(new Error("x")), "other");
  const tt = (zh) => zh;
  const all = ["quota", "not_found", "invalid", "too_long", "network", "unauthorized", "other"].map((f) => failureMessage(tt, f));
  assert.equal(new Set(all).size, all.length, "每一类错误有各自的说明");
});

test("表单：五个原因、补充说明、同时拉黑、隐私说明；提交键在没选原因时不可点", () => {
  const out = html(React.createElement(ReportForm, { target: { kind: "message", id: "talent:m1", label: "一条消息" }, onClose() {} }));
  assert.equal((out.match(/data-report-reason=/g) || []).length, 5);
  for (const label of ["垃圾信息或广告", "骚扰、辱骂或威胁", "欺诈或诱导站外交易", "违法或侵权内容", "其他"]) assert.match(out, new RegExp(label));
  assert.match(out, /data-report-note/);
  assert.match(out, /data-report-block/);
  assert.match(out, /data-report-privacy/);
  assert.match(out, /举报这条消息/);
  assert.match(out, /一条消息/);
  assert.match(out, /data-action="submit"[^>]*disabled/);
  assert.equal(reasonLabel((zh) => zh, "fraud"), "欺诈或诱导站外交易");
});

test("表单：举报会话没有「同时拉黑」；举报人时标题不同", () => {
  const conv = html(React.createElement(ReportForm, { target: { kind: "conversation", id: "talent:th1" }, onClose() {} }));
  assert.equal(conv.includes("data-report-block"), false);
  assert.match(conv, /举报这个会话/);
  const user = html(React.createElement(ReportForm, { target: { kind: "user", id: "u1" }, onClose() {} }));
  assert.match(user, /举报这个人/);
  assert.match(user, /data-report-block/);
});

async function installDom() {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/" });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
    Element: window.Element, Node: window.Node, Event: window.Event,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  restore.push(() => {
    if (previousAct === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  });
  return { window, restore() { for (const undo of restore.reverse()) undo(); window.close(); } };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test("一次完整的举报：选原因 → 写说明 → 同时拉黑 → 提交 → 看到「平台只看被举报的内容」", async () => {
  const { window, restore } = await installDom();
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const submitted = [];
  let closed = 0;
  try {
    await act(async () => {
      root.render(
        React.createElement(ReportForm, {
          target: { kind: "message", id: "talent:m1", label: "对方的消息" },
          conversationId: "talent:th1",
          onClose: () => { closed += 1; },
          submit: async (input) => {
            submitted.push(input);
            return { case_id: "case-9", blocked: true };
          },
        }),
      );
    });
    const submitButton = () => container.querySelector('[data-action="submit"]');
    assert.equal(submitButton().disabled, true);

    await act(async () => {
      container.querySelector('[data-report-reason="fraud"]').click();
    });
    assert.equal(submitButton().disabled, false);

    const note = container.querySelector("[data-report-note]");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(note, "诱导我加微信付款");
      note.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector("[data-report-block]").click();
    });
    await act(async () => {
      submitButton().click();
    });
    await settle();

    assert.equal(submitted.length, 1);
    assert.deepEqual(submitted[0], {
      target: { kind: "message", id: "talent:m1" },
      reason: "fraud",
      note: "诱导我加微信付款",
      alsoBlock: true,
      conversationId: "talent:th1",
    });
    assert.ok(container.querySelector("[data-report-done]"), "提交后显示完成说明");
    assert.match(container.textContent, /平台只会查看被举报的这部分内容/);
    assert.ok(container.querySelector("[data-report-blocked]"), "拉黑成功要告诉用户");
    await act(async () => {
      container.querySelector('[data-action="close"]').click();
    });
    assert.equal(closed, 1);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

test("提交失败：显示对应说明、输入保留、可以再试", async () => {
  const { window, restore } = await installDom();
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  let attempts = 0;
  try {
    await act(async () => {
      root.render(
        React.createElement(ReportForm, {
          target: { kind: "user", id: "u1" },
          onClose() {},
          submit: async () => {
            attempts += 1;
            if (attempts === 1) throw new StubApiError(429, "quota_exceeded", "");
            return { case_id: "c" };
          },
        }),
      );
    });
    await act(async () => {
      container.querySelector('[data-report-reason="spam"]').click();
    });
    await act(async () => {
      container.querySelector('[data-action="submit"]').click();
    });
    await settle();
    assert.match(container.querySelector("[data-report-error]").textContent, /已达上限/);
    assert.equal(container.querySelector('[data-report-reason="spam"]').checked, true);
    await act(async () => {
      container.querySelector('[data-action="submit"]').click();
    });
    await settle();
    assert.ok(container.querySelector("[data-report-done]"));
    assert.equal(attempts, 2);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});
