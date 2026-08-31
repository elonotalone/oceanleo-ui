// 富文档审阅层 · 批注（W14）
//
// 用真 schema、真文档、真事务，不 mock：`getSchema([...richDocReviewExtensions()])`
// 在 Node 里就能跑起来，不需要 DOM，也不需要 Editor 实例。
//
// 这份测试锁住的四件事，每一件都对应一种真实的失败：
//   1. 锚点随编辑漂移        —— 存 range 的实现会在下一次编辑后指向错的文字。
//   2. 锚定文字被删 ⇒ 孤儿   —— 静默丢批注就是丢掉别人写给你的意见。
//   3. 回复线程与解决/重开    —— 少了它批注只是一次性便签，不是评审。
//   4. 批注载荷不进正文节点树 —— 进了就无法「导出纯净文档」。

import test from "node:test";
import assert from "node:assert/strict";

import { getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Underline } from "@tiptap/extension-underline";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";

import { richDocReviewExtensions } from "../src/shell/doc-editors/richdoc-review/review-marks.ts";
import {
  collectCommentAnchors,
  commentIdsAtPosition,
  commentIdsInRange,
  commentViews,
  reconcileCommentSidecar,
} from "../src/shell/doc-editors/richdoc-review/review-anchors.ts";
import {
  addCommentToSidecar,
  addReplyToSidecar,
  attachReviewSidecar,
  createCommentRecord,
  emptyReviewSidecar,
  isReviewSidecarEmpty,
  readReviewSidecar,
  removeCommentFromSidecar,
  setCommentResolved,
  setTrackChangesEnabled,
  stripReviewSidecar,
} from "../src/shell/doc-editors/richdoc-review/review-types.ts";
import {
  countReviewMarksInJson,
  stripReviewMarks,
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

/** 一段 `"hello world"`：`"hello"` = 1..6，`" world"` = 6..12。 */
function baseDoc(text = "hello world") {
  return schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text(text)]),
  ]);
}

function stateWithHistory(doc) {
  // `newGroupDelay: 0` ⇒ 每个事务自成一个撤销单元，
  // 否则毫秒级连续的两个事务会被 history 合并，测不出「一次事务」。
  return EditorState.create({
    schema,
    doc,
    plugins: [history({ newGroupDelay: 0 })],
  });
}

function anchorComment(state, from, to, commentId) {
  const tr = state.tr.addMark(
    from,
    to,
    schema.marks.richdocComment.create({ commentId }),
  );
  return state.apply(tr);
}

function undoOnce(state) {
  let next = state;
  undo(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

test("批注锚点随编辑漂移：前面插入文字，范围整体后移，锚定的还是同一段字", () => {
  let state = anchorComment(stateWithHistory(baseDoc()), 1, 6, "c1");

  const before = collectCommentAnchors(state.doc).get("c1");
  assert.deepEqual(before, { from: 1, to: 6, text: "hello" });

  // 在批注前面插入两个字符。没有任何监听、没有重算，mapping 自己把 mark 挪好。
  state = state.apply(state.tr.insertText("AB", 1));
  assert.equal(state.doc.textContent, "ABhello world");

  const after = collectCommentAnchors(state.doc).get("c1");
  assert.deepEqual(after, { from: 3, to: 8, text: "hello" });
});

test("锚点在被批注文字内部编辑后跟着长短变化", () => {
  let state = anchorComment(stateWithHistory(baseDoc()), 1, 6, "c1");

  // 在 "hello" 中间插字：inclusive:false 只影响两端，内部插入照样纳入锚点。
  state = state.apply(state.tr.insertText("XY", 3));
  assert.equal(state.doc.textContent, "heXYllo world");

  const anchor = collectCommentAnchors(state.doc).get("c1");
  assert.equal(anchor.from, 1);
  assert.equal(anchor.to, 8);
  assert.equal(anchor.text, "heXYllo");
});

test("删掉锚定文字 ⇒ 变孤儿并被标记，绝不从 sidecar 里静默消失", () => {
  let state = anchorComment(stateWithHistory(baseDoc()), 1, 6, "c1");
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

  // 锚点还在时结算：无变化，且**返回同一个引用**（React 侧靠它挡重渲染）。
  const stable = reconcileCommentSidecar(state.doc, sidecar, "T1");
  assert.deepEqual(stable.newlyOrphaned, []);
  assert.deepEqual(stable.recovered, []);
  assert.equal(stable.sidecar, sidecar);

  state = state.apply(state.tr.delete(1, 6));
  assert.equal(state.doc.textContent, " world");

  const orphaned = reconcileCommentSidecar(state.doc, sidecar, "T2");
  assert.deepEqual(orphaned.newlyOrphaned, ["c1"]);
  // 关键：批注本身还在，只是被标记。丢掉它才是这条测试要挡的事。
  assert.equal(orphaned.sidecar.comments.length, 1);
  assert.equal(orphaned.sidecar.comments[0].orphaned, true);
  assert.equal(orphaned.sidecar.comments[0].orphanedAt, "T2");
  // 原文快照是用户认回这条批注的唯一线索，必须还在。
  assert.equal(orphaned.sidecar.comments[0].quotedText, "hello");

  sidecar = orphaned.sidecar;

  // 撤销把文字撤回来 ⇒ 同一趟结算把孤儿摘回去。
  state = undoOnce(state);
  assert.equal(state.doc.textContent, "hello world");

  const recovered = reconcileCommentSidecar(state.doc, sidecar, "T3");
  assert.deepEqual(recovered.recovered, ["c1"]);
  assert.equal(recovered.sidecar.comments[0].orphaned, false);
  assert.equal(recovered.sidecar.comments[0].orphanedAt, undefined);
});

test("孤儿批注在侧栏里 range 为 null 并沉到底部，不与正文批注抢位置", () => {
  let state = stateWithHistory(baseDoc("hello world"));
  state = anchorComment(state, 7, 12, "later");
  state = anchorComment(state, 1, 6, "earlier");

  let sidecar = emptyReviewSidecar();
  for (const [id, at] of [
    ["later", "T2"],
    ["earlier", "T1"],
    ["gone", "T0"],
  ]) {
    sidecar = addCommentToSidecar(
      sidecar,
      createCommentRecord({
        ...ALICE,
        id,
        body: id,
        quotedText: id,
        createdAt: at,
      }),
    );
  }

  const views = commentViews(state.doc, sidecar);
  // 按正文位置升序；没有锚点的那条排最后，不管它建得多早。
  assert.deepEqual(
    views.map((view) => view.id),
    ["earlier", "later", "gone"],
  );
  assert.deepEqual(views[0].range, { from: 1, to: 6 });
  assert.equal(views[0].anchorText, "hello");
  assert.equal(views[2].range, null);
  assert.equal(views[2].anchorText, "");
});

test("正文 ↔ 侧栏双向跳转：范围与光标都能问出盖着哪几条批注", () => {
  let state = stateWithHistory(baseDoc());
  state = anchorComment(state, 1, 6, "c1");
  // 同一段文字叠第二条批注（法务与业务各批一条是常态，`excludes: ""` 允许）。
  state = anchorComment(state, 3, 9, "c2");

  assert.deepEqual(commentIdsInRange(state.doc, 1, 2).sort(), ["c1"]);
  assert.deepEqual(commentIdsInRange(state.doc, 4, 5).sort(), ["c1", "c2"]);
  assert.deepEqual(commentIdsInRange(state.doc, 8, 9).sort(), ["c2"]);
  assert.deepEqual(commentIdsInRange(state.doc, 10, 12), []);

  // 光标（零宽）落在批注文字中间也要点亮侧栏。
  assert.deepEqual(commentIdsAtPosition(state.doc, 4).sort(), ["c1", "c2"]);
  assert.deepEqual(commentIdsAtPosition(state.doc, 11), []);

  // 越界坐标不许抛：侧栏点击来的位置可能已经过时。
  assert.deepEqual(commentIdsInRange(state.doc, -50, 9999).sort(), ["c1", "c2"]);
  assert.deepEqual(commentIdsAtPosition(state.doc, 9999), []);
});

test("回复线程与解决/重开", () => {
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

  sidecar = addReplyToSidecar(sidecar, "c1", {
    ...BOB,
    id: "r1",
    body: "同意，改成 hi",
    createdAt: "T1",
  });
  sidecar = addReplyToSidecar(sidecar, "c1", {
    ...ALICE,
    id: "r2",
    body: "已改",
    createdAt: "T2",
  });

  assert.deepEqual(
    sidecar.comments[0].replies.map((reply) => [reply.id, reply.authorName]),
    [
      ["r1", "乙"],
      ["r2", "甲"],
    ],
  );

  sidecar = setCommentResolved(sidecar, "c1", true, BOB.author, "T3");
  assert.equal(sidecar.comments[0].resolved, true);
  assert.equal(sidecar.comments[0].resolvedBy, BOB.author);
  assert.equal(sidecar.comments[0].resolvedAt, "T3");

  // 重开必须把「谁在什么时候解决的」一并清掉，否则界面上会显示一条自相矛盾的记录。
  sidecar = setCommentResolved(sidecar, "c1", false, ALICE.author, "T4");
  assert.equal(sidecar.comments[0].resolved, false);
  assert.equal(sidecar.comments[0].resolvedAt, undefined);
  assert.equal(sidecar.comments[0].resolvedBy, undefined);
  // 解决/重开不碰回复。
  assert.equal(sidecar.comments[0].replies.length, 2);

  // 对不存在的 id 操作是无操作，且原样返回同一个引用。
  assert.equal(addReplyToSidecar(sidecar, "nope", { ...ALICE, body: "x" }), sidecar);
  assert.equal(removeCommentFromSidecar(sidecar, "nope"), sidecar);
  assert.equal(removeCommentFromSidecar(sidecar, "c1").comments.length, 0);
});

test("批注载荷绝不进正文节点树：正文里只有一个不含语义的 commentId", () => {
  const state = anchorComment(stateWithHistory(baseDoc()), 1, 6, "c1");
  const sidecar = addCommentToSidecar(
    emptyReviewSidecar(),
    createCommentRecord({
      ...ALICE,
      id: "c1",
      body: "这句要改，法务不同意",
      quotedText: "hello",
      createdAt: "T0",
    }),
  );

  const json = state.doc.toJSON();
  const serialized = JSON.stringify(json);

  // 正文里带 richdocComment 的那个文本节点，attrs 只有 commentId 一个键。
  const marked = json.content[0].content.find((node) =>
    (node.marks || []).some((mark) => mark.type === "richdocComment"),
  );
  const commentMark = marked.marks.find((mark) => mark.type === "richdocComment");
  assert.deepEqual(Object.keys(commentMark.attrs), ["commentId"]);
  assert.equal(commentMark.attrs.commentId, "c1");

  // 批注的语义载荷一个字都不许出现在正文序列化结果里。
  for (const leaked of [
    "这句要改，法务不同意",
    "u-alice",
    "甲",
    "T0",
    "resolved",
    "replies",
  ]) {
    assert.equal(
      serialized.includes(leaked),
      false,
      `正文节点树里泄漏了批注载荷：${leaked}`,
    );
  }
  // 反面对照：这些字确实在 sidecar 里，所以上面的零命中不是断言写错了。
  const sidecarSerialized = JSON.stringify(sidecar);
  for (const present of ["这句要改，法务不同意", "u-alice", "甲", "T0"]) {
    assert.equal(sidecarSerialized.includes(present), true);
  }
});

test("导出纯净文档：摘掉锚点后与从没批注过的同一份文档逐字节相同", () => {
  const pristine = baseDoc().toJSON();

  const state = anchorComment(stateWithHistory(baseDoc()), 1, 6, "c1");
  const withComment = state.doc.toJSON();
  assert.equal(countReviewMarksInJson(withComment), 1);

  const stripped = stripReviewMarks(withComment);
  assert.equal(countReviewMarksInJson(stripped), 0);

  // 过一遍真 schema：`Fragment.fromJSON` 会把 markup 相同的相邻文本节点并回去，
  // 所以「剥离干净」可以拿逐字节相等来判，而不是只数 mark。
  const rebuilt = ProseMirrorNode.fromJSON(schema, stripped);
  assert.deepEqual(rebuilt.toJSON(), pristine);
  assert.equal(rebuilt.textContent, "hello world");
});

test("sidecar 挂在工程档根对象上，老读者拿到的文档一模一样", () => {
  const docJson = baseDoc().toJSON();
  const sidecar = addCommentToSidecar(
    emptyReviewSidecar(),
    createCommentRecord({
      ...ALICE,
      id: "c1",
      body: "这句要改",
      quotedText: "hello",
      createdAt: "T0",
    }),
  );

  const attached = attachReviewSidecar(docJson, sidecar);
  assert.deepEqual(Object.keys(attached), ["type", "content", "review"]);

  // 只认 type/content 的老读者读到的文档与没有 sidecar 时一模一样。
  assert.deepEqual(ProseMirrorNode.fromJSON(schema, attached).toJSON(), docJson);

  const read = readReviewSidecar(attached);
  assert.equal(read.comments.length, 1);
  assert.equal(read.comments[0].body, "这句要改");
  assert.deepEqual(stripReviewSidecar(attached), docJson);

  // 空 sidecar 原样剥离：没开审阅的文档不该因为这一波多出任何 diff。
  assert.equal(isReviewSidecarEmpty(emptyReviewSidecar()), true);
  assert.deepEqual(attachReviewSidecar(docJson, emptyReviewSidecar()), docJson);
  assert.deepEqual(
    Object.keys(attachReviewSidecar(docJson, emptyReviewSidecar())),
    ["type", "content"],
  );

  // 修订开关自己也要落盘：换台机器打开还应是开着的。
  const switched = setTrackChangesEnabled(emptyReviewSidecar(), true);
  assert.equal(isReviewSidecarEmpty(switched), false);
  assert.equal(
    readReviewSidecar(attachReviewSidecar(docJson, switched)).trackChangesEnabled,
    true,
  );
});

test("坏掉的审阅数据降级成空 sidecar，不让用户连文档都打不开", () => {
  for (const broken of [
    null,
    undefined,
    "not an object",
    { review: "nope" },
    { review: { comments: "nope" } },
    { review: { comments: [null, 42, { body: "无 id 的记录" }] } },
  ]) {
    const read = readReviewSidecar(broken);
    assert.equal(read.version, 1);
    assert.deepEqual(read.comments, []);
    assert.equal(read.trackChangesEnabled, false);
  }
});
