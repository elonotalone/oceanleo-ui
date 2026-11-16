// 2026-10-23 editor overhaul W08 (D2 / _EDITOR.md §E): the document editor registers the
// material command/history contract so 素材库「点一下 / 拖进去」inserts an image, and the
// Insert drawer copy is translated (no Chinese printed in other locales).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { EDITOR_OVERHAUL_W08_COPY } from "../src/i18n/ui/messages/editor-overhaul-copy-w08.ts";
import { registerWorkbenchMaterialAdapter, workbenchMaterialActionAvailability } from "../src/shell/workbench-material-registry.ts";
import { withEditorHistoryCommand } from "../src/shell/workbench-material-command.ts";

const route = readFileSync(new URL("../src/shell/advanced-routes/RichDocRoute.tsx", import.meta.url), "utf8");

test("RichDocRoute wraps its image adapter in the editor-history command contract", () => {
  assert.match(route, /withEditorHistoryCommand\(materialAdapter, \{\s*documentId: advancedRootItemId\(item\),\s*targetRevisionId: item\.revisionId,/);
  assert.match(route, /useWorkbenchMaterialAdapter\(materialCommandAdapter\)/);
  assert.doesNotMatch(route, /useWorkbenchMaterialAdapter\(materialAdapter\)/);
  // Insert goes through Tiptap's own chain (undoable), not a raw DOM/HTML splice.
  assert.match(route, /editor\.insertImageUrl\(/);
});

test("with a known baseline the document image adapter is offered insert; without one it stays honest", () => {
  const calls = [];
  const adapter = {
    id: "richdoc-materials@2",
    actions: ["insert"],
    accepts: () => true,
    mutate: (...args) => { calls.push(args); },
  };
  const wired = withEditorHistoryCommand(adapter, { documentId: "doc-1", targetRevisionId: "rev-7" });
  assert.equal(wired.command?.history, "editor-command");
  const unwired = withEditorHistoryCommand(adapter, { documentId: "doc-1", targetRevisionId: "" });
  assert.equal(unwired.command, undefined);
  const unregister = registerWorkbenchMaterialAdapter("w08::richdoc", unwired);
  try {
    const material = { id: "m", artifactId: "a", revisionId: "r", kind: "image", url: "https://x.test/a.png", meta: {} };
    assert.equal(workbenchMaterialActionAvailability("w08::richdoc", "insert", material).available, false);
  } finally { unregister(); }
});

test("Insert drawer copy has every non-Chinese locale", () => {
  const keys = ["插入内容", "表格", "行数", "列数", "插入表格",
    "分割线", "代码块", "引用块", "上传本地图片", "粘贴图片 URL"];
  const locales = LOCALES.filter(locale => locale !== "zh");
  assert.equal(locales.length, 16);
  assert.deepEqual(Object.keys(EDITOR_OVERHAUL_W08_COPY).sort(), [...locales].sort());
  for (const locale of locales) {
    const book = EDITOR_OVERHAUL_W08_COPY[locale];
    for (const key of keys) {
      assert.ok(book[key], `${locale} missing ${key}`);
      if (locale !== "zh-TW" && locale !== "ja") assert.doesNotMatch(book[key], /[一-鿿]/, `${locale} ${key} still Chinese`);
    }
  }
  assert.equal(EDITOR_OVERHAUL_W08_COPY.en["表格"], "Table");
  assert.equal(EDITOR_OVERHAUL_W08_COPY.en["插入表格"], "Insert table");
});

test("··· download labels are translated with placeholder keys, not concatenated Chinese", () => {
  assert.match(route, /label: tt\("直接下载 \{fmt\}", \{ fmt: DOC_FAMILY_DOWNLOAD_FORMATS\.richdoc\[0\]\.label \}\)/);
  assert.match(route, /label: tt\("下载 \{fmt\}", \{ fmt: format\.label \}\)/);
  assert.doesNotMatch(route, /label: `(直接)?下载 \$\{/);
});
