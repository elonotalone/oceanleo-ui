import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { compileModule } from "./helpers/module-bench.mjs";

const actions = await import(await compileModule("src/shell/workspace-actions.ts"));

test("V2 workspace actions preserve V1 fields and sanitize page targets", () => {
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

test("sidebar cards expose managed pages and keep cloud browser under Devices", () => {
  const home = readFileSync(new URL("../src/shell/result-canvas-home.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/shell/workspace-panels/DevicesWorkspacePanel.tsx", import.meta.url), "utf8");
  assert.match(home, /title=\{tt\(id === "devices" \? "Devices"/);
  assert.match(home, /id === "browser" \? null/);
  assert.match(panel, /data-devices-panel-tab="browser"/);
  assert.match(panel, /<CloudBrowserPanel/);
});

