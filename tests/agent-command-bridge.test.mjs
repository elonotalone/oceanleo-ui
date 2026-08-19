// W4 自测：agent 侧「左边说话、右边动手」的指令桥。
// 全程用假的 PluginCommandSurface 打桩，不依赖 W2/W3 的真实现，也不碰后端。
import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITOR_COMMAND_FENCE,
  EDITOR_COMMAND_LIST_LIMIT,
  buildEditorCommandContext,
  createEditorCommandSession,
  describeEditorCommand,
  editorCommandResultNote,
  parseEditorCommandRequests,
  planEditorCommand,
  readEditorCommandSurface,
  registerEditorCommandSurfaceReader,
  runEditorCommand,
} from "../src/lib/fn-agent.ts";

const block = (payload) =>
  ["```" + EDITOR_COMMAND_FENCE, JSON.stringify(payload), "```"].join("\n");

// 假指令面：记录每一次 run() 调用，供「未确认不执行」这条硬判据取证。
function stubSurface(overrides = {}) {
  const calls = [];
  const specs = overrides.specs ?? [
    {
      id: "richdoc.insert-heading",
      label: "插入标题",
      summary: "在光标处插入一行标题",
      mutates: true,
      params: [
        { key: "text", label: "标题文字", type: "string", required: true },
        {
          key: "level",
          label: "层级",
          type: "enum",
          enumValues: [
            { value: "h1", label: "一级" },
            { value: "h2", label: "二级" },
          ],
        },
      ],
    },
    {
      id: "richdoc.word-count",
      label: "数一下字数",
      summary: "只看不改",
      mutates: false,
    },
  ];
  return {
    calls,
    surface: {
      editorId: overrides.editorId ?? "richdoc",
      describe: () => specs,
      state: () => overrides.state ?? { words: 128 },
      async run(id, params) {
        calls.push({ id, params });
        if (overrides.result) return overrides.result;
        return { ok: true, message: "已插入标题「概述」。", revision: 3 };
      },
    },
  };
}

test("右边没开编辑器时，给模型的上下文是空的（不编造）", () => {
  assert.equal(buildEditorCommandContext(null), "");
  assert.equal(buildEditorCommandContext(undefined), "");
  // editorId 空的指令面同样当作「没开编辑器」。
  const { surface } = stubSurface({ editorId: "  " });
  assert.equal(buildEditorCommandContext(surface), "");
});

test("有编辑器时上下文写清编辑器、指令、参数与确认规则", () => {
  const { surface } = stubSurface();
  const ctx = buildEditorCommandContext(surface, { query: "插入一个标题" });
  assert.match(ctx, /现在打开的是文档编辑器/);
  assert.match(ctx, /richdoc\.insert-heading：插入标题/);
  assert.match(ctx, /标题文字；必填/);
  assert.match(ctx, /会改内容，需用户确认/);
  assert.match(ctx, /只读/);
  assert.match(ctx, /"words":128/);
  assert.match(ctx, new RegExp("```" + EDITOR_COMMAND_FENCE));
  assert.match(ctx, /清单以外的 id 一律不要发/);
});

test("指令超过 30 条时按相关性截断并注明", () => {
  const specs = Array.from({ length: 42 }, (_, i) => ({
    id: `richdoc.cmd-${i}`,
    label: `动作 ${i}`,
    summary: "说明",
    mutates: false,
  }));
  specs[40] = {
    id: "richdoc.crop-image",
    label: "裁剪图片",
    summary: "把图片裁成指定比例",
    mutates: true,
  };
  const { surface } = stubSurface({ specs });
  const ctx = buildEditorCommandContext(surface, { query: "把这张图裁成 16:9" });
  assert.match(ctx, /它现在能做 42 件事/);
  assert.match(ctx, /最相关的 30 条/);
  assert.match(ctx, /其余 12 条未列出/);
  // 相关的那条必须留在清单里（截断按相关性，不是按声明顺序切前 30）。
  assert.match(ctx, /richdoc\.crop-image/);
  assert.equal(
    ctx.split("\n").filter((line) => line.startsWith("- richdoc.")).length,
    EDITOR_COMMAND_LIST_LIMIT,
  );
});

test("状态摘要超过 4KB 时整段不给模型，不截半个 JSON", () => {
  const { surface } = stubSurface({ state: { blob: "字".repeat(5000) } });
  const ctx = buildEditorCommandContext(surface);
  assert.ok(!ctx.includes("状态摘要"));
  assert.match(ctx, /现在打开的是文档编辑器/);
});

test("解析指令块：取出 id 与参数，正文里不再留代码块", () => {
  const text = [
    "好，我来插入标题。",
    block({ id: "richdoc.insert-heading", params: { text: "概述" } }),
    "插完你看一下。",
  ].join("\n");
  const parsed = parseEditorCommandRequests(text);
  assert.equal(parsed.requests.length, 1);
  assert.deepEqual(parsed.requests[0], {
    id: "richdoc.insert-heading",
    params: { text: "概述" },
  });
  assert.equal(parsed.invalidCount, 0);
  assert.ok(!parsed.cleaned.includes(EDITOR_COMMAND_FENCE));
  assert.match(parsed.cleaned, /好，我来插入标题/);
  assert.match(parsed.cleaned, /插完你看一下/);
});

test("坏 JSON / 没有 id 的指令块只记账，不产出指令", () => {
  const bad = ["```" + EDITOR_COMMAND_FENCE, "{ 这不是 JSON", "```"].join("\n");
  const noId = block({ params: { text: "x" } });
  const parsed = parseEditorCommandRequests(`${bad}\n${noId}`);
  assert.equal(parsed.requests.length, 0);
  assert.equal(parsed.invalidCount, 2);
});

test("越界 id 被拒，且绝不调用 run()——顺带列出它能做什么", () => {
  const { surface, calls } = stubSurface();
  const plan = planEditorCommand(surface, { id: "richdoc.explode" });
  assert.equal(plan.kind, "reject");
  assert.match(plan.reason, /这个文档编辑器现在做不了这件事/);
  assert.match(plan.reason, /插入标题、数一下字数/);
  assert.equal(calls.length, 0);
});

test("越界 id 走完整条会话链路也不会调用 run()", async () => {
  const { surface, calls } = stubSurface();
  const session = createEditorCommandSession();
  const offer = await session.offer({
    messageId: 11,
    content: block({ id: "richdoc.explode", params: {} }),
    surface,
  });
  assert.equal(offer.kind, "reject");
  assert.match(offer.note, /现在做不了这件事/);
  assert.equal(calls.length, 0);
  assert.equal(session.runCount(), 0);
  assert.equal(session.pending(), null);
});

test("参数缺失不瞎猜补全，直接拒，且不调用 run()", () => {
  const { surface, calls } = stubSurface();
  const plan = planEditorCommand(surface, {
    id: "richdoc.insert-heading",
    params: {},
  });
  assert.equal(plan.kind, "reject");
  assert.match(plan.reason, /还差「标题文字」没告诉我/);
  assert.match(plan.reason, /不替你猜/);
  assert.equal(calls.length, 0);
});

test("多余参数与越界枚举值一律拒", () => {
  const { surface, calls } = stubSurface();
  const extra = planEditorCommand(surface, {
    id: "richdoc.insert-heading",
    params: { text: "概述", color: "red" },
  });
  assert.equal(extra.kind, "reject");
  assert.match(extra.reason, /不需要「color」这一项/);
  const badEnum = planEditorCommand(surface, {
    id: "richdoc.insert-heading",
    params: { text: "概述", level: "h9" },
  });
  assert.equal(badEnum.kind, "reject");
  assert.match(badEnum.reason, /只能填：h1 \/ h2/);
  assert.equal(calls.length, 0);
});

test("没有编辑器时下指令被拒，不炸也不调用任何东西", () => {
  const plan = planEditorCommand(null, { id: "richdoc.insert-heading" });
  assert.equal(plan.kind, "reject");
  assert.match(plan.reason, /右边现在没有打开编辑器/);
});

test("mutates:true 在用户确认之前一步都不执行", async () => {
  const { surface, calls } = stubSurface();
  const session = createEditorCommandSession();
  const offer = await session.offer({
    messageId: 21,
    content: block({ id: "richdoc.insert-heading", params: { text: "概述" } }),
    surface,
  });
  assert.equal(offer.kind, "confirm");
  assert.equal(calls.length, 0, "未确认就调用了 run()——这是本份活最重的一条红线");
  assert.equal(session.runCount(), 0);
  // 确认卡上必须是人话：说清做什么、改哪里、填了什么；不出现 id 和 JSON。
  assert.match(offer.pending.prompt, /要我在文档里「插入标题」吗/);
  assert.match(offer.pending.prompt, /标题文字：概述/);
  assert.ok(!offer.pending.prompt.includes("richdoc.insert-heading"));
  assert.ok(!offer.pending.prompt.includes("{"));
  // 轮询把同一条消息再喂一次，也不能偷偷执行。
  const again = await session.offer({
    messageId: 21,
    content: block({ id: "richdoc.insert-heading", params: { text: "概述" } }),
    surface,
  });
  assert.equal(again.kind, "none");
  assert.equal(calls.length, 0);
});

test("确认后执行一次，且只执行一次", async () => {
  const { surface, calls } = stubSurface();
  const session = createEditorCommandSession();
  await session.offer({
    messageId: 31,
    content: block({
      id: "richdoc.insert-heading",
      params: { text: "概述", level: "h1" },
    }),
    surface,
  });
  const outcome = await session.confirm();
  assert.ok(outcome);
  assert.equal(outcome.result.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    id: "richdoc.insert-heading",
    params: { text: "概述", level: "h1" },
  });
  assert.match(outcome.note, /已完成「插入标题」/);
  assert.match(outcome.note, /已插入标题「概述」/);
  // 重复点确认（双击 / 界面重渲染）不能再打一次。
  assert.equal(await session.confirm(), null);
  assert.equal(calls.length, 1);
  assert.equal(session.runCount(), 1);
  assert.equal(session.pending(), null);
});

test("用户拒了就一个字都不改，并且这一轮后面的指令一起停", async () => {
  const { surface, calls } = stubSurface();
  const session = createEditorCommandSession();
  await session.offer({
    messageId: 41,
    content: block({ id: "richdoc.insert-heading", params: { text: "概述" } }),
    surface,
  });
  const declined = session.decline();
  assert.match(declined.note, /没有执行，文件一个字没改/);
  assert.equal(calls.length, 0);
  assert.equal(await session.confirm(), null);
  // 第一条被拒 → 同一轮后续指令直接停，不再弹确认。
  const next = await session.offer({
    messageId: 42,
    content: block({ id: "richdoc.insert-heading", params: { text: "第二段" } }),
    surface,
  });
  assert.equal(next.kind, "reject");
  assert.match(next.note, /你说先别改，我就停在这里/);
  assert.equal(calls.length, 0);
  // 用户重新说话后才解除停摆。
  session.resume();
  const resumed = await session.offer({
    messageId: 43,
    content: block({ id: "richdoc.insert-heading", params: { text: "第三段" } }),
    surface,
  });
  assert.equal(resumed.kind, "confirm");
  assert.equal(calls.length, 0);
});

test("只读指令不用问，直接执行", async () => {
  const { surface, calls } = stubSurface();
  const session = createEditorCommandSession();
  const offer = await session.offer({
    messageId: 51,
    content: block({ id: "richdoc.word-count" }),
    surface,
  });
  assert.equal(offer.kind, "ran");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params, undefined);
  assert.equal(session.pending(), null);
});

test("「以后这类不用问我」只在本会话生效，下一条同类指令直接执行", async () => {
  const { surface, calls } = stubSurface();
  const session = createEditorCommandSession();
  await session.offer({
    messageId: 61,
    content: block({ id: "richdoc.insert-heading", params: { text: "概述" } }),
    surface,
  });
  session.allowAlways();
  assert.equal(session.isAllowed("richdoc", "richdoc.insert-heading"), true);
  await session.confirm();
  assert.equal(calls.length, 1);
  const next = await session.offer({
    messageId: 62,
    content: block({ id: "richdoc.insert-heading", params: { text: "第二段" } }),
    surface,
  });
  assert.equal(next.kind, "ran");
  assert.equal(calls.length, 2);
  // 授权不外溢到别的指令，也不外溢到新会话。
  assert.equal(session.isAllowed("richdoc", "richdoc.word-count"), false);
  const fresh = createEditorCommandSession();
  assert.equal(fresh.isAllowed("richdoc", "richdoc.insert-heading"), false);
});

test("一口气给多条指令时只做第一条，其余明确告诉用户被搁下了", async () => {
  const { surface, calls } = stubSurface();
  const session = createEditorCommandSession();
  const offer = await session.offer({
    messageId: 71,
    content: [
      "我分两步做。",
      block({ id: "richdoc.insert-heading", params: { text: "概述" } }),
      block({ id: "richdoc.insert-heading", params: { text: "结论" } }),
    ].join("\n"),
    surface,
  });
  assert.equal(offer.kind, "confirm");
  assert.match(offer.note, /一次只做一件事/);
  assert.match(offer.note, /其余 1 件/);
  await session.confirm();
  assert.equal(calls.length, 1);
});

test("ok:false 时把原因原样回写，不糊成「失败了」", async () => {
  const { surface, calls } = stubSurface({
    result: { ok: false, message: "光标不在正文里，没法插入标题。" },
  });
  const session = createEditorCommandSession();
  await session.offer({
    messageId: 81,
    content: block({ id: "richdoc.insert-heading", params: { text: "概述" } }),
    surface,
  });
  const outcome = await session.confirm();
  assert.equal(outcome.result.ok, false);
  assert.match(outcome.note, /没能完成「插入标题」/);
  assert.match(outcome.note, /光标不在正文里/);
  assert.ok(!outcome.note.includes("失败了"));
  assert.equal(calls.length, 1);
});

test("编辑器没给原因 / 直接抛错时也给出可读的原因", async () => {
  const silent = editorCommandResultNote(
    { id: "x", label: "插入标题", summary: "", mutates: true },
    { ok: false, message: "" },
  );
  assert.match(silent, /编辑器没有说明原因/);
  const throwing = {
    editorId: "richdoc",
    describe: () => [],
    state: () => ({}),
    async run() {
      throw new Error("编辑器内部炸了");
    },
  };
  const result = await runEditorCommand(
    throwing,
    { id: "richdoc.x", label: "某动作", summary: "", mutates: false },
    {},
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /编辑器内部炸了/);
});

test("指令面读取器：prop 注入优先于模块级注册，读不到就是没开编辑器", () => {
  const a = stubSurface({ editorId: "richdoc" }).surface;
  const b = stubSurface({ editorId: "image" }).surface;
  assert.equal(readEditorCommandSurface(), null);
  registerEditorCommandSurfaceReader(() => a);
  assert.equal(readEditorCommandSurface(), a);
  assert.equal(readEditorCommandSurface(() => b), b);
  registerEditorCommandSurfaceReader(() => {
    throw new Error("注册方自己炸了");
  });
  assert.equal(readEditorCommandSurface(), null);
  registerEditorCommandSurfaceReader(null);
  assert.equal(readEditorCommandSurface(), null);
});

// 唯一一处跨面检查：agent 侧读的是 W1 的指令面单例（合同 §3.1）。
// 只用 W1 的注册表挂一个假编辑器，不依赖 W2/W3 任何真实现。
test("agent 侧能从 W1 的指令面单例上读到当前编辑器", async () => {
  const { currentPluginCommandSurface, registerPluginCommandSurface, resetPluginCommandSurface } =
    await import("../src/shell/plugin-command/registry.ts");
  resetPluginCommandSurface();
  assert.equal(currentPluginCommandSurface(), null);
  assert.equal(buildEditorCommandContext(currentPluginCommandSurface()), "");
  const { surface } = stubSurface();
  const unregister = registerPluginCommandSurface(surface);
  const ctx = buildEditorCommandContext(currentPluginCommandSurface(), {
    query: "插入标题",
  });
  assert.match(ctx, /现在打开的是文档编辑器/);
  assert.match(ctx, /richdoc\.insert-heading/);
  const plan = planEditorCommand(currentPluginCommandSurface(), {
    id: "richdoc.insert-heading",
    params: { text: "概述" },
  });
  assert.equal(plan.kind, "confirm");
  unregister();
  assert.equal(currentPluginCommandSurface(), null);
  assert.equal(buildEditorCommandContext(currentPluginCommandSurface()), "");
});

test("确认卡文案对布尔与枚举也说人话", () => {
  const prompt = describeEditorCommand(
    "image",
    {
      id: "image.crop",
      label: "裁剪",
      summary: "把图片裁成 16:9",
      mutates: true,
      params: [
        {
          key: "ratio",
          label: "比例",
          type: "enum",
          enumValues: [{ value: "16:9", label: "宽屏 16:9" }],
        },
        { key: "keepOriginal", label: "保留原图", type: "boolean" },
      ],
    },
    { ratio: "16:9", keepOriginal: false },
  );
  assert.match(prompt, /要我在图片里「裁剪」吗/);
  assert.match(prompt, /比例：宽屏 16:9/);
  assert.match(prompt, /保留原图：否/);
});
