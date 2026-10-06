// 收件箱排序、未读增量、桌面通知取舍（work-chat W08）：真实 store.ts + 假事件。
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PREVIEW_HIDDEN,
  PREVIEW_IMAGE,
  PREVIEW_RECALLED,
  applyInboxEvent,
  applyUnreadEvent,
  createImStore,
  emptyInbox,
  formatBadge,
  messagePreview,
  shouldNotifyDesktop,
  sortInbox,
} from "../src/shell/messages/realtime/store.ts";
import { conversationsPath } from "../src/lib/im/inbox-api.ts";

const ME = "me";

function conv(id, over = {}) {
  return {
    id,
    kind: "group",
    title: `群 ${id}`,
    avatar_url: null,
    peer: null,
    member_count: 3,
    last_message: null,
    last_activity_at: "2026-10-05T10:00:00Z",
    unread_count: 0,
    mention_count: 0,
    muted: false,
    notify_level: "all",
    org_id: null,
    project_id: null,
    has_external: false,
    my_role: "member",
    dissolved: false,
    ...over,
  };
}

function msg(conversationId, seq, over = {}) {
  return {
    id: `m-${conversationId}-${seq}`,
    conversation_id: conversationId,
    seq,
    sender_id: "other",
    sender_kind: "user",
    kind: "text",
    body: `第 ${seq} 条`,
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
    created_at: `2026-10-06T0${Math.min(seq, 9)}:00:00Z`,
    ...over,
  };
}

const created = (m) => ({ type: "message.created", conversation_id: m.conversation_id, message: m });
const ctx = { selfId: ME, foregroundConversationId: null };

function stateWith(items) {
  return { ...emptyInbox("all"), items: sortInbox(items), loaded: true };
}

test("新消息把会话顶到最前，未读 +1，最后一条更新", () => {
  let s = stateWith([
    conv("a", { last_activity_at: "2026-10-05T10:00:00Z" }),
    conv("b", { last_activity_at: "2026-10-05T12:00:00Z" }),
    conv("c", { last_activity_at: "2026-10-05T11:00:00Z" }),
  ]);
  assert.deepEqual(s.items.map((i) => i.id), ["b", "c", "a"]);
  s = applyInboxEvent(s, created(msg("a", 3)), ctx);
  assert.deepEqual(s.items.map((i) => i.id), ["a", "b", "c"]);
  assert.equal(s.items[0].unread_count, 1);
  assert.equal(s.items[0].last_message.seq, 3);
  assert.equal(s.items[0].last_message.preview, "第 3 条");
  s = applyInboxEvent(s, created(msg("a", 4)), ctx);
  assert.equal(s.items[0].unread_count, 2);
});

test("自己发的不计未读；正在前台打开的会话不计未读；被 @ 与 @所有人 计 @ 角标", () => {
  let s = stateWith([conv("a"), conv("b")]);
  s = applyInboxEvent(s, created(msg("a", 1, { sender_id: ME })), ctx);
  assert.equal(s.items.find((i) => i.id === "a").unread_count, 0);

  s = applyInboxEvent(s, created(msg("b", 1)), { selfId: ME, foregroundConversationId: "b" });
  assert.equal(s.items.find((i) => i.id === "b").unread_count, 0);

  s = applyInboxEvent(s, created(msg("a", 2, { mentions: [ME] })), ctx);
  s = applyInboxEvent(s, created(msg("a", 3, { mention_all: true })), ctx);
  s = applyInboxEvent(s, created(msg("a", 4, { mentions: ["someone-else"] })), ctx);
  const a = s.items.find((i) => i.id === "a");
  assert.equal(a.unread_count, 3);
  assert.equal(a.mention_count, 2);
});

test("同一条事件重放（重连补数据与实时事件重叠）不会重复计数", () => {
  let s = stateWith([conv("a")]);
  s = applyInboxEvent(s, created(msg("a", 5)), ctx);
  const again = applyInboxEvent(s, created(msg("a", 5)), ctx);
  const older = applyInboxEvent(s, created(msg("a", 4)), ctx);
  assert.equal(again, s);
  assert.equal(older, s);
  assert.equal(s.items[0].unread_count, 1);
});

test("不认识的会话来了消息 → 标记需要整页刷新；已读事件只认自己的", () => {
  let s = stateWith([conv("a", { unread_count: 4, mention_count: 1 })]);
  const unknown = applyInboxEvent(s, created(msg("zzz", 1)), ctx);
  assert.equal(unknown.needsRefresh, true);
  assert.equal(unknown.items.length, 1);

  const other = applyInboxEvent(s, { type: "read.updated", conversation_id: "a", user_id: "other", last_read_seq: 9 }, ctx);
  assert.equal(other.items[0].unread_count, 4, "别人读了不影响我的未读");
  const mine = applyInboxEvent(s, { type: "read.updated", conversation_id: "a", user_id: ME, last_read_seq: 9 }, ctx);
  assert.equal(mine.items[0].unread_count, 0);
  assert.equal(mine.items[0].mention_count, 0);
});

test("conversation.updated 插入或替换并重新排序；conversation.removed 移除；撤回更新最后一条摘要", () => {
  let s = stateWith([conv("a", { last_activity_at: "2026-10-05T10:00:00Z" })]);
  s = applyInboxEvent(s, { type: "conversation.updated", conversation: conv("n", { last_activity_at: "2026-10-06T09:00:00Z" }) }, ctx);
  assert.deepEqual(s.items.map((i) => i.id), ["n", "a"]);
  s = applyInboxEvent(s, { type: "conversation.updated", conversation: conv("a", { title: "改名了", last_activity_at: "2026-10-06T10:00:00Z" }) }, ctx);
  assert.deepEqual(s.items.map((i) => [i.id, i.title]), [["a", "改名了"], ["n", "群 n"]]);
  s = applyInboxEvent(s, created(msg("a", 7)), ctx);
  const recalled = msg("a", 7, { recalled_at: "2026-10-06T09:30:00Z", recalled_by: "sender", body: "" });
  s = applyInboxEvent(s, { type: "message.updated", conversation_id: "a", message: recalled }, ctx);
  assert.equal(s.items.find((i) => i.id === "a").last_message.preview, PREVIEW_RECALLED);
  s = applyInboxEvent(s, { type: "conversation.removed", conversation_id: "n", reason: "kicked" }, ctx);
  assert.deepEqual(s.items.map((i) => i.id), ["a"]);
});

test("摘要文案：撤回、审核隐藏、图片、卡片、语音转写", () => {
  assert.equal(messagePreview(msg("a", 1, { recalled_at: "t" })), PREVIEW_RECALLED);
  assert.equal(messagePreview(msg("a", 1, { hidden_reason: "moderation" })), PREVIEW_HIDDEN);
  assert.equal(messagePreview(msg("a", 1, { kind: "image", body: "" })), PREVIEW_IMAGE);
  assert.equal(messagePreview(msg("a", 1, { kind: "artifact", body: "", card: { type: "artifact", id: "x", title: "季度报告" } })), "[作品] 季度报告");
  assert.equal(messagePreview(msg("a", 1, { kind: "voice", body: "", transcript: { status: "done", text: "晚点开会" } })), "晚点开会");
  assert.equal(messagePreview(msg("a", 1, { body: "第一行\n\n第二行" })), "第一行 第二行");
});

test("侧栏未读：事件增量、静音不计红点、已读扣减、unread.changed 以服务端为准", () => {
  const items = [conv("a"), conv("quiet", { muted: true })];
  const lookup = (id) => items.find((i) => i.id === id);
  const uctx = { ...ctx, conversation: lookup };
  let u = { total: 2, mentions: 0, requests: 0, by_conversation: { a: { unread: 2, mentions: 0 } } };

  u = applyUnreadEvent(u, created(msg("a", 9)), uctx);
  assert.equal(u.total, 3);
  assert.deepEqual(u.by_conversation.a, { unread: 3, mentions: 0 });

  u = applyUnreadEvent(u, created(msg("quiet", 1)), uctx);
  assert.equal(u.total, 3, "静音会话不进红点数字");
  assert.equal(u.by_conversation.quiet.unread, 1, "但会话自己的数字照记");
  u = applyUnreadEvent(u, created(msg("quiet", 2, { mentions: [ME] })), uctx);
  assert.equal(u.total, 4, "静音会话里被 @ 仍提醒");
  assert.equal(u.mentions, 1);

  u = applyUnreadEvent(u, created(msg("a", 10, { sender_id: ME })), uctx);
  assert.equal(u.total, 4, "自己发的不算");

  u = applyUnreadEvent(u, { type: "read.updated", conversation_id: "a", user_id: ME, last_read_seq: 99 }, uctx);
  assert.equal(u.total, 1);
  assert.equal(u.by_conversation.a.unread, 0);

  const authoritative = { total: 7, mentions: 2, requests: 1, by_conversation: {} };
  assert.equal(applyUnreadEvent(u, { type: "unread.changed", unread: authoritative }, uctx), authoritative);
  const withReq = applyUnreadEvent(u, { type: "contact.request", request: {} }, uctx);
  assert.equal(withReq.requests, 1);
  assert.equal(applyUnreadEvent(null, created(msg("a", 1)), uctx), null, "还没取到未读之前不凭空造数字");
});

test("桌面通知只在标签页隐藏时弹，尊重 notify_level 与免打扰", () => {
  const base = { ...ctx, hidden: true };
  const m = msg("a", 1);
  assert.equal(shouldNotifyDesktop(m, conv("a"), base), true);
  assert.equal(shouldNotifyDesktop(m, conv("a"), { ...base, hidden: false }), false);
  assert.equal(shouldNotifyDesktop(msg("a", 1, { sender_id: ME }), conv("a"), base), false);
  assert.equal(shouldNotifyDesktop(msg("a", 1, { sender_kind: "system", sender_id: null }), conv("a"), base), false);
  assert.equal(shouldNotifyDesktop(m, conv("a", { notify_level: "none" }), base), false);
  assert.equal(shouldNotifyDesktop(msg("a", 1, { mentions: [ME] }), conv("a", { notify_level: "none" }), base), false);
  assert.equal(shouldNotifyDesktop(m, conv("a", { notify_level: "mentions" }), base), false);
  assert.equal(shouldNotifyDesktop(msg("a", 1, { mentions: [ME] }), conv("a", { notify_level: "mentions" }), base), true);
  assert.equal(shouldNotifyDesktop(m, conv("a", { muted: true }), base), false);
  assert.equal(shouldNotifyDesktop(msg("a", 1, { mention_all: true }), conv("a", { muted: true }), base), true);
  assert.equal(shouldNotifyDesktop(m, undefined, base), true, "还不认识的会话照常提醒");
});

function fakeSocket() {
  const subs = new Set();
  return {
    started: 0,
    stopped: 0,
    start() {
      this.started += 1;
    },
    stop() {
      this.stopped += 1;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    emit(out) {
      for (const fn of [...subs]) fn(out);
    },
    state: () => "open",
    tokenChanged() {},
    noteActivity() {},
    noteVisibility() {},
    sendTyping() {},
  };
}

async function settle() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

function makeStore({ items = [conv("a"), conv("b")], hidden = false } = {}) {
  const socket = fakeSocket();
  const notified = [];
  const fetched = { conversations: 0, unread: 0 };
  let server = { items, next_cursor: null };
  let serverUnread = { total: 0, mentions: 0, requests: 0, by_conversation: {} };
  const store = createImStore({
    socket,
    async fetchUnread() {
      fetched.unread += 1;
      return serverUnread;
    },
    async fetchConversations() {
      fetched.conversations += 1;
      return server;
    },
    notifyDesktop: (input) => notified.push(input),
    isHidden: () => hidden,
    selfId: async () => ME,
    fallbackTitle: () => "消息",
  });
  return {
    store,
    socket,
    notified,
    fetched,
    setServer: (v) => (server = v),
    setUnread: (v) => (serverUnread = v),
    setHidden: (v) => (hidden = v),
  };
}

test("状态仓：喂假事件 → 收件箱排序、侧栏未读、事件分发、桌面通知", async () => {
  const t = makeStore({ items: [conv("a", { title: "产品群" }), conv("b", { last_activity_at: "2026-10-05T12:00:00Z" })] });
  const seen = [];
  t.store.onEvent("message.created", (e) => seen.push(e.message.seq));
  t.store.start();
  await settle();
  assert.equal(t.socket.started, 1);
  t.socket.emit({ kind: "ready", userId: ME });
  await settle();
  await t.store.loadInbox("all");
  assert.deepEqual(t.store.inbox().items.map((i) => i.id), ["b", "a"]);
  assert.equal(t.store.unread().total, 0);

  t.socket.emit({ kind: "event", event: created(msg("a", 2)) });
  assert.deepEqual(t.store.inbox().items.map((i) => i.id), ["a", "b"]);
  assert.equal(t.store.unread().total, 1);
  assert.deepEqual(seen, [2]);
  assert.equal(t.notified.length, 0, "标签页在前台不弹桌面通知");

  t.setHidden(true);
  t.socket.emit({ kind: "event", event: created(msg("a", 3)) });
  assert.equal(t.store.unread().total, 2);
  assert.equal(t.notified.length, 1);
  assert.deepEqual(t.notified[0], { title: "产品群", body: "第 3 条", conversationId: "a", icon: null });

  // 前台会话：新消息不计未读也不弹
  t.store.setForegroundConversation("b");
  t.socket.emit({ kind: "event", event: created(msg("b", 2)) });
  assert.equal(t.store.unread().total, 2);
  assert.equal(t.store.inbox().items.find((i) => i.id === "b").unread_count, 0);

  // 点开会话本地立即清零
  t.store.setForegroundConversation(null);
  t.store.clearConversationUnread("a");
  assert.equal(t.store.unread().total, 0);
  assert.equal(t.store.inbox().items.find((i) => i.id === "a").unread_count, 0);
});

test("状态仓：在线状态缓存；重连后收件箱与未读整页补，订阅者收到补数据通知；不认识的会话触发刷新", async () => {
  const t = makeStore();
  let resyncs = 0;
  t.store.onResync(() => (resyncs += 1));
  t.store.start();
  await t.store.loadInbox("all");
  t.socket.emit({ kind: "event", event: { type: "presence.changed", user_id: "u2", presence: "online" } });
  assert.equal(t.store.presenceMap().u2, "online");
  t.store.seedPresence({ u3: "away", u2: "online" });
  assert.deepEqual(t.store.presenceMap(), { u2: "online", u3: "away" });

  const before = { ...t.fetched };
  t.socket.emit({ kind: "resync" });
  await settle();
  assert.equal(resyncs, 1);
  assert.equal(t.fetched.unread, before.unread + 1);
  assert.equal(t.fetched.conversations, before.conversations + 1);

  const beforeRefresh = t.fetched.conversations;
  t.setServer({ items: [conv("zzz", { last_activity_at: "2026-10-07T00:00:00Z" }), conv("a"), conv("b")], next_cursor: null });
  t.socket.emit({ kind: "event", event: created(msg("zzz", 1)) });
  await settle();
  assert.equal(t.fetched.conversations, beforeRefresh + 1);
  assert.equal(t.store.inbox().items[0].id, "zzz");
});

test("状态仓：分页追加不重复；断开后清空", async () => {
  const t = makeStore({ items: [conv("a")] });
  t.setServer({ items: [conv("a")], next_cursor: "c2" });
  t.store.start();
  await t.store.loadInbox("all");
  assert.equal(t.store.inbox().nextCursor, "c2");
  t.setServer({ items: [conv("a"), conv("old", { last_activity_at: "2026-01-01T00:00:00Z" })], next_cursor: null });
  await t.store.loadMoreInbox();
  assert.deepEqual(t.store.inbox().items.map((i) => i.id), ["a", "old"]);
  assert.equal(t.store.inbox().nextCursor, null);
  t.store.stop();
  assert.equal(t.socket.stopped, 1);
  assert.equal(t.store.inbox().items.length, 0);
  assert.equal(t.store.unread(), null);
});

test("角标数字与列表接口路径", () => {
  assert.equal(formatBadge(0), "");
  assert.equal(formatBadge(7), "7");
  assert.equal(formatBadge(100), "99+");
  assert.equal(conversationsPath("mentions"), "/v1/im/conversations?filter=mentions&limit=30");
  assert.equal(conversationsPath("../x", "cur"), "/v1/im/conversations?filter=all&cursor=cur&limit=30");
});
