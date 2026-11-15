import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const meta = (id, connect, extra = {}) => ({ id, name: id === "github" ? "GitHub" : id, desc: "Description", icon: id, category: "Development", transport: "streamable_http", auth: "url+token", auth_header: "", needs_endpoint: false, endpoint: "https://mcp.example.com/mcp", help_url: "", docs: "", listed: true, connect, ...extra });
const oauth = meta("github", { mode: "oauth" });
const input = meta("shopify", { mode: "input", inputs: [{ id: "shop", label: "Shop name", placeholder: "my-shop", kind: "text" }], then: "save" });
const unavailable = meta("slack", { mode: "unavailable", reason: "vendor_listing" });
const custom = meta("custom", undefined, { name: "自定义 MCP 服务器", needs_endpoint: true });
const hidden = meta("openai", { mode: "unavailable", reason: "vendor_registration" }, { listed: false, category: "Models" });
const connection = (id) => ({ id: "c-" + id, connector_id: id, label: "My account", endpoint: null, auth_header: "", fingerprint: "", tools_count: 1, enabled: true, auth_kind: "oauth", account_label: "owner@example.com" });
const api = dataModule(`
 export function mcpOauthReturnOrigin() { return window.location.origin; }
 export function mcpOauthMessageOrigin() { return "https://api.oceanleo.com"; }
 export async function getMcpRegistry() { return {items: globalThis.__PW_REGISTRY__}; }
 export async function getMcpConnector(id) { globalThis.__PW_DETAIL_CALLS__.push(id); return {item: globalThis.__PW_REGISTRY__.find(c => c.id === id)}; }
 export async function getMcpConnections() { return globalThis.__PW_CONNECTIONS__; }
 export async function connectMcp(payload) { globalThis.__PW_CALLS__.push({kind:"manual", payload}); return {ok: false, error:"Token rejected"}; }
 export async function connectMcpGuided(id, inputs) { globalThis.__PW_CALLS__.push({kind:"guided", id, inputs}); return {ok:true, tools_count:2, authorize_url:"https://vendor.example.com/authorize"}; }
 export async function startMcpOauth(payload) { globalThis.__PW_CALLS__.push({kind:"oauth", payload}); return {ok:true, authorize_url:"https://vendor.example.com/authorize"}; }
 export async function disconnectMcp() { return {ok:true}; }
 export async function toggleMcp() { return {ok:true}; }
 export async function probeMcp() { return {ok:true}; }
`);
const ui = dataModule(`export function useUI() { return (s, vars) => vars ? s.replace(/\\{(\\w+)\\}/g, (m,k) => k in vars ? String(vars[k]) : m) : s; }`);
const org = dataModule(`export class OrgApiError extends Error{}; export async function listMyOrgs(){return [];} export async function listInheritedMcp(){return {connections:[]};} export async function listOrgMcpConnections(){return {connections:[]};} export async function deleteOrgMcpConnection(){} export async function patchOrgMcpConnection(){} export async function setOrgMcpForwardIdentity(){}`);
const database = dataModule(`export async function getMcpCatalog(){return {ok:true,data:{items:[]}};}`);
const lazyStub = dataModule("const noop = () => undefined; export default new Proxy(noop, {get: () => noop});");
const { ConnectorsSettingsPane } = await import(await compileModule("src/pages/settings/ConnectorsSettingsPane.tsx", {
 "../../lib/mcp-api": api, "../../i18n/ui/useUI": ui, "../../lib/org-api": org, "../../lib/database": database,
}, {missingPackageStub: lazyStub}));

function fixtures(registry = [oauth, input, unavailable, custom, hidden], connections = []) {
 globalThis.__PW_REGISTRY__ = registry;
 globalThis.__PW_CONNECTIONS__ = connections;
 globalThis.__PW_CALLS__ = [];
 globalThis.__PW_DETAIL_CALLS__ = [];
}
async function withDom(run, url = "https://ppt.oceanleo.com/settings/connectors") {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM, VirtualConsole } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url,
    virtualConsole,
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    location: window.location,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const render = async (props = {}) => {
    await act(async () => root.render(React.createElement(ConnectorsSettingsPane, props)));
    for (let i = 0; i < 6; i += 1) await act(async () => {});
  };

  try {
    return await run({
      render,
      container,
      window,
      find: (selector) => window.document.querySelector(selector),
      findAll: (selector) => [...window.document.querySelectorAll(selector)],
      click: async (node) => {
        assert.ok(node, "点不到目标");
        await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
        for (let i = 0; i < 4; i += 1) await act(async () => {});
      },
    });
  } finally {
    await act(async () => root.unmount());
    window.close();
    delete globalThis.__W2_MCP_CONNECT__;
    delete globalThis.__W10_MCP_CONNECTIONS__;
    delete globalThis.__W10_MCP_PROBE__;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

async function openAddMenu(find, click) {
  await click(find("[data-plugins-connectors] [data-add-menu-trigger]"));
  assert.ok(find("[data-add-menu]"), "「+ 添加连接器 ▾」要展开菜单");
}

async function openCatalog(find, click) {
  await openAddMenu(find, click);
  await click(find('[data-add-menu-item="catalog"]'));
  const catalog = find('[data-testid="connector-catalog"]');
  assert.ok(catalog, "「从连接器目录添加」要打开目录大弹窗");
  return catalog;
}


test("directory shows one state, no one-click badge, and no unlisted/provider/custom card", async () => {
  fixtures(undefined, [connection("openai"), connection("github")]);
  await withDom(async ({render, find, click}) => {
    await render();
    assert.ok(find('[data-my-connector="openai"]'));
    const catalog = await openCatalog(find, click);
    assert.equal(catalog.querySelectorAll('[data-mcp-connector="github"] [data-mcp-connector-status]').length, 1);
    assert.equal(catalog.querySelector('[data-mcp-connector="github"] [data-mcp-connector-status]').textContent.trim(), "已连接");
    assert.match(catalog.querySelector('[data-mcp-connector="shopify"]').textContent, /需要补充连接信息/);
    assert.match(catalog.querySelector('[data-mcp-connector="slack"]').textContent, /尚未向 OceanLeo 开放/);
    assert.equal(catalog.querySelector('[data-mcp-connector="openai"]'), null);
    assert.equal(catalog.querySelector('[data-mcp-connector="custom"]'), null);
    assert.equal(catalog.querySelector('[data-mcp-oauth-tag]'), null);
  });
});

test("card opens a URL-addressable settings page and OAuth goes directly to vendor from a subsite", async () => {
  fixtures();
  await withDom(async ({render, find, click, window}) => {
    await render();
    await openCatalog(find, click);
    await click(find('[data-mcp-connector="github"]'));
    assert.equal(window.location.pathname, "/settings/connectors/github");
    assert.ok(find('[data-connector-detail="github"]'));
    assert.equal(find('[data-testid="connector-catalog"]'), null);
    assert.equal(find('[data-in-tree-dialog="mcp-connect"]'), null);
    assert.equal(find('[data-connector-detail] input'), null);
    assert.equal(find('[data-mcp-connect-status]'), null);
    const popup = {location: {href:""}, closed:false, close(){this.closed = true;}};
    const opened = [];
    window.open = (...args) => { opened.push(args[0]); return popup; };
    await click(find('[data-connector-connect]'));
    assert.deepEqual(opened, [""]);
    assert.equal(popup.location.href, "https://vendor.example.com/authorize");
    assert.deepEqual(globalThis.__PW_CALLS__.map(c => c.kind), ["oauth"]);
    assert.ok(globalThis.__PW_DETAIL_CALLS__.includes("github"));
    await click(find('[data-connector-back]'));
    assert.equal(window.location.pathname, "/settings/connectors");
    assert.equal(find('[data-connector-detail]'), null);
  });
});

test("input mode shows only the gateway's fields and saves through guided endpoint", async () => {
  fixtures();
  await withDom(async ({render, find, window}) => {
    await render();
    const field = find('[data-connector-input="shop"]');
    assert.ok(field);
    assert.equal(find('[data-connector-detail]').querySelectorAll('input').length, 1);
    assert.equal(find('[data-mcp-connect-status]'), null);
    // Trigger the actual React input change through the native input event.
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, "my-shop");
      field.dispatchEvent(new window.Event("input", {bubbles:true}));
    });
    await act(async () => field.form.dispatchEvent(new window.Event("submit", {bubbles:true, cancelable:true})));
    assert.deepEqual(globalThis.__PW_CALLS__, [{kind:"guided", id:"shopify", inputs:{shop:"my-shop"}}]);
  }, "https://ppt.oceanleo.com/settings/connectors/shopify");
});

test("guided OAuth does not ask for a token or call the manual route", async () => {
  fixtures([meta("instance", {mode:"input", inputs:[{id:"url",label:"Instance URL",placeholder:"https://example.com",kind:"url"}],then:"oauth"})]);
  await withDom(async ({render, find, window}) => {
    await render();
    window.open = () => ({location:{href:""}, closed:false, close(){}});
    await act(async () => find('[data-connector-inputs]').closest('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(globalThis.__PW_CALLS__[0]?.kind, "guided");
    assert.equal(find('input[type="password"]'), null);
  }, "https://oceanleo.com/settings/connectors/instance");
});

test("unavailable has one plain sentence, no primary form fields and no initial errors", async () => {
  fixtures();
  await withDom(async ({render, find}) => {
    await render();
    assert.match(find('[data-connector-unavailable]').textContent, /slack 尚未向 OceanLeo 开放一键连接/);
    assert.equal(find('[data-connector-connect]'), null);
    assert.equal(find('[data-connector-detail] input'), null);
    assert.equal(find('[data-connector-detail] form'), null);
    assert.equal(find('[data-mcp-connect-status]'), null);
  }, "https://oceanleo.com/settings/connectors/slack");
});

test("advanced manual form has no Name field and validates only after submit", async () => {
  fixtures();
  await withDom(async ({render, find, click, window}) => {
    await render();
    await click(find('[data-connector-advanced]'));
    const manual = find('[data-connector-manual]');
    assert.equal(manual.querySelectorAll('input').length, 2);
    assert.ok(!manual.textContent.includes("名称"));
    assert.equal(find('[data-mcp-connect-status]'), null);
    await act(async () => manual.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.match(find('[data-mcp-connect-status]').textContent, /Token/);
    assert.equal(globalThis.__PW_CALLS__.length, 0);
  }, "https://oceanleo.com/settings/connectors/slack");
});

test("detail renders introduction, examples, tools, account, capability and safe links", async () => {
  fixtures([meta("github", {mode:"oauth"}, {tagline:"Read repositories",about:"First paragraph.\n\nSecond paragraph.",examples:["Find my open issues"],tools:[{name:"search",description:"Find code"}],made_by:{name:"GitHub",url:"https://github.com"},links:{docs:"https://docs.github.com",support:"https://support.github.com",privacy:"https://github.com/privacy"},capabilities:["in_chat_ui"],sign_in:"required"})], [connection("github")]);
  await withDom(async ({render, find}) => {
    await render();
    for (const section of ["about","examples","tools","metadata"]) assert.ok(find(`[data-connector-section="${section}"]`));
    assert.equal(find('[data-connector-section="about"]').querySelectorAll('p').length, 2);
    assert.match(find('[data-connector-account]').textContent, /owner@example.com/);
    assert.ok(find('[data-connector-disconnect]'));
    assert.match(find('[data-connector-section="metadata"]').textContent, /在对话中打开界面/);
    assert.equal(find('[data-connector-section="metadata"]').querySelectorAll('a[target="_blank"]').length, 4);
  }, "https://oceanleo.com/settings/connectors/github");
});

test("empty detail sections and unsafe external links are omitted", async () => {
  fixtures([meta("empty", {mode:"unavailable",reason:"vendor_registration"}, {desc:"",category:"",about:"\n ",examples:[],tools:[],links:{docs:"javascript:alert(1)"},made_by:{name:"",url:""}})]);
  await withDom(async ({render, find}) => {
    await render();
    assert.equal(find('[data-connector-detail]').querySelectorAll('section, dl, h3, a').length, 0);
  }, "https://oceanleo.com/settings/connectors/empty");
});

test("phone width retains one column with reachable connect and back controls", async () => {
  fixtures();
  await withDom(async ({render, find, window}) => {
    Object.defineProperty(window, "innerWidth", {value:375});
    await render();
    assert.match(find('[data-connector-detail] header').className, /flex-col/);
    assert.match(find('[data-connector-connect]').className, /w-full/);
    assert.match(find('[data-connector-connect]').className, /min-h-11/);
    assert.ok(find('[data-connector-back]'));
  }, "https://oceanleo.com/settings/connectors/github");
});

test("settings URL normalization preserves a nested connector and the edition query", async () => {
  const {settingsPath, tabFromSettingsLocation} = await import('../src/pages/settings/settings-tabs.ts');
  assert.equal(settingsPath("connectors","https://oceanleo.com/settings/connectors/github?__site=chat"), "/settings/connectors/github?__site=chat");
  assert.equal(tabFromSettingsLocation("https://oceanleo.com/settings/connectors/github"), "connectors");
});

test("every catalog locale contains the new copy and keeps interpolation placeholders", async () => {
  const {LOCALES} = await import('../src/i18n/config.ts');
  const {PW_U3_MESSAGES} = await import('../src/i18n/ui/messages/pw-u3-copy.ts');
  const keys = Object.keys(PW_U3_MESSAGES.zh);
  assert.equal(LOCALES.length, 17);
  for (const locale of LOCALES) {
    assert.equal(Object.keys(PW_U3_MESSAGES[locale]).length, keys.length);
    for (const key of keys) assert.ok(PW_U3_MESSAGES[locale][key]?.trim(), `${locale}: ${key}`);
    assert.ok(PW_U3_MESSAGES[locale]["{name} 尚未向 OceanLeo 开放一键连接"].includes("{name}"));
  }
});

test("stored connection omitted from registry remains reachable with disconnect", async () => {
  fixtures([oauth, custom], [connection("openai")]);
  await withDom(async ({render, find, click}) => {
    await render();
    await click(find('[data-my-connector="openai"] [data-connector-row-menu] button'));
    await click(find('[data-connector-menu="reconnect"]'));
    assert.ok(find('[data-connector-detail="openai"]'));
    assert.ok(find('[data-connector-disconnect]'));
    assert.ok(globalThis.__PW_DETAIL_CALLS__.includes("openai"));
  });
});

test("hidden connectors cannot be newly opened by a guessed detail URL", async () => {
  fixtures();
  await withDom(async ({render, find}) => {
    await render();
    assert.equal(find('[data-connector-detail]'), null);
    assert.match(find('[role="status"]').textContent, /未找到这个连接器/);
  }, "https://oceanleo.com/settings/connectors/openai");
});

test("closing OAuth checks the saved connection before reporting a cancelled login", async () => {
  fixtures();
  await withDom(async ({render, find, click, window}) => {
    await render();
    let tick;
    window.setInterval = (run) => { tick = run; return 1; };
    window.clearInterval = () => {};
    const popup = {location:{href:""},closed:false,close(){this.closed=true;}};
    window.open = () => popup;
    await click(find('[data-connector-connect]'));
    globalThis.__PW_CONNECTIONS__ = [connection("github")];
    popup.closed = true;
    await act(async () => tick());
    assert.ok(find('[data-connector-account]'));
    assert.equal(find('[data-mcp-connect-status]'), null);
    assert.equal(find('[data-connector-connect]').disabled, false);
  }, "https://ppt.oceanleo.com/settings/connectors/github");
});

test("gateway client consumes I1 detail and dedicated guided connect HTTP contracts", async () => {
  const client = await import(await compileModule("src/lib/mcp-api.ts", {
    "./auth/client": dataModule('export async function accessToken(){ return "test-session"; }'),
    "./auth/config": dataModule('export const GATEWAY_BASE="https://gateway.example";'),
  }));
  const savedFetch = globalThis.fetch;
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis,"document");
  Object.defineProperty(globalThis,"document",{configurable:true,value:{documentElement:{lang:"zh-CN"}}});
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({url:String(url),options});
    if (String(url).endsWith('/connect')) return new Response(JSON.stringify({connection:{tools_count:3}}),{status:200});
    if (String(url).includes('/registry')) return new Response(JSON.stringify({items:[oauth]}),{status:200});
    return new Response(JSON.stringify(oauth),{status:200});
  };
  try {
    assert.equal((await client.getMcpRegistry()).items[0].id,"github");
    assert.equal((await client.getMcpConnector("github")).item.id,"github");
    const saved = await client.connectMcpGuided("shopify",{shop:"my-shop"},"Shopify");
    assert.equal(saved.ok,true);
    assert.equal(saved.tools_count,3);
    assert.equal(calls[0].url,"https://gateway.example/v1/mcp/registry?lang=zh");
    assert.equal(calls[1].url,"https://gateway.example/v1/mcp/connectors/github?lang=zh");
    assert.equal(calls[2].url,"https://gateway.example/v1/mcp/connectors/shopify/connect");
    assert.deepEqual(JSON.parse(calls[2].options.body),{inputs:{shop:"my-shop"},label:"Shopify"});
    globalThis.fetch = async () => new Response(JSON.stringify({detail:[{msg:"Invalid shop name"}]}),{status:422});
    assert.equal((await client.connectMcpGuided("shopify",{shop:"bad"})).error,"Invalid shop name");
    assert.equal((await client.getMcpConnector("missing")).error,"Invalid shop name");
  } finally {
    globalThis.fetch = savedFetch;
    if(savedDocument) Object.defineProperty(globalThis,"document",savedDocument); else delete globalThis.document;
  }
});
