import assert from "node:assert/strict";
import test from "node:test";

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
