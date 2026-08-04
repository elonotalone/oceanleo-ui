import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const promptSource = await readFile(
  new URL("../src/shell/PromptHighlightArea.tsx", import.meta.url),
  "utf8",
);
const composerSource = await readFile(
  new URL("../src/shell/LeoComposer.tsx", import.meta.url),
  "utf8",
);
const canvasSource = await readFile(
  new URL("../src/shell/ResultCanvas.tsx", import.meta.url),
  "utf8",
);
const slotStateSource = await readFile(
  new URL("../src/shell/result-canvas-slot-state.ts", import.meta.url),
  "utf8",
);
/**
 * 右栏的「选中哪个槽位」这段状态住在 `ResultCanvas.tsx` 还是它拆出去的
 * `result-canvas-slot-state.ts`，对本条契约来说无所谓——要断的是**这段行为还在**，
 * 不是它在哪个文件里。两份源拼起来断言，右栏以后再拆文件也不会假报红。
 */
const rightPaneSource = `${canvasSource}\n${slotStateSource}`;
const hydrationSource = await readFile(
  new URL("../src/shell/workspace-runtime-hydration.tsx", import.meta.url),
  "utf8",
);
const catalogSource = await readFile(
  new URL("../src/shell/SiteCatalogConsole.tsx", import.meta.url),
  "utf8",
);

test("session 管理的模板输入以恢复 value 为事实源", () => {
  assert.match(
    composerSource,
    /restoreEpoch=\{runtimeHydration\?\.snapshotRestoreEpoch\}/,
  );
  assert.match(
    promptSource,
    /const restoring =[\s\S]*?restoreEpoch > 0[\s\S]*?if \(restoring\)[\s\S]*?replaceFromExternalValue\(value, true\)/,
  );
  assert.match(promptSource, /fillAppliedRef\.current = true;[\s\S]*?seed\(template\)/);
  assert.match(
    promptSource,
    /if \(fillAppliedRef\.current\)[\s\S]*?不能紧接着把新模板覆盖回去/,
  );
});

test("右栏真实标签写入共享会话状态并恢复", () => {
  assert.match(rightPaneSource, /runtimeHydration\?\.setRightTab\(id\)/);
  assert.match(rightPaneSource, /runtimeHydration\?\.restoredSnapshot/);
  assert.match(rightPaneSource, /runtimeHydration\.rightTab/);
  assert.doesNotMatch(canvasSource, /const \[onGuide, setOnGuide\]/);
  assert.match(hydrationSource, /const rightTab = explicitTab \|\| defaultTab/);
  assert.match(hydrationSource, /rightTabRef\.current = \{ identity, tabId: rightTab \}/);
  assert.match(hydrationSource, /snapshotSharedUi/);
  assert.match(rightPaneSource, /setDefaultRightTab/);
  assert.match(hydrationSource, /restoreSharedUi/);
  assert.match(
    hydrationSource,
    /snapshotRestoreEpoch: previous\.snapshotRestoreEpoch \+ 1/,
  );
  assert.match(hydrationSource, />\s*加载中…\s*</);
  assert.doesNotMatch(hydrationSource, /正在恢复上次工作/);
  assert.match(catalogSource, />\s*加载中…\s*</);
  assert.doesNotMatch(catalogSource, /正在恢复完整工作会话/);
});
