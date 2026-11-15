// UC-1/UC-3: oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md.
// Source assertions cover removal of duplicate preview/editor surfaces and isolated publication.
import assert from "node:assert/strict";
import { readFileSync,existsSync } from "node:fs";
import test from "node:test";
const boards=readFileSync("src/shell/website-platform/WebsiteResourceBoards.tsx","utf8");
const api=readFileSync("src/lib/website-platform-api.ts","utf8");
const route=readFileSync("src/shell/works-workbench/WorkWorkbenchRoute.tsx","utf8");
test("old seven-tab wrapper is deleted and read-only service boards remain reachable",()=>{
 assert.equal(existsSync("src/shell/website-platform/WebsiteWorkbenchPanels.tsx"),false);
 for(const name of ["DatabasePanel","StoragePanel","WebsitePublishPanel"])assert.ok(boards.includes(name));
 assert.doesNotMatch(boards,/textarea|运行 SQL|恢复为新提交|api\.save\(|<iframe/);
 assert.match(boards,/发布到 \.ws\.oceanleo\.app/);assert.match(boards,/<table/);assert.match(boards,/defaultBoards/);
});
test("existing API routes retain stored names and management contracts",()=>{
 for(const path of ["create-flow/history","create-flow/save","/preview","/database/schema","/database/query","/deployments","/storage/binding","/storage/buckets","/settings/usage","/analytics/summary"])assert.ok(api.includes(path),path);
});
test("Library route uses C7 and the existing agent shell with one shared work stage",()=>{
 assert.match(route,/worksApi\.open\(artifactId, revisionId/);assert.match(route,/<AdvancedWorkbenchShell/);assert.match(route,/<WorkWorkbench/);assert.match(route,/pages: \{ activePageId: "artifact", aux: \[\] \}/);assert.doesNotMatch(route,/game-editor|website-local|<iframe/);
});
