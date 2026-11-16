import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
const calls=[];
globalThis.__taskSharingSendCalls=calls;
const {followUp}=await import(await compileModule("src/lib/agent.ts",{
  "./auth/client":dataModule("export async function accessToken(){return 'token';} export function cachedAccessToken(){return null;} export async function getUserId(){return 'viewer';}"),
  "./auth/config":dataModule("export const GATEWAY_BASE='https://gateway.test'; export function gatewayBase(){return GATEWAY_BASE;}"),
  "./shared-get":dataModule("export async function sharedGatewayFetch(url,init){globalThis.__taskSharingSendCalls.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({task_id:'task',status:'running'}));}"),
  "./cursor-model-choice":dataModule("export function followUpBackboneField(){return 'cursor:my-model';} export function createBackboneField(){return {}; }"),
  "./payer":dataModule("export function payerRequestFields(){return {org_id:'my-other-org'};}"),
  "./leo-run-options":dataModule("export function leoRunRequestFields(){return {fast_mode:true,instruction:'my-own-settings'};}"),
}));
test("collaborators send only conversation fields while retaining the owner's settings and billing",async()=>{
  await followUp("shared","hello",[],"context","other-org","private-computer","window",{preserveTaskSettings:true});
  assert.deepEqual(calls.at(-1).body,{prompt:"hello",hidden_context:"context",attachments:[],client_window:"window"});
});
test("an owned fork binds its selected execution target on the first follow-up",async()=>{
  const target={kind:"device",id:"my-device",name:"Mine"};
  await followUp("fork","hello",[],"",undefined,undefined,"window",{bindExecutionTarget:true,executionTarget:target});
  assert.deepEqual(calls.at(-1).body.execution_target,{kind:"device",id:"my-device"});
  assert.equal(calls.at(-1).body.computer_id,"");
  assert.equal(calls.at(-1).body.agent_model,"cursor:my-model");
  await followUp("shared","hello",[],"",undefined,undefined,undefined,{preserveTaskSettings:true,bindExecutionTarget:true,executionTarget:target});
  assert.equal("execution_target" in calls.at(-1).body,false);
});
