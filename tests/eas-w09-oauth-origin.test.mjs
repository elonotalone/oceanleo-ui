// OAuth 回跳 origin：按当前站点精确生成，不含通配（editors-and-shell-0924 W09）。
//
// 网关回调是写死的 `/v1/mcp/oauth/callback`，前端不许传、也不能放宽白名单。
// 页面只负责：① 算出当前站点的精确 origin（给测试与「是否要改走主站」判定）；
// ② 接收回执时只认网关 origin，解析不出就一条都不收。
//
// 跑法（必须带 loader）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/eas-w09-oauth-origin.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MCP_API = readFileSync(join(ROOT, "src/lib/mcp-api.ts"), "utf8");

const { mcpOauthReturnOrigin, mcpOauthOpensPortalPage, mcpOauthPortalPageHref, mcpOauthMessageOrigin } =
  await import(
    await compileModule("src/lib/mcp-api.ts", {
      "./auth/client": dataModule(`export async function accessToken(){ return ""; }`),
      "./auth/config": dataModule(`export const GATEWAY_BASE = "https://api.oceanleo.com";`),
    })
  );

test("回跳 origin 按当前站点精确生成，通配与坏输入一律空串", () => {
  assert.equal(mcpOauthReturnOrigin("https://ppt.oceanleo.com"), "https://ppt.oceanleo.com");
  assert.equal(mcpOauthReturnOrigin("https://oceanleo.com/plugins"), "https://oceanleo.com");
  assert.equal(mcpOauthReturnOrigin("https://chat.oceanleo.com:443"), "https://chat.oceanleo.com");
  assert.equal(mcpOauthReturnOrigin("https://*.oceanleo.com"), "");
  assert.equal(mcpOauthReturnOrigin("https://ppt.*.oceanleo.com"), "");
  assert.equal(mcpOauthReturnOrigin("*"), "");
  assert.equal(mcpOauthReturnOrigin("not a url"), "");
  assert.equal(mcpOauthReturnOrigin(""), "");
  const origin = mcpOauthReturnOrigin("https://ppt.oceanleo.com/plugins?x=1");
  assert.ok(!origin.includes("*"), `回跳 origin 不许带通配，实际：${origin}`);
  assert.doesNotMatch(origin, /%|\.\*/, "回跳 origin 不许带模糊匹配");
});

test("子站要改走主站插件页完成授权；主站自己弹窗", () => {
  assert.equal(
    mcpOauthOpensPortalPage("https://ppt.oceanleo.com", "https://oceanleo.com"),
    true,
  );
  assert.equal(
    mcpOauthOpensPortalPage("https://oceanleo.com", "https://oceanleo.com"),
    false,
  );
  assert.equal(
    mcpOauthOpensPortalPage("https://oceanleo.com/plugins", "https://oceanleo.com"),
    false,
  );
  assert.equal(
    mcpOauthPortalPageHref("https://oceanleo.com", "github"),
    "https://oceanleo.com/plugins#connect=github",
  );
  assert.doesNotMatch(
    mcpOauthPortalPageHref("https://*.oceanleo.com", "github"),
    /\*/,
    "主站授权页地址也不能从通配拼出来",
  );
});

test("回执来源是网关 origin；startMcpOauth 请求体不带回跳 / CORS 字段", () => {
  assert.equal(mcpOauthMessageOrigin(), "https://api.oceanleo.com");
  const startFn = MCP_API.slice(
    MCP_API.indexOf("export async function startMcpOauth"),
    MCP_API.indexOf("export async function disconnectMcp"),
  );
  assert.match(startFn, /JSON\.stringify\(input\)/);
  assert.doesNotMatch(startFn, /redirect_uri|return_url|return_to|callback_url|cors/i);
  assert.doesNotMatch(
    startFn,
    /\*|wildcard|allowOrigin|allowedOrigins/i,
    "发起授权的请求体不许带通配或自建回跳白名单",
  );
});
