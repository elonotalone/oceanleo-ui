import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.CustomEvent = window.CustomEvent;

const actions = await import(await compileModule("src/shell/workspace-actions.ts"));

test("V2 workspace actions preserve V1 fields and drop secret prefill values", () => {
  const action = actions.normalizeWorkspaceAction({
    version: 2,
    tab: "settings",
    section: "vault",
    prefill: { name: "OpenAI", kind: "api_key", target: "oceanleo", value: "must-drop" },
    deviceId: "device-1",
  });
  assert.deepEqual({ version: action.version, tab: action.tab, section: action.section, prefill: action.prefill, deviceId: action.deviceId }, {
    version: 2,
    tab: "settings",
    section: "vault",
    prefill: { name: "OpenAI", kind: "api_key", target: "oceanleo" },
    deviceId: "device-1",
  });
  const legacy = actions.normalizeWorkspaceAction({ version: 1, tab: "preview", query: "x" });
  assert.equal(legacy.version, 1);
  assert.equal(legacy.tab, "preview");
  assert.equal(legacy.query, "x");
});

test("card behavior opens managed pages, hides browser card, and returns", async () => {
  const homeUrl = await compileModule("src/shell/result-canvas-home.tsx", {
    "../i18n/ui/useUI": dataModule("export function useUI(){ return (value) => value; }"),
    "../lib/im/client": dataModule("export function useImEnabled(){ return false; }"),
    "./result-canvas-view": dataModule("export const WORKSPACE_SLOT_LABELS={preview:'生成',browser:'云端浏览器',template:'灵感',materials:'LeoBay',mine:'我的库'};"),
    "./bay/shell/bay-icons": dataModule("export function BayIcon(){ return null; }"),
    "./messages/realtime/hooks": dataModule("export function useImUnread(){ return { total: 0 }; }"),
  });
  const { WorkspaceHome, WorkspaceViewHeader } = await import(homeUrl);
  const rootNode = document.createElement("div");
  document.body.append(rootNode);
  const root = createRoot(rootNode);
  const opened = [];
  await act(async () => root.render(React.createElement(WorkspaceHome, {
    slots: ["preview", "browser"], panels: { bay: false, leochat: false },
    onOpenSlot: (id) => opened.push(id), onOpenPanel: (id) => opened.push(id),
  })));
  assert.equal(rootNode.querySelector('[data-workspace-card="browser"]'), null);
  await act(async () => rootNode.querySelector('[data-workspace-card="devices"]').click());
  await act(async () => rootNode.querySelector('[data-workspace-card="projects"]').click());
  await act(async () => rootNode.querySelector('[data-workspace-card="settings"]').click());
  assert.deepEqual(opened, ["devices", "projects", "settings"]);
  await act(async () => root.render(React.createElement(WorkspaceViewHeader, { title: "Devices", onBack: () => opened.push("home") })));
  await act(async () => rootNode.querySelector("[data-workspace-back]").click());
  assert.equal(opened.at(-1), "home");
  root.unmount();
});

test("browser action routes through the Devices cloud-browser page", async () => {
  const presets = await import(await compileModule("src/shell/agent-ui-presets.ts"));
  const events = [];
  const receive = (event) => events.push(event.detail);
  window.addEventListener("oceanleo:workspace-action", receive);
  presets.openWorkspacePage({ version: 1, tab: "browser" });
  window.removeEventListener("oceanleo:workspace-action", receive);
  assert.equal(events.length, 1);
  assert.equal(events[0].action.version, 2);
  assert.equal(events[0].action.tab, "devices");
  assert.equal(events[0].action.section, "cloud-browser");
});

test("settings panel passes section and safe vault prefill to SettingsHub", async () => {
  let props;
  const panelUrl = await compileModule("src/shell/workspace-panels/SettingsWorkspacePanel.tsx", {
    "../../pages/settings/SettingsHub": dataModule("export function SettingsHub(input){ globalThis.__t5SettingsProps=input; return null; }"),
  });
  const { SettingsWorkspacePanel } = await import(panelUrl);
  const rootNode = document.createElement("div");
  const root = createRoot(rootNode);
  await act(async () => root.render(React.createElement(SettingsWorkspacePanel, {
    section: "vault", prefill: { name: "Key", kind: "api_key", target: "app", value: "secret" },
  })));
  props = globalThis.__t5SettingsProps;
  assert.equal(props.initialTab, "vault");
  assert.deepEqual(props.vaultPrefill, { name: "Key", kind: "api_key", target: "app" });
  root.unmount();
});

test("agent presets apply theme and locale through the existing browser settings", async () => {
  const presets = await import(await compileModule("src/shell/agent-ui-presets.ts"));
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  presets.applyAgentPreset({ kind: "theme", value: "dark" });
  assert.equal(document.documentElement.classList.contains("dark"), true);
  presets.applyAgentPreset({ kind: "theme", value: "system" });
  assert.equal(document.documentElement.classList.contains("dark"), true);
  presets.applyAgentPreset({ kind: "locale", value: "en" });
  assert.match(document.cookie, /NEXT_LOCALE=en/);
});
