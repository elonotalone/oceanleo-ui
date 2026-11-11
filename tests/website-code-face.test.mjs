import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { WEBSITE_PROJECT_SCHEMA, websiteCodeProjectFromText } from "../src/shell/website-platform/website-code-project.ts";

const route = readFileSync("src/shell/advanced-routes/WebsiteLocalRoute.tsx", "utf8");
test("git website manifests select runtime preview before visual document validation", () => {
  const entry = { projectSchema: WEBSITE_PROJECT_SCHEMA, projectId: "f75afb8a-954f-40bb-8bf8-d87689aefd50", files: [{path:"app.py"}], pages: [{ sourcePath: "app.py" }] };
  assert.deepEqual(websiteCodeProjectFromText(JSON.stringify(entry)), {projectId:entry.projectId, fileCount:1, entryPath:"app.py"});
  assert.equal(websiteCodeProjectFromText(JSON.stringify({...entry, projectId:"../x"})), null);
  assert.equal(websiteCodeProjectFromText(JSON.stringify({format:"website-source", pages:[]})), null);
  assert.ok(route.indexOf("websiteCodeProjectFromText(text)") < route.indexOf("websiteSiteEnvelopeFromText(text)"));
  assert.match(route, /<WebsiteMaterialRuntimePreview key=\{loaded.code.projectId\} projectId=\{loaded.code.projectId\}/);
});
test("website material source is read-only and visual editing is removed", () => {
  const viewer = readFileSync("src/shell/website-local/WebsiteMaterialViewer.tsx", "utf8");
  assert.equal(existsSync("src/shell/website-local/WebsiteSiteWorkbench.tsx"), false);
  assert.match(viewer, /<pre[\s\S]*?<code>\{sourceText\}<\/code>/);
  assert.doesNotMatch(viewer + route, /contentEditable|<textarea|WebsitePuckStage|WebsiteWorkbenchPanels/);
});
