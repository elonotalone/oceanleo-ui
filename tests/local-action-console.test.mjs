import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// W09（2026-08-21）：本机能力的产品面 focused 测试。
//
// 判的是「六个本机动作在网页端**真的**可发起 / 可见进度 / 可见结果 / 可取消」，
// 以及我们与同类产品的差异点：**发起之前先把要动什么讲清楚**、每一条都留在带审计
// 指纹的台账里、没装客户端时给的是三步引导而不是一个空面板。
//
// 为什么是静态渲染 + 纯函数两条腿：本仓没装 jsdom / testing-library，
// `renderToStaticMarkup` 跑得到 `useState` 的初值但跑不到 `useEffect`。所以
// 「点了会怎样」这一半改由组件**依赖的纯函数**来钉（动作计划、状态文案、结果文案、
// 越界判定），组件这一半钉的是「同一份状态渲染出来的界面对不对」。
// 这样不需要一个假浏览器，也不会把断言退化成「渲染没抛异常」。

const stubs = {
  "../lib/auth/client": dataModule(
    `export async function accessToken(){ return "session-token"; }`,
  ),
  "../lib/auth/config": dataModule(
    `export const GATEWAY_BASE = "https://api.example.test";`,
  ),
  // 设备列表在这份测试里不许真去打网关：我们要的是三种设备态各自渲染成什么样。
  "./library-scope-client": dataModule(
    `export async function listLibraryDevices(){ return []; }`,
  ),
};

const { LocalActionConsole, MyDevicesActionConsole } = await import(
  await compileModule("src/shell/LocalActionConsole.tsx", stubs)
);
const { LocalFileTree, humanizeGrantedKinds } = await import(
  await compileModule("src/shell/LocalFileTree.tsx", stubs)
);
const { LocalTaskProgress } = await import(
  await compileModule("src/shell/LocalTaskProgress.tsx", stubs)
);
const {
  LOCAL_ACTION_EFFECTS,
  LOCAL_ACTION_KINDS,
  LOCAL_ACTIONS_THAT_CHANGE_THE_DEVICE,
  describeLocalAction,
  isInsideLocalRoot,
  localActionChangesDevice,
  localActionOutcomeText,
  localTaskStatusText,
  localTextToBase64,
} = await import(await compileModule("src/shell/local-task-client.ts", stubs));

const MUTATING = ["file.write", "python.run", "shell.run"];
const ROOT = "/work/invoices";

const DEVICE = {
  device_id: "device-1",
  device_name: "书房电脑",
  online: true,
  granted_kinds: ["read", "write", "python"],
  local_exec_enabled: true,
};

const render = (Component, props) =>
  renderToStaticMarkup(React.createElement(Component, props));

const consoleMarkup = (props = {}) =>
  render(LocalActionConsole, { device: DEVICE, basePath: ROOT, ...props });

// ---------------------------------------------------------------------------
// 判据 15：六个动作逐个可发起
// ---------------------------------------------------------------------------

test("六个动作在动作台上各有一个入口，会改东西的三个当场标出来", () => {
  const html = consoleMarkup();
  assert.deepEqual([...LOCAL_ACTION_KINDS], [
    "fs.list", "fs.read_summary", "file.write", "python.run", "shell.run", "app.open",
  ]);
  for (const kind of LOCAL_ACTION_KINDS) {
    assert.match(
      html,
      new RegExp(`data-local-action-tab="${kind.replace(".", "\\.")}"`),
      `${kind} 在动作台上没有入口`,
    );
  }
  // 「会改动那台电脑」的标记只能出现在那三个上，而且是从登记表推出来的。
  assert.deepEqual(
    LOCAL_ACTION_KINDS.filter(localActionChangesDevice),
    MUTATING,
  );
  assert.deepEqual([...LOCAL_ACTIONS_THAT_CHANGE_THE_DEVICE].sort(), [...MUTATING].sort());
  assert.equal((html.match(/aria-label="会改动那台电脑"/g) || []).length, MUTATING.length);
});

test("每个动作被选中时都给出自己的预告：改不改东西、要不要确认、结果能看到什么", () => {
  for (const kind of LOCAL_ACTION_KINDS) {
    const html = consoleMarkup({ initialActionKind: kind });
    const changes = localActionChangesDevice(kind);

    assert.match(
      html,
      new RegExp(`data-local-action-plan="${kind.replace(".", "\\.")}"`),
      `${kind} 没有渲染动作预告块`,
    );
    assert.match(
      html,
      new RegExp(`data-local-action-changes-device="${changes}"`),
      `${kind} 的「会不会改动那台电脑」标错了`,
    );
    // 选中动作时的那一句话来自唯一那张登记表，不是组件里另抄的一份。
    assert.ok(html.includes(LOCAL_ACTION_EFFECTS[kind].summary), `${kind} 少了一句话说明`);
    assert.match(html, /影响范围：/);

    if (changes) {
      assert.match(html, /发起前请先看清楚：这一步会改动那台电脑/, `${kind} 没有发起前的警示`);
      assert.match(html, /data-local-action-consent/, `${kind} 没有说要走哪一道同意`);
      assert.match(html, />确认并发起</, `${kind} 的按钮没有把「要确认」写在脸上`);
    } else {
      assert.match(html, /这一步只读，不会改动那台电脑/, `${kind} 的只读承诺没写出来`);
      assert.doesNotMatch(html, /data-local-action-consent/, `${kind} 不该要同意窗口`);
      assert.match(html, />发起</);
    }
  }
});

test("三个会改东西的动作，发起前把路径、命令与不可撤销讲成人话", () => {
  const write = describeLocalAction("file.write", {
    path: "/work/out.txt",
    content_b64: localTextToBase64("你好"),
  }, "书房电脑");
  assert.equal(write.changesDevice, true);
  assert.equal(write.facts[0].value, "/work/out.txt");
  assert.match(write.impact, /整份替换/);
  assert.match(write.impact, /不会自动备份/);
  assert.match(write.consent, /写入与新建文件/);

  const python = describeLocalAction("python.run", { cwd: ROOT, code: "print(1)\nprint(2)" });
  assert.equal(python.changesDevice, true);
  assert.equal(python.facts[0].value, ROOT);
  assert.match(python.facts[1].value, /2 行/);
  assert.match(python.impact, /没有一键撤销/);
  assert.match(python.consent, /90 秒/);

  const shell = describeLocalAction("shell.run", { cwd: ROOT, command: "git status" });
  assert.equal(shell.changesDevice, true);
  // 「实际执行的程序」这一格是差异点：不经过 shell，所以到底跑的是哪个可执行文件
  // 必须在发起前就摆出来，而不是等它在那台电脑上跑完再说。
  assert.equal(shell.facts[2].value, "git");
  assert.match(shell.impact, /不经过 shell/);
  assert.match(shell.consent, /每次都要/);
  assert.match(shell.resultNote, /只会显示退出码与输出字节数/);

  // 只读的三个都不许带同意句，否则「要不要有人在那台电脑上按确认」就说不准了。
  for (const kind of ["fs.list", "fs.read_summary", "app.open"]) {
    const plan = describeLocalAction(kind, { path: ROOT });
    assert.equal(plan.changesDevice, false, `${kind} 不该被判成会改东西`);
    assert.equal(plan.consent, undefined, `${kind} 不该要同意窗口`);
    assert.match(plan.scopeNote, /已经授权过的目录/);
  }
});

test("参数没填齐时按钮按不动，并且说清楚差什么", () => {
  const write = consoleMarkup({ initialActionKind: "file.write" });
  assert.match(write, /data-local-console-blocked/);
  assert.match(write, /还没有要写进去的内容。/);
  assert.match(write, /<button[^>]*data-local-console-launch[^>]*disabled/);

  assert.match(consoleMarkup({ initialActionKind: "python.run" }), /还没有要执行的脚本。/);
  assert.match(consoleMarkup({ initialActionKind: "shell.run" }), /还没有要执行的命令。/);

  // 根目录本身不是绝对路径时，六个动作一个都发不出去。
  const relative = consoleMarkup({ basePath: "work/invoices" });
  assert.match(relative, /先填一个你已经在那台电脑上授权过的目录的绝对路径。/);
  assert.match(relative, /<button[^>]*data-local-console-launch[^>]*disabled/);
});

// ---------------------------------------------------------------------------
// 判据 15/18：进度、结果、取消、审计指纹
// ---------------------------------------------------------------------------

test("台账里每一种状态都有话说，没有一条是空白的转圈", () => {
  assert.equal(localTaskStatusText(undefined), "已排队");
  assert.equal(localTaskStatusText(undefined, true), "已排队（设备离线）");
  assert.match(localTaskStatusText("queued", true), /离线/);
  for (const status of [
    "queued", "claimed", "running", "succeeded", "failed", "denied", "expired", "cancelled",
  ]) {
    const text = localTaskStatusText(status);
    assert.ok(text.length > 1, `${status} 没有状态文案`);
    assert.notEqual(text, status, `${status} 直接把状态码丢给了用户`);
  }
});

test("结果是读数或一句人话，失败不许只剩一个错误码", () => {
  assert.match(
    localActionOutcomeText({ status: "succeeded", resultSummary: { entries: 12 } }),
    /12 个条目/,
  );
  assert.match(
    localActionOutcomeText({
      status: "succeeded",
      resultSummary: { kind: "file", bytes: 2048, rows: 30, columns: ["日期", "金额"] },
    }),
    /文件.*2048 字节.*30 行.*日期/s,
  );
  // shell.run 的输出留在那台电脑上，这句必须说出来，不然用户以为坏了。
  assert.match(
    localActionOutcomeText(
      { status: "succeeded", resultSummary: { exit_code: 0, output_bytes: 128 } },
      "书房电脑",
    ),
    /只在书房电脑上/,
  );
  assert.match(
    localActionOutcomeText({ status: "failed", resultSummary: { stderr_tail: "No such file" } }),
    /执行失败：No such file/,
  );
  assert.match(
    localActionOutcomeText({ status: "failed", resultSummary: { exit_code: 2 } }, "书房电脑"),
    /退出码 2.*本地审计/s,
  );
  assert.match(localActionOutcomeText({ status: "failed" }, "书房电脑"), /本地审计/);
  assert.match(localActionOutcomeText({ status: "cancelled" }), /没有在那台电脑上执行/);
  assert.match(localActionOutcomeText({ status: "expired" }), /24 小时/);
});

test("还没结束的动作可以取消，已经结束的不再给一个骗人的取消按钮", () => {
  for (const status of ["queued", "claimed"]) {
    const html = render(LocalTaskProgress, {
      taskId: "task-1",
      deviceName: "书房电脑",
      actionKind: "shell.run",
      initialTask: { status },
    });
    assert.match(html, />取消这一步</, `${status} 应该还能取消`);
  }
  for (const status of ["running", "succeeded", "failed", "denied", "expired", "cancelled"]) {
    const html = render(LocalTaskProgress, {
      taskId: "task-1",
      initialTask: { status },
    });
    assert.doesNotMatch(html, />取消这一步</, `${status} 不该再给取消按钮`);
  }
  // 结果读得到：shell.run 只给退出码与字节数，并说明全文在哪台电脑上。
  const shell = render(LocalTaskProgress, {
    taskId: "task-1",
    deviceName: "书房电脑",
    actionKind: "shell.run",
    initialTask: { status: "succeeded", resultSummary: { exit_code: 0, output_bytes: 42 } },
  });
  assert.match(shell, /42 字节/);
  assert.match(shell, /命令输出只保存在书房电脑上/);
});

test("台账把审计指纹与「这里不是全部」一起摆出来", () => {
  const html = consoleMarkup();
  assert.match(html, /data-local-console-ledger/);
  assert.match(html, /进行中/);
  assert.match(html, /历史/);
  assert.match(html, /现在没有正在执行的本机动作。/);
  assert.match(html, /本次会话还没有已结束的本机动作。/);
  // 网关没有「列出我的任务」端点，所以这张台账只到本次会话；这一点要直说。
  assert.match(html, /这张台账记的是你在这个网页本次会话里发起过的动作/);
  assert.match(html, /本地审计/);
});

// ---------------------------------------------------------------------------
// 判据 17：文件树与授权范围
// ---------------------------------------------------------------------------

test("文件树把授权范围说清楚，而且不假装知道你授权了哪些目录", () => {
  const html = render(LocalFileTree, {
    deviceId: DEVICE.device_id,
    deviceName: DEVICE.device_name,
    rootPath: ROOT,
    grantedKinds: DEVICE.granted_kinds,
  });
  assert.match(html, /data-local-tree-root="\/work\/invoices"/);
  assert.match(html, /授权范围：/);
  assert.match(html, /这棵树不会走出这个目录/);
  assert.match(html, /已授权的类别：读取文件清单与结构、写入与新建文件/);
  assert.match(html, /网页端看不到你在那台电脑上授权了哪些\s*目录/);
  assert.match(html, /文件正文一律不上传/);

  assert.equal(humanizeGrantedKinds([]), "还没有任何授权类别");
  assert.equal(humanizeGrantedKinds(["shell"]), "执行系统命令");
  assert.equal(humanizeGrantedKinds(["not-a-kind"]), "还没有任何授权类别");
});

test("越出授权根目录的条目在浏览器这一侧就停住", () => {
  assert.equal(isInsideLocalRoot(ROOT, "/work/invoices/2026.csv"), true);
  assert.equal(isInsideLocalRoot(ROOT, ROOT), true);
  assert.equal(isInsideLocalRoot(ROOT, "/work/invoices/../secrets"), false);
  assert.equal(isInsideLocalRoot(ROOT, "/work/invoices-backup"), false);
  assert.equal(isInsideLocalRoot(ROOT, "/etc/passwd"), false);
  assert.equal(isInsideLocalRoot("C:\\work", "C:\\work\\a.txt"), true);
  assert.equal(isInsideLocalRoot("C:\\work", "C:\\workspace\\a.txt"), false);
});

test("动作台在根目录填对之后才挂出文件树", () => {
  assert.match(consoleMarkup(), /data-local-file-tree/);
  assert.doesNotMatch(consoleMarkup({ basePath: "work" }), /data-local-file-tree/);
  assert.doesNotMatch(consoleMarkup({ showFileTree: false }), /data-local-file-tree/);
});

// ---------------------------------------------------------------------------
// 判据 19：没装客户端 / 设备离线
// ---------------------------------------------------------------------------

test("没装客户端时给的是三步引导，不是一个空面板", () => {
  const html = render(LocalActionConsole, { device: null, devicesHref: "/devices" });
  assert.match(html, /data-local-console-state="no-device"/);
  assert.match(html, /这是设计如此，\s*不是坏了。/);
  assert.match(html, /1\. 在要被操作的那台电脑上安装 OceanLeo 客户端。/);
  assert.match(html, /2\. .*配对/);
  assert.match(html, /3\. .*授权/);
  assert.match(html, /<a href="\/devices"[^>]*>\s*去连接一台电脑\s*<\/a>/);
  // 没有设备时不许还摆着一排按不动的动作按钮。
  assert.doesNotMatch(html, /data-local-action-tab/);
  assert.doesNotMatch(html, /data-local-console-launch/);
});

test("设备离线时说明会排队，而不是把动作藏起来", () => {
  const html = consoleMarkup({ device: { ...DEVICE, online: false } });
  assert.match(html, /data-local-console-state="offline"/);
  assert.match(html, /离线（下单会排队）/);
  assert.match(html, /data-local-console-launch/);
});

test("那台电脑关掉「允许云端下发」时，先说清楚这个开关只能在那边开", () => {
  const html = consoleMarkup({ device: { ...DEVICE, local_exec_enabled: false } });
  assert.match(html, /任务会被拒绝/);
  assert.match(html, /只能在那台电脑的托盘图标里打开/);
});

test("「我的设备」页的自带取数版本，三种取数结果各有一种界面", () => {
  const loading = render(MyDevicesActionConsole, {});
  assert.match(loading, /正在读取你已连接的电脑…/);
  assert.match(loading, /role="status"/);
});

// ---------------------------------------------------------------------------
// 判据 20：隔离面没有退
// ---------------------------------------------------------------------------

test("网页端一律走设备桥，不碰 IPC，也没有新的注入面", () => {
  const sources = [
    "src/shell/LocalActionConsole.tsx",
    "src/shell/LocalFileTree.tsx",
    "src/shell/LocalTaskProgress.tsx",
    "src/shell/LocalTaskLauncher.tsx",
    "src/shell/local-task-client.ts",
  ].map((path) => ({
    path,
    text: readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
  }));

  for (const { path, text } of sources) {
    assert.doesNotMatch(text, /__TAURI__|tauri:\/\//, `${path} 直接摸了 Tauri`);
    assert.doesNotMatch(text, /\binvoke\s*\(/, `${path} 走了 IPC 而不是设备桥`);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/, `${path} 开了 HTML 注入口`);
    assert.doesNotMatch(text, /document\.cookie|postMessage\(/, `${path} 动了 cookie 或跨窗口消息`);
  }

  // 唯一的出口是网关的设备桥路由。
  const client = sources.find((entry) => entry.path.endsWith("local-task-client.ts")).text;
  const endpoints = [...new Set(client.match(/`\/v1\/[^`]*`/g) || [])];
  assert.deepEqual(endpoints.sort(), [
    "`/v1/devices/${encodeURIComponent(deviceId)}/tasks`",
    "`/v1/devices/tasks/${encodeURIComponent(taskId)}/cancel`",
    "`/v1/devices/tasks/${encodeURIComponent(taskId)}`",
  ]);
  // 设备号与任务号进 URL 之前一律编码，路径参数不许拼裸串。
  assert.doesNotMatch(client, /\/v1\/devices\/\$\{deviceId\}/);
});
