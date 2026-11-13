import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panels = readFileSync(new URL("../src/shell/website-platform/WebsiteWorkbenchPanels.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/lib/website-platform-api.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/shell/advanced-routes/WebsiteLocalRoute.tsx", import.meta.url), "utf8");

test("website workbench exposes all platform panels and injectable API", () => {
  for (const id of ["preview", "history", "dashboard", "database", "storage", "settings", "publish"]) assert.match(panels, new RegExp(`['"]${id}['"]`));
  assert.match(panels, /api\?: WebsitePlatformApi/);
  assert.match(panels, /<WebsitePreviewWorkbench projectId=/);
  assert.doesNotMatch(panels, /CodePanel/);
  assert.match(panels, /运行 SQL/);
  assert.match(panels, /发布到 \.ws\.oceanleo\.app/);
  assert.match(panels, /恢复为新提交/);
  assert.match(panels, /<table/);
});

test("website platform client covers source, history, database, preview, and deployment routes", () => {
  for (const path of ["create-flow/history", "create-flow/save", "/preview", "/database/usage", "/database/schema", "/database/query", "/deployments"]) assert.match(api, new RegExp(path.replaceAll("/", "\\/")));
});

test("website platform client covers management, storage, settings, usage, and analytics routes", () => {
  for (const path of [
    "/capabilities",
    "/storage/binding",
    "/storage/buckets",
    "/storage/objects",
    "/storage/objects/sign-download",
    "/settings/secrets",
    "/settings/usage",
    "/analytics/summary",
  ]) assert.match(api, new RegExp(path.replaceAll("/", "\\/")));
  for (const id of ["website-dashboard-panel", "website-storage-panel", "website-settings-panel"]) {
    assert.match(panels, new RegExp(`data-testid=\"${id}\"`));
  }
  assert.match(panels, /website-dashboard-cost-ledger/);
  assert.match(api, /cost_ledger/);
});

// Family merge: website materials expose preview and source; management pages are not editor tabs.
test("website material route keeps one artifact page with preview and source", () => {
  assert.match(route, /pages: \{ activePageId: "artifact", aux: \[\] \}/);
  assert.match(route, /<WebsiteMaterialViewer/);
  assert.doesNotMatch(route, /websitePages|usePluginPage|WebsiteWorkbenchPanels/);
});

test("website materials keep revision identity, published HTML preview, and explicit code-project viewers", () => {
  assert.match(route, /const identity = `[^`]*item\?\.artifactId[^`]*item\?\.revisionId[^`]*`/);
  assert.match(route, /const current = result\?\.identity === identity \? result : null/);
  assert.match(route, /const code = websiteCodeProjectFromText\(current\?\.text \|\| ""\)/);
  assert.match(route, /<WebsiteMaterialViewer key=\{identity\} sourceText=\{current\.text\}/);
  assert.match(route, /source=\{code \? <WebsiteCodeSourceViewer projectId=\{code\.projectId\}/);
  assert.match(route, /preview=\{code \? <WebsiteMaterialRuntimePreview[^>]*projectId=\{code\.projectId\}[^>]*\/> : <WebsiteArtifactViewer item=\{item\} \/>/);
});
