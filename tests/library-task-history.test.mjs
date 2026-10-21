import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  INLINE_EDITOR_HISTORY_KEY, advancedRootItemId,
  withInlineEditorHistoryHead, withInlineEditorHistoryEntry,
} from "../src/shell/advanced-session.ts";

// Decoder contract only; real HistoryDetail + editor replay is a separate
// acceptance case. Do not count this fixture as a full UI/runtime mount.
const { libraryTaskItemFromSession } = await import(await compileModule(
  "src/shell/library-task-history.tsx",
  { "./task-file-workspace": dataModule("export function TaskFileWorkspace(){return null;}") },
));
const item = (id) => ({
  id, key: `creation:${id}`, source: "creation", kind: "document", siteId: "word",
  title: `${id}.md`, favorite: false, url: `https://files.test/${id}.md`,
  meta: { format: "md" },
});

test("Library task replay restores the active file, not a newer departed-editor save", () => {
  const a = item("file-a");
  const b = item("file-b");
  let snapshot = withInlineEditorHistoryHead({}, a, "richdoc", "task-1");
  snapshot = withInlineEditorHistoryEntry(snapshot, b, "richdoc", "task-1");
  const state = snapshot[INLINE_EDITOR_HISTORY_KEY];
  for (const entry of Object.values(state.heads)) {
    entry.updatedAt = entry.head.item.title === "file-b.md" ? "2099-01-01" : "2000-01-01";
  }
  const restored = libraryTaskItemFromSession({
    id: "session-1", site_id: "oceanleo", app_id: "library", task_id: "task-1", snapshot,
  });
  assert.ok(restored);
  assert.equal(advancedRootItemId(restored), advancedRootItemId(a));
  assert.equal(restored.siteId, "word", "material provenance is distinct from portal task ownership");
});

test("Library replay refuses to substitute another file when its active saved head is missing", () => {
  const snapshot = withInlineEditorHistoryHead({}, item("file-a"), "richdoc", "task-1");
  snapshot[INLINE_EDITOR_HISTORY_KEY].latestRootId = "missing-file";
  assert.equal(libraryTaskItemFromSession({ snapshot }), null);
});
