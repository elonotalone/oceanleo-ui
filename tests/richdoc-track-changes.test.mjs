// 富文档审阅层 · 修订（W14）
//
// 真 schema、真事务、真 `appendTransaction` 插件，不 mock。
//
// 这份测试锁住的是修订最容易做错的几处：
//   1. 删除**不真删** —— 真删了就没有「拒绝」可言，修订退化成编辑。
//   2. 格式修订存 `before` —— 不存就只剩「接受」一个选项，那不叫修订。
//   3. 关闭修订模式**只影响新编辑是否被记录**，既有标记一个都不动。
//   4. 接受/拒绝是**一次事务** —— 一次撤销要完整回退，不能撤一半。
//   5. 接受多处删除必须从文档末尾往前做，否则后面的位置全错。
// 末尾另有 P4 导出闸：有未处理修订而调用方没给策略时**必须拦下**。

import test from "node:test";
import assert from "node:assert/strict";

import { getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Underline } from "@tiptap/extension-underline";
import { EditorState } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";

import { richDocReviewExtensions } from "../src/shell/doc-editors/richdoc-review/review-marks.ts";
import {
  acceptAllChanges,
  acceptChange,
  clearReviewMarks,
  hasPendingChanges,
  listChanges,
  rejectAllChanges,
  rejectChange,
  richDocTrackChangesPlugin,
  trackedDelete,
  trackedFormat,
} from "../src/shell/doc-editors/richdoc-review/track-changes.ts";
import {
  addCommentToSidecar,
  createCommentRecord,
  emptyReviewSidecar,
} from "../src/shell/doc-editors/richdoc-review/review-types.ts";
import {
  applyRevisionExportChoice,
  buildDocxCommentPayload,
  countReviewMarksInJson,
  reviewExportBlockMessage,
  reviewExportCommentNotice,
  summarizeReviewForExport,
} from "../src/shell/doc-editors/richdoc-review/review-export.ts";

const schema = getSchema([
  Document,
  Paragraph,
  Text,
  Underline,
  ...richDocReviewExtensions(),
]);

const ALICE = { author: "u-alice", authorName: "甲" };
const BOB = { author: "u-bob", authorName: "乙" };

/** `"hello world"`：`"hello"` = 1..6，`" "` = 6..7，`"world"` = 7..12。 */
function baseDoc(text = "hello world") {
  return schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text(text)]),
  ]);
}

function plainState(doc = baseDoc()) {
  return EditorState.create({
    schema,
    doc,
    plugins: [history({ newGroupDelay: 0 })],
  });
}

/** 开着修订模式的编辑器。返回的 `setEnabled` 就是界面上那个开关。 */
function recordingState(doc = baseDoc(), attribution = ALICE) {
  let enabled = true;
  const plugin = richDocTrackChangesPlugin({
    isEnabled: () => enabled,
    getAttribution: () => attribution,
    now: () => "T-rec",
  });
  return {
    state: EditorState.create({
      schema,
      doc,
      plugins: [history({ newGroupDelay: 0 }), plugin],
    }),
    setEnabled: (next) => {
      enabled = next;
    },
  };
}

function undoOnce(state) {
  let next = state;
  undo(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

function kinds(doc) {
  return listChanges(doc).map((change) => [change.kind, change.text]);
}

// ── 三种变更类型 ─────────────────────────────────────────────────────────────

test("删除是盖标记，不是真删 —— 文字原地留着，等人决定", () => {
  let state = plainState();
  const tr = state.tr;
  const changeId = trackedDelete(tr, 1, 6, ALICE, { at: "T0" });
  state = state.apply(tr);

  assert.notEqual(changeId, "");
  // 这一行就是整份审阅层最容易做错的地方：真删了「拒绝」就无从谈起。
  assert.equal(state.doc.textContent, "hello world");

  const changes = listChanges(state.doc);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, "deletion");
  assert.equal(changes[0].text, "hello");
  assert.deepEqual([changes[0].from, changes[0].to], [1, 6]);
  // 每处变更都带作者与时间。
  assert.equal(changes[0].author, "u-alice");
  assert.equal(changes[0].authorName, "甲");
  assert.equal(changes[0].at, "T0");
  assert.equal(hasPendingChanges(state.doc), true);
});

test("插入由录制插件记下，连续打字归成同一处修订", () => {
  const { state: initial } = recordingState();
  let state = initial.apply(initial.tr.insertText("NEW", 6));

  assert.equal(state.doc.textContent, "helloNEW world");
  assert.deepEqual(kinds(state.doc), [["insertion", "NEW"]]);
  assert.equal(listChanges(state.doc)[0].author, "u-alice");
  assert.equal(listChanges(state.doc)[0].at, "T-rec");

  // 接着打字：`inclusive: true` 让新字继承同一个 changeId，
  // 否则一句话会碎成几十处修订，逐处接受就成了酷刑。
  state = state.apply(state.tr.insertText("!", 9));
  assert.equal(state.doc.textContent, "helloNEW! world");
  assert.deepEqual(kinds(state.doc), [["insertion", "NEW!"]]);
});

test("用户按删除键 ⇒ 编辑器照常删，插件随后把它复原成一处删除标记", () => {
  const { state: initial } = recordingState();
  const state = initial.apply(initial.tr.delete(1, 3));

  // 文字没有真的消失，只是被标成删除。
  assert.equal(state.doc.textContent, "hello world");
  assert.deepEqual(kinds(state.doc), [["deletion", "he"]]);
});

test("格式修订把改之前的 marks 存进 before —— 不存就没法拒绝", () => {
  let state = plainState();
  const tr = state.tr;
  const changeId = trackedFormat(
    tr,
    1,
    6,
    { add: [schema.marks.underline.create()] },
    BOB,
    { at: "T1" },
  );
  state = state.apply(tr);

  const change = listChanges(state.doc)[0];
  assert.equal(change.kind, "format");
  assert.equal(change.text, "hello");
  assert.equal(change.authorName, "乙");
  assert.equal(change.segments[0].before, "[]");
  assert.equal(change.segments[0].after, JSON.stringify([{ type: "underline" }]));
  // 格式本身是真的应用上去了，不是只记账。
  assert.equal(state.doc.rangeHasMark(1, 6, schema.marks.underline), true);
  assert.notEqual(changeId, "");
});

// ── 逐处接受 / 拒绝 ──────────────────────────────────────────────────────────

test("接受删除 ⇒ 文字真的走；拒绝删除 ⇒ 文字留下、标记摘掉", () => {
  let state = plainState();
  const tr = state.tr;
  const changeId = trackedDelete(tr, 1, 6, ALICE, { at: "T0" });
  state = state.apply(tr);

  const rejectTr = state.tr;
  assert.equal(rejectChange(rejectTr, changeId), true);
  const rejected = state.apply(rejectTr);
  assert.equal(rejected.doc.textContent, "hello world");
  assert.equal(listChanges(rejected.doc).length, 0);

  const acceptTr = state.tr;
  assert.equal(acceptChange(acceptTr, changeId), true);
  const accepted = state.apply(acceptTr);
  assert.equal(accepted.doc.textContent, " world");
  assert.equal(listChanges(accepted.doc).length, 0);

  // 不存在的 changeId 是无操作，不许假装成功。
  assert.equal(acceptChange(state.tr, "no-such-change"), false);
  assert.equal(rejectChange(state.tr, "no-such-change"), false);
});

test("接受插入 ⇒ 摘标记留文字；拒绝插入 ⇒ 文字删掉", () => {
  const { state: initial } = recordingState();
  const state = initial.apply(initial.tr.insertText("NEW", 6));
  const changeId = listChanges(state.doc)[0].changeId;

  const acceptTr = state.tr;
  acceptChange(acceptTr, changeId);
  const accepted = state.apply(acceptTr);
  assert.equal(accepted.doc.textContent, "helloNEW world");
  assert.equal(listChanges(accepted.doc).length, 0);

  const rejectTr = state.tr;
  rejectChange(rejectTr, changeId);
  const rejected = state.apply(rejectTr);
  assert.equal(rejected.doc.textContent, "hello world");
  assert.equal(listChanges(rejected.doc).length, 0);
});

test("接受格式 ⇒ 新格式留下；拒绝格式 ⇒ 按 before 还原", () => {
  let state = plainState();
  const tr = state.tr;
  const changeId = trackedFormat(
    tr,
    1,
    6,
    { add: [schema.marks.underline.create()] },
    BOB,
    { at: "T1" },
  );
  state = state.apply(tr);

  const acceptTr = state.tr;
  acceptChange(acceptTr, changeId);
  const accepted = state.apply(acceptTr);
  assert.equal(accepted.doc.rangeHasMark(1, 6, schema.marks.underline), true);
  assert.equal(listChanges(accepted.doc).length, 0);

  const rejectTr = state.tr;
  rejectChange(rejectTr, changeId);
  const rejected = state.apply(rejectTr);
  // `before` 是空集合 ⇒ 还原就是把下划线摘掉。文字一个不动。
  assert.equal(rejected.doc.rangeHasMark(1, 6, schema.marks.underline), false);
  assert.equal(rejected.doc.textContent, "hello world");
  assert.equal(listChanges(rejected.doc).length, 0);
});

test("拒绝格式修订会把改之前就有的格式原样放回去", () => {
  // 先让 "hello" 本来就带下划线，再用一次格式修订把它去掉。
  let state = plainState();
  state = state.apply(
    state.tr.addMark(1, 6, schema.marks.underline.create()),
  );

  const tr = state.tr;
  const changeId = trackedFormat(
    tr,
    1,
    6,
    { remove: [schema.marks.underline] },
    BOB,
    { at: "T2" },
  );
  state = state.apply(tr);
  assert.equal(state.doc.rangeHasMark(1, 6, schema.marks.underline), false);
  assert.equal(
    listChanges(state.doc)[0].segments[0].before,
    JSON.stringify([{ type: "underline" }]),
  );

  const rejectTr = state.tr;
  rejectChange(rejectTr, changeId);
  const rejected = state.apply(rejectTr);
  // 拒绝「去掉下划线」= 把下划线还回来。
  assert.equal(rejected.doc.rangeHasMark(1, 6, schema.marks.underline), true);
  assert.equal(listChanges(rejected.doc).length, 0);
});

// ── 全部接受 / 拒绝 ──────────────────────────────────────────────────────────

test("全部接受：多处删除从文档末尾往前处理，位置不串", () => {
  let state = plainState();
  const tr = state.tr;
  // 两处删除，中间隔着一个空格。顺着做会让第二处的坐标失准。
  trackedDelete(tr, 7, 12, ALICE, { at: "T0", changeId: "d-world" });
  trackedDelete(tr, 1, 6, ALICE, { at: "T0", changeId: "d-hello" });
  state = state.apply(tr);
  assert.equal(state.doc.textContent, "hello world");
  assert.equal(listChanges(state.doc).length, 2);

  const acceptTr = state.tr;
  assert.equal(acceptAllChanges(acceptTr), 2);
  const accepted = state.apply(acceptTr);
  // 两段都真删掉，只剩中间那个空格。位置串了这里就会是 "hellow" 之类。
  assert.equal(accepted.doc.textContent, " ");
  assert.equal(listChanges(accepted.doc).length, 0);
});

test("全部拒绝：插入的字消失、删除的字留下，三种混在一起也对", () => {
  const { state: initial } = recordingState();
  let state = initial.apply(initial.tr.insertText("NEW", 6));
  const withFormat = state.tr;
  trackedFormat(
    withFormat,
    1,
    6,
    { add: [schema.marks.underline.create()] },
    BOB,
    { at: "T1" },
  );
  state = state.apply(withFormat);
  const withDelete = state.tr;
  trackedDelete(withDelete, 10, 15, BOB, { at: "T2" });
  state = state.apply(withDelete);

  assert.equal(state.doc.textContent, "helloNEW world");
  assert.equal(listChanges(state.doc).length, 3);

  const rejectTr = state.tr;
  assert.equal(rejectAllChanges(rejectTr), 3);
  const rejected = state.apply(rejectTr);
  // 插入的 "NEW" 没了，被划掉的 " worl" 留着，下划线按 before 撤销。
  assert.equal(rejected.doc.textContent, "hello world");
  assert.equal(rejected.doc.rangeHasMark(1, 6, schema.marks.underline), false);
  assert.equal(listChanges(rejected.doc).length, 0);

  // 空文档上全部接受/拒绝是 0，不抛。
  const clean = plainState();
  assert.equal(acceptAllChanges(clean.tr), 0);
  assert.equal(rejectAllChanges(clean.tr), 0);
});

// ── 关闭修订模式 ─────────────────────────────────────────────────────────────

test("关闭修订模式：既有标记一个都不动，只是新编辑不再被记录", () => {
  const { state: initial, setEnabled } = recordingState();
  let state = initial.apply(initial.tr.insertText("NEW", 6));
  const deleteTr = state.tr;
  trackedDelete(deleteTr, 1, 6, ALICE, { at: "T0" });
  state = state.apply(deleteTr);

  const before = listChanges(state.doc);
  assert.equal(before.length, 2);

  setEnabled(false);

  state = state.apply(state.tr.insertText("ZZ", 12));
  const after = listChanges(state.doc);

  // 任务书点名最容易做错的一条：关闭 ≠ 清空。
  assert.equal(after.length, 2);
  assert.deepEqual(
    after.map((change) => [change.kind, change.text, change.changeId]),
    before.map((change) => [change.kind, change.text, change.changeId]),
  );
  // 而新打的字确实没有被记成修订。
  assert.equal(state.doc.textContent.includes("ZZ"), true);
  assert.equal(state.doc.rangeHasMark(12, 14, schema.marks.richdocInsertion), false);

  // 重新打开后又开始记录，既有的两处仍在。
  setEnabled(true);
  state = state.apply(state.tr.insertText("QQ", 1));
  assert.equal(listChanges(state.doc).length, 3);
});

test("清除审阅标记是另一件事：不做任何取舍，只抹痕迹", () => {
  let state = plainState();
  const tr = state.tr;
  trackedDelete(tr, 1, 6, ALICE, { at: "T0" });
  state = state.apply(tr);

  const clearTr = state.tr;
  clearReviewMarks(clearTr);
  const cleared = state.apply(clearTr);
  // 与「接受」不同：文字一个字都不动，只是标记没了。
  assert.equal(cleared.doc.textContent, "hello world");
  assert.equal(listChanges(cleared.doc).length, 0);
});

// ── 与撤销栈的关系 ───────────────────────────────────────────────────────────

test("接受是一次可撤销事务：一次撤销把文字和标记一起还回来", () => {
  let state = plainState();
  const tr = state.tr;
  const changeId = trackedDelete(tr, 1, 6, ALICE, { at: "T0" });
  state = state.apply(tr);

  const acceptTr = state.tr;
  acceptChange(acceptTr, changeId);
  const accepted = state.apply(acceptTr);
  assert.equal(accepted.doc.textContent, " world");

  // **一次**撤销要回到接受之前：文字回来，而且那处删除标记还挂着等人决定。
  const undone = undoOnce(accepted);
  assert.equal(undone.doc.textContent, "hello world");
  assert.equal(listChanges(undone.doc).length, 1);
  assert.equal(listChanges(undone.doc)[0].changeId, changeId);
});

test("全部接受也是一次事务：一次撤销退回全部三处", () => {
  let state = plainState();
  const tr = state.tr;
  trackedDelete(tr, 7, 12, ALICE, { at: "T0", changeId: "d-world" });
  trackedDelete(tr, 1, 6, ALICE, { at: "T0", changeId: "d-hello" });
  state = state.apply(tr);

  const acceptTr = state.tr;
  acceptAllChanges(acceptTr);
  const accepted = state.apply(acceptTr);
  assert.equal(accepted.doc.textContent, " ");

  const undone = undoOnce(accepted);
  assert.equal(undone.doc.textContent, "hello world");
  assert.equal(listChanges(undone.doc).length, 2);
});

test("撤销本身不被录成新的修订", () => {
  const { state: initial } = recordingState();
  let state = initial.apply(initial.tr.insertText("NEW", 6));
  assert.equal(listChanges(state.doc).length, 1);

  state = undoOnce(state);
  // 撤销是历史回放，再录一遍会让「撤销」变成一次新插入。
  assert.equal(state.doc.textContent, "hello world");
  assert.equal(listChanges(state.doc).length, 0);
});

// ── 同作者例外 ───────────────────────────────────────────────────────────────

test("删掉自己刚插入、还没被接受的字 ⇒ 真删，不留删除线", () => {
  const { state: initial } = recordingState(baseDoc(), ALICE);
  let state = initial.apply(initial.tr.insertText("NEW", 6));
  assert.deepEqual(kinds(state.doc), [["insertion", "NEW"]]);

  const tr = state.tr;
  trackedDelete(tr, 6, 9, ALICE, { at: "T3" });
  state = state.apply(tr);

  // 自己把自己刚写的字删掉，留一条删除线是纯噪音。
  assert.equal(state.doc.textContent, "hello world");
  assert.equal(listChanges(state.doc).length, 0);
});

test("删掉别人正在提议插入的字 ⇒ 留痕给他看", () => {
  const { state: initial } = recordingState(baseDoc(), ALICE);
  let state = initial.apply(initial.tr.insertText("NEW", 6));

  const tr = state.tr;
  trackedDelete(tr, 6, 9, BOB, { at: "T3" });
  state = state.apply(tr);

  // 换个作者就不适用那条例外：别人的提议我要删，得留痕。
  assert.equal(state.doc.textContent, "helloNEW world");
  const changes = listChanges(state.doc);
  assert.equal(changes.length, 2);
  assert.deepEqual(
    changes.map((change) => change.kind).sort(),
    ["deletion", "insertion"],
  );
});

// ── P4 导出闸 ────────────────────────────────────────────────────────────────

function docWithBothKinds() {
  const { state: initial } = recordingState(baseDoc(), ALICE);
  let state = initial.apply(initial.tr.insertText("NEW", 12));
  const tr = state.tr;
  trackedDelete(tr, 1, 6, BOB, { at: "T0" });
  state = state.apply(tr);
  return state;
}

test("有未处理修订而没给策略 ⇒ 导出被拦下，不许按当前显示状态静默导出", () => {
  const state = docWithBothKinds();
  const summary = summarizeReviewForExport(state.doc, emptyReviewSidecar());

  assert.equal(summary.pendingChanges, 2);
  assert.equal(summary.insertions, 1);
  assert.equal(summary.deletions, 1);
  assert.equal(summary.requiresDecision, true);

  const blocked = reviewExportBlockMessage(summary, null);
  assert.notEqual(blocked, "");
  assert.equal(blocked.includes("1 处插入"), true);
  assert.equal(blocked.includes("1 处删除"), true);

  // 给了明确策略才放行。
  for (const choice of ["accept-all", "reject-all", "keep-markup"]) {
    assert.equal(reviewExportBlockMessage(summary, choice), "");
  }

  // 没有未处理修订的文档一开始就不该被拦。
  const clean = summarizeReviewForExport(baseDoc(), emptyReviewSidecar());
  assert.equal(clean.requiresDecision, false);
  assert.equal(reviewExportBlockMessage(clean, null), "");
});

test("三条导出策略各自产出正确正文，且不把审阅 mark 漏给 docx", () => {
  const json = docWithBothKinds().doc.toJSON();

  const acceptAll = applyRevisionExportChoice(json, "accept-all");
  assert.equal(textOf(acceptAll), " worldNEW");
  assert.equal(countReviewMarksInJson(acceptAll), 0);

  const rejectAll = applyRevisionExportChoice(json, "reject-all");
  assert.equal(textOf(rejectAll), "hello world");
  assert.equal(countReviewMarksInJson(rejectAll), 0);

  const keepMarkup = applyRevisionExportChoice(json, "keep-markup");
  assert.equal(textOf(keepMarkup), "hello worldNEW");
  assert.equal(countReviewMarksInJson(keepMarkup), 0);

  // 纯函数，入参不许被改。
  assert.equal(countReviewMarksInJson(json), 2);
});

test("keep-markup 必须翻译成 docx 白名单认识的 mark，否则标记会被静默丢掉", () => {
  const json = docWithBothKinds().doc.toJSON();
  const keepMarkup = applyRevisionExportChoice(json, "keep-markup");
  const runs = keepMarkup.content[0].content.map((node) => [
    node.text,
    (node.marks || []).map((mark) => mark.type).sort(),
  ]);

  const deleted = runs.find((run) => run[0] === "hello");
  const inserted = runs.find((run) => run[0] === "NEW");
  // `docx-export.ts` 的白名单只认 bold/italic/underline/strike/code/
  // highlight/textStyle/link —— 不翻译的话这两段会被整段跳过。
  assert.deepEqual(deleted[1], ["strike", "textStyle"]);
  assert.deepEqual(inserted[1], ["textStyle", "underline"]);

  const deletedColor = keepMarkup.content[0].content
    .find((node) => node.text === "hello")
    .marks.find((mark) => mark.type === "textStyle").attrs.color;
  const insertedColor = keepMarkup.content[0].content
    .find((node) => node.text === "NEW")
    .marks.find((mark) => mark.type === "textStyle").attrs.color;
  assert.equal(deletedColor, "#b91c1c");
  assert.equal(insertedColor, "#15803d");
});

test("批注进不了 docx 时必须明确告知，并把 ready-to-use 载荷备给 W15", () => {
  let state = docWithBothKinds();
  state = state.apply(
    state.tr.addMark(
      1,
      6,
      schema.marks.richdocComment.create({ commentId: "c1" }),
    ),
  );

  let sidecar = addCommentToSidecar(
    emptyReviewSidecar(),
    createCommentRecord({
      ...ALICE,
      id: "c1",
      body: "这句要改",
      quotedText: "hello",
      createdAt: "T0",
    }),
  );
  sidecar = addCommentToSidecar(
    sidecar,
    createCommentRecord({
      ...BOB,
      id: "gone",
      body: "锚点已被删除",
      quotedText: "没了",
      createdAt: "T1",
    }),
  );

  const summary = summarizeReviewForExport(state.doc, sidecar);
  assert.equal(summary.commentsWillBeLost, true);
  const notice = reviewExportCommentNotice(summary);
  assert.equal(notice.includes("不含批注"), true);
  assert.equal(notice.includes("2"), true);

  // W15 把 `docx-export.ts` 接上线后翻这个开关，提示自动消失。
  const wired = summarizeReviewForExport(state.doc, sidecar, {
    docxCommentsWired: true,
  });
  assert.equal(wired.commentsWillBeLost, false);
  assert.equal(reviewExportCommentNotice(wired), "");

  const payload = buildDocxCommentPayload(state.doc, sidecar);
  assert.equal(payload.entries.length, 1);
  assert.equal(payload.orphanedCount, 0);
  const entry = payload.entries[0];
  assert.equal(entry.id, 0);
  assert.equal(entry.commentId, "c1");
  assert.equal(entry.author, "甲");
  assert.deepEqual(entry.paragraphs, ["这句要改"]);
  assert.deepEqual(entry.range, { from: 1, to: 6 });

  // 挂不上范围的那条默认不给 W15：一条挂不上 CommentRangeStart 的批注比不给更糟。
  assert.equal(
    payload.entries.some((candidate) => candidate.commentId === "gone"),
    false,
  );
  const withOrphans = buildDocxCommentPayload(state.doc, sidecar, {
    includeOrphaned: true,
  });
  assert.equal(withOrphans.entries.length, 2);
  assert.equal(withOrphans.entries[1].range, null);
});

function textOf(json) {
  const parts = [];
  const walk = (node) => {
    if (typeof node.text === "string") parts.push(node.text);
    for (const child of node.content || []) walk(child);
  };
  walk(json);
  return parts.join("");
}
