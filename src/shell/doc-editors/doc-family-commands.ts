import type { Editor } from "@tiptap/core";
import type { EditorContextSurfaceInput } from "../plugin-command/types";
import { boundedAgentContent } from "../plugin-command/bounded-agent-content";
import { pluginTargetForLibraryItem } from "../active-agent-file";
import type { RichDocEditorState } from "./use-rich-doc-editor";
import type { DeckEditorState } from "./use-deck-editor";
export function isRichDocFindShortcut(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): boolean {
  if (event.key !== "f" && event.key !== "F") return false;
  return Boolean(event.metaKey || event.ctrlKey) && !event.altKey;
}

/** 查找选项。默认值 = 本函数长出选项之前的行为（区分大小写、不限全字）。 */
export interface RichDocFindOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
}

/**
 * 「全字匹配」的边界字符。
 *
 * **汉字与假名不算词内字符。** 这一条以前的注释写的是「对 CJK 等于不限制」，
 * 但代码做的正相反：`\p{L}` 把汉字也算进词内字符，于是「合同编号与合同金额」
 * 里搜「合同」两侧都是汉字，**两处全被边界判据滤掉，结果是零命中**——
 * 中文文档里勾一下这个框，查找就再也找不到任何东西。
 * 本波把行为改成注释原本承诺的那个：CJK 不设边界限制。
 * 判据在 `tests/richdoc-find-replace.test.mjs`。
 */
function isWordChar(value: string | undefined): boolean {
  if (!value) return false;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)) {
    return false;
  }
  return /[\p{L}\p{N}_]/u.test(value);
}

/**
 * 全文找出 `needle` 的所有位置。**匹配不跨文本节点**：一段文字被加粗切成两个
 * text node 时，跨着这条缝的词找不到。这是既有行为，UI 与命令共用同一份实现，
 * 免得两处对「找到几处」给出不同答案。
 */
export function findEveryOccurrence(
  editor: Editor,
  needle: string,
  options: RichDocFindOptions = {},
): { start: number; end: number }[] {
  if (!needle) return [];
  const matchCase = options.matchCase ?? true;
  const wholeWord = options.wholeWord ?? false;
  const probe = matchCase ? needle : needle.toLowerCase();
  const matches: { start: number; end: number }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    const haystack = matchCase ? text : text.toLowerCase();
    let index = haystack.indexOf(probe);
    while (index >= 0) {
      const boundaryOk =
        !wholeWord ||
        (!isWordChar(text[index - 1]) && !isWordChar(text[index + needle.length]));
      if (boundaryOk) {
        matches.push({ start: pos + index, end: pos + index + needle.length });
      }
      index = haystack.indexOf(probe, index + needle.length);
    }
  });
  return matches;
}

/**
 * 全部替换。**必须保持单事务**：一次 `dispatch` 才能一步撤销。
 * 拆成逐个 dispatch，`tests/richdoc-find-replace.test.mjs` 的撤销用例当场红。
 */
export function replaceEveryOccurrence(
  editor: Editor,
  from: string,
  to: string,
  options: RichDocFindOptions = {},
): number {
  const matches = findEveryOccurrence(editor, from, options);
  if (!matches.length) return 0;
  const transaction = editor.state.tr;
  // 从后往前改，前面的位置就不会被前一次替换的长度差挪走。
  for (const match of [...matches].reverse()) {
    transaction.insertText(to, match.start, match.end);
  }
  editor.view.dispatch(transaction);
  return matches.length;
}


export function buildRichDocContext(editor: RichDocEditorState): EditorContextSurfaceInput {
  return {
    editorId: "richdoc",
    target: () => pluginTargetForLibraryItem(editor.item, "richdoc", editor.editRevision),
    selection: () => {
      const selection = editor.editor?.state.selection;
      return selection && !selection.empty ? { kind: "text", from: selection.from, to: selection.to } : { kind: "whole-file" };
    },
    agentContext: () => {
      const instance = editor.editor;
      if (!instance || editor.loading || !editor.sourceReady) return { ready: false, reason: "Document source unavailable" };
      const { from, to, empty } = instance.state.selection;
      return boundedAgentContent({
        selectedText: empty ? undefined : instance.state.doc.textBetween(from, to, "\n"),
        before: instance.state.doc.textBetween(Math.max(0, from - 600), from, "\n"),
        after: instance.state.doc.textBetween(empty ? from : to, Math.min(instance.state.doc.content.size, (empty ? from : to) + 600), "\n"),
      });
    },
  };
}
export function buildDeckContext(editor: DeckEditorState): EditorContextSurfaceInput {
  return {
    editorId: "deck",
    target: () => pluginTargetForLibraryItem(editor.item, "deck", editor.editRevision),
    selection: () => ({ kind: "slides", slideIds: editor.deck.slides[editor.activeIndex] ? [editor.deck.slides[editor.activeIndex].id] : [], elementIds: editor.selectedElementId ? [editor.selectedElementId] : [] }),
    agentContext: () => editor.loading ? { ready: false, reason: "Deck source unavailable" } : boundedAgentContent({ title: editor.deck.title, slide: editor.deck.slides[editor.activeIndex] }),
  };
}
