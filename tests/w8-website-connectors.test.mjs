import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// UC-NONE: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Mock service responses exercise selectable services, task outcomes and stale-response handling; they do not authorize real resources.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const i18n = dataModule('const tt=(s,v)=>v?s.replace(/\\{(\\w+)\\}/g,(_,k)=>v[k]):s; export function useWebsiteUI(){return tt;} export function useWebsiteLanguage(){return globalThis.__w8Locale || "zh";}');
const runtimeModule = await compileModule("src/api/website-runtime.ts", {
  "../lib/auth/client": dataModule('export async function accessToken(){return "fixture-token";}'),
  "../lib/auth/config": dataModule('export function gatewayBase(){return "https://gateway.invalid";}'),
});
const { WebsiteRequestError } = await import(runtimeModule);
const { websiteConnectorsApi: realConnectorsApi } = await import(await compileModule("src/api/website-connectors.ts", { "./website-runtime": runtimeModule }));
const { WebsiteConfiguration } = await import(await compileModule("src/shell/website-platform/WebsiteConfiguration.tsx", {
  "./website-preview-i18n": i18n,
  "../../api/website-connectors": dataModule("export const websiteConnectorsApi={};"),
  "../../api/website-runtime": runtimeModule,
  "./SiteVaultPanel": dataModule("export function SiteVaultPanel({projectId}){globalThis.__w8VaultProject=projectId;return null;}"),
}));
const { createRoot } = await import("react-dom/client");
const slotIds = ["dev_runtime", "code", "database", "auth", "storage", "hosting", "domain", "analytics", "scheduler"];

function fixture(environment = "preview") {
  const catalog = slotIds.map(slot => ({ connector_id: "ours_" + slot, label: "OceanLeo " + slot,
    label_zh: "平台" + slot, provider_kind: "ours", slots: [slot], cost_basis: "Measured cost, no markup", cost_basis_zh: "按实际使用成本，不加价",
    rate_source: "Provider invoice", rate_source_zh: "服务商账单", limits: ["Usage limits apply"], limits_zh: ["受用量限制"],
    standard_interface: [slot === "database" ? "postgres_url" : "standard_" + slot], panels: [], agent_brief: "Use the standard interface" }));
  catalog.push({ ...catalog[2], connector_id: "own_db", label: "Own database", label_zh: "自己的数据库", provider_kind: "own_account" },
    { ...catalog[5], connector_id: "purchased_hosting", label: "Purchased hosting", label_zh: "代购托管", provider_kind: "on_behalf" });
  return { project_id: "p-8", environment, catalog, slots: slotIds.map((slot, index) => ({ ...catalog[index], slot,
    environment: slot === "dev_runtime" ? "preview" : ["hosting", "domain"].includes(slot) ? "production" : environment,
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
const CHANGE_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
function scoped(snapshot, environment) {
  const next = structuredClone(snapshot);
  next.environment = environment;
  next.slots.forEach(slot => { slot.environment = slot.slot === "dev_runtime" ? "preview" : ["hosting", "domain"].includes(slot.slot) ? "production" : environment; });
  return next;
}
const environmentSelect = host => host.querySelector('[data-testid="website-connector-environment"]');

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

test("environment inspection defaults to Preview, labels fixed slots and keeps all global choices visible in both scopes", async () => {
  const reads = [];
  const m = await mount({ get: async (_id, environment, signal) => {
    reads.push({ environment, signal });
    const snapshot = fixture(environment);
    if (environment === "production") snapshot.slots.find(slot => slot.slot === "database").status = "connected";
    return snapshot;
  } });
  try {
    assert.equal(environmentSelect(m.host).value, "preview");
    for (const environment of ["preview", "production", "preview"]) {
      await choose(environmentSelect(m.host), environment);
      assert.equal(m.host.querySelectorAll("[data-connector-environment]").length, 9);
      for (const slot of slotIds) {
        const row = m.host.querySelector(`[data-testid="website-connector-${slot}"]`);
        assert.equal(row.dataset.connectorEnvironment, slot === "dev_runtime" ? "preview" : ["hosting", "domain"].includes(slot) ? "production" : environment);
      }
      assert.match(m.host.querySelector('[data-testid="website-connector-dev_runtime"]').textContent, /固定环境：预览环境/);
      assert.match(m.host.querySelector('[data-testid="website-connector-hosting"]').textContent, /固定环境：生产环境/);
      assert.equal(m.host.querySelector('[data-testid="website-connector-domain"]').dataset.connectorFixedEnvironment, "production");
      assert.equal(m.host.querySelector('[data-testid="website-connector-database"] [data-connection-status]').dataset.connectionStatus, environment === "production" ? "connected" : "not_connected");
    }
    assert.deepEqual(reads.map(read => read.environment), ["preview", "production", "preview"]);
    assert.equal(reads[0].signal.aborted, true);
    assert.match(m.host.textContent, /保存选择不会授予服务权限、建立连接或发布网站/);
  } finally { await m.destroy(); }
});

test("Production selection and presets send explicit task intent while legacy task history stays unlabeled", async () => {
  const selected = [], presets = [];
  let saved = fixture();
  const m = await mount({ get: async (_id, environment) => scoped(saved, environment),
    select: async (id, slot, connector, environment) => {
      selected.push([id, slot, connector, environment]);
      saved = changed(fixture(environment), { [slot]: connector }); return saved;
    }, preset: async (id, preset, environment) => {
      presets.push([id, preset, environment]);
      saved = changed(fixture(environment), fixture(environment).presets[0].selections, { kind: "preset" }); return saved;
    } });
  try {
    await choose(environmentSelect(m.host), "production");
    let row = m.host.querySelector('[data-testid="website-connector-database"]');
    await choose(row.querySelector("select"), "own_db"); await act(async () => row.querySelector("button").click());
    assert.deepEqual(selected, [["p-8", "database", "own_db", "production"]]);
    assert.doesNotMatch(m.host.querySelector('[data-testid="website-connector-change"]').textContent, /预览环境|生产环境/);
    await choose(environmentSelect(m.host), "preview");
    row = m.host.querySelector('[data-testid="website-connector-database"]');
    assert.equal(row.querySelector("select").value, "own_db");
    assert.equal(row.querySelector("[data-connection-status]").dataset.connectionStatus, "not_connected");
    await choose(environmentSelect(m.host), "production");
    await choose(m.host.querySelector('select[aria-label="场景方案"]'), "landing_page");
    await act(async () => [...m.host.querySelectorAll("button")].find(button => button.textContent === "应用方案").click());
    assert.deepEqual(presets, [["p-8", "landing_page", "production"]]);
  } finally { await m.destroy(); }
});

test("a delayed Preview poll cannot replace Production status after switching scopes", async t => {
  let previewReads = 0, finishOldPoll;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const m = await mount({ get: async (_id, environment) => {
    if (environment === "preview" && ++previewReads === 2) return new Promise(resolve => { finishOldPoll = resolve; });
    return fixture(environment);
  } });
  try {
    await act(async () => t.mock.timers.tick(5001));
    await choose(environmentSelect(m.host), "production");
    const old = fixture(); old.slots.find(slot => slot.slot === "database").status = "connected";
    await act(async () => finishOldPoll(old));
    assert.equal(environmentSelect(m.host).value, "production");
    const row = m.host.querySelector('[data-testid="website-connector-database"]');
    assert.equal(row.dataset.connectorEnvironment, "production");
    assert.equal(row.querySelector("[data-connection-status]").dataset.connectionStatus, "not_connected");
  } finally { await m.destroy(); t.mock.timers.reset(); }
});

test("a Preview mutation settling after a scope switch preserves its real task but never imports Preview status", async () => {
  let completeMutation, saved = fixture();
  const calls = [];
  const m = await mount({ get: async (_id, environment) => scoped(saved, environment), select: async (...args) => {
    calls.push(args); return new Promise(resolve => { completeMutation = () => {
      saved = changed(fixture(), { database: "own_db" });
      const response = structuredClone(saved); response.slots.find(slot => slot.slot === "database").status = "connected";
      resolve(response);
    }; });
  } });
  try {
    let row = m.host.querySelector('[data-testid="website-connector-database"]');
    await choose(row.querySelector("select"), "own_db"); await act(async () => row.querySelector("button").click());
    await choose(environmentSelect(m.host), "production");
    assert.equal(m.host.querySelector('[data-testid="website-connector-code"] button').disabled, true);
    await act(async () => completeMutation());
    assert.deepEqual(calls, [["p-8", "database", "own_db", "preview"]]);
    assert.deepEqual(m.tasks, ["task/8"]);
    row = m.host.querySelector('[data-testid="website-connector-database"]');
    assert.equal(row.dataset.connectorEnvironment, "production");
    assert.equal(row.querySelector("select").value, "own_db");
    assert.equal(row.querySelector("[data-connection-status]").dataset.connectionStatus, "not_connected");
    assert.equal(m.host.querySelector('[data-testid="website-connector-receipt"] a').getAttribute("href"), "/tasks/task%2F8");
  } finally { await m.destroy(); }
});

test("unscoped or incorrectly projected responses cannot claim a Production connection", async () => {
  const m = await mount({ get: async (_id, environment) => {
    const snapshot = fixture(environment);
    if (environment === "production") snapshot.slots.find(slot => slot.slot === "dev_runtime").environment = "production";
    return snapshot;
  } });
  try {
    await choose(environmentSelect(m.host), "production");
    assert.equal(m.host.querySelector('[data-testid="website-connector-database"]'), null);
    assert.match(m.host.textContent, /暂时无法确认此环境的配置状态/);
    await act(async () => m.root.render(React.createElement(WebsiteConfiguration, { ...m.props, projectId: "legacy", api: { get: async () => {
      const snapshot = fixture(); delete snapshot.environment; return snapshot;
    } } })));
    assert.equal(environmentSelect(m.host).value, "preview");
    assert.equal(m.host.querySelectorAll("[data-connector-environment]").length, 0);
    assert.match(m.host.textContent, /暂时无法确认此环境的配置状态/);
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
    assert.deepEqual(selections, [["p-8", "database", "own_db", "preview"]]); assert.deepEqual(m.tasks, ["task/8"]);
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
    assert.deepEqual(presets, [["p-8", "landing_page", "preview"]]); assert.deepEqual(m.tasks, ["task/8"]);
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
    assert.match(m.host.querySelector('[data-testid="website-connector-change"]').textContent, /失败.*配置任务结果尚未确认/s);
    assert.doesNotMatch(m.host.innerHTML, /provider_denied/);
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
    const { websiteConnectorsApi } = await import(await compileModule("src/api/website-connectors.ts", { "./website-runtime": runtimeModule }));
    await websiteConnectorsApi.get("project/8", "production");
    await websiteConnectorsApi.select("project/8", "database/8", "own_db", "preview");
    assert.deepEqual(await websiteConnectorsApi.preset("project/8", "small_app", "production"), { task_id: "task-8" });
    assert.equal(calls[0].url, "https://gateway.invalid/v1/website-projects/project%2F8/connectors?environment=production");
    assert.equal(calls[1].url, "https://gateway.invalid/v1/website-projects/project%2F8/connectors/database%2F8?environment=preview");
    assert.equal(calls[1].init.method, "PUT"); assert.deepEqual(JSON.parse(calls[1].init.body), { connector_id: "own_db" });
    assert.equal(calls[2].init.method, "POST"); assert.deepEqual(JSON.parse(calls[2].init.body), { preset_id: "small_app" });
    assert.equal(new URL(calls[2].url).searchParams.get("environment"), "production");
    for (const call of calls) { assert.equal(call.init.headers.Authorization, "Bearer fixture-token"); assert.equal(call.init.cache, "no-store"); }
  } finally { globalThis.fetch = original; }
});

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Only a closed application error code and canonical owner-checked reference IDs may escape the gateway error envelope.
test("actual failed fetches expose only whitelisted application codes and UUID receipts", async () => {
  const original = globalThis.fetch;
  const privateText = "raw-provider-private-value";
  const cases = [
    { body: { detail: { code: "connector_task_link_unconfirmed", change_id: CHANGE_ID, task_id: TASK_ID, message: privateText, headers: { Authorization: privateText }, provider: { raw: privateText } } },
      code: "connector_task_link_unconfirmed", change: CHANGE_ID, task: TASK_ID },
    { body: { detail: { code: "connector_task_creation_failed", change_id: CHANGE_ID, message: privateText } }, code: "connector_task_creation_failed", change: CHANGE_ID },
    { body: { detail: { code: "provider_retry_safe", change_id: CHANGE_ID, task_id: TASK_ID, message: privateText } } },
    { body: { detail: { code: "constructor", change_id: CHANGE_ID, task_id: TASK_ID, message: privateText } } },
    { body: { detail: { code: "connector_response_unavailable", change_id: "../../" + privateText, task_id: privateText } }, code: "connector_response_unavailable" },
    { body: { detail: privateText } },
    { body: { code: "connector_response_unavailable", change_id: CHANGE_ID, task_id: TASK_ID, message: privateText } },
  ];
  try {
    for (const entry of cases) {
      globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => entry.body });
      await assert.rejects(() => realConnectorsApi.select("p-8", "database", "own_db", "production"), error => {
        assert.ok(error instanceof WebsiteRequestError);
        assert.equal(error.message, "HTTP 503"); assert.equal(error.status, 503);
        assert.equal(error.code, entry.code); assert.equal(error.change_id, entry.change); assert.equal(error.task_id, entry.task);
        assert.equal(error.detail, undefined); assert.equal(error.headers, undefined); assert.equal(error.cause, undefined);
        assert.doesNotMatch(JSON.stringify(error), new RegExp(privateText + "|provider_retry_safe|Authorization|provider"));
        return true;
      });
    }
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => { throw new Error(privateText); } });
    await assert.rejects(() => realConnectorsApi.preset("p-8", "small_app", "preview"), error => {
      assert.ok(error instanceof WebsiteRequestError); assert.equal(error.code, undefined);
      assert.doesNotMatch(error.message + JSON.stringify(error), new RegExp(privateText)); return true;
    });
  } finally { globalThis.fetch = original; }
});

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Exercise the authenticated fetch/error consumer together; a partial dispatch must not become a second owner mutation.
test("a 503 dispatch receipt immediately reconciles and blocks blind repeats across scope switches", async () => {
  const original = globalThis.fetch;
  let reads = 0, writes = 0, saved = fixture();
  globalThis.fetch = async (url, init) => {
    const environment = new URL(url).searchParams.get("environment");
    if (init.method === "PUT") {
      writes++;
      saved = changed(fixture(environment), { database: "own_db" }, { id: CHANGE_ID, status: "pending", task_id: null,
        task_status: null, error_code: "agent_task_dispatch_unconfirmed" });
      return { ok: false, status: 503, json: async () => ({ detail: { code: "agent_task_dispatch_unconfirmed", change_id: CHANGE_ID, message: "raw-provider-private-value" } }) };
    }
    reads++; return { ok: true, json: async () => scoped(saved, environment) };
  };
  const m = await mount(realConnectorsApi);
  try {
    let row = m.host.querySelector('[data-testid="website-connector-database"]');
    await choose(row.querySelector("select"), "own_db"); await act(async () => row.querySelector("button").click());
    assert.equal(reads, 2); assert.equal(writes, 1); assert.deepEqual(m.tasks, []);
    assert.match(m.host.textContent, /勿重复提交/);
    assert.ok(m.host.querySelector('[data-testid="website-connector-unconfirmed"]'));
    assert.equal(m.host.querySelector('[data-testid="website-connector-code"] button').disabled, true);
    assert.doesNotMatch(m.host.textContent, /HTTP 503|agent_task_dispatch_unconfirmed|raw-provider-private-value/);
    assert.doesNotMatch(m.host.innerHTML, /raw-provider-private-value/);
    await choose(environmentSelect(m.host), "production");
    row = m.host.querySelector('[data-testid="website-connector-database"]');
    assert.equal(row.dataset.connectorEnvironment, "production");
    assert.equal(row.querySelector("button").disabled, true);
    assert.doesNotMatch(row.querySelector("button").textContent, /重试/);
    await act(async () => row.querySelector("button").click());
    assert.equal(writes, 1);
  } finally { await m.destroy(); globalThis.fetch = original; }
});

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md.
// A validated receipt may expose the real task reference while service status and retry remain unconfirmed.
test("a task created before 503 remains linked while failed reconciliation prevents resubmission", async () => {
  const original = globalThis.fetch;
  let reads = 0, writes = 0, recover = false;
  globalThis.fetch = async (url, init) => {
    const environment = new URL(url).searchParams.get("environment");
    if (init.method === "PUT") {
      writes++;
      return { ok: false, status: 503, json: async () => ({ detail: { code: "connector_task_link_unconfirmed", change_id: CHANGE_ID, task_id: TASK_ID, message: "raw-provider-private-value" } }) };
    }
    reads++;
    if (reads > 1 && !recover) throw new Error("raw-provider-private-value");
    return { ok: true, json: async () => recover
      ? changed(fixture(environment), { database: "own_db" }, { id: CHANGE_ID, task_id: TASK_ID, status: "completed", task_status: "completed" })
      : fixture(environment) };
  };
  const m = await mount(realConnectorsApi);
  try {
    const row = m.host.querySelector('[data-testid="website-connector-database"]');
    await choose(row.querySelector("select"), "own_db"); await act(async () => row.querySelector("button").click());
    assert.equal(reads, 2); assert.equal(writes, 1); assert.deepEqual(m.tasks, [TASK_ID]);
    assert.equal(m.host.querySelector('[data-testid="website-connector-receipt"] a').getAttribute("href"), "/tasks/" + TASK_ID);
    assert.equal(m.host.querySelector('[data-testid="website-connector-code"] button').disabled, true);
    assert.doesNotMatch(m.host.innerHTML, /raw-provider-private-value/);
    recover = true;
    await act(async () => [...m.host.querySelectorAll("button")].find(button => button.textContent === "刷新配置状态").click());
    assert.equal(m.host.querySelector('[data-testid="website-connector-unconfirmed"]'), null);
    assert.equal(m.host.querySelector('[data-testid="website-connector-code"] button').disabled, false);
    assert.deepEqual(m.tasks, [TASK_ID]);
    assert.equal(m.host.querySelector('[data-testid="website-connector-database"] [data-connection-status]').dataset.connectionStatus, "not_connected");
  } finally { await m.destroy(); globalThis.fetch = original; }
});

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md. Unknown provider codes cannot authorize a safe retry or a task link.
test("an unknown handoff stays held even if an immediate read has no matching change", async () => {
  let writes = 0, reads = 0;
  const m = await mount({ get: async (_id, environment) => { reads++; return fixture(environment); },
    select: async () => { writes++; throw new WebsiteRequestError(503, { detail: { code: "provider_retry_safe", task_id: TASK_ID, message: "raw-provider-private-value" } }); } });
  try {
    const row = m.host.querySelector('[data-testid="website-connector-database"]');
    await choose(row.querySelector("select"), "own_db"); await act(async () => row.querySelector("button").click());
    assert.equal(reads, 2); assert.equal(writes, 1); assert.deepEqual(m.tasks, []);
    assert.equal(row.querySelector("button").disabled, true);
    assert.equal(m.host.querySelector('[data-testid="website-connector-receipt"]'), null);
    assert.doesNotMatch(m.host.innerHTML, /provider_retry_safe|raw-provider-private-value/);
    await act(async () => row.querySelector("button").click()); assert.equal(writes, 1);
  } finally { await m.destroy(); }
});

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md. A closed pre-dispatch refusal needs the actual owner change record before retry.
test("a trusted 4xx task refusal permits retry only after its actual failed record is reconciled", async () => {
  let reads = 0, failed = false;
  const m = await mount({ get: async (_id, environment) => {
    reads++;
    return failed ? changed(fixture(environment), { database: "own_db" }, { id: CHANGE_ID, status: "failed", task_id: null, task_status: null, error_code: "agent_task_creation_failed" }) : fixture(environment);
  }, select: async () => {
    failed = true;
    throw new WebsiteRequestError(403, { detail: { code: "connector_task_creation_failed", change_id: CHANGE_ID, message: "raw-provider-private-value" } });
  } });
  try {
    const row = m.host.querySelector('[data-testid="website-connector-database"]');
    await choose(row.querySelector("select"), "own_db"); await act(async () => row.querySelector("button").click());
    assert.equal(reads, 2); assert.deepEqual(m.tasks, []);
    assert.equal(row.querySelector("button").disabled, false); assert.equal(row.querySelector("button").textContent, "重试");
    assert.equal(m.host.querySelector('[data-testid="website-connector-unconfirmed"]'), null);
    assert.doesNotMatch(m.host.innerHTML, /raw-provider-private-value/);
  } finally { await m.destroy(); }
});
