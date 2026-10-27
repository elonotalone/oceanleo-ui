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
test("C5-T3a: every local-task code or gateway sentence becomes words, never the raw code", () => {
  for (const code of model.localAgentRefusalCodes()) {
    const text = model.localAgentRefusalText(code);
    assert.ok(text && /[一-鿿]/.test(text), code);
    assert.equal(model.localAgentRefusalText(code.toLowerCase()), text, code);
    assert.doesNotMatch(text, /[A-Z]{2,}_[A-Z]/, code);
  }
  const refused = transport.agentApiFailureFromPayload(409, {detail: {code: "local_exec_disabled"}});
  assert.equal(refused.error, "LOCAL_EXEC_DISABLED", "agent.ts keeps the code for its other callers");
  const failure = model.localAgentFailure(refused, true);
  assert.equal(failure.kind, "refused");
  assert.equal(failure.definite, true);
  assert.match(failure.text, /设备与授权.*允许云端下发本机任务.*改成云端/);
  for (const [detail, key] of [
    ["所选电脑未登录或已离线，任务没有改到其他设备执行。", "deviceOffline"],
    ["此任务已绑定本地电脑；更换执行位置请新建任务。", "targetMismatch"],
    ["此模式不能执行本地任务，请使用任务模式。", "modeUnsupported"],
    ["task is still running", "stillRunning"],
    ["invalid_execution_target", "invalidTarget"],
    ["device_not_found", "deviceNotFound"],
  ]) assert.equal(model.localAgentRefusalText(detail), model.LOCAL_AGENT_COPY[key], detail);
  assert.equal(model.localAgentRefusalText(model.LOCAL_AGENT_COPY.localExecDisabled), null, "a sentence is not re-mapped");
  assert.equal(model.localAgentRefusalText("HTTP 500"), null);
});
test("C5-T3a: only provable refusals are definite; lost receipts and unknown codes are not", () => {
  const unconfirmed = transport.agentApiFailureFromPayload(503, {detail: {code: "local_agent_dispatch_unconfirmed", task_id: "task-9", message: "x"}});
  assert.deepEqual(model.localAgentFailure(unconfirmed, true), {kind: "unconfirmed", text: model.LOCAL_AGENT_COPY.dispatchUnconfirmed, taskId: "task-9"});
  const forged = transport.agentApiFailureFromPayload(503, {detail: {code: "local_agent_dispatch_unconfirmed", task_id: "../x"}});
  assert.equal(model.localAgentFailure(forged, true).kind, "receipt_lost");
  assert.equal(model.localAgentFailure({ok: false, status: 0, error: "网络错误：无法连接到 AI 网关。"}, true).kind, "receipt_lost");
  assert.equal(model.localAgentFailure({ok: false, status: 502, error: "HTTP 502"}, true).kind, "receipt_lost");
  assert.equal(model.localAgentFailure({ok: false, status: 0, error: "网络错误"}, false), null, "cloud tasks keep their own copy");
  const unknown = transport.agentApiFailureFromPayload(409, {detail: {code: "something_new"}});
  assert.deepEqual(model.localAgentFailure(unknown, true), {kind: "refused", text: model.LOCAL_AGENT_COPY.unknownRefusal, definite: false});
  assert.equal(model.localAgentFailure(unknown, false), null);
  assert.equal(model.localAgentFailure({ok: false, status: 401, error: "未登录"}, true), null);
  assert.equal(model.localAgentFailure(transport.agentApiFailureFromPayload(409, {detail: {code: "execution_target_mismatch"}}), true).definite, false);
  assert.equal(model.localAgentFailure(transport.agentApiFailureFromPayload(429, {detail: {code: "quota_unfinished_tasks", limit: 20}}), true).definite, true);
  // The pre-create readiness check fails closed with 503: a refusal, not a lost receipt.
  assert.deepEqual(model.localAgentFailure(transport.agentApiFailureFromPayload(503, {detail: {code: "local_agent_storage_unavailable"}}), true),
    {kind: "refused", text: model.LOCAL_AGENT_COPY.serviceUnavailable, definite: true});
});
test("C5-T3a: createTask reports the execution target it actually sent", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({detail: {code: "local_exec_disabled"}}), {status: 409});
  try {
    const mac = {kind: "device", id: "mac-1", name: "Mac"};
    const result = await transport.createTask({prompt: "整理下载文件夹", orgId: "", executionTarget: mac});
    assert.equal(result.ok, false);
    assert.equal(result.error, "LOCAL_EXEC_DISABLED");
    assert.deepEqual(result.executionTarget, mac);
    assert.equal(model.localAgentFailure(result, result.executionTarget.kind === "device").definite, true);
  } finally { globalThis.fetch = original; }
});
test("C5-T3a: every local-task sentence is translated in all 17 locales, identical in the runtime loader", async () => {
  const {LOCALES} = await import("../src/i18n/config.ts");
  const {UI_MESSAGES} = await import("../src/i18n/ui/messages/index.ts");
  const {loadUiMessages} = await import("../src/i18n/ui/messages/load.ts");
  const sentences = Object.values(model.LOCAL_AGENT_COPY);
  assert.equal(sentences.length, 20);
  for (const locale of LOCALES.filter(locale => locale !== "zh")) {
    const runtime = await loadUiMessages(locale);
    for (const zh of sentences) {
      const text = UI_MESSAGES[locale][zh];
      assert.ok(text?.trim() && text !== zh, `${locale} misses: ${zh}`);
      assert.equal(runtime[zh], text, `${locale} runtime differs: ${zh}`);
      if (!["zh-TW", "ja"].includes(locale)) assert.doesNotMatch(text, /[一-鿿]/, `${locale}: ${text}`);
    }
  }
  // The how-to names the desktop app's own switch in that language.
  assert.match(UI_MESSAGES.en[model.LOCAL_AGENT_COPY.localExecDisabled], /“Devices and permissions”.*“Let the cloud send tasks to this computer”/);
  assert.match(UI_MESSAGES.ja[model.LOCAL_AGENT_COPY.localExecOffHint], /「クラウドからこのパソコンへのタスク送信を許可」/);
  assert.match(UI_MESSAGES.de[model.LOCAL_AGENT_COPY.localExecDisabled], /„Cloud darf Aufgaben an diesen Computer senden“/);
});
test("C5-T3a: AgentChat hands every failed send back to the composer and gates the draft discard", () => {
  const source = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
  assert.match(source, /initialExecutionTarget\)\.then\(\(started\) => \{\s*if \(!started\) returnToComposer\(prompt, initialAtts\);/);
  assert.match(source, /const started = await start\(effectivePrompt, uploaded, orgId, turn, executionTarget\);\s*if \(!started\) restoreSubmission\(\);/);
  assert.match(source, /failure\?\.kind === "refused" && failure\.definite && freshDraftId && workspace\?\.discardDraft/);
  assert.match(source, /tt\(localAgentRefusalText\(error\) \?\? error\)/);
  assert.doesNotMatch(source, /setError\(r\.error \|\| tt\("发送失败"\)\)/);
  const session = readFileSync(new URL("../src/shell/WorkspaceSession.tsx", import.meta.url), "utf8");
  const discard = session.slice(session.indexOf("const discardDraft = useCallback"), session.indexOf("const archive = useCallback"));
  assert.match(discard, /enqueueMutation/);
  assert.match(discard, /active\.id !== sessionId/);
  assert.match(discard, /!\("first_output_at" in active\) \|\| active\.first_output_at !== null/);
  assert.doesNotMatch(discard, /archiveAppSession|reportFailure/);
});
