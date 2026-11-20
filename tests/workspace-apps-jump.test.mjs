import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const marketUrl = await compileModule("src/lib/app-market.ts", {
  "./auth/client": dataModule(`export async function accessToken() { return "tok"; }`),
  "./auth/config": dataModule(`export const GATEWAY_BASE = "https://gateway.test";`),
});
const { marketAppOpenUrl, workspaceAppJumpUrl, openMarketApp } = await import(marketUrl);

test("工作台打开成品 app 落到同源 /workspace/<site>/<app>（没有子站主机）", () => {
  assert.equal(
    marketAppOpenUrl({ site_id: "image", site_url: "https://image.oceanleo.com", open_path: "", app_key: "poster" }),
    "/workspace/image/poster",
  );
  assert.equal(
    marketAppOpenUrl({ site_id: "resume", site_url: "https://resume.oceanleo.com/", open_path: "/workspace/builder", app_key: "builder" }),
    "/workspace/resume/builder",
  );
  assert.equal(
    workspaceAppJumpUrl({ site_id: "image", site_url: "https://image.oceanleo.com", open_path: "", app_key: "poster" }),
    "/workspace/image/poster",
  );
  assert.equal(workspaceAppJumpUrl({ site_id: "", site_url: "", open_path: "", app_key: "poster" }), "");
});

test("认不出站 key 时不导航、不开新标签", () => {
  const opened = [];
  const assigned = [];
  const prev = globalThis.window;
  globalThis.window = { open: (...args) => opened.push(args), location: { assign: (href) => assigned.push(href) } };
  try {
    assert.equal(openMarketApp({ site_id: "", open_path: "", app_key: "poster" }), "");
    assert.equal(opened.length, 0);
    assert.equal(assigned.length, 0);
    assert.equal(openMarketApp({ site_id: "image", open_path: "", app_key: "poster" }), "/workspace/image/poster");
    assert.deepEqual(assigned, ["/workspace/image/poster"]);
    assert.equal(opened.length, 0);
  } finally {
    if (prev === undefined) delete globalThis.window;
    else globalThis.window = prev;
  }
});

test("宿主提供外部打开器时，成品 app 交给宿主门户的绝对地址", () => {
  const opened = [];
  const external = [];
  const prev = globalThis.window;
  globalThis.window = {
    open: (...args) => opened.push(args),
    location: { origin: "https://oceanleo.com", host: "oceanleo.com", assign() { throw new Error("must not navigate"); } },
  };
  try {
    const href = openMarketApp(
      { site_id: "image", site_url: "https://image.oceanleo.com", open_path: "", app_key: "poster" },
      (url) => external.push(url),
    );
    assert.equal(href, "/workspace/image/poster");
    assert.deepEqual(external, ["https://oceanleo.com/workspace/image/poster"]);
    assert.equal(opened.length, 0);
  } finally {
    if (prev === undefined) delete globalThis.window;
    else globalThis.window = prev;
  }
});

test("主站工作台 app 分区读 my_apps，优先打开站点作用域 surface", async () => {
  const source = await readFile("src/shell/WorkspaceMasterDetail.tsx", "utf8");
  assert.match(source, /listMyApps/);
  assert.match(source, /openMarketApp/);
  assert.match(source, /capabilityImageKey/);
  assert.match(source, /workspaceAppJumpUrl/);
  assert.match(source, /data-workspace-app-surface/);
  assert.match(source, /workspaceEmbedSrc\(\{/);
  assert.doesNotMatch(source, /siteOrigin/);
  assert.match(source, /getClientHostConfig\(\)\?\.openExternal/);
  assert.match(source, /openSiteWorkspace\(s\.key\)/);
  assert.match(
    source,
    /onOpen=\{\(it\) => \{\s*const app = workspaceApps\.find/,
    );
  assert.match(source, /kind === "market"/);
  assert.match(source, /chatAgents/);
});
