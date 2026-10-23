/**
 * W6 (10-21) → 10-23 D4: a person's PDF edit (annotation, page rail, viewer
 * history) records a user mutation, which is the only signal autosave trusts.
 * Reloading a newer source (someone else saved) never records one.
 *
 * The old core exposed `applyPdfUserEditSession`; the single-instance hook
 * records inside `bump()`, so this reads the hook source and runs the real
 * user-edit-session store.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  recordUserMutation,
  resetUserEditSession,
  userEditItemKey,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

const hook = await readFile(resolve("src/shell/media-editors/use-pdf-workbench.ts"), "utf8");

function section(from, to) {
  const start = hook.indexOf(from);
  const end = hook.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `section ${from} … ${to} not found`);
  return hook.slice(start, end);
}

test("pdf local edit bumps the shared user-edit generation", () => {
  const bump = section("const bump = useCallback(", "}, []);");
  assert.match(bump, /applyPdfWorkbenchUserEditSession\(itemRef\.current, "local-annotation"\)/);
  resetUserEditSession();
  const item = { key: "artifact:pdf-w6:r1", id: "pdf-w6" };
  assert.equal(userMutationGeneration(userEditItemKey(item)), 0);
  recordUserMutation(userEditItemKey(item));
  assert.equal(userMutationGeneration(userEditItemKey(item)), 1);
});

test("viewer edits, page-rail edits and undo of page edits all go through bump", () => {
  const events = section("// ---- 查看器事件 ----", "// ---- 页面整理");
  assert.match(events, /onEdit: \(\) => \{[\s\S]*?bump\(\);/);
  const pageOps = section("const runPageOp = useCallback(", "const rotatePage");
  assert.match(pageOps, /bump\(\);/);
});

test("loading a newer source (someone else's save) does not record a person mutation", () => {
  const load = section("// ---- 源装载 ----", "// ---- 查看器事件 ----");
  assert.doesNotMatch(load, /bump\(|recordUserMutation/);
  // 重载换的是同一个查看器里的文档，并把「已保存」对齐到当前修订（不留假脏）。
  assert.match(load, /bridge\.replaceDocument\(shown\)/);
  // 打开时补中日韩加文字的外观流只为显示（不标脏、不保存）。
  assert.match(load, /const shown = await displayablePdf\(loaded\.bytes\)/);
  assert.match(load, /setSavedRevision\(revisionRef\.current\)/);
});
