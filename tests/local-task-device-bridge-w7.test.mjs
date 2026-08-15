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
  export class LocalTaskApiError extends Error {
    constructor(code, status, limit){ super(code); this.code=code; this.status=status; this.limit=limit; }
  }
  export async function createLocalTask(){ return {taskId:"task-1",offline:false}; }
`);
const { LocalTaskApiError: StubApiError } = await import(launcherClientStub);
const launcherUrl = await compileModule("src/shell/LocalTaskLauncher.tsx", {
  "./local-task-client": launcherClientStub,
});
const launcherModule = await import(launcherUrl);
const { LocalTaskLauncher } = launcherModule;

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

test("当面点了拒绝显示的是「你拒绝了」，不是「没人在 90 秒内确认」", () => {
  const denied = render(LocalTaskProgress, {
    taskId: "task-user-denied",
    deviceName: "书房电脑",
    initialTask: { status: "denied", denyReason: "user_denied" },
  });
  assert.match(denied, /你在书房电脑上拒绝了这一步。/);
  assert.doesNotMatch(denied, /90 秒/);
  assert.doesNotMatch(denied, /没有人/);

  const timeout = render(LocalTaskProgress, {
    taskId: "task-confirm-timeout",
    deviceName: "书房电脑",
    initialTask: { status: "denied", denyReason: "confirm_timeout" },
  });
  assert.match(timeout, /书房电脑上没有人在 90 秒内确认/);
  assert.doesNotMatch(timeout, /你在书房电脑上拒绝了/);

  assert.notEqual(denied, timeout);
});

test("设备端拒掉的命令形状在进度里也说得清是命令的问题", () => {
  const markup = render(LocalTaskProgress, {
    taskId: "task-command-unsupported",
    deviceName: "书房电脑",
    initialTask: { status: "denied", denyReason: "command_unsupported" },
  });
  assert.match(markup, /这条命令包含管道或重定向，本机执行不支持；请拆成单条命令。/);
  assert.doesNotMatch(markup, /command_unsupported/);
});

test("fs.read_summary 的 kind 要让人看出读到的是文件还是文件夹", () => {
  const file = render(LocalTaskProgress, {
    taskId: "task-kind-file",
    initialTask: {
      status: "succeeded",
      actionKind: "fs.read_summary",
      resultSummary: { kind: "file", bytes: 12 },
    },
  });
  assert.match(file, /类型<\/dt><dd[^>]*>文件</);
  assert.doesNotMatch(file, />file</);

  const directory = render(LocalTaskProgress, {
    taskId: "task-kind-directory",
    initialTask: {
      status: "succeeded",
      actionKind: "fs.read_summary",
      resultSummary: { kind: "directory", entries: 3 },
    },
  });
  assert.match(directory, /类型<\/dt><dd[^>]*>文件夹</);
  assert.doesNotMatch(directory, />directory</);

  const other = render(LocalTaskProgress, {
    taskId: "task-kind-other",
    initialTask: {
      status: "succeeded",
      actionKind: "fs.read_summary",
      resultSummary: { kind: "symlink" },
    },
  });
  assert.match(other, /类型<\/dt><dd[^>]*>symlink</);
});

test("sanitizer 保留 fs.read_summary 的顶层 kind 并截到 64 字符", () => {
  assert.equal(
    client.sanitizeLocalTaskSummary({ kind: "directory", entries: 2 }, "fs.read_summary").kind,
    "directory",
  );
  assert.equal(
    client.sanitizeLocalTaskSummary({ kind: "x".repeat(200) }, "fs.read_summary").kind.length,
    64,
  );
  assert.equal(
    client.sanitizeLocalTaskSummary({ kind: "file", exit_code: 0 }, "shell.run").kind,
    undefined,
  );
});

test("all deny reasons render a human action on 那台电脑", () => {
  const expectations = new Map([
    ["local_exec_disabled", /开关只能在那台电脑上打开/],
    ["grant_missing", /需要在那台电脑上授权/],
    ["path_outside_grant", /请在那台电脑上选择已授权目录/],
    ["confirm_timeout", /90 秒.*那台电脑上重新发起/],
    ["user_denied", /你在书房电脑上拒绝了这一步。/],
    ["command_unsupported", /请拆成单条命令/],
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
    assert.equal(/data-local-task-device-state="offline"/.test(queuedMarkup), true);
    assert.match(queuedMarkup, /书房电脑现在离线/);
    assert.match(queuedMarkup, /上线后这一步会自动继续/);
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

test("拒绝响应把上限带回来：detail.code + detail.limit，字符串 detail 仍然认", async () => {
  const originalFetch = globalThis.fetch;
  const respond = (body, status = 429) => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
  };
  // 下单一次并把真客户端解出来的 (code, limit) 交给下单口的文案函数。
  // 转成 StubApiError 是因为 launcher 在测试里绑的是桩客户端，
  // `instanceof` 认的是桩那个类；搬过去的是这两个值本身，没有换掉判据。
  const orderAndRender = async () => {
    let captured;
    await assert.rejects(
      () => client.createLocalTask("device-1", "fs.list", { path: "/allowed" }),
      (error) => {
        assert.ok(error instanceof client.LocalTaskApiError);
        captured = error;
        return true;
      },
    );
    return {
      code: captured.code,
      limit: captured.limit,
      message: launcherModule.launcherErrorMessage(
        new StubApiError(captured.code, captured.status, captured.limit),
        "书房电脑",
      ),
    };
  };
  try {
    // 契约 §1.2b 的新形状：码与上限都从 detail 里取，一路带到用户看见的那句话。
    respond({ detail: { code: "quota_unfinished_tasks", limit: 100 } });
    assert.deepEqual(await orderAndRender(), {
      code: "quota_unfinished_tasks",
      limit: 100,
      message: "还有100个任务没跑完，等它们结束再下单。",
    });

    // 上限可省的码：省了就是没有，网站不许自己补一个。
    respond({ detail: { code: "quota_rate" } });
    assert.deepEqual(await orderAndRender(), {
      code: "quota_rate",
      limit: undefined,
      message: "下单太频繁了，过一会儿再试。",
    });

    // 旧网关仍在回字符串 detail：码照样解得出来，只是没有上限可用。
    respond({ detail: "quota_unfinished_tasks" });
    const stale = await orderAndRender();
    assert.deepEqual(stale, {
      code: "quota_unfinished_tasks",
      limit: undefined,
      message: "还有任务没跑完，等它们结束再下单。",
    });
    assert.doesNotMatch(stale.message, /\d/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("配对码太频繁与未配对电脑太多，给出的是两条不同的建议", () => {
  const { launcherErrorMessage } = launcherModule;
  const fail = (code, limit) =>
    launcherErrorMessage(new StubApiError(code, 429, limit), "书房电脑");

  const frequency = fail("quota_pair_codes");
  const unpaired = fail("quota_unpaired_devices", 5);
  assert.equal(frequency, "配对码请求太频繁了，过一会儿再试。");
  assert.equal(unpaired, "有 5 台电脑还没完成连接。先在其中一台上连完，或撤销它们。");
  // 频率那条等一会儿有用；存量那条等下去永远不会好，所以不许出现等待话术。
  assert.match(frequency, /过一会儿/);
  assert.doesNotMatch(unpaired, /过一会儿|再试|重试/);
  assert.match(unpaired, /连完|撤销/);
  // 没带上限时同样不许编一个数。
  assert.doesNotMatch(fail("quota_unpaired_devices"), /\d/);
});

test("管道、串联、命令替换在网页上就被拦下，一个请求都不发", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({ task_id: "task-should-not-exist" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    for (const command of ["cat a | grep b", "a && b", "echo $(id)"]) {
      await assert.rejects(
        () => client.createLocalTask("device-1", "shell.run", { cwd: "/allowed", command }),
        (error) =>
          error instanceof client.LocalTaskApiError && error.code === "command_unsupported",
        `${command} 不该被下发`,
      );
      const markup = render(LocalTaskLauncher, {
        deviceId: "device-1",
        deviceName: "书房电脑",
        actionKind: "shell.run",
        payload: { cwd: "/allowed", command },
        label: "运行命令",
        onCreated() {},
      });
      assert.match(markup, /这条命令包含管道或重定向，本机执行不支持；请拆成单条命令。/);
      assert.match(markup, /disabled=""/);
    }
    assert.deepEqual(requests, [], "被拦下的命令不许产生任何 HTTP 请求");

    // 单条命令照常放行，拦的是形状不是动作。
    await client.createLocalTask("device-1", "shell.run", {
      cwd: "/allowed",
      command: "python --version",
    });
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("shell.run 的下单入口写明只能写一条命令，且按钮仍然可用", () => {
  const markup = render(LocalTaskLauncher, {
    deviceId: "device-1",
    deviceName: "书房电脑",
    actionKind: "shell.run",
    payload: { cwd: "/allowed", command: "ls -l" },
    label: "运行命令",
    onCreated() {},
  });
  assert.match(markup, /这里只能写一条命令，不经过 shell/);
  assert.match(markup, /管道 \|、重定向 &gt; &lt;、串联 ; &amp;&amp;、反引号和 \$\(\) 都不支持/);
  // shell.run 靠每次单独确认授权，不靠 grant 类别：下单口绝不许被 granted_kinds 关掉。
  assert.doesNotMatch(markup, /disabled=""/);
  assert.match(markup, /每次都要在书房电脑上单独确认/);
});

test("下单入口不认识 granted_kinds，所以永远关不掉 shell.run", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/shell/LocalTaskLauncher.tsx", import.meta.url), "utf8");
  assert.ok(!source.includes("granted_kinds"));
  assert.ok(!source.includes("grantedKinds"));
});

test("配额与参数错误显示契约文案，绝不诱导用户再点一次", () => {
  const { launcherErrorMessage } = launcherModule;
  const fail = (code, limit) =>
    launcherErrorMessage(new StubApiError(code, 429, limit), "书房电脑");

  assert.equal(fail("quota_rate"), "下单太频繁了，过一会儿再试。");
  assert.equal(fail("quota_unfinished_tasks", 100), "还有100个任务没跑完，等它们结束再下单。");
  assert.equal(fail("quota_unfinished_tasks", 3), "还有3个任务没跑完，等它们结束再下单。");
  // 后端没带上限，就一个数字都不许出现：编一个数比不显示更坏（契约 §1.2b）。
  assert.equal(fail("quota_unfinished_tasks"), "还有任务没跑完，等它们结束再下单。");
  assert.doesNotMatch(fail("quota_unfinished_tasks"), /\d/);
  assert.equal(fail("payload_field_missing"), "这一步缺少必要参数，请刷新页面后重试。");
  assert.equal(
    fail("command_unsupported"),
    "这条命令包含管道或重定向，本机执行不支持；请拆成单条命令。",
  );
  for (const code of ["quota_rate", "quota_unfinished_tasks", "quota_pair_codes"]) {
    assert.ok(
      !fail(code).includes("重试"),
      `${code} 不许出现「重试」话术：每次重试都再吃一次配额`,
    );
    assert.ok(!fail(code).includes("请检查网络"));
  }

  // 未知码：绝不把英文原文摆到用户面前。
  for (const unknown of ["device_quota_rate_exceeded", "http_500", "boom"]) {
    assert.equal(fail(unknown), "这一步没有完成，请稍后重试。");
    assert.doesNotMatch(fail(unknown), /[a-z]+_[a-z_]+/);
  }
  // 真的是网络断了才允许说「检查网络」。
  assert.equal(fail("network_error"), "任务暂时没有排上，请检查网络后重试。");
  assert.equal(fail("unauthorized"), "登录后才能给你的电脑下发任务。");
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
