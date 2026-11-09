import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { listTasks } from "../lib/agent";
import { parseTaskLink } from "../lib/task-link";

/** Protocol links and www links only. Bare domains deliberately do not match. */
export const COMPOSER_LINK_RE = /(?:https?:\/\/|www\.)[^\s<>\p{Script=Han}，。！？；：、）》」』】〉》]+/giu;
const TRAILING_PUNCTUATION = /[.,!?;:，。！？；：、）》」』】〉》)]+$/u;

export function normaliseComposerUrl(raw: string): string {
  return /^www\./i.test(raw) ? `https://${raw}` : raw;
}

const taskTitleCache = new Map<string, string | null>();
let taskListPromise: Promise<void> | null = null;

/** Owner-scoped task lookup: the API only returns this user's task rows. */
export async function resolveOwnTaskTitle(url: string): Promise<string | null> {
  const parsed = parseTaskLink(url);
  if (!parsed) return null;
  if (taskTitleCache.has(parsed.taskId)) return taskTitleCache.get(parsed.taskId) ?? null;
  if (!taskListPromise) {
    taskListPromise = listTasks(100, undefined, false, "all", "all")
      .then((result) => {
        if (result.ok && result.data) for (const task of result.data.items) taskTitleCache.set(task.id, task.title || "");
      })
      .catch(() => undefined)
      .finally(() => { taskListPromise = null; });
  }
  await taskListPromise;
  return taskTitleCache.get(parsed.taskId) ?? null;
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
      taskTitle: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-composer-link]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const href = String(HTMLAttributes.href || "");
    const icon = `/v1/link-icon?url=${encodeURIComponent(href)}`;
    const taskTitle = typeof HTMLAttributes.taskTitle === "string" ? HTMLAttributes.taskTitle : "";
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        href,
        target: "_blank",
        rel: "noopener,noreferrer",
        class: taskTitle ? "oc-composer-link oc-task-chip" : "oc-composer-link",
        ...(taskTitle ? { "data-task-title": taskTitle } : {}),
        "data-composer-link": "",
      }),
      ["span", { class: "oc-composer-link-icon-wrap", contenteditable: "false" }, ["img", { src: icon, alt: "", width: "14", height: "14", class: "oc-composer-link-icon", "aria-hidden": "true" }]],
      ...(taskTitle ? [["span", { class: "oc-task-chip-label", contenteditable: "false" }, taskTitle] as const] : []),
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
