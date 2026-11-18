// UC-5: oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md.
// Owner requests go only to the authenticated gateway; preview sources never receive bearer headers.
import assert from "node:assert/strict";
import test from "node:test";
import {compileModule,dataModule} from "./helpers/module-bench.mjs";
const {worksApi}=await import(await compileModule("src/lib/works-api.ts",{
 "./auth/client":dataModule('export async function accessToken(){return "fixture-owner";}'),
 "./auth/config":dataModule('export function gatewayBase(){return "https://gateway.invalid";}'),
}));
const work={id:"cloud:p",kind:"miniprogram",title:"A work",access:"owner",home:{type:"cloud",project_id:"p"},preview:{available:true}};
const kind={kind:"miniprogram",label:"Mini program",label_zh:"小程序",preview:{frame:"phone",orientation:"portrait"},default_preset:"small_app",default_boards:["users"]};
// UC-NONE: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Encoded paths, methods, cached kind catalog and fake bearer headers are client transport behavior, not authorization proofs.
test("C1/C2/C7 preserve methods, encoded work ids, access and cached catalog",async()=>{
 const previous=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});const body=String(url).endsWith("/kinds")?{kinds:[kind]}:String(url).includes("preview-source")?{preview_source:{type:"none"},resolved:{type:"none",state:"not_wired",detail:""}}:{work};return new Response(JSON.stringify(body),{status:200});};
 try{
  assert.equal((await worksApi.get("cloud:p/1")).kind,"miniprogram");assert.equal((await worksApi.open("artifact","revision")).access,"owner");
  const [a,b]=await Promise.all([worksApi.kinds(),worksApi.kinds()]);assert.deepEqual(a,[kind]);assert.equal(a,b);assert.equal(calls.filter(call=>call.url.endsWith("/kinds")).length,1);
  await worksApi.previewSource("cloud:p/1");await worksApi.setPreviewSource("cloud:p/1",{type:"screen",device_id:"d1",display_id:2});
  assert.match(calls[0].url,/cloud%3Ap%2F1$/);assert.deepEqual(JSON.parse(calls[1].init.body),{artifact_id:"artifact",revision_id:"revision"});
  const put=calls.at(-1);assert.equal(put.init.method,"PUT");assert.match(put.url,/cloud%3Ap%2F1\/preview-source$/);assert.deepEqual(JSON.parse(put.init.body),{preview_source:{type:"screen",device_id:"d1",display_id:2}});
  for(const call of calls){assert.ok(call.url.startsWith("https://gateway.invalid/"));assert.equal(call.init.headers.Authorization,"Bearer fixture-owner");assert.equal(call.init.cache,"no-store");}
 }finally{globalThis.fetch=previous;}
});
