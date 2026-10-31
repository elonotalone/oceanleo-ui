// C11-FW: website polish for the cloud assistant (contracts §2–§4 of C11-dispatch.md).
// 1. Every device_status notice kind is a translated sentence in every locale, with times from
//    meta.health in the viewer's own clock; no raw code or untranslated Chinese outside a Chinese UI.
// 2. History never shows a raw local-agent code (a refused delete: local_agent_stop_pending).
// 3. The remote desktop opened from 我的设备 finds the computer's live session (`live_session`) and
//    shows the task page's AI banner and 交还给 AI.
// 4. 接管电脑 / the remote desktop tell the truth about consent (`remote_takeover`, standing grants);
//    gateways without the fields keep today's wording.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { document, window } from "./helpers/remote-desktop-dom.mjs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

for (const [name, value] of Object.entries({ CustomEvent: window.CustomEvent, localStorage: window.localStorage, sessionStorage: window.sessionStorage })) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
window.Element.prototype.scrollIntoView ??= function scrollIntoView() {};
globalThis.React = React;

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const HAN = /[一-鿿]/;

const target = await import(await compileModule("src/lib/execution-target.ts"));
const model = await import(await compileModule("src/lib/local-agent-task.ts"));
const { LOCALES, htmlLang } = await import("../src/i18n/config.ts");
const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
const { loadUiMessages } = await import("../src/i18n/ui/messages/load.ts");
const authStub = dataModule('export async function getUserId(){return "owner"} export async function accessToken(){return "test"} export function cachedAccessToken(){return "test"}');
const transport = await import(await compileModule("src/lib/agent.ts", {
  "./auth/client": authStub,
  "./auth/config": dataModule('export const GATEWAY_BASE="https://api.dev.oceanleo.com";'),
  "./history-events": dataModule("export function notifyHistoryChanged(){}"),
}));

const interpolate = (value, vars) => vars ? value.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : value;
/** `tt` as useUI builds it for one locale: the catalog's text, else the Chinese source. */
const ttFor = (locale) => (zh, vars) => { const hit = UI_MESSAGES[locale]?.[zh]; return interpolate(hit != null && hit !== "" ? hit : zh, vars); };
const zhTt = ttFor("zh");
const enTt = ttFor("en");
/** A useUI stub that follows `globalThis.__fwDict` (the catalog of the locale under test). */
const ttStub = dataModule(`
  const interpolate = (v, vars) => vars ? v.replace(/\\{(\\w+)\\}/g, (m, k) => k in vars ? String(vars[k]) : m) : v;
  export function useUI(){ const dict = globalThis.__fwDict || {}; return (zh, vars) => interpolate(dict[zh] != null && dict[zh] !== "" ? dict[zh] : zh, vars); }
`);
/** The clock the page shows for `iso` in the current TZ and `<html lang>`. */
const clockOf = (iso) => new Intl.DateTimeFormat(htmlLang(document.documentElement.lang || "zh"), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
async function withTimeZone(zone, run) {
  const saved = process.env.TZ;
  process.env.TZ = zone;
  try { return await run(); } finally { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function flush(n = 6) { for (let i = 0; i < n; i += 1) await act(async () => {}); }
async function tick(ms) { await act(async () => { await wait(ms); }); await flush(); }
async function mount(element) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  await flush();
  return { host, root, async unmount() { await act(async () => root.unmount()); host.remove(); } };
}
async function click(node) {
  assert.ok(node, "control exists");
  await act(async () => { node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  await flush();
}
async function waitFor(check, ms = 3000) {
  const deadline = Date.now() + ms;
  while (!check()) { if (Date.now() > deadline) return check(); await tick(10); }
  return check();
}
const allButtons = () => [...document.querySelectorAll("button")];
const byText = (label) => allButtons().find((b) => (b.textContent || "").trim() === label);

const cloudRun = (fields = {}) => ({ run_id: "run-1", device_id: "pc-1", state: "running", desired_state: "run", control_revision: 3,
  report_seq: 4, driver: "cloud", session_id: "cas_01JD00000000000000000000AB", owner: "ai",
  health: { kind: "ok", since: "2026-10-27T08:00:00Z", last_contact_at: "2026-10-27T08:00:00Z" }, ...fields });

// ------------------------------------------------------------------ availability

test("availability rows carry live_session and remote_takeover; idle, ended and malformed rows carry none", () => {
  const rows = target.parseCloudAgentAvailability({ devices: [
    { device_id: "mac-1", available: false, reason: "ai_busy", until: 1793095049, remote_takeover: true,
      live_session: { session_id: "cas_01JD00000000000000000000AB", task_id: "3f1c2d4e-0000-4000-8000-000000000001", owner: "ai", state: "running" } },
    { device_id: "pc-2", available: true, reason: null, until: null, remote_takeover: false },
    { device_id: "dev-3", available: false, reason: "ai_busy", live_session: { session_id: "cas_dev", task_id: null, owner: "human", state: "paused" } },
    { device_id: "old-4", available: true },
    { device_id: "bad-5", available: true, remote_takeover: "yes", live_session: { session_id: "../x", owner: "robot" } },
    { device_id: "end-6", available: true, live_session: { session_id: "cas_e", task_id: "t-6", owner: "ai", state: "ended" } },
  ] });
  assert.deepEqual(rows.get("mac-1").liveSession,
    { sessionId: "cas_01JD00000000000000000000AB", taskId: "3f1c2d4e-0000-4000-8000-000000000001", owner: "ai", state: "running" });
  assert.equal(rows.get("mac-1").remoteTakeover, true);
  assert.equal(rows.get("pc-2").remoteTakeover, false);
  assert.equal(rows.get("pc-2").liveSession, null, "idle: the gateway omits live_session");
  assert.deepEqual(rows.get("dev-3").liveSession, { sessionId: "cas_dev", taskId: null, owner: "human", state: "paused" }, "developer sessions have no task");
  assert.equal(rows.get("old-4").remoteTakeover, null, "older gateways do not report it");
  assert.equal(rows.get("old-4").liveSession, null);
  assert.equal(rows.get("bad-5").remoteTakeover, null);
  assert.equal(rows.get("bad-5").liveSession, null);
  assert.equal(rows.get("end-6").liveSession, null);
});

// --------------------------------------------------------------- notice kinds

test("every device_status kind (contract §3) is a fixed sentence, translated in all locales and in the runtime loader", async () => {
  const kinds = model.deviceStatusKinds();
  assert.deepEqual([...kinds].sort(), ["ai_busy", "asleep", "cleanup_required", "envelope_expired", "human_in_control", "hung",
    "local_exec_disabled", "needs_local_confirm", "offline", "ok", "paused", "screen_locked", "signed_out"]);
  for (const locale of LOCALES) {
    const tt = ttFor(locale);
    const runtime = locale === "zh" ? null : await loadUiMessages(locale);
    for (const kind of kinds) {
      const zh = model.deviceStatusNoticeText(kind, "服务器写的话");
      assert.notEqual(zh, "服务器写的话", `${kind} has its own sentence`);
      const text = model.deviceStatusNoticeLine(kind, "服务器写的话", tt);
      if (locale === "zh") { assert.equal(text, zh); continue; }
      assert.ok(text?.trim() && text !== zh, `${locale} translates ${kind}`);
      assert.equal(runtime[zh], text, `${locale} runtime differs: ${kind}`);
      if (!["zh-TW", "ja"].includes(locale)) assert.doesNotMatch(text, HAN, `${locale} ${kind}: ${text}`);
      assert.doesNotMatch(text, /\b[a-z]+_[a-z_]+\b/, `${locale} ${kind}: no raw code`);
    }
  }
  assert.deepEqual(["paused", "ai_busy", "local_exec_disabled"].map(model.cloudHealthTone), ["pause", "pause", "stuck"]);
  // The live line and the remote-desktop banner use the same sentences.
  const busy = model.parseLocalAgentRun(cloudRun({ health: { kind: "ai_busy" } }));
  assert.equal(model.cloudRunStatus(busy, zhTt, Date.now()), model.CLOUD_AGENT_COPY.aiBusy);
  assert.equal(model.remoteDesktopAgentBanner(model.parseLocalAgentRun(cloudRun({ health: { kind: "local_exec_disabled" } }))).text,
    model.CLOUD_AGENT_COPY.healthLocalExec);
});

test("a kind this build does not know: stored text in a Chinese UI, the generic translated sentence elsewhere", () => {
  assert.equal(model.deviceStatusNoticeLine("brand_new", "服务器写的话", zhTt), "服务器写的话");
  assert.equal(model.deviceStatusNoticeLine("brand_new", "服务器写的话", enTt), UI_MESSAGES.en[model.CLOUD_AGENT_COPY.healthOther]);
  assert.equal(model.deviceStatusNoticeLine("brand_new", model.CLOUD_AGENT_COPY.healthOffline, enTt), UI_MESSAGES.en[model.CLOUD_AGENT_COPY.healthOffline],
    "a stored sentence the catalogs know is still translated");
  assert.equal(model.deviceStatusNoticeLine(undefined, "", enTt), UI_MESSAGES.en[model.CLOUD_AGENT_COPY.healthOther]);
  assert.equal(model.deviceStatusNoticeLine("constructor", "x", zhTt), "x", "no prototype lookups");
});

test("notice times come from meta.health in the viewer's own clock and time zone", async () => {
  const health = { kind: "offline", since: "2026-10-27T08:41:23Z", last_contact_at: "2026-10-27T08:41:08Z" };
  const now = Date.parse("2026-10-27T08:50:00Z");
  await withTimeZone("Asia/Shanghai", () => {
    assert.equal(model.deviceStatusNoticeTime("offline", health, zhTt, now), "上次联系 16:41");
    assert.equal(model.deviceStatusNoticeTime("ok", { since: "2026-10-27T08:45:00Z" }, zhTt, now), "16:45");
  });
  await withTimeZone("America/Los_Angeles", () => {
    assert.equal(model.deviceStatusNoticeTime("offline", health, zhTt, now), "上次联系 01:41");
    assert.equal(model.deviceStatusNoticeTime("offline", health, enTt, now), `${UI_MESSAGES.en[model.CLOUD_AGENT_COPY.noticeLastContact].replace("{time}", "01:41")}`);
    assert.equal(model.deviceStatusNoticeTime("asleep", { since: "2026-10-27T08:45:00Z" }, zhTt, now), "01:45", "no contact time: when the state began");
    assert.equal(model.deviceStatusNoticeTime("hung", {}, zhTt, now), null);
  });
});

const { AgentTranscriptBubble } = await import(await compileModule("src/shell/AgentTranscriptBubble.tsx", {
  "../i18n/ui/useUI": ttStub,
  "./share/share-clipboard": dataModule("export async function writeClipboardText(){ return true; }"),
}));

test("transcript, English UI: every notice kind reads translated with its local time; no Chinese, no code", async (t) => {
  // The fixture is a same-day notice; pin its day so the date label is deterministic.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-27T12:00:00Z") });
  globalThis.__fwDict = UI_MESSAGES.en;
  document.documentElement.lang = "en";
  const since = "2026-10-27T08:41:23Z";
  const contact = "2026-10-27T08:41:08Z";
  try {
    await withTimeZone("Europe/Berlin", async () => {
      for (const kind of model.deviceStatusKinds()) {
        const fixed = model.deviceStatusNoticeText(kind, null);
        const view = await mount(React.createElement(AgentTranscriptBubble, {
          message: { id: 9, role: "assistant", kind: "device_status", content: fixed, meta: { text: fixed, health: { kind, since, last_contact_at: contact } } },
        }));
        try {
          const node = view.host.querySelector("[data-device-status]");
          assert.equal(node.getAttribute("data-device-status"), kind);
          assert.ok(node.textContent.includes(UI_MESSAGES.en[fixed]), `${kind}: ${node.textContent}`);
          assert.doesNotMatch(node.textContent, HAN, `${kind}: ${node.textContent}`);
          const time = node.querySelector("[data-device-status-time]").textContent;
          assert.equal(time, ["offline", "asleep"].includes(kind)
            ? UI_MESSAGES.en[model.CLOUD_AGENT_COPY.noticeLastContact].replace("{time}", clockOf(contact)) : clockOf(since));
        } finally { await view.unmount(); }
      }
    });
    // A Chinese fallback text under an unknown kind never reaches an English reader.
    const view = await mount(React.createElement(AgentTranscriptBubble, {
      message: { id: 10, role: "assistant", kind: "device_status", content: "服务器写的话", meta: { text: "服务器写的话", health: { kind: "brand_new" } } },
    }));
    try { assert.equal(view.host.querySelector("[data-device-status]").textContent, UI_MESSAGES.en[model.CLOUD_AGENT_COPY.healthOther]); }
    finally { await view.unmount(); }
  } finally { globalThis.__fwDict = {}; document.documentElement.lang = ""; }
});

// --------------------------------------------------------------------- History

test("History maps a refused delete (local_agent_stop_pending) to a sentence; other codes to the page's own words", () => {
  const stopPending = transport.agentApiFailureFromPayload(409, { detail: { code: "local_agent_stop_pending", local_run: { state: "running" } } });
  assert.equal(stopPending.error, "LOCAL_AGENT_STOP_PENDING", "what History used to print");
  assert.equal(model.taskRequestFailureText(stopPending, "删除失败，请重试。"), model.LOCAL_AGENT_COPY.deleteStopPending);
  for (const [status, payload] of [[409, { detail: { code: "execution_target_mismatch" } }], [503, { detail: { code: "local_agent_storage_unavailable" } }],
    [503, { detail: { code: "local_agent_schema_missing" } }], [500, {}], [409, { detail: "task is still running" }]]) {
    assert.equal(model.taskRequestFailureText(transport.agentApiFailureFromPayload(status, payload), "删除失败，请重试。"), "删除失败，请重试。", JSON.stringify(payload));
  }
  assert.equal(model.taskRequestFailureText(transport.agentApiFailureFromPayload(404, { detail: "task not found" }), "x"), model.LOCAL_AGENT_COPY.taskNotFound);
  assert.equal(model.taskRequestFailureText({ ok: false, error: "网络错误：无法连接到 AI 网关。", status: 0 }, "x"), "网络错误：无法连接到 AI 网关。", "a sentence stays");
  for (const locale of LOCALES.filter((l) => l !== "zh")) {
    const text = UI_MESSAGES[locale][model.LOCAL_AGENT_COPY.deleteStopPending];
    assert.ok(text && text !== model.LOCAL_AGENT_COPY.deleteStopPending, locale);
    if (!["zh-TW", "ja"].includes(locale)) assert.doesNotMatch(text, HAN, locale);
    assert.ok(UI_MESSAGES[locale]["删除失败，请重试。"], `${locale} has the fallback`);
  }
});

const historyAgentStub = dataModule(`
  export async function listTasks(){ return { ok: true, data: { items: globalThis.__fwTasks || [] } }; }
  export async function deleteTask(id){ (globalThis.__fwDeletes ||= []).push(id); return globalThis.__fwDeleteResult; }
  export async function getTask(){ return { ok: false, status: 404 }; }
  export function taskCostYuan(){ return 0; }
`);

test("我的任务 page: a refused delete keeps the list and says the computer is still stopping it", async () => {
  const { HistoryPage } = await import(await compileModule("src/shell/HistoryPage.tsx", {
    "../lib/agent": historyAgentStub,
    "../i18n/ui/useUI": ttStub,
    "../ui": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function ConfirmDialog({ onConfirm }) { return React.createElement("button", { "data-fw-confirm": "1", onClick: onConfirm }, "confirm"); } export function SkeletonCard() { return null; } export function SkeletonLine() { return null; }`),
    "./AppPageHeader": dataModule(`import React from ${JSON.stringify(reactUrl)}; export const APP_PAGE_FRAME_CLASS = ""; export function AppPageHeader({ children }) { return React.createElement("div", null, children); }`),
    "./LibraryLayout": dataModule(`export function LibraryToolbar() { return null; }`),
  }));
  globalThis.__fwTasks = [{ id: "t-1", title: "电脑任务", status: "running", mode: "agent", created_at: "2026-10-27T08:00:00Z", project_id: null },
    { id: "t-2", title: "另一个", status: "done", mode: "agent", created_at: "2026-10-27T07:00:00Z", project_id: null }];
  globalThis.__fwDeleteResult = transport.agentApiFailureFromPayload(409, { detail: { code: "local_agent_stop_pending", local_run: { state: "running" } } });
  globalThis.__fwDeletes = [];
  for (const [dict, expected] of [[{}, model.LOCAL_AGENT_COPY.deleteStopPending], [UI_MESSAGES.en, UI_MESSAGES.en[model.LOCAL_AGENT_COPY.deleteStopPending]]]) {
    globalThis.__fwDict = dict;
    const view = await mount(React.createElement(HistoryPage, { onOpen() {} }));
    try {
      await waitFor(() => view.host.querySelectorAll("[aria-label]").length > 0);
      const remove = [...view.host.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label") === (dict["删除"] || "删除"))[0];
      await click(remove);
      await click(document.querySelector("[data-fw-confirm]"));
      await tick(20);
      const alert = view.host.querySelector("[data-history-delete-error]");
      assert.equal(alert?.textContent, expected);
      assert.doesNotMatch(view.host.textContent, /LOCAL_AGENT_STOP_PENDING/);
      assert.ok(view.host.textContent.includes("电脑任务") && view.host.textContent.includes("另一个"), "both rows are still listed");
    } finally { await view.unmount(); }
  }
  globalThis.__fwDict = {};
  assert.deepEqual(globalThis.__fwDeletes, ["t-1", "t-1"]);
});

test("我的任务 sidebar: a refused delete reads as the sentence and the row comes back", async () => {
  const { HistoryInlineList } = await import(await compileModule("src/shell/HistoryMasterDetail.tsx", {
    "../i18n/ui/useUI": ttStub,
    "next/navigation": dataModule(`export function usePathname(){ return "/history"; } export function useRouter(){ return { push(){}, replace(){}, prefetch(){} }; }`),
    "./WorkspaceSelection": dataModule(`export function useWorkspaceSelection(){ return globalThis.React.useState(null); }`),
    "./AgentChat": dataModule(`export function AgentChat(){ return null; }`),
    "./library-task-history": dataModule(`export function LibraryTaskHistoryWorkspace(){ return null; }`),
    "./WorkspaceSession": dataModule(`export function WorkspaceSessionProvider({ children }){ return children; }`),
    "./HistoryRowActions": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function HistoryRowMenu({ canDelete, onDelete }) { return canDelete ? React.createElement("button", { "data-fw-row-delete": "1", onClick: onDelete }, "row-delete") : null; }
      export function MoveTaskProjectDialog(){ return null; }
    `),
    "../ui": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function ConfirmDialog({ onConfirm }) { return React.createElement("button", { "data-fw-confirm": "1", onClick: onConfirm }, "confirm"); } export function SkeletonCard() { return null; } export function SkeletonLine() { return null; }`),
    "../lib/auth/client": dataModule(`export function browserClient(){ return null; } export async function accessToken(){ return null; }`),
    "../lib/agent": historyAgentStub,
    "../lib/app-session": dataModule(`
      export function isAppSessionApiUnavailableStatus(status){ return status === 404 || status === 405 || status === 501; }
      export async function listAppSessions(){ return { ok: true, data: { items: [] } }; }
      export async function getAppSession(){ return { ok: false, status: 404 }; }
      export async function deleteAppSession(){ return { ok: true }; }
      export async function updateAppSessionMetadata(){ return { ok: true }; }
    `),
  }));
  globalThis.__fwTasks = [{ id: "t-9", title: "电脑上的任务", status: "running", mode: "agent", created_at: "2026-10-27T08:00:00Z", updated_at: "2026-10-27T08:00:00Z", site_id: "oceanleo", project_id: null }];
  globalThis.__fwDeleteResult = transport.agentApiFailureFromPayload(409, { detail: { code: "local_agent_stop_pending" } });
  globalThis.__fwDeletes = [];
  globalThis.__fwDict = {};
  const view = await mount(React.createElement(HistoryInlineList, { siteId: "oceanleo" }));
  try {
    await waitFor(() => view.host.querySelector("[data-fw-row-delete]"));
    await click(view.host.querySelector("[data-fw-row-delete]"));
    await click(document.querySelector("[data-fw-confirm]"));
    await waitFor(() => view.host.textContent.includes(model.LOCAL_AGENT_COPY.deleteStopPending));
    assert.ok(view.host.textContent.includes(model.LOCAL_AGENT_COPY.deleteStopPending));
    assert.doesNotMatch(view.host.textContent, /LOCAL_AGENT_STOP_PENDING/);
    assert.ok(view.host.textContent.includes("电脑上的任务"), "the row is back");
    assert.deepEqual(globalThis.__fwDeletes, ["t-9"]);
  } finally { await view.unmount(); }
});

// ------------------------------------------------- 我的设备 → remote desktop banner

const { DevicesPage } = await import(await compileModule("src/pages/DevicesPage.tsx", {
  "../facades/devices": dataModule(`export const devicesFacade = { async listDevices(){ return { ok: true, data: [] }; } };`),
  "../api/remote-desktop": dataModule(`export const remoteDesktopClient = { async getStatus(){ return { ok: false, error: "x", status: 0 }; } };`),
  "../i18n/ui/useUI": ttStub,
  "../ui": dataModule(`export function ConfirmDialog() { return null; } export function SkeletonCard() { return null; } export function SkeletonLine() { return null; }`),
  "./PageHeader": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function PageHeader({ title }) { return React.createElement("h1", null, title); }`),
  "./AuthDialog": dataModule(`export function AuthDialog() { return null; }`),
  "./devices/CloudDeviceGrid": dataModule(`export function CloudDeviceGrid() { return null; } export function CloudComputersPage() { return null; }`),
  "../shell/cloud-computer/CreateComputerDialog": dataModule(`export function CreateComputerDialog() { return null; }`),
  "../shell/cloud-computer/ConnectServerDialog": dataModule(`export function ConnectServerDialog() { return null; }`),
}));

function rdClient(executable = false, releaseWait) {
  const log = { create: 0, closes: 0, releases: 0 };
  return {
    log,
    async getStatus() { return { ok: true, data: { supported: true, enabled: true, online: true, session_id: null, availability: "online" } }; },
    async createSession() { log.create += 1; return { ok: true, data: { session_id: `rd-${log.create}`, state: "pending_consent", expires_at: "", ...(executable ? {transport: "websocket-v2"} : {}) } }; },
    async openStream(_device, _session, handlers) { handlers.state("active"); return {ok: true, data: {send(){return true;}, acknowledgeFrame(){}, close(){}, async releaseForHandoff(){log.releases++;if(releaseWait)await releaseWait;}, finishHandoff(){}}}; },
    async getFrame() { await wait(5); return { ok: true, data: { state: "pending_consent", frame: null } }; },
    async sendInput(deviceId, sessionId, seq) { return { ok: true, data: { accepted: true, seq } }; },
    async closeSession() { log.closes += 1; return { ok: true, data: { closed: true } }; },
  };
}
/** The availability route and the task routes as the hook sees them; `state` is changed by each test step. */
function cloudClient(state) {
  const log = { availability: 0, taskRun: [], control: [] };
  return {
    log,
    async availability() {
      log.availability += 1;
      if (state.absent) return { kind: "absent" };
      return { kind: "ok", devices: target.parseCloudAgentAvailability({ devices: [{ device_id: "pc-1", available: false, reason: "ai_busy", until: state.until ?? null, ...state.row }] }) };
    },
    async taskRun(taskId) { log.taskRun.push(taskId); return { kind: "ok", run: model.parseLocalAgentRun(state.run) }; },
    async control(taskId, action, revision) { log.control.push([taskId, action, revision]); return state.controlFails ? { ok: false, run: null } : { ok: true, run: model.parseLocalAgentRun(state.controlRun) }; },
    async standingGrant() { throw new Error("the devices page reads grants through its settings client"); },
  };
}
const pc = { device_id: "pc-1", platform: "windows", device_name: "工作室", online: true, availability: "online", local_exec_enabled: true, granted_kinds: ["read"], last_seen_at: "2026-10-27T00:00:00Z" };
const devicesClient = { async listDevices() { return { ok: true, data: [{ ...pc }] }; }, async pairDevice() { return { ok: true }; }, async renameDevice() { return { ok: true }; }, async revokeDevice() { return { ok: true }; } };
const settingsClient = (controllers = []) => ({ calls: 0, async getSettings() { this.calls += 1; return { ok: true, data: { controller_id: "c-1", controllers, preferences: { default_task_directory: null, task_folders: [] }, roots: [], availability: "online", preferences_available: true } }; } });
const poll = async () => { await act(async () => { document.dispatchEvent(new window.Event("visibilitychange")); }); await tick(30); };
const banner = () => document.querySelector("[data-remote-agent-banner]");
const handBack = () => document.querySelector("[data-remote-agent-hand-back]");
const waitingText = () => document.querySelector("[data-remote-stage] [role='status']")?.textContent ?? "";

async function openFromDevices(state, settings = settingsClient()) {
  window.history.replaceState(null, "", "/devices");
  const cloud = cloudClient(state);
  const remote = rdClient(Boolean(state.executable), state.releaseWait);
  const view = await mount(React.createElement(DevicesPage, { client: devicesClient, remoteDesktopClient: remote, cloudAgentClient: cloud,
    settingsClient: settings, remoteStatusIntervalMs: 1000, listIntervalMs: 60_000, currentUser: async () => ({ known: true, userId: "owner" }) }));
  await tick(20);
  await click(byText("进入桌面"));
  await tick(40);
  return { view, cloud, remote, settings };
}

test("我的设备 → remote desktop: the live session's task gives the task page's banner and 交还给 AI", async () => {
  globalThis.__fwDict = {};
  const live = { session_id: "cas_01JD00000000000000000000AB", task_id: "task-1", owner: "ai", state: "running" };
  const state = { executable: true, row: { remote_takeover: false, live_session: live }, run: cloudRun() };
  const { view, cloud, remote } = await openFromDevices(state);
  try {
    assert.equal(remote.log.create, 1, "进入桌面 is the one request");
    await waitFor(() => banner());
    assert.equal(banner().textContent, model.CLOUD_AGENT_COPY.bannerAi);
    assert.equal(handBack(), null);
    assert.deepEqual(cloud.log.taskRun, ["task-1"]);
    // A person took over: the same 交还给 AI as the task page, one revision-fenced resume.
    state.row = { remote_takeover: false, live_session: { ...live, owner: "human", state: "paused" } };
    state.run = cloudRun({ state: "paused", owner: "human", control_revision: 7, report_seq: 9, health: { kind: "human_in_control", since: "2026-10-27T08:01:00Z" } });
    state.controlRun = cloudRun({ state: "paused", desired_state: "run", owner: "human", control_revision: 8, report_seq: 10, health: { kind: "human_in_control" } });
    await poll();
    await waitFor(() => handBack());
    assert.match(banner().textContent, new RegExp(model.CLOUD_AGENT_COPY.healthHuman.slice(0, 8)));
    await click(handBack());
    await tick(20);
    assert.deepEqual(cloud.log.control, [["task-1", "resume", 7]]);
    // Same as the task page: until the computer reports the AI back, the person is still in control.
    assert.equal(model.remoteDesktopAgentBanner(model.parseLocalAgentRun(state.controlRun)).text, model.CLOUD_AGENT_COPY.healthHuman);
    state.row = { remote_takeover: false, live_session: { ...live, owner: "ai", state: "running" } };
    state.run = cloudRun({ control_revision: 8, report_seq: 11 });
    await poll();
    await waitFor(() => banner()?.textContent === model.CLOUD_AGENT_COPY.bannerAi);
    assert.equal(banner().textContent, model.CLOUD_AGENT_COPY.bannerAi);
    assert.equal(handBack(), null);
    // The session ended: today's panel.
    state.row = { remote_takeover: false };
    await poll();
    await waitFor(() => !banner());
    assert.equal(banner(), null);
    assert.equal(remote.log.create, 1, "the banner never opens a session");
  } finally { await view.unmount(); }
});

test("我的设备: a hand back without a confirmed answer says so and is not re-sent", async () => {
  globalThis.__fwDict = {};
  const live = { session_id: "cas_A", task_id: "task-2", owner: "human", state: "paused" };
  const state = { executable: true, row: { remote_takeover: false, live_session: live }, controlFails: true,
    run: cloudRun({ session_id: "cas_A", state: "paused", owner: "human", control_revision: 5, health: { kind: "human_in_control" } }) };
  const { view, cloud } = await openFromDevices(state);
  try {
    await waitFor(() => handBack());
    await click(handBack());
    await tick(20);
    assert.deepEqual(cloud.log.control, [["task-2", "resume", 5]]);
    assert.ok(document.querySelector("[data-remote-agent-note]").textContent.includes("没有收到电脑控制的确认"));
    await tick(60);
    assert.equal(cloud.log.control.length, 1, "never retried");
  } finally { await view.unmount(); }
});

test("我的设备: a developer session (no task) says who is in control, without 交还给 AI or any task read", async () => {
  globalThis.__fwDict = {};
  const state = { row: { remote_takeover: false, live_session: { session_id: "cas_dev", task_id: null, owner: "human", state: "paused" } } };
  const { view, cloud } = await openFromDevices(state);
  try {
    await waitFor(() => banner());
    assert.equal(banner().textContent, model.CLOUD_AGENT_COPY.bannerHuman);
    assert.equal(handBack(), null);
    assert.deepEqual(cloud.log.taskRun, []);
  } finally { await view.unmount(); }
});

test("我的设备: an older gateway (route absent) keeps today's panel and wording", async () => {
  globalThis.__fwDict = {};
  const { view } = await openFromDevices({ absent: true });
  try {
    await tick(40);
    assert.equal(banner(), null);
    assert.equal(waitingText(), "等待这台电脑确认…");
  } finally { await view.unmount(); }
});

test("consent wording from 我的设备: takeover allowed → connecting; not allowed → someone must approve; a standing grant → connecting", async () => {
  globalThis.__fwDict = {};
  const future = Math.floor(Date.now() / 1000) + 3600;
  let run = await openFromDevices({ row: { remote_takeover: true }, until: future });
  try { await waitFor(() => waitingText() === model.CLOUD_AGENT_COPY.statusConnecting); assert.equal(waitingText(), model.CLOUD_AGENT_COPY.statusConnecting); assert.equal(run.settings.calls, 0); }
  finally { await run.view.unmount(); }
  run = await openFromDevices({ row: { remote_takeover: false } });
  try { await waitFor(() => waitingText() === model.CLOUD_AGENT_COPY.waitConsent); assert.equal(waitingText(), model.CLOUD_AGENT_COPY.waitConsent); }
  finally { await run.view.unmount(); }
  run = await openFromDevices({ row: { remote_takeover: true }, until: Math.floor(Date.now() / 1000) - 60 }, settingsClient([{ grant_id: "g", controller_id: "c-1", label: "Chrome", is_current: true, last_used_at: null, expires_at: null, created_at: "" }]));
  try { await waitFor(() => waitingText() === model.CLOUD_AGENT_COPY.statusConnecting); assert.equal(waitingText(), model.CLOUD_AGENT_COPY.statusConnecting, "expired envelope, but 永久同意 for this browser"); }
  finally { await run.view.unmount(); }
  run = await openFromDevices({ row: {} });
  try { await tick(60); assert.equal(waitingText(), "等待这台电脑确认…", "no remote_takeover field: today's wording"); }
  finally { await run.view.unmount(); }
});

// ------------------------------------------------------ task page: 接管电脑 consent

const { LocalAgentTaskStatus } = await import(await compileModule("src/shell/LocalAgentTaskStatus.tsx", {
  "../i18n/ui/useUI": ttStub,
  "../lib/cloud-agent-api": dataModule(`
    export async function getAgentSession() { return { kind: "gone" }; }
    export async function getAgentObservation() { return { kind: "none" }; }
    export async function listCloudAgentAvailability() { (globalThis.__fwAvailabilityReads ||= []).push(1); return globalThis.__fwAvailability ?? { kind: "absent" }; }
  `),
  "../api/device-settings": dataModule(`
    export const deviceSettingsClient = { async getSettings() { (globalThis.__fwSettingsReads ||= []).push(1);
      return { ok: true, data: { controller_id: "c", controllers: globalThis.__fwControllers || [], preferences: { default_task_directory: null, task_folders: [] }, roots: [], availability: "online", preferences_available: true } }; } };
  `),
  "../pages/RemoteDesktopPanel": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function RemoteDesktopPanel(props) { globalThis.__fwPanel = props; return React.createElement("div", { "data-fake-remote": props.deviceId }); }
  `),
  "../api/devices": dataModule(`export async function listDevices() { return { ok: true, data: [] }; }`),
}));

async function taskPage({ availability, controllers = [], readOnly = false }) {
  globalThis.__fwAvailability = availability;
  globalThis.__fwControllers = controllers;
  globalThis.__fwAvailabilityReads = [];
  globalThis.__fwSettingsReads = [];
  globalThis.__fwPanel = null;
  const controls = [];
  const view = await mount(React.createElement(LocalAgentTaskStatus, { run: model.parseLocalAgentRun(cloudRun()), artifacts: [], busy: false, readOnly, onControl: (action) => controls.push(action) }));
  await tick(30);
  return { view, controls };
}
const availabilityRow = (row) => ({ kind: "ok", devices: target.parseCloudAgentAvailability({ devices: [{ device_id: "pc-1", available: false, reason: "ai_busy", ...row }] }) });
const consentLine = (host) => host.querySelector("[data-cloud-agent-consent]");

test("接管电脑 says up front whether someone at the computer must approve, and the panel gets the same answer", async () => {
  globalThis.__fwDict = {};
  const future = Math.floor(Date.now() / 1000) + 3600;
  // Not allowed, no standing grant: the short line, and the panel waits for a person.
  let page = await taskPage({ availability: availabilityRow({ remote_takeover: false, until: future }) });
  try {
    await waitFor(() => consentLine(page.view.host));
    assert.equal(consentLine(page.view.host).textContent, model.CLOUD_AGENT_COPY.takeOverAsk);
    assert.equal(consentLine(page.view.host).getAttribute("title"), model.CLOUD_AGENT_COPY.takeOverAskHint);
    await click(byText(model.CLOUD_AGENT_COPY.takeOver));
    await waitFor(() => globalThis.__fwPanel);
    assert.equal(globalThis.__fwPanel.consent, "ask");
    assert.equal(globalThis.__fwPanel.ticket?.spent, false, "接管电脑 hands the panel this click's ticket");
    assert.deepEqual(page.controls, ["pause"]);
  } finally { await page.view.unmount(); }
  // Allowed while the envelope lasts: no line, direct.
  page = await taskPage({ availability: availabilityRow({ remote_takeover: true, until: future }) });
  try {
    await tick(30);
    assert.equal(consentLine(page.view.host), null);
    assert.equal(globalThis.__fwSettingsReads.length, 0, "no grant read needed");
    await click(byText(model.CLOUD_AGENT_COPY.takeOver));
    await waitFor(() => globalThis.__fwPanel);
    assert.equal(globalThis.__fwPanel.consent, "direct");
  } finally { await page.view.unmount(); }
  // Not allowed, but this browser has 永久同意: no line; an expired grant does not count.
  page = await taskPage({ availability: availabilityRow({ remote_takeover: false }), controllers: [{ is_current: true, expires_at: null }] });
  try { await tick(30); assert.equal(consentLine(page.view.host), null); }
  finally { await page.view.unmount(); }
  page = await taskPage({ availability: availabilityRow({ remote_takeover: false }), controllers: [{ is_current: true, expires_at: "2020-01-01T00:00:00Z" }, { is_current: false, expires_at: null }] });
  try { await waitFor(() => consentLine(page.view.host)); assert.ok(consentLine(page.view.host)); }
  finally { await page.view.unmount(); }
  // Older gateways (no field, or no route): today's block, no line.
  for (const availability of [availabilityRow({}), { kind: "absent" }]) {
    page = await taskPage({ availability });
    try {
      await tick(30);
      assert.equal(consentLine(page.view.host), null);
      await click(byText(model.CLOUD_AGENT_COPY.takeOver));
      await waitFor(() => globalThis.__fwPanel);
      assert.equal(globalThis.__fwPanel.consent, undefined);
    } finally { await page.view.unmount(); }
  }
  // A read-only view asks nothing.
  page = await taskPage({ availability: availabilityRow({ remote_takeover: false }), readOnly: true });
  try { await tick(30); assert.equal(globalThis.__fwAvailabilityReads.length, 0); }
  finally { await page.view.unmount(); }
});

test('device handback reads the current revision only after executed release',async()=>{let release;const releaseWait=new Promise(resolve=>{release=resolve;});const live={session_id:'cas_A',task_id:'task-fresh',owner:'human',state:'paused'};const state={executable:true,releaseWait,row:{remote_takeover:false,live_session:live},run:cloudRun({session_id:'cas_A',state:'paused',owner:'human',control_revision:5,report_seq:8,health:{kind:'human_in_control'}})};const {view,cloud}=await openFromDevices(state);try{await waitFor(()=>handBack());await click(handBack());assert.deepEqual(cloud.log.control,[]);state.run=cloudRun({session_id:'cas_A',state:'paused',owner:'human',control_revision:6,report_seq:9,health:{kind:'human_in_control'}});await poll();await act(async()=>release());await tick(20);assert.deepEqual(cloud.log.control,[['task-fresh','resume',6]]);}finally{await view.unmount();}});
