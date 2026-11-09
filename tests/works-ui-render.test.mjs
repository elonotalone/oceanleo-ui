import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__React = React;

const calls = { created: [], previews: 0, stopped: 0, removed: 0 };
const api = {
  async list() { return [{ id: "w1", title: "Demo site", kind: "website", home: { type: "server", computer_id: "cc1", computer_name: "Office", path: "/srv/demo" }, preview: { available: true }, links: [], status: "stopped", updated_at: "2026-11-09T00:00:00Z" }]; },
  async createServer(input) { calls.created.push(input); return { id: "w2", title: input.title || "demo", kind: input.kind || "website", home: { type: "server", computer_id: input.computer_id, computer_name: "Office", path: input.path }, preview: { available: true }, links: [], status: "draft", updated_at: "2026-11-09T00:00:00Z" }; },
  async preview() { calls.previews++; return { status: "starting", stage: "install" }; },
  async stop() { calls.stopped++; return { status: "failed", reason: "stopped" }; },
  async remove() { calls.removed++; },
  async update() { throw new Error("unused"); },
};
const computerClient = { async listComputers() { return { items: [{ id: "cc1", name: "Office", source: "byo", status: "active", edition: "dev", node_online: true, enrolled_at: "yes", confirmed_at: "yes", created_at: "", updated_at: "" }] }; } };
const ui = dataModule("const tt=(value, vars)=>vars ? String(value).replace(/\\{(\\w+)\}/g, (_, key) => String(vars[key] ?? _)) : String(value); export function useUI(){ return tt; }");
const mod = await import(await compileModule("src/shell/works/WorksOverview.tsx", {
  "../../ui": dataModule("export function Modal({children}){return children;}"),
  "../../i18n/ui/useUI": ui,
  "../../lib/cloud-computer-api": dataModule("export const cloudComputerApi={};"),
  "../local-task-client": dataModule("export async function startLocalAction(){ return { stop(){} }; }"),
  "../../api/device-settings": dataModule("export const deviceSettingsClient={};"),
  "../../pages/devices/DeviceFolderPicker": dataModule("export function DeviceFolderPicker({onSelect}){ return globalThis.__React.createElement('button',{type:'button','data-test-picker':true,onClick:()=>onSelect('/srv/selected')},'choose folder'); }"),
  "../cloud-computer/computer-state": dataModule("export function computerDisplayState(computer){ return computer.node_online ? 'ready' : 'offline'; }"),
  "../editor-sandbox-origin": dataModule("export function webViewerFrameSandbox(){ return 'allow-scripts'; }"),
  "../../lib/works-api": dataModule("export class WorksApiError extends Error { get unsupported(){return false;} } export const worksApi={};"),
}));

function button(host, label) { return [...host.querySelectorAll("button")].find((node) => node.textContent.includes(label)); }

async function render(apiOverride = api) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(mod.WorksOverview, { api: apiOverride, computerClient })); await new Promise((resolve) => setTimeout(resolve, 0)); });
  return { host, root };
}

test("works card separates starting state and keeps the preview action", async () => {
  const { host, root } = await render();
  assert.ok(host.querySelector('[data-work-card="w1"]'));
  await act(async () => { button(host, "启动预览").click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(calls.previews, 1);
  assert.match(host.querySelector('[data-work-status-label]')?.textContent || "", /正在启动/);
  await act(async () => root.unmount());
  host.remove();
});

test("add-from-server flow browses a folder and posts the selected path", async () => {
  const { host, root } = await render();
  await act(async () => { button(host, "从服务器添加").click(); });
  await act(async () => { host.querySelector('[data-works-server="cc1"]').click(); });
  await act(async () => { button(host, "浏览文件夹").click(); });
  await act(async () => { host.querySelector("[data-test-picker]").click(); });
  await act(async () => { button(host, "确认添加").click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(calls.created.at(-1).computer_id, "cc1");
  assert.equal(calls.created.at(-1).path, "/srv/selected");
  await act(async () => root.unmount());
  host.remove();
});

test("cloud move chooses an online server and reports an occupied destination", async () => {
  const moveCalls = [];
  class MoveError extends Error { constructor() { super("destination_not_empty"); this.code = "destination_not_empty"; this.detailMessage = ""; } }
  const moveApi = {
    ...api,
    async list() { return [
      { id: "cloud-artifact:a1", title: "Cloud site", kind: "website", home: { type: "cloud", artifact_id: "a1" }, preview: { available: true }, links: [], status: "published", updated_at: "2026-11-09T00:00:00Z" },
      { id: "w1", title: "Server site", kind: "website", home: { type: "server", computer_id: "cc1", computer_name: "Office", path: "/srv/demo" }, preview: { available: true }, links: [], status: "stopped", updated_at: "2026-11-09T00:00:00Z" },
    ]; },
    async moveToServer(input) { moveCalls.push(input); throw new MoveError(); },
  };
  const { host, root } = await render(moveApi);
  await act(async () => { button(host, "搬到我的服务器").click(); });
  await act(async () => { host.querySelector('[data-works-move-server="cc1"]').click(); });
  await act(async () => { button(host, "浏览文件夹").click(); });
  await act(async () => { host.querySelector("[data-test-picker]").click(); });
  await act(async () => { button(host, "确认搬到服务器").click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(moveCalls[0].artifact_id, "a1");
  assert.equal(moveCalls[0].path, "/srv/selected");
  assert.match(host.textContent, /已有内容/);
  await act(async () => root.unmount());
  host.remove();
});

test("server save-to-cloud reports the 50 MiB and 1000-file limits", async () => {
  const saveCalls = [];
  const saveApi = {
    ...api,
    async saveToCloud(id) { saveCalls.push(id); const error = new Error("source_too_large"); error.code = "source_too_large"; error.detailMessage = ""; throw error; },
  };
  const { host, root } = await render(saveApi);
  await act(async () => { button(host, "存回云端").click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.deepEqual(saveCalls, ["w1"]);
  assert.match(host.textContent, /50 MiB/);
  assert.match(host.textContent, /1000/);
  await act(async () => root.unmount());
  host.remove();
});
