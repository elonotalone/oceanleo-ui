"use client";

// Skills overhaul 2026-10-24 — W09A：左树右文查看器（技能详情 / Library 文件夹 / 项目资产文件夹三处共用）。
// 左：可折叠文件树（目录优先、字母序；默认展开第一层；默认选中 initialPath → SKILL.md → 第一个文件）。
// 右：按 kind 渲染——markdown 走现有 `Markdown`（skipHtml），frontmatter 抽成「YAML」代码块 + 复制；
// code/text 等宽 + 可选行号 + 复制；image 只认栅格 data:image/*;base64；binary 显示大小 + 下载。
// 内容一律当不可信数据：不用 innerHTML，全部走 React 文本节点。

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { Markdown } from "../../Markdown";
import { downloadFromGateway, isGatewayUrl } from "./folder-api";
import {
  KitIconAlert,
  KitIconCheck,
  KitIconChevronRight,
  KitIconCode,
  KitIconCopy,
  KitIconDownload,
  KitIconFileText,
  KitIconFolder,
  KitIconFolderOpen,
  KitIconImage,
  KitIconFile,
} from "./kit-icons";
import {
  ancestorDirs,
  buildFolderTree,
  codeLanguage,
  formatBytes,
  initialExpanded,
  pickInitialFile,
  splitFrontmatter,
  type TreeNode,
} from "./tree-model";
import type { FileContent, TreeEntry } from "./types";

export interface FolderTreeViewerProps {
  tree: TreeEntry[];
  loadFile: (path: string) => Promise<FileContent | null>;
  initialPath?: string;
  downloadUrl?: string;
  rootLabel?: string;
}

/** 只放行栅格图片的 base64 data URL；svg 网关当代码返回，这里也不当图片显示。 */
export function safeImageDataUrl(value: string | undefined | null): string | null {
  if (!value) return null;
  return /^data:image\/(png|jpe?g|gif|webp|bmp|avif|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=\s]+$/i.test(value)
    ? value
    : null;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading"; path: string }
  | { status: "error"; path: string }
  | { status: "ready"; path: string; file: FileContent };

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const tt = useUI();
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 1600);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <button
      type="button"
      data-copy-button=""
      onClick={async () => setState((await copyToClipboard(text)) ? "ok" : "fail")}
      className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] text-neutral-500 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-200/70 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      {state === "ok" ? <KitIconCheck className="h-3.5 w-3.5" /> : <KitIconCopy className="h-3.5 w-3.5" />}
      <span aria-live="polite">{state === "ok" ? tt("已复制") : state === "fail" ? tt("复制失败") : (label ?? tt("复制"))}</span>
    </button>
  );
}

export function CodeBlock({
  text,
  label,
  lineNumbers = false,
  onToggleLineNumbers,
}: {
  text: string;
  label: string;
  lineNumbers?: boolean;
  onToggleLineNumbers?: () => void;
}) {
  const tt = useUI();
  const lines = useMemo(() => text.replace(/\n$/, "").split("\n"), [text]);
  const gutter = String(lines.length).length;
  return (
    <div
      className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
      data-code-block={label}
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="font-mono text-[11.5px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
        <div className="flex items-center gap-1">
          {onToggleLineNumbers ? (
            <button
              type="button"
              aria-pressed={lineNumbers}
              onClick={onToggleLineNumbers}
              className="inline-flex h-7 items-center rounded-lg px-2 text-[12px] text-neutral-500 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-200/70 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              {tt("行号")}
            </button>
          ) : null}
          <CopyButton text={text} />
        </div>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.65] text-neutral-800 dark:text-neutral-200">
        <code>
          {lineNumbers
            ? lines.map((line, i) => (
                <span key={i} className="block">
                  <span
                    aria-hidden="true"
                    className="mr-4 inline-block select-none text-right text-neutral-400 dark:text-neutral-600"
                    style={{ minWidth: `${gutter}ch` }}
                  >
                    {i + 1}
                  </span>
                  {line}
                  {"\n"}
                </span>
              ))
            : text}
        </code>
      </pre>
    </div>
  );
}

function nodeIcon(node: TreeNode, open: boolean): ReactNode {
  if (node.type === "dir") return open ? <KitIconFolderOpen className="h-4 w-4" /> : <KitIconFolder className="h-4 w-4" />;
  if (node.kind === "markdown" || node.kind === "text") return <KitIconFileText className="h-4 w-4" />;
  if (node.kind === "code") return <KitIconCode className="h-4 w-4" />;
  if (node.kind === "image") return <KitIconImage className="h-4 w-4" />;
  return <KitIconFile className="h-4 w-4" />;
}

function TreeRows({
  nodes,
  expanded,
  selected,
  onToggle,
  onSelect,
}: {
  nodes: TreeNode[];
  expanded: Set<string>;
  selected: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  return (
    <ul role="group" className="space-y-px">
      {nodes.map((node) => {
        const open = node.type === "dir" && expanded.has(node.path);
        const isSel = node.type === "file" && node.path === selected;
        return (
          <li key={node.path} role="none">
            <button
              type="button"
              role="treeitem"
              aria-expanded={node.type === "dir" ? open : undefined}
              aria-selected={node.type === "file" ? isSel : undefined}
              data-tree-path={node.path}
              data-tree-type={node.type}
              title={node.path}
              onClick={() => (node.type === "dir" ? onToggle(node.path) : onSelect(node.path))}
              style={{ paddingLeft: `${8 + node.depth * 14}px` }}
              className={`flex w-full min-w-0 items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-[13px] outline-none transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus-visible:ring-2 focus-visible:ring-sky-200 ${
                isSel
                  ? "bg-neutral-200/70 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                  : "text-neutral-700 hover:bg-neutral-200/50 dark:text-neutral-300 dark:hover:bg-neutral-800/70"
              }`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-400">
                {node.type === "dir" ? (
                  <KitIconChevronRight
                    className={`h-3.5 w-3.5 transition-transform duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${open ? "rotate-90" : ""}`}
                  />
                ) : null}
              </span>
              <span className="shrink-0 text-neutral-500 dark:text-neutral-400">{nodeIcon(node, open)}</span>
              <span className="min-w-0 truncate">{node.name}</span>
            </button>
            {open && node.children.length ? (
              <TreeRows nodes={node.children} expanded={expanded} selected={selected} onToggle={onToggle} onSelect={onSelect} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function DownloadAction({ url, label }: { url: string; label: string }) {
  const tt = useUI();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cls =
    "inline-flex h-9 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 text-[13px] font-medium text-neutral-800 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800";
  if (!isGatewayUrl(url)) {
    // 非网关地址不带登录，普通链接即可；只放行 http(s)。
    if (!/^https?:\/\//i.test(url)) return null;
    return (
      <a href={url} download rel="noopener noreferrer" className={cls}>
        <KitIconDownload className="h-4 w-4" />
        {label}
      </a>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        className={cls}
        onClick={async () => {
          setBusy(true);
          setError("");
          const r = await downloadFromGateway(url);
          setBusy(false);
          if (!r.ok) setError(r.error);
        }}
      >
        <KitIconDownload className="h-4 w-4" />
        {busy ? tt("下载中…") : label}
      </button>
      {error ? <span className="text-[12px] text-red-600">{tt(error)}</span> : null}
    </span>
  );
}

function FileBody({ file, downloadUrl }: { file: FileContent; downloadUrl?: string }) {
  const tt = useUI();
  const [lineNumbers, setLineNumbers] = useState(false);
  const truncatedNote = file.truncated ? (
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
      <KitIconAlert className="h-4 w-4 shrink-0" />
      <span>{tt("文件较大，只显示了前一部分。下载后可查看完整内容。")}</span>
    </div>
  ) : null;

  const hasText = typeof file.text === "string";
  if (file.kind === "markdown" && hasText) {
    const { frontmatter, body } = splitFrontmatter(file.text as string);
    return (
      <div data-file-kind="markdown">
        {truncatedNote}
        {frontmatter != null ? (
          <div className="mb-5">
            <CodeBlock text={frontmatter} label="YAML" />
          </div>
        ) : null}
        <Markdown className="leo-skill-markdown text-[14.5px] leading-relaxed">{body}</Markdown>
      </div>
    );
  }
  if ((file.kind === "code" || file.kind === "text" || file.kind === "markdown") && hasText) {
    return (
      <div data-file-kind={file.kind}>
        {truncatedNote}
        <CodeBlock
          text={file.text as string}
          label={codeLanguage(file.path)}
          lineNumbers={lineNumbers}
          onToggleLineNumbers={() => setLineNumbers((v) => !v)}
        />
      </div>
    );
  }
  const image = file.kind === "image" ? safeImageDataUrl(file.data_url) : null;
  if (image) {
    return (
      <div data-file-kind="image" className="flex flex-col items-start gap-3">
        <img
          src={image}
          alt={file.path.split("/").pop() || ""}
          className="max-h-[60vh] max-w-full rounded-xl border border-neutral-200 bg-[repeating-conic-gradient(#f1f1f1_0_25%,#fff_0_50%)] bg-[length:16px_16px] object-contain dark:border-neutral-800"
        />
        <span className="text-[12px] text-neutral-500">{formatBytes(file.size)}</span>
      </div>
    );
  }
  return (
    <div
      data-file-kind="binary"
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-neutral-300 px-6 py-14 text-center dark:border-neutral-700"
    >
      <KitIconFile className="h-9 w-9 text-neutral-400" />
      <div className="text-[14px] font-medium text-neutral-800 dark:text-neutral-200">{file.path.split("/").pop()}</div>
      <div className="text-[13px] text-neutral-500 dark:text-neutral-400">
        {tt("这个文件无法预览")} · {formatBytes(file.size)}
      </div>
      {downloadUrl ? <DownloadAction url={downloadUrl} label={tt("下载整个文件夹")} /> : null}
    </div>
  );
}

export function FolderTreeViewer({ tree, loadFile, initialPath, downloadUrl, rootLabel }: FolderTreeViewerProps) {
  const tt = useUI();
  const nodes = useMemo(() => buildFolderTree(tree), [tree]);
  const firstPick = useMemo(() => pickInitialFile(nodes, initialPath), [nodes, initialPath]);
  const [selected, setSelected] = useState<string | null>(firstPick);
  const [expanded, setExpanded] = useState<Set<string>>(() => initialExpanded(nodes, firstPick));
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const cache = useRef(new Map<string, FileContent>());
  const seq = useRef(0);
  const loadRef = useRef(loadFile);
  loadRef.current = loadFile;

  // 树换了（换了一个文件夹）→ 重置选中、展开与缓存。
  useEffect(() => {
    cache.current = new Map();
    setSelected(firstPick);
    setExpanded(initialExpanded(nodes, firstPick));
  }, [nodes, firstPick]);

  const load = useCallback(async (path: string) => {
    const id = ++seq.current;
    const hit = cache.current.get(path);
    if (hit) {
      setState({ status: "ready", path, file: hit });
      return;
    }
    setState({ status: "loading", path });
    let file: FileContent | null = null;
    try {
      file = await loadRef.current(path);
    } catch {
      file = null;
    }
    if (id !== seq.current) return; // 用户已经点了别的文件
    if (!file) {
      setState({ status: "error", path });
      return;
    }
    cache.current.set(path, file);
    setState({ status: "ready", path, file });
  }, []);

  useEffect(() => {
    if (selected) void load(selected);
    else setState({ status: "idle" });
  }, [selected, load]);

  const onToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const onSelect = useCallback((path: string) => {
    setSelected(path);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const dir of ancestorDirs(path)) next.add(dir);
      return next;
    });
  }, []);

  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0 });
  }, [selected]);

  return (
    <div
      className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white md:flex-row dark:border-neutral-800 dark:bg-neutral-950"
      data-folder-tree-viewer=""
    >
      <nav
        aria-label={rootLabel || tt("文件")}
        className="flex max-h-56 shrink-0 flex-col border-b border-neutral-200 bg-[#fbfbfa] md:max-h-none md:w-[260px] md:border-b-0 md:border-r dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="px-4 pb-2 pt-4 text-[12px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {rootLabel || tt("文件")}
        </div>
        <div role="tree" aria-label={rootLabel || tt("文件")} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {nodes.length ? (
            <TreeRows nodes={nodes} expanded={expanded} selected={selected} onToggle={onToggle} onSelect={onSelect} />
          ) : (
            <p className="px-2 py-3 text-[13px] text-neutral-500">{tt("这个文件夹是空的")}</p>
          )}
        </div>
      </nav>
      <section
        ref={contentRef}
        aria-live="polite"
        aria-busy={state.status === "loading"}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto"
        data-folder-tree-content=""
      >
        {selected ? (
          <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-5 py-2.5 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
            <span className="min-w-0 truncate font-mono text-[12.5px] text-neutral-600 dark:text-neutral-400" title={selected}>
              {selected}
            </span>
            {state.status === "ready" ? (
              <span className="shrink-0 text-[12px] text-neutral-400">{formatBytes(state.file.size)}</span>
            ) : null}
          </div>
        ) : null}
        <div className="px-5 py-5 sm:px-7">
          {state.status === "loading" ? (
            <div className="space-y-2.5" data-folder-tree-loading="">
              <span className="sr-only">{tt("加载中…")}</span>
              {[92, 78, 85, 60, 70].map((w, i) => (
                <div key={i} className="h-3 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-800" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : state.status === "error" ? (
            <div className="flex flex-col items-start gap-3" role="alert" data-folder-tree-error="">
              <div className="flex items-center gap-2 text-[14px] text-red-600 dark:text-red-400">
                <KitIconAlert className="h-4 w-4" />
                {tt("无法读取这个文件")}
              </div>
              <button
                type="button"
                onClick={() => void load(state.path)}
                className="inline-flex h-8 items-center rounded-lg border border-neutral-200 bg-white px-3 text-[13px] text-neutral-700 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              >
                {tt("重试")}
              </button>
            </div>
          ) : state.status === "ready" ? (
            <FileBody key={state.path} file={state.file} downloadUrl={downloadUrl} />
          ) : (
            <p className="text-[14px] text-neutral-500">{tt("选择左侧的文件查看内容")}</p>
          )}
        </div>
      </section>
    </div>
  );
}
