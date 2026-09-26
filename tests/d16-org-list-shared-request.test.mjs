import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const apiModule = await compileModule("src/lib/org-api.ts", {
  "./auth/client": dataModule(`export function accessToken() { return globalThis.__d16Auth(); }`),
  "./auth/config": dataModule(`export const GATEWAY_BASE = "https://org-api.test";`),
});
const api = await import(apiModule);
const { PublishToOrgButton } = await import(await compileModule("src/shell/PublishToOrgButton.tsx", {
  "../lib/org-api": apiModule,
  "../i18n/ui/useUI": dataModule(`export function useUI() { return text => text; }`),
}));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const orgBody = { orgs: [{ org_id: "a", name: "A", my_role: "owner", currency: "usd" }] };

function network(t, { auth = () => "test-only" } = {}) {
  const calls = [];
  let authCalls = 0;
  t.mock.method(globalThis, "fetch", (url, init) => {
    const held = deferred();
    calls.push({ path: new URL(url).pathname, init, ...held });
    return held.promise;
  });
  globalThis.__d16Auth = () => { authCalls++; return auth(); };
  t.after(() => { delete globalThis.__d16Auth; });
  return {
    calls,
    authCalls: () => authCalls,
    reply(call, body, status = 200) {
      call.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
    },
  };
}

test("180 simultaneous listMyOrgs callers share auth, fetch, promise and normalized result; next call is fresh", async t => {
  const token = deferred();
  const net = network(t, { auth: () => token.promise });
  const waiting = Array.from({ length: 180 }, () => api.listMyOrgs());
  assert.ok(waiting.every(promise => promise === waiting[0]), "share before the first await, including auth");
  await tick();
  assert.equal(net.authCalls(), 1);
  assert.equal(net.calls.length, 0);
  token.resolve("test-only");
  await tick();
  assert.equal(net.calls.length, 1);
  assert.equal(net.calls[0].path, "/v1/orgs");
  assert.equal(net.calls[0].init.cache, "no-store");
  net.reply(net.calls[0], orgBody);
  const results = await Promise.all(waiting);
  assert.ok(results.every(result => result === results[0]));
  assert.deepEqual(results[0], [{ id: "a", name: "A", role: "owner", canViewOrgPage: true, canViewAllTasks: true, currency: "USD" }]);
  const fresh = api.listMyOrgs();
  await tick();
  assert.equal(net.calls.length, 2);
  net.reply(net.calls[1], { orgs: [] });
  assert.deepEqual(await fresh, []);
});

for (const [label, request] of [
  ["org list", () => api.listMyOrgs()],
  ["org assets", () => api.listOrgAssets("a")],
]) {
  for (const failure of ["http", "network", "auth"]) {
    test(`${label}: ${failure} failure is shared and immediately retryable`, async t => {
      const authError = new Error("auth unavailable");
      let authFails = failure === "auth";
      const net = network(t, { auth: () => authFails ? Promise.reject(authError) : "test-only" });
      const waiting = Array.from({ length: 180 }, request);
      const settled = Promise.allSettled(waiting);
      await tick();
      if (failure !== "auth") {
        assert.equal(net.calls.length, 1);
        if (failure === "http") net.reply(net.calls[0], {}, 503);
        else net.calls[0].reject(new TypeError("offline"));
      }
      const results = await settled;
      assert.ok(results.every(result => result.status === "rejected" && result.reason === results[0].reason));
      if (failure === "auth") assert.equal(results[0].reason, authError);
      else assert.equal(results[0].reason.code, failure === "http" ? "server_error" : "offline");
      authFails = false;
      const previous = net.calls.length;
      const retry = request();
      await tick();
      assert.equal(net.calls.length, previous + 1);
      net.reply(net.calls.at(-1), []);
      assert.deepEqual(await retry, []);
    });
  }
}

test("org assets share per encoded path, keep organizations separate and refresh after success", async t => {
  const net = network(t);
  const a = Array.from({ length: 180 }, () => api.listOrgAssets("a"));
  const b = Array.from({ length: 180 }, () => api.listOrgAssets("b"));
  await tick();
  assert.deepEqual(net.calls.map(call => call.path).sort(), ["/v1/orgs/a/assets", "/v1/orgs/b/assets"]);
  for (const call of net.calls) net.reply(call, { assets: [{ asset_id: call.path, name: "Asset" }] });
  const [first, second] = await Promise.all([Promise.all(a), Promise.all(b)]);
  assert.ok(first.every(result => result === first[0]));
  assert.ok(second.every(result => result === second[0]));
  assert.notEqual(first[0], second[0]);
  assert.equal(first[0][0].title, "Asset");
  assert.equal(first[0][0].id, "/v1/orgs/a/assets");
  const fresh = api.listOrgAssets("a");
  const encoded = api.listOrgAssets("a/b");
  await tick();
  assert.deepEqual(net.calls.slice(2).map(call => call.path), ["/v1/orgs/a/assets", "/v1/orgs/a%2Fb/assets"]);
  net.reply(net.calls[2], []);
  net.reply(net.calls[3], []);
  await Promise.all([fresh, encoded]);
  await assert.rejects(api.listOrgAssets(""), error => error.code === "not_found" && error.status === 404);
  assert.equal(net.calls.length, 4);
});

test("publish and revoke remain independent writes even while the same assets path is being read", async t => {
  const net = network(t);
  const body = { kind: "document", title: "Title", url: "https://asset.test/doc" };
  const reads = api.listOrgAssets("a");
  const writes = [api.publishOrgAsset("a", body), api.publishOrgAsset("a", body), api.revokeOrgAsset("a", "asset"), api.revokeOrgAsset("a", "asset")];
  await tick();
  assert.equal(net.calls.length, 5);
  assert.deepEqual(net.calls.map(call => call.init.method || "GET").sort(), ["DELETE", "DELETE", "GET", "POST", "POST"]);
  net.calls.forEach(call => net.reply(call, call.init.method === "POST" ? { id: "asset" } : []));
  await Promise.all([reads, ...writes]);
});

async function mountButtons(run) {
  // Reuse the repo's jsdom installation without requiring the optional native canvas binary.
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  let JSDOM;
  try {
    require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
    ({ JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href));
  } finally {
    if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
    else delete require.cache[canvasEntry];
  }
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://org-ui.test", pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.getElementById("root");
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(React.StrictMode, null, Array.from({ length: 60 }, (_, index) => React.createElement(PublishToOrgButton, { key: index, kind: "document", title: `Card ${index}`, url: `https://asset.test/${index}` })))));
    await run(container);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

for (const hasOrgs of [false, true]) {
  test(`60 real PublishToOrgButton mounts under StrictMode: one org GET (${hasOrgs ? "two organizations" : "zero organizations"})`, async t => {
    const net = network(t);
    await mountButtons(async container => {
      assert.equal(net.calls.length, 1);
      assert.equal(net.calls[0].path, "/v1/orgs");
      await act(async () => {
        net.reply(net.calls[0], hasOrgs ? { orgs: [{ id: "a", name: "A" }, { id: "b", name: "B" }] } : []);
        await tick();
      });
      if (hasOrgs) {
        assert.deepEqual(net.calls.slice(1).map(call => call.path).sort(), ["/v1/orgs/a/assets", "/v1/orgs/b/assets"]);
        await act(async () => {
          for (const call of net.calls.slice(1)) net.reply(call, []);
          await tick();
        });
        assert.equal(container.querySelectorAll("[data-publish-to-org-main]").length, 60);
      } else {
        assert.equal(container.childElementCount, 0);
        assert.equal(net.calls.length, 1);
      }
    });
  });
}
