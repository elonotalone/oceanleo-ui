// 域名家族 `ws`（主站分身 oceanbizs.com，2026-09-21）的行为锁。
//
// 事实源：oceandino `docs/architecture/oceanleo-workstation.md` §3。
// 规则：UC-2 / UC-3 / UC-7（docs/architecture/oceanleo-untrusted-content-isolation.md）。
//
// 被锁死的性质：
//   1. `oceanbizs.com` 及其子域 → 家族 ws；`ws.oceanleo.app` 及其子域 → 不属于任何家族；
//   2. ws 页面的会话 / 非会话 cookie 域是 `.oceanbizs.com`，在 `*.ws.oceanleo.app` 上 host-only；
//   3. `NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY=ws` 能选中该家族，且在那个进程里：
//      - 姐妹站清单为空 ⇒ 家族内嵌编辑器白名单为空、整条嵌入路径 fail closed；
//      - Hosted 编辑器 / MCP App 承载面拼在 `ws.oceanleo.app` 上（全串白名单，不是后缀）；
//      - `.com` / `.cn` 的第一方主机在 ws 页面上都不可信（家族互不串门）；
//      - `oceanleo.app` / `leoapp.cn` / `ws.oceanleo.app` 在 ws 页面上同样都不可信。
//   4. 没设 env 的进程（缺省 com）解析结果与加 ws 之前逐字相同：Hosted 六件仍是
//      `*.oceanleo.app`，MCP App 承载面仍是恰一项 `https://mcp-apps.oceanleo.app`。
//
// 违反后果：ws 与 com 互相拿到对方的 cookie 域 = 分身登录态与生产登录态合流；
// `ws.oceanleo.app` 被判成第一方 = 用户代码坐进 SSO cookie 域旁边。

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const LOADER_URL = new URL("./ts-extension-loader.mjs", import.meta.url).href;

function runProbe(probe, env) {
  const child = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      "--experimental-loader",
      LOADER_URL,
      "--input-type=module",
      "-e",
      probe,
    ],
    { encoding: "utf8", env: { ...process.env, ...env } },
  );
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

const FAMILY_URL = new URL("../src/contracts/domain-family.ts", import.meta.url).href;
const CONFIG_URL = new URL("../src/lib/auth/config.ts", import.meta.url).href;
const SANDBOX_URL = new URL("../src/shell/editor-sandbox-origin.ts", import.meta.url).href;
const PROTOCOL_URL = new URL("../src/shell/editor-protocol.ts", import.meta.url).href;
const HOSTED_URL = new URL("../src/shell/hosted-editor-origins.ts", import.meta.url).href;
const MCP_URL = new URL("../src/shell/mcp-apps/protocol.ts", import.meta.url).href;
const DECK_URL = new URL("../src/shell/deck-delivery-family.ts", import.meta.url).href;

// UC-7 §8.7（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：ws 主机判到别的家族，或 ws.oceanleo.app 判到某个家族，cookie 域就跨了 eTLD+1。
test("ws/1 familyForHost / cookie 域：oceanbizs.com 是 ws，ws.oceanleo.app 不属于任何家族", async () => {
  const m = await import("../src/contracts/domain-family.ts");
  const cfg = await import("../src/lib/auth/config.ts");
  assert.deepEqual([...m.DOMAIN_FAMILIES], ["com", "cn", "ws"]);
  assert.equal(m.familyForHost("oceanbizs.com"), "ws");
  assert.equal(m.familyForHost("x.oceanbizs.com"), "ws");
  assert.equal(m.familyForHost("WWW.OCEANBIZS.COM:443"), "ws");
  for (const host of ["ws.oceanleo.app", "a.ws.oceanleo.app", "slides.ws.oceanleo.app"]) {
    assert.equal(m.familyForHost(host), undefined, host);
    assert.equal(m.isUntrustedContentDomainHost(host), true, host);
    assert.equal(m.sharedCookieDomainFor(host), undefined, host);
    assert.equal(cfg.cookieDomainFor(host), undefined, host);
    assert.equal("domain" in cfg.cookieOptions(host), false, host);
    for (const family of m.DOMAIN_FAMILIES) {
      assert.equal(m.isFirstPartyHostOf(host, family), false, `${host}@${family}`);
    }
  }
  assert.equal(m.sharedCookieDomainFor("oceanbizs.com"), ".oceanbizs.com");
  assert.equal(cfg.cookieDomainFor("www.oceanbizs.com"), ".oceanbizs.com");
  assert.equal(cfg.cookieOptions("api.oceanbizs.com").domain, ".oceanbizs.com");
  // 档案字段与架构文档 §3 逐字一致。
  const ws = m.domainFamilyProfile("ws");
  assert.deepEqual(
    {
      registrableDomain: ws.registrableDomain,
      cookieDomain: ws.cookieDomain,
      portalOrigin: ws.portalOrigin,
      gatewayOrigin: ws.gatewayOrigin,
      assetOrigin: ws.assetOrigin,
      untrustedContentDomain: ws.untrustedContentDomain,
      hostedEditorDomain: ws.hostedEditorDomain,
      availableSubsites: [...ws.availableSubsites],
    },
    {
      registrableDomain: "oceanbizs.com",
      cookieDomain: ".oceanbizs.com",
      portalOrigin: "https://oceanbizs.com",
      gatewayOrigin: "https://api.oceanbizs.com",
      assetOrigin: "https://asset.oceanleo.com",
      untrustedContentDomain: "ws.oceanleo.app",
      hostedEditorDomain: "ws.oceanleo.app",
      availableSubsites: [],
    },
  );
  assert.deepEqual(
    [...m.UNTRUSTED_CONTENT_DOMAINS],
    ["oceanleo.app", "leoapp.cn", "ws.oceanleo.app"],
  );
  // com / cn 的 Hosted 域没变。
  assert.equal(m.domainFamilyProfile("com").hostedEditorDomain, "oceanleo.app");
  assert.equal(m.domainFamilyProfile("cn").hostedEditorDomain, "oceanleo.app");
});

// UC-3 §8.3 + UC-6 §8.6 + UC-7 §8.7
// 违反后果：ws 槽位若仍拿到 .com 的内嵌白名单，分身页面就会给生产主机 allow-same-origin 并投 postMessage。
test("ws/2 NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY=ws：选中 ws，嵌入 fail closed，Hosted 面落在 ws.oceanleo.app", () => {
  const probe = `
    const family = await import(${JSON.stringify(FAMILY_URL)});
    const cfg = await import(${JSON.stringify(CONFIG_URL)});
    const sandbox = await import(${JSON.stringify(SANDBOX_URL)});
    const protocol = await import(${JSON.stringify(PROTOCOL_URL)});
    const hosted = await import(${JSON.stringify(HOSTED_URL)});
    const mcp = await import(${JSON.stringify(MCP_URL)});
    const deck = await import(${JSON.stringify(DECK_URL)});
    const comBase = "https://website.oceanleo.com/embed/site-editor";
    let buildThrew = false;
    try {
      protocol.buildEditorEmbedUrl(comBase, { instanceId: "i1", hostOrigin: "https://oceanbizs.com" });
    } catch { buildThrew = true; }
    process.stdout.write(JSON.stringify({
      family: family.currentDomainFamily(),
      configured: family.CONFIGURED_DOMAIN_FAMILY,
      gateway: cfg.GATEWAY_BASE,
      profileGateway: family.currentDomainProfile().gatewayOrigin,
      bases: [...sandbox.TRUSTED_EMBED_EDITOR_BASES],
      origins: [...sandbox.TRUSTED_EMBED_EDITOR_ORIGINS],
      comBaseTrusted: sandbox.isTrustedEmbedEditorBase(comBase),
      comBaseGrantsSameOrigin: sandbox.sandboxGrantsScriptedSameOrigin(
        sandbox.embedEditorFrameSandbox(comBase),
      ),
      buildThrew,
      subsiteOrigin: family.currentFamilySubsiteOrigin("design") ?? null,
      hostedOrigins: [...hosted.HOSTED_EDITOR_ORIGINS],
      hostedProd: hosted.isHostedEditorOrigin("https://slides.oceanleo.app"),
      hostedWs: hosted.isHostedEditorOrigin("https://slides.ws.oceanleo.app"),
      hostedSandbox: sandbox.embedEditorFrameSandbox("https://slides.ws.oceanleo.app"),
      hostedProdSandbox: sandbox.embedEditorFrameSandbox("https://slides.oceanleo.app"),
      mcpOrigins: [...mcp.MCP_APPS_SANDBOX_ORIGINS],
      mcpWsValid: mcp.isValidAppSandboxOrigin("https://mcp-apps.ws.oceanleo.app"),
      mcpProdValid: mcp.isValidAppSandboxOrigin("https://mcp-apps.oceanleo.app"),
      mcpPortalValid: mcp.isValidAppSandboxOrigin("https://oceanbizs.com"),
      deckWs: deck.DECK_HTML_RUNTIME_HOST.test("s-" + "a".repeat(32) + ".ws.oceanleo.app"),
      deckProd: deck.DECK_HTML_RUNTIME_HOST.test("s-" + "a".repeat(32) + ".oceanleo.app"),
      deckPortal: deck.DECK_HTML_RUNTIME_HOST.test("s-" + "a".repeat(32) + ".oceanbizs.com"),
      wsViewer: sandbox.isTrustedInteractiveViewerUrl("https://api.oceanbizs.com/a.html"),
      comViewer: sandbox.isTrustedInteractiveViewerUrl("https://asset.oceanleo.com/a.html"),
      cnViewer: sandbox.isTrustedInteractiveViewerUrl("https://asset.oceanleo.cn/a.html"),
      wsAppViewer: sandbox.isTrustedInteractiveViewerUrl("https://x.ws.oceanleo.app/a.html"),
      wsEditorOrigin: protocol.isTrustedEditorOrigin("https://design.oceanbizs.com"),
      comEditorOrigin: protocol.isTrustedEditorOrigin("https://design.oceanleo.com"),
      wsHostedEditorOrigin: protocol.isTrustedEditorOrigin("https://slides.ws.oceanleo.app"),
      prodHostedEditorOrigin: protocol.isTrustedEditorOrigin("https://slides.oceanleo.app"),
      untrusted: {
        app: sandbox.isUntrustedContentHostname("oceanleo.app"),
        leoapp: sandbox.isUntrustedContentHostname("leoapp.cn"),
        wsapp: sandbox.isUntrustedContentHostname("x.ws.oceanleo.app"),
        wsPreview: sandbox.isUntrustedContentHostname("p8080-" + "a".repeat(32) + ".website.oceanbizs.com"),
        portal: sandbox.isUntrustedContentHostname("oceanbizs.com"),
      },
      cookieWs: cfg.cookieDomainFor("www.oceanbizs.com") ?? null,
      cookieCom: cfg.cookieDomainFor("ppt.oceanleo.com") ?? null,
      cookieWsApp: cfg.cookieDomainFor("x.ws.oceanleo.app") ?? null,
    }));
  `;
  const ws = runProbe(probe, {
    NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY: "ws",
    NEXT_PUBLIC_OCEANLEO_GATEWAY_URL: "",
    NEXT_PUBLIC_GATEWAY_URL: "",
    NEXT_PUBLIC_OCEANLEO_COOKIE_DOMAIN: "",
  });
  assert.equal(ws.family, "ws");
  assert.equal(ws.configured, "ws");
  assert.equal(ws.gateway, "https://api.oceanbizs.com");
  assert.equal(ws.profileGateway, "https://api.oceanbizs.com");
  // 姐妹站不部署 ⇒ 空白名单，嵌入整条 fail closed。
  assert.deepEqual(ws.bases, []);
  assert.deepEqual(ws.origins, []);
  assert.equal(ws.comBaseTrusted, false);
  assert.equal(ws.comBaseGrantsSameOrigin, false);
  assert.equal(ws.buildThrew, true, "ws 不得构造出指向 .com 编辑器的 embed URL");
  assert.equal(ws.subsiteOrigin, null, "ws 没有姐妹站链接");
  // Hosted 六件 / MCP App 承载面：ws 自己的隔离区，生产的 .app 全串在 ws 页面上不在表里。
  assert.deepEqual(
    [...ws.hostedOrigins].sort(),
    [
      "https://3d.ws.oceanleo.app",
      "https://audio.ws.oceanleo.app",
      "https://docs.ws.oceanleo.app",
      "https://flow.ws.oceanleo.app",
      "https://game-ide.ws.oceanleo.app",
      "https://slides.ws.oceanleo.app",
    ],
  );
  assert.equal(ws.hostedWs, true);
  assert.equal(ws.hostedProd, false);
  assert.equal(ws.hostedSandbox, sandboxConst("HOSTED_EDITOR_SANDBOX"));
  assert.equal(ws.hostedProdSandbox, sandboxConst("UNTRUSTED_FRAME_SANDBOX"));
  assert.deepEqual(ws.mcpOrigins, ["https://mcp-apps.ws.oceanleo.app"]);
  assert.equal(ws.mcpWsValid, true);
  assert.equal(ws.mcpProdValid, false);
  assert.equal(ws.mcpPortalValid, false, "第一方主机永远不能承载 MCP App");
  assert.equal(ws.deckWs, true);
  assert.equal(ws.deckProd, false);
  assert.equal(ws.deckPortal, false);
  // 家族互不串门：ws 只信 ws 的第一方主机。
  assert.equal(ws.wsViewer, true);
  assert.equal(ws.comViewer, false, "ws 页面不得把 .com 主机当第一方");
  assert.equal(ws.cnViewer, false);
  assert.equal(ws.wsAppViewer, false);
  assert.equal(ws.wsEditorOrigin, true);
  assert.equal(ws.comEditorOrigin, false);
  assert.equal(ws.wsHostedEditorOrigin, true, "白名单成员资格给出的信任");
  assert.equal(ws.prodHostedEditorOrigin, false);
  assert.deepEqual(ws.untrusted, {
    app: true,
    leoapp: true,
    wsapp: true,
    wsPreview: true,
    portal: false,
  });
  // cookie：ws host 拿 .oceanbizs.com；com host 在 ws 槽上什么都拿不到（env 与 host 家族不一致）。
  assert.equal(ws.cookieWs, ".oceanbizs.com");
  assert.equal(ws.cookieCom, null);
  assert.equal(ws.cookieWsApp, null);
});

// UC-3 §8.3
// 违反后果：加第三个家族让缺省（com）进程的白名单变了，就是把生产的信任面改了。
test("ws/3 缺省家族（com）进程：Hosted 六件与 MCP 承载面逐字不变", () => {
  const probe = `
    const hosted = await import(${JSON.stringify(HOSTED_URL)});
    const mcp = await import(${JSON.stringify(MCP_URL)});
    const deck = await import(${JSON.stringify(DECK_URL)});
    const family = await import(${JSON.stringify(FAMILY_URL)});
    process.stdout.write(JSON.stringify({
      family: family.currentDomainFamily(),
      hostedOrigins: [...hosted.HOSTED_EDITOR_ORIGINS],
      mcpOrigins: [...mcp.MCP_APPS_SANDBOX_ORIGINS],
      hostedWs: hosted.isHostedEditorOrigin("https://slides.ws.oceanleo.app"),
      mcpWs: mcp.isValidAppSandboxOrigin("https://mcp-apps.ws.oceanleo.app"),
      deckWs: deck.DECK_HTML_RUNTIME_HOST.test("s-" + "a".repeat(32) + ".ws.oceanleo.app"),
      deckProd: deck.DECK_HTML_RUNTIME_HOST.test("s-" + "a".repeat(32) + ".oceanleo.app"),
    }));
  `;
  const com = runProbe(probe, { NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY: "" });
  assert.equal(com.family, "com");
  assert.deepEqual(
    [...com.hostedOrigins].sort(),
    [
      "https://3d.oceanleo.app",
      "https://audio.oceanleo.app",
      "https://docs.oceanleo.app",
      "https://flow.oceanleo.app",
      "https://game-ide.oceanleo.app",
      "https://slides.oceanleo.app",
    ],
  );
  assert.deepEqual(com.mcpOrigins, ["https://mcp-apps.oceanleo.app"]);
  assert.equal(com.hostedWs, false, "生产页面不得信任 ws 的编辑器 origin");
  assert.equal(com.mcpWs, false);
  assert.equal(com.deckWs, false);
  assert.equal(com.deckProd, true);
});

let sandboxConsts;
function sandboxConst(name) {
  if (!sandboxConsts) {
    // 同步读取常量：两个字符串在 editor-sandbox-origin.ts 里是字面量。
    sandboxConsts = {
      HOSTED_EDITOR_SANDBOX:
        "allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals",
      UNTRUSTED_FRAME_SANDBOX:
        "allow-scripts allow-forms allow-popups allow-downloads",
    };
  }
  return sandboxConsts[name];
}
