import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "./helpers/w1-jsdom-window.mjs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const { default: React, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const reactUrl = JSON.stringify(pathToFileURL(createRequire(import.meta.url).resolve("react")).href);
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__fuRoute = { calls: [], detail: { kind: "project", project_id: "project-7" } };
const clientStub = dataModule('export class ImApiError extends Error { constructor(status){super("access");this.status=status} }');
const { ImApiError } = await import(clientStub);
const { LeoChatConversation } = await import(await compileModule("src/shell/messages/conversation/LeoChatConversation.tsx", {
  "../../../lib/im/client": clientStub,
  "../../../i18n/ui/useUI": dataModule('export function useUI(){return key=>key}'),
  "next/navigation": dataModule('const router={push(href){globalThis.__fuRoute.calls.push(["push",href])}};export function useRouter(){return router}'),
  "../../../lib/im/messages-api": dataModule('export const messagesApi={getConversation:async(id)=>{globalThis.__fuRoute.calls.push(["resolve",id]);return typeof globalThis.__fuRoute.detail === "function" ? await globalThis.__fuRoute.detail() : await globalThis.__fuRoute.detail}}'),
  "../host-state": dataModule('export function hostState(){return {showConversation(id){globalThis.__fuRoute.calls.push(["show",id])},close(){globalThis.__fuRoute.calls.push(["close"])}}}'),
  "./ConversationView": dataModule(`import React from ${reactUrl};export function ConversationView(p){globalThis.__fuRoute.calls.push(["mount",p.conversationId]);return React.createElement("div",{"data-chat":p.conversationId})}`),
}));
async function mount(id) {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(LeoChatConversation, { conversationId: id, layout: "full" })));
  return { host, async close() { await act(async () => root.unmount()); host.remove(); } };
}

test("session notification/deep-link resolves its project before mounting any LeoChat conversation", async () => {
  globalThis.__fuRoute.calls = [];
  globalThis.__fuRoute.detail = { kind: "project", project_id: "project-7" };
  const view = await mount("session-9");
  try {
    assert.deepEqual(globalThis.__fuRoute.calls, [["resolve", "session-9"], ["show", null], ["close"], ["push", "/projects/project-7?session=session-9"]]);
    assert.equal(view.host.querySelector("[data-chat]"), null);
    for (const path of ["src/shell/messages/MessagesHost.tsx", "src/shell/leochat/leochat-body.tsx"]) assert.match(readFileSync(path, "utf8"), /<LeoChatConversation/);
  } finally { await view.close(); }
});

test("ordinary notification still opens its chat", async () => {
  globalThis.__fuRoute.calls = [];
  globalThis.__fuRoute.detail = { kind: "dm", project_id: null };
  const view = await mount("dm-2");
  try {
    assert.equal(view.host.querySelector("[data-chat]").dataset.chat, "dm-2");
    assert.ok(!globalThis.__fuRoute.calls.some(call => call[0] === "push"));
  } finally { await view.close(); }
});

test("a late session resolution cannot navigate after a conversation switch/unmount", async () => {
  let resolve;
  globalThis.__fuRoute.calls = [];
  globalThis.__fuRoute.detail = new Promise(done => { resolve = done; });
  const view = await mount("slow-session");
  await view.close();
  await act(async () => resolve({ kind: "project", project_id: "old-project" }));
  assert.ok(!globalThis.__fuRoute.calls.some(call => call[0] === "push"));
});


test("transient resolution failure retries without ever mounting a session in LeoChat", async () => {
  let attempts = 0;
  globalThis.__fuRoute.calls = [];
  globalThis.__fuRoute.detail = async () => {
    if (++attempts === 1) throw new Error("offline");
    return { kind: "project", project_id: "recovered" };
  };
  const view = await mount("retry-session");
  try {
    assert.ok(view.host.querySelector('[role="status"]'));
    assert.ok(!globalThis.__fuRoute.calls.some(call => call[0] === "mount"));
    await act(async () => new Promise(resolve => setTimeout(resolve, 1050)));
    assert.deepEqual(globalThis.__fuRoute.calls.at(-1), ["push", "/projects/recovered?session=retry-session"]);
    assert.ok(!globalThis.__fuRoute.calls.some(call => call[0] === "mount"));
  } finally { await view.close(); }
});

test("a removed session uses the unavailable handler without opening a chat", async () => {
  globalThis.__fuRoute.calls = [];
  globalThis.__fuRoute.detail = async () => { throw new ImApiError(404); };
  let unavailable = 0;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(LeoChatConversation, { conversationId: "removed", layout: "full", onUnavailable() { unavailable++; } })));
    assert.equal(unavailable, 1);
    assert.ok(!globalThis.__fuRoute.calls.some(call => call[0] === "mount" || call[0] === "push"));
  } finally { await act(async () => root.unmount()); host.remove(); }
});
