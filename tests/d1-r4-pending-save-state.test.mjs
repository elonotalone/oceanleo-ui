import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const url = await compileModule("src/shell/AdvancedWorkspaceActionBar.tsx", {
  "../i18n/ui/useUI": dataModule(`export function useUI() { return text => text; }`),
  "./SplitWorkspace": dataModule(`export function useRightPaneSlot() { return null; }`),
});
const { AdvancedWorkspaceActionBar } = await import(url);
const noop = () => {};
function render(ready) {
  return renderToStaticMarkup(React.createElement(AdvancedWorkspaceActionBar, {
    adapter: { id: "deck", label: "PPT", stage: null, persistence: {
      dirty: false, editRevision: 0, flush: noop,
      recovery: { key: "draft", ready, capture: noop, restore: noop },
    } },
    autoSaveState: "saved", activeLibraryPanelId: null,
    onBack: noop, onOpenLibrary: noop, onRetrySave: noop, onSaveNow: noop, onTriggerAction: noop,
  }));
}

test("D1 R4: before the draft receipt, the shared header does not claim saved or expose saving", () => {
  const pending = render(false);
  assert.doesNotMatch(pending, /已保存|data-workspace-save-launcher|data-workspace-save-menu/);
});

test("D1 R4: the confirmed draft retains its original saved status and save menu", () => {
  const confirmed = render(true);
  assert.match(confirmed, /已保存/);
  assert.match(confirmed, /data-workspace-save-launcher/);
  assert.match(confirmed, /aria-haspopup="menu"/);
});
