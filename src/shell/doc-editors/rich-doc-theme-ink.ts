// ============================================================================
// @oceanleo/ui — 文档正文的深色显示层（D6）
// ----------------------------------------------------------------------------
// 深色下正文跟着变深（像飞书文档）。只改**显示**，存储内容一个字节不动：
//   · 默认黑字 / 近黑的中性灰字 → 主题前景色；
//   · 用户设过的其它颜色保留色相，只在深底上看不清（对比 < 4.5）时提亮到看得清；
//   · 高亮与单元格底色压暗成深底上的同色调，白底 / 近白底 → 透明（就是页面底）。
// 实现是 ProseMirror decoration：不进 getJSON / getHTML，不进撤销栈，不进协同。
// 浅色下一个 decoration 都不出。
// ============================================================================

import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** 深色主题的页面底（`pluginWorkbenchStyle` 的 `--card`）。 */
export const RICHDOC_DARK_PAGE = "#1b1b1f";
/** 深色主题的正文前景（`--awb-text`）。 */
export const RICHDOC_DARK_INK = "#ededf0";
const READABLE_CONTRAST = 4.5;

type Rgb = [number, number, number];

/** `#rgb` / `#rrggbb(aa)` / `rgb(a)(…)` / `black` / `white`；认不出返回 null。 */
export function parseRichDocColor(value: unknown): Rgb | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "black" || text === "windowtext") return [0, 0, 0];
  if (text === "white") return [255, 255, 255];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (short) return [1, 2, 3].map((index) => parseInt(short[index].repeat(2), 16)) as Rgb;
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/.exec(text);
  if (long) return [1, 2, 3].map((index) => parseInt(long[index], 16)) as Rgb;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(text);
  if (rgb) return [1, 2, 3].map((index) => Math.min(255, Number(rgb[index]))) as Rgb;
  return null;
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function richDocLuminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function richDocContrast(left: Rgb, right: Rgb): number {
  const a = richDocLuminance(left);
  const b = richDocLuminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return from.map((value, index) => Math.round(value + (to[index] - value) * amount)) as Rgb;
}

function hex(rgb: Rgb): string {
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function chroma([r, g, b]: Rgb): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

const PAGE = parseRichDocColor(RICHDOC_DARK_PAGE)!;
const WHITE: Rgb = [255, 255, 255];

/**
 * 深色下这个文字颜色怎么显示：`"ink"` = 换成主题前景；一个颜色串 = 提亮后的同色调；
 * `null` = 原样（本来就看得清，或认不出的颜色写法）。
 */
export function richDocDarkTextColor(value: unknown): "ink" | string | null {
  const rgb = parseRichDocColor(value);
  if (!rgb) return null;
  // 黑字、近黑的灰字是「默认字色」的意思，不是用户要的颜色。
  if (chroma(rgb) < 24 && richDocLuminance(rgb) < 0.2) return "ink";
  if (richDocContrast(rgb, PAGE) >= READABLE_CONTRAST) return null;
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(rgb, WHITE, step / 20);
    if (richDocContrast(candidate, PAGE) >= READABLE_CONTRAST) return hex(candidate);
  }
  return RICHDOC_DARK_INK;
}

/** 深色下的底色（高亮、单元格）：近白 → 透明；其它压暗到浅字看得清。 */
export function richDocDarkFillColor(value: unknown): string | null {
  const rgb = parseRichDocColor(value);
  if (!rgb) return null;
  if (chroma(rgb) < 16 && richDocLuminance(rgb) > 0.85) return "transparent";
  const ink = parseRichDocColor(RICHDOC_DARK_INK)!;
  for (let step = 10; step <= 19; step += 1) {
    const candidate = mix(rgb, PAGE, step / 20);
    if (richDocContrast(candidate, ink) >= READABLE_CONTRAST) return hex(candidate);
  }
  return hex(mix(rgb, PAGE, 0.95));
}

const DEFAULT_HIGHLIGHT = "#fef08a";

/** 整篇的深色 decoration（纯函数：同一份文档同一份结果）。 */
export function richDocDarkDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      const fill = node.attrs.backgroundColor ? richDocDarkFillColor(node.attrs.backgroundColor) : null;
      if (fill) {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: `background-color:${fill}` }));
      }
      return true;
    }
    if (!node.isText) return true;
    const styles: string[] = [];
    for (const mark of node.marks) {
      if (mark.type.name === "textStyle" && mark.attrs.color) {
        const shown = richDocDarkTextColor(mark.attrs.color);
        if (shown === "ink") styles.push("color:var(--richdoc-ink)");
        else if (shown) styles.push(`color:${shown}`);
      } else if (mark.type.name === "highlight") {
        const fill = richDocDarkFillColor(mark.attrs.color || DEFAULT_HIGHLIGHT);
        if (fill) styles.push(`background-color:${fill}`);
      }
    }
    if (styles.length) {
      decorations.push(Decoration.inline(pos, pos + node.nodeSize, { style: styles.join(";") }));
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export const RICHDOC_THEME_INK_KEY = new PluginKey<DecorationSet>("richDocThemeInk");

export interface RichDocThemeInkStorage {
  dark: boolean;
}

/** 编辑器扩展：主题换了由舞台调 `refreshRichDocThemeInk`，扩展数组不变、编辑器不重建。 */
export const RichDocThemeInk = Extension.create<Record<string, never>, RichDocThemeInkStorage>({
  name: "richDocThemeInk",
  addStorage() {
    return { dark: false };
  },
  addProseMirrorPlugins() {
    const storage = this.storage;
    const compute = (doc: ProseMirrorNode) =>
      storage.dark ? richDocDarkDecorations(doc) : DecorationSet.empty;
    return [
      new Plugin<DecorationSet>({
        key: RICHDOC_THEME_INK_KEY,
        state: {
          init: (_config, state) => compute(state.doc),
          apply: (tr, previous) =>
            tr.docChanged || tr.getMeta(RICHDOC_THEME_INK_KEY) ? compute(tr.doc) : previous,
        },
        props: {
          decorations: (state) => RICHDOC_THEME_INK_KEY.getState(state),
        },
      }),
    ];
  },
});

/** 舞台在主题变化时调：只发一个不改文档、不进撤销栈的元事务。 */
export function refreshRichDocThemeInk(editor: Editor | null, dark: boolean): void {
  if (!editor || editor.isDestroyed) return;
  const storage = (editor.storage as unknown as Record<string, RichDocThemeInkStorage | undefined>)
    .richDocThemeInk;
  if (!storage || storage.dark === dark) return;
  storage.dark = dark;
  editor.view.dispatch(
    editor.state.tr.setMeta(RICHDOC_THEME_INK_KEY, true).setMeta("addToHistory", false),
  );
}
