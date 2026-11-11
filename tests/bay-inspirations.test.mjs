import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  insertInspirationPrompt,
  fillInspirationWhenReady,
} from "../src/shell/inspirations/inspiration-fill.ts";
import {
  inspirationUrl,
  fetchInspirations,
} from "../src/shell/inspirations/inspiration-api.ts";

// Code-only DOM checks: no browser, remote preview, capture or real API calls.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const h = React.createElement;
const ui = dataModule("const tt=s=>s; export function useUI(){return tt}");
const scope = dataModule("export function useInspirationContext(){return globalThis.__bayInspirationTest.scope}");
const focus = dataModule("export function useConsoleAgentFocus(){return globalThis.__bayInspirationTest.focus}");
const gateway = dataModule('export function gatewayBase(){return "http://fixture.local"}');
const panelUrl = await compileModule("src/shell/inspirations/InspirationPanel.tsx", {
  "../../i18n/ui/useUI": ui,
  "../../lib/auth/config": gateway,
  "../SplitWorkspace": focus,
  "./inspiration-context": scope,
});
const { InspirationPanel } = await import(panelUrl);
const { WorkspaceHome } = await import(await compileModule("src/shell/result-canvas-home.tsx", {
  "../i18n/ui/useUI": ui,
  "../lib/im/client": dataModule("export function useImEnabled(){return false}"),
  "./messages/realtime/hooks": dataModule("export function useImUnread(){return null}"),
  "./bay/shell/bay-icons": dataModule("export function BayIcon(){return null}"),
  "./inspirations/inspiration-context": scope,
  "./inspirations/InspirationPanel": panelUrl,
  "./workspace-session-context": dataModule("export function useOptionalWorkspaceSession(){return null}"),
}));
const { BayInspirations } = await import(await compileModule("src/shell/bay/BayInspirations.tsx", {
  "../../i18n/ui/useUI": ui,
  "../../lib/auth/config": gateway,
  "../inspirations/InspirationPanel": panelUrl,
}));

function composerFixture() {
  const split = document.createElement("div");
  split.setAttribute("data-workspace-split", "");
  split.innerHTML = '<div data-workspace-pane="left"><div data-oceanleo-leo-entry-root><div data-oc-slot-editor contenteditable="true"></div></div></div><div data-workspace-pane="main"><div data-oceanleo-leo-entry-root><div data-oc-slot-editor contenteditable="true"></div></div></div>';
  const left = split.querySelector('[data-workspace-pane="left"]');
  const composer = left.querySelector("[data-oceanleo-leo-entry-root]");
  const input = composer.querySelector("[data-oc-slot-editor]");
  const right = split.querySelector('[data-workspace-pane="main"]');
  const rightComposer = right.querySelector("[data-oceanleo-leo-entry-root]");
  const rightInput = rightComposer.querySelector("[data-oc-slot-editor]");
  let text = "existing draft", writes = 0, rightWrites = 0;
  composer.getClientRects = rightComposer.getClientRects = () => [{}];
  const setText = value => { text = value; writes++; };
  input.__ocGetText = () => text;
  input.__ocSetText = setText;
  rightInput.__ocGetText = () => "right draft";
  rightInput.__ocSetText = () => { rightWrites++; };
  return {
    split, left, right, composer, input, setText,
    get text() { return text; },
    get writes() { return writes; },
    get rightWrites() { return rightWrites; },
  };
}

const inspiration = {
  id: "inspiration-1", site_key: "website", app_id: "landing",
  title: "Landing starter", section: "Start", prompt: "Build a landing page",
  params: { hint: "Starter" }, position: 0, source: "catalog",
};
const response = data => ({ ok: true, json: async () => data });

async function waitForPanel(host) {
  for (let attempt = 0; attempt < 100 && !host.querySelector("[data-inspiration-panel]"); attempt++) {
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
  }
  assert.ok(host.querySelector("[data-inspiration-panel]"), "lazy panel mounted");
}

test("fill replaces only its own left draft and never submits", () => {
  const own = composerFixture(), other = composerFixture();
  document.body.append(other.split);
  let sends = 0;
  own.split.addEventListener("submit", () => sends++);
  try {
    assert.equal(insertInspirationPrompt("inspiration", own.split), true);
    assert.equal(own.text, "inspiration");
    assert.equal(own.writes, 1);
    assert.equal(own.rightWrites, 0);
    assert.equal(other.writes, 0);
    assert.equal(other.text, "existing draft");
    assert.equal(sends, 0);
  } finally { other.split.remove(); }
});

test("hidden, readonly and right-pane composers cannot receive prompts", () => {
  const f = composerFixture();
  f.composer.hidden = true;
  assert.equal(insertInspirationPrompt("x", f.split), false);
  f.composer.hidden = false;
  f.input.setAttribute("contenteditable", "false");
  assert.equal(insertInspirationPrompt("x", f.split), false);
  f.input.setAttribute("contenteditable", "true");
  f.left.setAttribute("data-workspace-pane", "main");
  assert.equal(insertInspirationPrompt("x", f.split), false);
  assert.equal(f.writes, 0);
  assert.equal(f.rightWrites, 0);
});

test("hidden agent conversation is revealed before its bridge receives a prompt", async () => {
  const f = composerFixture();
  f.left.hidden = true;
  let opened = 0;
  const result = await fillInspirationWhenReady("prompt", {
    root: () => f.split, conversationHidden: true,
    openConversation: () => { opened++; f.left.hidden = false; return true; },
    signal: new AbortController().signal,
  });
  assert.equal(result, "inserted");
  assert.equal(opened, 1);
  assert.equal(f.text, "prompt");
});

test("delayed bridge readiness succeeds; timeout and abort preserve drafts", async () => {
  const delayed = composerFixture();
  delete delayed.input.__ocSetText;
  const timer = setTimeout(() => { delayed.input.__ocSetText = delayed.setText; }, 5);
  try {
    assert.equal(await fillInspirationWhenReady("ready prompt", {
      root: () => delayed.split, openConversation: () => true,
      signal: new AbortController().signal, timeoutMs: 1000,
    }), "inserted");
    assert.equal(delayed.text, "ready prompt");
  } finally { clearTimeout(timer); }

  const f = composerFixture();
  delete f.input.__ocSetText;
  assert.equal(await fillInspirationWhenReady("prompt", {
    root: () => f.split, openConversation: () => true,
    signal: new AbortController().signal, timeoutMs: 1,
  }), "timeout");
  const controller = new AbortController();
  const pending = fillInspirationWhenReady("prompt", {
    root: () => f.split, openConversation: () => true, signal: controller.signal,
  });
  controller.abort();
  assert.equal(await pending, "cancelled");
  f.input.__ocSetText = f.setText;
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(f.text, "existing draft");
  assert.equal(f.writes, 0);
});

test("catalog request uses exact site/app/page filters and no credentials", async () => {
  const url = inspirationUrl("http://fixture/", {
    siteKey: "website", appId: "landing", limit: 7, offset: 14,
  });
  const params = new URL(url).searchParams;
  assert.equal(params.get("siteKey"), "website");
  assert.equal(params.get("appId"), "landing");
  assert.equal(params.get("limit"), "7");
  assert.equal(params.get("offset"), "14");
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.credentials, "omit");
      return response({ items: [], total: 0 });
    };
    assert.deepEqual(await fetchInspirations("http://fixture", { siteKey: "website" }), { items: [], total: 0 });
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(fetchInspirations("http://fixture", {}));
  } finally { globalThis.fetch = original; }
});

test("restored card requests its app and reveals/fills its own left agent", async () => {
  const f = composerFixture();
  f.left.hidden = true;
  f.right.replaceChildren();
  document.body.append(f.split);
  let opens = 0;
  const urls = [], original = globalThis.fetch;
  globalThis.__bayInspirationTest = {
    scope: { siteKey: "website", appId: "landing" },
    focus: { agentVisible: false, focusAgent: () => { f.left.hidden = false; opens++; return true; } },
  };
  globalThis.fetch = async (url, init) => {
    urls.push(url);
    assert.equal(init.credentials, "omit");
    return response({ items: [inspiration], total: 1 });
  };
  const root = createRoot(f.right);
  try {
    await act(async () => root.render(h(WorkspaceHome, {
      slots: ["preview", "mine"], panels: { bay: false, leochat: false },
      onOpenSlot: () => assert.fail("restored card must not open the legacy guide slot"),
      onOpenPanel() {},
    })));
    assert.ok(f.right.querySelector('[data-workspace-card="template"]'), "main app context restores the card despite legacy template=false");
    await act(async () => f.right.querySelector('[data-workspace-card="template"]').click());
    await waitForPanel(f.right);
    assert.equal(urls.length, 1);
    const params = new URL(urls[0]).searchParams;
    assert.equal(params.get("siteKey"), "website");
    assert.equal(params.get("appId"), "landing");
    await act(async () => f.right.querySelector('[data-inspiration-id="inspiration-1"]').click());
    await act(async () => new Promise(resolve => setTimeout(resolve, 70)));
    assert.equal(f.text, inspiration.prompt);
    assert.equal(f.writes, 1);
    assert.equal(opens, 1);
    assert.match(f.right.textContent, /已填入对话输入框/);
    await act(async () => [...f.right.querySelectorAll("button")].find(button => button.textContent === "返回").click());
    assert.ok(f.right.querySelector('[data-workspace-card="template"]'));
  } finally {
    await act(async () => root.unmount());
    f.split.remove();
    globalThis.fetch = original;
    delete globalThis.__bayInspirationTest;
  }
});

test("LeoBay filters platform prompts by site/app without publication controls", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host), original = globalThis.fetch, urls = [];
  globalThis.__bayInspirationTest = { scope: null, focus: null };
  globalThis.fetch = async (url, init) => {
    urls.push(url);
    assert.equal(init.credentials, "omit");
    if (url.endsWith("/scopes")) return response({ items: [
      { site_key: "website", app_id: "landing", count: 7 },
      { site_key: "music", app_id: "song", count: 7 },
    ] });
    const params = new URL(url).searchParams;
    return response({ items: [{ ...inspiration,
      site_key: params.get("siteKey") || "website", app_id: params.get("appId") || "landing",
      prompt: "Read-only prompt",
    }], total: 1 });
  };
  try {
    await act(async () => root.render(h(BayInspirations, { siteKey: "website" })));
    assert.match(host.textContent, /Read-only prompt/);
    assert.equal(host.querySelectorAll("[data-inspiration-id]").length, 0);
    assert.equal([...host.querySelectorAll("button")].some(button => /发布|出售|购买/.test(button.textContent)), false);
    const site = host.querySelector('select[aria-label="站点"]');
    await act(async () => { site.value = "music"; site.dispatchEvent(new window.Event("change", { bubbles: true })); });
    const app = host.querySelector('select[aria-label="应用"]');
    assert.ok([...app.options].some(option => option.value === "song"));
    await act(async () => { app.value = "song"; app.dispatchEvent(new window.Event("change", { bubbles: true })); });
    const filtered = new URL(urls.at(-1)).searchParams;
    assert.equal(filtered.get("siteKey"), "music");
    assert.equal(filtered.get("appId"), "song");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = original;
    delete globalThis.__bayInspirationTest;
  }
});

test("API failures stay visible and retry reloads the same app", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host), original = globalThis.fetch, urls = [];
  let fail = true;
  globalThis.__bayInspirationTest = { scope: null, focus: null };
  globalThis.fetch = async url => {
    urls.push(url);
    return fail ? { ok: false } : response({ items: [], total: 0 });
  };
  try {
    await act(async () => root.render(h(InspirationPanel, { siteKey: "website", appId: "landing" })));
    assert.match(host.querySelector('[role="alert"]').textContent, /重试/);
    fail = false;
    await act(async () => host.querySelector('[role="alert"] button').click());
    assert.equal(host.querySelector('[role="alert"]'), null);
    assert.match(host.textContent, /暂无平台灵感/);
    assert.equal(new URL(urls.at(-1)).searchParams.get("appId"), "landing");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = original;
    delete globalThis.__bayInspirationTest;
  }
});
