"use client";

import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { uploadFile } from "../lib/database";
import type { LibraryItem } from "./library-data";
import { LibraryItemViewer } from "./library-viewers";
import { WORKBENCH_MATERIAL_MIME } from "./workbench-material-provider";
import {
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
              className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-white shadow-lg"
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
): Promise<{ ok: true; item: LibraryItem } | { ok: false; error: string }> {
  const uploaded = await uploadFile(file, {
    siteId: siteId || "home",
    title: file.name,
    idempotencyKey: [
      "workbench-blank-upload-v1",
      siteId || "home",
      file.name,
      file.size,
      file.lastModified,
    ].join(":"),
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

  const accept = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file || busy) return;
      setError("");
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
      setBusy(
        judged.needsConversion
          ? tt("正在上传，稍后会转成能编辑的格式…")
          : tt("正在上传…"),
      );
      try {
        const result = await libraryItemFromLocalFile(file, siteId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onItemReady(result.item);
      } finally {
        setBusy("");
      }
    },
    [busy, onItemReady, siteId, tt],
  );

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
        const files = Array.from(event.dataTransfer.files || []);
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
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-white shadow-lg"
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
          className="mt-5 inline-flex h-9 items-center rounded-full px-5 text-[13px] font-semibold text-white shadow transition disabled:opacity-60"
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
        {/* W9 的「上传整个文件夹 / zip」入口挂这里（合同 §4 W9 一行）。
            它的 verdicts/W9-delivery.md §5 还没落盘时这里就是空的。 */}
        {projectImportSlot ? (
          <div className="mt-4">{projectImportSlot}</div>
        ) : null}
        {busy && (
          <p
            role="status"
            className="mt-4 text-[12px] text-[var(--muted,#78716c)]"
          >
            {busy}
          </p>
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
