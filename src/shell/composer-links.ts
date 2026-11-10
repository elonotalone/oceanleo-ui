import { Mark, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { getTask } from "../lib/agent";
import { parseTaskLink } from "../lib/task-link";

/** Protocol links and www links only. Bare domains deliberately do not match. */
export const COMPOSER_LINK_RE = /(?:https?:\/\/|www\.)[^\s<>\p{Script=Han}，。！？；：、）》」』】〉》]+/giu;
const TRAILING_PUNCTUATION = /[.,!?;:，。！？；：、）》」』】〉》)]+$/u;

export function normaliseComposerUrl(raw: string): string {
  return /^www\./i.test(raw) ? `https://${raw}` : raw;
}

const taskTitleCache = new Map<string, string | null>();
const taskTitleRequests = new Map<string, Promise<string | null>>();

/** Direct owner-scoped lookup, including tasks beyond the first history page. */
export async function resolveOwnTaskTitle(url: string): Promise<string | null> {
  const parsed = parseTaskLink(url);
  if (!parsed) return null;
  const id = parsed.taskId;
  if (taskTitleCache.has(id)) return taskTitleCache.get(id) ?? null;
  let request = taskTitleRequests.get(id);
  if (!request) {
    request = getTask(id, { messageLimit: 1 })
      .then((result) => result.ok ? result.data?.task.title || null : null)
      .catch(() => null)
      .then((title) => {
        taskTitleCache.set(id, title);
        taskTitleRequests.delete(id);
        return title;
      });
    taskTitleRequests.set(id, request);
  }
  return request;
}

export function openComposerLink(href: string): Window | null {
  if (typeof window === "undefined") return null;
  return window.open(normaliseComposerUrl(href), "_blank", "noopener,noreferrer");
}

export function composerLinkRanges(text: string, closedOnly = false): Array<{ from: number; to: number; raw: string; href: string }> {
  const ranges: Array<{ from: number; to: number; raw: string; href: string }> = [];
  for (const match of text.matchAll(COMPOSER_LINK_RE)) {
    const raw = match[0].replace(TRAILING_PUNCTUATION, "");
    if (!raw) continue;
    const from = match.index ?? 0;
    if (closedOnly && from + raw.length === text.length) continue;
    ranges.push({ from, to: from + raw.length, raw, href: normaliseComposerUrl(raw) });
  }
  return ranges;
}

export function linkifyEditor(editor: { state: any; view?: any; dispatch?: (tr: any) => void }, closedOnly = false): boolean {
  const mark = editor.state.schema.marks.composerLink;
  if (!mark) return false;
  let tr = editor.state.tr;
  let changed = false;
  editor.state.doc.descendants((node: any, pos: number) => {
    if (!node.isText || !node.text) return;
    for (const range of composerLinkRanges(node.text, closedOnly)) {
      const from = pos + range.from;
      const to = pos + range.to;
      const existing = node.marks.find((item: any) => item.type === mark && item.attrs.href === range.href);
      if (!existing) { tr = tr.addMark(from, to, mark.create({ href: range.href })); changed = true; }
    }
  });
  if (changed) (editor.view?.dispatch ?? editor.dispatch)?.call(editor.view ?? editor, tr);
  return changed;
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
      ["span", { class: "oc-composer-link-icon-wrap", contenteditable: "false" }, ["img", { src: icon, alt: "", width: "14", height: "14", class: "oc-composer-link-icon", "aria-hidden": "true" }]],
      ["span", { class: "oc-composer-link-text" }, 0],
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
            for (const range of composerLinkRanges(node.text, true)) {
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

/** An indivisible visual label; every plain-text path still carries the URL. */
export const ComposerTaskChip = Node.create({
  name: "composerTaskChip",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  marks: "",
  addAttributes() {
    return { href: { default: "" }, title: { default: "" } };
  },
  // Restore from plain text and resolve ownership again, never trust pasted HTML labels.
  parseHTML() { return []; },
  renderHTML({ node }) {
    const { href, title } = node.attrs;
    return ["span", {
      class: "oc-task-chip", "data-composer-task-chip": "", "data-href": href,
      "aria-label": title, contenteditable: "false",
    },
    ["span", { class: "oc-composer-link-icon-wrap" },
      ["img", { src: `/v1/link-icon?url=${encodeURIComponent(href)}`, alt: "", width: "14", height: "14", class: "oc-composer-link-icon", "aria-hidden": "true" }]],
    ["span", { class: "oc-task-chip-label" }, title]];
  },
  renderText({ node }) { return node.attrs.href; },
  addKeyboardShortcuts() {
    const removeAdjacent = (backward: boolean) => {
      const { state, view } = this.editor;
      if (view.composing || !state.selection.empty) return false;
      const { $from } = state.selection;
      const node = backward ? $from.nodeBefore : $from.nodeAfter;
      if (node?.type !== this.type) return false;
      const from = backward ? $from.pos - node.nodeSize : $from.pos;
      view.dispatch(state.tr.delete(from, from + node.nodeSize));
      return true;
    };
    return { Backspace: () => removeAdjacent(true), Delete: () => removeAdjacent(false) };
  },
  addProseMirrorPlugins() {
    const type = this.type;
    return [new Plugin({
      key: new PluginKey("composerTaskChips"),
      view(view) {
        let destroyed = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const pending = new Set<string>();
        const titles = new Map<string, string | null>();
        const schedule = () => {
          if (destroyed || timer !== undefined) return;
          timer = setTimeout(scan, 0);
        };
        const scan = () => {
          timer = undefined;
          if (destroyed || view.isDestroyed || view.composing) return;
          const replacements: Array<{ from: number; to: number; href: string; title: string }> = [];
          // Re-read positions after each async reply; edits may have moved/deleted the link.
          view.state.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return;
            for (const range of composerLinkRanges(node.text)) {
              const href = range.href;
              if (!parseTaskLink(href)) continue;
              if (titles.has(href)) {
                const title = titles.get(href);
                if (title) replacements.push({ from: pos + range.from, to: pos + range.to, href, title });
              } else if (!pending.has(href)) {
                pending.add(href);
                void resolveOwnTaskTitle(href).then((title) => {
                  if (destroyed) return;
                  pending.delete(href);
                  titles.set(href, title);
                  schedule();
                });
              }
            }
          });
          if (!replacements.length) return;
          const tr = view.state.tr.setMeta("addToHistory", false);
          for (const range of replacements.reverse()) {
            tr.replaceWith(range.from, range.to, type.create({ href: range.href, title: range.title }));
          }
          view.dispatch(tr);
        };
        const compositionEnd = () => schedule();
        view.dom.addEventListener("compositionend", compositionEnd);
        schedule();
        return {
          update: schedule,
          destroy() {
            destroyed = true;
            clearTimeout(timer);
            view.dom.removeEventListener("compositionend", compositionEnd);
          },
        };
      },
    })];
  },
});
