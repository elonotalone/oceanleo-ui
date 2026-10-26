import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {compileModule, dataModule} from "./helpers/module-bench.mjs";
const model = await import(await compileModule("src/lib/local-agent-task.ts"));
const transport = await import(await compileModule("src/lib/agent.ts", {
  "./auth/client": dataModule('export async function getUserId(){return "owner"} export async function accessToken(){return "test"} export function cachedAccessToken(){return "test"}'),
  "./auth/config": dataModule('export const GATEWAY_BASE="https://api.dev.oceanleo.com";'),
  "./history-events": dataModule('export function notifyHistoryChanged(){}'),
}));
const wire = (fields={}) => ({run_id:"run-1",device_id:"dev-1",state:"running",desired_state:"run",control_revision:3,report_seq:4,...fields});
test("local state is authoritative and malformed local metadata never becomes cloud", () => {
  assert.equal(model.taskLocalAgentState({engine:"local",plan:{local_run:{}}}).local,true);
  assert.equal(model.taskLocalAgentState({plan:{local_run:wire()}}).run.revision,3);
  for (const value of [null,[],wire({state:"mystery"}),wire({control_revision:-1}),wire({report_seq:NaN}),wire({device_id:"../bad"})]) {
    assert.equal(model.parseLocalAgentRun(value),null);
  }
});
test("pending stop/pause are not success, terminal states disable all actions", () => {
  const stop=model.parseLocalAgentRun(wire({desired_state:"stop"}));
  assert.match(model.localAgentStateText(stop),/等待执行端确认/);
  for (const action of ["pause","resume","stop"]) assert.equal(model.localAgentCanControl(stop,action),false);
  assert.match(model.localAgentStateText(model.parseLocalAgentRun(wire({desired_state:"pause"}))),/等待电脑确认/);
  for (const state of ["succeeded","failed","denied","cancelled","interrupted","expired"]) {
    const run=model.parseLocalAgentRun(wire({state}));
    for (const action of ["pause","resume","stop"]) assert.equal(model.localAgentCanControl(run,action),false);
  }
});
test("human takeover can explicitly resume even when server run intent remains run", () => {
  const run=model.parseLocalAgentRun(wire({state:"paused"}));
  assert.equal(model.localAgentCanControl(run,"resume"),true);
  assert.equal(model.localAgentCanControl(run,"pause"),false);
  assert.match(model.localAgentStateText(run),/明确继续/);
});
test("stale polls cannot undo acknowledged intents or newer executor reports", () => {
  const current=model.parseLocalAgentRun(wire({control_revision:5,desired_state:"stop"}));
  assert.equal(model.newerLocalAgentRun(current,model.parseLocalAgentRun(wire())),current);
  const complete={...current,reportSeq:6,state:"cancelled"};
  assert.equal(model.newerLocalAgentRun(complete,current),complete);
  assert.equal(model.newerLocalAgentRun(current,complete),complete);
});
test("actual control transport fences revision and never retries failed or ambiguous POST", async () => {
  const original=globalThis.fetch;
  const requests=[];
  globalThis.fetch=async (url,init) => {requests.push({url,init});return new Response(JSON.stringify({detail:{code:"control_revision_conflict"}}),{status:409});};
  try {
    const result=await transport.controlLocalAgentTask("task-1","resume",5);
    assert.equal(result.ok,false); assert.equal(requests.length,1);
    assert.match(requests[0].url,/\/v1\/devices\/agent\/tasks\/task-1\/control$/);
    assert.deepEqual(JSON.parse(requests[0].init.body),{action:"resume",expected_revision:5});
    globalThis.fetch=async () => {requests.push({});throw new Error("network");};
    await transport.controlLocalAgentTask("task-1","stop",5);
    assert.equal(requests.length,2);
  } finally {globalThis.fetch=original;}
});
test("real AgentChat integrates local status and routes stop before cloud optimistic stop", () => {
  const source=readFileSync(new URL("../src/shell/AgentChat.tsx",import.meta.url),"utf8");
  assert.match(source,/taskLocalAgentState\(r.data.task\)/);
  assert.match(source,/isLocalExecution && <LocalAgentTaskStatus/);
  const stop=source.slice(source.indexOf("const stop = useCallback"));
  assert.ok(stop.indexOf('await controlLocal("stop")')<stop.indexOf('setStatus("stopped")'));
  assert.match(source,/newerLocalAgentRun\(current.run, local.run\)/);
});
test("task files retain immutable canonical identity and reject model URLs or malformed receipts", () => {
  const receipt={source:"local_private_artifact",artifactId:"10000000-0000-0000-0000-000000000001",revisionId:"20000000-0000-0000-0000-000000000002",title:"report.txt",url:"https://untrusted.invalid"};
  assert.deepEqual(model.localTaskArtifacts({local_artifacts:[receipt,receipt,{...receipt,source:"model"},{...receipt,revisionId:""}]}),[
    {artifactId:receipt.artifactId,revisionId:receipt.revisionId,title:"report.txt"},
  ]);
  const source=readFileSync(new URL("../src/shell/LocalAgentTaskStatus.tsx",import.meta.url),"utf8");
  assert.match(source,/getArtifactItem\(artifact.artifactId, artifact.revisionId, request.signal\)/);
  assert.match(source,/result.data.revisionId !== artifact.revisionId/);
  assert.match(source,/abort.current\?\.abort\(\)/);
});
