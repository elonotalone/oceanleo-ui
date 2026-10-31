"use client";

// ============================================================================
// 输入框「＋」→「从资料库添加文件」（2026-10-31 A2）
// ----------------------------------------------------------------------------
// 就在「＋」菜单那张浮层里原地换成资料库列表（返回 + 搜索 + 列表，点一项即加入），
// 样式与同一菜单里的「最近文件」子菜单同一套，不另起对话框、不借别的页面的组件。
// 数据：私有「我的库」（`listMyArtifacts`，与首页「最近文件」同源）；只列有私有引用
// （artifactId + revisionId）的文件，选中后的附件形态与「最近文件」选中后一致
// （`composerAttachmentFromLibraryItem`），发送路径不需要任何改动。
// ============================================================================

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { ComposerAttachment } from "./LeoComposer";
import type { LibraryItem } from "./library-data";

type LoadLibrary = (signal: AbortSignal) => Promise<{ ok: boolean; data?: { items: LibraryItem[] } }>;

async function defaultLoadLibrary(signal: AbortSignal) {
  const { listMyArtifacts } = await import("./artifact-client");
  return listMyArtifacts({ limit: 100, signal });
}

/** 资料库里能作为附件加进来的文件（有私有引用的）。 */
export async function loadComposerLibraryFiles(
  signal: AbortSignal,
  load: LoadLibrary = defaultLoadLibrary,
): Promise<ComposerAttachment[] | null> {
  const result = await load(signal);
  if (!result.ok || !result.data) return null;
  const { composerAttachmentFromLibraryItem } = await import("./composer-upload");
  const seen = new Set<string>();
  const files: ComposerAttachment[] = [];
  for (const item of result.data.items || []) {
    const att = composerAttachmentFromLibraryItem(item);
    if (!att || seen.has(att.id)) continue;
    seen.add(att.id);
    files.push(att);
  }
  return files;
}

export function ComposerLibraryPicker({
  onBack,
  onPick,
  attachedIds,
  load,
  fileIcon,
}: {
  onBack: () => void;
  onPick: (file: ComposerAttachment) => void;
  /** 已在输入框里的附件 id：列表里标成已添加，不重复加。 */
  attachedIds?: readonly string[];
  /** 测试注入；缺省读私有「我的库」。 */
  load?: LoadLibrary;
  /** 非图片项的图标（沿用「最近文件」的那枚）。 */
  fileIcon?: (file: ComposerAttachment) => ReactNode;
}) {
  const tt = useUI();
  const [files, setFiles] = useState<ComposerAttachment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void loadComposerLibraryFiles(controller.signal, load)
      .then((list) => {
        if (controller.signal.aborted) return;
        if (list) setFiles(list);
        else setFailed(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!files) return [];
    return q ? files.filter((file) => (file.name || "").toLowerCase().includes(q)) : files;
  }, [files, query]);
  const attached = new Set(attachedIds ?? []);

  return (
    <div data-composer-library-picker="">
      <div className="flex items-center gap-1.5 px-2 pb-1.5">
        <button
          type="button"
          onClick={onBack}
          aria-label={tt("返回")}
          className="shrink-0 rounded-lg p-1.5 text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100 hover:text-neutral-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tt("搜索资料库")}
          aria-label={tt("搜索资料库")}
          autoFocus
          className="min-w-0 flex-1 rounded-lg bg-neutral-100/80 px-2.5 py-1.5 text-[13px] text-neutral-800 focus:outline-none"
        />
      </div>
      <div className="max-h-[260px] min-w-[260px] overflow-y-auto">
        {failed ? (
          <p className="px-3 py-2 text-[12px] text-red-600">{tt("资料库加载失败，请稍后重试")}</p>
        ) : files === null ? (
          <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("加载中…")}</p>
        ) : files.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("资料库里还没有文件")}</p>
        ) : shown.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("没有找到文件")}</p>
        ) : (
          shown.map((file) => {
            const added = attached.has(file.id);
            return (
              <button
                key={file.id}
                type="button"
                disabled={added}
                onClick={() => onPick(file)}
                data-composer-library-item={file.id}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-100">
                  {file.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.previewUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    fileIcon?.(file) ?? null
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{file.name || tt("文件")}</span>
                {added ? <span className="shrink-0 text-[11px] text-neutral-400">{tt("已添加")}</span> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
