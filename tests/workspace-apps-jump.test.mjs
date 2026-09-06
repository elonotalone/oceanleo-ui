import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const marketUrl = await compileModule("src/lib/app-market.ts", {
  "./auth/client": dataModule(`export async function accessToken() { return "tok"; }`),
  "./auth/config": dataModule(`export const GATEWAY_BASE = "https://gateway.test";`),
});
const { marketAppOpenUrl, workspaceAppJumpUrl, openMarketApp } = await import(marketUrl);

test("工作台打开成品 app 必须落到子站对应 app 页", () => {
  assert.equal(
    marketAppOpenUrl({
      site_url: "https://image.oceanleo.com",
      open_path: "",
      app_key: "poster",
    }),
    "https://image.oceanleo.com/workspace/poster",
  );
  assert.equal(
    marketAppOpenUrl({
      site_url: "https://resume.oceanleo.com/",
      open_path: "/workspace/builder",
      app_key: "builder",
    }),
    "https://resume.oceanleo.com/workspace/builder",
  );
  assert.equal(
    workspaceAppJumpUrl({
      site_url: "https://image.oceanleo.com",
      open_path: "",
      app_key: "poster",
    }),
    "https://image.oceanleo.com/workspace/poster",
  );
  assert.equal(
    workspaceAppJumpUrl({
      site_url: "",
      open_path: "",
      app_key: "poster",
    }),
    "",
  );
});

test("没有子站 origin 时不许 window.open 主站相对路径", () => {
  const opened = [];
  const prev = globalThis.window;
  globalThis.window = { open: (...args) => opened.push(args) };
  try {
    assert.equal(
      openMarketApp({ site_url: "", open_path: "", app_key: "poster" }),
      "",
    );
    assert.equal(opened.length, 0);
  } finally {
    if (prev === undefined) delete globalThis.window;
    else globalThis.window = prev;
  }
});

test("主站工作台 app 分区读 my_apps，点开跳子站而不是 iframe", async () => {
  const source = await readFile("src/shell/WorkspaceMasterDetail.tsx", "utf8");
  assert.match(source, /listMyApps/);
  assert.match(source, /openMarketApp/);
  assert.match(source, /capabilityImageKey/);
  assert.match(source, /workspaceAppJumpUrl/);
  assert.match(source, /money:\s*"finance"/);
  assert.match(
    source,
    /onOpen=\{\(it\) => \{\s*const app = workspaceApps\.find/,
    );
  assert.match(source, /kind === "market"/);
  assert.match(source, /chatAgents/);
});

test("各站侧栏不再承接加入工作台的 app", async () => {
  const source = await readFile("src/shell/AppShell.tsx", "utf8");
  assert.doesNotMatch(source, /MyAppsRail/);
});
