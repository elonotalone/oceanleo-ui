import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("large Canva workbench components stay split below the frontend limit", () => {
  for (const path of [
    "../src/shell/AdvancedWorkbenchShell.tsx",
    "../src/shell/doc-editors/DeckStage.tsx",
    "../src/shell/doc-editors/DeckControls.tsx",
    "../src/shell/doc-editors/use-deck-selection-adapter.ts",
    "../src/shell/image-editor/use-fabric-image-selection-adapter.ts",
    "../src/shell/SelectionToolbar.tsx",
    "../src/shell/SelectionInspectorPanel.tsx",
    "../src/shell/selection-inspector-host.tsx",
    "../src/shell/selection-context.ts",
    "../src/shell/InlineAdvancedWorkbenchShell.tsx",
    "../src/shell/FloatingContextToolbar.tsx",
    "../src/shell/AdvancedStageControls.tsx",
    "../src/shell/editor-protocol.ts",
  ]) {
    const lines = source(path).split("\n").length;
    assert.ok(lines < 600, `${path} has ${lines} lines`);
  }
});

test("creation drawers stay in fixed tools while object bars stay contextual", () => {
  const deck = source("../src/shell/advanced-routes/DeckRoute.tsx");
  const image = source("../src/shell/advanced-routes/ImageRoute.tsx");
  // 抽屉的开合与投递已拆进 use-inline-advanced-panels：壳里剩生命周期与保存。
  // 这三份合起来才是「共享外壳」，缺一份就会让下面的断言无从落脚。
  const shell =
    source("../src/shell/InlineAdvancedWorkbenchShell.tsx") +
    source("../src/shell/use-inline-advanced-panels.tsx") +
    source("../src/shell/InlineAdvancedWorkbenchHeader.tsx");
  const deckToolbar = source(
    "../src/shell/doc-editors/use-deck-selection-adapter.ts",
  );
  const imageToolbar = source(
    "../src/shell/image-editor/fabric-image-toolbar-controls.ts",
  );
  const richToolbar = source(
    "../src/shell/doc-editors/use-rich-doc-selection-adapter.ts",
  );
  // 10-23 D3：演示只申报 模板 / 元素 / 画笔 / 线条 / 便签；字体、效果是统一栏控件，不再是抽屉。
  assert.deepEqual(
    [...deck.matchAll(/\n {10}\{\n {12}id: "(deck-[a-z-]+)",\n {12}label:/g)].map((m) => m[1]),
    ["deck-design", "deck-elements", "deck-draw", "deck-lines", "deck-notes"],
  );
  assert.doesNotMatch(deck, /id: "deck-(?:effects|fonts|layers|uploads|signature|tables|text)"/);
  // 10-23 W09：图片调整与字体不再是抽屉——调色是统一栏 `adjust` 面板（A-1 子控件），字体是 `font-family` 下拉。
  assert.doesNotMatch(image, /id: "image-(?:filters|fonts)"/);
  assert.doesNotMatch(deckToolbar, /panelId: "deck-fonts"/);
  assert.doesNotMatch(imageToolbar, /panelId: "image-(?:filters|fonts)"/);
  assert.match(imageToolbar, /inspector\("adjust", tt\("调色"\)\)/);
  for (const drawer of [
    "image-brush",
    "image-shapes",
    "image-lines",
    "image-notes",
    "image-text",
    "image-signature",
    "image-tables",
    "image-layers",
  ]) {
    assert.match(image, new RegExp(`id: "${drawer}"`));
    assert.doesNotMatch(imageToolbar, new RegExp(`panelId: "${drawer}"`));
  }
  assert.match(shell, /drawers\.map\(\(drawer\) =>/);
  assert.match(shell, /<PluginGlobalRow/);
  // D1（2026-10-23）：顶栏一行，第二行页签行删除（页签在 PluginGlobalRow 里）。
  assert.doesNotMatch(shell, /<PluginPageRow/);
  assert.doesNotMatch(deckToolbar, /deckQuickTools|applyDeckQuickTool/);

  assert.doesNotMatch(image, /id: "image-export"|panelId: "image-export"/);
  assert.match(image, /directDownload: exportDownloads\[0\]/);
  for (const toolbar of [deckToolbar, imageToolbar, richToolbar]) {
    assert.doesNotMatch(toolbar, /id: "undo"/);
    assert.doesNotMatch(toolbar, /id: "redo"/);
  }
});
