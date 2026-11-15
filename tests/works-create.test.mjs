// UC-5: oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md.
// Work creation is one owner-authenticated agent-task flow for every kind; no separate generation endpoint.
import assert from "node:assert/strict";
import test from "node:test";
import {compileModule,dataModule} from "./helpers/module-bench.mjs";
const {createWorkFromDescription}=await import(await compileModule("src/shell/website-platform/create-website.ts",{
 "../../lib/auth/client":dataModule('export async function accessToken(){return "fixture-owner";}'),
 "../../lib/auth/config":dataModule('export const GATEWAY_BASE="https://gateway.invalid";'),
 "../artifact-client":dataModule('export async function getArtifactItem(id,revision){return {ok:true,data:{artifactId:id,revisionId:revision}};}'),
}));
test("all kinds use the same create-flow request and durable Library identity",async()=>{
 const previous=globalThis.fetch;const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({project_id:"p",artifact_id:"a",artifact_revision_id:"r",task_id:"agent-task"}),{status:200});};
 try{for(const kind of ["website","game","app","miniprogram","other"]){const created=await createWorkFromDescription("Make my work",kind);assert.equal(created.item.artifactId,"a");}
  assert.deepEqual(calls.map(call=>JSON.parse(call.init.body).kind),["website","game","app","miniprogram","other"]);
  for(const call of calls){assert.equal(call.url,"https://gateway.invalid/v1/website-projects/create-flow");assert.equal(call.init.method,"POST");assert.equal(call.init.headers.Authorization,"Bearer fixture-owner");assert.equal(JSON.parse(call.init.body).request,"Make my work");}
 }finally{globalThis.fetch=previous;}
});
