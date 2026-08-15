import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const authStub = dataModule(`export async function accessToken(){ return "session-token"; }`);
const configStub = dataModule(`export const GATEWAY_BASE = "https://api.example.test";`);
const clientUrl = await compileModule("src/shell/local-task-client.ts", {
  "../lib/auth/client": authStub,
  "../lib/auth/config": configStub,
});
const client = await import(clientUrl);

const launcherClientStub = dataModule(`
  export class LocalTaskApiError extends Error { constructor(code, status){ super(code); this.code=code; this.status=status; } }
  export async function createLocalTask(){ return {taskId:"task-1",offline:false}; }
`);
const launcherUrl = await compileModule("src/shell/LocalTaskLauncher.tsx", {
  "./local-task-client": launcherClientStub,
});
const { LocalTaskLauncher } = await import(launcherUrl);

const progressClientStub = dataModule(`
  export async function cancelLocalTask(){}
  export function watchLocalTask(){ return () => {}; }
`);
const progressUrl = await compileModule("src/shell/LocalTaskProgress.tsx", {
  "./local-task-client": progressClientStub,
});
const { LocalTaskProgress } = await import(progressUrl);

function render(Component, props) {
  return renderToStaticMarkup(React.createElement(Component, props));
}

test("Launcher renders online, offline, and no-device states", () => {
  const common = {
    actionKind: "fs.list",
    payload: { path: "/allowed" },
    label: "整理文件",
    onCreated() {},
  };
  const online = render(LocalTaskLauncher, {
    ...common,
    deviceId: "device-1",
    deviceName: "书房电脑",
    deviceOnline: true,
  });
  assert.match(online, /data-local-task-device-state="online"/);
  assert.match(online, />整理文件</);
  assert.doesNotMatch(online, /现在离线/);

  const offline = render(LocalTaskLauncher, {
    ...common,
    deviceId: "device-1",
    deviceName: "书房电脑",
    deviceOnline: false,
  });
  assert.match(offline, /data-local-task-device-state="offline"/);
  assert.match(offline, /书房电脑现在离线/);
  assert.match(offline, /它上线后这一步会自动继续/);
  assert.match(offline, />整理文件</);
  assert.doesNotMatch(offline, /disabled=""/);

  const missing = render(LocalTaskLauncher, { ...common, deviceId: null });
  assert.match(missing, /data-local-task-device-state="missing"/);
  assert.match(missing, /href="\/devices"/);
  assert.match(missing, /去连接一台电脑/);
});

test("shell launcher warns that every command needs confirmation on that computer", () => {
  const markup = render(LocalTaskLauncher, {
    deviceId: "device-1",
    deviceName: "那台电脑",
    actionKind: "shell.run",
    payload: { cwd: "/allowed", command: "pwd" },
    label: "运行命令",
    onCreated() {},
  });
  assert.match(markup, /每次都要在那台电脑上单独确认/);
  assert.match(markup, /不能一次授权长期生效/);
});

test("all five deny reasons render a human action on 那台电脑", () => {
  const expectations = new Map([
    ["local_exec_disabled", /开关只能在那台电脑上打开/],
    ["grant_missing", /需要在那台电脑上授权/],
    ["path_outside_grant", /请在那台电脑上选择已授权目录/],
    ["confirm_timeout", /90 秒.*那台电脑上重新发起/],
    ["revoked", /在那台电脑上重新配对/],
  ]);
  for (const [denyReason, expected] of expectations) {
    const markup = render(LocalTaskProgress, {
      taskId: `task-${denyReason}`,
      deviceName: "书房电脑",
      initialTask: { status: "denied", denyReason },
    });
    assert.match(markup, /data-local-task-status="denied"/);
    assert.match(markup, expected);
    assert.doesNotMatch(markup, new RegExp(denyReason));
  }
});

test("every protocol status has a distinct progress rendering and terminals cannot cancel", () => {
  const statuses = [
    "queued",
    "claimed",
    "running",
    "succeeded",
    "failed",
    "denied",
    "expired",
    "cancelled",
  ];
  for (const status of statuses) {
    const markup = render(LocalTaskProgress, {
      taskId: `task-${status}`,
      initialTask: { status },
    });
    assert.match(markup, new RegExp(`data-local-task-status="${status}"`));
    if (["queued", "claimed"].includes(status)) assert.match(markup, /取消这一步/);
    else assert.doesNotMatch(markup, /取消这一步/);
  }
});

test("summary sanitizer exposes only protocol §5.3 fields and clamps output tails", () => {
  const summary = client.sanitizeLocalTaskSummary({
    entries: 2,
    bytes: 9,
    columns: ["编号", "金额", 7],
    rows: 2,
    files: [
      { name: "result.xlsx", bytes: 9, kind: "spreadsheet", content: "secret" },
      { name: "invalid", bytes: "9", kind: "text" },
    ],
    exit_code: 0,
    stdout_tail: "x".repeat(2_100),
    stderr_tail: "warn",
    file_content: "must never escape",
    prose: "free form",
  });
  assert.deepEqual(Object.keys(summary).sort(), [
    "bytes",
    "columns",
    "entries",
    "exit_code",
    "files",
    "rows",
    "stderr_tail",
    "stdout_tail",
  ]);
  assert.deepEqual(summary.files, [
    { name: "result.xlsx", bytes: 9, kind: "spreadsheet" },
  ]);
  assert.equal(summary.stdout_tail.length, 2_000);
  assert.equal("file_content" in summary, false);
});

test("shell success shows only exit code and output bytes, with output kept in local audit", () => {
  const sanitized = client.sanitizeLocalTaskSummary({
    exit_code: 7,
    output_bytes: 321,
    stdout_tail: "must stay on device",
    stderr_tail: "must also stay on device",
  }, "shell.run");
  assert.deepEqual(sanitized, { exit_code: 7, output_bytes: 321 });

  const markup = render(LocalTaskProgress, {
    taskId: "task-shell",
    deviceName: "书房电脑",
    initialTask: {
      status: "succeeded",
      actionKind: "shell.run",
      resultSummary: {
        ...sanitized,
        stdout_tail: "malicious server leakage",
      },
    },
  });
  assert.match(markup, /退出码<\/dt><dd>7/);
  assert.match(markup, /输出<\/dt><dd>321 字节/);
  assert.match(markup, /命令输出只保存在书房电脑上/);
  assert.match(markup, /客户端的本地审计里查看/);
  assert.doesNotMatch(markup, /must stay|malicious server leakage|程序标准输出/);
});

test("client maps cloud task endpoints and preserves protocol error codes", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    if (String(url).endsWith("/cancel")) {
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(
      JSON.stringify({ task_id: "task-7", status: "queued", device_offline: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const created = await client.createLocalTask("device/a", "fs.list", { path: "/allowed" });
    assert.deepEqual(created, { taskId: "task-7", offline: true });
    const queuedMarkup = render(LocalTaskLauncher, {
      deviceId: "device/a",
      deviceName: "书房电脑",
      deviceOnline: !created.offline,
      actionKind: "fs.list",
      payload: { path: "/allowed" },
      label: "列出目录",
      onCreated() {},
    });
    assert.match(queuedMarkup, /等书房电脑上线/);
    assert.equal(requests[0].url, "https://api.example.test/v1/devices/device%2Fa/tasks");
    assert.deepEqual(JSON.parse(requests[0].init.body), {
      action_kind: "fs.list",
      action_payload: { path: "/allowed" },
    });
    assert.equal(requests[0].init.headers.Authorization, "Bearer session-token");
    await client.cancelLocalTask("task/7");
    assert.equal(requests[1].url, "https://api.example.test/v1/devices/tasks/task%2F7/cancel");
    assert.equal(requests[1].init.method, "POST");

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ detail: { code: "revoked" } }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    await assert.rejects(
      () => client.getLocalTask("task-7"),
      (error) => error instanceof client.LocalTaskApiError && error.code === "revoked",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function scheduler() {
  let sequence = 0;
  const pending = new Map();
  const delays = [];
  return {
    delays,
    setTimer(callback, delay) {
      const id = ++sequence;
      delays.push(delay);
      pending.set(id, callback);
      return id;
    },
    clearTimer(id) {
      pending.delete(id);
    },
    runNext() {
      const next = pending.entries().next().value;
      assert.ok(next, "expected a scheduled poll");
      pending.delete(next[0]);
      next[1]();
    },
    get size() {
      return pending.size;
    },
  };
}

test("watchLocalTask backs off 1s → 2s → 5s and stops at terminal state", async () => {
  const clock = scheduler();
  const statuses = ["queued", "claimed", "running", "succeeded"];
  const updates = [];
  const stop = client.watchLocalTask("task-1", (task) => updates.push(task.status), {
    getTask: async () => ({ status: statuses.shift() }),
    visibilityDocument: null,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  await flush();
  assert.deepEqual(clock.delays, [1_000]);
  clock.runNext();
  await flush();
  assert.deepEqual(clock.delays, [1_000, 2_000]);
  clock.runNext();
  await flush();
  assert.deepEqual(clock.delays, [1_000, 2_000, 5_000]);
  clock.runNext();
  await flush();
  assert.deepEqual(updates, ["queued", "claimed", "running", "succeeded"]);
  assert.equal(clock.size, 0);
  stop();
});

test("watchLocalTask pauses while document.hidden and resumes when visible", async () => {
  const clock = scheduler();
  let visibilityListener = null;
  let calls = 0;
  const visibilityDocument = {
    hidden: true,
    addEventListener(_type, listener) { visibilityListener = listener; },
    removeEventListener(_type, listener) {
      if (visibilityListener === listener) visibilityListener = null;
    },
  };
  const stop = client.watchLocalTask("task-hidden", () => {}, {
    getTask: async () => { calls += 1; return { status: "queued" }; },
    visibilityDocument,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  await flush();
  assert.equal(calls, 0);
  assert.equal(clock.size, 0);

  visibilityDocument.hidden = false;
  visibilityListener();
  await flush();
  assert.equal(calls, 1);
  assert.equal(clock.size, 1);

  visibilityDocument.hidden = true;
  visibilityListener();
  assert.equal(clock.size, 0);
  await flush();
  assert.equal(calls, 1);
  stop();
});
