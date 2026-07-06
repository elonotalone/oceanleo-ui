// ============================================================================
// @oceanleo/ui — promptSlot：Tiptap/ProseMirror「原子占位」内联节点
// ----------------------------------------------------------------------------
// 宗旨 v15h（2026-07-06）：模板里的 `[字段]` 是一个**不可分割的原子块**（业界 mention/
// variable/token 同款：`inline:true + atom:true`）。ProseMirror 因此原生保证：
//   · 光标跳过它、不能进内部；
//   · 第一次退格选中整块、第二次删掉整块；删就整块删，绝不删出 `[主题` 半截；
//   · 复制粘贴带数据（hint）。
// 交互（见 promptSlotPlugin）：点它 → NodeSelection 整块选中（视觉：左侧一条蓝 caret，
// 「像可输入」）；一打字 → NodeSelection 下 insertText 原生**整块替换**为普通文本（方括号
// 连节点一起消失，变成正常蓝色可编辑文字）。
//
// 序列化契约：
//   · 编辑器取值（getPlainValue）：未替换的 slot 吐 `[hint]` 字面（AI 侧理解占位）；
//     已被用户替换的就是普通 text，正常吐字符。
//   · parseHTML/renderHTML round-trip：<span data-oc-slot data-hint="输入主题">。
// ============================================================================

import { Node, mergeAttributes } from "@tiptap/core";

export interface PromptSlotOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const PROMPT_SLOT_NAME = "promptSlot";

export const PromptSlot = Node.create<PromptSlotOptions>({
  name: PROMPT_SLOT_NAME,

  group: "inline",
  inline: true,
  atom: true, // 不可分割：光标跳过、整体删、不可进内部
  selectable: true,
  draggable: false,

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
    };
  },

  parseHTML() {
    return [{ tag: "span[data-oc-slot]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const hint = (HTMLAttributes["data-hint"] as string) || "";
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-oc-slot": "",
        class: "oc-slot",
      }),
      `[${hint}]`, // 可见文本 = 带方括号的占位（浅蓝，样式见 globals.css）
    ];
  },

  // 取值时该节点渲染成的纯文本（未替换的占位 → `[hint]` 字面）。
  renderText({ node }) {
    return `[${node.attrs.hint as string}]`;
  },
});
