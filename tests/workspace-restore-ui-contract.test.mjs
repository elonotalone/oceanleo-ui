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
  assert.match(canvasSource, /runtimeHydration\?\.setRightTab\(id\)/);
  assert.match(canvasSource, /runtimeHydration\?\.restoredSnapshot/);
  assert.match(canvasSource, /runtimeHydration\.rightTab/);
  assert.doesNotMatch(canvasSource, /const \[onGuide, setOnGuide\]/);
  assert.match(hydrationSource, /const rightTab = explicitTab \|\| defaultTab/);
  assert.match(hydrationSource, /rightTabRef\.current = \{ identity, tabId: rightTab \}/);
  assert.match(hydrationSource, /snapshotSharedUi/);
  assert.match(canvasSource, /setDefaultRightTab/);
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
