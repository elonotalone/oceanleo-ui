import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
function loadClient(token = "user-token") {
  const source = ts.transpileModule(read("src/lib/local-browser-api.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(name => {
    if (name === "./auth/client") return { accessToken: async () => token };
    if (name === "./auth/config") return { GATEWAY_BASE: "https://api.dev.example.test" };
    if (name === "./mcp-api") return { mcpGatewayDetail: data => data.detail || "" };
    throw new Error(`Unexpected import ${name}`);
  }, module, module.exports);
  return module.exports;
}

test("local browser uses authenticated scoped requests and preserves controls/preferences", async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json({ items: [], ok: true, session: { state: "paused" } }); };
  try {
    const { localBrowserApi: api } = loadClient();
    await api.devices(); await api.pair();
    await api.preferences({ preferred_device_id: null, allow_cross_browser_tasks: false });
    await api.revoke("device/one"); await api.sessions(); await api.events("session/one"); await api.control("session/one", "takeover");
    assert.equal(calls[0].url, "https://api.dev.example.test/v1/local-browser/devices");
    for (const { init } of calls) { assert.equal(init.headers.Authorization, "Bearer user-token"); assert.equal(init.credentials, "include"); assert.ok(init.signal instanceof AbortSignal); }
    assert.deepEqual(JSON.parse(calls[1].init.body), {});
    assert.deepEqual(JSON.parse(calls[2].init.body), { preferred_device_id: null, allow_cross_browser_tasks: false });
    assert.match(calls[3].url, /devices\/device%2Fone$/); assert.equal(calls[3].init.method, "DELETE");
    assert.match(calls[5].url, /sessions\/session%2Fone\/events$/);
    assert.deepEqual(JSON.parse(calls[6].init.body), { action: "takeover" });
    assert.ok(calls.every(({ url }) => !url.includes("user-token")));
  } finally { globalThis.fetch = previous; }
});

test("auth failure, unavailable gateway and cancellation are recoverable errors", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("must not fetch without auth"); };
    await assert.rejects(loadClient("").localBrowserApi.devices(), /请先登录/);
    globalThis.fetch = async () => Response.json({ detail: "not enabled" }, { status: 503 });
    await assert.rejects(loadClient().localBrowserApi.devices(), /not enabled/);
    globalThis.fetch = async (_url, init) => { init.signal.throwIfAborted(); return Response.json({}); };
    const controller = new AbortController(); controller.abort();
    await assert.rejects(loadClient().localBrowserApi.sessions(controller.signal), { name: "AbortError" });
  } finally { globalThis.fetch = previous; }
});

test("ZIP download is actual authenticated bytes without credential query parameters", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => { assert.equal(url, "https://api.dev.example.test/v1/local-browser/extension.zip"); assert.equal(init.headers.Authorization, "Bearer user-token"); return new Response(new Uint8Array([80, 75, 3, 4]), { headers: { "Content-Type": "application/zip" } }); };
    const blob = await loadClient().downloadLocalBrowserExtension();
    assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [80, 75, 3, 4]);
  } finally { globalThis.fetch = previous; }
});

test("settings and chat expose optional native connector with local authorization and cleanup", () => {
  const settings = read("src/pages/settings/ConnectorsSettingsPane.tsx");
  const chat = read("src/shell/PluginsPopover.tsx");
  const panel = read("src/pages/settings/MyBrowserPanel.tsx");
  assert.match(settings, /<MyBrowserPanel\s*\/>/);
  assert.match(chat, /data-local-browser-entry/);
  assert.match(chat, /openSettingsModal\("connectors"\)/);
  assert.match(panel, /独立于 MCP/);
  assert.match(panel, /网页内容会发送给服务器和模型/);
  assert.match(panel, /等待扩展同步/);
  assert.match(panel, /controller\.abort\(\); clearTimeout\(timer\)/);
  assert.match(panel, /clearInterval\(clock\)/);
  assert.doesNotMatch(panel, /pairings\/redeem|device_token|chromewebstore|chrome\.google\.com\/webstore/);
  assert.match(panel, /aria-live="polite"/);
});
