import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// UC-NONE: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Mock service responses exercise selectable services, task outcomes and stale-response handling; they do not authorize real resources.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const i18n = dataModule('const tt=(s,v)=>v?s.replace(/\\{(\\w+)\\}/g,(_,k)=>v[k]):s; export function useWebsiteUI(){return tt;} export function useWebsiteLanguage(){return globalThis.__w8Locale || "zh";}');
const { WebsiteConfiguration } = await import(await compileModule("src/shell/website-platform/WebsiteConfiguration.tsx", {
  "./website-preview-i18n": i18n,
  "../../api/website-connectors": dataModule("export const websiteConnectorsApi={};"),
  "./SiteVaultPanel": dataModule("export function SiteVaultPanel({projectId}){globalThis.__w8VaultProject=projectId;return null;}"),
}));
const { createRoot } = await import("react-dom/client");
const slotIds = ["dev_runtime", "code", "database", "auth", "storage", "hosting", "domain", "analytics", "scheduler"];

function fixture() {
  const catalog = slotIds.map(slot => ({ connector_id: "ours_" + slot, label: "OceanLeo " + slot,
    label_zh: "平台" + slot, provider_kind: "ours", slots: [slot], cost_basis: "Measured cost, no markup", cost_basis_zh: "按实际使用成本，不加价",
    rate_source: "Provider invoice", rate_source_zh: "服务商账单", limits: ["Usage limits apply"], limits_zh: ["受用量限制"],
    standard_interface: [slot === "database" ? "postgres_url" : "standard_" + slot], panels: [], agent_brief: "Use the standard interface" }));
  catalog.push({ ...catalog[2], connector_id: "own_db", label: "Own database", label_zh: "自己的数据库", provider_kind: "own_account" },
    { ...catalog[5], connector_id: "purchased_hosting", label: "Purchased hosting", label_zh: "代购托管", provider_kind: "on_behalf" });
  return { project_id: "p-8", catalog, slots: slotIds.map((slot, index) => ({ ...catalog[index], slot,
    label: slot, status: "not_connected", status_detail: "No verified binding", status_detail_zh: "尚无已验证的连接",
    vault_refs: [], selection_source: "default", task_id: null, change_id: null })),
    presets: ["landing_page", "small_app", "backend_app", "imported_project", "own_accounts"].map(id => ({
      id, label: id, label_zh: "场景" + id, selections: Object.fromEntries(slotIds.map(slot => [slot, "ours_" + slot])),
    })), changes: [], persistence: { available: true, migration: "0371_website_connectors.sql" } };
}
function changed(snapshot, selections, extra = {}) {
  const next = structuredClone(snapshot);
  const change = { id: "change-1", kind: "slot", selections, status: "queued", task_id: "task/8", task_status: "pending",
    error_code: null, created_at: "2026-11-04T00:00:00Z", updated_at: "2026-11-04T00:00:00Z", ...extra };
  for (const [slot, id] of Object.entries(selections)) {
    const index = next.slots.findIndex(item => item.slot === slot);
    next.slots[index] = { ...next.slots[index], ...next.catalog.find(item => item.connector_id === id),
      slot, selection_source: "saved", task_id: change.task_id, change_id: change.id };
  }
  return { ...next, changes: [change], change, task_id: change.task_id };
}
async function mount(api, extra = {}) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), tasks = [];
  const props = { projectId: "p-8", api, onTaskCreated: id => tasks.push(id), ...extra };
  await act(async () => root.render(React.createElement(WebsiteConfiguration, props)));
  return { host, root, tasks, props, async destroy() { await act(async () => root.unmount()); host.remove(); delete globalThis.__w8VaultProject; } };
}
async function choose(select, value) {
  await act(async () => { select.value = value; select.dispatchEvent(new window.Event("change", { bubbles: true })); });
}

test("Configuration exposes every slot and preset from first use with provider, cost, limits, interfaces and the project vault", async () => {
  const snapshot = fixture();
  const m = await mount({ get: async () => snapshot });
  try {
    for (const id of slotIds) {
      const row = m.host.querySelector(`[data-testid="website-connector-${id}"]`);
      assert.ok(row); assert.equal(row.querySelector("select").disabled, false); assert.equal(row.querySelector("button").disabled, false);
      assert.match(row.textContent, /未连接/); assert.match(row.textContent, /按实际使用成本，不加价/);
      assert.match(row.textContent, /服务商账单/); assert.match(row.textContent, /受用量限制/);
      assert.match(row.textContent, /标准接口/);
    }
    assert.equal(m.host.querySelector('select[aria-label="场景方案"]').options.length, 6);
    assert.match(m.host.querySelector('[data-testid="website-connector-database"]').textContent, /自己的账户/);
    assert.match(m.host.querySelector('[data-testid="website-connector-hosting"]').textContent, /代你购买/);
    assert.equal(globalThis.__w8VaultProject, "p-8");
    assert.doesNotMatch(m.host.textContent, /Provider invoice|Measured cost/);
  } finally { await m.destroy(); }
});

test("changing one connector uses the returned agent task without inventing a verified connection", async () => {
  const snapshot = fixture(), selections = [];
  const m = await mount({ get: async () => snapshot, select: async (...args) => {
    selections.push(args); return changed(snapshot, { database: "own_db" });
  } });
  try {
    const row = m.host.querySelector('[data-testid="website-connector-database"]');
    await choose(row.querySelector("select"), "own_db");
    await act(async () => row.querySelector("button").click());
    assert.deepEqual(selections, [["p-8", "database", "own_db"]]); assert.deepEqual(m.tasks, ["task/8"]);
    assert.equal(row.querySelector("select").value, "own_db");
    assert.equal(row.querySelector("[data-connection-status]").getAttribute("data-connection-status"), "not_connected");
    assert.match(row.textContent, /已保存选择/);
    const change = m.host.querySelector('[data-testid="website-connector-change"]');
    assert.equal(change.dataset.changeStatus, "queued"); assert.match(change.textContent, /任务状态：等待处理/);
    assert.equal(change.querySelector("a").getAttribute("href"), "/tasks/task%2F8");
  } finally { await m.destroy(); }
});

test("unavailable adapters stay visible with their reason and cannot be selected directly or through a preset", async () => {
  const snapshot = fixture();
  Object.assign(snapshot.catalog.find(option => option.connector_id === "own_db"), { available: false, availability_code: "adapter_module_unavailable" });
  snapshot.presets[4].selections.database = "own_db";
  const m = await mount({ get: async () => snapshot });
  try {
    const row = m.host.querySelector('[data-testid="website-connector-database"]');
    assert.equal([...row.querySelector("select").options].find(option => option.value === "own_db").disabled, true);
    assert.match(row.querySelector('[data-availability-code="adapter_module_unavailable"]').textContent, /暂不可用/);
    await choose(row.querySelector("select"), "own_db");
    assert.equal(row.querySelector("button").disabled, true);
    await choose(m.host.querySelector('select[aria-label="场景方案"]'), "own_accounts");
    assert.equal([...m.host.querySelectorAll("button")].find(button => button.textContent === "应用方案").disabled, true);
    assert.match(m.host.textContent, /该方案包含暂不可用的服务/);
  } finally { await m.destroy(); }
});

test("presets create a backend task and leave individual choices editable", async () => {
  const snapshot = fixture(), presets = [];
  const m = await mount({ get: async () => snapshot, preset: async (...args) => {
    presets.push(args); return changed(snapshot, snapshot.presets[0].selections, { kind: "preset" });
  } });
  try {
    await choose(m.host.querySelector('select[aria-label="场景方案"]'), "landing_page");
    await act(async () => [...m.host.querySelectorAll("button")].find(button => button.textContent === "应用方案").click());
    assert.deepEqual(presets, [["p-8", "landing_page"]]); assert.deepEqual(m.tasks, ["task/8"]);
    assert.match(m.host.querySelector('[data-testid="website-connector-change"]').textContent, /方案变更/);
    for (const row of m.host.querySelectorAll('[data-testid^="website-connector-"]')) {
      const select = row.querySelector("select"); if (select) assert.equal(select.disabled, false);
    }
  } finally { await m.destroy(); }
});

test("polling shows the actual task result while a completed task can still have an unconnected service", async t => {
  const snapshot = fixture();
  let latest = snapshot;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const m = await mount({ get: async () => latest, select: async () => {
    latest = changed(snapshot, { database: "own_db" }); return latest;
  } });
  try {
    const row = m.host.querySelector('[data-testid="website-connector-database"]');
    await choose(row.querySelector("select"), "own_db"); await act(async () => row.querySelector("button").click());
    latest = changed(snapshot, { database: "own_db" }, { status: "completed", task_status: "completed" });
    await act(async () => t.mock.timers.tick(5001));
    assert.equal(m.host.querySelector('[data-testid="website-connector-change"]').dataset.changeStatus, "completed");
    assert.equal(row.querySelector("[data-connection-status]").dataset.connectionStatus, "not_connected");
    latest = changed(snapshot, { database: "own_db" }, { status: "failed", task_status: "failed", error_code: "provider_denied" });
    await act(async () => t.mock.timers.tick(5001));
    assert.match(m.host.querySelector('[data-testid="website-connector-change"]').textContent, /失败.*provider_denied/s);
  } finally { await m.destroy(); t.mock.timers.reset(); }
});

test("an old poll cannot overwrite a freshly saved connector", async t => {
  const snapshot = fixture(); let reads = 0, finishPoll;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const m = await mount({ get: async () => ++reads === 1 ? snapshot : new Promise(resolve => { finishPoll = resolve; }),
    select: async () => changed(snapshot, { database: "own_db" }) });
  try {
    await act(async () => t.mock.timers.tick(5001));
    const row = m.host.querySelector('[data-testid="website-connector-database"]');
    await choose(row.querySelector("select"), "own_db"); await act(async () => row.querySelector("button").click());
    await act(async () => finishPoll(snapshot));
    assert.equal(row.querySelector("select").value, "own_db"); assert.deepEqual(m.tasks, ["task/8"]);
  } finally { await m.destroy(); t.mock.timers.reset(); }
});

test("dispatch failures and missing persistence never display a created task or a connected service", async () => {
  const snapshot = fixture();
  const m = await mount({ get: async () => snapshot, select: async () => changed(snapshot, { database: "own_db" }, {
    status: "failed", task_id: null, task_status: null, error_code: "task_dispatch_failed",
  }) });
  try {
    const row = m.host.querySelector('[data-testid="website-connector-database"]');
    await choose(row.querySelector("select"), "own_db"); await act(async () => row.querySelector("button").click());
    assert.deepEqual(m.tasks, []); assert.match(m.host.textContent, /无法创建配置任务，请重试/);
    assert.ok(m.host.querySelector('[data-task-error="task_dispatch_failed"]'));
    assert.equal(row.querySelector("button").disabled, false); assert.equal(row.querySelector("button").textContent, "重试");
    assert.equal(m.host.querySelector('[data-testid="website-connector-change"] a'), null);
    const unavailable = fixture(); unavailable.persistence.available = false;
    await act(async () => m.root.render(React.createElement(WebsiteConfiguration, { ...m.props, projectId: "not-ready", api: { get: async () => unavailable } })));
    assert.match(m.host.textContent, /配置存储尚未就绪/);
    assert.equal(m.host.querySelector('[data-testid="website-connector-database"] button').disabled, true);
    assert.equal(m.host.querySelector('[data-testid="website-connector-database"] select').disabled, false);
  } finally { await m.destroy(); }
});

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Supporting owner-scoped access: connector mutations use the authenticated gateway client, escaped ids and no-store requests.
test("connector client authenticates and encodes project/slot ids and exact mutation bodies", async () => {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ task_id: "task-8" }) }; };
  try {
    const runtime = await compileModule("src/api/website-runtime.ts", {
      "../lib/auth/client": dataModule('export async function accessToken(){return "fixture-token";}'),
      "../lib/auth/config": dataModule('export function gatewayBase(){return "https://gateway.invalid";}'),
    });
    const { websiteConnectorsApi } = await import(await compileModule("src/api/website-connectors.ts", { "./website-runtime": runtime }));
    await websiteConnectorsApi.get("project/8");
    await websiteConnectorsApi.select("project/8", "database/8", "own_db");
    assert.deepEqual(await websiteConnectorsApi.preset("project/8", "small_app"), { task_id: "task-8" });
    assert.equal(calls[0].url, "https://gateway.invalid/v1/website-projects/project%2F8/connectors");
    assert.equal(calls[1].url, "https://gateway.invalid/v1/website-projects/project%2F8/connectors/database%2F8");
    assert.equal(calls[1].init.method, "PUT"); assert.deepEqual(JSON.parse(calls[1].init.body), { connector_id: "own_db" });
    assert.equal(calls[2].init.method, "POST"); assert.deepEqual(JSON.parse(calls[2].init.body), { preset_id: "small_app" });
    for (const call of calls) { assert.equal(call.init.headers.Authorization, "Bearer fixture-token"); assert.equal(call.init.cache, "no-store"); }
  } finally { globalThis.fetch = original; }
});
