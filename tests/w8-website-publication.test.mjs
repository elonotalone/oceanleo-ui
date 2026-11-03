import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Owner-only publication stop/unpublish: bearer goes to the fixed gateway only; the published
// address is shown only as a credential-free https *.oceanleo.app link.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const auth = dataModule('export async function accessToken(){return "publication-test-token";}');
const config = dataModule('export const GATEWAY_BASE="https://unused.invalid"; export function gatewayBase(){return "https://gateway.invalid";}');
const runtimeModule = await compileModule("src/api/website-runtime.ts", { "../lib/auth/client": auth, "../lib/auth/config": config });
const publicationModule = await compileModule("src/api/website-publication.ts", { "./website-runtime": runtimeModule });
const { WebsitePublicationError } = await import(publicationModule);
const { WebsitePublicationCard } = await import(await compileModule("src/shell/website-platform/WebsitePublicationCard.tsx", {
  "../../api/website-publication": publicationModule,
  "./website-preview-i18n": dataModule("export function useWebsiteUI(){return s=>s;}"),
}));
const { createRoot } = await import("react-dom/client");

const LIVE = { state: "live", kind: "runtime", url: "https://w8-site.oceanleo.app/", commit: "1c7f6c5", stoppingSessions: 0 };
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
async function mount(api, projectId = "p1") {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(WebsitePublicationCard, { projectId, api })));
  await flush();
  return { host, root, rerender: next => act(async () => root.render(React.createElement(WebsitePublicationCard, { projectId: next, api }))),
    async destroy() { await act(async () => root.unmount()); host.remove(); } };
}
const click = el => act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await new Promise(r => setTimeout(r, 0)); });
const byId = (host, id) => host.querySelector(`[data-testid="${id}"]`);

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md — the published address is a credential-free link opened without opener.
test("live runtime: stop is one click; unconfirmed stop says still stopping, never stopped", async () => {
  const calls = [];
  const api = { get: async () => ({ ...LIVE }), stop: async id => { calls.push(["stop", id]); return { ...LIVE, state: "stopped", url: null, stoppingSessions: 1, stopConfirmed: false }; },
    unpublish: async () => { throw new Error("unexpected"); } };
  const view = await mount(api);
  try {
    assert.match(view.host.textContent, /网站发布 · 在线/);
    const link = view.host.querySelector("a");
    assert.equal(link.getAttribute("href"), LIVE.url); assert.equal(link.getAttribute("rel"), "noopener noreferrer"); assert.equal(link.getAttribute("target"), "_blank");
    await click(byId(view.host, "website-publication-stop"));
    assert.deepEqual(calls, [["stop", "p1"]]);
    assert.match(byId(view.host, "website-publication-status").textContent, /仍在停止中/);
    assert.match(view.host.textContent, /网站发布 · 已停止/);
    assert.equal(view.host.querySelector("a"), null);
  } finally { await view.destroy(); }
});

test("unpublish needs a confirm click; cancel sends nothing", async () => {
  const calls = [];
  const api = { get: async () => ({ ...LIVE, kind: "static" }), stop: async () => { throw new Error("unexpected"); },
    unpublish: async id => { calls.push(id); return { state: "not_published", kind: null, url: null, commit: null, stoppingSessions: 0, stopConfirmed: true }; } };
  const view = await mount(api);
  try {
    assert.equal(byId(view.host, "website-publication-stop"), null, "static publication has no stop");
    await click(byId(view.host, "website-publication-unpublish"));
    assert.deepEqual(calls, []);
    const cancel = [...view.host.querySelectorAll("button")].find(b => b.textContent === "取消");
    await click(cancel);
    assert.equal(byId(view.host, "website-publication-unpublish-confirm"), null);
    await click(byId(view.host, "website-publication-unpublish"));
    await click(byId(view.host, "website-publication-unpublish-confirm"));
    assert.deepEqual(calls, ["p1"]);
    assert.match(view.host.textContent, /已取消发布/);
    assert.match(view.host.textContent, /网站发布 · 未发布/);
    assert.equal(byId(view.host, "website-publication-unpublish"), null);
  } finally { await view.destroy(); }
});

test("changed publication reloads and explains; route absent hides the card", async () => {
  let reads = 0;
  const api = { get: async () => (++reads === 1 ? { ...LIVE } : { ...LIVE, state: "stopped", url: null }),
    stop: async () => { throw new WebsitePublicationError("changed"); }, unpublish: async () => ({}) };
  const view = await mount(api);
  try {
    await click(byId(view.host, "website-publication-stop"));
    assert.equal(reads, 2);
    assert.match(view.host.textContent, /发布状态已变化/);
    assert.match(view.host.textContent, /已停止/);
  } finally { await view.destroy(); }
  const absent = await mount({ get: async () => { throw new WebsitePublicationError("missing"); }, stop: async () => ({}), unpublish: async () => ({}) });
  try { assert.equal(byId(absent.host, "website-publication"), null); } finally { await absent.destroy(); }
});

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md — owner operation results stay bound to their project.
test("a result for the previous project never lands on the new one", async () => {
  let release;
  const api = { get: async id => ({ ...LIVE, url: id === "p1" ? LIVE.url : "https://other.oceanleo.app/" }),
    stop: () => new Promise(resolve => { release = () => resolve({ ...LIVE, state: "stopped", url: null, stopConfirmed: true }); }),
    unpublish: async () => ({}) };
  const view = await mount(api);
  try {
    await click(byId(view.host, "website-publication-stop"));
    await view.rerender("p2"); await flush();
    await act(async () => { release(); await new Promise(r => setTimeout(r, 0)); });
    assert.match(view.host.textContent, /在线/);
    assert.equal(view.host.querySelector("a").getAttribute("href"), "https://other.oceanleo.app/");
    assert.equal(byId(view.host, "website-publication-status"), null);
  } finally { await view.destroy(); }
});
