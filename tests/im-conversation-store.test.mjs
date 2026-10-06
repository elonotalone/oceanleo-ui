// W09：会话缓存——乐观发送、同 client_id 去重、补缺口、事件增量、撤回/编辑/隐藏。
import assert from "node:assert/strict";
import test from "node:test";

import {
  ConversationStore,
  applyReactionLocal,
  clearConversationStores,
  getConversationStore,
  mergeMessages,
  buildRows,
  unreadBoundary,
  GROUP_WINDOW_MS,
} from "../src/shell/messages/conversation/conversation-store.ts";

const CONV = "c1";
const ME = "me";
const PEER = "peer";

function msg(seq, overrides = {}) {
  return {
    id: `m${seq}`,
    conversation_id: CONV,
    seq,
    sender_id: PEER,
    sender_kind: "user",
    kind: "text",
    body: `消息${seq}`,
    mentions: [],
    mention_all: false,
    mention_leo: false,
    quote: null,
    thread_root_id: null,
    thread: null,
    attachments: [],
    card: null,
    transcript: null,
    reactions: [],
    pinned: false,
    edited_at: null,
    recalled_at: null,
    recalled_by: null,
    hidden_reason: null,
    leo: null,
    mention_reads: null,
    client_id: null,
    created_at: "2026-10-06T00:00:00Z",
    ...overrides,
  };
}

function range(from, to) {
  const out = [];
  for (let seq = from; seq <= to; seq += 1) out.push(msg(seq));
  return out;
}

/** 假后端：按 seq 切页，记录每次调用。 */
function fakeApi(all, options = {}) {
  const calls = [];
  const sent = [];
  const api = {
    calls,
    sent,
    async listMessages(conversationId, params = {}) {
      calls.push({ conversationId, ...params });
      const limit = params.limit ?? 50;
      const main = all.filter((m) => !m.thread_root_id);
      let items;
      let hasBefore;
      let hasAfter;
      if (params.around_seq) {
        const idx = main.findIndex((m) => m.seq >= params.around_seq);
        const start = Math.max(0, idx - Math.floor(limit / 2));
        items = main.slice(start, start + limit);
        hasBefore = start > 0;
        hasAfter = start + limit < main.length;
      } else if (params.after_seq !== undefined) {
        const rest = main.filter((m) => m.seq > params.after_seq);
        items = rest.slice(0, limit);
        hasBefore = true;
        hasAfter = rest.length > limit;
      } else if (params.before_seq !== undefined) {
        const rest = main.filter((m) => m.seq < params.before_seq);
        items = rest.slice(Math.max(0, rest.length - limit));
        hasBefore = rest.length > limit;
        hasAfter = false;
      } else {
        items = main.slice(Math.max(0, main.length - limit));
        hasBefore = main.length > limit;
        hasAfter = false;
      }
      return {
        items,
        has_more_before: hasBefore,
        has_more_after: hasAfter,
        peer_last_read_seq: options.peerRead,
      };
    },
    async sendMessage(conversationId, input) {
      sent.push(input);
      if (options.failSend) {
        const error = new Error("网络不通");
        error.code = "network";
        throw error;
      }
      const existing = all.find((m) => m.client_id === input.client_id);
      if (existing) return existing;
      const created = msg(all.length + 1, {
        id: `srv-${input.client_id}`,
        sender_id: ME,
        body: input.body ?? "",
        client_id: input.client_id,
        kind: input.kind,
      });
      all.push(created);
      return created;
    },
    async editMessage(id, body) {
      const target = all.find((m) => m.id === id);
      return { ...target, body, edited_at: "2026-10-06T01:00:00Z" };
    },
    async recallMessage(id) {
      const target = all.find((m) => m.id === id);
      return { ...target, body: "", recalled_at: "2026-10-06T01:00:00Z", recalled_by: "sender" };
    },
    async addReaction() {
      if (options.failReaction) throw new Error("x");
    },
    async removeReaction() {},
    async listPins() {
      return [];
    },
    async pin() {},
    async unpin() {},
    async getThread(rootId) {
      const root = all.find((m) => m.id === rootId);
      return { root, items: all.filter((m) => m.thread_root_id === rootId) };
    },
  };
  return api;
}

function makeStore(all, options, extra = {}) {
  const api = fakeApi(all, options);
  const store = new ConversationStore({
    api,
    conversationId: CONV,
    viewerId: ME,
    newId: (() => {
      let n = 0;
      return () => `cid-${(n += 1)}`;
    })(),
    ...extra,
  });
  return { api, store };
}

const seqs = (store) => store.getSnapshot().messages.map((m) => m.seq);

test("打开会话：最新一页按 seq 升序，上滚用 before_seq 加载更早的", async () => {
  const { api, store } = makeStore(range(1, 120));
  await store.loadLatest();
  assert.equal(seqs(store)[0], 71);
  assert.equal(seqs(store).at(-1), 120);
  assert.equal(store.getSnapshot().hasMoreBefore, true);
  await store.loadBefore();
  assert.equal(api.calls.at(-1).before_seq, 71);
  assert.equal(seqs(store)[0], 21);
  await store.loadBefore();
  assert.equal(seqs(store)[0], 1);
  assert.equal(store.getSnapshot().hasMoreBefore, false);
  assert.deepEqual(seqs(store), [...seqs(store)].sort((a, b) => a - b));
});

test("乐观发送：先出现「发送中」，成功后换成服务端那条，不重复", async () => {
  const { store } = makeStore(range(1, 3));
  await store.loadLatest();
  const pendingSeen = [];
  store.subscribe(() => pendingSeen.push(store.getSnapshot().pending.map((p) => p.status)));
  const done = store.send({ kind: "text", body: "你好" });
  assert.equal(store.getSnapshot().pending.length, 1);
  assert.equal(store.getSnapshot().pending[0].status, "sending");
  assert.equal(store.getSnapshot().pending[0].message.body, "你好");
  const sent = await done;
  assert.equal(sent.client_id, "cid-1");
  assert.equal(store.getSnapshot().pending.length, 0);
  assert.equal(store.getSnapshot().messages.filter((m) => m.body === "你好").length, 1);
});

test("同 client_id 去重：事件先于响应到达也只留一条", async () => {
  const all = range(1, 3);
  const { store } = makeStore(all);
  await store.loadLatest();
  const promise = store.send({ kind: "text", body: "先到的事件", client_id: "dup-1" });
  // 事件先到
  const serverMessage = msg(4, { id: "srv-dup-1", sender_id: ME, body: "先到的事件", client_id: "dup-1" });
  store.applyEvent({ type: "message.created", conversation_id: CONV, message: serverMessage });
  assert.equal(store.getSnapshot().pending.length, 0);
  await promise;
  assert.equal(store.getSnapshot().messages.filter((m) => m.client_id === "dup-1").length, 1);
  // 同一事件重复到达
  store.applyEvent({ type: "message.created", conversation_id: CONV, message: serverMessage });
  assert.equal(store.getSnapshot().messages.filter((m) => m.id === "srv-dup-1").length, 1);
});

test("发送失败：留在列表里标失败，重试用同一个 client_id", async () => {
  const all = range(1, 2);
  const failing = fakeApi(all, { failSend: true });
  const store = new ConversationStore({ api: failing, conversationId: CONV, viewerId: ME, newId: () => "retry-1" });
  await store.loadLatest();
  const result = await store.send({ kind: "text", body: "会失败" });
  assert.equal(result, null);
  const [entry] = store.getSnapshot().pending;
  assert.equal(entry.status, "failed");
  assert.ok(entry.error);
  // 网络恢复
  failing.sendMessage = async (conversationId, input) => {
    failing.sent.push(input);
    const created = msg(3, { id: "srv-retry-1", sender_id: ME, body: input.body, client_id: input.client_id });
    all.push(created);
    return created;
  };
  const again = await store.retry("retry-1");
  assert.equal(again.id, "srv-retry-1");
  assert.equal(store.getSnapshot().pending.length, 0);
  assert.deepEqual(
    failing.sent.map((s) => s.client_id),
    ["retry-1", "retry-1"],
  );
});

test("补缺口：事件跳号时从上一个 seq 往后补", async () => {
  const all = range(1, 10);
  const { api, store } = makeStore(all);
  await store.loadLatest();
  all.push(msg(11), msg(12), msg(13));
  // 只收到 13，漏了 11、12
  store.applyEvent({ type: "message.created", conversation_id: CONV, message: all[12] });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const afterCalls = api.calls.filter((c) => c.after_seq !== undefined);
  assert.equal(afterCalls.length >= 1, true);
  assert.equal(afterCalls[0].after_seq, 10);
  assert.deepEqual(seqs(store), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
});

test("断线重连 catchUp：用 after_seq 补到底，分页也补全", async () => {
  const all = range(1, 5);
  const { api, store } = makeStore(all);
  await store.loadLatest();
  for (let seq = 6; seq <= 130; seq += 1) all.push(msg(seq));
  await store.catchUp();
  assert.equal(seqs(store).at(-1), 130);
  assert.equal(seqs(store).length, 130);
  assert.equal(api.calls.filter((c) => c.after_seq !== undefined).length, 3);
});

test("定位 around_seq：窗口停在历史里时，新事件不插进窗口", async () => {
  const all = range(1, 200);
  const { store } = makeStore(all);
  await store.loadAround(100);
  assert.equal(store.getSnapshot().hasMoreAfter, true);
  const before = seqs(store).length;
  store.applyEvent({ type: "message.created", conversation_id: CONV, message: msg(201) });
  assert.equal(seqs(store).length, before);
  await store.loadAfter();
  assert.ok(seqs(store).includes(125) || seqs(store).at(-1) > 125);
});

test("撤回：换成占位状态，正文清空", async () => {
  const all = range(1, 3);
  const { store } = makeStore(all);
  await store.loadLatest();
  store.applyEvent({
    type: "message.updated",
    conversation_id: CONV,
    message: msg(2, { body: "", recalled_at: "2026-10-06T02:00:00Z", recalled_by: "admin" }),
  });
  const m = store.find("m2");
  assert.equal(m.recalled_by, "admin");
  assert.equal(m.body, "");
  assert.equal(seqs(store).length, 3);
});

test("编辑：正文与「已编辑」更新，位置不变", async () => {
  const all = range(1, 3);
  const { store } = makeStore(all);
  await store.loadLatest();
  const updated = await store.edit("m2", "改过的");
  assert.equal(updated.body, "改过的");
  assert.equal(store.find("m2").body, "改过的");
  assert.ok(store.find("m2").edited_at);
  assert.deepEqual(seqs(store), [1, 2, 3]);
});

test("审核隐藏：事件把消息换成隐藏占位", async () => {
  const all = range(1, 3);
  const { store } = makeStore(all);
  await store.loadLatest();
  store.applyEvent({
    type: "message.updated",
    conversation_id: CONV,
    message: msg(3, { body: "", hidden_reason: "moderation" }),
  });
  assert.equal(store.find("m3").hidden_reason, "moderation");
});

test("其他会话的事件不影响本会话", async () => {
  const { store } = makeStore(range(1, 3));
  await store.loadLatest();
  store.applyEvent({
    type: "message.created",
    conversation_id: "other",
    message: msg(4, { conversation_id: "other" }),
  });
  assert.deepEqual(seqs(store), [1, 2, 3]);
});

test("表情：事件覆盖摘要并重算「我」；本地点击先改后发请求，失败回滚", async () => {
  const all = range(1, 2);
  const { store } = makeStore(all);
  await store.loadLatest();
  store.applyEvent({
    type: "reaction.changed",
    conversation_id: CONV,
    message_id: "m1",
    reactions: [{ emoji: "👍", count: 2, mine: false, user_ids: [PEER, ME] }],
  });
  assert.equal(store.find("m1").reactions[0].mine, true);
  await store.toggleReaction("m1", "👍");
  assert.equal(store.find("m1").reactions[0].count, 1);
  assert.equal(store.find("m1").reactions[0].mine, false);

  const bad = makeStore(range(1, 2), { failReaction: true });
  await bad.store.loadLatest();
  await bad.store.toggleReaction("m1", "🎉");
  assert.equal(bad.store.find("m1").reactions.length, 0);

  assert.deepEqual(applyReactionLocal([], "❤️", ME, true)[0].count, 1);
});

test("leo.delta 累加成 streaming，最终 message.updated 后清掉", async () => {
  const leoMessage = msg(2, {
    sender_id: null,
    sender_kind: "leo",
    kind: "leo",
    body: "",
    leo: { status: "streaming", payer: "personal" },
  });
  const { store } = makeStore([msg(1), leoMessage]);
  await store.loadLatest();
  store.applyEvent({ type: "leo.delta", conversation_id: CONV, message_id: "m2", text: "你" });
  store.applyEvent({ type: "leo.delta", conversation_id: CONV, message_id: "m2", text: "好" });
  assert.equal(store.getSnapshot().streaming.m2, "你好");
  store.applyEvent({
    type: "message.updated",
    conversation_id: CONV,
    message: { ...leoMessage, body: "你好呀", leo: { status: "done", payer: "personal" } },
  });
  assert.equal(store.getSnapshot().streaming.m2, undefined);
  assert.equal(store.find("m2").body, "你好呀");
});

test("leo.notice 只存本地，可以关掉", async () => {
  const { store } = makeStore(range(1, 2));
  await store.loadLatest();
  store.applyEvent({
    type: "leo.notice",
    conversation_id: CONV,
    trigger_message_id: "m2",
    code: "insufficient_balance",
  });
  assert.equal(store.getSnapshot().notices.m2, "insufficient_balance");
  store.dismissNotice("m2");
  assert.equal(store.getSnapshot().notices.m2, undefined);
});

test("已读：私聊推进对方已读 seq；群里被 @ 的人读了就在我发的消息上打勾", async () => {
  const mine = msg(2, {
    sender_id: ME,
    mentions: [PEER, "third"],
    mention_reads: { [PEER]: false, third: false },
  });
  const { store } = makeStore([msg(1), mine], { peerRead: 1 });
  await store.loadLatest();
  assert.equal(store.getSnapshot().peerLastReadSeq, 1);
  store.applyEvent({ type: "read.updated", conversation_id: CONV, user_id: PEER, last_read_seq: 2 });
  assert.equal(store.getSnapshot().peerLastReadSeq, 2);
  assert.deepEqual(store.find("m2").mention_reads, { [PEER]: true, third: false });
  // 自己的已读事件不改对方已读
  store.applyEvent({ type: "read.updated", conversation_id: CONV, user_id: ME, last_read_seq: 99 });
  assert.equal(store.getSnapshot().peerLastReadSeq, 2);
});

test("线程回帖不进主线；根消息的回复摘要会刷新", async () => {
  const root = msg(1, { thread: { reply_count: 0, last_reply_at: null, participant_ids: [] } });
  const reply = msg(2, { thread_root_id: "m1", id: "r1" });
  const all = [root, reply];
  const { api, store } = makeStore(all);
  await store.loadLatest();
  assert.deepEqual(seqs(store), [1]);
  const refreshed = { ...root, thread: { reply_count: 1, last_reply_at: "x", participant_ids: [PEER] } };
  api.getThread = async () => ({ root: refreshed, items: [reply] });
  store.applyEvent({ type: "message.created", conversation_id: CONV, message: reply });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(seqs(store), [1]);
  assert.equal(store.find("m1").thread.reply_count, 1);
});

test("线程 store：只装该根消息下的回帖，发送自带 thread_root_id", async () => {
  const root = msg(1);
  const reply = msg(2, { thread_root_id: "m1", id: "r1" });
  const all = [root, reply];
  const api = fakeApi(all);
  const store = new ConversationStore({
    api,
    conversationId: CONV,
    viewerId: ME,
    threadRootId: "m1",
    newId: () => "t-1",
  });
  await store.loadLatest();
  assert.equal(store.getSnapshot().root.id, "m1");
  assert.deepEqual(seqs(store), [2]);
  await store.send({ kind: "text", body: "回一句" });
  assert.equal(api.sent[0].thread_root_id, "m1");
});

test("缓存：同会话取到同一个 store，退出重进不丢消息", async () => {
  clearConversationStores();
  const api = fakeApi(range(1, 3));
  const a = getConversationStore({ api, conversationId: CONV, viewerId: ME });
  await a.loadLatest();
  const b = getConversationStore({ api, conversationId: CONV, viewerId: ME });
  assert.equal(a, b);
  assert.equal(b.getSnapshot().messages.length, 3);
  const c = getConversationStore({ api, conversationId: "c2", viewerId: ME });
  assert.notEqual(a, c);
  clearConversationStores();
});

test("mergeMessages：同 id 以新的为准，按 seq 排序", () => {
  const merged = mergeMessages([msg(1), msg(3)], [msg(2), msg(3, { body: "新" })]);
  assert.deepEqual(
    merged.map((m) => [m.seq, m.body]),
    [
      [1, "消息1"],
      [2, "消息2"],
      [3, "新"],
    ],
  );
});

// ── 消息流的行 ─────────────────────────────────────────────────────────────
function at(seq, iso, overrides = {}) {
  return msg(seq, { created_at: iso, ...overrides });
}

test("同一人 5 分钟内连续消息合并头像；超过 5 分钟、换人、系统消息都不合并", () => {
  assert.equal(GROUP_WINDOW_MS, 5 * 60 * 1000);
  const rows = buildRows(
    [
      at(1, "2026-10-06T10:00:00Z"),
      at(2, "2026-10-06T10:04:59Z"),
      at(3, "2026-10-06T10:10:30Z"),
      at(4, "2026-10-06T10:10:40Z", { sender_id: "other" }),
      at(5, "2026-10-06T10:10:50Z", { sender_id: "other", kind: "system", sender_kind: "system" }),
      at(6, "2026-10-06T10:10:55Z", { sender_id: "other" }),
    ],
    [],
  ).filter((r) => r.type === "message");
  assert.deepEqual(rows.map((r) => r.grouped), [false, true, false, false, false, false]);
});

test("跨天插日期分隔；日期分隔后不合并头像", () => {
  const rows = buildRows(
    [at(1, "2026-10-05T10:00:00"), at(2, "2026-10-05T10:01:00"), at(3, "2026-10-06T10:02:00")],
    [],
  );
  assert.deepEqual(rows.map((r) => r.type), ["day", "message", "message", "day", "message"]);
  assert.equal(rows[2].grouped, true);
  assert.equal(rows[4].grouped, false);
});

test("未读分隔线：画在 last_read_seq 之后第一条别人的消息前，只画一次，自己的消息不触发", () => {
  const messages = [
    at(1, "2026-10-06T10:00:00Z"),
    at(2, "2026-10-06T10:01:00Z", { sender_id: ME }),
    at(3, "2026-10-06T10:02:00Z"),
    at(4, "2026-10-06T10:03:00Z"),
  ];
  const rows = buildRows(messages, [], { unreadAfterSeq: 1, viewerId: ME });
  assert.deepEqual(rows.map((r) => r.type), ["day", "message", "message", "unread", "message", "message"]);
  const none = buildRows(messages, [], { unreadAfterSeq: null, viewerId: ME });
  assert.ok(!none.some((r) => r.type === "unread"));
  const zero = buildRows(messages, [], { unreadAfterSeq: 0, viewerId: ME });
  assert.equal(zero.filter((r) => r.type === "unread").length, 1);
});

test("未读位置：优先用 last_read_seq；没有就按未读条数从末尾数别人的消息", () => {
  const messages = [msg(1), msg(2, { sender_id: ME }), msg(3), msg(4), msg(5)];
  assert.equal(unreadBoundary(messages, { lastReadSeq: 2 }), 2);
  assert.equal(unreadBoundary(messages, { lastReadSeq: 5 }), null);
  assert.equal(unreadBoundary(messages, { unreadCount: 2, viewerId: ME }), 3);
  assert.equal(unreadBoundary(messages, { unreadCount: 0, viewerId: ME }), null);
});

test("发送中的消息排在已确认消息之后，带 pending 标记", async () => {
  const { store } = makeStore(range(1, 2));
  await store.loadLatest();
  const done = store.send({ kind: "text", body: "在路上" });
  const rows = buildRows(store.getSnapshot().messages, store.getSnapshot().pending, { viewerId: ME }).filter((r) => r.type === "message");
  assert.equal(rows.at(-1).pending.status, "sending");
  assert.equal(rows.at(-1).message.body, "在路上");
  await done;
});
