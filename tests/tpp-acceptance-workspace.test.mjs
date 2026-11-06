import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const UI_ROOT = resolve(new URL("..", import.meta.url).pathname);

function source(relative) {
  return readFileSync(resolve(UI_ROOT, relative), "utf8");
}

function workspaceReady() {
  return existsSync(resolve(UI_ROOT, "src/shell/agent-ui-presets.ts"))
    && existsSync(resolve(UI_ROOT, "src/shell/library-memo"))
    && existsSync(resolve(UI_ROOT, "src/pages/settings/connectors"));
}

test("O8 keeps composer drafts local to this device and ignores cross-device draft events", (t) => {
  if (!workspaceReady()) return t.skip("waiting for T8 local draft implementation");
  const draft = source("src/shell/composer-draft.ts");
  assert.match(draft, /localStorage|sessionStorage|COMPOSER_DRAFT_PREFIX/);
  assert.doesNotMatch(draft, /getComposerDrafts\(/);
  assert.doesNotMatch(draft, /putComposerDraft\(/);
  assert.doesNotMatch(draft, /useImEvent\(["']composer_draft/);
});

test("O9 renders Devices, Projects, and Settings in the existing one-page sidebar flow", (t) => {
  if (!workspaceReady()) return t.skip("waiting for T5 workspace panel implementation");
  const home = source("src/shell/result-canvas-home.tsx");
  const view = source("src/shell/result-canvas-view.tsx");
  const canvas = source("src/shell/ResultCanvas.tsx");
  const devices = source("src/pages/DevicesPage.tsx");
  assert.match(home, /Devices|设备/);
  assert.match(home, /Projects|项目/);
  assert.match(home, /Settings|设置/);
  assert.match(home, /WorkspaceViewHeader|返回/);
  assert.match(view + canvas, /browser/);
  assert.match(view + canvas, /Devices|devices/);
  assert.match(devices, /Devices|设备/);
  assert.doesNotMatch(home, /云端浏览器/);
});

test("O10 renders capability-pack workspace actions and safe theme/locale presets", (t) => {
  if (!workspaceReady()) return t.skip("waiting for T5 workspace action renderer");
  const presets = source("src/shell/agent-ui-presets.ts");
  const actions = source("src/shell/workspace-actions.ts");
  const vault = source("src/pages/settings/VaultSettingsSection.tsx");
  assert.match(presets, /export function openWorkspacePage/);
  assert.match(presets, /export function applyAgentPreset/);
  assert.match(presets, /theme|locale/);
  assert.match(actions, /version:\s*2|WorkspaceActionV2/);
  assert.match(actions, /target_window|targetWindow/);
  assert.match(vault, /prefill|name/);
  assert.doesNotMatch(presets, /value.*prefill|prefill.*value/);
});

test("O11 exposes Memo in Library with server-backed text and artifact entries", (t) => {
  if (!workspaceReady()) return t.skip("waiting for T8 Library Memo UI");
  const memoFiles = [
    "src/lib/library-memo-api.ts",
    "src/shell/MyLibrary.tsx",
    ...["index.ts", "LibraryMemoPage.tsx"].map((name) => `src/shell/library-memo/${name}`),
  ];
  for (const file of memoFiles) {
    if (!existsSync(resolve(UI_ROOT, file))) return t.skip(`waiting for T8 file ${file}`);
  }
  const api = source("src/lib/library-memo-api.ts");
  const library = source("src/shell/MyLibrary.tsx");
  const page = source("src/shell/library-memo/LibraryMemoPage.tsx");
  assert.match(api, /library\/memo\/items/);
  assert.match(api, /artifact|revision/);
  assert.match(library, /Memo|备忘录/);
  assert.match(page, /add|delete|text|artifact/i);
});

test("O12 presents connectors as one simple status/action list with deep-link support", (t) => {
  if (!workspaceReady()) return t.skip("waiting for T9 connector settings implementation");
  const pane = source("src/pages/settings/ConnectorsSettingsPane.tsx");
  const connectorFiles = ["src/pages/settings/connectors/ConnectorList.tsx", "src/pages/settings/connectors/ConnectorRow.tsx"];
  for (const file of connectorFiles) {
    if (!existsSync(resolve(UI_ROOT, file))) return t.skip(`waiting for T9 file ${file}`);
  }
  const rows = connectorFiles.map(source).join("\n");
  assert.match(rows, /status|connected|error/i);
  assert.match(rows, /Connect|Disconnect|Retry|连接|断开|重试/);
  assert.match(pane + rows, /initialConnectorId|connectorId|scrollIntoView|highlight/i);
  assert.doesNotMatch(rows, /grid-cols-1[^\n]*md:grid-cols-2/);
});
