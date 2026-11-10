import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkspaceAction } from "../src/shell/workspace-actions.ts";
import { isLinkWorkItem } from "../src/shell/works/link-work-item.ts";
import { mapProjectScopePayload } from "../src/shell/library-project-scope.ts";

test("project action accepts UUID and bounded display name, drops invalid values", () => {
  const valid = normalizeWorkspaceAction({ version: 1, tab: "mine", projectId: "550E8400-E29B-41D4-A716-446655440000", projectName: "  Demo  " });
  assert.equal(valid?.projectId, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(valid?.projectName, "Demo");
  const invalid = normalizeWorkspaceAction({ version: 1, tab: "mine", projectId: "not-a-uuid", projectName: " x ".repeat(80) });
  assert.equal("projectId" in invalid, false);
  assert.equal(invalid?.projectName?.length, 120);
});

test("scope mapping combines references and project files, preserving link viewer identity", () => {
  const items = mapProjectScopePayload([
    { kind: "work", id: "w1", item: { id: "w1", title: "Live", link_work: { id: "w1", title: "Live", kind: "website", links: [{ label: "Live", url: "https://example.com/live" }] } } },
    { kind: "artifact", id: "a1", item: { id: "a1", title: "Report", kind: "document" } },
  ], [{ id: "f1", kind: "file", name: "notes.md", mime_type: "text/markdown", size_bytes: 4, path: "docs/notes.md" }], "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(items.length, 3);
  assert.equal(isLinkWorkItem(items[0]), true);
  assert.equal(items[2].meta.library_source_label, "项目文件");
  assert.equal(items[2].meta.folder_path, "docs/notes.md");
});
