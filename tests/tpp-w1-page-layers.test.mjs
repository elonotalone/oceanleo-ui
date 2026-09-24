import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function layer(sourceText, marker) {
  const start = sourceText.indexOf(marker);
  assert.notEqual(start, -1, `${marker} exists`);
  const nearby = sourceText.slice(start, start + 500);
  const match = nearby.match(/z-\[(\d+)\]|\bz-(\d+)\b/);
  assert.ok(match, `${marker} has a static layer`);
  return Number(match[1] ?? match[2]);
}

test("all pane and plugin headers sit below every page overlay", async () => {
  const split = await source("src/shell/SplitWorkspace.tsx");
  const plugin = await source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  const row = await source("src/shell/plugin-chrome/PluginPageRow.tsx");
  const advanced = await source("src/shell/InlineAdvancedWorkbenchHeader.tsx");
  const headers = [
    layer(split, "data-pane-header\n"),
    layer(split, "data-oceanleo-pane-header"),
    layer(plugin, "data-plugin-chrome-rows"),
    layer(row, "data-plugin-page-row"),
    layer(advanced, "data-advanced-workbench-header"),
  ];
  const overlays = [
    layer(await source("src/shell/LeoAssistant.tsx"), "className={`fixed z-50"),
    layer(await source("src/shell/share/ShareCard.tsx"), 'className="fixed inset-0 z-[80]'),
    layer(await source("src/pages/settings/SettingsModal.tsx"), "z-[160]"),
    layer(await source("src/ui/index.tsx"), "z-[1000]"),
    layer(await source("src/pages/PhoneBindGate.tsx"), "fixed inset-0 z-[1100]"),
    layer(await source("src/shell/cloud-browser-history-view.tsx"), "fixed inset-0 z-[2147483600]"),
    layer(await source("src/shell/CloudBrowserPanel.tsx"), "fixed inset-0 z-[2147483647]"),
    layer(await source("src/shell/WorkbenchErrorBoundary.tsx"), "fixed inset-0 z-[2147483000]"),
  ];
  assert.ok(Math.max(...headers) < Math.min(...overlays), `${headers} must be below ${overlays}`);
});

test("pane headers remain above their local edit bar overlay", async () => {
  const split = await source("src/shell/SplitWorkspace.tsx");
  const plugin = await source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  const toolbar = await source("src/shell/FloatingContextToolbar.tsx");
  const overlay = layer(toolbar, 'className="pointer-events-none absolute inset-0');
  assert.ok(layer(split, "data-oceanleo-pane-header") > overlay);
  assert.ok(layer(plugin, "data-plugin-chrome-rows") > overlay);
  assert.match(toolbar, /createPortal\([\s\S]*?controller\.portalRoot/);
});

test("pane wrappers do not trap inline fixed page overlays below the sidebar", async () => {
  const split = await source("src/shell/SplitWorkspace.tsx");
  const plugin = await source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  assert.doesNotMatch(split, /data-workspace-pane="(?:left|main)"[\s\S]{0,250}(?:isolate|z-\d+|z-\[)/);
  assert.doesNotMatch(plugin, /data-plugin-chrome-owner="(?:host|self)"[\s\S]{0,250}(?:isolate|z-\d+|z-\[)/);
  assert.match(await source("src/shell/cloud-browser-history-view.tsx"), /document\.fullscreenElement[\s\S]*?document\.body;[\s\S]*?createPortal\(/);
  assert.match(await source("src/shell/WorkbenchErrorBoundary.tsx"), /createPortal\(fallback, document\.body\)/);
});
