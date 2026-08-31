// 富文档查找替换 · 面板绑定 / 区分大小写 / 全字匹配 / 替换全部一步撤销（W15）
//
// 这份测试跑在**真 ProseMirror 状态**上：真 schema、真 `Transaction`、真
// `history` 插件。没有 mock 编辑器——「替换全部是不是一个事务」这条性质
// 一旦 mock 掉 dispatch 就永远测不出来，而它正是用户按一次撤销能不能全还原
// 的唯一依据。
//
// 仓里没装 jsdom（红线 6 不许为测试引新依赖），所以面板那一条锁的是
// `isRichDocFindShortcut()`——组件的键盘监听用的就是同一个函数。

import test from "node:test";
import assert from "node:assert/strict";

import { getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Underline from "@tiptap/extension-underline";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { history, undo, undoDepth } from "@tiptap/pm/history";

import {
  findEveryOccurrence,
  isRichDocFindShortcut,
  replaceEveryOccurrence,
} from "../src/shell/doc-editors/doc-family-commands.ts";

const schema = getSchema([Document, Paragraph, Text, Underline]);

/**
 * 一个够用的编辑器替身：`state` / `view.dispatch` 是被测代码唯一碰到的两样，
 * 底下是货真价实的 ProseMirror。顺带数一下 dispatch 次数——「单事务」这条
 * 性质的直接读数就是它。
 */
function editorWith(paragraphs) {
  const doc = ProseMirrorNode.fromJSON(schema, {
    type: "doc",
    content: paragraphs.map((entry) =>
      typeof entry === "string"
        ? {
            type: "paragraph",
            content: entry ? [{ type: "text", text: entry }] : [],
          }
        : entry,
    ),
  });
  let state = EditorState.create({
    doc,
    // newGroupDelay: 0 = 关掉历史插件「相邻改动按时间合并」那一层。
    // 不关的话，逐个 dispatch 的实现也会被凑成一步撤销，
    // 「单事务」这条性质就被时钟掩盖住、测不出来了。
    plugins: [history({ newGroupDelay: 0 })],
  });
  let dispatchCount = 0;
  return {
    get state() {
      return state;
    },
    view: {
      dispatch(transaction) {
        dispatchCount += 1;
        state = state.apply(transaction);
      },
    },
    get dispatchCount() {
      return dispatchCount;
    },
    get undoSteps() {
      return undoDepth(state);
    },
    texts() {
      const out = [];
      state.doc.forEach((node) => out.push(node.textContent));
      return out;
    },
    undoOnce() {
      return undo(state, (transaction) => {
        state = state.apply(transaction);
      });
    },
  };
}

// --- 面板：Ctrl/Cmd+F 打开 ---------------------------------------------------

test("面板 · Ctrl+F 与 Cmd+F 都打开查找面板", () => {
  assert.equal(isRichDocFindShortcut({ key: "f", ctrlKey: true }), true);
  assert.equal(isRichDocFindShortcut({ key: "f", metaKey: true }), true);
  // 大写 F（按住 Shift 或开着大写锁定）也要认，否则用户偶发地按不出面板。
  assert.equal(isRichDocFindShortcut({ key: "F", metaKey: true }), true);
});

test("面板 · 光按 F 不打开，Ctrl+Alt+F 让给输入法", () => {
  assert.equal(isRichDocFindShortcut({ key: "f" }), false);
  assert.equal(isRichDocFindShortcut({ key: "g", ctrlKey: true }), false);
  // Ctrl+Alt+F 在多种输入法里是别的功能，抢过来会挡住用户。
  assert.equal(
    isRichDocFindShortcut({ key: "f", ctrlKey: true, altKey: true }),
    false,
  );
});

// --- 区分大小写 -------------------------------------------------------------

test("区分大小写 · 默认开，Word 找不到 word", () => {
  const editor = editorWith(["Word 与 word 各一次"]);
  assert.equal(findEveryOccurrence(editor, "Word").length, 1);
  assert.equal(findEveryOccurrence(editor, "word").length, 1);
});

test("区分大小写 · 关掉之后两种写法都算", () => {
  const editor = editorWith(["Word 与 word 各一次"]);
  assert.equal(
    findEveryOccurrence(editor, "word", { matchCase: false }).length,
    2,
  );
});

// --- 全字匹配 ---------------------------------------------------------------

test("全字匹配 · 词中间的那次不算", () => {
  const editor = editorWith(["word wordy sword word."]);
  assert.equal(findEveryOccurrence(editor, "word").length, 4);
  // 只剩独立成词的两处：开头那个，与结尾 `word.` 那个。
  assert.equal(
    findEveryOccurrence(editor, "word", { wholeWord: true }).length,
    2,
  );
});

test("全字匹配 · 数字与下划线算词内字符", () => {
  const editor = editorWith(["id id_2 3id"]);
  assert.equal(findEveryOccurrence(editor, "id", { wholeWord: true }).length, 1);
});

test("全字匹配 · 中文里勾上它不该把查找结果清零（修掉的既有缺陷）", () => {
  // 改之前：`\p{L}` 把汉字也算词内字符，「合同」两侧都是汉字，两处全被边界
  // 判据滤掉——中文文档里勾一下这个框，查找就再也找不到任何东西。这个产品
  // 的目标用户就是中文公文，这条是实打实会碰到的。
  const editor = editorWith(["合同编号与合同金额"]);
  assert.equal(findEveryOccurrence(editor, "合同").length, 2);
  assert.equal(
    findEveryOccurrence(editor, "合同", { wholeWord: true }).length,
    2,
  );
});

test("全字匹配 · CJK 放行不等于整条判据失效，英文那侧照样守边界", () => {
  const editor = editorWith(["中文word中文 wordy"]);
  assert.equal(
    findEveryOccurrence(editor, "word", { wholeWord: true }).length,
    1,
  );
});

test("空关键词返回空，不会把整篇文档当成命中", () => {
  const editor = editorWith(["随便什么字"]);
  assert.deepEqual(findEveryOccurrence(editor, ""), []);
});

test("匹配不跨文本节点：被加粗切开的词找不到（既有行为，如实记录）", () => {
  // 「合同」的「合」在下划线段里、「同」在普通段里，是两个 text node。
  const editor = editorWith([
    {
      type: "paragraph",
      content: [
        { type: "text", text: "合", marks: [{ type: "underline" }] },
        { type: "text", text: "同编号" },
      ],
    },
  ]);
  assert.equal(findEveryOccurrence(editor, "合同").length, 0);
  assert.equal(findEveryOccurrence(editor, "同编号").length, 1);
});

// --- 替换全部：单事务 / 一步撤销 --------------------------------------------

test("替换全部 · 返回替换条数，正文真的变了", () => {
  const editor = editorWith(["甲方与甲方签署", "甲方盖章"]);
  assert.equal(replaceEveryOccurrence(editor, "甲方", "乙方"), 3);
  assert.deepEqual(editor.texts(), ["乙方与乙方签署", "乙方盖章"]);
});

test("替换全部 · 只 dispatch 一次（单事务，这是一步撤销的前提）", () => {
  const editor = editorWith(["甲方与甲方签署", "甲方盖章"]);
  replaceEveryOccurrence(editor, "甲方", "乙方");
  assert.equal(editor.dispatchCount, 1);
});

test("替换全部 · 按一次撤销全部还原，不是撤三次", () => {
  const editor = editorWith(["甲方与甲方签署", "甲方盖章"]);
  replaceEveryOccurrence(editor, "甲方", "乙方");

  // 历史插件里只攒了一步——三处替换是一个撤销单位。
  assert.equal(editor.undoSteps, 1);
  assert.equal(editor.undoOnce(), true);
  assert.deepEqual(editor.texts(), ["甲方与甲方签署", "甲方盖章"]);
});

test("替换全部 · 替换串比原串长/短时位置不错乱（从后往前改）", () => {
  // 从前往后改的话，第一处替换的长度差会把后面所有位置挪走，
  // 结果是替换落到词的中间——这条用例专门钉住这个。
  const longer = editorWith(["A 和 A 和 A"]);
  assert.equal(replaceEveryOccurrence(longer, "A", "XYZ"), 3);
  assert.deepEqual(longer.texts(), ["XYZ 和 XYZ 和 XYZ"]);

  const shorter = editorWith(["XYZ 和 XYZ 和 XYZ"]);
  assert.equal(replaceEveryOccurrence(shorter, "XYZ", "A"), 3);
  assert.deepEqual(shorter.texts(), ["A 和 A 和 A"]);
});

test("替换全部 · 一处都没找到时不 dispatch，不往撤销栈里塞空事务", () => {
  const editor = editorWith(["合同正文"]);
  assert.equal(replaceEveryOccurrence(editor, "不存在的词", "X"), 0);
  assert.equal(editor.dispatchCount, 0);
  assert.equal(editor.undoSteps, 0);
});

test("替换全部 · 尊重区分大小写与全字匹配两个选项", () => {
  const cased = editorWith(["Word 与 word"]);
  assert.equal(replaceEveryOccurrence(cased, "word", "文档"), 1);
  assert.deepEqual(cased.texts(), ["Word 与 文档"]);

  const whole = editorWith(["word wordy"]);
  assert.equal(
    replaceEveryOccurrence(whole, "word", "文档", { wholeWord: true }),
    1,
  );
  assert.deepEqual(whole.texts(), ["文档 wordy"]);
});

test("替换全部 · 新串包含原串也不会自己吃自己（不重复替换）", () => {
  const editor = editorWith(["甲方"]);
  assert.equal(replaceEveryOccurrence(editor, "甲方", "甲方（盖章）"), 1);
  assert.deepEqual(editor.texts(), ["甲方（盖章）"]);
});
