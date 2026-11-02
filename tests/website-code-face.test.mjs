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
  assert.ok(route.indexOf("websiteCodeProjectFromText(entryText)") < route.indexOf("websiteSiteEnvelopeFromText(entryText)"));
  assert.match(route, /<WebsitePreviewWorkbench key=\{codeProjectId\} projectId=\{codeProjectId\}/);
});
test("source face, source routes and editable source panel are removed", () => {
  assert.equal(existsSync("src/shell/website-platform/WebsiteCodeFace.tsx"), false);
  const panels = readFileSync("src/shell/website-platform/WebsiteWorkbenchPanels.tsx", "utf8");
  const old = readFileSync("src/shell/website-local/WebsiteSiteWorkbench.tsx", "utf8");
  for (const source of [route, panels, old]) assert.doesNotMatch(source, /WebsiteCodeFace|CodePanel|panel="code"|\["code",/);
  assert.doesNotMatch(panels, /文件内容|保存并提交/);
  assert.match(old, /<WebsitePuckStage/);
  assert.match(route, /<WebsiteSiteWorkbench/);
});
