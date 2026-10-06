"use client";

/**
 * PDF 多人同改的接线（work-chat 第二轮 F05，契约 §9.15）。
 *
 * 默认那套编辑器（旧核，`resolveEditorCore("pdf") === "legacy"`）做**按批注同改**：
 *   - 批注、表单字段、页的稳定 id 都在 PDF 字节里；对齐器（`media-editors/pdf-collab-sync.ts`）把本地字节与共享文档
 *     做三方合并，别人的批注静默并进本地字节（不动撤销栈）；谁保存，写出去的都是「本地字节 + 共享文档里的全部批注」。
 *   - 整页级改动（删页、调顺序、旋转、插页、合并、涂黑、签章、表单定稿）开始前拿房间的编辑锁，
 *     别人只读并看到「某某正在调整页面」；保存之后（工作台不再有未存改动）自动放锁。
 * 另一套（新核，flag 切到 `next`）还没有按批注写入的入口，保持原来的「整份上锁」：打开就拿锁，别人只读。
 *
 * 不新增 iframe / postMessage / 来源校验，只用房间已有的 `acquireLock` / `releaseLock` / `markSaved` / `onExternalRevision`。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useImEnabled } from "../../../lib/im/client";
import { useUI } from "../../../i18n/ui/useUI";
import type { LibraryItem } from "../../library-data";
import { ensurePdfCollabIds } from "../../media-editors/pdf-collab-bytes";
import { createPdfCollabSync, type PdfCollabSync } from "../../media-editors/pdf-collab-sync";
import type { PdfOfficeWorkbenchState } from "../../media-editors/pdf-form/types";
import type { PdfWorkbenchCollabHooks } from "../../media-editors/use-pdf-workbench";
import {
  useCollabReadOnly,
  useCollabRoom,
  useCollabRoomVersion,
  useCollabSaveGate,
  type CollabRoom,
  type EditorCollabBinding,
} from "../index";

export type PdfCollabMode = "annotations" | "whole";

export interface UsePdfCollabOptions {
  item: { artifactId?: string; title?: string } | null | undefined;
  /** `resolveEditorCore("pdf")`：旧核按批注同改，新核整份上锁。 */
  core: "legacy" | "next";
  /** 别人保存了新版本（页结构变了、AI 或专业模式存了新版）：拿到那一版的条目，编辑器据此重新载入。 */
  onExternalItem(item: LibraryItem): void;
}

export interface PdfCollab {
  mode: PdfCollabMode;
  room: CollabRoom | null;
  /** 只读：只有查看权限，或别人正在调整页面（整份上锁的那套里是别人持锁）。 */
  readOnly: boolean;
  /** 本端是否该保存。 */
  mayWrite: boolean;
  /** 别人持锁、你只能看时的名字。 */
  lockHolderName: string | null;
  /** 你是只有查看权限的成员。 */
  isViewer: boolean;
  collab: EditorCollabBinding | undefined;
  markSaved(revisionId: string): void;
  /** 交给 `usePdfWorkbench` 的第四个参数；不在协同里 / 整份上锁那套为 undefined。 */
  workbenchHooks: PdfWorkbenchCollabHooks | undefined;
  /** 最近一次被拦下的原因（拿不到整页锁等）；空串 = 没有。 */
  notice: string;
  /** 内部：交给 `usePdfCollabEditor`。 */
  internals: PdfCollabInternals;
}

interface PdfCollabInternals {
  syncRef: { current: PdfCollabSync | null };
  setNotice(text: string): void;
}

export function usePdfCollab(options: UsePdfCollabOptions): PdfCollab {
  const mode: PdfCollabMode = options.core === "next" ? "whole" : "annotations";
  const artifactId = String(options.item?.artifactId || "");
  const imOn = useImEnabled();
  const room = useCollabRoom({
    resource: artifactId ? { kind: "artifact", id: artifactId } : null,
    editorKind: "pdf",
    enabled: imOn,
  });
  const readOnly = useCollabReadOnly(room);
  const saveGate = useCollabSaveGate(room);
  useCollabRoomVersion(room);
  const optsRef = useRef(options);
  optsRef.current = options;
  const syncRef = useRef<PdfCollabSync | null>(null);
  const [notice, setNotice] = useState("");

  const synced = room?.status === "synced";
  const holderId = room?.lock?.holder?.id ?? "";
  const holdsLock = Boolean(room && holderId && holderId === room.self.id);

  // 整份上锁那套：打开就申请，锁空了再申请；离开时释放。
  useEffect(() => {
    if (mode !== "whole" || !room || !synced || room.role === "viewer" || holderId) return;
    void room.acquireLock().catch(() => undefined);
  }, [mode, room, synced, holderId]);
  useEffect(() => {
    if (!room) return undefined;
    return () => room.releaseLock();
  }, [room]);

  // 别人（页结构的持锁人、AI、专业模式）保存了新版本 → 拿来重新载入。
  useEffect(() => {
    if (!room || !artifactId) return undefined;
    return room.onExternalRevision((revisionId) => {
      void import("../../artifact-client")
        .then(({ getArtifactItem }) => getArtifactItem(artifactId, revisionId))
        .then((result) => {
          const data = (result as { data?: unknown }).data;
          if (!data) return;
          optsRef.current.onExternalItem(data as LibraryItem);
          room.markSaved(revisionId);
        })
        .catch(() => undefined);
    });
  }, [room, artifactId]);

  const collab = useMemo<EditorCollabBinding | undefined>(
    () =>
      artifactId
        ? { room, artifact: { id: artifactId, title: options.item?.title || "", editorKind: "pdf" } }
        : undefined,
    [artifactId, options.item?.title, room],
  );
  const markSaved = useCallback(
    (revisionId: string) => {
      if (room && revisionId) room.markSaved(revisionId);
    },
    [room],
  );

  const workbenchHooks = useMemo<PdfWorkbenchCollabHooks | undefined>(() => {
    if (mode !== "annotations" || !room) return undefined;
    return {
      prepareLoaded: async (bytes, previous) => {
        const ensured = (await ensurePdfCollabIds(bytes)).bytes;
        const sync = syncRef.current;
        if (!sync) return ensured;
        if (!previous) {
          await sync.setBaseline(ensured);
          return ensured;
        }
        // 重新载入（别人保存了新页结构）：批注以当前为准，页结构采纳新字节。
        return sync.adjustRestored(ensured, previous, { keepEverything: true });
      },
      adjustRestored: (restored, current) =>
        syncRef.current ? syncRef.current.adjustRestored(restored, current) : Promise.resolve(restored),
      beforeSave: async () => {
        await syncRef.current?.flush();
      },
      saveKeySalt: room.self.id,
    };
  }, [mode, room]);

  const internals = useMemo<PdfCollabInternals>(() => ({ syncRef, setNotice }), []);

  return {
    mode,
    room,
    readOnly,
    mayWrite: !readOnly && (holdsLock || saveGate),
    lockHolderName: readOnly ? room?.lock?.holder?.name ?? null : null,
    isViewer: room?.role === "viewer",
    collab,
    markSaved,
    workbenchHooks,
    notice,
    internals,
  };
}

type Editor = PdfOfficeWorkbenchState;

/**
 * 把协同接到已经建好的工作台上：开对齐器、整页级动作先拿锁、只读时把改动入口关掉、保存后放锁。
 * 返回要交给舞台 / 工具栏的那个 editor（不在协同里时就是原来的同一个对象）。
 */
export function usePdfCollabEditor(collab: PdfCollab, editor: Editor): Editor {
  const tt = useUI();
  const { room, mode, readOnly } = collab;
  const { syncRef, setNotice } = collab.internals;
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const synced = room?.status === "synced";
  const holderId = room?.lock?.holder?.id ?? "";
  const holdsLock = Boolean(room && holderId && holderId === room.self.id);
  const holdsRef = useRef(holdsLock);
  holdsRef.current = holdsLock;
  const readyRef = useRef(false);

  // 对齐器：房间 / 模式换了就重建。
  useEffect(() => {
    readyRef.current = false;
    if (mode !== "annotations" || !room) {
      syncRef.current = null;
      return undefined;
    }
    const sync = createPdfCollabSync({
      room,
      host: {
        getBytes: () => editorRef.current.currentBytes(),
        replaceBytes: async (transform) => {
          const replace = editorRef.current.replaceBytesSilently;
          return replace ? replace(transform) : "busy";
        },
      },
      holdsPages: () => holdsRef.current,
      includeFields: true,
    });
    syncRef.current = sync;
    return () => {
      sync.dispose();
      if (syncRef.current === sync) syncRef.current = null;
    };
  }, [mode, room, syncRef]);

  // 字节有了：补页 id、记基线、对齐；之后每次字节变化 / 房间状态变化 / 锁变化再对齐一次。
  const documentVersion = editor.documentVersion ?? 0;
  const lockKey = `${holderId}:${room?.role ?? ""}`;
  useEffect(() => {
    const sync = syncRef.current;
    if (!sync || !room) return;
    let cancelled = false;
    void (async () => {
      const current = editorRef.current;
      const bytes = current.currentBytes();
      if (!bytes) return;
      if (!readyRef.current) {
        const replace = current.replaceBytesSilently;
        if (replace) {
          const outcome = await replace(async (bytes0) => {
            const ensured = await ensurePdfCollabIds(bytes0);
            return ensured.changed ? ensured.bytes : null;
          }, { markDirty: false });
          if (outcome === "busy" || cancelled) return;
        }
        const after = editorRef.current.currentBytes();
        if (after) await sync.setBaseline(after);
        readyRef.current = true;
      }
      if (!cancelled) await sync.reconcile();
    })();
    return () => {
      cancelled = true;
    };
  }, [room, synced, documentVersion, lockKey, syncRef]);

  // 整页级动作先拿锁。拿不到（别人在调整页面 / 只有查看权限）→ 不做，说明原因。
  const ensurePageLock = useCallback(async (): Promise<boolean> => {
    if (!room) return true;
    if (mode === "whole") return !readOnly;
    if (room.role === "viewer") {
      setNotice(tt("你只有查看权限，只能看、翻页和复制文字。"));
      return false;
    }
    if (room.status !== "synced" && room.status !== "syncing") return true; // 没连上协同：按单人处理
    if (holdsRef.current) return true;
    const acquired = await room.acquireLock().catch(() => false);
    if (acquired) {
      setNotice("");
      return true;
    }
    const holder = room.lock && room.lock.holder.id !== room.self.id ? room.lock.holder.name : "";
    setNotice(
      holder
        ? tt("「{name}」正在调整页面，你现在只能看；他保存后这里会自动更新。", { name: holder })
        : tt("现在拿不到调整页面的权限，请稍后再试。"),
    );
    return false;
  }, [mode, readOnly, room, setNotice, tt]);

  // 保存之后（没有未存改动了）放锁：先把页结构对齐给大家再放。
  useEffect(() => {
    if (mode !== "annotations" || !room || !holdsLock) return undefined;
    if (editor.dirty || editor.processing || editor.saving) return undefined;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          await syncRef.current?.flush();
        } finally {
          room.releaseLock();
        }
      })();
    }, 1500);
    return () => clearTimeout(timer);
  }, [mode, room, holdsLock, editor.dirty, editor.processing, editor.saving, syncRef]);

  return useMemo<Editor>(() => {
    if (!room) return editor;
    const noop = async () => undefined;
    const page =
      <A extends unknown[]>(run: (...args: A) => Promise<void>) =>
      async (...args: A): Promise<void> => {
        if (readOnly) return;
        if (!(await ensurePageLock())) return;
        await run(...args);
      };
    const frozen = readOnly
      ? ({
          collabReadOnly: true,
          annotationTool: "select",
          canUndo: false,
          canRedo: false,
          undo: () => undefined,
          redo: () => undefined,
          setAnnotationTool: () => undefined,
          addTextAnnotation: noop,
          addTextAnnotationAt: noop,
          addHighlightAnnotation: noop,
          moveAnnotation: noop,
          updateSelectedAnnotation: noop,
          deleteSelectedAnnotation: noop,
          applyFormFill: noop,
          setFormValue: () => undefined,
          setFormFlatten: () => undefined,
          setOfficeTool: () => undefined,
          placeSignatureAt: noop,
          applyCrossPageSeal: noop,
          applyRedactions: noop,
          addRedactionMark: () => undefined,
        } satisfies Partial<Editor>)
      : { collabReadOnly: false };
    const pageLevel =
      mode === "annotations"
        ? ({
            rotateCurrentPage: page(editor.rotateCurrentPage),
            movePage: page(editor.movePage),
            moveCurrentPage: page(editor.moveCurrentPage),
            deleteCurrentPage: page(editor.deleteCurrentPage),
            addBlankPage: page(editor.addBlankPage),
            mergePdf: page(editor.mergePdf),
            applyRedactions: page(editor.applyRedactions),
            placeSignatureAt: page(editor.placeSignatureAt),
            applyCrossPageSeal: page(editor.applyCrossPageSeal),
            // 定稿（扁平化）会让表单字段消失，是整页级；普通填写按字段同改。
            applyFormFill: async () => {
              if (readOnly) return;
              if (editor.formFlatten && !(await ensurePageLock())) return;
              await editor.applyFormFill();
            },
          } satisfies Partial<Editor>)
        : {};
    return { ...editor, ...pageLevel, ...frozen };
  }, [editor, ensurePageLock, mode, readOnly, room]);
}
