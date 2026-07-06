// ============================================================================
// @oceanleo/ui — promptSlot：Tiptap/ProseMirror「荧光占位」高亮 Mark（非原子节点）
// ----------------------------------------------------------------------------
// 宗旨 v15i（2026-07-06 定版；推翻 v15h 的 atom 节点）：模板里的 `[字段]` 与用户**填完的
// 内容**，视觉上**都是荧光块**（蓝底高亮）。区别只在：
//   · 未填（empty:true）= **浅蓝**荧光 + 内容 == hint（占位提示文字，如「周报或月报」）；
//   · 已填（empty:false）= **深蓝**荧光 + 内容 = 用户真实输入。
//
// 为什么用 Mark 而非 atom 节点（v15h 用 atom 被操作员否掉）：atom 锁死内部 → 光标进不去括号
//   → 只能整块替换 → 填完变普通文本（无荧光）→ 还得画假竖线 → 全选删/undo 被 atom 挡。这些
//   全是操作员 2026-07-06 复测打回的 bug。**Mark = 给普通可编辑文本染色**：光标能进、能打字、
//   能全选删、IME 原生、undo 原生——零守卫。这才是「变量高亮」业界真做法（Notion/飞书/豆包）。
//
// 未填→已填的翻转：不靠拦截输入（IME 不走 handleTextInput，拦截必踩坑），改靠一个**幂等的
//   appendTransaction**（见 promptSlotKeepEmptyInSync）——每次事务后比对每段 slot mark 的文本：
//   文本 == hint → empty:true（浅蓝）；文本 != hint → empty:false（深蓝）。不碰输入时序，最稳。
//   点未填块时调用方把整段提示文字选中（TextSelection 覆盖），用户一打字/一拼音 = 原生替换选区
//   → 文本变了 → appendTransaction 自动翻 empty:false → 深蓝。
//
// 序列化（docToPlain）：empty:true 的 slot run 吐 `[hint]` 字面（AI 侧理解占位）；empty:false
//   吐真实文本；无 mark 普通文本照吐。
// ============================================================================

import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface PromptSlotOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const PROMPT_SLOT_NAME = "promptSlot";

export const PromptSlot = Mark.create<PromptSlotOptions>({
  name: PROMPT_SLOT_NAME,

  // 让相邻同属性的 slot 文本合成一个 run；末尾继续打字自然扩展（已填内容随手加字仍高亮）。
  inclusive: true,
  // 不与其它 mark 互斥；但两个 hint 不同的 slot 不该合并 → 由 attrs 不同天然隔开。
  spanning: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      hint: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-hint") || "",
        renderHTML: (attrs) => ({ "data-hint": (attrs.hint as string) || "" }),
      },
      empty: {
        default: false,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-empty") === "1",
        renderHTML: (attrs) => (attrs.empty ? { "data-empty": "1" } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-oc-slot]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-oc-slot": "",
        class: "oc-slot",
      }),
      0,
    ];
  },

  // 幂等同步 empty：文本 == hint → empty:true；否则 false。每次事务后跑一遍。
  addProseMirrorPlugins() {
    const markType = this.type;
    return [
      new Plugin({
        key: new PluginKey("promptSlotKeepEmptyInSync"),
        appendTransaction: (_trs, _oldState, newState) => {
          type Run = { from: number; to: number; hint: string; empty: boolean; text: string };
          const runs: Run[] = [];
          // 收集所有连续的 promptSlot mark run（同 hint 连续文本为一段）。
          newState.doc.descendants((node, pos) => {
            if (!node.isText) return;
            const m = node.marks.find((mk) => mk.type === markType);
            if (!m) return;
            const from = pos;
            const to = pos + node.nodeSize;
            const hint = (m.attrs.hint as string) || "";
            const empty = Boolean(m.attrs.empty);
            const prev = runs[runs.length - 1];
            // 合并相邻、同 hint 的 run（ProseMirror 可能把一段拆成多个 text 节点）。
            if (prev && prev.to === from && prev.hint === hint && prev.empty === empty) {
              prev.to = to;
              prev.text += node.text || "";
            } else {
              runs.push({ from, to, hint, empty, text: node.text || "" });
            }
          });
          let tr = newState.tr;
          let changed = false;
          for (const r of runs) {
            const shouldBeEmpty = r.text === r.hint && r.hint.length > 0;
            if (shouldBeEmpty !== r.empty) {
              tr = tr
                .removeMark(r.from, r.to, markType)
                .addMark(r.from, r.to, markType.create({ hint: r.hint, empty: shouldBeEmpty }));
              changed = true;
            }
          }
          return changed ? tr : null;
        },
      }),
    ];
  },
});
