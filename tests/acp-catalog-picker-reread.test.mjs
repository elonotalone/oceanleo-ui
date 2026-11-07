import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// The home's model pill re-reads the program's catalog (UX wave 2026-11-07, unit HJ, contract §2.2): the
// gateway's probe fills an empty catalog after the node connects, so the pill reads `/catalog` again when the
// computer row changes (the host's `reloadKey`), when the program's access status changes, and once when it is
// opened while empty. Never on a timer. The real hook; the catalog route, program access and pill are stubs.
const require = createRequire(import.meta.url);
const reactUrl = JSON.stringify(pathToFileURL(require.resolve("react")).href);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const { useAcpCatalogPicker } = await import(await compileModule("src/shell/acp-task/useAcpCatalogPicker.tsx", {
  "../../i18n/ui/useUI": dataModule("export function useUI(){ return (zh) => zh; }"),
  "../../lib/acp-frames-api": dataModule(`
    export async function getCatalog(computerId, program) {
      globalThis.__reads.push(computerId + "/" + program);
      return globalThis.__catalog;
    }
  `),
  "../cloud-computer/native-surface/useProgramAccess": dataModule(`
    export function useProgramAccess() {
      return { programs: globalThis.__programs, install: { open: false }, login: { open: false }, openInstall(){}, closeInstall(){},
        setInstallDir(){}, startInstall(){}, openLogin(){}, closeLogin(){}, submitLoginCode(){}, cancelLogin(){}, setLoginCodeDraft(){}, retryConnect(){} };
    }
  `),
  // The remembered choice (real memory module); its server store, where there is one (UX wave §2.1), holds nothing.
  "../../lib/program-choice-api": dataModule(
    "export function programChoiceFrom(){ return {}; }\nexport async function getProgramChoice(){ return {}; }\nexport async function putProgramChoice(){ return {}; }",
  ),
  "../native-thread/NativeModelPicker": dataModule(`
    import React from ${reactUrl};
    export function NativeModelPicker(props) { return React.createElement("span", { "data-picker": props.loading ? "loading" : "empty" }); }
    export function nativeModelPickerFor(input) {
      globalThis.__pill = input;
      return React.createElement("span", { "data-picker": "ready" });
    }
  `),
}));

const status = (logged_in) => ({ id: "claude", installed: true, path: "/usr/bin/claude", version: "2.1.0", auth: "login", logged_in,
  dir_capability: "full", running: false });
function Probe(props) {
  useAcpCatalogPicker(props).picker;
  return null;
}
async function flush() { for (let i = 0; i < 6; i++) await act(async () => {}); }
async function mount({ catalog = {}, programs = [status(false)] } = {}) {
  globalThis.__reads = [];
  globalThis.__catalog = catalog;
  globalThis.__programs = programs;
  globalThis.__pill = null;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async (props) => { await act(async () => root.render(React.createElement(Probe, { computerId: "cc_1", program: "claude", ...props }))); await flush(); };
  return { render, async unmount() { await act(async () => root.unmount()); host.remove(); } };
}

test("the catalog is read again when the computer row changes and when the program's access status changes, never on a timer", async () => {
  const view = await mount();
  try {
    await view.render({ reloadKey: "true|node-1|1.0.0" });
    assert.deepEqual(globalThis.__reads, ["cc_1/claude"]);
    await view.render({ reloadKey: "true|node-1|1.0.0" });
    assert.equal(globalThis.__reads.length, 1, "a re-render with the same row reads nothing");
    await view.render({ reloadKey: "false|node-1|1.0.0" });
    await view.render({ reloadKey: "true|node-1|1.0.0" });
    assert.equal(globalThis.__reads.length, 3, "the computer went away and came back: read on each row change");
    globalThis.__programs = [status(true)];
    await view.render({ reloadKey: "true|node-1|1.0.0" });
    assert.equal(globalThis.__reads.length, 4, "signed in: the program may have reported its lists");
    globalThis.__programs = [status(true)];
    await view.render({ reloadKey: "true|node-1|1.0.0" });
    assert.equal(globalThis.__reads.length, 4, "the same status again (a new array) reads nothing");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)); });
    assert.equal(globalThis.__reads.length, 4, "no polling");
  } finally { await view.unmount(); }
});

test("an empty catalog is read once more when its pill is opened; a second open, or a filled catalog, reads nothing", async () => {
  const view = await mount();
  try {
    await view.render({});
    assert.equal(globalThis.__reads.length, 1);
    assert.equal(typeof globalThis.__pill.onOpen, "function", "the pill reports its opening");
    globalThis.__catalog = { models: { currentModelId: "opus", availableModels: [{ modelId: "opus", name: "Opus" }] } };
    await act(async () => { globalThis.__pill.onOpen(); });
    await flush();
    assert.equal(globalThis.__reads.length, 2, "opened while empty: read again");
    assert.deepEqual(globalThis.__pill.dialog.models.map((model) => model.id), ["opus"], "the lists the probe filled are shown");
    await act(async () => { globalThis.__pill.onOpen(); });
    await flush();
    assert.equal(globalThis.__reads.length, 2, "filled: opening reads nothing");
  } finally { await view.unmount(); }
  const still = await mount();
  try {
    await still.render({});
    await act(async () => { globalThis.__pill.onOpen(); });
    await flush();
    await act(async () => { globalThis.__pill.onOpen(); });
    await flush();
    assert.equal(globalThis.__reads.length, 2, "still empty: only the first open reads it again");
  } finally { await still.unmount(); }
});

// The real pill: opening its menu reports to the catalog picker (plain pill and the native chat's full menu).
const realPicker = await import(await compileModule("src/shell/native-thread/NativeModelPicker.tsx", {
  "../../i18n/ui/useUI": dataModule("export function useUI(){ return (zh) => zh; }"),
  "../anchored-popover": dataModule(`
    import React from ${reactUrl};
    export function AnchoredPopover({ open, children }) { return open ? React.createElement("div", null, children) : null; }
  `),
  "../../lib/cloud-computer-api": dataModule("export const cloudComputerApi = new Proxy({}, { get: () => async () => ({}) });"),
}));

test("the real pill calls onOpen when its menu opens (a native chat's full menu included)", async () => {
  const opened = [];
  const dialog = { models: [], configOptions: [], selectedModel: "", setSelectedModel() {}, mode: null, selectedMode: "", setMode() {},
    setConfig() {}, activeSession: "" };
  const full = { ...dialog, programs: [status(true)], install: { open: false }, login: { open: false }, openInstall() {}, closeInstall() {},
    setInstallDir() {}, startInstall() {}, openLogin() {}, closeLogin() {}, submitLoginCode() {}, cancelLogin() {}, setLoginCodeDraft() {}, retryConnect() {} };
  const withModel = { ...dialog, models: [{ id: "opus", name: "Opus", default: true }], selectedModel: "opus" };
  for (const [name, value] of [["full", full], ["plain", withModel]]) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(realPicker.nativeModelPickerFor({ program: "claude", computerId: "cc_1", dialog: value, waiting: false,
      onOpen: () => opened.push(name) })));
    await flush();
    const trigger = host.querySelector("[data-native-model-trigger]");
    assert.ok(trigger, `${name}: the pill renders its trigger`);
    await act(async () => trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await flush();
    await act(async () => root.unmount());
    host.remove();
  }
  assert.deepEqual(opened, ["full", "plain"]);
});
