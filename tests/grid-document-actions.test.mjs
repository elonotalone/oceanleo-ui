// 表格编辑栏文档段（规范 v2 §6 grid 行）：有 recalculate 能力就必须有「重新计算」。
//
// 旧核删掉（core-swap:delete grid，2026-09-07）之后，`buildGridDocumentActions` 从
// `GridRoute.tsx` 搬到 `grid-univer/document-actions.ts`，零 React，这里直接 import。
// 唯一消费方是 `GridUniverStage`：Univer 的「重新计算」= `getFormula().executeCalculation()`。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildGridDocumentActions } from "../src/shell/doc-editors/grid-univer/document-actions.ts";

const leaf = readFileSync("src/shell/doc-editors/GridUniverStage.tsx", "utf8");
const route = readFileSync("src/shell/advanced-routes/GridRoute.tsx", "utf8");

test("有 recalculate 时必含 grid-recalculate", () => {
  const recalculate = () => {};
  const actions = buildGridDocumentActions({
    recalculate,
    loading: false,
  });
  const found = actions.find((action) => action.id === "grid-recalculate");
  assert.ok(found, "有 recalculate 能力却没给出「重新计算」");
  assert.equal(found.label, "重新计算");
  assert.equal(found.group, "edit", "重新计算是编辑类动作，留在编辑栏");
  assert.equal(found.disabled, false);
  assert.equal(found.onTrigger, recalculate);
});

test("载入中 / 只读旧档时重新计算仍在，只是不可点", () => {
  const loading = buildGridDocumentActions({ recalculate() {}, loading: true });
  assert.equal(
    loading.find((action) => action.id === "grid-recalculate")?.disabled,
    true,
  );
  const readonly = buildGridDocumentActions({ recalculate() {}, readonly: true });
  assert.equal(
    readonly.find((action) => action.id === "grid-recalculate")?.disabled,
    true,
  );
});

test("没有 recalculate 能力时不含 grid-recalculate", () => {
  const actions = buildGridDocumentActions({ loading: false });
  assert.equal(
    actions.some((action) => action.id === "grid-recalculate"),
    false,
  );
});

test("sourceFailed 才给出重新载入，且只有这一个失败按钮", () => {
  const reload = () => {};
  const bare = buildGridDocumentActions({ recalculate() {} });
  assert.deepEqual(
    bare.map((action) => action.id),
    ["grid-recalculate"],
  );
  const failed = buildGridDocumentActions({
    recalculate() {},
    sourceFailed: true,
    reload,
  });
  assert.deepEqual(
    failed.map((action) => action.id),
    ["grid-recalculate", "grid-reload-source"],
  );
  assert.equal(failed[1].onTrigger, reload);
  // 旧核那第二个失败按钮（刷新 source/full 后重试）不许回来：两条失败路径同一个 retry。
  assert.equal(
    failed.some((action) => action.id === "grid-refresh-office-source"),
    false,
  );
});

test("Univer 舞台是唯一消费方：文档段排在 actions 最前，重新计算接公式引擎", () => {
  assert.match(leaf, /buildGridDocumentActions\(\s*\{/);
  assert.match(leaf, /actions:\s*\[\s*(?:\/\/[^\n]*\n\s*)*\.\.\.documentActions,/);
  assert.match(leaf, /sourceFailed:\s*Boolean\(officeSource\.error\)/);
  assert.match(leaf, /reload:\s*officeSource\.retry/);
  assert.match(leaf, /getFormula\?\.\(\)/);
  assert.match(leaf, /executeCalculation\(\)/);
  assert.doesNotMatch(route, /buildGridDocumentActions|documentActionsEpoch|usePluginPage/);
});
