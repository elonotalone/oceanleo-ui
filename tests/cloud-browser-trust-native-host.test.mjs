import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// Real configuration graph: the browser helper loads before the native host
// publishes its profile, matching desktop and iOS client startup.
const hostUrl = await compileModule("src/contracts/client-host-config.ts");
const host = await import(hostUrl);
const familyUrl = await compileModule("src/contracts/domain-family.ts", { "./client-host-config": hostUrl });
const configUrl = await compileModule("src/lib/auth/config.ts", {
  "../../contracts/client-host-config": hostUrl,
  "../../contracts/domain-family": familyUrl,
});
const config = await import(configUrl);
const browser = await import(await compileModule("src/lib/browser.ts", {
  "./auth/config": configUrl,
  "./auth/client": dataModule('export async function accessToken() { return "synthetic-owner-token"; }'),
  "./agent": dataModule('export async function authed() { throw new Error("unexpected unrelated API call"); }'),
}));

for (const platform of ["desktop", "ios"]) {
  test(`screenshot and live targets follow late trusted ${platform} configuration in the already-loaded browser helper`, async () => {
    const previousHost = host.getClientHostConfig();
    const previousFetch = globalThis.fetch;
    const calls = [];
    host.resetClientHostConfigForTests();
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } });
    };
    try {
      const initialGateway = config.gatewayBase();
      const injectedGateway = initialGateway === "https://api.oceanbizs.com"
        ? "https://api.dev.oceanleo.com" : "https://api.oceanbizs.com";
      const sessionId = "session/with?reserved#characters";
      const livePath = `/v1/browser/sessions/${encodeURIComponent(sessionId)}/live`;
      const websocket = origin => origin.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
      const before = await browser.cloudBrowserScreenshot(17);
      assert.equal(before.ok, true);
      assert.equal(browser.cloudBrowserLiveUrl(sessionId), websocket(initialGateway) + livePath);

      host.configureClientHost({
        family: injectedGateway === "https://api.oceanbizs.com" ? "ws" : "com",
        portalOrigin: injectedGateway === "https://api.oceanbizs.com" ? "https://oceanbizs.com" : "https://oceanleo.com",
        gatewayOrigin: injectedGateway,
        identityOrigin: "https://auth.oceanleo.com", identityAnonKey: "synthetic-anon",
        locale: "en", platform, capabilities: [],
      });
      assert.equal(config.GATEWAY_BASE, initialGateway, "the legacy snapshot stays frozen during the regression");
      assert.equal(config.gatewayBase(), injectedGateway);
      const after = await browser.cloudBrowserScreenshot(18);
      assert.equal(after.ok, true);
      assert.equal(after.data.type, "image/jpeg");
      assert.equal(after.data.size, 3);
      assert.deepEqual(calls.map(call => call.url), [
        `${initialGateway}/v1/browser/events/17/screenshot`,
        `${injectedGateway}/v1/browser/events/18/screenshot`,
      ]);
      assert.equal(browser.cloudBrowserLiveUrl(sessionId), websocket(injectedGateway) + livePath);
      for (const call of calls) {
        assert.deepEqual(call.init.headers, { Authorization: "Bearer synthetic-owner-token" });
        assert.equal(call.init.credentials, "include");
        assert.equal(call.init.cache, "no-store");
      }
    } finally {
      globalThis.fetch = previousFetch;
      host.resetClientHostConfigForTests();
      if (previousHost) host.configureClientHost(previousHost);
    }
  });
}
