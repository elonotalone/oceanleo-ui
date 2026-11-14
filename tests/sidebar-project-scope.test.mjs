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

test("Library membership reads are read-only and retain project captions", async () => {
 const calls=[], original=globalThis.fetch;
 globalThis.fetch=async (url,init={})=>{calls.push({url:String(url),...init});return Response.json({items:[{kind:'artifact',id:'a1',projects:[{id:'p1',name:'Project'}]}]});};
 try {
  const memberships=await membership.loadProjectMemberships();
  assert.deepEqual(memberships,[{kind:'artifact',id:'a1',projects:[{id:'p1',name:'Project'}]}]);
  assert.deepEqual(calls.map(call=>[call.url,call.method??'GET']),[['/v1/library/project-memberships','GET']]);
 } finally {globalThis.fetch=original;}
});
