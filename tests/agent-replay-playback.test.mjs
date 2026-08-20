// agent 回放（W06，合同 2026-08-20）的**纯逻辑**契约：顺序 / 节奏 / 跳过 / 重播，
// 外加 `args_preview` / `result_preview` 三种输入形态（缺失、超长、含表格）的解析。
//
// 这四个行为为什么在这里而不是在渲染用例里锁：它们是这页唯一会被人改坏的部分，
// 而在 jsdom 里靠真实计时器去测「节奏」既慢又会随机红。纯函数 + reducer 可以逐条钉死，
// 渲染用例只需要再确认「组件确实用的是这套逻辑」。

import assert from "node:assert/strict";
import test from "node:test";

import {
  REPLAY_ARGS_PREVIEW_LIMIT,
  REPLAY_BASE_STEP_MS,
  REPLAY_MAX_STEP_MS,
  REPLAY_RESULT_PREVIEW_LIMIT,
  REPLAY_TABLE_MAX_ROWS,
  buildReplaySteps,
  createReplayState,
  detectPreviewTable,
  nextReplayDelayMs,
  parseReplayPreview,
  replayReducer,
  replayResultStepId,
  replayStepDelayMs,
  replayStepTarget,
  replayTimeline,
  replayToolLabel,
} from "../src/shell/replay/replay-model.ts";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const shareClientUrl = await compileModule("src/shell/replay/share-client.ts", {
  "../../lib/auth/config": dataModule(
    'export const GATEWAY_BASE = "https://api.oceanleo.com";',
  ),
});
const { fetchSharedReplay, normalizeSharedReplay } = await import(shareClientUrl);

const TABLE_PREVIEW = [
  "日期\t收盘\t成交量",
  "2026-08-19\t185.22\t41203900",
  "2026-08-18\t182.40\t38551200",
].join("\n");

/** 一条最普通的工具步骤。 */
function step(id, overrides = {}) {
  const { meta, ...rest } = overrides;
  return {
    id,
    role: "assistant",
    kind: "step",
    content: `第 ${id} 步`,
    created_at: new Date(Date.UTC(2026, 7, 20, 2, 0, id)).toISOString(),
    meta: { tool: "web_search", ...(meta || {}) },
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// 顺序
// ---------------------------------------------------------------------------

test("按 created_at 排序；同刻按 id；ui_action 不进回放", () => {
  const messages = [
    step(3),
    { id: 99, role: "assistant", kind: "ui_action", content: "打开右侧", created_at: "2026-08-20T02:00:00.000Z" },
    step(1),
    step(2),
  ];
  assert.deepEqual(
    buildReplaySteps(messages).map((entry) => entry.id),
    [1, 2, 3],
  );

  // 同一时刻（老数据同秒落库）时按 id 兜底，不许抖。
  const sameInstant = [
    { ...step(7), created_at: "2026-08-20T02:00:00.000Z" },
    { ...step(5), created_at: "2026-08-20T02:00:00.000Z" },
    { ...step(6), created_at: "2026-08-20T02:00:00.000Z" },
  ];
  assert.deepEqual(
    buildReplaySteps(sameInstant).map((entry) => entry.id),
    [5, 6, 7],
  );
});

test("空列表 / null 不炸，给空数组", () => {
  assert.deepEqual(buildReplaySteps(null), []);
  assert.deepEqual(buildReplaySteps(undefined), []);
  assert.deepEqual(buildReplaySteps([]), []);
});

test("行卡片标题：动作名来自工具名，对象来自 args_preview", () => {
  const [entry] = buildReplaySteps([
    step(1, {
      meta: {
        tool: "read_url",
        args_preview: '{"url":"https://finance.yahoo.com/quote/NVDA"}',
      },
    }),
  ]);
  assert.equal(entry.action, "读网页");
  assert.equal(entry.target, "https://finance.yahoo.com/quote/NVDA");

  // 表里没有的工具显示原名——宁可露出 `foo_bar`，也不要显示一个编出来的假名字。
  assert.equal(replayToolLabel("web_search"), "搜索");
  assert.equal(replayToolLabel("mcp__notion__query"), "mcp__notion__query");

  // 没有 args_preview 时退回消息正文。
  const [bare] = buildReplaySteps([step(2)]);
  assert.equal(bare.action, "搜索");
  assert.equal(bare.target, "第 2 步");
});

test("Result 按钮落在最终答案上；没有最终答案就落在最后一条", () => {
  const withFinal = buildReplaySteps([
    step(1),
    { id: 2, role: "assistant", kind: "text", content: "答案", meta: { final: true }, created_at: "2026-08-20T02:00:09.000Z" },
    { id: 3, role: "assistant", kind: "text", content: "补充", created_at: "2026-08-20T02:00:10.000Z" },
  ]);
  assert.equal(replayResultStepId(withFinal), 2);
  assert.equal(replayResultStepId(buildReplaySteps([step(1), step(2)])), 2);
  assert.equal(replayResultStepId([]), null);
});

// ---------------------------------------------------------------------------
// 节奏
// ---------------------------------------------------------------------------

test("节奏：不按真实耗时播，每条 300ms 起、长文本多给一点、封顶 1100ms", () => {
  const none = { kind: "none" };
  assert.equal(replayStepDelayMs("", none, none), REPLAY_BASE_STEP_MS);

  const short = replayStepDelayMs("查一下英伟达行情", none, none);
  const long = replayStepDelayMs("字".repeat(400), none, none);
  assert.ok(short >= REPLAY_BASE_STEP_MS && short <= 600, `短文本落在 300–600ms，实际 ${short}`);
  assert.ok(long > short, "长文本要比短文本多停一会儿");
  assert.equal(replayStepDelayMs("字".repeat(50_000), none, none), REPLAY_MAX_STEP_MS);

  // 结果预览也算体量：同一句话，带一张表的那条停得更久。
  const withTable = replayStepDelayMs(
    "读取行情页",
    none,
    parseReplayPreview(TABLE_PREVIEW, REPLAY_RESULT_PREVIEW_LIMIT),
  );
  assert.ok(withTable > replayStepDelayMs("读取行情页", none, none));

  // 真实耗时（created_at 相差 10 分钟）不该影响节奏：没人愿意等十分钟。
  const [fast, slow] = buildReplaySteps([
    { ...step(1), created_at: "2026-08-20T02:00:00.000Z" },
    { ...step(2), content: "第 1 步", created_at: "2026-08-20T02:10:00.000Z" },
  ]);
  assert.equal(fast.delayMs, slow.delayMs);
});

test("时间线是逐条累加的出现时刻", () => {
  const steps = buildReplaySteps([step(1), step(2), step(3)]);
  const timeline = replayTimeline(steps);
  assert.equal(timeline.length, 3);
  assert.equal(timeline[0], steps[0].delayMs);
  assert.equal(timeline[1], steps[0].delayMs + steps[1].delayMs);
  assert.equal(timeline[2], timeline[1] + steps[2].delayMs);
});

// ---------------------------------------------------------------------------
// 播放 / 跳过 / 重播
// ---------------------------------------------------------------------------

test("逐条播放：一条条露出来，露完停在完成态", () => {
  const steps = buildReplaySteps([step(1), step(2), step(3)]);
  let state = createReplayState(steps.length);
  assert.deepEqual(state, { total: 3, revealed: 0, status: "playing" });

  const seen = [];
  while (nextReplayDelayMs(state, steps) !== null) {
    state = replayReducer(state, { type: "reveal" });
    seen.push(state.revealed);
  }
  assert.deepEqual(seen, [1, 2, 3]);
  assert.equal(state.status, "completed");
  assert.equal(nextReplayDelayMs(state, steps), null);
});

test("一条都没有时直接是完成态（底部不许永远显示「正在播放」）", () => {
  const state = createReplayState(0);
  assert.deepEqual(state, { total: 0, revealed: 0, status: "completed" });
  assert.equal(nextReplayDelayMs(state, []), null);
});

test("跳过：一次铺完，且之后的定时器再也补不出第二条", () => {
  const steps = buildReplaySteps([step(1), step(2), step(3), step(4)]);
  let state = replayReducer(createReplayState(steps.length), { type: "reveal" });
  assert.equal(state.revealed, 1);

  state = replayReducer(state, { type: "skip" });
  assert.deepEqual(state, { total: 4, revealed: 4, status: "completed" });
  assert.equal(nextReplayDelayMs(state, steps), null);

  // 跳过之后哪怕有一个在途的定时器打进来，也不许把 revealed 推过 total、
  // 更不许把状态从 completed 掰回 playing。
  const after = replayReducer(state, { type: "reveal" });
  assert.equal(after, state, "completed 之后 reveal 必须是 no-op（连新对象都不该造）");
});

test("重播：从头再来，且能再次完整播完", () => {
  const steps = buildReplaySteps([step(1), step(2)]);
  let state = replayReducer(createReplayState(steps.length), { type: "skip" });
  assert.equal(state.status, "completed");

  state = replayReducer(state, { type: "restart" });
  assert.deepEqual(state, { total: 2, revealed: 0, status: "playing" });
  assert.equal(nextReplayDelayMs(state, steps), steps[0].delayMs);

  state = replayReducer(state, { type: "reveal" });
  state = replayReducer(state, { type: "reveal" });
  assert.deepEqual(state, { total: 2, revealed: 2, status: "completed" });
});

test("换一份数据 = 从头播这一份", () => {
  const state = replayReducer(createReplayState(2), { type: "skip" });
  assert.deepEqual(replayReducer(state, { type: "load", total: 5 }), {
    total: 5,
    revealed: 0,
    status: "playing",
  });
});

// ---------------------------------------------------------------------------
// 预览：缺失 / 超长 / 含表格
// ---------------------------------------------------------------------------

test("预览缺失：老任务没有这两个字段，一律「无预览」而不是报错", () => {
  for (const missing of [undefined, null, "", "   ", 42, {}, []]) {
    assert.deepEqual(parseReplayPreview(missing, REPLAY_ARGS_PREVIEW_LIMIT), {
      kind: "none",
    });
  }
  const [entry] = buildReplaySteps([step(1)]);
  assert.equal(entry.args.kind, "none");
  assert.equal(entry.result.kind, "none");
});

test("预览超长：截到合同上限并标出被截过", () => {
  const args = parseReplayPreview("a".repeat(5000), REPLAY_ARGS_PREVIEW_LIMIT);
  assert.equal(args.kind, "text");
  assert.equal(args.text.length, REPLAY_ARGS_PREVIEW_LIMIT);
  assert.equal(args.truncated, true);

  const result = parseReplayPreview("b".repeat(5000), REPLAY_RESULT_PREVIEW_LIMIT);
  assert.equal(result.text.length, REPLAY_RESULT_PREVIEW_LIMIT);
  assert.equal(result.truncated, true);

  const fits = parseReplayPreview("刚好一句话", REPLAY_RESULT_PREVIEW_LIMIT);
  assert.equal(fits.truncated, false);
});

test("预览含表格：制表符 / markdown 竖线都画成真表格，第一行当表头", () => {
  const tabbed = parseReplayPreview(TABLE_PREVIEW, REPLAY_RESULT_PREVIEW_LIMIT);
  assert.equal(tabbed.kind, "table");
  assert.deepEqual(tabbed.header, ["日期", "收盘", "成交量"]);
  assert.deepEqual(tabbed.rows, [
    ["2026-08-19", "185.22", "41203900"],
    ["2026-08-18", "182.40", "38551200"],
  ]);
  assert.equal(tabbed.truncated, false);

  const markdown = parseReplayPreview(
    ["| 名称 | 数量 |", "| --- | --: |", "| 苹果 | 3 |", "| 梨 | 4 |"].join("\n"),
    REPLAY_RESULT_PREVIEW_LIMIT,
  );
  assert.equal(markdown.kind, "table");
  assert.deepEqual(markdown.header, ["名称", "数量"]);
  assert.deepEqual(markdown.rows, [["苹果", "3"], ["梨", "4"]]);
});

test("像句子的东西不许被当成表格", () => {
  // 中文正文里逗号满地都是；按逗号切会把一段话切成假表格。
  const prose = parseReplayPreview(
    "今天天气不错，适合出门。\n明天要下雨，记得带伞。",
    REPLAY_RESULT_PREVIEW_LIMIT,
  );
  assert.equal(prose.kind, "text");

  // 单行、没有分隔符、格数对不齐，都不是表格。
  assert.equal(parseReplayPreview("只有一行\t两格", REPLAY_RESULT_PREVIEW_LIMIT).kind, "text");
  assert.equal(detectPreviewTable("a\tb\nc\td\te"), null);
  assert.equal(detectPreviewTable('姓名,备注\n张三,"他说，好"'), null);
});

test("表格行数超上限时裁掉并标出被截过", () => {
  const rows = ["列一\t列二"];
  for (let index = 0; index < REPLAY_TABLE_MAX_ROWS + 8; index += 1) {
    rows.push(`第${index}行\t${index}`);
  }
  const preview = parseReplayPreview(rows.join("\n"), 100_000);
  assert.equal(preview.kind, "table");
  // 表头占掉上限里的一行，剩下的才是数据行。
  assert.equal(preview.rows.length, REPLAY_TABLE_MAX_ROWS - 1);
  assert.equal(preview.truncated, true);
});

test("行卡片标题在表格预览与非 JSON 入参上都拿得到一句人话", () => {
  assert.equal(
    replayStepTarget(parseReplayPreview("查一下\n第二行", 1024), "兜底"),
    "查一下",
  );
  assert.equal(replayStepTarget({ kind: "none" }, "兜底"), "兜底");
  // 入参里一个字符串字段都没有（全是数字/布尔）：没什么可当标题的，退回兜底。
  assert.equal(
    replayStepTarget(parseReplayPreview('{"limit":5,"deep":true}', 1024), "兜底"),
    "兜底",
  );
  // 表格形态的入参拿表头当标题。
  assert.equal(
    replayStepTarget(parseReplayPreview(TABLE_PREVIEW, 2048), "兜底"),
    "日期 · 收盘 · 成交量",
  );
});

// ---------------------------------------------------------------------------
// 取数：匿名只读
// ---------------------------------------------------------------------------

test("GET /v1/share/<id> 不带 cookie、不带 token，且只留合同允许的六个键", async () => {
  const calls = [];
  const result = await fetchSharedReplay("abc 123", {
    gatewayBase: "https://api.oceanleo.com",
    async fetchImpl(url, init) {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            title: "标题",
            created_at: "2026-08-20T02:00:00.000Z",
            owner_email: "leak@example.com",
            messages: [
              {
                id: 1,
                role: "user",
                kind: "text",
                content: "hi",
                created_at: "2026-08-20T02:00:00.000Z",
                user_id: "should-be-dropped",
              },
            ],
          };
        },
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.oceanleo.com/v1/share/abc%20123");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(
    Object.keys(calls[0].init.headers).some((key) => /authorization/i.test(key)),
    false,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.data.messages[0]).sort(), [
    "content",
    "created_at",
    "id",
    "kind",
    "meta",
    "role",
  ]);
  assert.equal("owner_email" in result.data, false);
});

test("取数失败给出可渲染的错误，不抛", async () => {
  const notFound = await fetchSharedReplay("gone", {
    gatewayBase: "https://api.oceanleo.com",
    async fetchImpl() {
      return { ok: false, status: 404, async json() { return {}; } };
    },
  });
  assert.equal(notFound.ok, false);
  assert.equal(notFound.status, 404);

  const offline = await fetchSharedReplay("x", {
    gatewayBase: "https://api.oceanleo.com",
    async fetchImpl() {
      throw new Error("boom");
    },
  });
  assert.equal(offline.ok, false);
  assert.equal(offline.error, "boom");

  assert.equal((await fetchSharedReplay("  ")).ok, false);
});

test("后端回了怪东西也要给一份能渲染的空壳", () => {
  assert.deepEqual(normalizeSharedReplay("s", null), {
    share_id: "s",
    title: "",
    created_at: undefined,
    messages: [],
  });
  assert.deepEqual(
    normalizeSharedReplay("s", { messages: [null, 7, { content: "只有正文" }] }).messages,
    [{ id: 2, role: "assistant", kind: "text", content: "只有正文", meta: undefined, created_at: undefined }],
  );
});
