// W09：输入框——@ 候选规则、Enter / Shift+Enter、草稿防抖、↑ 编辑上一条。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const stub = (name, source) => [name, dataModule(source)];
const composerModule = await import(
  await compileModule("src/shell/messages/composer/Composer.tsx", {
    "../../../i18n/ui/useUI": dataModule("export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh; }"),
    "../../../lib/im/messages-api": dataModule("export const messagesApi = {};"),
    "../../replay/work/ReplayPickerDialog": dataModule("export function ReplayPickerDialog(){ return null; }"),
    "../leo/LeoComposerAddon": dataModule("export function LeoComposerAddon(){ return null; }"),
    "../realtime/hooks": dataModule("export function sendTyping(){}"),
    "./ArtifactPickerDialog": dataModule("export function ArtifactPickerDialog(){ return null; }"),
  })
);
const mentionModule = await import(
  await compileModule("src/shell/messages/composer/MentionPicker.tsx")
);
const draftsModule = await import(
  await compileModule("src/shell/messages/composer/drafts.ts", {
    "../../../lib/im/messages-api": dataModule("export const messagesApi = {};"),
  })
);

const { composerKeyAction, shouldEditLast } = composerModule;
const { mentionCandidates, activeMentionQuery, applyMention, collectMentions, MAX_MENTION_CANDIDATES } = mentionModule;
const { createDraftSaver, DRAFT_DEBOUNCE_MS, createDraftBook, resetDraftBookForTests } = draftsModule;

function member(id, name, extra = {}) {
  return {
    user_id: id,
    role: "member",
    external: false,
    joined_at: "2026-10-01T00:00:00Z",
    profile: { user_id: id, display_name: name, avatar_url: null },
    ...extra,
  };
}

const members = [member("me", "我自己"), member("u1", "Alice"), member("u2", "Bob", { external: true }), member("u3", "Alina")];

function conversation(overrides = {}) {
  return { kind: "group", my_role: "member", leo_enabled: true, members, ...overrides };
}

const labels = (list) => list.map((c) => c.label);

// ── @ 候选 ────────────────────────────────────────────────────────────────
test("非管理员没有「所有人」；owner / admin 有", () => {
  const base = { viewerId: "me", query: "", allLabel: "所有人" };
  assert.ok(!labels(mentionCandidates({ ...base, conversation: conversation({ my_role: "member" }) })).includes("所有人"));
  assert.ok(labels(mentionCandidates({ ...base, conversation: conversation({ my_role: "admin" }) })).includes("所有人"));
  assert.ok(labels(mentionCandidates({ ...base, conversation: conversation({ my_role: "owner" }) })).includes("所有人"));
  // 私聊里「所有人」没有意义
  assert.ok(!labels(mentionCandidates({ ...base, conversation: conversation({ kind: "dm", my_role: "owner" }) })).includes("所有人"));
});

test("leo_enabled=false 没有 leo；打开才有；交易会话永远没有", () => {
  const base = { viewerId: "me", query: "", allLabel: "所有人" };
  assert.ok(!labels(mentionCandidates({ ...base, conversation: conversation({ leo_enabled: false }) })).includes("leo"));
  const on = mentionCandidates({ ...base, conversation: conversation({ leo_enabled: true }) });
  assert.ok(labels(on).includes("leo"));
  assert.equal(on.find((c) => c.label === "leo").kind, "leo");
  assert.ok(!labels(mentionCandidates({ ...base, conversation: conversation({ kind: "talent" }) })).includes("leo"));
});

test("候选不含自己；按输入过滤，前缀匹配排在前面", () => {
  const all = mentionCandidates({ conversation: conversation(), viewerId: "me", query: "", allLabel: "所有人" });
  assert.ok(!labels(all).includes("我自己"));
  const filtered = mentionCandidates({ conversation: conversation(), viewerId: "me", query: "ali", allLabel: "所有人" });
  assert.deepEqual(labels(filtered), ["Alice", "Alina"]);
  const infix = mentionCandidates({ conversation: conversation(), viewerId: "me", query: "ice", allLabel: "所有人" });
  assert.deepEqual(labels(infix), ["Alice"]);
  assert.deepEqual(labels(mentionCandidates({ conversation: conversation({ my_role: "owner" }), viewerId: "me", query: "all", allLabel: "所有人" })).slice(0, 1), ["所有人"]);
  // 外部成员带标记
  assert.equal(mentionCandidates({ conversation: conversation(), viewerId: "me", query: "bob", allLabel: "所有人" })[0].external, true);
});

test("候选数量有上限；没有会话详情时没有候选", () => {
  const many = Array.from({ length: 30 }, (_, i) => member(`x${i}`, `成员${i}`));
  const list = mentionCandidates({ conversation: conversation({ members: many }), viewerId: "me", query: "", allLabel: "所有人" });
  assert.equal(list.length, MAX_MENTION_CANDIDATES);
  assert.deepEqual(mentionCandidates({ conversation: null, viewerId: "me", query: "", allLabel: "所有人" }), []);
});

test("光标前的 @ 才触发候选；邮箱里的 @ 不触发", () => {
  assert.deepEqual(activeMentionQuery("你好 @ali", 7), { start: 3, query: "ali" });
  assert.deepEqual(activeMentionQuery("@", 1), { start: 0, query: "" });
  assert.equal(activeMentionQuery("mail me a@b.com", 15), null);
  assert.equal(activeMentionQuery("@ali 你好", 8), null);
  assert.equal(activeMentionQuery("没有", 2), null);
});

test("选中候选：替换成「@名字 」并记录；发送时只带仍在正文里的 @", () => {
  const alice = { id: "u1", label: "Alice", kind: "user" };
  const leo = { id: "leo", label: "leo", kind: "leo" };
  const all = { id: "all", label: "所有人", kind: "all" };
  const active = activeMentionQuery("请 @al", 5);
  const applied = applyMention("请 @al", 5, active, alice);
  assert.equal(applied.text, "请 @Alice ");
  assert.equal(applied.caret, applied.text.length);
  assert.deepEqual(collectMentions("请 @Alice @leo 看", [alice, leo, all]), {
    mentions: ["u1"],
    mention_all: false,
    mention_leo: true,
  });
  // 选过又删掉的不带
  assert.deepEqual(collectMentions("没有提到任何人", [alice, leo, all]), { mentions: [], mention_all: false, mention_leo: false });
  assert.equal(collectMentions("@所有人 开会", [all]).mention_all, true);
});

// ── 手打 @leo（不经过候选下拉）──────────────────────────────────────────
test("手打 @leo、没选过候选：mention_leo 为 true（二轮：leo 不回复的静默失败）", () => {
  assert.deepEqual(collectMentions("@leo 你好", []), { mentions: [], mention_all: false, mention_leo: true });
  assert.equal(collectMentions("你好 @leo，帮我看看", []).mention_leo, true);
  assert.equal(collectMentions("@leo", []).mention_leo, true);
  assert.equal(collectMentions("@leo你好", []).mention_leo, true);
  assert.equal(collectMentions("(@leo)", []).mention_leo, true);
});

test("手打 @leo 的大小写、全角、带空格变体都认", () => {
  for (const text of ["@Leo 你好", "@LEO 你好", "＠leo 你好", "＠Leo你好", "@ leo 你好", "@\u3000leo 你好"]) {
    assert.equal(collectMentions(text, []).mention_leo, true, text);
  }
});

test("形似但不是 leo 的不误判：@leonard、@leonardo、subtleorganism、邮箱、没有 @ 的 leo、数字或下划线紧跟", () => {
  for (const text of ["@leonard 你好", "@leonardo", "@Leonard", "@ leonard", "subtleorganism", "see subtleo", "foo@leo.com", "leo 你好", "@le o", "@leo1", "@leo_x"]) {
    assert.equal(collectMentions(text, []).mention_leo, false, text);
  }
});

test("会话没开 leo 时，手打 @leo 不算；从下拉选中的路径不受影响", () => {
  assert.equal(collectMentions("@leo 你好", [], false).mention_leo, false);
  assert.equal(collectMentions("@leo 你好", []).mention_leo, true);
  const leo = { id: "leo", label: "leo", kind: "leo" };
  assert.equal(collectMentions("@leo 你好", [leo], false).mention_leo, true);
  // 手打 @leo 不影响 @某人 和 @所有人
  const alice = { id: "u1", label: "Alice", kind: "user" };
  assert.deepEqual(collectMentions("@leo 问问 @Alice", [alice]), { mentions: ["u1"], mention_all: false, mention_leo: true });
  assert.deepEqual(collectMentions("@leonard 你好", []), { mentions: [], mention_all: false, mention_leo: false });
});

// ── Enter / Shift+Enter ──────────────────────────────────────────────────
test("Enter 发送；Shift+Enter 换行；输入法组词中不处理", () => {
  assert.equal(composerKeyAction({ key: "Enter" }), "send");
  assert.equal(composerKeyAction({ key: "Enter", shiftKey: true }), "newline");
  assert.equal(composerKeyAction({ key: "Enter", isComposing: true }), "none");
  assert.equal(composerKeyAction({ key: "a" }), "none");
});

test("手机上 Enter 换行，靠按钮发送", () => {
  assert.equal(composerKeyAction({ key: "Enter", mobile: true }), "newline");
  assert.equal(composerKeyAction({ key: "Enter", shiftKey: true, mobile: true }), "newline");
});

test("↑ 只在输入框为空、光标在开头、不在编辑时触发「编辑上一条」", () => {
  assert.equal(shouldEditLast({ key: "ArrowUp", text: "", caret: 0, editing: false }), true);
  assert.equal(shouldEditLast({ key: "ArrowUp", text: "有字", caret: 0, editing: false }), false);
  assert.equal(shouldEditLast({ key: "ArrowUp", text: "", caret: 0, editing: true }), false);
  assert.equal(shouldEditLast({ key: "ArrowDown", text: "", caret: 0, editing: false }), false);
});

// ── 草稿防抖 ────────────────────────────────────────────────────────────
function fakeTimers() {
  const timers = new Map();
  let id = 0;
  return {
    setTimer(callback, ms) {
      id += 1;
      timers.set(id, { callback, ms });
      return id;
    },
    clearTimer(handle) {
      timers.delete(handle);
    },
    fireAll() {
      for (const [key, timer] of Array.from(timers)) {
        timers.delete(key);
        timer.callback();
      }
    },
    size: () => timers.size,
    delays: () => Array.from(timers.values()).map((t) => t.ms),
  };
}

test("草稿：停止输入 1 秒后才保存，连续输入只保存最后一次", async () => {
  const clock = fakeTimers();
  const puts = [];
  const saver = createDraftSaver({
    put: async (conversationId, body, threadRootId) => puts.push([conversationId, body, threadRootId]),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  assert.equal(DRAFT_DEBOUNCE_MS, 1000);
  saver.schedule("c1", "你");
  saver.schedule("c1", "你好");
  saver.schedule("c1", "你好呀");
  assert.equal(clock.size(), 1);
  assert.deepEqual(clock.delays(), [1000]);
  assert.equal(puts.length, 0);
  clock.fireAll();
  await Promise.resolve();
  assert.deepEqual(puts, [["c1", "你好呀", null]]);
});

test("草稿：会话与线程各自计时；flush 立刻存；cancel 丢掉等着的", async () => {
  const clock = fakeTimers();
  const puts = [];
  const saver = createDraftSaver({
    put: async (c, body, t) => puts.push([c, body, t]),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  saver.schedule("c1", "主线");
  saver.schedule("c1", "线程里", "root-1");
  saver.schedule("c2", "别的会话");
  assert.equal(saver.pending(), 3);
  saver.cancel("c2");
  await saver.flush();
  assert.deepEqual(puts.sort((a, b) => a[1].localeCompare(b[1])).map((p) => p[1]).sort(), ["主线", "线程里"].sort());
  assert.deepEqual(puts.find((p) => p[1] === "线程里"), ["c1", "线程里", "root-1"]);
  assert.equal(saver.pending(), 0);
  assert.equal(clock.size(), 0);
});

test("草稿：空内容也会存（= 删除草稿）；打开会话时恢复服务端草稿", async () => {
  resetDraftBookForTests();
  const puts = [];
  const api = {
    async listDrafts() {
      return [{ conversation_id: "c9", thread_root_id: null, body: "没发完的话" }];
    },
    async putDraft(c, body, t) {
      puts.push([c, body, t]);
    },
  };
  const book = createDraftBook(api);
  assert.equal(await book.read("c9"), "没发完的话");
  assert.equal(await book.read("c-none"), "");
  book.clear("c9");
  await Promise.resolve();
  assert.deepEqual(puts.at(-1), ["c9", "", null]);
  assert.equal(await book.read("c9"), "");
});
