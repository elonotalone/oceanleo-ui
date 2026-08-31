"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { uploadFile } from "../lib/database";
// W08：上传进度 / 图片压缩 / 粘贴与拖拽的同一条入口。
import {
  formatBytes,
  formatDuration,
  progressPercent,
  subscribeUploadProgress,
  type UploadProgressSnapshot,
} from "../lib/upload/progress";
import {
  MIN_COMPRESS_BYTES,
  compressImageFile,
  isImageFile,
  type CompressionOutcome,
} from "../lib/upload/image-compress";
import {
  filesFromPaste,
  filesFromTransfer,
  transferHasFiles,
} from "../lib/upload/intake";
import type { LibraryItem } from "./library-data";
import { LibraryItemViewer } from "./library-viewers";
import { WORKBENCH_MATERIAL_MIME } from "./workbench-material-provider";
import {
  uploadConversionNote,
  uploadEditorTargetForFileName,
  uploadSupportedExtensionsByTarget,
  uploadUnavailableReason,
  type UploadEditorTarget,
} from "./workbench-route-formats";

export function AdvancedWorkbenchStage({
  editorAvailable,
  editorStage,
  item,
  accent,
  draggedTitle,
  acceptLocalFiles = false,
  dropMessage,
  onMaterialDrop,
}: {
  editorAvailable: boolean;
  editorStage?: ReactNode;
  /**
   * 空件挂载（合同 §3.2）时手上还没有素材，所以这里可空。
   * 它只在「没有编辑器、退回看内容」那一档用得上，空的时候那一档本来也没得看。
   */
  item?: LibraryItem | null;
  accent: string;
  draggedTitle?: string;
  acceptLocalFiles?: boolean;
  dropMessage: string;
  onMaterialDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const tt = useUI();
  const dragDepth = useRef(0);
  const [stageDragging, setStageDragging] = useState(false);
  const acceptsDrop = (event: DragEvent<HTMLDivElement>) => {
    const types = Array.from(event.dataTransfer.types || []);
    return (
      (acceptLocalFiles && types.includes("Files")) ||
      types.includes(WORKBENCH_MATERIAL_MIME) ||
      Boolean(draggedTitle)
    );
  };
  return (
    <div
      role="main"
      className="relative h-full min-h-0 min-w-0 overflow-hidden bg-[var(--advanced-stage-bg,#f4f1e8)]"
      onDragEnter={(event) => {
        if (!acceptsDrop(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setStageDragging(true);
      }}
      onDragOver={(event) => {
        if (!acceptsDrop(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!stageDragging && !acceptsDrop(event)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setStageDragging(false);
      }}
      onDrop={(event) => {
        if (!acceptsDrop(event)) return;
        event.preventDefault();
        dragDepth.current = 0;
        setStageDragging(false);
        onMaterialDrop(event);
      }}
    >
      {editorAvailable || !item ? (
        <div className="h-full">{editorStage}</div>
      ) : (
        <div className="h-full overflow-auto bg-[var(--card,#fff)]">
          <LibraryItemViewer item={item} accent={accent} />
        </div>
      )}
      {(draggedTitle || stageDragging) && (
        <div
          className="absolute inset-3 z-[80] grid place-items-center rounded-2xl border-2 border-dashed bg-[var(--card,#fff)]/88 p-6 text-center shadow-2xl backdrop-blur-sm"
          style={{ borderColor: accent }}
          onDragEnter={(event) => event.preventDefault()}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dragDepth.current = 0;
            setStageDragging(false);
            onMaterialDrop(event);
          }}
        >
          <div>
            <span
              className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-[var(--awb-on-accent,#fff)] shadow-lg"
              style={{ background: accent }}
            >
              <AdvancedEditorIcon name="add" className="h-7 w-7" />
            </span>
            <p className="mt-4 text-[15px] font-semibold text-[var(--fg,#292524)]">
              {tt("拖到这里，添加到画布")}
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted,#78716c)]">
              {draggedTitle || tt("本地文件")}
            </p>
          </div>
        </div>
      )}
      {dropMessage && (
        <div
          role="status"
          className="absolute bottom-5 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-[var(--fg,#292524)] px-4 py-2 text-[11px] font-medium text-[var(--card,#fff)] shadow-xl"
        >
          {dropMessage}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 空框：手上还没有素材的时候，工作台长什么样
// ----------------------------------------------------------------------------
// 合同 §3.2。今天必须先有一件素材才有编辑器——用户想「打开一个空白编辑框，把文件
// 拖进去就开始编」是做不到的。这一段就是那条路：一句提示 + 上传按钮 + 与上面同一
// 套拖拽，第一个落进来的文件按判型表决定去哪条路由，落成真素材之后编辑器才挂。
// ============================================================================

const UPLOAD_TARGET_LABELS: Record<UploadEditorTarget, string> = {
  richdoc: "文档",
  grid: "表格",
  deck: "演示",
  pdf: "PDF",
  image: "图片",
  "video-timeline": "视频",
  audio: "音频",
  threed: "3D 模型",
};

function supportedFormatsText(): string {
  return uploadSupportedExtensionsByTarget()
    .map(
      (entry) =>
        `${UPLOAD_TARGET_LABELS[entry.target]}（${entry.extensions
          .map((extension) => extension.toUpperCase())
          .join("/")}）`,
    )
    .join("；");
}

/**
 * 一个本地文件 → 一件真素材。
 *
 * 走的是既有那条链，一行入库逻辑都不新写：`uploadFile()` 落字节，网关给得出
 * canonical artifact 就直接用，给不出就按既有 transient receipt 走 `ensureArtifact()`。
 * 那两个 helper 住在 `MyLibrary` 里，所以刻意**用到时才动态加载**——空框本身很轻，
 * 不该为了一个可能不会发生的上传把整份「我的库」拖进首屏。
 */
async function libraryItemFromLocalFile(
  file: File,
  siteId: string,
  transfer: {
    onProgress?: (loaded: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<{ ok: true; item: LibraryItem } | { ok: false; error: string }> {
  const uploaded = await uploadFile(file, {
    siteId: siteId || "home",
    title: file.name,
    // 幂等键刻意**不再自己拼**。原来那把 `workbench-blank-upload-v1:<site>:<名字>:
    // <大小>:<mtime>` 绑不住文件内容，而 `uploadFile` 推的那把绑了前 1MB 的哈希，
    // 也绑齐了服务端重放时要比对的每一项（bytes/site_id/mime/filename/is_upload，
    // 见 `media_proxy_router.py:946-957`）。少绑一项换来的不是「重传」而是 409。
    onProgress: transfer.onProgress,
    signal: transfer.signal,
  });
  if (!uploaded.ok || !uploaded.data?.file) {
    return {
      ok: false,
      error: uploaded.error || "文件上传失败，请重试。",
    };
  }
  const record = uploaded.data.file;
  const [{ canonicalUploadLibraryItem, legacyUploadTransient }, { ensureArtifact }] =
    await Promise.all([import("./MyLibrary"), import("./artifact-client")]);
  if (
    record.artifact !== undefined ||
    record.artifact_id ||
    record.revision_id
  ) {
    const canonical = canonicalUploadLibraryItem(record);
    return canonical.ok
      ? { ok: true, item: canonical.item }
      : { ok: false, error: canonical.error };
  }
  const legacy = legacyUploadTransient(record, file, siteId);
  if (!legacy.ok) return { ok: false, error: legacy.error };
  const ensured = await ensureArtifact(legacy.transient);
  return ensured.ok && ensured.data
    ? { ok: true, item: ensured.data }
    : {
        ok: false,
        error: ensured.error || "文件已上传，但没能存成可编辑的素材。",
      };
}

/**
 * W9 的「把本地做好的项目整个搬上来」面板（`verdicts/W9-delivery.md` §5）。
 *
 * 懒加载：它自带上传、进度、过滤说明，而绝大多数人打开空框是来拖一个文件的，
 * 不该为那条少数路径先付一份体积。
 */
const ProjectImportPanel = dynamic(
  () => import("./project-import").then((module) => module.ProjectImportPanel),
  { ssr: false },
);

/**
 * 导入回来的项目转成一件素材，交给工作台按 `kind:"website"` 挂网站编辑器。
 *
 * 判定依据是 `workbench-routes.ts:570-592`：`kind === "website"` 且 `meta` 里有
 * `project_id` 就进网站编辑器；两者缺一它会判成「只有预览、没有可恢复的项目」。
 */
function libraryItemFromImportedProject(
  project: { project_id?: string; display_name?: string; slug?: string },
  siteId: string,
): LibraryItem | null {
  const projectId = String(project.project_id || "");
  if (!projectId) return null;
  return {
    key: `website:${projectId}`,
    source: "creation",
    id: projectId,
    title: project.display_name || project.slug || "导入的项目",
    kind: "website",
    siteId: siteId || "oceanleo",
    favorite: false,
    meta: {
      project_id: projectId,
      slug: project.slug,
      display_name: project.display_name,
    },
  };
}

export function AdvancedWorkbenchBlankStage({
  accent = "#6d5dfc",
  siteId = "",
  onItemReady,
  projectImportSlot,
}: {
  accent?: string;
  siteId?: string;
  /** 第一件素材落成之后，由工作台挂上对应编辑器。 */
  onItemReady: (item: LibraryItem) => void;
  /** W9 的「上传整个文件夹 / zip」入口；它还没落盘时这里是空的。 */
  projectImportSlot?: ReactNode;
}) {
  const tt = useUI();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [importingProject, setImportingProject] = useState(false);
  // ── W08 ───────────────────────────────────────────────────────────────────
  const [progress, setProgress] = useState<UploadProgressSnapshot | null>(null);
  /** 这一次真压缩了才有值；UI 靠它显示前后字节并给出「用原图」。 */
  const [compression, setCompression] = useState<CompressionOutcome | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /**
   * 「在传中」用 ref 而不是 `busy`：`busy` 是 state，闭包里读到的是上一轮的值，
   * 而「用原图重来」恰恰要在上一次刚收尾的同一个 tick 里再起一次。
   */
  const inFlightRef = useRef(false);
  /**
   * 用户点了「用原图」：记下原图并取消在飞的那一次，让它在自己的 finally 里
   * 把这一份接上去。直接递归调 `accept` 会撞上还没释放的在飞标记。
   */
  const retryWithOriginalRef = useRef<File | null>(null);
  const acceptRef = useRef<
    ((files: File[], preferOriginal?: boolean) => Promise<void>) | null
  >(null);

  const uploadOne = useCallback(
    async (file: File, preferOriginal: boolean) => {
      setError("");
      // 判型按**用户给的那个名字**来。压缩可能把 `.png` 写成 `.jpg`，
      // 但「用户拖进来的是什么、能不能编」与「我们怎么存」是两件事。
      const judged = uploadEditorTargetForFileName(file.name);
      if (!judged.target) {
        // 手机照片、FBX 模型这类「用户真会拖、但确实转不了」的，给一句能照做的话；
        // 其余的才落到那串通用清单上。
        const named = uploadUnavailableReason(judged.extension);
        setError(
          named
            ? tt(named)
            : judged.extension
              ? tt("这里还打不开 {ext} 文件。现在支持：{list}。", {
                  ext: judged.extension.toUpperCase(),
                  list: supportedFormatsText(),
                })
              : tt("这个文件没有扩展名，认不出是什么格式。现在支持：{list}。", {
                  list: supportedFormatsText(),
                }),
        );
        return;
      }
      // 压缩（P3）：默认开、只碰图片、永远留着原图。`compressImageFile` 对
      // 非图片是一次同步判断就返回，所以这里不必先筛一遍类型。
      let payload = file;
      if (!preferOriginal) {
        if (isImageFile(file) && file.size >= MIN_COMPRESS_BYTES) {
          setBusy(tt("正在压缩图片…"));
        }
        const outcome = await compressImageFile(file);
        payload = outcome.upload;
        setCompression(outcome.compressed ? outcome : null);
      } else {
        setCompression(null);
      }

      const note = judged.needsConversion
        ? uploadConversionNote(judged.target)
        : "";
      setBusy(
        judged.needsConversion
          ? `${tt("正在上传，稍后会转成能编辑的格式…")}${note ? tt(note) : ""}`
          : tt("正在上传…"),
      );
      const controller = new AbortController();
      abortRef.current = controller;
      // 进度从总线上取而不是从 `onProgress` 回调：总线送的是算好的整份读数
      // （含已用时与剩余估算），回调只有 loaded/total，在组件里再算一遍 ETA
      // 等于把 `createProgressTracker` 抄第二份。
      const unsubscribe = subscribeUploadProgress(payload, setProgress);
      try {
        const result = await libraryItemFromLocalFile(payload, siteId, {
          signal: controller.signal,
        });
        // 这一次是被「用原图」按钮自己取消的，不是失败，不要报错。
        if (retryWithOriginalRef.current) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onItemReady(result.item);
      } finally {
        unsubscribe();
      }
    },
    [onItemReady, siteId, tt],
  );

  const accept = useCallback(
    async (files: File[], preferOriginal = false) => {
      const file = files[0];
      if (!file || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await uploadOne(file, preferOriginal);
      } finally {
        inFlightRef.current = false;
        abortRef.current = null;
        setBusy("");
        setProgress(null);
        const original = retryWithOriginalRef.current;
        retryWithOriginalRef.current = null;
        if (original) {
          setCompression(null);
          void acceptRef.current?.([original], true);
        }
      }
    },
    [uploadOne],
  );
  acceptRef.current = accept;

  /** 「用原图」：取消在飞的那一次，让 `accept` 的 finally 用原图再起一次。 */
  const useOriginalInstead = useCallback(() => {
    const outcome = compression;
    if (!outcome) return;
    retryWithOriginalRef.current = outcome.original;
    abortRef.current?.abort();
  }, [compression]);

  // 粘贴上传（P4）。空框本身不可聚焦——用户截完图直接按 Ctrl+V 时事件落在
  // document 上，所以挂在 window，只在这一屏活着的时候有效。
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (inFlightRef.current) return;
      const target = event.target as HTMLElement | null;
      // 焦点在能输入的地方就让给它：用户是在打字，不是在传文件。
      if (
        target &&
        (target.isContentEditable ||
          /^(?:INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ""))
      ) {
        return;
      }
      // 没有文件就一个字都不拦，粘贴文字必须照常。
      if (!transferHasFiles(event.clipboardData)) return;
      const files = filesFromPaste(event.clipboardData);
      if (!files.length) return;
      event.preventDefault();
      void acceptRef.current?.(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div
      data-workbench-blank-stage
      className="grid h-full min-h-0 w-full place-items-center overflow-auto bg-[var(--advanced-stage-bg,#f4f1e8)] p-6"
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types || []).includes("Files")) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        // 拖拽与粘贴共用 `upload/intake.ts` 这一条提取器（P4），不是两套。
        const files = filesFromTransfer(event.dataTransfer);
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        void accept(files);
      }}
    >
      <div className="w-full max-w-md rounded-2xl border-2 border-dashed bg-[var(--card,#fff)]/85 p-8 text-center shadow-sm"
        style={{ borderColor: accent }}
      >
        <span
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-[var(--awb-on-accent,#fff)] shadow-lg"
          style={{ background: accent }}
        >
          <AdvancedEditorIcon name="add" className="h-7 w-7" />
        </span>
        <p className="mt-4 text-[15px] font-semibold text-[var(--fg,#292524)]">
          {tt("把文件拖进来，或点上传")}
        </p>
        <p className="mt-1 text-[12px] text-[var(--muted,#78716c)]">
          {tt("文档、表格、演示、PDF、图片、视频、音频都可以，落进来就能开始编。")}
        </p>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => inputRef.current?.click()}
          className="mt-5 inline-flex h-9 items-center rounded-full px-5 text-[13px] font-semibold text-[var(--awb-on-accent,#fff)] shadow transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] disabled:opacity-60"
          style={{ background: accent }}
        >
          {busy ? tt("上传中…") : tt("上传文件")}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            void accept(files);
          }}
        />
        {/* 「或者，把本地做好的整个项目搬上来」——W9 的导入面板（合同 §4 W9 一行）。
            调用方自己塞了 `projectImportSlot` 就用它的，否则挂 W9 那一份。
            默认收起：来空框的人绝大多数是拖一个文件的，这条是少数路径。 */}
        {projectImportSlot ? (
          <div className="mt-4">{projectImportSlot}</div>
        ) : importingProject ? (
          <div className="mt-4 text-left">
            <ProjectImportPanel
              onCancel={() => setImportingProject(false)}
              onImported={(project) => {
                const item = libraryItemFromImportedProject(project, siteId);
                if (!item) {
                  setError(
                    tt("项目已经搬上来了，但没拿到它的编号，打不开编辑器。刷新一下再看。"),
                  );
                  setImportingProject(false);
                  return;
                }
                onItemReady(item);
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => {
              setError("");
              setImportingProject(true);
            }}
            className="mt-3 text-[12px] font-medium underline underline-offset-4 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] disabled:opacity-60"
            style={{ color: accent }}
          >
            {tt("或者，把本地做好的整个项目（文件夹 / zip）搬上来")}
          </button>
        )}
        {busy && (
          <div role="status" data-upload-status className="mt-4 text-left">
            <p className="text-[12px] text-[var(--muted,#78716c)]">{busy}</p>
            {progress && (
              <div data-upload-progress className="mt-2">
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--awb-track,#e7e5e4)]"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent(progress)}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${progressPercent(progress)}%`,
                      background: accent,
                      transitionProperty: "width",
                      // 动效 token 不写 fallback（裁定 A-2）：W01 把它们生成进
                      // CSS 之前这里解析失败即 0s，不会退化成一个裸时长。
                      transitionDuration: "var(--leo-dur-2)",
                      transitionTimingFunction: "var(--leo-ease-standard)",
                    }}
                  />
                </div>
                <p className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[11px] tabular-nums text-[var(--muted,#78716c)]">
                  <span>
                    {progressPercent(progress)}% ·{" "}
                    {formatBytes(progress.loaded)} /{" "}
                    {formatBytes(progress.total)}
                  </span>
                  {/* 纯百分比在大文件上体感很差（P1）。剩余估不出来时**不显示**，
                      假的剩余时间比没有更糟。 */}
                  <span>
                    {tt("已用 {elapsed}", {
                      elapsed: formatDuration(progress.elapsedMs),
                    })}
                    {progress.remainingMs !== null
                      ? ` · ${tt("剩余约 {remaining}", {
                          remaining: formatDuration(progress.remainingMs),
                        })}`
                      : ""}
                  </span>
                </p>
              </div>
            )}
            {compression && (
              <p
                data-upload-compression
                className="mt-1.5 text-[11px] text-[var(--muted,#78716c)]"
              >
                {tt("已压缩：{before} → {after}", {
                  before: formatBytes(compression.originalBytes),
                  after: formatBytes(compression.uploadBytes),
                })}{" "}
                <button
                  type="button"
                  onClick={useOriginalInstead}
                  className="font-medium underline underline-offset-2"
                  style={{ color: accent }}
                >
                  {tt("用原图")}
                </button>
              </p>
            )}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-[var(--danger-bg,#fef2f2)] px-3 py-2 text-left text-[12px] leading-5 text-[var(--danger,#b91c1c)]"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
