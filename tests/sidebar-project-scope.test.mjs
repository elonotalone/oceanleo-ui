import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkspaceAction } from "../src/shell/workspace-actions.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
const membership = await import(await compileModule("src/shell/library-project-membership.ts", {
  "../lib/auth/client": dataModule('export async function accessToken(){return "test-token";}'),
  "../lib/auth/config": dataModule('export function gatewayBase(){return "";}'),
}));
test("project action accepts UUID and bounded display name, drops invalid values", () => {
  const valid = normalizeWorkspaceAction({ version: 1, tab: "mine", projectId: "550E8400-E29B-41D4-A716-446655440000", projectName: "  Demo  " });
  assert.equal(valid?.projectId, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(valid?.projectName, "Demo");
  const invalid = normalizeWorkspaceAction({ version: 1, tab: "mine", projectId: "not-a-uuid", projectName: " x ".repeat(80) });
  assert.equal("projectId" in invalid, false);
  assert.equal(invalid?.projectName?.length, 120);
});

test("membership mutations only add/remove references and editable project reads filter viewers", async () => {
 const calls=[];const original=globalThis.fetch;
 globalThis.fetch=async (url,init={})=>{calls.push({url:String(url),...init});return new Response(JSON.stringify({items:[{id:'p1',name:'Owner',role:'owner'},{id:'p2',name:'Editor',role:'edit'},{id:'p3',name:'Viewer',role:'view'}]}));};
 try {
  assert.deepEqual((await membership.loadEditableProjects()).map(p=>p.id),['p1','p2']);
  await membership.addProjectLibraryReference('p1','work','w1');
  await membership.removeProjectLibraryReference('p1','artifact','a1');
  assert.equal(calls[1].method,'POST');assert.deepEqual(JSON.parse(calls[1].body),{kind:'work',id:'w1'});
  assert.equal(calls[2].method,'DELETE');assert.equal(calls[2].url,'/v1/projects/p1/library-items/artifact/a1');
 } finally {globalThis.fetch=original;}
});
