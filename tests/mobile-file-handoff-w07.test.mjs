/**
 * 手机上拍的照片、录的音，直接落进那台电脑的授权目录（W07 P6）。
 *
 * 这条链上有三件事一旦坏掉，用户是**看不出来**的，所以只能机检：
 *
 * 1. **落点只能是那台电脑自己报上来的授权目录。** 手敲一个绝对路径看着像「更自由」，
 *    实际是绕过授权：设备侧会把范围外的路径拒成 `path_outside_grant`，等于先请用户
 *    瞄准一个没人授权的文件夹、再当着他的面拒绝他。第 1、2 节把这条钉死 ——
 *    列表来源只认心跳/写入历史两种，读不懂就照实说「不知道」，
 *    **绝不回退成「随便哪个目录都行」**；界面上一个能打字的框都不许有。
 *
 * 2. **一张照片要么完整落地，要么一片都不落。** 半张照片顶着正确的文件名躺在别人
 *    电脑上，比发送失败糟糕得多 —— 用户会以为它是完整的。第 3、4 节验切片形状
 *    （按序、偏移连续、拼回去逐字节相同）与送达纪律（严格串行、串 `after_task_id`、
 *    中途失败当场停手不再发后面的片）。
 *
 * 3. **失败要说人话。** 「这台电脑离线」「这个文件夹没授权」「这张照片太大」是三件
 *    完全不同的事，用户要做的动作也完全不同，收成一句「发送失败」等于什么都没说。
 *
 * 第 6 节是反向断言：**普通浏览器里这个组件一个字节的 DOM 都不产**。
 * 一个在浏览器里渲染出来的「发送到这台电脑」，承诺的正是浏览器做不到的那件事。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

/* ------------------------------------------------------------------ *
 * jsdom（经 fabric 传递依赖拿到，本仓没有直接装）
 * ------------------------------------------------------------------ */

const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://chat.oceanleo.com/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLSelectElement: window.HTMLSelectElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

/* ------------------------------------------------------------------ *
 * 编译台
 *
 * 只桩三样：登录令牌、网关地址、`W06` 的原生桥。桥要桩是因为「宿主是不是原生」
 * 正是本文件第 6 节要来回切换的那个开关，而桥本身的行为由 `mobile-bridge.test.mjs`
 * 守着。**送达那条链编的是真源码**，包括 `local-task-client` 的路径拼接与错误类。
 * ------------------------------------------------------------------ */

const STUBS = {
  "../lib/auth/client": dataModule(
    `export async function accessToken(){ return "w07-test-token"; }`,
  ),
  "../lib/auth/config": dataModule(
    `export const GATEWAY_BASE = "https://gateway.test";`,
  ),
  "./mobile-bridge": dataModule(`
    export function detectNativeHost(){ return globalThis.__W07_HOST__ ?? null; }
    export function pickNativeMedia(){
      return Promise.resolve(globalThis.__W07_MEDIA__ ?? null);
    }
  `),
  // 真 `useUI()` 要 next-intl 的 provider 才拿得到 locale，而这份测试是直接挂组件的。
  // 桩只做查表（`tt` 在送达这一层的合同就只有查表），**故意不做插值** ——
  // 占位符要是靠调用方的 `tt` 去填，`发送到{device}` 就会漏到用户脸上。
  // 词典由 `__W07_DICT__` 拨动：不设就是中文原文，设成 `UI_MESSAGES.ja` 就是日语用户看到的那一屏。
  "../i18n/ui/useUI": dataModule(`
    export function useUI(){
      return (zh) => {
        const dictionary = globalThis.__W07_DICT__;
        const hit = dictionary ? dictionary[zh] : undefined;
        return hit == null || hit === "" ? zh : hit;
      };
    }
  `),
};

const handoff = await import(
  await compileModule("src/shell/mobile-file-handoff.ts", STUBS)
);
const { LocalFileHandoffLauncher } = await import(
  await compileModule("src/shell/LocalTaskLauncher.tsx", STUBS)
);

const {
  HANDOFF_MAX_PART_B64_CHARS,
  HANDOFF_MAX_PARTS,
  HANDOFF_MAX_TOTAL_BYTES,
  HANDOFF_PART_BYTES,
  base64ByteLength,
  bytesToBase64,
  canHandOffFiles,
  formatBytes,
  handoffFailureMessage,
  handoffFileName,
  handoffFolderNote,
  handoffOfflineNotice,
  handoffProgressText,
  handoffSendLabel,
  handoffSuccessText,
  handoffTargetPath,
  parseHandoffFolders,
  planFileHandoff,
  sendFileHandoff,
} = handoff;

const LAUNCHER_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/shell/LocalTaskLauncher.tsx", import.meta.url)),
  "utf8",
);

/** `LocalFileHandoffLauncher` 那一段源码（不含同文件里别人的 `LocalTaskLauncher`）。 */
const HANDOFF_COMPONENT_SOURCE = LAUNCHER_SOURCE.slice(
  LAUNCHER_SOURCE.indexOf("export function LocalFileHandoffLauncher"),
  LAUNCHER_SOURCE.indexOf("export function LocalTaskLauncher<K"),
);

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

function mediaOf(size, name = "IMG_0421.jpg") {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) bytes[index] = (index * 31) % 256;
  return { name, mime: "image/jpeg", bytes };
}

function planOf(size, folder = "D:\\工作\\发票", options = {}) {
  const plan = planFileHandoff({ media: mediaOf(size), folder, ...options });
  assert.equal(plan.ok, true, `planFileHandoff 意外拒绝：${plan.message}`);
  return plan;
}

async function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(LocalFileHandoffLauncher, props));
  });
  return {
    container,
    async click(node) {
      await act(async () => {
        node.dispatchEvent(
          new window.MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function installNativeHost() {
  globalThis.__W07_HOST__ = { platform: "ios" };
}

function clearNativeHost() {
  delete globalThis.__W07_HOST__;
  delete globalThis.__W07_MEDIA__;
}

/* ================================================================== *
 * 第 1 节 · 落点只来自那台电脑自己报的目录
 * ================================================================== */

test("心跳报上来的目录就是落点列表，来源标成 heartbeat", () => {
  const parsed = parseHandoffFolders({
    device_id: "d1",
    granted_roots: ["D:\\工作\\发票", "D:\\照片"],
    granted_roots_source: "heartbeat",
    granted_roots_reported_at: "2026-08-21T09:00:00Z",
  });
  assert.deepEqual(parsed.folders, ["D:\\工作\\发票", "D:\\照片"]);
  assert.equal(parsed.source, "heartbeat");
  assert.equal(parsed.reportedAt, "2026-08-21T09:00:00Z");
});

test("客户端太旧报不了目录时退到写入历史，并且照实标成 history", () => {
  const parsed = parseHandoffFolders({
    grantedRoots: ["/Users/me/Downloads"],
    grantedRootsSource: "history",
  });
  assert.deepEqual(parsed.folders, ["/Users/me/Downloads"]);
  assert.equal(parsed.source, "history");
  // 「以前写进去过」这件事要在界面上说出来，它只会比真列表少、不会多。
  const note = handoffFolderNote(parsed, "书房台式机");
  assert.match(note, /以前成功写入过/);
  assert.match(note, /先在那台电脑上授权/);
});

test("空的写入历史不是答案而是不知道；空的心跳上报才是答案", () => {
  // 一份空的历史只说明它没写过东西，不说明它没授权过文件夹。
  const emptyHistory = parseHandoffFolders({
    granted_roots: [],
    granted_roots_source: "history",
  });
  assert.equal(emptyHistory.source, "none");
  assert.match(handoffFolderNote(emptyHistory, "书房台式机"), /还没上报/);

  // 而心跳说「我一个都没授权」是一句确定的话，要给出确定的下一步。
  const emptyHeartbeat = parseHandoffFolders({
    granted_roots: [],
    granted_roots_source: "heartbeat",
  });
  assert.equal(emptyHeartbeat.source, "heartbeat");
  assert.match(
    handoffFolderNote(emptyHeartbeat, "书房台式机"),
    /还没有授权任何文件夹/,
  );
  assert.notEqual(
    handoffFolderNote(emptyHistory, "书房台式机"),
    handoffFolderNote(emptyHeartbeat, "书房台式机"),
  );
});

test("读不懂的设备行一律当「不知道」，绝不回退成「随便哪个目录都行」", () => {
  for (const garbage of [
    null,
    undefined,
    "D:\\",
    42,
    [],
    { granted_roots: "D:\\工作" },
    { granted_roots: [1, 2, ""], granted_roots_source: "wildcard" },
    { granted_roots: null, granted_roots_source: "heartbeat" },
  ]) {
    const parsed = parseHandoffFolders(garbage);
    assert.deepEqual(parsed.folders, [], `脏数据 ${JSON.stringify(garbage)} 出了落点`);
    assert.equal(parsed.source, "none");
    // 自称 heartbeat 却不给列表时，不许对用户说「这台电脑一个文件夹都没授权」——
    // 那是一句我们没有资格下的断言，事实只是我们没读懂那一栏。
    assert.match(handoffFolderNote(parsed, "书房台式机"), /还没上报/);
  }
});

test("没有任何落点时，那句解释里不许出现「自己输入路径」这类出口", () => {
  const note = handoffFolderNote({ folders: [], source: "none" }, "书房台式机");
  assert.doesNotMatch(note, /输入|手动填|粘贴|自己填/);
  assert.match(note, /先在那台电脑上授权/);
});

/* ================================================================== *
 * 第 2 节 · 界面上没有手敲路径的口子（`V2` 会查这条）
 * ================================================================== */

test("送达组件里没有任何可以打字的控件", () => {
  for (const forbidden of ["<input", "<textarea", "contentEditable", "contenteditable"]) {
    assert.equal(
      HANDOFF_COMPONENT_SOURCE.includes(forbidden),
      false,
      `送达组件里出现了 ${forbidden}：落点一旦能手敲就等于绕过授权`,
    );
  }
});

test("渲染出来的落点只有上报的那几个，一个输入框都没有", async () => {
  installNativeHost();
  const folders = ["D:\\工作\\发票", "D:\\照片\\2026"];
  const view = await mount({
    deviceId: "device-1",
    deviceName: "书房台式机",
    folders: { folders, source: "heartbeat" },
  });
  try {
    assert.equal(view.container.querySelectorAll("input").length, 0);
    assert.equal(view.container.querySelectorAll("textarea").length, 0);
    const select = view.container.querySelector("select[data-file-handoff-folder]");
    assert.ok(select, "落点应当是一个只能从上报列表里选的下拉框");
    assert.deepEqual(
      [...select.querySelectorAll("option")].map((option) => option.value),
      folders,
      "下拉框里出现了上报列表之外的落点",
    );
  } finally {
    await view.unmount();
    clearNativeHost();
  }
});

test("一个落点都没上报时按钮点不动，且界面照实说原因", async () => {
  installNativeHost();
  const view = await mount({
    deviceId: "device-1",
    deviceName: "书房台式机",
    folders: { folders: [], source: "none" },
  });
  try {
    assert.equal(view.container.querySelectorAll("select").length, 0);
    assert.equal(view.container.querySelectorAll("input").length, 0);
    const button = view.container.querySelector("button");
    assert.ok(button);
    assert.equal(button.disabled, true, "没有落点却让人点得动，只会换来一次必然的拒绝");
    assert.match(
      view.container.querySelector("[data-file-handoff-note]").textContent,
      /还没上报/,
    );
  } finally {
    await view.unmount();
    clearNativeHost();
  }
});

test("相册给的文件名只能当名字用，带路径或 .. 都走不出授权目录", () => {
  assert.equal(handoffFileName("../../etc/passwd"), "passwd");
  assert.equal(handoffFileName("C:\\Windows\\System32\\drivers\\etc\\hosts"), "hosts");
  assert.equal(handoffFileName(".."), "手机文件");
  assert.equal(handoffFileName(""), "手机文件");
  assert.equal(handoffFileName("a".repeat(400)).length, 120);

  // 落点仍然落在用户选中的那个授权目录里面。
  assert.equal(
    handoffTargetPath("D:\\工作\\发票", "..\\..\\Windows\\evil.exe"),
    "D:\\工作\\发票\\evil.exe",
  );
  assert.equal(
    handoffTargetPath("/Users/me/Downloads/", "../../.ssh/id_rsa"),
    "/Users/me/Downloads/id_rsa",
  );
});

/* ================================================================== *
 * 第 3 节 · 切片形状
 * ================================================================== */

test("小文件一片直发，载荷里不带任何分片字段", () => {
  const plan = planOf(4096);
  assert.equal(plan.partCount, 1);
  assert.deepEqual(plan.parts, []);
  // 网关对 `file.write` 只认 path / content_b64，多一个字段就是另一种任务形状。
  assert.deepEqual(Object.keys(plan.single).sort(), ["content_b64", "path"]);
  assert.equal(plan.path, "D:\\工作\\发票\\IMG_0421.jpg");
});

test("大文件按序切片：序号连续、偏移连续、每片都在网关的一片上限之内", () => {
  const size = HANDOFF_PART_BYTES * 2 + 12345;
  const plan = planOf(size);
  assert.equal(plan.partCount, 3);
  assert.equal(plan.parts.length, 3);
  assert.equal(plan.single, undefined);

  let expectedOffset = 0;
  plan.parts.forEach((part, index) => {
    assert.equal(part.part_index, index + 1);
    assert.equal(part.part_count, 3);
    assert.equal(part.bytes_before, expectedOffset, "偏移一旦断开，网关那条对账就会停");
    assert.ok(
      part.content_b64.length <= HANDOFF_MAX_PART_B64_CHARS,
      `第 ${part.part_index} 片有 ${part.content_b64.length} 个 base64 字符，超过网关上限`,
    );
    assert.equal(part.path, plan.path, "所有片必须写同一个路径");
    expectedOffset += base64ByteLength(part.content_b64);
  });
  assert.equal(expectedOffset, size);
});

test("切开再拼回去，与原文件逐字节相同", () => {
  const media = mediaOf(HANDOFF_PART_BYTES + 1000);
  const plan = planFileHandoff({ media, folder: "/srv/inbox" });
  const rejoined = Buffer.concat(
    plan.parts.map((part) => Buffer.from(part.content_b64, "base64")),
  );
  assert.equal(rejoined.length, media.bytes.length);
  assert.ok(rejoined.equals(Buffer.from(media.bytes)), "拼回来的字节与原文件不一致");
});

test("非分片片段的 base64 是无填充的整块，两边算出的「一片多大」是同一个数", () => {
  const plan = planOf(HANDOFF_PART_BYTES * 2);
  for (const part of plan.parts) {
    assert.equal(part.content_b64.includes("="), false, "整片不该带填充符");
    assert.equal(part.content_b64.length, HANDOFF_MAX_PART_B64_CHARS);
    assert.equal(base64ByteLength(part.content_b64), HANDOFF_PART_BYTES);
  }
});

test("超过上限的文件在用户开始等待之前就被挡下，并说清上限是多少", () => {
  const refusal = planFileHandoff({
    media: mediaOf(HANDOFF_MAX_TOTAL_BYTES + 1, "录像.mp4"),
    folder: "D:\\工作",
  });
  assert.equal(refusal.ok, false);
  assert.equal(refusal.reason, "too_large");
  assert.match(refusal.message, /一次最多只能发 \d+ MB/);
  assert.equal(HANDOFF_MAX_TOTAL_BYTES, HANDOFF_PART_BYTES * HANDOFF_MAX_PARTS);
});

test("空文件、没选落点，各自给一句具体的话而不是一句「失败」", () => {
  const empty = planFileHandoff({
    media: { name: "空.txt", bytes: new Uint8Array(0) },
    folder: "D:\\工作",
  });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, "empty_file");

  const noFolder = planFileHandoff({ media: mediaOf(16), folder: "" });
  assert.equal(noFolder.ok, false);
  assert.equal(noFolder.reason, "no_folder");
  assert.notEqual(empty.message, noFolder.message);
});

test("那台电脑离线时，多片文件当场说清楚，不留半个文件在它硬盘上", () => {
  const refusal = planFileHandoff({
    media: mediaOf(HANDOFF_PART_BYTES * 2),
    folder: "D:\\工作",
    deviceName: "书房台式机",
    deviceOnline: false,
  });
  assert.equal(refusal.ok, false);
  assert.equal(refusal.reason, "offline_multipart");
  assert.match(refusal.message, /书房台式机现在离线/);
  assert.match(refusal.message, /等它上线再发/);

  // 单片的小文件照旧允许排队 —— 它落地是原子的，不会留下半个文件。
  const small = planFileHandoff({
    media: mediaOf(2048),
    folder: "D:\\工作",
    deviceOnline: false,
  });
  assert.equal(small.ok, true);
  assert.equal(small.partCount, 1);
});

test("手机上算出来的一片上限与网关的 MAX_FILE_WRITE_B64_CHARS 相等", (t) => {
  const gateway = fileURLToPath(
    new URL(
      "../../oceanleo/backend/app/routers/device_tasks_router.py",
      import.meta.url,
    ),
  );
  if (!existsSync(gateway)) {
    t.skip(`网关源码不在这台机器上（${gateway}），这条只在同时有两个仓时才判`);
    return;
  }
  const source = readFileSync(gateway, "utf8");
  const chars = /^MAX_FILE_WRITE_B64_CHARS = (.+)$/m.exec(source);
  const parts = /^MAX_HANDOFF_PARTS = (\d+)/m.exec(source);
  assert.ok(chars && parts, "网关的两个上限常量改名了，手机侧的切片会跟着切错");
  // 常量写成 `1024 * 1024` 这类算式，按乘法算出来比较。
  const evaluate = (text) =>
    text
      .split("#")[0]
      .split("*")
      .map((piece) => Number(piece.trim()))
      .reduce((left, right) => left * right, 1);
  assert.equal(
    HANDOFF_MAX_PART_B64_CHARS,
    evaluate(chars[1]),
    "一片切大了会被网关整片拒掉，白白花掉用户每小时的下单额度",
  );
  assert.equal(HANDOFF_MAX_PARTS, Number(parts[1]));
});

/* ================================================================== *
 * 第 4 节 · 送达纪律
 * ================================================================== */

/** 记录每一次「下发」与「等待落地」的调用台，用来验严格串行与串链。 */
function createDeliveryBench({ outcomes = {}, offline = false } = {}) {
  const log = [];
  const created = [];
  let sequence = 0;
  return {
    log,
    created,
    createPart: async (deviceId, payload, afterTaskId) => {
      sequence += 1;
      const taskId = `task-${sequence}`;
      created.push({ deviceId, payload, afterTaskId, taskId });
      log.push(`create:${payload.part_index ?? "single"}:after=${afterTaskId ?? "null"}`);
      return { taskId, offline };
    },
    awaitPart: async (taskId) => {
      log.push(`landed:${taskId}`);
      const index = Number(taskId.split("-")[1]);
      return (
        outcomes[index] ?? {
          status: "succeeded",
          resultSummary: { bytes: index * HANDOFF_PART_BYTES },
        }
      );
    },
  };
}

test("多片严格按序送：下一片必须等上一片真的落地，并报出上一片的任务号", async () => {
  const plan = planOf(HANDOFF_PART_BYTES * 2 + 500);
  const bench = createDeliveryBench();
  const progress = [];
  const result = await sendFileHandoff({
    deviceId: "device-1",
    deviceName: "书房台式机",
    plan,
    onProgress: (value) => progress.push({ ...value }),
    createPart: bench.createPart,
    awaitPart: bench.awaitPart,
  });

  assert.equal(result.ok, true);
  assert.equal(result.queued, false);
  // 严格串行：create → landed → create → landed …，绝不并发发出去。
  assert.deepEqual(bench.log, [
    "create:1:after=null",
    "landed:task-1",
    "create:2:after=task-1",
    "landed:task-2",
    "create:3:after=task-2",
    "landed:task-3",
  ]);
  assert.deepEqual(
    bench.created.map((call) => call.afterTaskId),
    [null, "task-1", "task-2"],
    "顺序由客户端自己声明就等于让有 bug 的客户端随便跳片",
  );
  assert.deepEqual(
    bench.created.map((call) => call.payload.part_index),
    [1, 2, 3],
  );
  assert.equal(progress.at(-1).phase, "done");
  assert.equal(progress.at(-1).sentParts, 3);
  // 每片报两次（发之前、落地之后），所以是 0,1,1,2,2,3 —— 允许重复，不许回退。
  const sent = progress.map((value) => value.sentParts);
  assert.deepEqual(sent, [0, 1, 1, 2, 2, 3]);
  for (let index = 1; index < sent.length; index += 1) {
    assert.ok(sent[index] >= sent[index - 1], `进度回退了：${sent.join(",")}`);
  }
});

test("中途被拒就当场停手，后面的片一片都不发", async () => {
  const plan = planOf(HANDOFF_PART_BYTES * 2 + 500);
  const bench = createDeliveryBench({
    outcomes: { 2: { status: "denied", denyReason: "path_outside_grant" } },
  });
  const result = await sendFileHandoff({
    deviceId: "device-1",
    deviceName: "书房台式机",
    plan,
    createPart: bench.createPart,
    awaitPart: bench.awaitPart,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "path_outside_grant");
  assert.equal(bench.created.length, 2, "第 2 片被拒之后不该再下发第 3 片");
  assert.equal(result.landedParts, 1);
  assert.equal(result.totalParts, 3);
  // 用户必须知道那台电脑上现在躺着一个不完整的文件，以及重发会怎么处理它。
  assert.match(result.message, /不完整的文件/);
  assert.match(result.message, /重发会从头覆盖/);
  assert.match(result.message, /不在书房台式机已授权的范围内/);
});

test("送达结果只带路径和字节数，回执里的任何多余内容都不往上带", async () => {
  const plan = planOf(4096);
  const result = await sendFileHandoff({
    deviceId: "device-1",
    plan,
    createPart: async () => ({ taskId: "task-1", offline: false }),
    // 就算网关哪天多回了点东西，也不许顺着这条路流回界面。
    awaitPart: async () => ({
      status: "succeeded",
      resultSummary: {
        bytes: 4096,
        stdout_tail: "机密内容",
        content_b64: "c2VjcmV0",
      },
    }),
  });
  assert.deepEqual(Object.keys(result).sort(), ["bytes", "ok", "path", "queued"]);
  assert.equal(JSON.stringify(result).includes("机密内容"), false);
  assert.equal(JSON.stringify(result).includes("c2VjcmV0"), false);
});

test("那台电脑离线时单片排队，界面说「已排队」而不是「已落到」", async () => {
  const plan = planOf(2048);
  const progress = [];
  const result = await sendFileHandoff({
    deviceId: "device-1",
    deviceName: "书房台式机",
    deviceOnline: false,
    plan,
    onProgress: (value) => progress.push({ ...value }),
    createPart: async () => ({ taskId: "task-1", offline: true }),
    awaitPart: async () => {
      throw new Error("离线排队时不该去等落地");
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.queued, true);
  assert.equal(progress.at(-1).phase, "queued");
  const text = handoffSuccessText(result, "书房台式机");
  assert.match(text, /已排队/);
  assert.doesNotMatch(text, /已落到/);
  assert.match(handoffProgressText(progress.at(-1), "书房台式机"), /等书房台式机上线/);
});

test("下发时断网，说清这一片没送出去，并数清已经落了几片", async () => {
  const plan = planOf(HANDOFF_PART_BYTES * 2 + 500);
  let calls = 0;
  const result = await sendFileHandoff({
    deviceId: "device-1",
    deviceName: "书房台式机",
    plan,
    createPart: async () => {
      calls += 1;
      if (calls === 2) throw new Error("socket hang up");
      return { taskId: `task-${calls}`, offline: false };
    },
    awaitPart: async () => ({ status: "succeeded", resultSummary: { bytes: 100 } }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "network_error");
  assert.equal(result.landedParts, 1);
  assert.match(result.message, /网络断了/);
});

test("单片时进度条不报「1/1 片」", () => {
  const single = handoffProgressText(
    { sentParts: 0, totalParts: 1, bytesLanded: 0, totalBytes: 10, phase: "sending" },
    "书房台式机",
  );
  assert.doesNotMatch(single, /1\/1/);
  assert.match(single, /正在发送到书房台式机/);
  assert.match(
    handoffProgressText(
      { sentParts: 2, totalParts: 5, bytesLanded: 0, totalBytes: 10, phase: "sending" },
      "书房台式机",
    ),
    /3\/5 片/,
  );
});

/* ================================================================== *
 * 第 5 节 · 三种失败各是一句人话，且互不相同
 * ================================================================== */

test("离线、未授权、超限是三件不同的事，文案不许收成同一句", () => {
  const offline = handoffFailureMessage("device_offline", "书房台式机");
  const denied = handoffFailureMessage("path_outside_grant", "书房台式机");
  const tooLarge = handoffFailureMessage("payload_too_large", "书房台式机", {
    limit: HANDOFF_MAX_PART_B64_CHARS,
  });
  const messages = [offline, denied, tooLarge];
  assert.equal(new Set(messages).size, 3);

  // 每一句都要说清用户现在该做什么。
  assert.match(offline, /等它上线/);
  assert.match(denied, /换一个落点|在那台电脑上授权/);
  assert.match(tooLarge, /太大/);

  for (const message of messages) {
    assert.doesNotMatch(message, /[a-z_]{6,}/, `文案里漏出了错误码原文：${message}`);
    assert.ok(message.length > 8, `太短，等于没说：${message}`);
  }
});

test("片对不上号时说明「不会留下一个错乱的文件」，三个码收敛到同一句", () => {
  const codes = [
    "handoff_part_out_of_order",
    "handoff_part_not_landed",
    "handoff_offset_mismatch",
  ];
  const messages = codes.map((code) => handoffFailureMessage(code, "书房台式机"));
  assert.equal(new Set(messages).size, 1, "这三件事对用户是同一件事，说法要一致");
  assert.match(messages[0], /不会留下一个错乱的文件/);
  assert.match(messages[0], /请重新发一次/);
});

test("没授权写入、过期、被取消，各自说清下一步", () => {
  assert.match(handoffFailureMessage("grant_missing", "书房台式机"), /写入与新建文件/);
  assert.match(handoffFailureMessage("expired", "书房台式机"), /24 小时/);
  assert.match(handoffFailureMessage("cancelled", "书房台式机"), /没有写到/);
  assert.match(handoffFailureMessage("unauthorized", "书房台式机"), /登录/);
});

/* ================================================================== *
 * 第 6 节 · 浏览器里这件事根本不存在
 * ================================================================== */

test("没有原生宿主时，送达入口一个字节的 DOM 都不产", async () => {
  clearNativeHost();
  assert.equal(canHandOffFiles(), false);
  const view = await mount({
    deviceId: "device-1",
    deviceName: "书房台式机",
    folders: { folders: ["D:\\工作\\发票"], source: "heartbeat" },
  });
  try {
    assert.equal(
      view.container.innerHTML,
      "",
      "浏览器里出现「发送到这台电脑」，承诺的正是浏览器做不到的那件事",
    );
  } finally {
    await view.unmount();
  }
});

test("原生宿主里入口出现，且服务端渲染那一遍与浏览器一致（判定放在挂载之后）", () => {
  // `canHandOffFiles()` 的判定写在 effect 里，首帧一定是 null —— 否则会水合不一致。
  assert.match(HANDOFF_COMPONENT_SOURCE, /useEffect\(\(\) => \{\s*setNative\(canHandOffFiles\(\)\);/);
  assert.match(HANDOFF_COMPONENT_SOURCE, /if \(!native\) return null;/);
});

test("还没连过电脑时，只给一条去连接的路，不给输入框", async () => {
  installNativeHost();
  const view = await mount({
    deviceId: null,
    folders: { folders: [], source: "none" },
  });
  try {
    assert.equal(
      view.container.querySelector("[data-file-handoff]").dataset.fileHandoff,
      "no-device",
    );
    assert.equal(view.container.querySelectorAll("input").length, 0);
    assert.ok(view.container.querySelector("a[href='/devices']"));
  } finally {
    await view.unmount();
    clearNativeHost();
  }
});

test("用户自己退出选择器不是错误，界面上不冒红字", async () => {
  installNativeHost();
  globalThis.__W07_MEDIA__ = null;
  const view = await mount({
    deviceId: "device-1",
    deviceName: "书房台式机",
    folders: { folders: ["D:\\工作\\发票"], source: "heartbeat" },
  });
  try {
    await view.click(view.container.querySelector("button"));
    assert.equal(view.container.querySelector("[data-file-handoff-error]"), null);
    assert.equal(view.container.querySelector("[role='alert']"), null);
  } finally {
    await view.unmount();
    clearNativeHost();
  }
});

test("挑了一个太大的文件，界面在发出任何请求之前就说清楚", async () => {
  installNativeHost();
  globalThis.__W07_MEDIA__ = mediaOf(HANDOFF_MAX_TOTAL_BYTES + 1, "录像.mp4");
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error("超限的文件不该发出任何请求");
  };
  const view = await mount({
    deviceId: "device-1",
    deviceName: "书房台式机",
    folders: { folders: ["D:\\工作\\发票"], source: "heartbeat" },
  });
  try {
    await view.click(view.container.querySelector("button"));
    const error = view.container.querySelector("[data-file-handoff-error]");
    assert.ok(error, "超限了却什么都不说，用户只会以为按钮坏了");
    assert.match(error.textContent, /一次最多只能发 \d+ MB/);
    assert.equal(requests, 0, "白花一次下单额度去换一个必然的拒绝");
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
    clearNativeHost();
  }
});

test("离线时界面提前说清小文件会排队、大文件要等它上线", async () => {
  installNativeHost();
  const view = await mount({
    deviceId: "device-1",
    deviceName: "书房台式机",
    deviceOnline: false,
    folders: { folders: ["D:\\工作\\发票"], source: "heartbeat" },
  });
  try {
    assert.equal(
      view.container.querySelector("[data-file-handoff]").dataset.fileHandoff,
      "offline",
    );
    assert.match(view.container.textContent, /小文件会排队/);
    assert.match(view.container.textContent, /大文件要分几次送/);
  } finally {
    await view.unmount();
    clearNativeHost();
  }
});

/* ================================================================== *
 * 第 7 节 · 13 种非 CJK 语言下这一屏没有一个汉字
 *
 * 手机壳打开的就是这个网站。日语用户点开「发送到电脑」看到一屏中文，等于这一屏
 * 只做给中文用户 —— 而这一屏正是手机端存在的理由。
 *
 * 这一节不是「抽查几句」：**先把源码里的中文句子逐条数出来**，再要求每一条在 17
 * 份词典里都有。以后谁在这两份文件里新写一句中文而忘了补词典，这一节当场判红 ——
 * 漏译不会再靠人眼发现。
 * ================================================================== */

const LOCALES = [
  "ar", "de", "en", "es", "es-419", "fr", "hi", "it", "ja",
  "ko", "pt-BR", "pt-PT", "th", "tr", "vi", "zh", "zh-TW",
];

/** 会写汉字的四种语言。剩下 13 种里出现汉字就是漏译。 */
const CJK_LOCALES = new Set(["zh", "zh-TW", "ja", "ko"]);
const NON_CJK_LOCALES = LOCALES.filter((locale) => !CJK_LOCALES.has(locale));

/** 汉字与中日韩标点、全角符号。 */
const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\u3000-\u303F\uFF01-\uFF60]/;

const DICTIONARIES = Object.fromEntries(
  await Promise.all(
    LOCALES.map(async (locale) => [
      locale,
      (await import(await compileModule(`src/i18n/ui/messages/${locale}.ts`))).default,
    ]),
  ),
);

/** 词典查表，形状与 `useUI()` 的 `tt` 相同：未命中回退中文原文。 */
function translatorFor(locale) {
  const dictionary = DICTIONARIES[locale];
  return (zh) => {
    const hit = dictionary[zh];
    return hit == null || hit === "" ? zh : hit;
  };
}

const PLACEHOLDERS = /\{\w+\}/g;

const copyTable = await import(await compileModule("src/api/device-error-copy.ts"));

/**
 * 协议 §7 那张码表里**唯一**不必进词典的句子。
 *
 * 它不是失败文案，是桌面 `LocalTaskLauncher` 直接当常量渲染的输入提示；那个读取方
 * 不在手机送达链上，本轮明令它的既有行为逐字不变，所以它此刻仍是中文。
 * 例外写成一份具名清单而不是一个洞：谁在这张表里再写一句不走 `tt()` 的中文，
 * 下面那条断言当场判红。
 */
const DEVICE_ERROR_COPY_EXEMPT = [copyTable.SHELL_COMMAND_SHAPE_HINT];

/**
 * 这一屏的源码里所有中文字面量：`mobile-file-handoff.ts` 全份 + 送达组件那一段 +
 * 协议 §7 那张码表（额度、撤销、真机拒绝这些码从 `handoffFailureBase()` 的
 * `default:` 落进它，所以它也是这一屏用户看得见的字）。
 */
function chineseLiterals() {
  const found = new Set();
  const files = [
    ["src/shell/mobile-file-handoff.ts", readFileSync(
      fileURLToPath(new URL("../src/shell/mobile-file-handoff.ts", import.meta.url)),
      "utf8",
    )],
    ["LocalFileHandoffLauncher.tsx", HANDOFF_COMPONENT_SOURCE],
    ["src/api/device-error-copy.ts", readFileSync(
      fileURLToPath(new URL("../src/api/device-error-copy.ts", import.meta.url)),
      "utf8",
    )],
  ];
  for (const [name, text] of files) {
    const source = ts.createSourceFile(
      name,
      text,
      ts.ScriptTarget.Latest,
      true,
      name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node) => {
      const literal =
        ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
      if (literal && HAN.test(node.text)) found.add(node.text);
      if (ts.isJsxText(node) && HAN.test(node.text)) found.add(node.text.trim());
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);
  }
  return [...found];
}

test("这一屏源码里的每一句中文，17 份词典都有它，占位符一个不差", () => {
  const all = chineseLiterals();
  // 反向保险：谁把 tt() 整片删掉、或者这份提取失效，这一节不许因为「没找到句子」而变绿。
  assert.ok(
    all.length >= 53,
    `只数出 ${all.length} 句中文，提取多半失效了（预期 53 句以上）`,
  );
  for (const sentence of [
    "发送到{device}",
    "落点文件夹",
    "已送达。",
    // 协议 §7 那张表里的三句，各代表一类：设备名嵌在句中、上限来自后端、兜底句。
    "{device}已被撤销，需要在那台电脑上重新配对。",
    "还有{limit}个任务没跑完，等它们结束再下单。",
    "这一步没有完成，请稍后重试。",
  ]) {
    assert.ok(all.includes(sentence), `没数到已知的那一句：${sentence}`);
  }
  for (const exempt of DEVICE_ERROR_COPY_EXEMPT) {
    assert.ok(all.includes(exempt), `具名例外已经不在源码里了，这份清单该更新：${exempt}`);
  }
  const literals = all.filter((zh) => !DEVICE_ERROR_COPY_EXEMPT.includes(zh));

  const missing = [];
  for (const locale of LOCALES) {
    const dictionary = DICTIONARIES[locale];
    for (const zh of literals) {
      const translated = dictionary[zh];
      if (translated == null || translated === "") {
        missing.push(`${locale}: ${zh}`);
        continue;
      }
      // 占位符靠 `fill()` 填，不靠 `tt`：译文里少一个 `{device}`，用户看到的就是
      // 一句没有电脑名字的话；多一个不认识的，就会有 `{foo}` 直接漏到脸上。
      const want = (zh.match(PLACEHOLDERS) ?? []).slice().sort();
      const got = (translated.match(PLACEHOLDERS) ?? []).slice().sort();
      assert.deepEqual(got, want, `${locale} 占位符不符：${translated}`);
      if (!CJK_LOCALES.has(locale)) {
        assert.ok(
          !HAN.test(translated),
          `${locale} 的译文里还有汉字：${translated}`,
        );
      }
    }
  }
  assert.deepEqual(missing, [], `这些句子在词典里没有译文：\n${missing.join("\n")}`);
});

test("13 种非 CJK 语言下，落点说明、按钮、进度、回执、失败各句都不含汉字", () => {
  const handoffCodes = [
    "grant_missing",
    "path_outside_grant",
    "device_offline",
    "payload_too_large",
    "handoff_part_out_of_order",
    "handoff_part_not_landed",
    "handoff_offset_mismatch",
    "network_error",
    "unauthorized",
    "failed",
    "expired",
    "cancelled",
  ];
  const device = "Studio PC";

  for (const locale of NON_CJK_LOCALES) {
    const tt = translatorFor(locale);
    const sentences = [
      handoffFolderNote({ folders: [], source: "heartbeat" }, device, tt),
      handoffFolderNote({ folders: [], source: "none" }, device, tt),
      handoffFolderNote({ folders: ["/srv/in"], source: "history" }, device, tt),
      handoffFolderNote({ folders: ["/srv/in"], source: "heartbeat" }, device, tt),
      handoffSendLabel(device, tt),
      handoffSendLabel("", tt),
      handoffOfflineNotice(device, tt),
      handoffProgressText({ phase: "queued", sentParts: 0, totalParts: 1 }, device, tt),
      handoffProgressText({ phase: "sending", sentParts: 0, totalParts: 1 }, device, tt),
      handoffProgressText({ phase: "sending", sentParts: 2, totalParts: 5 }, device, tt),
      handoffProgressText({ phase: "done", sentParts: 1, totalParts: 1 }, device, tt),
      handoffSuccessText({ ok: true, path: "/srv/in/a.jpg", queued: false }, device, tt),
      handoffSuccessText({ ok: true, path: "/srv/in/a.jpg", queued: true }, device, tt),
      handoffFileName("", "", tt),
      formatBytes(900, tt),
      planFileHandoff({
        media: { name: "a.jpg", mime: "image/jpeg", bytes: new Uint8Array(0) },
        folder: "/srv/in",
        deviceName: device,
        tt,
      }).message,
      planFileHandoff({
        media: mediaOf(3),
        folder: "",
        deviceName: device,
        tt,
      }).message,
      ...handoffCodes.map((code) =>
        handoffFailureMessage(
          code,
          device,
          { limit: HANDOFF_MAX_PART_B64_CHARS, landedParts: 2, totalParts: 5 },
          tt,
        ),
      ),
    ];
    for (const sentence of sentences) {
      assert.ok(sentence, `${locale}: 出了一句空话`);
      assert.ok(!HAN.test(sentence), `${locale} 这一屏还有汉字：${sentence}`);
      assert.doesNotMatch(
        sentence,
        /\{\w+\}/,
        `${locale}: 占位符没被填上，漏到用户脸上了：${sentence}`,
      );
    }
  }
});

test("协议 §7 那 19 个码走到这一屏也不是中文了，未知码同样", () => {
  // 这些码（额度、撤销、真机拒绝、路径越权……）不在上面那张表里，它们从
  // `handoffFailureBase()` 的 `default:` 落进 `api/device-error-copy.ts`。
  // 手机送达失败时用户看见的正是这些句子，所以它们也得逐个过 13 种非 CJK 语言。
  assert.equal(copyTable.DEVICE_ERROR_CODES.length, 19);
  const device = "Studio PC";
  // 这三个码这一屏自己有更贴切的说法（说的是「收文件」这件事，不是泛指的操作），
  // 所以它们不落到那张表上；其余 16 个必须逐字等于契约那句。
  const screenOwned = new Set(["device_offline", "grant_missing", "path_outside_grant"]);

  for (const locale of NON_CJK_LOCALES) {
    const tt = translatorFor(locale);
    for (const code of [...copyTable.DEVICE_ERROR_CODES, "internal_server_error", "HTTP 500"]) {
      // 带上限与不带上限是两句不同的话（契约 §1.2b），两句都得有译文。
      for (const limit of [undefined, 7]) {
        const viaTable = copyTable.deviceErrorCopy(code, { deviceName: device, limit, tt });
        const onScreen = handoffFailureMessage(code, device, { limit }, tt);
        for (const [where, sentence] of [["表", viaTable], ["这一屏", onScreen]]) {
          assert.ok(sentence, `${locale} ${code}：${where}出了一句空话`);
          assert.ok(!HAN.test(sentence), `${locale} ${code} ${where}里还有汉字：${sentence}`);
          assert.doesNotMatch(
            sentence,
            /\{\w+\}/,
            `${locale} ${code}：占位符漏到用户脸上了：${sentence}`,
          );
          assert.doesNotMatch(
            sentence,
            /[a-z]+_[a-z_]+/,
            `${locale} ${code}：把错误码原文摆给用户了：${sentence}`,
          );
        }
        // 这一屏不许改写契约的句子，只许换语言。
        if (screenOwned.has(code)) {
          assert.notEqual(
            onScreen,
            viaTable,
            `${locale} ${code}：这一屏本该说收文件那句更贴切的话`,
          );
        } else {
          assert.equal(onScreen, viaTable, `${locale} ${code}：这一屏把契约那句改写了`);
        }
      }
    }
    // 兜底设备名也得是这门语言的，不能一句译文里嵌一个中文「这台电脑」。
    const noName = copyTable.deviceErrorCopy("revoked", { tt });
    assert.ok(!HAN.test(noName), `${locale}: 兜底设备名还是中文：${noName}`);
  }
});

test("不传 tt 的读取方逐字不变：设备页、进度面板、文件树拿到的仍是契约中文", () => {
  // 这张表有六个读取方，只有手机送达那一屏会把 `tt` 传下来。其余五个（设备页、
  // 桌面 launcher、进度面板、本地控制台、文件树）本轮一个字节都不该变 ——
  // 契约中文的逐字比对在 `devices-page.test.mjs`，这里钉的是「默认值仍是恒等」。
  const zh = (sentence) => sentence;
  for (const code of [...copyTable.DEVICE_ERROR_CODES, "internal_server_error"]) {
    for (const limit of [undefined, 20]) {
      const withoutTt = copyTable.deviceErrorCopy(code, { deviceName: "书房电脑", limit });
      assert.equal(
        withoutTt,
        copyTable.deviceErrorCopy(code, { deviceName: "书房电脑", limit, tt: zh }),
        `${code}: 不传 tt 与传恒等 tt 出的话不一样`,
      );
      assert.ok(HAN.test(withoutTt), `${code}: 不传 tt 时不该变成别的语言：${withoutTt}`);
      assert.doesNotMatch(withoutTt, /\{\w+\}/, `${code}: 占位符没填上：${withoutTt}`);
    }
  }
  // 设备名与上限由 `fill()` 填，不靠 `tt` 插值：一个只查表的翻译口也不许漏出半成品。
  const lookupOnly = (sentence) => DICTIONARIES.ja[sentence] ?? sentence;
  const ja = copyTable.deviceErrorCopy("quota_unpaired_devices", { limit: 5, tt: lookupOnly });
  assert.match(ja, /5/, `上限没填进日语译文：${ja}`);
  assert.doesNotMatch(ja, /\{\w+\}/, `占位符漏到日语用户脸上：${ja}`);
  assert.equal(copyTable.deviceErrorCopy("revoked", { deviceName: "", tt: lookupOnly }).includes("このパソコン"), true);
});

test("挂载渲染：日语用户看到日语，阿拉伯语用户整屏没有一个汉字", async () => {
  installNativeHost();
  const props = {
    deviceId: "device-1",
    deviceName: "Studio PC",
    deviceOnline: false,
    folders: { folders: ["/srv/in"], source: "heartbeat" },
  };
  const zhView = await mount(props);
  const zhText = zhView.container.textContent;
  await zhView.unmount();
  assert.ok(HAN.test(zhText), "中文站这一屏本来就该是中文");

  try {
    globalThis.__W07_DICT__ = DICTIONARIES.ja;
    const jaView = await mount(props);
    const jaText = jaView.container.textContent;
    await jaView.unmount();
    assert.notEqual(jaText, zhText, "日语这一屏与中文逐字相同 ⇒ tt 根本没接上");
    assert.match(jaText, /送信/, "日语用户没看到日语");

    globalThis.__W07_DICT__ = DICTIONARIES.ar;
    const arView = await mount(props);
    const arText = arView.container.textContent;
    await arView.unmount();
    // 落点名 `/srv/in` 是那台电脑上报的真实目录，不是文案，所以整屏只剩译文与路径。
    assert.ok(!HAN.test(arText), `阿拉伯语这一屏还有汉字：${arText}`);
  } finally {
    delete globalThis.__W07_DICT__;
    clearNativeHost();
  }
});

test("base64 编码与字节数换算在片边界上不漂", () => {
  assert.equal(bytesToBase64(new Uint8Array([0])), "AA==");
  assert.equal(base64ByteLength("AA=="), 1);
  assert.equal(base64ByteLength("AAA="), 2);
  assert.equal(base64ByteLength("AAAA"), 3);
  assert.equal(base64ByteLength(""), 0);
  const bytes = mediaOf(3 * 1000).bytes;
  assert.equal(base64ByteLength(bytesToBase64(bytes)), bytes.length);
});
