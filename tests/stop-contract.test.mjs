import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import ts from "typescript";
import {
  applyDialog, initialDialogState, idleStop, newStopId, STOP_REPLY_TIMEOUT_MS, stopMachine, stopErrorText,
} from "../src/shell/cloud-computer/agent-dialog/reduce.ts";
import { liveTurnOpen } from "../src/shell/cloud-computer/agent-dialog/occupancy.ts";
import {
  attachmentFailureText, isTransientUploadError, stopClickAllowed, stopPressArmed, uploadRetryDelay,
} from "../src/shell/composer-send-guard.ts";

const tt = (text, vars) => text.replace(/\{(\w+)\}/g, (_, key) => String(vars?.[key] ?? key));
function working() {
  let state = { ...initialDialogState(), program: "codex", activeSession: "s" };
  for (const frame of [
    { t: "turn_start", acp_session: "s" },
    { t: "tool", acp_session: "s", id: "tool", status: "in_progress" },
    { t: "occupancy", busy: ["s", "sibling"] },
  ]) state = applyDialog(state, { type: "frame", frame: { ...frame, program: "codex" } });
  return state;
}

for (const result of ["stopped", "not_running"]) test(`cancel_result ${result} ends the turn and permits send without touching siblings`, () => {
  const before = working();
  const stopping = applyDialog(before, { type: "cancel-local" });
  assert.equal(stopping.messages.at(-1).stop, "stopping");
  const stopped = applyDialog(stopping, { type: "cancel-result", result, acpSession: "s" });
  assert.equal(stopped.busy, false);
  assert.equal(stopped.messages.at(-1).stop, "cancelled");
  assert.equal(liveTurnOpen(stopped.messages, "s"), false);
  assert.deepEqual(stopped.occupancyBusy, ["sibling"]);
  assert.equal(stopped.occupancyPendingAt, null);
  const duplicate = applyDialog(stopped, { type: "frame", frame: { t: "done", stop: "cancelled", acp_session: "s" } });
  assert.deepEqual(duplicate.messages, stopped.messages);
  assert.equal(duplicate.busy, false);
  const sending = applyDialog(duplicate, { type: "send-began" });
  assert.equal(sending.busy, false, "accepting the next send is not proof of active execution");
  assert.ok(sending.occupancyPendingAt != null);
});

for (const result of ["offline", "failed"]) test(`cancel_result ${result} restores running with a readable error`, () => {
  const stopping = applyDialog(working(), { type: "cancel-local" });
  const restored = applyDialog(stopping, { type: "cancel-result", result, acpSession: "s" });
  assert.equal(restored.busy, true);
  assert.equal(liveTurnOpen(restored.messages, "s"), true);
  const begun = stopMachine(idleStop(), { type: "begin", stopId: "one", session: "s" });
  const failed = stopMachine(begun, { type: "result", stopId: "one", result, detail: "close_unsupported" });
  assert.equal(failed.phase, "error");
  assert.match(stopErrorText(tt, failed), result === "offline" ? /电脑不在线/ : /close_unsupported/);
  assert.equal(stopMachine(failed, { type: "begin", stopId: "two" }).phase, "stopping");
});

test("15 second timeout restores the original turn, ignores old replies, and permits retry", () => {
  assert.equal(STOP_REPLY_TIMEOUT_MS, 15_000);
  const begin = stopMachine(idleStop(), { type: "begin", stopId: "one" });
  assert.equal(stopMachine(begin, { type: "result", stopId: "foreign", result: "stopped" }), begin);
  const timedOut = stopMachine(begin, { type: "timeout", stopId: "one" });
  assert.match(stopErrorText(tt, timedOut), /没有回应停止指令/);
  const restored = applyDialog(applyDialog(working(), { type: "cancel-local" }), { type: "cancel-failed", acpSession: "s" });
  assert.equal(liveTurnOpen(restored.messages, "s"), true);
  assert.equal(stopMachine(timedOut, { type: "result", stopId: "one", result: "stopped" }), timedOut);
  const retry = stopMachine(timedOut, { type: "begin", stopId: "two" });
  assert.equal(stopMachine(retry, { type: "timeout", stopId: "one" }), retry);
});

test("cancel results are scoped to their session", () => {
  const state = working();
  const next = applyDialog(state, { type: "cancel-result", result: "stopped", acpSession: "sibling" });
  assert.equal(next.busy, true);
  assert.equal(next.messages.at(-1).stop, "");
  assert.deepEqual(next.occupancyBusy, ["s"]);
});

test("Stop ids obey the gateway wire contract", () => {
  const ids = new Set(Array.from({ length: 100 }, newStopId));
  assert.equal(ids.size, 100);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{1,64}$/);
});

test("double click / press begun on Send cannot stop; fresh later Stop press and keyboard can", () => {
  const shownAt = 1000;
  assert.equal(stopPressArmed(shownAt, 1799), false);
  assert.equal(stopPressArmed(shownAt, 1800), true);
  for (const now of [1001, 2000]) assert.equal(stopClickAllowed({ shownAt, now, keyboard: false, pressArmed: false }), false);
  assert.equal(stopClickAllowed({ shownAt, now: 1800, keyboard: false, pressArmed: true }), true);
  assert.equal(stopClickAllowed({ shownAt, now: 1100, keyboard: true, pressArmed: false }), false);
  assert.equal(stopClickAllowed({ shownAt, now: 1800, keyboard: true, pressArmed: false }), true);
});

test("failed file blocks the text with its actual reason; transient uploads use backoff", () => {
  assert.equal(attachmentFailureText(tt, []), null);
  assert.match(attachmentFailureText(tt, [{ id: "x", name: "x.png", failed: true, failedReason: "电脑正忙" }]), /图片.*电脑正忙/);
  assert.match(attachmentFailureText(tt, [{ id: "x", name: "x.pdf", failed: true }]), /文件.*上传出错/);
  for (const code of ["node_busy", "computer_reconnecting", "client_network_error"]) assert.equal(isTransientUploadError({ code }), true);
  assert.equal(isTransientUploadError({ code: "permission_denied", status: 403 }), false);
  assert.deepEqual([1, 2, 3].map(uploadRetryDelay), [600, 1200, 2400]);
});

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.test" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent"])
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "window" ? dom.window : dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const noopComponent = (name) => dataModule(`export function ${name}(){return null;}`);
const { LeoComposer } = await import(await compileModule("src/shell/LeoComposer.tsx", {
  "../lib/attachment-url": dataModule("export const PRIVATE_ATTACHMENT_MAX_BYTES=20*1024*1024;"),
  "../i18n/ui/useUI": dataModule(`export function useUI(){return ${tt.toString()};}`),
  "./PromptHighlightArea": dataModule(`import React from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)};
    export const TemplateFillArea = React.forwardRef((p, ref) => {
      const node = React.useRef(null);
      React.useImperativeHandle(ref, () => ({el: () => node.current}));
      return React.createElement("textarea", { ref: node, value: p.value, disabled: p.disabled,
        onChange: e => p.onChange(e.target.value), onKeyDown: p.onKeyDown });
    });`),
  "./guide-context": dataModule("export function useFillNonce(){return 0;} export function useFillTemplate(){return null;}"),
  "./mobile-native-actions": dataModule(`export function useNativeAttachActions(){return [];}
    export function useNativeHandoffEntry(){return {action:null,panel:null};}
    export function useNativeTaskNotifications(){} export function requestTaskNotificationsOnce(){}`),
  "../lib/upload/use-attachment-intake": dataModule("export function useAttachmentIntake(_onFiles,options){globalThis.__composerIntakeOptions=options;return globalThis.__composerIntake || {compressing:false,pending:[],inFlight:[],emit(){},handlePaste(){}};}"),
  "./workspace-runtime-hydration": dataModule("export function useWorkspaceRuntimeHydration(){return null;}"),
  "./composer-draft": dataModule("export function useComposerDraft(){return {markSubmitted(){}};}"),
  "./composer-max-height": dataModule("export function useComposerMaxHeight(){return 300;}"),
  "./composer-skill-slash": dataModule("export function composerSlashAdapter(){return {};} export function useComposerSkillSlash(){return {onKeyDown(){return false;},popover:null};}"),
  ...Object.fromEntries([
    ["./LeoEntryButton", "LeoEntryButton"], ["./AttachmentStrip", "AttachmentStrip"],
    ["./ModelPicker", "ModelGroupPicker"], ["./PluginsPopover", "PluginsPopover"],
    ["./PayerSelector", "PayerSelector"], ["./mcp-apps", "ComposerAppsBar"],
    ["./cloud-computer/ComputerDock", "ComputerDock"], ["./ComposerLibraryPicker", "ComposerLibraryPicker"],
  ].map(([path, name]) => [path, noopComponent(name)])),
  "./AttachmentStrip": dataModule(`import React from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)};
    export function AttachmentStrip(props){const file=props.attachments?.find(item=>item.originalFile);
      return file && props.onUseOriginal ? React.createElement("button", {"data-test-original":"",onClick:()=>props.onUseOriginal(file)}, "original") : null;}`),
}));

async function composer(extra) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const props = { value: "keep my text", onChange() {}, onSubmit() {}, showComputerDock: false,
    showPayerSelector: false, showAppsBar: false, showPlugins: false, ...extra };
  const render = async () => act(async () => root.render(React.createElement(LeoComposer, props)));
  await render();
  return { host, props, async update(patch) { Object.assign(props, patch); await render(); },
    cleanup() { act(() => root.unmount()); host.remove(); } };
}

test("composer stopping shows a disabled busy spinner and localized reason; error restores Stop", async () => {
  const view = await composer({ stopping: true, onStop() {}, stopError: "电脑不在线，停止指令没有送到" });
  try {
    const button = view.host.querySelector("[data-composer-stop]");
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute("aria-busy"), "true");
    assert.equal(button.getAttribute("aria-label"), "正在停止");
    assert.ok(button.querySelector(".v-spinner"));
    assert.match(view.host.querySelector('[role="alert"]').textContent, /电脑不在线/);
    assert.equal(view.host.querySelector("[data-composer-send]"), null);
    await view.update({ stopping: false, loading: true, value: "" });
    assert.equal(view.host.querySelector("[data-composer-stop]").disabled, false);
    assert.equal(view.host.querySelector("[data-composer-stop]").getAttribute("aria-label"), "停止");
  } finally { view.cleanup(); }
});

test("composer waits for uploading / failed pictures, preserves text and offers retry / remove", async () => {
  let submits = 0;
  const retried = [], removed = [];
  const view = await composer({ attachments: [{ id: "image", name: "image.png", uploading: true }],
    onSubmit() { submits++; }, onRetryAttachment: (id) => retried.push(id), onRemoveAttachment: (id) => removed.push(id) });
  try {
    const send = () => view.host.querySelector('button[aria-label="发送"]');
    assert.equal(send().disabled, true);
    await view.update({ attachments: [{ id: "image", name: "image.png", failed: true, failedReason: "电脑正忙" }] });
    assert.equal(send().disabled, true);
    assert.match(view.host.textContent, /图片没有上传成功（电脑正忙）/);
    assert.equal(view.host.querySelector("textarea").value, "keep my text");
    const controls = [...view.host.querySelectorAll("[data-composer-upload-failed] button")];
    await act(async () => { controls[0].click(); controls[1].click(); send().click(); });
    assert.deepEqual(retried, ["image"]);
    assert.deepEqual(removed, ["image"]);
    assert.equal(submits, 0);
    await view.update({ attachments: [{ id: "image", name: "image.png" }] });
    await act(async () => send().click());
    assert.equal(submits, 1);
  } finally { view.cleanup(); }
});

test("composer rejects Send's second click and pointer held through transition; fresh press and Escape work", async (t) => {
  let stops = 0;
  const view = await composer({ onStop() { stops++; } });
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  try {
    await view.update({ loading: true, value: "" });
    const button = view.host.querySelector("[data-composer-stop]");
    const pointer = () => button.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
    const click = () => button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, detail: 1 }));
    await act(async () => { pointer(); click(); });
    assert.equal(stops, 0);
    t.mock.timers.tick(900);
    await act(async () => click());
    assert.equal(stops, 0, "old press is still refused after the guard window");
    await act(async () => { pointer(); click(); });
    assert.equal(stops, 1);
    await act(async () => view.host.querySelector("textarea").dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(stops, 2);
  } finally { t.mock.timers.reset(); view.cleanup(); }
});

test("clearing follow-up text or the last file re-arms Stop while the same run continues", async (t) => {
  let stops = 0;
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const view = await composer({ value: "", loading: true, onStop() { stops++; } });
  const press = (button) => button.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
  const click = (button, detail = 1) => button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, detail }));
  try {
    t.mock.timers.tick(800);
    await act(async () => press(view.host.querySelector('[data-composer-stop]')));
    await view.update({ value: "follow-up" });
    assert.equal(view.host.querySelector('[data-composer-stop]'), null);
    await view.update({ value: "" });
    let stop = view.host.querySelector('[data-composer-stop]');
    await act(async () => { click(stop); click(stop, 0); });
    assert.equal(stops, 0, "a press from before Send replaced Stop is discarded");
    t.mock.timers.tick(799);
    await act(async () => { press(stop); click(stop); });
    assert.equal(stops, 0);
    t.mock.timers.tick(1);
    await act(async () => { press(stop); click(stop); });
    assert.equal(stops, 1);
    await view.update({ attachments: [{ id: "photo", name: "photo.png" }] });
    assert.ok(view.host.querySelector('[data-composer-send]'));
    await view.update({ attachments: [] });
    stop = view.host.querySelector('[data-composer-stop]');
    await act(async () => { press(stop); click(stop); });
    assert.equal(stops, 1, "removing the last file starts a fresh guard window");
    t.mock.timers.tick(800);
    await act(async () => click(stop, 0));
    assert.equal(stops, 2);
  } finally { view.cleanup(); t.mock.timers.reset(); }
});

test("all Stop and upload copy is translated in all 17 locales", async () => {
  const { AGENT_PROGRESS_MESSAGES } = await import("../src/i18n/ui/messages/agent-progress-copy.ts");
  assert.equal(Object.keys(AGENT_PROGRESS_MESSAGES).length, 17);
  const keys = ["正在停止", "电脑不在线，停止指令没有送到", "没能停下这次任务（{detail}），可以再点一次停止",
    "电脑没有回应停止指令，可以再点一次", "图片没有上传成功（{reason}）"];
  for (const [locale, dictionary] of Object.entries(AGENT_PROGRESS_MESSAGES)) for (const key of keys) {
    assert.ok(dictionary[key], `${locale}: ${key}`);
    assert.deepEqual(dictionary[key].match(/\{\w+\}/g), key.match(/\{\w+\}/g), `${locale}: placeholders`);
  }
});

// Execute Host A's actual Stop callback and device-terminal effect in isolation;
// the rest of AgentChat's editor graph is unrelated to this transport contract.
const hostSource = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
const hostAst = ts.createSourceFile("AgentChat.tsx", hostSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hostBody = hostAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "AgentChatInner").body;
const stopCallback = hostBody.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((decl) => decl.name.getText(hostAst) === "stop")).getText(hostAst);
const terminalEffect = hostBody.statements.find((node) => ts.isExpressionStatement(node) && node.getText(hostAst).includes("if (!isLocalExecution || !localRun || localAgentRunLive(localRun)) return;")).getText(hostAst);
const hostHarnessSource = ts.transpileModule(`
  import {idleStop,stopMachine,newStopId,STOP_REPLY_TIMEOUT_MS} from ${JSON.stringify(new URL("../src/shell/cloud-computer/agent-dialog/reduce.ts", import.meta.url).href)};
  import {localAgentCanControl,localAgentRunLive} from ${JSON.stringify(new URL("../src/lib/local-agent-task.ts", import.meta.url).href)};
  export function hostStop(options={}) {
    const taskStopRef={current:idleStop()}, taskStopTimerRef={current:null}, taskStopRequestRef={current:""};
    const loadedTaskRef={current:"task"}, stoppedTaskRef={current:""}, streamAbortRef={current:{abort(){}}};
    const taskId="task", readOnly=false, isLocalExecution=!!options.local, computerTask=false;
    let localRun=options.run, status="running", busy=true, terminal;
    const refresh=async()=>{}, tt=x=>x, useCallback=fn=>fn, useEffect=fn=>{terminal=fn;};
    const setStoppedTaskId=()=>{}, setStatus=value=>{status=value;}, setBusy=value=>{busy=value;};
    const controlLocal=options.control||(()=>Promise.resolve(true)), stopTask=options.stopTask||(()=>Promise.resolve({ok:true}));
    const updateTaskStop=event=>{
      const next=stopMachine(taskStopRef.current,event); taskStopRef.current=next;
      if(next.phase!=="stopping" && taskStopTimerRef.current){clearTimeout(taskStopTimerRef.current);taskStopTimerRef.current=null;}
      return next;
    };
    ${stopCallback}
    ${terminalEffect}
    return {stop,get state(){return taskStopRef.current;},get status(){return status;},get busy(){return busy;},
      report(run){localRun=run;terminal();},newTurn(){taskStopRequestRef.current="";updateTaskStop({type:"reset"});},
      timeout(){updateTaskStop({type:"timeout",stopId:taskStopRef.current.stopId});},
      cleanup(){if(taskStopTimerRef.current)clearTimeout(taskStopTimerRef.current);}};
  }
`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { hostStop } = await import(dataModule(hostHarnessSource));
const localRun = { runId: "run", deviceId: "device", state: "running", desiredState: "run", revision: 1, reportSeq: 1 };

test("device Stop receipt remains stopping until the computer reports a terminal run", async () => {
  let calls = 0;
  const host = hostStop({ local: true, run: localRun, control: async () => { calls++; return true; } });
  try {
    await host.stop(); await host.stop();
    assert.equal(calls, 1);
    assert.equal(host.state.phase, "stopping");
    host.report({ ...localRun, desiredState: "stop" });
    assert.equal(host.state.phase, "stopping", "recorded intent still isn't a stopped computer");
    host.report({ ...localRun, state: "cancelled", desiredState: "stop" });
    assert.equal(host.state.phase, "stopped");
  } finally { host.cleanup(); }
});

test("device Stop refusal or missing confirmation says why and is retryable", async () => {
  const refused = hostStop({ local: true, run: localRun, control: async () => false });
  const noAck = hostStop({ local: true, run: { ...localRun, desiredState: "stop" } });
  try {
    await refused.stop();
    assert.equal(refused.state.phase, "error");
    assert.match(stopErrorText(tt, refused.state), /电脑没有确认/);
    await noAck.stop(); noAck.timeout();
    assert.equal(noAck.state.error, "timeout");
    await noAck.stop();
    assert.equal(noAck.state.phase, "stopping");
  } finally { refused.cleanup(); noAck.cleanup(); }
});

test("cloud Stop confirms its HTTP result and never applies an old success to a newer turn", async () => {
  const stopped = hostStop();
  let resolve;
  const late = hostStop({ stopTask: () => new Promise((done) => { resolve = done; }) });
  try {
    await stopped.stop();
    assert.equal(stopped.state.phase, "stopped");
    assert.equal(stopped.status, "stopped");
    assert.equal(stopped.busy, false);
    const request = late.stop();
    late.timeout(); late.newTurn(); resolve({ ok: true }); await request;
    assert.equal(late.status, "running");
    assert.equal(late.state.phase, "idle");
  } finally { stopped.cleanup(); late.cleanup(); }
});

test('composer has one action: content sends while working; stopping blocks sends', async () => {
  let submits=0, stops=0;
  const view=await composer({loading:true,allowSendWhileRunning:true,onStop(){stops++;},onSubmit(){submits++;}});
  try {
    const send=()=>view.host.querySelector('[aria-label="发送"]');
    assert.equal(send().disabled,false);
    assert.equal(view.host.querySelector('[data-composer-stop]'),null);
    assert.equal(view.host.querySelectorAll('[data-composer-send],[data-composer-stop]').length,1);
    await act(async()=>send().click());
    await act(async()=>view.host.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
    assert.equal(submits,2);
    assert.equal(stops,0,'Send can never become an accidental Stop');
    await view.update({stopping:true});
    assert.equal(send(),null);
    assert.equal(view.host.querySelector('[data-composer-stop]').disabled,true);
    await act(async()=>view.host.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
    assert.equal(submits,2);
    await view.update({stopping:false,allowSendWhileRunning:false});
    assert.equal(send().disabled,true,'a host that opts out cannot submit a follow-up');
    assert.equal(view.host.querySelector('[data-composer-stop]'),null);
  } finally {view.cleanup();}
});

for (const conversation of [
  { kind: "oceanleo", target: { kind: "cloud" } },
  { kind: "native", computerId: "cc_test", program: "codex", view: "chat" },
]) test(`composer ${conversation.kind}: files-only sends with Enter by default during a run`, async () => {
  const sent = [];
  let stops = 0;
  const view = await composer({ value: "", loading: true, conversation,
    attachments: [{ id: "image", name: "photo.png", artifactId: "a", revisionId: "r" }],
    onSubmit: (text) => sent.push(text), onStop() { stops++; } });
  const key = (key, extra = {}) => view.host.querySelector("textarea").dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
  try {
    assert.equal(view.host.querySelectorAll('[data-composer-send],[data-composer-stop]').length, 1);
    assert.equal(view.host.querySelector('[data-composer-send]').disabled, false);
    await act(async () => { key("Enter", { shiftKey: true }); key("Enter", { isComposing: true }); key("Escape", { isComposing: true }); });
    assert.deepEqual(sent, []);
    assert.equal(stops, 0);
    await act(async () => key("Enter"));
    assert.deepEqual(sent, [""]);
    await act(async () => key("Escape"));
    assert.equal(stops, 1, "Escape remains available while content shows Send");
    await view.update({ attachments: [], value: "   " });
    assert.ok(view.host.querySelector('[data-composer-stop]'));
    assert.equal(view.host.querySelector('[data-composer-send]'), null);
    await act(async () => key("Enter"));
    assert.deepEqual(sent, [""], "Enter never activates an empty running Stop key");
    await view.update({ loading: false });
    assert.equal(view.host.querySelector('[data-composer-send]').disabled, true);
  } finally { view.cleanup(); }
});

test("a preparing, uploading or failed file keeps the single action on disabled Send", async () => {
  globalThis.__composerIntake = { compressing: true, pending: [new File(["image"], "photo.png")], inFlight: [] };
  const view = await composer({ value: "", loading: true, onStop() {} });
  try {
    assert.equal(view.host.querySelector('[data-composer-stop]'), null);
    assert.equal(view.host.querySelector('[data-composer-send]').disabled, true);
    delete globalThis.__composerIntake;
    for (const state of [{ uploading: true }, { failed: true }]) {
      await view.update({ attachments: [{ id: "photo", name: "photo.png", ...state }] });
      assert.equal(view.host.querySelector('[data-composer-stop]'), null);
      assert.equal(view.host.querySelector('[data-composer-send]').disabled, true);
    }
  } finally { delete globalThis.__composerIntake; view.cleanup(); }
});

for (const kind of ["oceanleo", "native"]) test(`composer ${kind}: original removes the exact upload before bypass reattach, once; read-only withholds it`, async () => {
  const original = new File(["exact original"], "phone.jpg", { type: "image/jpeg" });
  const actions = [];
  globalThis.__composerIntake = { compressing: false, pending: [], inFlight: [], emitOriginal: (file) => actions.push(["original", file]) };
  const conversation = kind === "native" ? { kind, computerId: "cc_test", program: "codex", view: "chat" } : { kind, target: { kind: "cloud" } };
  const view = await composer({ value: "", loading: true, conversation,
    onAttachFiles() {}, onRemoveAttachment: (id) => actions.push(["remove", id]),
    attachments: [{ id: "exact-id", name: "phone.jpg", uploading: true, originalFile: original, uploadBytes: 4 }] });
  try {
    const button = view.host.querySelector('[data-test-original]');
    assert.ok(button);
    await act(async () => { button.click(); button.click(); });
    assert.deepEqual(actions, [["remove", "exact-id"], ["original", original]]);
    await view.update({ disabled: true });
    assert.equal(view.host.querySelector('[data-test-original]'), null);
    await view.update({ disabled: false, stopping: true });
    assert.equal(view.host.querySelector('[data-test-original]'), null);
  } finally { delete globalThis.__composerIntake; view.cleanup(); }
});

test("image optimization requires an explicit host opt-in and an exact-original recovery path", async () => {
  const view = await composer({ attachments: [], onAttachFiles() {}, onRemoveAttachment() {} });
  try {
    assert.equal(globalThis.__composerIntakeOptions.byteAwareJpeg, false, "custom hosts keep the legacy policy by default");
    await view.update({ optimizeImages: true });
    assert.equal(globalThis.__composerIntakeOptions.byteAwareJpeg, true);
    await view.update({ onRemoveAttachment: undefined });
    assert.equal(globalThis.__composerIntakeOptions.byteAwareJpeg, false);
    await view.update({ onRemoveAttachment() {}, attachments: undefined });
    assert.equal(globalThis.__composerIntakeOptions.byteAwareJpeg, false);
  } finally { delete globalThis.__composerIntakeOptions; view.cleanup(); }
});
