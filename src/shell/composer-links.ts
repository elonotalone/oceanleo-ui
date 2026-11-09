import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/** Protocol links and www links only. Bare domains deliberately do not match. */
export const COMPOSER_LINK_RE = /(?:https?:\/\/|www\.)[^\s<>]+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:，。！？；：、）》」』】〉》]+$/u;

export function normaliseComposerUrl(raw: string): string {
  return /^www\./i.test(raw) ? `https://${raw}` : raw;
}

export function composerLinkRanges(text: string): Array<{ from: number; to: number; raw: string; href: string }> {
  const ranges: Array<{ from: number; to: number; raw: string; href: string }> = [];
  for (const match of text.matchAll(COMPOSER_LINK_RE)) {
    const raw = match[0].replace(TRAILING_PUNCTUATION, "");
    if (!raw) continue;
    const from = match.index ?? 0;
    ranges.push({ from, to: from + raw.length, raw, href: normaliseComposerUrl(raw) });
  }
  return ranges;
}

export const ComposerLink = Mark.create({
  name: "composerLink",
  inclusive: false,
  addAttributes() {
    return {
      href: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-composer-link]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const href = String(HTMLAttributes.href || "");
    const icon = `/v1/link-icon?url=${encodeURIComponent(href)}`;
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        href,
        target: "_blank",
        rel: "noopener,noreferrer",
        class: "oc-composer-link",
        "data-composer-link": "",
      }),
      ["img", { src: icon, alt: "", width: "14", height: "14", class: "oc-composer-link-icon", "aria-hidden": "true" }],
      0,
    ];
  },
  addProseMirrorPlugins() {
    const mark = this.type;
    return [
      new Plugin({
        key: new PluginKey("composerLinkify"),
        appendTransaction: (transactions, _oldState, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const ranges: Array<{ from: number; to: number; href: string }> = [];
          state.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return;
            for (const range of composerLinkRanges(node.text)) {
              const from = pos + range.from;
              const to = pos + range.to;
              const existing = node.marks.find((item) => item.type === mark && item.attrs.href === range.href);
              if (!existing) ranges.push({ from, to, href: range.href });
            }
          });
          if (!ranges.length) return null;
          let tr = state.tr;
          for (const range of ranges) tr = tr.addMark(range.from, range.to, mark.create({ href: range.href }));
          return tr;
        },
      }),
    ];
  },
});
