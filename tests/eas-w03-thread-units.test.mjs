// ============================================================================
// 续聊变慢·前端的纯函数（editors-and-shell-0924 · W03）
// ----------------------------------------------------------------------------
// 组件层的判据在 `eas-w03-agent-thread-live.test.mjs`（真组件 + 假时钟）；这里钉的是
// 它们共用的四块积木各自的边界：TTFV 记账、「这一轮」的判定、按 id 合并与游标、
// 在途拉取的先后次序。
// ============================================================================

import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register("./ts-extension-loader.mjs", import.meta.url);

const fakeStorage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (fakeStorage.has(key) ? fakeStorage.get(key) : null),
    setItem: (key, value) => fakeStorage.set(key, String(value)),
    removeItem: (key) => fakeStorage.delete(key),
  },
};

const {
  markSend,
  markFirstVisible,
  noteFirstVisibleReply,
  readTtfv,
  sentAtFor,
  TTFV_DEBUG_FLAG,
} = await import("../src/shell/agent-thread/ttfv.ts");
const { latestTurn, userTurnCount } = await import("../src/shell/agent-thread/turn.ts");
const { applyAgentDelta, mergeAgentMessages, readNextAfterId } = await import(
  "../src/shell/agent-thread/merge.ts"
);
const { createAgentThreadSync } = await import("../src/shell/agent-thread/sync.ts");
const { thinkingLabel } = await import("../src/shell/agent-thread/thinking-label.ts");
const { EAS_W03_MESSAGES } = await import("../src/i18n/ui/messages/eas-w03-copy.ts");
const { LOCALES } = await import("../src/i18n/config.ts");

const user = (id, content = "hi") => ({ id, role: "user", kind: "text", content });
const reply = (id, content, meta) => ({
  id,
  role: "assistant",
  kind: "text",
  content,
  ...(meta ? { meta } : {}),
});

// ---------------------------------------------------------------------------
// TTFV
// ---------------------------------------------------------------------------

test("TTFV：同一轮先 markSend 再 markFirstVisible 记一条，写进 window.__oleoAgentTtfv", () => {
  markSend("task-a", 2, 1_000);
  assert.equal(sentAtFor("task-a", "2"), 1_000, "turnKey 数字与字符串是同一轮");
  const record = markFirstVisible("task-a", 2, {
    messageId: 7,
    firstTokenMs: 1200,
    replyPath: "reply",
  });
  assert.ok(record, "有发送记录的这一轮第一次出字应记账");
  assert.equal(record.taskId, "task-a");
  assert.equal(record.turnKey, "2");
  assert.equal(record.sentAt, 1_000);
  assert.equal(record.ttfvMs, record.visibleAt - 1_000);
  assert.equal(record.messageId, 7);
  assert.equal(record.firstTokenMs, 1200);
  assert.equal(record.replyPath, "reply");
  assert.ok(window.__oleoAgentTtfv.includes(record), "记录落在 window.__oleoAgentTtfv 上，V3 直接读");
  assert.equal(sentAtFor("task-a", 2), null, "记完就不再等这一轮");
});

test("TTFV：没有发送记录（刷新后回看旧回答）不记；同一轮第二次出字不重复记", () => {
  const before = readTtfv().length;
  assert.equal(markFirstVisible("task-history", 1), null);
  markSend("task-b", 1, 5_000);
  assert.ok(markFirstVisible("task-b", 1));
  assert.equal(markFirstVisible("task-b", 1), null, "流式继续长不是第二次首字");
  assert.equal(readTtfv().length, before + 1);
  markSend("", 1, 5_000);
  assert.equal(markFirstVisible("", 1), null, "还没有 task id 的发送不记（新建路径建好后补记）");
});

test("TTFV：readTtfv 给副本，改它不动原始记录", () => {
  markSend("task-c", 1, 10);
  markFirstVisible("task-c", 1);
  const copy = readTtfv();
  copy.length = 0;
  assert.ok(readTtfv().some((record) => record.taskId === "task-c"));
});

test("TTFV：只有调试开关 oleo.debug.ttfv=1 时才往 console 打一行", () => {
  const lines = [];
  const original = console.info;
  console.info = (...args) => lines.push(args.map(String).join(" "));
  try {
    markSend("task-quiet", 1, 0);
    markFirstVisible("task-quiet", 1);
    assert.equal(lines.length, 0, "默认不打");

    assert.equal(TTFV_DEBUG_FLAG, "oleo.debug.ttfv");
    window.localStorage.setItem(TTFV_DEBUG_FLAG, "1");
    markSend("task-loud", 3, 0);
    markFirstVisible("task-loud", 3, { replyPath: "canned" });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /ttfv/);
    assert.match(lines[0], /task-loud/);
    assert.match(lines[0], /canned/);
  } finally {
    console.info = original;
    window.localStorage.removeItem(TTFV_DEBUG_FLAG);
  }
});

test("TTFV：noteFirstVisibleReply 只认本轮回复的非空正文", () => {
  const history = [user(1), reply(2, "上一轮的回答", { done: true }), user(3, "你是谁")];
  markSend("task-d", 2, 0);
  assert.equal(noteFirstVisibleReply("task-d", history), null, "本轮还没有回复行");
  assert.equal(
    noteFirstVisibleReply("task-d", [...history, reply(4, "", { streaming: true })]),
    null,
    "空内容的回复行不触发",
  );
  assert.equal(
    noteFirstVisibleReply("task-d", [
      ...history,
      { id: 4, role: "assistant", kind: "plan", content: "1. 查资料" },
      { id: 5, role: "assistant", kind: "step", content: "正在搜索" },
      { id: 6, role: "assistant", kind: "text", content: "想法", meta: { interim: true } },
      { id: 7, role: "assistant", kind: "ui_action", content: "{\"tab\":\"preview\"}" },
    ]),
    null,
    "过程消息与机器动作不是回复正文",
  );
  const record = noteFirstVisibleReply("task-d", [
    ...history,
    reply(8, "我是 Leo。", { streaming: true, first_token_ms: 900, reply_path: "reply" }),
  ]);
  assert.ok(record);
  assert.equal(record.turnKey, "2");
  assert.equal(record.messageId, 8);
  assert.equal(record.firstTokenMs, 900);
  assert.equal(record.replyPath, "reply");
});

test("TTFV：记录只留最近 100 条", () => {
  for (let index = 0; index < 130; index += 1) {
    markSend("task-many", index, 0);
    markFirstVisible("task-many", index);
  }
  const all = readTtfv();
  assert.ok(all.length <= 100);
  assert.equal(all.at(-1).turnKey, "129", "留的是最新的");
});

// ---------------------------------------------------------------------------
// 这一轮
// ---------------------------------------------------------------------------

test("latestTurn：轮次 = 用户说了几句；可见 = 本轮回复有正文或是非文本产物", () => {
  assert.equal(userTurnCount([]), 0);
  assert.equal(userTurnCount([user(1), reply(2, "a"), user(3)]), 2);

  assert.deepEqual(latestTurn([]), { turn: 0, firstText: null, visible: false, thinkingChars: null });

  const waiting = latestTurn([user(1), reply(2, "a", { done: true }), user(3)]);
  assert.equal(waiting.turn, 2);
  assert.equal(waiting.visible, false, "上一轮的回答不算这一轮");

  const empty = latestTurn([user(1), reply(2, "", { streaming: true, thinking_chars: 480 })]);
  assert.equal(empty.visible, false);
  assert.equal(empty.thinkingChars, 480);

  for (const bad of ["480", -3, Number.NaN, Number.POSITIVE_INFINITY, 0, null]) {
    assert.equal(
      latestTurn([user(1), reply(2, "", { thinking_chars: bad })]).thinkingChars,
      null,
      `thinking_chars=${String(bad)} 不是可显示的字数`,
    );
  }

  const artifact = latestTurn([
    user(1),
    { id: 2, role: "assistant", kind: "artifact", content: "", meta: { artifact: { type: "ppt" } } },
  ]);
  assert.equal(artifact.visible, true, "产物卡片也是用户看得见的回复");
  assert.equal(artifact.firstText, null, "但它不是首个文字");

  const spoken = latestTurn([user(1), reply(2, "  "), reply(3, "答", { thinking_chars: 99 })]);
  assert.equal(spoken.visible, true);
  assert.equal(spoken.firstText.id, 3, "只有空白的行不算出字");
  assert.equal(spoken.thinkingChars, null, "出字之后不再报思考字数");
});

// ---------------------------------------------------------------------------
// 按 id 合并与游标
// ---------------------------------------------------------------------------

test("mergeAgentMessages：内容没变的行沿用原对象；全没变就原样返回同一张表", () => {
  const current = [user(1), reply(2, "你好", { done: true }), user(3), reply(4, "", { streaming: true })];
  const same = current.map((message) => JSON.parse(JSON.stringify(message)));
  assert.equal(mergeAgentMessages(current, same), current, "同样内容的第二次轮询不产生新表");

  const grown = same.map((message) => ({ ...message }));
  grown[3] = reply(4, "我", { streaming: true });
  const merged = mergeAgentMessages(current, grown);
  assert.notEqual(merged, current);
  for (const index of [0, 1, 2]) assert.equal(merged[index], current[index], `第 ${index} 行应沿用原对象`);
  assert.equal(merged[3], grown[3], "变了的行换成新内容");

  const metaOnly = same.map((message) => ({ ...message }));
  metaOnly[3] = reply(4, "", { streaming: false, done: true });
  assert.notEqual(mergeAgentMessages(current, metaOnly)[3], current[3], "只改 meta（C1 原地收尾）也算变化");

  const optimistic = [...current, { id: 1_760_000_000_000, role: "user", kind: "text", content: "刚发的" }];
  const confirmed = [...same, user(5, "刚发的")];
  const afterSend = mergeAgentMessages(optimistic, confirmed);
  assert.equal(afterSend.length, 5, "乐观插入的那条被服务端那条替掉，不是两条");
  assert.equal(afterSend[0], optimistic[0]);
  assert.equal(afterSend[4], confirmed[4]);
});

test("applyAgentDelta：游标之前的行原样保留，之后的以增量为准", () => {
  const current = [user(1), reply(2, "你好", { done: true }), user(3), reply(4, "我", { streaming: true })];
  const delta = [reply(4, "我是", { streaming: true }), user(5, "还有")];
  const merged = applyAgentDelta(current, delta, 3);
  assert.deepEqual(merged.map((message) => message.id), [1, 2, 3, 4, 5]);
  assert.equal(merged[0], current[0]);
  assert.equal(merged[2], current[2]);
  assert.equal(merged[3].content, "我是");

  const unchanged = applyAgentDelta(current, [JSON.parse(JSON.stringify(current[3]))], 3);
  assert.equal(unchanged, current, "增量里的行没变就是同一张表");

  const dropped = applyAgentDelta(current, [], 3);
  assert.deepEqual(dropped.map((message) => message.id), [1, 2, 3], "游标之后服务端不再有的行要去掉");
});

test("readNextAfterId：只有非负安全整数才算网关支持游标", () => {
  assert.equal(readNextAfterId({ next_after_id: 12 }), 12);
  assert.equal(readNextAfterId({ next_after_id: 0 }), 0);
  for (const bad of [undefined, null, "12", -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
    assert.equal(readNextAfterId({ next_after_id: bad }), null, `next_after_id=${String(bad)}`);
  }
  assert.equal(readNextAfterId(null), null);
});

// ---------------------------------------------------------------------------
// 在途拉取的先后次序
// ---------------------------------------------------------------------------

test("sync：见到 next_after_id 才带游标；响应不带它就回到全表", () => {
  const sync = createAgentThreadSync();
  const first = sync.begin("t");
  assert.equal(first.options, undefined, "第一次拉全表");
  const full = [user(1), reply(2, "", { streaming: true })];
  const afterFirst = sync.settle(first, [], { messages: full, next_after_id: 1 });
  assert.deepEqual(afterFirst.map((message) => message.id), [1, 2]);

  const second = sync.begin("t");
  assert.deepEqual(second.options, { afterId: 1 });
  const afterSecond = sync.settle(second, afterFirst, {
    messages: [reply(2, "字", { streaming: true })],
    next_after_id: 1,
  });
  assert.equal(afterSecond[0], afterFirst[0], "游标之前的行沿用原对象");
  assert.equal(afterSecond[1].content, "字");

  const third = sync.begin("t");
  const rolledBack = sync.settle(third, afterSecond, { messages: [user(1), reply(2, "字全了")] });
  assert.deepEqual(rolledBack.map((message) => message.content), ["hi", "字全了"], "不带游标的响应就是全表");
  assert.equal(sync.begin("t").options, undefined, "网关不再给游标就不再发 after_id");
});

test("sync：续聊被网关接下之后，之前发出的在途拉取作废，不许把旧状态写回", () => {
  const sync = createAgentThreadSync();
  const current = [user(1), reply(2, "答", { done: true })];
  const inFlight = sync.begin("t");
  sync.invalidate();
  const fresh = sync.begin("t");
  const withFollowUp = [...current, user(3, "再说")];
  assert.ok(sync.settle(fresh, current, { messages: withFollowUp }));
  assert.equal(sync.settle(inFlight, withFollowUp, { messages: current }), null, "在途的旧响应作废");
});

test("sync：先发的后到不许覆盖后发的；换了 task 旧 task 的响应一律作废", () => {
  const sync = createAgentThreadSync();
  const older = sync.begin("t");
  const newer = sync.begin("t");
  const rows = [user(1), reply(2, "新")];
  assert.ok(sync.settle(newer, [], { messages: rows }));
  assert.equal(sync.settle(older, rows, { messages: [user(1)] }), null);

  const stale = sync.begin("t");
  const other = sync.begin("u");
  assert.equal(other.options, undefined, "换 task 游标清零");
  assert.equal(sync.settle(stale, rows, { messages: rows }), null);
  assert.ok(sync.settle(other, [], { messages: [user(9)] }));
});

// ---------------------------------------------------------------------------
// 读秒文案
// ---------------------------------------------------------------------------

const tt = (zh, vars) => zh.replace(/\{(\w+)\}/g, (match, key) => (vars && key in vars ? String(vars[key]) : match));

test("thinkingLabel：秒数一直在；后端给了思考字数才带上字数", () => {
  assert.equal(thinkingLabel(tt, 0, null), "正在思考 · 0 秒");
  assert.equal(thinkingLabel(tt, 3, null), "正在思考 · 3 秒");
  assert.equal(thinkingLabel(tt, 5, 1234), "正在思考… 已想 1234 字 · 5 秒");
});

test("读秒文案在 17 个语种都有，且占位符一个不丢", () => {
  const keys = ["正在思考 · {seconds} 秒", "正在思考… 已想 {chars} 字 · {seconds} 秒"];
  for (const locale of LOCALES) {
    for (const key of keys) {
      const text = EAS_W03_MESSAGES[locale]?.[key];
      assert.equal(typeof text, "string", `${locale} 缺「${key}」`);
      for (const slot of key.match(/\{\w+\}/g)) {
        assert.ok(text.includes(slot), `${locale}「${text}」丢了 ${slot}`);
      }
    }
  }
});
