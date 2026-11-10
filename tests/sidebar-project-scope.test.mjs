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

test("project reference mutations use the project API paths", async () => {
  const scope = await import("../src/shell/library-project-scope.ts");
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), method: init.method || "GET", body: init.body }); return new Response("{}", { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    await scope.addProjectLibraryReference("550e8400-e29b-41d4-a716-446655440000", "work", "w1");
    await scope.removeProjectLibraryReference("550e8400-e29b-41d4-a716-446655440000", "work", "w1");
  } finally { globalThis.fetch = original; }
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].url, /\/v1\/projects\/550e8400-e29b-41d4-a716-446655440000\/library-items$/);
  assert.deepEqual(JSON.parse(calls[0].body), { kind: "work", id: "w1" });
  assert.equal(calls[1].method, "DELETE");
  assert.match(calls[1].url, /\/library-items\/work\/w1$/);
});

test("markdown project files hydrate FileContent text for sidebar detail", async () => {
  const { loadProjectLibraryScope } = await import("../src/shell/library-project-scope.ts");
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/library-items")) return new Response(JSON.stringify({ items: [] }), { status: 200 });
    if (value.includes("/assets?limit=")) return new Response(JSON.stringify({ items: [{ id: "f1", kind: "file", name: "readme.md", mime_type: "text/markdown", size_bytes: 5 }] }), { status: 200 });
    if (value.endsWith("/access")) return new Response(JSON.stringify({ role: "edit" }), { status: 200 });
    if (value.endsWith("/f1/file")) return new Response(JSON.stringify({ path: "readme.md", kind: "markdown", text: "hello" }), { status: 200 });
    if (value.endsWith("/f1/download")) return new Response(JSON.stringify({ url: "https://cdn.example/readme.md" }), { status: 200 });
    throw new Error(`unexpected ${value}`);
  };
  try {
    const result = await loadProjectLibraryScope("550e8400-e29b-41d4-a716-446655440000");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].content, "hello");
    assert.equal(result.canEdit, true);
  } finally { globalThis.fetch = original; }
});
