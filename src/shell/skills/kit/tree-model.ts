// Skills overhaul 2026-10-24 — W09A：左树右文查看器的纯函数（无 React，可单测）。

import type { TreeEntry, TreeEntryKind } from "./types";

export interface TreeNode {
  /** 完整相对路径（`/` 分隔，无前导斜杠） */
  path: string;
  name: string;
  type: "file" | "dir";
  size?: number;
  kind?: TreeEntryKind;
  depth: number;
  children: TreeNode[];
}

function normalizePath(raw: string): string {
  return (raw || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((seg) => seg && seg !== ".")
    .join("/");
}

function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
  const an = a.name.toLowerCase();
  const bn = b.name.toLowerCase();
  if (an < bn) return -1;
  if (an > bn) return 1;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * 扁平 `TreeEntry[]` → 树。网关可能只列文件不列目录，缺的中间目录自动补；
 * 每层目录优先、再按名字字母序（不区分大小写）。`..` 段直接丢弃，不会越出根。
 */
export function buildFolderTree(entries: readonly TreeEntry[]): TreeNode[] {
  const root: TreeNode = { path: "", name: "", type: "dir", depth: -1, children: [] };
  const dirs = new Map<string, TreeNode>([["", root]]);

  const ensureDir = (path: string): TreeNode => {
    const hit = dirs.get(path);
    if (hit) return hit;
    const cut = path.lastIndexOf("/");
    const parentPath = cut < 0 ? "" : path.slice(0, cut);
    const parent = ensureDir(parentPath);
    const node: TreeNode = {
      path,
      name: cut < 0 ? path : path.slice(cut + 1),
      type: "dir",
      depth: parent.depth + 1,
      children: [],
    };
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };

  for (const entry of entries) {
    const path = normalizePath(entry.path)
      .split("/")
      .filter((seg) => seg !== "..")
      .join("/");
    if (!path) continue;
    if (entry.type === "dir") {
      ensureDir(path);
      continue;
    }
    const cut = path.lastIndexOf("/");
    const parent = ensureDir(cut < 0 ? "" : path.slice(0, cut));
    if (parent.children.some((c) => c.path === path)) continue;
    parent.children.push({
      path,
      name: cut < 0 ? path : path.slice(cut + 1),
      type: "file",
      size: entry.size,
      kind: entry.kind,
      depth: parent.depth + 1,
      children: [],
    });
  }

  const sortDeep = (node: TreeNode) => {
    node.children.sort(compareNodes);
    node.children.forEach(sortDeep);
  };
  sortDeep(root);
  return root.children;
}

/** 深度优先、按显示顺序列出所有文件路径。 */
export function flattenFiles(nodes: readonly TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly TreeNode[]) => {
    for (const n of list) {
      if (n.type === "file") out.push(n.path);
      else walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** 默认选中：`initialPath`（存在才算）→ 根目录 `SKILL.md` → 任意层 `SKILL.md` → 第一个文件。 */
export function pickInitialFile(nodes: readonly TreeNode[], initialPath?: string): string | null {
  const files = flattenFiles(nodes);
  const wanted = initialPath ? normalizePath(initialPath) : "";
  if (wanted && files.includes(wanted)) return wanted;
  if (files.includes("SKILL.md")) return "SKILL.md";
  const nested = files.find((p) => p.split("/").pop() === "SKILL.md");
  if (nested) return nested;
  return files[0] ?? null;
}

/** 默认展开：第一层目录 + 选中文件的所有祖先目录。 */
export function initialExpanded(nodes: readonly TreeNode[], selected: string | null): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) if (n.type === "dir") out.add(n.path);
  if (selected) {
    const segs = selected.split("/");
    for (let i = 1; i < segs.length; i += 1) out.add(segs.slice(0, i).join("/"));
  }
  return out;
}

/** 选中文件的所有祖先目录路径。 */
export function ancestorDirs(path: string): string[] {
  const segs = normalizePath(path).split("/");
  const out: string[] = [];
  for (let i = 1; i < segs.length; i += 1) out.push(segs.slice(0, i).join("/"));
  return out;
}

/**
 * 拆 Markdown 开头的 YAML frontmatter。只认文件第一行就是 `---`（可带 BOM），
 * 到下一行单独的 `---` 或 `...` 为止；没闭合就当没有 frontmatter，整段按正文。
 */
export function splitFrontmatter(text: string): { frontmatter: string | null; body: string } {
  const src = (text || "").replace(/^﻿/, "");
  const lines = src.split(/\r?\n/);
  if (lines.length < 2 || lines[0].trim() !== "---") return { frontmatter: null, body: src };
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === "---" || line === "...") {
      const frontmatter = lines.slice(1, i).join("\n");
      const body = lines.slice(i + 1).join("\n").replace(/^\s*\n/, "");
      return { frontmatter, body };
    }
  }
  return { frontmatter: null, body: src };
}

/** 人看的文件大小。 */
export function formatBytes(bytes: number | undefined | null): string {
  const n = typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0 ? bytes : 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} ${units[u]}`;
}

const CODE_LANG: Record<string, string> = {
  py: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  sh: "bash",
  bash: "bash",
  html: "html",
  css: "css",
  svg: "xml",
  xml: "xml",
  sql: "sql",
  toml: "toml",
  md: "markdown",
  csv: "csv",
  txt: "text",
};

/** 由扩展名推断代码语言（只用于显示角标）。 */
export function codeLanguage(path: string): string {
  const ext = (path.split(".").pop() || "").toLowerCase();
  return CODE_LANG[ext] || ext || "text";
}

/** 为封面占位挑一个稳定的色（按标题哈希）。 */
export const COVER_PLACEHOLDER_TONES = [
  ["#E8EEF9", "#3B5BA9"],
  ["#F4ECE2", "#9A5B22"],
  ["#E6F2EC", "#2F7A55"],
  ["#F3E8F2", "#8A3F7E"],
  ["#EEF0E2", "#5E6B1F"],
  ["#E4F1F4", "#2A6E80"],
  ["#F6E7E5", "#A3443A"],
  ["#ECE9F6", "#5A4CA0"],
] as const;

export function coverTone(seed: string): readonly [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COVER_PLACEHOLDER_TONES[h % COVER_PLACEHOLDER_TONES.length];
}
