import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const target = await import(await compileModule("src/lib/execution-target.ts"));
const transport = await import(await compileModule("src/lib/agent.ts", {
  "./auth/client": dataModule(`
    export async function getUserId() { return globalThis.__executionOwner; }
    export async function accessToken() { return "test-access"; }
    export function cachedAccessToken() { return "test-access"; }
  `),
  "./auth/config": dataModule('export const GATEWAY_BASE = "https://api.dev.oceanleo.com";'),
  "./history-events": dataModule("export function notifyHistoryChanged() {}"),
}));

function environment() {
  const saved = { window: globalThis.window, fetch: globalThis.fetch };
  const values = new Map();
  const scope = new EventTarget();
  scope.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  globalThis.window = scope;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ task_id: "test-task", status: "running" }), { status: 200 });
  };
  globalThis.__executionOwner = "alice";
  return { calls, values, cleanup() { Object.assign(globalThis, saved); delete globalThis.__executionOwner; } };
}

test("execution target is validated and stored separately for each signed-in account", () => {
  const env = environment();
  try {
    const choice = { kind: "device", id: "my-mac", name: "My Mac" };
    target.writeExecutionTarget("alice", choice);
    assert.deepEqual(target.readExecutionTarget("alice"), choice);
    assert.deepEqual(target.readExecutionTarget("bob"), { kind: "cloud" });
    assert.deepEqual(target.readExecutionTarget(null), { kind: "cloud" });
    assert.equal(target.normalizeExecutionTarget({ kind: "device", id: "../escape", name: "bad" }), null);
    env.values.set("oceanleo.execution-target.v1:alice", "invalid json");
    assert.deepEqual(target.readExecutionTarget("alice"), { kind: "cloud" });
  } finally { env.cleanup(); }
});

test("actual task HTTP body uses local selection and does not inherit another account or stale cloud mount", async () => {
  const env = environment();
  try {
    env.values.set("oceanleo.cc.mounted", "stale-cloud");
    target.writeExecutionTarget("alice", { kind: "device", id: "my-mac", name: "My Mac" });
    await transport.createTask({ prompt: "list my files" });
    assert.deepEqual(env.calls[0].execution_target, { kind: "device", id: "my-mac" });
    assert.equal(env.calls[0].computer_id, "");
    globalThis.__executionOwner = "bob";
    await transport.createTask({ prompt: "new task" });
    assert.deepEqual(env.calls[1].execution_target, { kind: "cloud" });
    assert.equal(env.calls[1].computer_id, "");
  } finally { env.cleanup(); }
});

test("explicit submit snapshot wins over later persisted selection; cloud computer carries its id", async () => {
  const env = environment();
  try {
    const snapshot = { kind: "device", id: "my-mac", name: "My Mac" };
    target.writeExecutionTarget("alice", { kind: "cloud" });
    await transport.createTask({ prompt: "local", executionTarget: snapshot });
    assert.deepEqual(env.calls[0].execution_target, { kind: "device", id: "my-mac" });
    await transport.createTask({ prompt: "cloud", executionTarget: { kind: "computer", id: "cc_123", name: "Cloud box" } });
    assert.deepEqual(env.calls[1].execution_target, { kind: "computer", id: "cc_123" });
    assert.equal(env.calls[1].computer_id, "cc_123");
  } finally { env.cleanup(); }
});

test("follow-up HTTP body leaves existing task binding alone despite changed global preference", async () => {
  const env = environment();
  try {
    env.values.set("oceanleo.cc.mounted", "unrelated-cloud");
    target.writeExecutionTarget("alice", { kind: "device", id: "another-mac", name: "Other Mac" });
    await transport.followUp("existing-task", "continue");
    assert.equal(Object.hasOwn(env.calls[0], "computer_id"), false);
    assert.equal(Object.hasOwn(env.calls[0], "execution_target"), false);
  } finally { env.cleanup(); }
});

test("cloud-device scope is explicit and strict, and remembered drafts never inherit GUI opt-in", () => {
  const env = environment();
  try {
    const picked = {kind: "device", id: "pc", name: "PC", driver: "cloud", gui: true};
    assert.deepEqual(target.normalizeExecutionTarget(picked), picked);
    target.writeExecutionTarget("alice", picked);
    assert.deepEqual(target.readExecutionTarget("alice"), {...picked, gui: false});
    assert.equal(JSON.parse(env.values.get("oceanleo.execution-target.v1:alice")).gui, false);
    assert.deepEqual(target.executionTargetRequestFields(picked).execution_target, {kind: "device", id: "pc", driver: "cloud", gui: true});
    assert.equal(target.executionTargetRequestFields({...picked, gui: undefined}).execution_target.gui, false);
    assert.equal(target.executionTargetRequestFields({...picked, gui: false}).execution_target.gui, false);
    assert.equal(Object.hasOwn(target.executionTargetRequestFields({kind: "device", id: "pc", name: "PC"}).execution_target, "gui"), false);
    for (const gui of ["false", 0, 1]) assert.equal(target.normalizeExecutionTarget({...picked, gui}), null);
    assert.equal(target.normalizeExecutionTarget({kind: "device", id: "pc", name: "PC", gui: false}), null);
    assert.equal(target.withRunMode({...picked, driver: undefined, gui: undefined}, "cloud").gui, false);
    assert.equal(Object.hasOwn(target.withRunMode(picked, "device"), "gui"), false);
  } finally {env.cleanup();}
});

test("loaded task binding preserves actual scope independently of new-draft defaults", () => {
  for (const gui of [false, true]) {
    assert.deepEqual(target.taskExecutionTarget({plan: {execution_target: {kind: "device", id: "pc", driver: "cloud", gui}}}),
      {kind: "device", id: "pc", name: "pc", driver: "cloud", gui});
  }
  const legacy = target.taskExecutionTarget({plan: {execution_target: {kind: "device", id: "pc", driver: "cloud"}}});
  assert.equal(legacy.gui, undefined, "unknown legacy scope is never called file-only");
  assert.equal(target.taskExecutionTarget({plan: {execution_target: {kind: "device", id: "pc", driver: "cloud", gui: "false"}}}), null);
  assert.deepEqual(target.taskExecutionTarget({computer_id: "desktop:old-pc", plan: {local_run: {driver: "cloud"}}}),
    {kind: "device", id: "old-pc", name: "old-pc", driver: "cloud"});
});

test("bound target renders actual immutable scope and never exposes the draft selector", async () => {
  const React = await import("react");
  const {renderToStaticMarkup} = await import("react-dom/server");
  const {ComputerDock} = await import(await compileModule("src/shell/cloud-computer/ComputerDock.tsx", {
    "next/navigation": dataModule('export function useRouter(){return {push(){}}}'),
    "../../i18n/ui/useUI": dataModule('export function useUI(){return value=>value}'),
    "../../lib/auth/client": dataModule('export async function getUserId(){return "alice"}'),
    "../../lib/cloud-computer-api": dataModule('export const cloudComputerApi={}; export function writeMountedComputerId(){} export function writeMountedComputerName(){}'),
    "../../api/devices": dataModule('export async function listDevices(){return {ok:true,data:[]}}'),
    "../../lib/cloud-agent-api": dataModule('export async function listCloudAgentAvailability(){return {kind:"absent"}}'),
    "../../contracts/domain-family": dataModule('export function portalHref(value){return value}'),
    "../anchored-popover": dataModule('export function AnchoredPopover(){return null}'),
  }));
  for (const gui of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(ComputerDock, {boundTarget: {kind: "device", id: "pc", name: "PC", driver: "cloud", gui}}));
    assert.match(html, /data-task-bound-target/);
    assert.match(html, gui ? /允许截图和操作界面/ : /仅文件（不截图或操作界面）/);
    assert.doesNotMatch(html, /<button/);
  }
  const loading = renderToStaticMarkup(React.createElement(ComputerDock, {boundTarget: null}));
  assert.match(loading, /正在加载/);
  assert.doesNotMatch(loading, /仅文件/);
  const legacy = renderToStaticMarkup(React.createElement(ComputerDock, {boundTarget: {kind: "device", id: "pc", name: "PC", driver: "cloud"}}));
  assert.doesNotMatch(legacy, /仅文件|允许截图/);
});
