// ============================================================================
// 取源失败那一屏，锁在这里。
// ----------------------------------------------------------------------------
// 缺口原样：三个编辑器 hook 都有 `sourceFailed` 与 `reload()`，但只有 grid 的外壳
// 把它渲染出来了。deck 与 rich-doc 的外壳没有，于是失败文案里「点『重新载入』」
// 只能被删掉 —— 删掉的是承诺，缺口还在：用户仍然只看到一句红字，没有下一步。
//
// rich-doc 还多一层：`RichDocRoute` 在源没就绪时**整个顶掉舞台**，所以哪怕
// `RichDocStage` 渲染了失败面板，生产路径上也够不着。只按「stage 或 route 里
// 出现过 editor.reload」判，正好放过这一种；这里按「顶掉舞台的那一格自己带不带
// 重试入口」判。
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

/** 失败面板整段（含它的重试按钮）在源码里的那一块。 */
function failurePanelBlock(stage) {
  // Editing guards also mention sourceFailed before the failure surface.
  // Locate the positive rendering branch rather than the first identifier.
  return stage.match(
    /(?<!!)\beditor\.sourceFailed\s*&&\s*\(\s*<EditorSourceFailurePanel\b[\s\S]*?\/>/,
  )?.[0] || "";
}

test("共用失败面板：保留加载外观并自动调用原来的取源入口，不暴露原始错误", () => {
  const panel = source("../src/shell/doc-editors/EditorSourceFailurePanel.tsx");
  assert.match(panel, /role="status"/);
  assert.match(panel, /useAutoRecovery\(true, onReload/);
  assert.doesNotMatch(panel, /<button|onClick=|\{message\}/);
  assert.match(panel, /variant === "overlay"/);
  assert.match(panel, /h-full w-full/);
});

test("三个文档编辑器的外壳：sourceFailed 一成立就渲染失败面板并接上 editor.reload", () => {
  for (const [name, stagePath] of [
    ["deck", "../src/shell/doc-editors/DeckStage.tsx"],
    ["rich-doc", "../src/shell/doc-editors/RichDocStage.tsx"],
    // grid 的自研舞台已删（core-swap:delete grid）：Univer 舞台取源失败走编辑栏的
    // 「重新载入表格」（grid-univer/document-actions.ts），不画自研失败面板。
  ]) {
    const stage = source(stagePath);
    const block = failurePanelBlock(stage);
    assert.ok(block, `${name} 的外壳没有按 sourceFailed 分出失败态`);
    assert.match(
      block,
      /editor\.error/,
      `${name} 的失败态没有把失败原因显示出来`,
    );
    assert.match(
      block,
      /editor\.reload/,
      `${name} 的失败态没有接上 editor.reload，文案里的重试入口就是一句空话`,
    );
    // 失败态一旦成屏，普通错误条不许再把同一句话截断重复一遍。
    assert.match(
      stage,
      /!editor\.sourceFailed && editor\.error/,
      `${name} 的普通错误条没有让开失败态`,
    );
  }
});

test("取源失败时顶掉舞台的路由，必须自己带上重试入口", () => {
  // 只对「hook 真的导出了 reload()」的路由成立：没有重试能力的编辑器要求它渲染
  // 一个重试按钮，等于逼人造一个假按钮。
  for (const [name, routePath, hookPath] of [
    ["rich-doc", "../src/shell/advanced-routes/RichDocRoute.tsx", "../src/shell/doc-editors/use-rich-doc-editor.ts"],
    ["deck", "../src/shell/advanced-routes/DeckRoute.tsx", "../src/shell/doc-editors/use-deck-editor.ts"],
  ]) {
    const route = source(routePath);
    const hook = source(hookPath);
    const bypassesStage = /!editor\.sourceReady \?/.test(route);
    if (!bypassesStage) continue;
    if (!/\breload\b/.test(hook)) continue;
    assert.match(
      route,
      /editor\.reload/,
      `${name} 的路由在源没就绪时换掉了舞台，那一格必须自己接上 editor.reload`,
    );
  }
});
