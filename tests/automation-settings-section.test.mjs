// W8：设置中心「自动化与通知」——三个网关客户端、栏目路由、文案、体积/地址、乐观更新。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/automation-settings-section.test.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { LOCALES } from "../src/i18n/config.ts";
import { ACCOUNT_DELIVERY_MESSAGES, ACCOUNT_DELIVERY_SOURCE } from "../src/i18n/ui/messages/account-delivery-copy.ts";
import { SHELL_OVERHAUL_MESSAGES } from "../src/i18n/ui/messages/shell-overhaul-copy.ts";
import { resolveSettingsTab, SETTINGS_BUILTIN_TABS } from "../src/pages/settings/settings-tabs.ts";
import {
  formatHostedBytes,
  isSafeHostedUrl,
} from "../src/pages/settings/sections/automation/format.ts";
import {
  applyPrefToggle,
  removeGrant,
  removeHostedSite,
} from "../src/pages/settings/sections/automation/state.ts";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");

const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/settings/automation",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLAnchorElement: window.HTMLAnchorElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const { createRoot } = await import("react-dom/client");
const reactUrl = pathToFileURL(require.resolve("react")).href;

const authStub = dataModule(`export async function accessToken() { return "user-token"; }`);
const configStub = dataModule(`export const GATEWAY_BASE = "https://api.oceanleo.com";`);

async function loadApi(path) {
  return import(
    await compileModule(path, {
      "../lib/auth/client": authStub,
      "../lib/auth/config": configStub,
    })
  );
}

const deliveryApi = await loadApi("src/api/delivery-prefs.ts");
const grantsApi = await loadApi("src/api/action-grants.ts");
const sitesApi = await loadApi("src/api/hosted-sites.ts");

async function withFetch(handler, run) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(url, init, calls);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = previous;
  }
}

function jsonOk(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// UC-NONE
// 理由：这是请求形状的功能测试，不对应隔离矩阵里的任何一条；Bearer 只发往第一方网关地址。
test("delivery-prefs 走 GET/PUT /v1/delivery/prefs，带 Bearer 与 JSON body", async () => {
  await withFetch(() => jsonOk({ prefs: { task_done_inbox: true, task_done_push: true, task_done_email: false } }), async (calls) => {
    const got = await deliveryApi.getDeliveryPrefs();
    assert.equal(got.ok, true);
    assert.equal(got.status, 200);
    assert.equal(got.data.prefs.task_done_inbox, true);

    const updated = await deliveryApi.updateDeliveryPrefs({ task_done_email: true });
    assert.equal(updated.ok, true);
    assert.equal(calls[0].url, "https://api.oceanleo.com/v1/delivery/prefs");
    assert.equal(calls[0].init.method || "GET", "GET");
    assert.equal(calls[0].init.headers.Authorization, "Bearer user-token");
    assert.equal(calls[1].url, "https://api.oceanleo.com/v1/delivery/prefs");
    assert.equal(calls[1].init.method, "PUT");
    assert.equal(calls[1].init.body, JSON.stringify({ task_done_email: true }));
    assert.equal(calls[1].init.headers["Content-Type"], "application/json");
  });
});

// UC-NONE
// 理由：这是请求形状的功能测试。查询串逐项 encodeURIComponent 防的是参数串改，不在隔离矩阵的规则里。
test("action-grants 列表与撤销：DELETE 查询串对 connector_id / tool 做 encodeURIComponent", async () => {
  await withFetch(() => jsonOk({ items: [], ok: true }), async (calls) => {
    await grantsApi.listActionGrants();
    await grantsApi.revokeActionGrant("gmail+work", "send email");
    assert.equal(calls[0].url, "https://api.oceanleo.com/v1/agent/approvals/grants");
    assert.equal(calls[0].init.method || "GET", "GET");
    assert.equal(
      calls[1].url,
      "https://api.oceanleo.com/v1/agent/approvals/grants?connector_id=gmail%2Bwork&tool=send%20email",
    );
    assert.equal(calls[1].init.method, "DELETE");
    assert.equal(calls[1].init.headers.Authorization, "Bearer user-token");
  });
});

test("hosted-sites 列表与下线：DELETE 路径编码 id", async () => {
  await withFetch(() => jsonOk({ items: [], ok: true }), async (calls) => {
    await sitesApi.listHostedSites();
    await sitesApi.unpublishHostedSite("site/a b");
    assert.equal(calls[0].url, "https://api.oceanleo.com/v1/hosted-sites");
    assert.equal(calls[0].init.method || "GET", "GET");
    assert.equal(calls[1].url, "https://api.oceanleo.com/v1/hosted-sites/site%2Fa%20b");
    assert.equal(calls[1].init.method, "DELETE");
  });
});

test("SETTINGS_BUILTIN_TABS 含 automation，紧跟 plugins；resolveSettingsTab 原样返回", () => {
  const plugins = SETTINGS_BUILTIN_TABS.indexOf("plugins");
  assert.ok(plugins >= 0);
  assert.equal(SETTINGS_BUILTIN_TABS[plugins + 1], "automation");
  assert.equal(resolveSettingsTab("automation"), "automation");
});

test("栏目组件及其子组件不含 dangerouslySetInnerHTML / innerHTML（UC-4）；外链带 rel；有 https:// 校验", () => {
  const files = [
    join(REPO, "src/pages/settings/sections/AutomationSettingsSection.tsx"),
    join(REPO, "src/pages/settings/sections/automation/format.ts"),
    join(REPO, "src/pages/settings/sections/automation/state.ts"),
  ];
  const extra = readdirSync(join(REPO, "src/pages/settings/sections/automation"))
    .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
    .map((name) => join(REPO, "src/pages/settings/sections/automation", name));
  const seen = new Set();
  for (const file of [...files, ...extra]) {
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(src, /innerHTML\s*=/);
  }
  const section = readFileSync(join(REPO, "src/pages/settings/sections/AutomationSettingsSection.tsx"), "utf8");
  assert.match(section, /rel="noopener noreferrer"/);
  assert.match(section, /isSafeHostedUrl/);
  const format = readFileSync(join(REPO, "src/pages/settings/sections/automation/format.ts"), "utf8");
  assert.match(format, /https:\/\//);
});

test("ACCOUNT_DELIVERY_MESSAGES 17 语对每个原文都有非空译文；SHELL_OVERHAUL en 能查到自动化与通知", () => {
  const keys = Object.values(ACCOUNT_DELIVERY_SOURCE);
  assert.equal(LOCALES.length, 17);
  assert.ok(keys.includes("自动化与通知"));
  for (const locale of LOCALES) {
    for (const key of keys) {
      const value = ACCOUNT_DELIVERY_MESSAGES[locale][key];
      assert.ok(value && String(value).trim(), `${locale} 缺译文：${key}`);
    }
  }
  assert.equal(ACCOUNT_DELIVERY_MESSAGES.zh["自动化与通知"], "自动化与通知");
  const en = SHELL_OVERHAUL_MESSAGES.en["自动化与通知"];
  assert.ok(en);
  assert.notEqual(en, "自动化与通知");
  assert.match(en, /Automat/i);
});

// UC-1（docs/architecture/oceanleo-untrusted-content-isolation.md）：已发布网站的地址是用户内容域上的链接，
// 渲染成可点链接前必须是 https；其余形态只显示文字。字节数人话是同一文件里的纯展示函数。
test("字节数人话与地址校验", () => {
  assert.equal(formatHostedBytes(0), "0 B");
  assert.equal(formatHostedBytes(512), "512 B");
  assert.equal(formatHostedBytes(340 * 1024), "340 KB");
  assert.equal(formatHostedBytes(1.2 * 1024 * 1024), "1.2 MB");
  assert.equal(isSafeHostedUrl("https://shop.oceanleo.app"), true);
  assert.equal(isSafeHostedUrl("http://shop.oceanleo.app"), false);
  assert.equal(isSafeHostedUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHostedUrl("//oceanleo.app"), false);
  assert.equal(isSafeHostedUrl(""), false);
});

// UC-NONE
// 理由：这是纯状态机的功能测试，不涉及渲染面、域或跨源消息。
test("开关乐观更新 / 失败回滚，列表移除", () => {
  const prefs = { task_done_inbox: true, task_done_push: true, task_done_email: false };
  const next = applyPrefToggle(prefs, "task_done_email", true);
  assert.equal(next.task_done_email, true);
  assert.equal(prefs.task_done_email, false);
  const rolled = applyPrefToggle(next, "task_done_email", false);
  assert.deepEqual(rolled, prefs);

  const grants = [
    { connector_id: "gmail", connector_label: "Gmail", tool: "send_email", created_at: "2026-10-10T00:00:00Z" },
    { connector_id: "slack", connector_label: "Slack", tool: "post_message", created_at: "2026-10-10T00:00:00Z" },
  ];
  assert.deepEqual(
    removeGrant(grants, "gmail", "send_email").map((item) => item.connector_id),
    ["slack"],
  );

  const sites = [
    { id: "a", slug: "a", url: "https://a.oceanleo.app", title: "A", status: "live", file_count: 1, bytes: 1, published_at: null, updated_at: "" },
    { id: "b", slug: "b", url: "https://b.oceanleo.app", title: "B", status: "live", file_count: 1, bytes: 1, published_at: null, updated_at: "" },
  ];
  assert.deepEqual(removeHostedSite(sites, "a").map((item) => item.id), ["b"]);
});

const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => String(value).replace(
      /\\{(\\w+)\\}/g,
      (_, key) => String(vars?.[key] ?? "{" + key + "}"),
    );
  }
`);

const { AutomationSettingsSection } = await import(
  await compileModule("src/pages/settings/sections/AutomationSettingsSection.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../../../api/delivery-prefs": dataModule(`
      export async function getDeliveryPrefs() {
        const box = globalThis.__automationApi.delivery;
        return box.get();
      }
      export async function updateDeliveryPrefs(partial) {
        return globalThis.__automationApi.delivery.update(partial);
      }
    `),
    "../../../api/action-grants": dataModule(`
      export async function listActionGrants() {
        return globalThis.__automationApi.grants.list();
      }
      export async function revokeActionGrant(connectorId, tool) {
        return globalThis.__automationApi.grants.revoke(connectorId, tool);
      }
    `),
    "../../../api/hosted-sites": dataModule(`
      export async function listHostedSites() {
        return globalThis.__automationApi.sites.list();
      }
      export async function unpublishHostedSite(id) {
        return globalThis.__automationApi.sites.unpublish(id);
      }
    `),
  })
);

function resetApi(overrides = {}) {
  const prefs = {
    task_done_inbox: true,
    task_done_push: true,
    task_done_email: false,
    ...(overrides.prefs || {}),
  };
  globalThis.__automationApi = {
    delivery: {
      fail: Boolean(overrides.deliveryFail),
      updateFail: Boolean(overrides.updateFail),
      prefs,
      async get() {
        if (this.fail) return { ok: false, status: 500 };
        return { ok: true, data: { prefs: { ...this.prefs } } };
      },
      async update(partial) {
        globalThis.__deliveryUpdates = [...(globalThis.__deliveryUpdates || []), partial];
        if (this.updateFail) return { ok: false, status: 500 };
        this.prefs = { ...this.prefs, ...partial };
        return { ok: true, data: { prefs: { ...this.prefs } } };
      },
    },
    grants: {
      fail: Boolean(overrides.grantsFail),
      items: overrides.grants || [],
      async list() {
        if (this.fail) return { ok: false, status: 500 };
        return { ok: true, data: { items: [...this.items] } };
      },
      async revoke(connectorId, tool) {
        globalThis.__revoked = [...(globalThis.__revoked || []), { connectorId, tool }];
        this.items = this.items.filter((item) => item.connector_id !== connectorId || item.tool !== tool);
        return { ok: true, data: { ok: true } };
      },
    },
    sites: {
      fail: Boolean(overrides.sitesFail),
      items: overrides.sites || [],
      async list() {
        if (this.fail) return { ok: false, status: 500 };
        return { ok: true, data: { items: [...this.items] } };
      },
      async unpublish(id) {
        globalThis.__unpublished = [...(globalThis.__unpublished || []), id];
        this.items = this.items.filter((item) => item.id !== id);
        return { ok: true, data: { ok: true } };
      },
    },
  };
  globalThis.__deliveryUpdates = [];
  globalThis.__revoked = [];
  globalThis.__unpublished = [];
}

async function renderSection() {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(AutomationSettingsSection, { variant: "pane" }));
  });
  for (let i = 0; i < 8; i += 1) await act(async () => {});
  return {
    host,
    text: () => host.textContent || "",
    async click(node) {
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      for (let i = 0; i < 4; i += 1) await act(async () => {});
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

// UC-4（docs/architecture/oceanleo-untrusted-content-isolation.md）：网关返回的标题、应用名、动作名只进文本节点；
// 外链带 rel="noopener noreferrer"，打开的用户内容域页面拿不到本页的 window 句柄。
test("栏目：三块独立、空态、https 外链、开关失败回滚、列表撤销移除", async () => {
  resetApi({
    grants: [],
    sites: [
      {
        id: "live-1",
        slug: "shop",
        url: "https://shop.oceanleo.app",
        title: "小店",
        status: "live",
        file_count: 12,
        bytes: 340 * 1024,
        published_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
      },
      {
        id: "bad-1",
        slug: "bad",
        url: "http://not-safe.example",
        title: "不安全",
        status: "live",
        file_count: 1,
        bytes: 10,
        published_at: null,
        updated_at: "2026-10-01T00:00:00Z",
      },
    ],
  });
  const view = await renderSection();
  try {
    assert.equal(view.host.querySelector("[data-settings-pane=automation]").getAttribute("data-variant"), "pane");
    assert.ok(view.host.querySelector("[data-automation-block=delivery]"));
    assert.ok(view.host.querySelector("[data-automation-block=grants]"));
    assert.ok(view.host.querySelector("[data-automation-block=sites]"));
    assert.ok(view.text().includes("还没有。agent 第一次要用你连接的应用发送或修改内容时会先问你。"));
    assert.ok(view.host.querySelector('a[href="/schedules"]'));

    const safe = view.host.querySelector('a[href="https://shop.oceanleo.app"]');
    assert.ok(safe);
    assert.equal(safe.getAttribute("rel"), "noopener noreferrer");
    assert.equal(safe.getAttribute("target"), "_blank");
    assert.equal(view.host.querySelector('a[href="http://not-safe.example"]'), null);
    assert.ok(view.text().includes("http://not-safe.example"));
    assert.ok(view.text().includes("340 KB"));

    globalThis.__automationApi.delivery.updateFail = true;
    const emailSwitch = [...view.host.querySelectorAll('[role="switch"]')].at(-1);
    assert.equal(emailSwitch.getAttribute("aria-checked"), "false");
    await view.click(emailSwitch);
    assert.equal(emailSwitch.getAttribute("aria-checked"), "false");
    assert.ok(view.text().includes("没能保存通知偏好，开关已恢复。请稍后重试。"));
  } finally {
    view.cleanup();
  }

  resetApi({
    deliveryFail: true,
    grants: [
      { connector_id: "gmail", connector_label: "Gmail", tool: "send_email", created_at: "2026-10-10T00:00:00Z" },
    ],
    sitesFail: true,
  });
  const split = await renderSection();
  try {
    assert.ok(split.host.querySelector("[data-automation-block=delivery]").textContent.includes("网络失败"));
    assert.ok(split.host.querySelector("[data-automation-block=sites]").textContent.includes("网络失败"));
    assert.ok(split.host.querySelector("[data-automation-grant]"));
    const revoke = [...split.host.querySelectorAll("button")].find((node) => node.textContent === "撤销");
    await split.click(revoke);
    assert.equal(split.host.querySelector("[data-automation-grant]"), null);
    assert.deepEqual(globalThis.__revoked, [{ connectorId: "gmail", tool: "send_email" }]);
  } finally {
    split.cleanup();
  }
});
