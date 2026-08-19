// W1 的自测：指令面（合同 §3.1）与空件挂载（§3.2）。
//
// 两件事放一份文件，是因为 W1 在本波只有这一份自测文件；文件下半段用 JSDOM 真渲染
// 空框，走的是「拖进来 → 判型 → 上传 → 落成素材 → 交给工作台挂编辑器」那条真链，
// 不是文本断言。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

import {
  PLUGIN_COMMAND_PARAM_MAX_BYTES,
  PLUGIN_COMMAND_STATE_MAX_BYTES,
} from "../src/shell/plugin-command/types.ts";
import {
  currentPluginCommandSurface,
  describePluginCommands,
  readPluginCommandState,
  registerPluginCommandSurface,
  resetPluginCommandSurface,
  runPluginCommand,
  subscribePluginCommandSurface,
} from "../src/shell/plugin-command/registry.ts";

function surface(overrides = {}) {
  const calls = [];
  const base = {
    editorId: "richdoc",
    describe: () => [
      {
        id: "richdoc.insert-heading",
        label: "插入标题",
        summary: "在光标处插入一个标题段落。",
        mutates: true,
        params: [
          { key: "text", label: "标题文字", type: "string", required: true },
          { key: "level", label: "标题层级", type: "number" },
          {
            key: "align",
            label: "对齐",
            type: "enum",
            enumValues: [
              { value: "left", label: "左对齐" },
              { value: "center", label: "居中" },
            ],
          },
        ],
      },
      {
        id: "richdoc.word-count",
        label: "统计字数",
        summary: "报一下当前文档的字数，不改文档。",
        mutates: false,
      },
    ],
    state: () => ({ words: 12, title: "未命名文档" }),
    run: async (id, params) => {
      calls.push({ id, params });
      return { ok: true, message: "已插入标题。", revision: 3 };
    },
  };
  return { calls, surface: { ...base, ...overrides } };
}

test.afterEach(() => resetPluginCommandSurface());

test("注册后能读到指令面，注销后归 null", () => {
  assert.equal(currentPluginCommandSurface(), null);
  const { surface: live } = surface();
  const unregister = registerPluginCommandSurface(live);
  const active = currentPluginCommandSurface();
  assert.ok(active);
  assert.equal(active.editorId, "richdoc");
  assert.deepEqual(
    active.describe().map((spec) => spec.id),
    ["richdoc.insert-heading", "richdoc.word-count"],
  );
  unregister();
  assert.equal(currentPluginCommandSurface(), null);
  assert.deepEqual(describePluginCommands(), []);
  assert.equal(readPluginCommandState(), null);
});

test("同一时刻只有一个 active；旧编辑器的迟到注销不许清掉新的", () => {
  const first = surface();
  const second = surface({ editorId: "image" });
  const unregisterFirst = registerPluginCommandSurface(first.surface);
  registerPluginCommandSurface(second.surface);
  assert.equal(currentPluginCommandSurface().editorId, "image");
  unregisterFirst();
  assert.equal(currentPluginCommandSurface()?.editorId, "image");
});

test("注册与注销都会通知订阅者，退订之后不再收到", () => {
  let ticks = 0;
  const stop = subscribePluginCommandSurface(() => {
    ticks += 1;
  });
  const unregister = registerPluginCommandSurface(surface().surface);
  assert.equal(ticks, 1);
  unregister();
  assert.equal(ticks, 2);
  stop();
  registerPluginCommandSurface(surface().surface);
  assert.equal(ticks, 2);
});

test("越界 id 一律拒绝，且说清现在能用哪些", async () => {
  const live = surface();
  registerPluginCommandSurface(live.surface);
  const result = await runPluginCommand("richdoc.drop-database");
  assert.equal(result.ok, false);
  assert.match(result.message, /richdoc\.insert-heading/);
  assert.equal(live.calls.length, 0);
});

test("id 前缀对不上 editorId 的 spec 不进 describe，也不能执行", async () => {
  const live = surface({
    describe: () => [
      {
        id: "grid.sort",
        label: "排序",
        summary: "按某一列排序。",
        mutates: true,
      },
      {
        id: "richdoc.word-count",
        label: "统计字数",
        summary: "报一下当前文档的字数。",
        mutates: false,
      },
    ],
  });
  registerPluginCommandSurface(live.surface);
  assert.deepEqual(
    describePluginCommands().map((spec) => spec.id),
    ["richdoc.word-count"],
  );
  const result = await runPluginCommand("grid.sort");
  assert.equal(result.ok, false);
  assert.equal(live.calls.length, 0);
});

test("没有编辑器时执行指令是明确失败，不是静默什么都不做", async () => {
  const result = await runPluginCommand("richdoc.word-count");
  assert.equal(result.ok, false);
  assert.match(result.message, /没有打开的编辑器/);
});

test("未声明的参数键一律拒绝", async () => {
  const live = surface();
  registerPluginCommandSurface(live.surface);
  const result = await runPluginCommand("richdoc.insert-heading", {
    text: "第一章",
    colour: "红色",
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /colour/);
  assert.equal(live.calls.length, 0);
});

test("不接受任何参数的指令收到参数时明确报错", async () => {
  const live = surface();
  registerPluginCommandSurface(live.surface);
  const result = await runPluginCommand("richdoc.word-count", { text: "x" });
  assert.equal(result.ok, false);
  assert.match(result.message, /不接受任何参数/);
  assert.equal(live.calls.length, 0);
});

test("必填参数缺失、类型不符、枚举越界都拒绝", async () => {
  const live = surface();
  registerPluginCommandSurface(live.surface);
  const missing = await runPluginCommand("richdoc.insert-heading", {});
  assert.equal(missing.ok, false);
  assert.match(missing.message, /标题文字/);

  const wrongType = await runPluginCommand("richdoc.insert-heading", {
    text: "第一章",
    level: "二级",
  });
  assert.equal(wrongType.ok, false);
  assert.match(wrongType.message, /数字/);

  const badEnum = await runPluginCommand("richdoc.insert-heading", {
    text: "第一章",
    align: "justify",
  });
  assert.equal(badEnum.ok, false);
  assert.match(badEnum.message, /左对齐/);
  assert.equal(live.calls.length, 0);
});

test("单个参数超过 8KB 拒绝，刚好压线的放行", async () => {
  const live = surface();
  registerPluginCommandSurface(live.surface);
  const tooLong = "字".repeat(PLUGIN_COMMAND_PARAM_MAX_BYTES);
  const rejected = await runPluginCommand("richdoc.insert-heading", {
    text: tooLong,
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /太长/);
  assert.equal(live.calls.length, 0);

  const accepted = await runPluginCommand("richdoc.insert-heading", {
    text: "a".repeat(PLUGIN_COMMAND_PARAM_MAX_BYTES - 2),
  });
  assert.equal(accepted.ok, true);
  assert.equal(live.calls.length, 1);
});

test("合法调用透传给编辑器，并带回 revision", async () => {
  const live = surface();
  registerPluginCommandSurface(live.surface);
  const result = await runPluginCommand("richdoc.insert-heading", {
    text: "第一章",
    level: 1,
    align: "center",
  });
  assert.deepEqual(result, {
    ok: true,
    message: "已插入标题。",
    revision: 3,
  });
  assert.deepEqual(live.calls, [
    {
      id: "richdoc.insert-heading",
      params: { text: "第一章", level: 1, align: "center" },
    },
  ]);
});

test("编辑器抛异常时是可读的失败，不是崩掉", async () => {
  const live = surface({
    run: async () => {
      throw new Error("文档还没加载完");
    },
  });
  registerPluginCommandSurface(live.surface);
  const result = await runPluginCommand("richdoc.word-count");
  assert.equal(result.ok, false);
  assert.match(result.message, /文档还没加载完/);
});

test("编辑器返回一坨看不懂的东西时判失败", async () => {
  const live = surface({ run: async () => "done" });
  registerPluginCommandSurface(live.surface);
  const result = await runPluginCommand("richdoc.word-count");
  assert.equal(result.ok, false);
  assert.match(result.message, /无法确认/);
});

test("state 超长截断，并在返回里说清省了哪几项", () => {
  const live = surface({
    state: () => ({
      title: "未命名文档",
      words: 12,
      outline: "章".repeat(PLUGIN_COMMAND_STATE_MAX_BYTES),
    }),
  });
  registerPluginCommandSurface(live.surface);
  const snapshot = readPluginCommandState();
  assert.ok(snapshot);
  assert.equal(snapshot.truncated, true);
  assert.match(snapshot.message, /outline/);
  assert.equal("outline" in snapshot.state, false);
  assert.equal(snapshot.state.title, "未命名文档");
  assert.ok(snapshot.byteSize <= PLUGIN_COMMAND_STATE_MAX_BYTES);
  assert.ok(
    Buffer.byteLength(JSON.stringify(currentPluginCommandSurface().state())) <=
      PLUGIN_COMMAND_STATE_MAX_BYTES,
  );
});

test("state 没超长时原样带出，truncated 为假", () => {
  registerPluginCommandSurface(surface().surface);
  const snapshot = readPluginCommandState();
  assert.equal(snapshot.truncated, false);
  assert.equal(snapshot.message, "");
  assert.deepEqual(snapshot.state, { words: 12, title: "未命名文档" });
});

test("state 抛异常或不是键值时按空摘要处理，并说明", () => {
  const unregister = registerPluginCommandSurface(
    surface({
      state: () => {
        throw new Error("nope");
      },
    }).surface,
  );
  const thrown = readPluginCommandState();
  assert.deepEqual(thrown.state, {});
  assert.equal(thrown.truncated, true);
  assert.match(thrown.message, /读不出现状摘要/);
  unregister();

  registerPluginCommandSurface(surface({ state: () => [1, 2, 3] }).surface);
  const wrongShape = readPluginCommandState();
  assert.deepEqual(wrongShape.state, {});
  assert.match(wrongShape.message, /不是一组键值/);
});

// ============================================================================
// 空件挂载（合同 §3.2）：没有任何 item 时，第一件素材是怎么落成的
// ============================================================================

const require = createRequire(import.meta.url);
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
  url: "https://word.oceanleo.com/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  File: window.File,
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

globalThis.__blankStageCalls = {
  uploads: [],
  canonical: 0,
  legacy: 0,
  ensure: 0,
  uploadResponse: null,
};

const { AdvancedWorkbenchBlankStage } = await import(
  await compileModule("src/shell/AdvancedWorkbenchStage.tsx", {
    "../i18n/ui/useUI": dataModule(`
      export function useUI() {
        return (text, vars) =>
          vars
            ? String(text).replace(/\\{(\\w+)\\}/g, (match, key) =>
                key in vars ? String(vars[key]) : match,
              )
            : text;
      }
    `),
    "./AdvancedEditorIcon": dataModule(
      `export function AdvancedEditorIcon() { return null; }`,
    ),
    "./library-viewers": dataModule(
      `export function LibraryItemViewer() { return null; }`,
    ),
    "./workbench-material-provider": dataModule(
      `export const WORKBENCH_MATERIAL_MIME = "application/x-oceanleo-material";`,
    ),
    "../lib/database": dataModule(`
      export async function uploadFile(file, options) {
        globalThis.__blankStageCalls.uploads.push({
          name: file.name,
          options,
        });
        return globalThis.__blankStageCalls.uploadResponse;
      }
    `),
    "./MyLibrary": dataModule(`
      export function canonicalUploadLibraryItem(record) {
        globalThis.__blankStageCalls.canonical += 1;
        return {
          ok: true,
          item: { id: "canonical", artifactId: record.artifact_id, title: "已上传" },
        };
      }
      export function legacyUploadTransient(record, file) {
        globalThis.__blankStageCalls.legacy += 1;
        return { ok: true, transient: { resultId: record.id, name: file.name } };
      }
    `),
    "./artifact-client": dataModule(`
      export async function ensureArtifact(transient) {
        globalThis.__blankStageCalls.ensure += 1;
        return {
          ok: true,
          data: { id: "ensured", title: transient.name },
        };
      }
    `),
  })
);

const { createRoot } = await import("react-dom/client");

function mountBlankStage() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const received = [];
  act(() => {
    root.render(
      React.createElement(AdvancedWorkbenchBlankStage, {
        siteId: "word",
        onItemReady: (item) => received.push(item),
      }),
    );
  });
  return {
    host,
    received,
    unmount: () => act(() => root.unmount()),
  };
}

/**
 * 上传链里有 `await import()`（`MyLibrary` / `artifact-client` 都是用到才加载），
 * 它比 act 的微任务刷新晚若干个 tick 才落地。转起来直到落定，不然断言会看到
 * 一个还没走完的中间态——而那一步的结果会掉进**下一条**用例里，红得莫名其妙。
 */
async function settle(done) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (done()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
  }
}

async function dropFile(host, name, bytes = "hello") {
  const input = host.querySelector('input[type="file"]');
  assert.ok(input, "空框必须有一个上传入口");
  const file = new window.File([bytes], name, { type: "" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await settle(
    () =>
      Boolean(host.querySelector('[role="alert"]')) ||
      globalThis.__blankStageCalls.canonical > 0 ||
      globalThis.__blankStageCalls.ensure > 0,
  );
}

test.beforeEach(() => {
  globalThis.__blankStageCalls = {
    uploads: [],
    canonical: 0,
    legacy: 0,
    ensure: 0,
    uploadResponse: null,
  };
});

test("空框先给提示与上传入口，不需要任何素材就能挂出来", () => {
  const mounted = mountBlankStage();
  assert.match(mounted.host.textContent, /把文件拖进来，或点上传/);
  assert.ok(mounted.host.querySelector("[data-workbench-blank-stage]"));
  assert.ok(mounted.host.querySelector('input[type="file"]'));
  mounted.unmount();
});

test("认不出的后缀在上传之前就被挡住，并写清后缀与支持范围", async () => {
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "怪东西.xyz");
  const alert = mounted.host.querySelector('[role="alert"]');
  assert.ok(alert, "认不出类型必须有话说，不许静默不动");
  assert.match(alert.textContent, /XYZ/);
  assert.match(alert.textContent, /文档|表格|图片/);
  assert.equal(globalThis.__blankStageCalls.uploads.length, 0);
  assert.deepEqual(mounted.received, []);
  mounted.unmount();
});

test("网关直接给 canonical artifact 时，第一件素材落成并交回工作台", async () => {
  globalThis.__blankStageCalls.uploadResponse = {
    ok: true,
    data: {
      file: {
        id: "file-1",
        url: "https://cdn.invalid/a.docx",
        artifact_id: "artifact-1",
        revision_id: "revision-1",
        artifact: {},
      },
    },
  };
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "季度报告.docx");
  assert.equal(globalThis.__blankStageCalls.uploads.length, 1);
  assert.equal(globalThis.__blankStageCalls.uploads[0].options.siteId, "word");
  assert.equal(globalThis.__blankStageCalls.canonical, 1);
  assert.equal(globalThis.__blankStageCalls.ensure, 0);
  assert.deepEqual(mounted.received, [
    { id: "canonical", artifactId: "artifact-1", title: "已上传" },
  ]);
  mounted.unmount();
});

test("旧网关只给文件行时走 ensure 入库，同样落成真素材", async () => {
  globalThis.__blankStageCalls.uploadResponse = {
    ok: true,
    data: {
      file: { id: "file-2", url: "https://cdn.invalid/b.png", meta: {} },
    },
  };
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "封面.png");
  assert.equal(globalThis.__blankStageCalls.canonical, 0);
  assert.equal(globalThis.__blankStageCalls.legacy, 1);
  assert.equal(globalThis.__blankStageCalls.ensure, 1);
  assert.deepEqual(mounted.received, [{ id: "ensured", title: "封面.png" }]);
  mounted.unmount();
});

test("要先转一道的后缀（tiff）照样收下，不当成不支持", async () => {
  globalThis.__blankStageCalls.uploadResponse = {
    ok: true,
    data: { file: { id: "file-3", url: "https://cdn.invalid/c.tiff", meta: {} } },
  };
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "扫描件.tiff");
  assert.equal(mounted.host.querySelector('[role="alert"]'), null);
  assert.equal(globalThis.__blankStageCalls.uploads.length, 1);
  assert.equal(mounted.received.length, 1);
  mounted.unmount();
});

// W10 交付 §5 落盘后判型表按它的结论补：obj/stl 收下（走 `/v1/convert/model3d` 转 glb），
// fbx 不收（它会被 415 拒）。落盘之前这里断言的是「obj 也明说打不开」，
// 依据是同一句任务书——「能不能真转由 W10 决定」。
test("3D 的 obj 收下，并在开始等之前就说清贴图材质不会带过来", async () => {
  let release = () => {};
  globalThis.__blankStageCalls.uploadResponse = new Promise((resolve) => {
    release = () => resolve({ ok: false, error: "先停在这里。" });
  });
  const mounted = mountBlankStage();
  const input = mounted.host.querySelector('input[type="file"]');
  const file = new window.File(["x"], "模型.obj", { type: "" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });

  assert.equal(mounted.host.querySelector('[role="alert"]'), null, "obj 被当成打不开的格式");
  assert.equal(globalThis.__blankStageCalls.uploads.length, 1);
  const status = mounted.host.querySelector('[role="status"]');
  assert.ok(status, "转 3D 的时候没有任何提示");
  assert.match(
    status.textContent,
    /贴图和材质不会带过来/,
    "转完才告诉用户丢了贴图材质，那时他已经等完一整趟上传了",
  );

  release();
  await settle(() => Boolean(mounted.host.querySelector('[role="alert"]')));
  mounted.unmount();
});

test("3D 的 fbx 明说收不了，并告诉用户导出成 GLB", async () => {
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "角色.fbx");
  const alert = mounted.host.querySelector('[role="alert"]');
  assert.ok(alert);
  assert.match(alert.textContent, /FBX/);
  assert.match(alert.textContent, /GLB/, "只说不行、不说怎么办，等于没说");
  assert.equal(
    globalThis.__blankStageCalls.uploads.length,
    0,
    "后端会 415 拒掉 fbx，不该让用户先白传一趟",
  );
  mounted.unmount();
});

test("空框给出「把整个项目搬上来」这条路，点开就是导入面板", async () => {
  const mounted = mountBlankStage();
  const entry = [...mounted.host.querySelectorAll("button")].find((node) =>
    /整个项目/.test(node.textContent || ""),
  );
  assert.ok(entry, "空框里找不到「把整个项目搬上来」的入口");
  await act(async () => {
    entry.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(
    [...mounted.host.querySelectorAll("button")].some((node) =>
      /整个项目/.test(node.textContent || ""),
    ),
    false,
    "点开之后入口还在原地，说明没切到导入面板",
  );
  mounted.unmount();
});

test("手机照片（heic）给的是能照做的一句话，不是那串通用清单", async () => {
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "IMG_0421.heic");
  const alert = mounted.host.querySelector('[role="alert"]');
  assert.ok(alert, "heic 必须有话说");
  assert.match(alert.textContent, /HEIC/);
  assert.match(alert.textContent, /JPG/, "只说打不开、不说怎么办，等于没说");
  assert.doesNotMatch(
    alert.textContent,
    /现在支持：/,
    "手机照片掉进那串通用后缀清单里了，用户读完还是不知道下一步干什么",
  );
  assert.equal(
    globalThis.__blankStageCalls.uploads.length,
    0,
    "明知这台服务器转不了 heic，还是让用户白传了一趟",
  );
  mounted.unmount();
});

test("要转一道的文件在传的过程中有进度提示，不是一个不动的界面", async () => {
  let release = () => {};
  globalThis.__blankStageCalls.uploadResponse = new Promise((resolve) => {
    release = () => resolve({ ok: false, error: "先停在这里。" });
  });
  const mounted = mountBlankStage();
  const input = mounted.host.querySelector('input[type="file"]');
  const file = new window.File(["x"], "扫描件.tiff", { type: "" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });

  const status = mounted.host.querySelector('[role="status"]');
  assert.ok(status, "要转格式的文件在传的时候一句提示都没有，用户只能盯着不动的界面");
  assert.match(status.textContent, /转成能编辑的格式|正在上传/);

  release();
  await settle(() => Boolean(mounted.host.querySelector('[role="alert"]')));
  assert.equal(
    mounted.host.querySelector('[role="status"]'),
    null,
    "已经出结果了，进度提示还挂在那里",
  );
  mounted.unmount();
});

test("上传失败时把原因摆出来，不静默吞掉", async () => {
  globalThis.__blankStageCalls.uploadResponse = {
    ok: false,
    error: "存储空间暂时不可用。",
  };
  const mounted = mountBlankStage();
  await dropFile(mounted.host, "季度报告.docx");
  const alert = mounted.host.querySelector('[role="alert"]');
  assert.ok(alert);
  assert.match(alert.textContent, /存储空间暂时不可用/);
  assert.deepEqual(mounted.received, []);
  mounted.unmount();
});
