import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { loadRichDocSource, richDocProjectUrl } from "../src/shell/doc-editors/rich-doc-model.ts";

const projectUrl = "https://files.example/committed-r2.oceanleo-project.json";
const item = {
  id: "reopen-root", key: "artifact:reopen-root:r2", artifactId: "reopen-root", revisionId: "r2",
  source: "artifact", kind: "document", siteId: "word", title: "Saved document", favorite: false,
  url: "https://files.example/delivery.docx",
  meta: { source_format: "docx", editor_manifest_url: projectUrl },
  artifact: { renditions: { editor_manifest: { url: projectUrl, revisionId: "r2" } } },
};

test("fresh Library projection reopens its exact editable project instead of a lossy delivery copy", async () => {
  const json = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Accepted native project text" }] }] };
  let reads = 0;
  const loaded = await loadRichDocSource(item, undefined, {
    loadProject: async (url) => { reads++; assert.equal(url, projectUrl); return json; },
  });
  assert.equal(reads, 1);
  assert.equal(loaded.source, "project");
  assert.deepEqual(loaded.json, json);
});

test("project lookup supports the canonical rendition and legacy metadata without manufacturing a source", () => {
  assert.equal(richDocProjectUrl({ ...item, meta: {} }), projectUrl);
  assert.equal(richDocProjectUrl({ ...item, artifact: undefined }), projectUrl);
  assert.equal(richDocProjectUrl({ ...item, artifact: undefined, meta: {} }), "");
  assert.equal(richDocProjectUrl({ ...item, artifact: undefined, meta: { editor_project_url: "https://files.example/legacy.json" } }), "https://files.example/legacy.json");
  assert.equal(richDocProjectUrl({ ...item, meta: { editor_project_url: "https://files.example/stale-r1.json" } }), projectUrl,
    "the current canonical revision must take precedence over leftover legacy metadata");
});
