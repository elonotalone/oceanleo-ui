import assert from "node:assert/strict";
import test from "node:test";
import { React, act, useRightPaneSlot, AdvancedWorkspaceActionBar,
  PluginChromeFrame, shell, mount } from "./e2-right-pane-fixture.mjs";

let slot;
let slotEffectRuns;
function SlotProbe() {
  const current = useRightPaneSlot();
  slot = current;
  React.useLayoutEffect(() => { slotEffectRuns += 1; }, [current]);
  return null;
}
const contents = (...children) => React.createElement(React.Fragment, null,
  React.createElement(SlotProbe, {key: "probe"}), ...children);
const header = (container) => container.querySelector('[data-workspace-pane="main"] [data-pane-header]');
const isMaximized = (container) => container.querySelector('[data-workspace-split]').dataset.workspaceMaximized === "library";

test("取消/失败：A → B → 释放 B，恢复仍挂着的 A 顶栏和两行按钮", async () => {
  const mounted = await mount(contents(shell("A")));
  try {
    await mounted.render(contents(shell("A"), shell("B")));
    assert.equal(header(mounted.container).querySelector('[data-claim-header]').dataset.claimHeader, "B");
    await mounted.render(contents(shell("A")));
    assert.equal(header(mounted.container).querySelector('[data-claim-header]')?.dataset.claimHeader, "A");
    assert.match(header(mounted.container).textContent, /素材库 我的库/);
  } finally { await mounted.unmount(); }
});

test("顺利切换：释放 A 后 B 顶栏仍在；全程保持右侧全屏和 editorHeader", async () => {
  const mounted = await mount(contents(shell("A")));
  try {
    await act(async () => slot.setRightMaximized(true));
    assert.equal(isMaximized(mounted.container), true);
    await mounted.render(contents(shell("A"), shell("B")));
    assert.equal(isMaximized(mounted.container), true);
    await mounted.render(contents(shell("B")));
    assert.equal(header(mounted.container).querySelector('[data-claim-header]')?.dataset.claimHeader, "B");
    assert.equal(isMaximized(mounted.container), true, "旧面 cleanup 不得把有效 editorHeader 清为 false");
    // 最后一份 editorHeader 释放仍须退出；若中间已经变为 false，此断言也无法成立。
    await mounted.render(contents());
    assert.equal(isMaximized(mounted.container), false);
  } finally { await mounted.unmount(); }
});

for (const remaining of ["A", "B"]) {
  test(`相同素材、相同 adapter 的两个实例，释放另一个后 ${remaining} 的停靠带仍可见`, async () => {
    const mounted = await mount(contents(shell("A"), shell("B")));
    try {
      await mounted.render(contents(shell(remaining)));
      const dock = mounted.container.querySelector('[data-workspace-edit-bar-dock]');
      assert.equal(dock.hidden, false);
      assert.equal(dock.dataset.editBarDockState, "docked");
      await mounted.render(contents());
      assert.equal(dock.hidden, true);
    } finally { await mounted.unmount(); }
  });
}

test("底层标题/frameless/editorHeader 写入不覆盖外壳；最后释放回到底层", async () => {
  const mounted = await mount(contents(shell("A")));
  try {
    await act(async () => slot.setRightMaximized(true));
    await act(async () => {
      slot.setRightLabel(React.createElement('span', { 'data-base-tabs': true }, 'FixedWorkspaceTabs'));
      slot.setRightEditorHeader(false);
      slot.setRightFrameless(true);
    });
    assert.ok(header(mounted.container)?.querySelector('[data-claim-header="A"]'));
    assert.equal(isMaximized(mounted.container), true);
    await act(async () => slot.setRightFrameless(false));
    await mounted.render(contents());
    assert.ok(header(mounted.container).querySelector('[data-base-tabs]'));
    assert.equal(isMaximized(mounted.container), false);
  } finally { await mounted.unmount(); }
});

for (const kind of ["action-bar", "plugin-frame"]) {
  test(`${kind}：真实提供者下点击即更新 fullscreen-exit、提示和 aria-pressed，slot 身份稳定`, async () => {
    slotEffectRuns = 0;
    const component = kind === "action-bar"
      ? React.createElement(AdvancedWorkspaceActionBar, {
          key: kind, adapter: {id: "grid", label: "表格", actions: []},
          autoSaveState: "saved", activeLibraryPanelId: null,
          onBack() {}, onOpenLibrary() {}, onRetrySave() {}, onTriggerAction() {},
        })
      : React.createElement(PluginChromeFrame, {key: kind, pluginId: "design-canvas", title: "画布"});
    const mounted = await mount(contents(component));
    try {
      const initialSlot = slot;
      const initialRuns = slotEffectRuns;
      const button = mounted.container.querySelector('button[aria-label="右侧全屏"]');
      assert.ok(button);
      assert.equal(button.querySelector('[data-icon]').dataset.icon, "fullscreen");
      await act(async () => button.click());
      assert.equal(isMaximized(mounted.container), true);
      assert.equal(button.getAttribute('aria-label'), "退出右侧全屏");
      assert.equal(button.title, "退出右侧全屏");
      assert.equal(button.getAttribute('aria-pressed'), "true");
      assert.equal(button.querySelector('[data-icon]').dataset.icon, "fullscreen-exit");
      await act(async () => button.click());
      assert.equal(button.getAttribute('aria-label'), "右侧全屏");
      assert.equal(button.getAttribute('aria-pressed'), "false");
      assert.equal(button.querySelector('[data-icon]').dataset.icon, "fullscreen");
      assert.equal(slot, initialSlot);
      assert.equal(slotEffectRuns, initialRuns);
    } finally { await mounted.unmount(); }
  });
}

test("旧 PluginChromeFrame 卸载不清掉仍在编辑器的右侧全屏", async () => {
  const frame = React.createElement(PluginChromeFrame, {key: 'frame', pluginId: "design-canvas", title: "画布"});
  const mounted = await mount(contents(shell("A"), frame));
  try {
    await act(async () => slot.setRightMaximized(true));
    await mounted.render(contents(shell("A")));
    assert.equal(isMaximized(mounted.container), true);
  } finally { await mounted.unmount(); }
});
