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
    onBack: noop, onOpenLibrary: noop, onRetrySave: noop, onTriggerAction: noop,
  }));
}

// 编辑器整改波 D1/§6（2026-10-23）：保存状态槽恒在——以前 ready=false 时整槽隐藏，
// PDF 处理中云朵就消失了。保护不放松：回执到达前照样绝不说「已保存」，如实显示「尚未确认保存」。
test("D1 R4: before the draft receipt, the save slot stays visible but never claims saved", () => {
  const pending = render(false);
  assert.match(pending, /data-global-row-slot="save-state"/, "ready=false 时保存状态槽被藏起来了");
  assert.match(pending, /data-workspace-save-launcher/);
  assert.match(pending, /data-save-state="unconfirmed"/);
  assert.match(pending, /尚未确认保存/);
  assert.doesNotMatch(pending, /已保存|data-workspace-save-menu/);
});

test("D1 R4: the confirmed draft retains its original saved status", () => {
  const confirmed = render(true);
  assert.match(confirmed, /已保存/);
  assert.match(confirmed, /data-workspace-save-launcher/);
  assert.doesNotMatch(confirmed, /aria-haspopup="menu"/);
});
