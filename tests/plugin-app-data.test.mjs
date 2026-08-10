import assert from "node:assert/strict";
import test from "node:test";

import { createPluginAppDataReader } from "../src/shell/plugin-app-data.ts";

function fakePluginModule() {
  return {
    id: "fixture-kpi-view",
    async read(host) {
      return host.appData();
    },
  };
}

test("假插件能读到所在 app 已算好的不透明数据", async () => {
  const calculated = {
    revenue: 128_400,
    churnRate: 0,
    trend: [120_000, 128_400],
  };
  const app = {
    session: {
      site_id: "finance",
      app_id: "forecast",
      snapshot: calculated,
    },
  };
  const plugin = fakePluginModule();
  const received = await plugin.read({
    appData: createPluginAppDataReader({
      siteKey: "finance",
      appId: "forecast",
      session: () => app.session,
    }),
  });

  assert.deepEqual(received, calculated);
  assert.equal(received.churnRate, 0);
});

test("app 尚未算出数据时明确返回 null", async () => {
  const app = {
    session: {
      site_id: "finance",
      app_id: "forecast",
    },
  };
  const plugin = fakePluginModule();
  const realReader = createPluginAppDataReader({
    siteKey: "finance",
    appId: "forecast",
    session: () => app.session,
  });
  const received = await plugin.read({
    // This opt-in bad fixture is run once during W6 to prove the assertion
    // catches a host that collapses "missing" into an empty object.
    appData:
      process.env.W6_BAD_EMPTY_APP_DATA === "1"
        ? async () => ({})
        : realReader,
  });

  assert.equal(received, null);
});

test("空值以外的合法计算结果不会被误判成尚无数据", async () => {
  for (const calculated of [0, false, "", {}]) {
    const read = createPluginAppDataReader({
      siteKey: "metrics",
      appId: "single-value",
      session: () => ({
        site_id: "metrics",
        app_id: "single-value",
        snapshot: calculated,
      }),
    });
    assert.deepEqual(await read(), calculated);
  }
});

test("不会把另一个 app 的 session 数据串进当前插件", async () => {
  const read = createPluginAppDataReader({
    siteKey: "finance",
    appId: "forecast",
    session: () => ({
      site_id: "finance",
      app_id: "ledger",
      snapshot: { privateLedger: true },
    }),
  });

  assert.equal(await read(), null);
});

