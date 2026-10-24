import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// REAL: AdvancedWorkspaceActionBar (production save slot). Only i18n and the right-pane context are stubbed.
const url = await compileModule("src/shell/AdvancedWorkspaceActionBar.tsx", {
  "../i18n/ui/useUI": dataModule(`export function useUI() { return text => text; }`),
  "./SplitWorkspace": dataModule(`export function useRightPaneSlot() { return null; }`),
});
const { AdvancedWorkspaceActionBar } = await import(url);
const noop = () => {};

function render({ destination, state, recoveryReady = true, error }) {
  return renderToStaticMarkup(React.createElement(AdvancedWorkspaceActionBar, {
    adapter: { id: "image", label: "图片", stage: null, persistence: {
      dirty: false, editRevision: 0, flush: noop,
      ...(destination === undefined ? {} : { destination }),
      recovery: { key: "k", ready: recoveryReady, capture: noop, restore: noop },
    } },
    autoSaveState: state, autoSaveError: error, activeLibraryPanelId: null,
    onBack: noop, onOpenLibrary: noop, onRetrySave: noop, onTriggerAction: noop,
  }));
}

test("typed local-device destination: saved/saving say so, with a device icon and no cloud", () => {
  const saved = render({ destination: "local-device", state: "saved" });
  assert.match(saved, /data-save-destination="local-device"/);
  assert.match(saved, /title="已保存到本机（未同步到云端）"/);
  assert.match(saved, /<span class="sr-only">已保存到本机（未同步到云端）<\/span>/);
  assert.doesNotMatch(saved, /M7 18h10/, "no cloud path");
  assert.match(saved, /<rect /);
  const saving = render({ destination: "local-device", state: "saving" });
  assert.match(saving, /正在保存到本机/);
  assert.doesNotMatch(saving, /已保存/);
});

test("local-device failures and unconfirmed stay honest and keep the retry affordance", () => {
  const failed = render({ destination: "local-device", state: "error", error: "宿主拒绝保存" });
  assert.match(failed, /data-save-state="error"/);
  assert.match(failed, /保存遇到问题/);
  assert.match(failed, /title="[^"]*宿主拒绝保存/);
  assert.doesNotMatch(failed, /已保存到本机/);
  const unconfirmed = render({ destination: "local-device", state: "saved", recoveryReady: false });
  assert.match(unconfirmed, /data-save-state="unconfirmed"/);
  assert.match(unconfirmed, /尚未确认保存/);
  assert.doesNotMatch(unconfirmed, /已保存到本机/);
});

test("absent or cloud destination is exactly the old cloud slot", () => {
  for (const destination of [undefined, "cloud"]) {
    const saved = render({ destination, state: "saved" });
    assert.match(saved, /data-save-destination="cloud"/);
    assert.match(saved, /<span class="sr-only">已保存<\/span>/);
    assert.match(saved, /M7 18h10/);
    assert.doesNotMatch(saved, /本机/);
    assert.match(render({ destination, state: "saving" }), /正在自动保存/);
  }
});
