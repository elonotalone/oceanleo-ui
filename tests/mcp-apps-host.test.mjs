// MCP Apps 宿主（W14，2026-09-20）的判据。`_COMMON.md §3.10` 是最高优先级：
//
//   1. 沙箱：装第三方 HTML 的 frame 永不同时拿到 allow-scripts 与 allow-same-origin；
//      `AppFrame.tsx` 的 iframe 写字面串且与 `MCP_APP_FRAME_SANDBOX` 相等；
//   2. origin 双向校验：hello 三段闸（source / origin / 信封）缺一不可；
//      `targetOrigin` 永不为 `*`；宿主对 frame 一次也不调 `window.postMessage`；
//   3. `oceanleo.com`（任何第一方主机）永远不是可信渲染域——写进白名单也拒；
//   4. 降级：网关没端点 / 资源取不到 / 注入空白名单 → 纯文本，不白屏、不弹窗；
//      零可用 App 时 `ComposerAppsBar` 一个字节都不渲染，`LeoComposer` 那一排逐字不变；
//   5. 资源缓存：同一 `ui://` 只取一次（并发也只打一枪）。
//
// 跑法（**必须带 loader**，裸跑 `node --test` 会在加载期打哑整例）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/mcp-apps-host.test.mjs

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import {
  APP_TO_HOST_METHODS,
  HOST_TO_APP_METHODS,
  MCP_APP_FRAME_OPAQUE_ORIGIN,
  MCP_APP_FRAME_SANDBOX,
  MCP_APPS_PROTOCOL,
  MCP_APPS_SANDBOX_ORIGINS,
  UI_METHODS,
  acceptAppFrameMessage,
  appToolsFrom,
  asAppToHostMessage,
  buildAppFrameCsp,
  cspOriginAllowed,
  hostNotification,
  isAcceptableAppFrameSandbox,
  isValidAppSandboxOrigin,
  isValidAppTargetOrigin,
  plainTextOfToolResult,
  sandboxLoadNotification,
} from "../src/shell/mcp-apps/protocol.ts";
import { appResourceFrom, createMcpAppsHost, gatewayTransport } from "../src/shell/mcp-apps/host.ts";
import {
  UNTRUSTED_FRAME_SANDBOX,
  isUntrustedContentHostname,
  sandboxGrantsScriptedSameOrigin,
  sandboxTokens,
} from "../src/shell/editor-sandbox-origin.ts";
import { authClientStubUrl } from "./helpers/auth-client-stub.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { ORG_MCP_STUB_SOURCE } from "./helpers/org-api-stub.mjs";
import { TOAST_BARREL_STUB_SOURCE } from "./helpers/toast-stub.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MCP_APPS_DIR = fileURLToPath(new URL("../src/shell/mcp-apps/", import.meta.url));
const MCP_APPS_SOURCES = Object.fromEntries(
  readdirSync(MCP_APPS_DIR)
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => [name, readFileSync(`${MCP_APPS_DIR}${name}`, "utf8")]),
);

/** 一个允许的承载面（**测试注入**；生产表恰为 `https://mcp-apps.oceanleo.app`）。 */
const PROXY = "https://apps.oceanleo.app";
const ALLOWED = Object.freeze([PROXY]);
const HOST_ORIGIN = "https://chat.oceanleo.com";

// ————————————————————————————————————————————————————————————————
// 1. 沙箱（UC-3）
// ————————————————————————————————————————————————————————————————

test("UC-3 沙箱：MCP App frame 永不同时拿到 allow-scripts 与 allow-same-origin", () => {
  assert.equal(sandboxGrantsScriptedSameOrigin(MCP_APP_FRAME_SANDBOX), false);
  assert.ok(!sandboxTokens(MCP_APP_FRAME_SANDBOX).has("allow-same-origin"));
  assert.ok(sandboxTokens(MCP_APP_FRAME_SANDBOX).has("allow-scripts"), "没脚本的界面不是 App");
  // 令牌集是 UNTRUSTED_FRAME_SANDBOX 的子集：比既有不可信档更严，不许更松。
  const ceiling = sandboxTokens(UNTRUSTED_FRAME_SANDBOX);
  for (const token of sandboxTokens(MCP_APP_FRAME_SANDBOX)) {
    assert.ok(ceiling.has(token), `${token} 不在 UNTRUSTED_FRAME_SANDBOX 里`);
  }
  assert.equal(isAcceptableAppFrameSandbox(MCP_APP_FRAME_SANDBOX), true);
  // 两者同现 → 判据必须红。
  assert.equal(isAcceptableAppFrameSandbox("allow-scripts allow-same-origin"), false);
  assert.equal(isAcceptableAppFrameSandbox("allow-same-origin allow-forms allow-scripts"), false);
  assert.equal(isAcceptableAppFrameSandbox("allow-same-origin"), false, "单给同源也不行");
  assert.equal(isAcceptableAppFrameSandbox("allow-scripts allow-modals"), false, "超出天花板的令牌拒");
});

test("UC-3 AppFrame.tsx 的 iframe 写字面 sandbox，且与 MCP_APP_FRAME_SANDBOX 逐字相等；整目录只此一个 iframe", () => {
  const frame = MCP_APPS_SOURCES["AppFrame.tsx"];
  assert.ok(frame, "AppFrame.tsx 必须存在");
  const iframes = frame.match(/<iframe\b/g) ?? [];
  assert.equal(iframes.length, 1, "AppFrame 只允许一个 iframe");
  const literal = frame.match(/\bsandbox="([^"]*)"/g) ?? [];
  assert.deepEqual(literal, [`sandbox="${MCP_APP_FRAME_SANDBOX}"`], "字面串必须与常量逐字相等");
  assert.doesNotMatch(frame, /\bsandbox=\{/, "sandbox 不许是计算值（扫描器会记 DYNAMIC-SANDBOX）");
  for (const [name, text] of Object.entries(MCP_APPS_SOURCES)) {
    if (name === "AppFrame.tsx") continue;
    assert.doesNotMatch(text, /<iframe\b/, `${name} 不许再出 iframe`);
  }
  assert.doesNotMatch(frame, /srcdoc/i, "宿主页不许 srcdoc 装第三方 HTML（那是 oceanleo.app 上 proxy 的事）");
});

// ————————————————————————————————————————————————————————————————
// 2. origin 双向（UC-6）
// ————————————————————————————————————————————————————————————————

test("UC-6 targetOrigin：`*` 恒拒；第一方拒；只有白名单里的 oceanleo.app 承载面放行", () => {
  assert.equal(isValidAppTargetOrigin("*", ALLOWED), false);
  assert.equal(isValidAppTargetOrigin("", ALLOWED), false);
  assert.equal(isValidAppTargetOrigin("/", ALLOWED), false);
  assert.equal(isValidAppTargetOrigin(PROXY, ALLOWED), true);
  assert.equal(isValidAppTargetOrigin(PROXY), false, "非白名单成员拒（全串匹配）");
  assert.equal(
    isValidAppTargetOrigin("https://mcp-apps.oceanleo.app"),
    true,
    "2026-09-20 操作员批准放行",
  );
  assert.equal(isValidAppTargetOrigin("https://other.oceanleo.app", ALLOWED), false, "全串匹配，不按后缀推断");
  assert.equal(isValidAppTargetOrigin("http://apps.oceanleo.app", ALLOWED), false, "不接受明文");
  assert.equal(isValidAppTargetOrigin("https://apps.oceanleo.app:8443", ALLOWED), false, "不接受端口");
  assert.equal(isValidAppTargetOrigin("https://apps.oceanleo.app/", ALLOWED), false, "不是规范 origin");
  assert.equal(isValidAppTargetOrigin("https://u:p@apps.oceanleo.app", ALLOWED), false);
});

test("UC-6 hello 三段闸：source、origin、信封、恰好一个端口，缺一不可", () => {
  const frameWindow = { tag: "contentWindow" };
  const port = { postMessage() {} };
  const instanceId = "mcp-app-1";
  const hello = { protocol: MCP_APPS_PROTOCOL, instanceId, type: "hello" };
  const gate = { expectedOrigin: MCP_APP_FRAME_OPAQUE_ORIGIN, frameWindow, instanceId };
  const ok = { origin: "null", source: frameWindow, data: hello, ports: [port] };

  assert.equal(acceptAppFrameMessage(ok, gate), port, "全对 → 拿到端口");
  assert.equal(acceptAppFrameMessage({ ...ok, source: {} }, gate), null, "source 不是本 frame");
  assert.equal(acceptAppFrameMessage({ ...ok, origin: PROXY }, gate), null, "沙箱 frame 的 origin 只能是 \"null\"");
  assert.equal(acceptAppFrameMessage({ ...ok, origin: HOST_ORIGIN }, gate), null, "第一方 origin 冒充也拒");
  assert.equal(acceptAppFrameMessage({ ...ok, data: { ...hello, instanceId: "x" } }, gate), null);
  assert.equal(acceptAppFrameMessage({ ...ok, data: { ...hello, protocol: "oceanleo.editor.v1" } }, gate), null);
  assert.equal(acceptAppFrameMessage({ ...ok, data: { ...hello, type: "ready" } }, gate), null);
  assert.equal(acceptAppFrameMessage({ ...ok, ports: [] }, gate), null, "没端口拒");
  assert.equal(acceptAppFrameMessage({ ...ok, ports: [port, port] }, gate), null, "两个端口拒");
  assert.equal(acceptAppFrameMessage({ ...ok, ports: [{}] }, gate), null, "不是端口拒");
  assert.equal(acceptAppFrameMessage(ok, { ...gate, expectedOrigin: "*" }), null, "预期 origin 不许是 *");
  assert.equal(acceptAppFrameMessage(ok, { ...gate, frameWindow: null }), null, "frame 还没挂就没有合法来源");
  // 未来承载面拿到真 origin 时：预期值必须命中白名单，第一方永远不行。
  assert.equal(
    acceptAppFrameMessage({ ...ok, origin: PROXY }, { ...gate, expectedOrigin: PROXY, allowedOrigins: ALLOWED }),
    port,
  );
  assert.equal(
    acceptAppFrameMessage({ ...ok, origin: HOST_ORIGIN }, { ...gate, expectedOrigin: HOST_ORIGIN, allowedOrigins: [HOST_ORIGIN] }),
    null,
    "oceanleo.com 写进白名单也拒",
  );
});

test("UC-6 宿主源码：对 frame 一次也不调 window.postMessage；唯一的 postMessage 是 MessagePort 单参", () => {
  const calls = [];
  for (const [name, text] of Object.entries(MCP_APPS_SOURCES)) {
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const match of stripped.matchAll(/(\w+(?:\?\.|\.))?postMessage\s*\(([^)]*)\)/g)) {
      calls.push({ name, receiver: match[1] ?? "", args: match[2] });
    }
  }
  assert.ok(calls.length >= 1, "至少要有端口那一条");
  for (const call of calls) {
    assert.equal(call.receiver, "port.", `${call.name}: postMessage 的接收方只能是 MessagePort，见 ${call.receiver}${call.args}`);
    assert.equal(call.args.split(",").length, 1, `${call.name}: 端口投递是单参，没有 targetOrigin 这个概念`);
    assert.doesNotMatch(call.args, /\*/, "targetOrigin 不得为 *");
  }
  for (const [name, text] of Object.entries(MCP_APPS_SOURCES)) {
    assert.doesNotMatch(text, /contentWindow\s*[?.]*\s*postMessage/, `${name} 不许往 frame 里 window.postMessage`);
    assert.doesNotMatch(text, /postMessage\([^)]*,\s*["'`]\*["'`]/, `${name} targetOrigin 不得为 *`);
  }
});

// ————————————————————————————————————————————————————————————————
// 3. oceanleo.com 永远不是可信渲染域（UC-1 / §3.10）
// ————————————————————————————————————————————————————————————————

test("§3.10 第一方主机永远不是 App 承载面，写进白名单也拒；只有不可信内容域上的白名单成员放行", () => {
  for (const firstParty of ["https://oceanleo.com", "https://chat.oceanleo.com", "https://api.oceanleo.com", "https://www.oceanleo.com"]) {
    assert.equal(isValidAppSandboxOrigin(firstParty, [firstParty]), false, `${firstParty} 写进白名单也拒`);
    assert.equal(isUntrustedContentHostname(new URL(firstParty).hostname), false, "它确实是第一方（所以拒的理由是第一方，不是格式）");
  }
  assert.equal(isValidAppSandboxOrigin(PROXY, ALLOWED), true);
  assert.equal(isUntrustedContentHostname("apps.oceanleo.app"), true, "承载面必须在不可信内容域上");
  assert.equal(isValidAppSandboxOrigin("https://apps.oceanleo.app", []), false, "空表 fail closed");
  assert.equal(isValidAppSandboxOrigin("https://x.leoapp.cn", ["https://x.leoapp.cn"]), true, "境内不可信域同理");
});

test("§3.10 承载面白名单恰为 mcp-apps.oceanleo.app：2026-09-20 操作员批准放行", () => {
  // 2026-09-20 操作员批准放行
  assert.deepEqual(
    [...MCP_APPS_SANDBOX_ORIGINS],
    ["https://mcp-apps.oceanleo.app"],
    "MCP_APPS_SANDBOX_ORIGINS 恰一项",
  );
  assert.ok(Object.isFrozen(MCP_APPS_SANDBOX_ORIGINS));
});

test("CSP：缺省最严；`_meta.ui.csp` 只能加 https 第三方 origin，加不进第一方主机", () => {
  const strict = buildAppFrameCsp();
  assert.ok(strict.startsWith("default-src 'none'"));
  assert.match(strict, /connect-src 'none'/);
  assert.match(strict, /frame-src 'none'/);
  assert.match(strict, /form-action 'none'/);
  assert.match(strict, /base-uri 'none'/);
  const widened = buildAppFrameCsp({
    connectDomains: ["https://api.example.com", "https://api.oceanleo.com", "http://plain.example.com", "*"],
    resourceDomains: ["https://cdn.example.com", "https://chat.oceanleo.com"],
  });
  assert.match(widened, /connect-src https:\/\/api\.example\.com(;|$)/, "只有合法第三方 https origin 进 connect-src");
  assert.doesNotMatch(widened, /oceanleo\.com/, "第一方主机一个都不许进 CSP");
  assert.doesNotMatch(widened, /plain\.example\.com|\*/);
  assert.equal(cspOriginAllowed("https://api.oceanleo.com"), false);
  assert.equal(cspOriginAllowed("https://api.example.com"), true);
});

// ————————————————————————————————————————————————————————————————
// 4. 方法白名单闭集（UC-6）
// ————————————————————————————————————————————————————————————————

test("协议方法集保持最小闭集；没有 proxy-fetch / eval 这类通用代理", () => {
  assert.deepEqual(
    [...APP_TO_HOST_METHODS].sort(),
    ["tools/call", "ui/initialize", "ui/message", "ui/open-link", "ui/notifications/initialized", "ui/notifications/size-changed", "ui/update-model-context"].sort(),
  );
  assert.deepEqual(
    [...HOST_TO_APP_METHODS].sort(),
    ["ui/notifications/sandbox-load", "ui/notifications/tool-input", "ui/notifications/tool-result"].sort(),
  );
  assert.equal(asAppToHostMessage({ jsonrpc: "2.0", id: 1, method: "proxy-fetch", params: { url: "https://x" } }), null);
  assert.equal(asAppToHostMessage({ jsonrpc: "2.0", id: 1, method: "ui/notifications/tool-result" }), null, "host→app 的方法不许反向来");
  assert.equal(asAppToHostMessage({ jsonrpc: "2.0", method: "tools/call", params: { name: "x" } }), null, "tools/call 必须带 id");
  assert.equal(asAppToHostMessage({ jsonrpc: "1.0", id: 1, method: "ui/initialize" }), null);
  assert.ok(asAppToHostMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "x", arguments: { a: 1 } } }));
  assert.ok(asAppToHostMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized" }));
  assert.equal(hostNotification("ui/evil", {}), null, "宿主自己发的也过白名单");
  assert.ok(hostNotification(UI_METHODS.TOOL_RESULT, { result: {} }));
  assert.equal(sandboxLoadNotification({ html: "<p>x</p>", csp: "script-src *", resourceUri: "ui://a/b" }), null, "CSP 不是 buildAppFrameCsp 的形状就拒");
  assert.equal(sandboxLoadNotification({ html: "<p>x</p>", csp: buildAppFrameCsp(), resourceUri: "https://a/b" }), null, "只认 ui://");
  assert.ok(sandboxLoadNotification({ html: "<p>x</p>", csp: buildAppFrameCsp(), resourceUri: "ui://a/b" }));
});

// ————————————————————————————————————————————————————————————————
// 5. 宿主桥接：过滤、缓存、降级
// ————————————————————————————————————————————————————————————————

function fakeTransport(overrides = {}) {
  const calls = { listTools: 0, readResource: [], callTool: [] };
  const transport = {
    async listTools() {
      calls.listTools += 1;
      return overrides.listTools ? overrides.listTools() : { tools: [] };
    },
    async readResource(connectorId, uri) {
      calls.readResource.push([connectorId, uri]);
      return overrides.readResource ? overrides.readResource(connectorId, uri) : { contents: [] };
    },
    async callTool(connectorId, name, args) {
      calls.callTool.push([connectorId, name, args]);
      return overrides.callTool ? overrides.callTool(connectorId, name, args) : { content: [{ type: "text", text: `ran ${name}` }] };
    },
  };
  return { transport, calls };
}

const TOOL_ROW = {
  connector_id: "conn-1",
  name: "make_chart",
  title: "画图表",
  _meta: { ui: { resourceUri: "ui://charts/main" } },
};
const RESOURCE_OK = {
  contents: [{ uri: "ui://charts/main", mimeType: "text/html;profile=mcp-app", text: "<!doctype html><p>chart</p>" }],
};

test("tools/list 过滤：只留带 _meta.ui.resourceUri 的行；形状不对跳过不抛", () => {
  const tools = appToolsFrom([
    TOOL_ROW,
    { connector_id: "conn-1", name: "plain_tool" },
    { connector_id: "conn-1", name: "bad_uri", _meta: { ui: { resourceUri: "https://evil/x" } } },
    { name: "no_connector", _meta: { ui: { resourceUri: "ui://a/b" } } },
    null,
    "junk",
  ]);
  assert.deepEqual(tools.map((tool) => tool.name), ["make_chart"]);
  assert.deepEqual(appToolsFrom(null), []);
});

test("降级：网关没端点（404 / 网络错）→ 零可用；不抛", async () => {
  const gone = createMcpAppsHost({
    transport: {
      listTools: async () => {
        throw new Error("gateway 404");
      },
      readResource: async () => {
        throw new Error("gateway 404");
      },
      callTool: async () => {
        throw new Error("gateway 404");
      },
    },
  });
  assert.deepEqual(await gone.listAppTools(), []);
  const tool = appToolsFrom([TOOL_ROW])[0];
  assert.equal(await gone.readAppResource(tool), null);
  assert.equal(gone.renderModeFor(null), "text");
  assert.equal(gone.sandboxOrigin(), "https://mcp-apps.oceanleo.app", "2026-09-20 操作员批准放行");
  const empty = createMcpAppsHost({
    allowedOrigins: [],
    transport: {
      listTools: async () => [],
      readResource: async () => null,
      callTool: async () => null,
    },
  });
  assert.equal(empty.sandboxOrigin(), "", "注入空表仍无承载面");
  assert.equal(empty.renderModeFor({ uri: "ui://charts/main", html: "<p>x</p>" }), "text");
});

test("resources/read：MIME 必须恰是 text/html;profile=mcp-app，否则当没有界面", () => {
  assert.ok(appResourceFrom(RESOURCE_OK, "ui://charts/main"));
  assert.equal(appResourceFrom({ contents: [{ uri: "ui://charts/main", mimeType: "text/html", text: "<p>" }] }, "ui://charts/main"), null);
  assert.equal(appResourceFrom({ contents: [{ uri: "ui://other", mimeType: "text/html;profile=mcp-app", text: "<p>" }] }, "ui://charts/main"), null, "回来的 uri 不是要的那一条");
  assert.equal(appResourceFrom({ contents: [] }, "ui://charts/main"), null);
  assert.equal(appResourceFrom({ contents: [{ mimeType: "text/html;profile=mcp-app", text: "" }] }, "ui://charts/main"), null, "空 HTML 不是界面");
  assert.equal(appResourceFrom("<p>", "ui://charts/main"), null);
});

test("缓存：同一 (连接, ui://) 只取一次，并发两次也只打一枪；失败不留缓存", async () => {
  const { transport, calls } = fakeTransport({ readResource: () => RESOURCE_OK });
  const host = createMcpAppsHost({ transport, allowedOrigins: ALLOWED });
  const tool = appToolsFrom([TOOL_ROW])[0];
  const [a, b] = await Promise.all([host.readAppResource(tool), host.readAppResource(tool)]);
  const c = await host.readAppResource(tool);
  assert.equal(calls.readResource.length, 1, "三次读只许打一枪");
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(a.html, "<!doctype html><p>chart</p>");
  assert.equal(host.cachedResourceCount(), 1);
  assert.equal(host.renderModeFor(a), "frame", "有 HTML + 有白名单承载面 → frame");
  assert.equal(host.renderModeFor(a, "https://oceanleo.com"), "text", "第一方承载面 → 纯文本");

  let fail = true;
  const flaky = fakeTransport({
    readResource: () => {
      if (fail) throw new Error("500");
      return RESOURCE_OK;
    },
  });
  const flakyHost = createMcpAppsHost({ transport: flaky.transport });
  assert.equal(await flakyHost.readAppResource(tool), null);
  assert.equal(flakyHost.cachedResourceCount(), 0, "失败不留在缓存里");
  fail = false;
  assert.ok(await flakyHost.readAppResource(tool), "下一次再试拿得到");
  assert.equal(flaky.calls.readResource.length, 2);
});

test("tools/call 代理：带连接 id 回网关；超时抛错而不是挂死", async () => {
  const { transport, calls } = fakeTransport();
  const host = createMcpAppsHost({ transport, timeoutMs: 20 });
  const result = await host.callAppTool("conn-1", "make_chart", { kind: "bar" });
  assert.deepEqual(calls.callTool, [["conn-1", "make_chart", { kind: "bar" }]]);
  assert.equal(plainTextOfToolResult(result), "ran make_chart");
  const slow = createMcpAppsHost({
    transport: { ...transport, callTool: () => new Promise(() => {}) },
    timeoutMs: 20,
  });
  await assert.rejects(slow.callAppTool("conn-1", "x", {}), /timed out/);
});

// ————————————————————————————————————————————————————————————————
// 6. DOM：AppFrame 与 ComposerAppsBar / LeoComposer
// ————————————————————————————————————————————————————————————————

const uiStub = dataModule("export function useUI(){ return (zh) => zh; }");
// host.ts 只要 accessToken；LeoComposer → guide-context → workflows 还要
// browserClient。同一份桩按解析后的路径套到整张图上，缺一个具名导出就会在
// 加载期打哑后面所有 DOM 例（父 agent 实测 15 里那 1 红就是这条）。
const authClientStub = dataModule(`
  export * from ${JSON.stringify(authClientStubUrl)};
  export function desktopBrowserLoginAvailable(){return false;}
  export async function startDesktopBrowserSignIn(){return {};}
`);
const OVERRIDES = {
  "../../i18n/ui/useUI": uiStub,
  "../i18n/ui/useUI": uiStub,
  "../../lib/auth/client": authClientStub,
  "../lib/auth/client": authClientStub,
  "../lib/org-api": dataModule(`
    export async function listMyOrgs(){ return []; }
    export async function getOrg(){ throw new Error('no'); }
    ${ORG_MCP_STUB_SOURCE}
  `),
  "../ui/Toast": dataModule(`
    ${TOAST_BARREL_STUB_SOURCE}
    export function useToast(){ return { show(){}, info(){}, success(){}, error(){}, loading(){}, dismiss(){}, dismissAll(){} }; }
  `),
  "next/navigation": dataModule(
    "export function useRouter(){ return { push(){}, replace(){}, refresh(){}, back(){} }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(); }\n" +
      "export function usePathname(){ return '/'; }",
  ),
  "./ModelPicker": dataModule("export function ModelGroupPicker(){ return null; }"),
  "./mobile-native-actions": dataModule(
    "export function requestTaskNotificationsOnce(){}\n" +
      "export function useNativeAttachActions(){ return []; }\n" +
      "export function useNativeHandoffEntry(){ return { action: null, panel: null }; }\n" +
      "export function useNativeTaskNotifications(){}\n",
  ),
  "./LeoEntryButton": dataModule(`
    import { createElement } from ${JSON.stringify(reactUrl)};
    export function LeoEntryButton() {
      return createElement("button", {
        type: "button",
        "data-oceanleo-leo-entry": "",
        "aria-label": "leo",
      }, "leo");
    }
  `),
  "./PromptHighlightArea": dataModule(`
    import { createElement, forwardRef } from "${reactUrl}";
    export const PromptHighlightArea = forwardRef(function PromptHighlightArea(props, _ref){
      return createElement("textarea", { placeholder: props.placeholder, defaultValue: props.value || "", readOnly: true });
    });
    export const TemplateFillArea = PromptHighlightArea;
  `),
};
const lazyStub = dataModule(
  "const noop = () => undefined;\nexport default new Proxy(noop, { get: () => noop });\nexport const __stub = true;\n",
);

async function load(rel) {
  return import(await compileModule(`src/shell/${rel}`, OVERRIDES, { missingPackageStub: lazyStub }));
}

const { AppFrame, appFrameSrc } = await load("mcp-apps/AppFrame.tsx");
const { ComposerAppsBar } = await load("mcp-apps/ComposerAppsBar.tsx");
const { createMcpAppsHost: createHostForDom } = await load("mcp-apps/host.ts");
const transcriptUrl = await compileModule("src/shell/mcp-apps/TranscriptApp.tsx", OVERRIDES);
const { McpAppConversationProvider, TranscriptApp, transcriptAppCall } = await import(transcriptUrl);
const { AgentProgress } = await import(await compileModule("src/shell/AgentProgress.tsx", {
  ...OVERRIDES, "./mcp-apps/TranscriptApp": transcriptUrl,
}));
const { LeoComposer } = await load("LeoComposer.tsx");

async function withDom(run) {
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
    url: `${HOST_ORIGIN}/`,
    virtualConsole,
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
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

  // 抓住宿主挂到 window 上的 "message" 监听器：jsdom 没有 MessagePort，握手用
  // 一个手工端口直接喂给监听器，判的是宿主怎么处理，不是 jsdom 会不会投递。
  const messageListeners = [];
  const originalAdd = window.addEventListener.bind(window);
  window.addEventListener = (type, listener, options) => {
    if (type === "message") messageListeners.push(listener);
    return originalAdd(type, listener, options);
  };

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const settle = () => act(async () => {});
  const render = async (Component, props) => {
    await act(async () => root.render(React.createElement(Component, props)));
    await settle();
  };
  try {
    return await run({
      window,
      render,
      settle,
      container,
      messageListeners,
      html: () => container.innerHTML,
      find: (selector) => container.querySelector(selector),
      findAll: (selector) => [...container.querySelectorAll(selector)],
      click: (selector) => {
        const node = container.querySelector(selector);
        assert.ok(node, `点不到 ${selector}`);
        return act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      },
    });
  } finally {
    await act(async () => root.unmount());
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

const noopToolCall = async () => ({});

test("AppFrame 降级：没有 HTML → 纯文本结果，没有 iframe，不白屏", async () => {
  await withDom(async ({ render, find, container }) => {
    await render(AppFrame, {
      resourceUri: "ui://charts/main",
      html: null,
      toolResult: { content: [{ type: "text", text: "柱状图已生成" }] },
      onToolCall: noopToolCall,
    });
    assert.equal(find("iframe"), null);
    assert.ok(find("[data-mcp-app-fallback]"));
    assert.match(container.textContent, /柱状图已生成/);
  });
});

test("AppFrame 降级：有 HTML 但注入空白名单 → 仍是纯文本，fail closed", async () => {
  await withDom(async ({ render, find, container }) => {
    await render(AppFrame, {
      resourceUri: "ui://charts/main",
      html: "<!doctype html><script>alert(1)</script>",
      toolResult: "text only",
      onToolCall: noopToolCall,
      hostOrigin: HOST_ORIGIN,
      allowedOrigins: [],
    });
    assert.equal(find("iframe"), null, "空白名单不许出 iframe");
    assert.match(container.textContent, /text only/);
    assert.doesNotMatch(container.innerHTML, /<script/, "第三方 HTML 一个字节都不进宿主 DOM");
  });
});

test("AppFrame 生产白名单：有 HTML + 第一方宿主 → iframe 指向 mcp-apps.oceanleo.app", async () => {
  await withDom(async ({ render, find }) => {
    await render(AppFrame, {
      resourceUri: "ui://charts/main",
      html: "<!doctype html><p>chart</p>",
      onToolCall: noopToolCall,
      hostOrigin: HOST_ORIGIN,
    });
    const iframe = find("iframe");
    assert.ok(iframe, "2026-09-20 操作员批准放行后生产态出 iframe");
    assert.ok(iframe.getAttribute("src").startsWith("https://mcp-apps.oceanleo.app/mcp-app#"));
    assert.equal(iframe.getAttribute("sandbox"), MCP_APP_FRAME_SANDBOX);
  });
});

test("appFrameSrc：承载面 / 宿主 origin 任一不合规 → 空串（没有 src 就没有 frame）", () => {
  const base = { sandboxOrigin: PROXY, hostOrigin: HOST_ORIGIN, instanceId: "i1", allowedOrigins: ALLOWED };
  const src = appFrameSrc(base);
  assert.ok(src.startsWith(`${PROXY}/mcp-app#`), src);
  assert.match(src, /instance=i1/);
  assert.match(src, /host=https%3A%2F%2Fchat\.oceanleo\.com/);
  assert.equal(appFrameSrc({ ...base, allowedOrigins: [] }), "", "空白名单");
  assert.equal(appFrameSrc({ ...base, sandboxOrigin: "https://oceanleo.com", allowedOrigins: ["https://oceanleo.com"] }), "", "第一方承载面");
  assert.equal(appFrameSrc({ ...base, sandboxOrigin: "*" }), "");
  assert.equal(appFrameSrc({ ...base, hostOrigin: "https://evil.example.com" }), "", "宿主页不是第一方");
  assert.equal(appFrameSrc({ ...base, hostOrigin: "http://chat.oceanleo.com" }), "", "宿主页不是 https");
  assert.equal(appFrameSrc({ ...base, hostOrigin: "null" }), "", "宿主页自己是 opaque 时不嵌");
  assert.equal(appFrameSrc({ ...base, instanceId: "" }), "");
});

test("AppFrame 出 frame（注入白名单）：字面沙箱、src 指向承载面、握手后端口先收 sandbox-load，再按规范应答", async () => {
  await withDom(async ({ render, find, messageListeners, settle }) => {
    const toolCalls = [];
    const messages = [];
    const contexts = [];
    await render(AppFrame, {
      resourceUri: "ui://charts/main",
      html: "<!doctype html><p>chart</p>",
      csp: { connectDomains: ["https://api.example.com", "https://api.oceanleo.com"] },
      toolInput: { kind: "bar" },
      toolResult: { content: [{ type: "text", text: "r1" }] },
      onToolCall: async (name, args) => {
        toolCalls.push([name, args]);
        return { content: [{ type: "text", text: "called" }] };
      },
      onMessage: (text) => messages.push(text),
      onContextUpdate: (ctx) => contexts.push(ctx),
      allowedOrigins: ALLOWED,
      hostOrigin: HOST_ORIGIN,
    });
    const iframe = find("iframe");
    assert.ok(iframe, "白名单有承载面且有 HTML → 出 iframe");
    assert.equal(iframe.getAttribute("sandbox"), MCP_APP_FRAME_SANDBOX);
    assert.equal(sandboxGrantsScriptedSameOrigin(iframe.getAttribute("sandbox")), false);
    assert.ok(iframe.getAttribute("src").startsWith(`${PROXY}/mcp-app#`));
    assert.equal(iframe.getAttribute("referrerpolicy"), "no-referrer");
    const instanceId = iframe.getAttribute("data-mcp-app-instance");
    assert.ok(instanceId);
    assert.equal(messageListeners.length, 1, "宿主只挂一个 message 监听");
    const [listener] = messageListeners;

    const sent = [];
    const port = { postMessage: (m) => sent.push(m), start() {}, close() {}, onmessage: null };
    const hello = { protocol: MCP_APPS_PROTOCOL, instanceId, type: "hello" };
    const fromFrame = (event) => act(async () => listener(event));

    // 错的 hello 全部不收：源不对、origin 不对、instance 不对。
    await fromFrame({ origin: "null", source: {}, data: hello, ports: [port] });
    await fromFrame({ origin: PROXY, source: iframe.contentWindow, data: hello, ports: [port] });
    await fromFrame({ origin: "null", source: iframe.contentWindow, data: { ...hello, instanceId: "x" }, ports: [port] });
    assert.equal(sent.length, 0, "闸门没过之前宿主不往任何端口投一个字节");

    await fromFrame({ origin: "null", source: iframe.contentWindow, data: hello, ports: [port] });
    assert.equal(sent.length, 1, "握手后第一条是 sandbox-load");
    assert.equal(sent[0].method, UI_METHODS.SANDBOX_LOAD);
    assert.equal(sent[0].params.html, "<!doctype html><p>chart</p>");
    assert.match(sent[0].params.csp, /^default-src 'none'/);
    assert.match(sent[0].params.csp, /connect-src https:\/\/api\.example\.com/);
    assert.doesNotMatch(sent[0].params.csp, /oceanleo\.com/, "第一方主机进不了 CSP");
    assert.ok(typeof port.onmessage === "function", "宿主接管端口");

    const fromApp = (data) => act(async () => port.onmessage({ data }));
    await fromApp({ jsonrpc: "2.0", id: 1, method: UI_METHODS.INITIALIZE, params: {} });
    const init = sent.at(-1);
    assert.equal(init.id, 1);
    assert.ok(init.result.hostCapabilities["io.modelcontextprotocol/ui"], "能力协商键");
    await fromApp({ jsonrpc: "2.0", method: UI_METHODS.INITIALIZED });
    const methods = sent.map((m) => m.method).filter(Boolean);
    assert.ok(methods.includes(UI_METHODS.TOOL_INPUT), "initialized 后推 tool-input");
    assert.ok(methods.includes(UI_METHODS.TOOL_RESULT), "initialized 后推 tool-result");
    assert.deepEqual(sent.find((m) => m.method === UI_METHODS.TOOL_INPUT).params, { arguments: { kind: "bar" } });

    await fromApp({ jsonrpc: "2.0", id: 2, method: UI_METHODS.TOOLS_CALL, params: { name: "make_chart", arguments: { kind: "pie" } } });
    await settle();
    assert.deepEqual(toolCalls, [["make_chart", { kind: "pie" }]], "tools/call 代理给宿主回调（→ 网关），不直连 MCP 服务器");
    const callReply = sent.find((m) => m.id === 2);
    assert.equal(plainTextOfToolResult(callReply.result), "called");

    await fromApp({ jsonrpc: "2.0", id: 3, method: UI_METHODS.MESSAGE, params: { text: "把它加进报告" } });
    assert.deepEqual(messages, ["把它加进报告"]);
    await fromApp({ jsonrpc: "2.0", id: 4, method: UI_METHODS.UPDATE_MODEL_CONTEXT, params: { selected: "Q3" } });
    assert.deepEqual(contexts, [{ selected: "Q3" }]);

    const before = sent.length;
    await fromApp({ jsonrpc: "2.0", id: 5, method: "proxy-fetch", params: { url: "https://evil" } });
    await fromApp({ jsonrpc: "2.0", id: 6, method: "ui/notifications/tool-result", params: {} });
    await fromApp("junk");
    assert.equal(sent.length, before, "白名单外的方法一律丢，连 error 都不回（不给探测面）");

    await fromApp({ jsonrpc: "2.0", method: UI_METHODS.SIZE_CHANGED, params: { height: 99999 } });
    assert.equal(iframe.style.height, "720px", "尺寸夹在上限内");
    await fromApp({ jsonrpc: "2.0", method: UI_METHODS.SIZE_CHANGED, params: { height: 300 } });
    assert.equal(iframe.style.height, "300px");

    // 第二个 hello（比如 frame 被导航走又回来）不许再接管：一个实例一个端口。
    const sent2 = [];
    const port2 = { postMessage: (m) => sent2.push(m), start() {}, close() {}, onmessage: null };
    await fromFrame({ origin: "null", source: iframe.contentWindow, data: hello, ports: [port2] });
    assert.equal(sent2.length, 0);
  });
});

test("ComposerAppsBar：零可用 App 一个字节都不渲染（今天全部用户都在这一支）", async () => {
  await withDom(async ({ render, html }) => {
    const { transport } = fakeTransport();
    await render(ComposerAppsBar, { host: createHostForDom({ transport }) });
    assert.equal(html(), "");
  });
  await withDom(async ({ render, html }) => {
    await render(ComposerAppsBar, {
      host: createHostForDom({
        transport: {
          listTools: async () => {
            throw new Error("gateway 404");
          },
          readResource: async () => null,
          callTool: async () => null,
        },
      }),
    });
    assert.equal(html(), "", "网关没端点也是零可用");
  });
});

test("A6 LeoComposer：零可用 App 时挂不挂 ComposerAppsBar，innerHTML 逐字相同；PayerSelector 仍在", async () => {
  const { transport } = fakeTransport();
  const props = { value: "做个网站", onChange() {}, onSubmit() {}, onAttachFiles() {}, leoSuggest: true };
  await withDom(async ({ render, html, find }) => {
    await render(LeoComposer, { ...props, showAppsBar: true, appsHost: createHostForDom({ transport }) });
    const withBar = html();
    const attachmentButton = find('button[aria-label="添加附件"]');
    const menuId = attachmentButton.getAttribute("aria-controls");
    assert.ok(menuId, "the attachment trigger retains its ARIA control identity");
    await render(LeoComposer, { ...props, showAppsBar: false });
    const withoutBar = html();
    assert.equal(find('button[aria-label="添加附件"]'), attachmentButton, "compare the same mounted composer");
    assert.equal(attachmentButton.getAttribute("aria-controls"), menuId);
    assert.ok(withoutBar.length > 0);
    assert.equal(withBar, withoutBar, "没有可用 App 的用户，输入框这一排的渲染差异必须为零");
    assert.doesNotMatch(withBar, /data-composer-apps-bar/);
  });
});

test("A6 LeoComposer：有带界面的工具 → 左组出「应用」键，点开一排入口；降级点开出工具纯文本；ui/message 追加进输入框", async () => {
  const { transport, calls } = fakeTransport({
    listTools: () => ({ tools: [TOOL_ROW, { ...TOOL_ROW, name: "summarize", title: "总结" }] }),
    readResource: () => ({ contents: [{ uri: "ui://charts/main", mimeType: "text/html", text: "<p>" }] }), // 不是 mcp-app MIME → 降级
    callTool: (_c, name) => ({ content: [{ type: "text", text: `结果：${name}` }] }),
  });
  await withDom(async ({ render, find, findAll, click, container }) => {
    const changes = [];
    await render(LeoComposer, {
      value: "做个网站",
      onChange: (v) => changes.push(v),
      onSubmit() {},
      appsHost: createHostForDom({ transport }),
    });
    const bar = find("[data-composer-apps-bar]");
    assert.ok(bar, "有可用 App 时入口必须出现");
    const leftGroup = find(".flex-wrap");
    assert.ok(leftGroup.contains(bar), "挂在会换行的左组，不与发送键争宽度");
    assert.ok(find("[data-payer-selector]") === null, "此人没组织，PayerSelector 仍是 null（W12 的面没被动）");
    const send = find('button[aria-label="发送"]');
    assert.ok(send && !leftGroup.contains(send));

    await click('[data-composer-apps-bar] button[aria-label="应用"]');
    const items = findAll("[data-composer-app]");
    assert.deepEqual(items.map((n) => n.textContent.trim()), ["画图表", "总结"]);

    await click('[data-composer-app="make_chart"]');
    // readResource → 非 mcp-app → 降级 → callTool({}) → 纯文本
    for (let i = 0; i < 5 && !find("[data-mcp-app-fallback]"); i += 1) await act(async () => {});
    assert.equal(find("iframe"), null, "降级不出 iframe");
    assert.ok(find("[data-mcp-app-fallback]"));
    assert.match(container.textContent, /结果：make_chart/);
    assert.deepEqual(calls.callTool, [["conn-1", "make_chart", {}]]);
    assert.equal(calls.readResource.length, 1);
    assert.equal(changes.length, 0, "点开应用不动输入框内容");
  });
});

// UC-NONE: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Plain-text result concatenation and JSON fallback format strings only; this case creates no HTML or iframe surface.
test("plainTextOfToolResult：content 文本块拼接；没有就 JSON；空→空串", () => {
  assert.equal(plainTextOfToolResult({ content: [{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }] }), "a\nb");
  assert.equal(plainTextOfToolResult("s"), "s");
  assert.equal(plainTextOfToolResult({ x: 1 }), '{"x":1}');
  assert.equal(plainTextOfToolResult(undefined), "", "没有结果就没有文本，不许把 null 字样摆给用户");
  assert.equal(plainTextOfToolResult(null), "");
});

// Parity U4: exact G3 I2 stored row; reopening uses this, not another tool call.
const STORED_APP_ROW = {
  id: 123, task_id: "task-1", user_id: "owner-1", role: "assistant", kind: "step", content: "Gallery",
  meta: { tool: "mcp__demo__gallery", status: "done", verified: true, error: "", gateway_tool_tier: true,
    mcp_app: { connector_id: "demo", tool: "gallery", resource_uri: "ui://demo/gallery.html", arguments: { query: "invitation" },
      result: { content: [{ type: "text", text: "2 templates" }], structuredContent: { templates: [{ id: "a" }, { id: "b" }] }, isError: false } } },
};
function transcriptHost(overrides = {}) {
  const calls = { reads: [], tools: [] };
  const host = createHostForDom({ transport: {
    listTools: async () => { throw new Error("transcript must not need tools/list"); },
    readResource: async (connector, uri) => {
      calls.reads.push([connector, uri]);
      if (overrides.readResource) return overrides.readResource(connector, uri);
      return { contents: [{ uri, mimeType: "text/html;profile=mcp-app", text: "<p>Templates</p>" }] };
    },
    callTool: async (...args) => { calls.tools.push(args); return { content: [{ type: "text", text: "picked" }] }; },
  } });
  return { host, calls };
}
function TranscriptFixture({ host, row = STORED_APP_ROW, messages, isOwner = true, onMessage = () => {} }) {
  const child = messages
    ? React.createElement(AgentProgress, { messages, running: true })
    : React.createElement(TranscriptApp, { call: transcriptAppCall(row), fallback: React.createElement("p", { "data-tool-fallback": "" }, row.content) });
  return React.createElement(McpAppConversationProvider, { value: { taskId: "task-1", host, isOwner, onMessage } }, child);
}
async function connectTranscriptFrame({ find, messageListeners }) {
  const frame = find("iframe");
  assert.ok(frame);
  const sent = [];
  const port = { postMessage: (message) => sent.push(message), start() {}, close() {}, onmessage: null };
  await act(async () => messageListeners.at(-1)({ origin: "null", source: frame.contentWindow,
    data: { protocol: MCP_APPS_PROTOCOL, instanceId: frame.dataset.mcpAppInstance, type: "hello" }, ports: [port] }));
  const fromApp = (data) => act(async () => port.onmessage({ data }));
  await fromApp({ jsonrpc: "2.0", id: "init", method: UI_METHODS.INITIALIZE, params: {} });
  await fromApp({ jsonrpc: "2.0", method: UI_METHODS.INITIALIZED });
  return { frame, sent, fromApp };
}

test("I2 stored row: accepts cloud app metadata, leaves native and malformed tool rows as text", () => {
  const call = transcriptAppCall(STORED_APP_ROW);
  assert.equal(call.connectorId, "demo");
  assert.deepEqual(call.arguments, { query: "invitation" });
  assert.deepEqual(call.result, STORED_APP_ROW.meta.mcp_app.result);
  assert.equal(transcriptAppCall({ ...STORED_APP_ROW, meta: { ...STORED_APP_ROW.meta, native: true } }), null);
  assert.equal(transcriptAppCall({ ...STORED_APP_ROW, meta: { mcp_app: { ...STORED_APP_ROW.meta.mcp_app, resource_uri: "https://bad" } } }), null);
  assert.equal(transcriptAppCall({ ...STORED_APP_ROW, role: "user" }), null);
});

test("transcript: mounts interface at tool position outside surrounding process folds", async () => {
  await withDom(async (dom) => {
    const { host, calls } = transcriptHost();
    const before = { id: 122, role: "assistant", kind: "step", content: "Before", meta: { tool: "search", status: "done" } };
    const after = { ...before, id: 124, content: "After" };
    await dom.render(TranscriptFixture, { host, messages: [before, STORED_APP_ROW, after] });
    const app = dom.find("[data-transcript-mcp-app]");
    assert.ok(app.querySelector("iframe"));
    assert.equal(app.closest("[data-agent-process]"), null, "interface cannot be hidden in a closed process fold");
    const order = dom.findAll("[data-agent-process], [data-transcript-mcp-app]");
    assert.equal(order[1], app);
    assert.equal(order.length, 3);
    assert.match(app.textContent, /Demo/);
    assert.ok(app.querySelector("[data-connector-icon]"));
    assert.deepEqual(calls.reads, [["demo", "ui://demo/gallery.html"]]);
    assert.deepEqual(calls.tools, []);
    const frame = app.querySelector("iframe");
    await dom.render(TranscriptFixture, { host, messages: [before, structuredClone(STORED_APP_ROW), { ...after, content: "After streamed chunk" }] });
    assert.equal(dom.find("iframe"), frame, "streamed process chunks retain the call's frame");
  });
});

test("transcript: replay sends stored arguments and full result; ui/message uses the task send and tools/call stays scoped", async () => {
  await withDom(async (dom) => {
    const { host, calls } = transcriptHost();
    const sentByComposer = [];
    const onMessage = async (text) => { sentByComposer.push(text); };
    await dom.render(TranscriptFixture, { host, onMessage, row: structuredClone(STORED_APP_ROW) });
    const { sent, fromApp } = await connectTranscriptFrame(dom);
    assert.deepEqual(sent.find((m) => m.method === UI_METHODS.TOOL_INPUT).params, { arguments: { query: "invitation" } });
    assert.deepEqual(sent.find((m) => m.method === UI_METHODS.TOOL_RESULT).params, STORED_APP_ROW.meta.mcp_app.result);
    assert.equal(sent.find((m) => m.method === UI_METHODS.TOOL_RESULT).params.result, undefined, "no nonstandard result wrapper");
    assert.deepEqual(calls.tools, [], "reopen never repeats tools/call");
    await fromApp({ jsonrpc: "2.0", id: "pick", method: UI_METHODS.MESSAGE,
      params: { role: "user", content: [{ type: "text", text: "Use template a" }, { type: "text", text: "in blue" }] } });
    assert.deepEqual(sentByComposer, ["Use template a\nin blue"]);
    assert.deepEqual(sent.find((m) => m.id === "pick").result, {});
    await fromApp({ jsonrpc: "2.0", id: "tool", method: UI_METHODS.TOOLS_CALL, params: { name: "select_template", arguments: { id: "a" } } });
    assert.deepEqual(calls.tools, [["demo", "select_template", { id: "a" }]]);
    await dom.render(React.Fragment, {});
    await dom.render(TranscriptFixture, { host, onMessage, row: structuredClone(STORED_APP_ROW) });
    assert.ok(dom.find("iframe"));
    assert.equal(calls.reads.length, 1, "resource cache can serve reopened call");
    assert.equal(calls.tools.length, 1, "reopening adds no tool invocation");
  });
});

test("transcript: send failure is returned to app without claiming delivery", async () => {
  await withDom(async (dom) => {
    const { host } = transcriptHost();
    await dom.render(TranscriptFixture, { host, onMessage: async () => { throw new Error("send refused"); } });
    const { sent, fromApp } = await connectTranscriptFrame(dom);
    await fromApp({ jsonrpc: "2.0", id: "failed", method: UI_METHODS.MESSAGE, params: { role: "user", content: [{ type: "text", text: "pick" }] } });
    assert.deepEqual(sent.find((m) => m.id === "failed").result, { isError: true });
  });
});

test("transcript: unreadable resource, wrong MIME and non-owner retain tool text without another tool invocation", async () => {
  for (const readResource of [async () => { throw new Error("403"); }, async () => ({ contents: [{ uri: "ui://demo/gallery.html", mimeType: "text/html", text: "<p>wrong MIME</p>" }] })]) {
    await withDom(async (dom) => {
      const { host, calls } = transcriptHost({ readResource });
      await dom.render(TranscriptFixture, { host });
      assert.equal(dom.find("iframe"), null);
      assert.match(dom.find("[data-tool-fallback]").textContent, /Gallery/);
      assert.equal(calls.tools.length, 0);
    });
  }
  await withDom(async (dom) => {
    const { host, calls } = transcriptHost();
    await dom.render(TranscriptFixture, { host, isOwner: false });
    assert.equal(dom.find("iframe"), null);
    assert.ok(dom.find("[data-tool-fallback]"));
    assert.equal(calls.reads.length, 0, "non-owner never reads the resource");
  });
});

test("transcript: near-viewport loading defers all offscreen reads, including many tool calls", async () => {
  const original = globalThis.IntersectionObserver;
  const observers = [];
  globalThis.IntersectionObserver = class {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe(element) { this.element = element; }
    disconnect() { this.disconnected = true; }
  };
  try {
    await withDom(async (dom) => {
      const { host, calls } = transcriptHost();
      const rows = Array.from({ length: 12 }, (_, i) => ({ ...STORED_APP_ROW, id: 123 + i,
        meta: { ...STORED_APP_ROW.meta, mcp_app: { ...STORED_APP_ROW.meta.mcp_app, resource_uri: `ui://demo/${i}.html` } } }));
      await dom.render(TranscriptFixture, { host, messages: rows });
      assert.equal(observers.length, 12);
      assert.equal(calls.reads.length, 0);
      assert.equal(dom.findAll("iframe").length, 0);
      await act(async () => observers[4].callback([{ isIntersecting: true }]));
      await dom.settle();
      assert.deepEqual(calls.reads, [["demo", "ui://demo/4.html"]]);
      assert.equal(dom.findAll("iframe").length, 1);
      assert.equal(observers[4].options.rootMargin, "320px");
    });
  } finally {
    if (original === undefined) delete globalThis.IntersectionObserver;
    else globalThis.IntersectionObserver = original;
  }
});

test("transcript: streaming results and expand/collapse retain frame identity; phone width stays bounded", async () => {
  await withDom(async (dom) => {
    const { host, calls } = transcriptHost();
    await dom.render(TranscriptFixture, { host });
    const { frame, sent } = await connectTranscriptFrame(dom);
    Object.defineProperty(dom.window, "innerWidth", { value: 320, configurable: true });
    assert.equal(dom.find("[data-transcript-mcp-app]").style.maxWidth, "100%");
    assert.ok(frame.className.includes("max-w-full"));
    const updated = structuredClone(STORED_APP_ROW);
    updated.meta.mcp_app.result.structuredContent.templates.push({ id: "c" });
    await dom.render(TranscriptFixture, { host, row: updated });
    assert.equal(dom.find("iframe"), frame);
    assert.deepEqual(sent.filter((m) => m.method === UI_METHODS.TOOL_RESULT).at(-1).params, updated.meta.mcp_app.result);
    await dom.click("[data-mcp-app-expand]");
    assert.equal(dom.find("iframe"), frame);
    assert.equal(dom.find("[data-mcp-app-expanded]").style.position, "fixed");
    await act(async () => dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })));
    assert.equal(dom.find("[data-mcp-app-expanded]").dataset.mcpAppExpanded, "false");
    assert.equal(dom.find("iframe"), frame);
    assert.equal(calls.reads.length, 1);
  });
});

test("UC-6 ui/open-link rejects executable links and opens HTTP(S) with noopener; sandbox stays opaque", async () => {
  // Rule mapping: docs/architecture/oceanleo-untrusted-content-isolation.md UC-3 / UC-6.
  for (const url of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "https://user:pass@example.com", "/relative"]) {
    assert.equal(asAppToHostMessage({ jsonrpc: "2.0", id: "x", method: UI_METHODS.OPEN_LINK, params: { url } }), null);
  }
  await withDom(async (dom) => {
    const { host } = transcriptHost();
    await dom.render(TranscriptFixture, { host });
    const { frame, sent, fromApp } = await connectTranscriptFrame(dom);
    const opened = [];
    dom.window.open = (...args) => { opened.push(args); return null; };
    await fromApp({ jsonrpc: "2.0", id: "open", method: UI_METHODS.OPEN_LINK, params: { url: "https://example.com/templates" } });
    assert.deepEqual(opened, [["https://example.com/templates", "_blank", "noopener,noreferrer"]]);
    assert.deepEqual(sent.find((m) => m.id === "open").result, {});
    assert.equal(frame.getAttribute("sandbox"), "allow-scripts allow-forms");
    const frameSource = MCP_APPS_SOURCES["AppFrame.tsx"];
    assert.match(frameSource, /window\.open\(url, "_blank", "noopener,noreferrer"\)/);
    assert.doesNotMatch(frameSource, /contentWindow\??\.postMessage/);
  });
});

test("spec ui/message rejects mixed/non-user content; full gateway results keep their larger outbound budget", () => {
  const message = (params) => asAppToHostMessage({ jsonrpc: "2.0", id: 1, method: UI_METHODS.MESSAGE, params });
  assert.ok(message({ role: "user", content: [{ type: "text", text: "pick" }] }));
  assert.equal(message({ role: "assistant", content: [{ type: "text", text: "pick" }] }), null);
  assert.equal(message({ role: "user", content: [{ type: "image", data: "abc" }] }), null);
  assert.equal(message({ role: "user", content: [{ type: "text", text: " " }] }), null);
  const result = { content: [{ type: "text", text: "x".repeat(250_000) }], structuredContent: { items: [1] } };
  assert.ok(hostNotification(UI_METHODS.TOOL_RESULT, result), "G3 caps stored tool state at 1 MB");
  assert.equal(message({ text: "x".repeat(250_000) }), null, "incoming frame budget stays small");
});

test("transcript gateway transport includes task_id for owner checks on resource reads and tools/call", async () => {
  const requests = [];
  const transport = gatewayTransport({ taskId: "task-1", baseUrl: "https://gateway.example", token: async () => "test-only",
    fetch: async (url, init) => { requests.push([url, JSON.parse(init.body), init.credentials]); return { ok: true, json: async () => ({}) }; },
  });
  await transport.readResource("demo", "ui://demo/gallery.html");
  await transport.callTool("demo", "select", { id: "a" });
  assert.deepEqual(requests.map((r) => r[1]), [
    { connector_id: "demo", uri: "ui://demo/gallery.html", task_id: "task-1" },
    { connector_id: "demo", name: "select", arguments: { id: "a" }, task_id: "task-1" },
  ]);
  assert.ok(requests.every((r) => r[2] === "omit"));
});
