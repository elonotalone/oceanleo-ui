"use client";

// Library「来自 LeoChat」分区：LeoChat 里收发过的文件。MyLibrary 保留自己的工具栏 / 搜索 /
// 类型筛选，只把下面的货架换成这里。卡片、列表、骨架、空态、滑到底接下页全部用 Library
// 现有的组件，与其他分区同一套样子。
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import { SkeletonCard, timeAgo } from "../ui";
import { COLLECTION_ACTION_BTN_PRIMARY, CollectionCardGrid, CollectionInfiniteSentinel } from "./collection-chrome";
import { CollectionItemCard, CollectionItemList, CollectionItemRow } from "./collection-items";
import { libraryEditorLabel, translateLibraryTypeLabel } from "./library-editor-category";
import {
  chatFileLibraryItem,
  chatFileMatches,
  libraryItemMatches,
  listLibraryChatFiles,
  type LibraryChatFile,
} from "./library-chat-files";
import type { LibraryItem } from "./library-data";
import { formatBytes } from "./messages/conversation/AttachmentView";
import { openMessages } from "./messages/host-state";
import { WorkspaceKindIcon } from "./workspace-library-thumbnail";
import { WorkspaceLibraryEmpty } from "./workspace-library-view";

export interface LibraryChatFilesProps {
  query: string;
  category: string;
  view: "grid" | "list";
  className?: string;
  /** Library artifacts the server put in this section (`librarySource: "leochat"`); listed with the files, newest first. */
  artifacts?: readonly LibraryItem[];
  onOpenArtifact?: (item: LibraryItem) => void;
}

type ChatRow =
  | { type: "file"; key: string; at: number; file: LibraryChatFile }
  | { type: "artifact"; key: string; at: number; item: LibraryItem };

function timeOf(value: string | null | undefined): number {
  const at = Date.parse(value || "");
  return Number.isFinite(at) ? at : 0;
}

/** 与服务端默认页大小一致（`library_chat_files.py` PAGE_DEFAULT）。 */
const PAGE_SIZE = 50;
/** MyLibrary 的默认 accent（`WorkspaceLibrary` 卡片同值）。 */
const ACCENT = "#4f46e5";
/** 卡片动作按键：与素材卡「下载」同一只（`material-library-download.tsx`）。 */
const CARD_ACTION_CLASS =
  "inline-flex min-h-8 shrink-0 items-center rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]";

type Translate = ReturnType<typeof useUI>;
type LoadError = { status: number; message: string; cursor: string | null };

function fileMetadata(file: LibraryChatFile, tt: Translate): string {
  const sender = file.direction === "sent" ? tt("我发送的") : file.sender_name;
  const parts = [sender];
  if (file.conversation_title && file.conversation_title !== sender) parts.push(file.conversation_title);
  if (file.size !== null) parts.push(formatBytes(file.size));
  if (file.created_at) parts.push(timeAgo(file.created_at, tt));
  return parts.filter(Boolean).join(" · ");
}

function FileCover({ file, tt, compact = false }: { file: LibraryChatFile; tt: Translate; compact?: boolean }) {
  const item = chatFileLibraryItem(file);
  return (
    <span className={`grid h-full w-full place-items-center ${compact ? "scale-90" : ""}`}>
      <WorkspaceKindIcon kind={item.kind} accent={ACCENT} label={translateLibraryTypeLabel(tt, libraryEditorLabel(item))} />
    </span>
  );
}

function FileActions({ file, tt }: { file: LibraryChatFile; tt: Translate }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <a
        href={file.url}
        download={file.name}
        target="_blank"
        rel="noopener noreferrer"
        data-library-chat-file-download={file.id}
        className={CARD_ACTION_CLASS}
      >
        {tt("下载")}
      </a>
      {file.conversation_id ? (
        <button
          type="button"
          data-library-chat-file-open-chat={file.id}
          onClick={() => openMessages({ conversationId: file.conversation_id })}
          className={CARD_ACTION_CLASS}
        >
          {tt("打开聊天")}
        </button>
      ) : null}
    </div>
  );
}

function openFile(file: LibraryChatFile) {
  window.open(file.url, "_blank", "noopener,noreferrer");
}

export function LibraryChatFiles({
  query,
  category,
  view,
  className = "",
  artifacts = [],
  onOpenArtifact,
}: LibraryChatFilesProps) {
  const tt = useUI();
  const [items, setItems] = useState<LibraryChatFile[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (cursor: string | null) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    const result = await listLibraryChatFiles({ ...(cursor ? { cursor } : {}), limit: PAGE_SIZE, signal: controller.signal });
    if (controller.signal.aborted) return;
    setLoading(false);
    if (!result.ok) {
      setError({ status: result.status, message: result.error, cursor });
      return;
    }
    setItems((current) => (cursor ? [...current, ...result.items] : result.items));
    setSkipped((current) => (cursor ? current + result.skipped : result.skipped));
    setNext(result.next);
  }, []);

  useEffect(() => {
    void load(null);
    return () => controllerRef.current?.abort();
  }, [load]);

  // Files keep the server's order (newest message first); artifacts are merged in by time, newest first.
  const visible = useMemo<ChatRow[]>(() => {
    const files = items
      .filter((file) => chatFileMatches(file, { query, category }))
      .map((file): ChatRow => ({ type: "file", key: `file:${file.id}`, at: timeOf(file.created_at), file }));
    const saved = artifacts
      .filter((item) => libraryItemMatches(item, { query, category }))
      .map((item): ChatRow => ({ type: "artifact", key: `artifact:${item.key}`, at: timeOf(item.createdAt), item }))
      .sort((a, b) => b.at - a.at);
    const rows: ChatRow[] = [];
    let f = 0;
    let a = 0;
    while (f < files.length || a < saved.length) {
      if (a >= saved.length || (f < files.length && files[f].at >= saved[a].at)) rows.push(files[f++]);
      else rows.push(saved[a++]);
    }
    return rows;
  }, [artifacts, items, query, category]);
  const rowProps = (row: ChatRow, compact: boolean) =>
    row.type === "file"
      ? {
          cover: <FileCover file={row.file} tt={tt} compact={compact} />,
          title: row.file.name,
          metadata: fileMetadata(row.file, tt),
          onOpen: () => openFile(row.file),
          actions: <FileActions file={row.file} tt={tt} />,
          containerProps: { "data-library-chat-file": row.file.id },
        }
      : {
          cover: (
            <span className={`grid h-full w-full place-items-center ${compact ? "scale-90" : ""}`}>
              <WorkspaceKindIcon
                kind={row.item.kind}
                accent={ACCENT}
                label={translateLibraryTypeLabel(tt, libraryEditorLabel(row.item))}
              />
            </span>
          ),
          title: row.item.title,
          metadata: row.item.createdAt ? timeAgo(row.item.createdAt, tt) : "",
          onOpen: () => onOpenArtifact?.(row.item),
          containerProps: { "data-library-chat-artifact": row.item.artifactId || row.item.id },
        };
  const retry = error ? (
    <button type="button" data-library-chat-files-retry="" onClick={() => void load(error.cursor)} className={COLLECTION_ACTION_BTN_PRIMARY}>
      {tt("重试")}
    </button>
  ) : null;

  let shelf: ReactNode;
  const nothingYet = items.length === 0 && artifacts.length === 0;
  if (loading && nothingYet) {
    shelf = (
      <div role="status" aria-label={tt("正在加载…")} data-library-chat-files-loading="">
        {view === "list" ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => <SkeletonCard key={index} className="h-14" />)}
          </div>
        ) : (
          <CollectionCardGrid>
            {Array.from({ length: 8 }).map((_, index) => <SkeletonCard key={index} className="h-40" />)}
          </CollectionCardGrid>
        )}
      </div>
    );
  } else if (error && nothingYet) {
    shelf = error.status === 401
      ? <WorkspaceLibraryEmpty title={tt("登录后查看 LeoChat 里的文件")} description="" />
      : <WorkspaceLibraryEmpty title={tt(error.message)} description="" cta={retry} />;
  } else if (nothingYet) {
    // 这一页全被跳过但后面还有页：不说「没有文件」，交给下面的哨兵接着读。
    shelf = next ? null : <WorkspaceLibraryEmpty title={tt("LeoChat 里还没有收发过文件")} description="" />;
  } else if (visible.length === 0) {
    shelf = <WorkspaceLibraryEmpty title={tt("没有匹配内容")} description={tt("换一个关键词或分类试试。")} />;
  } else if (view === "list") {
    shelf = (
      <CollectionItemList>
        {visible.map((row) => (
          <CollectionItemRow key={row.key} {...rowProps(row, true)} />
        ))}
      </CollectionItemList>
    );
  } else {
    shelf = (
      <CollectionCardGrid>
        {visible.map((row) => (
          <CollectionItemCard key={row.key} {...rowProps(row, false)} />
        ))}
      </CollectionCardGrid>
    );
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`} data-library-chat-files="">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pt-3">
        {skipped > 0 ? (
          <p role="status" data-library-chat-files-skipped={String(skipped)} className="mb-2 text-[11px] text-[var(--muted,#a8a29e)]">
            {tt("有 {n} 个文件缺少信息，没有显示", { n: skipped })}
          </p>
        ) : null}
        {shelf}
        {!nothingYet && error ? (
          <div role="alert" className="flex items-center justify-center gap-3 py-3 text-[12px] text-[var(--fg-2,#57534e)]">
            <span>{tt(error.message)}</span>
            {retry}
          </div>
        ) : !error && (next || (loading && items.length > 0)) ? (
          <CollectionInfiniteSentinel
            active={Boolean(next) && !loading}
            loading={loading}
            onLoadMore={() => { if (next) void load(next); }}
            rootRef={scrollRef}
          />
        ) : null}
      </div>
    </div>
  );
}

export default LibraryChatFiles;
