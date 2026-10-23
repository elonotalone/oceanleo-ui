"use client";

/**
 * PDF 多人同改的接线（work-chat F05，契约 §9.15）。
 *
 * 2026-10-23 起 PDF 只有一个 EmbedPDF 查看器实例（基础 / 专业同一个）。它没有
 * 「按批注 id 写入别人的一条批注」的入口，所以沿用整份上锁：打开就申请房间的编辑锁，
 * 拿到锁的人改，别人只读并看到「某某正在编辑」；别人保存出新版本时这里重新载入。
 * 按批注三方合并依赖旧的自绘内核替换字节，随旧内核一起删除。
 *
 * 不新增 iframe / postMessage / 来源校验，只用房间已有的 `acquireLock` / `releaseLock`
 * / `markSaved` / `onExternalRevision`。
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useImEnabled } from "../../../lib/im/client";
import type { LibraryItem } from "../../library-data";
import {
  useCollabReadOnly,
  useCollabRoom,
  useCollabRoomVersion,
  useCollabSaveGate,
  type CollabRoom,
  type EditorCollabBinding,
} from "../index";

export type PdfCollabMode = "whole";

export interface UsePdfCollabOptions {
  item: { artifactId?: string; title?: string } | null | undefined;
  /** 别人保存了新版本：拿到那一版的条目，编辑器据此重新载入。 */
  onExternalItem(item: LibraryItem): void;
}

export interface PdfCollab {
  mode: PdfCollabMode;
  room: CollabRoom | null;
  /** 只读：只有查看权限，或别人持锁。 */
  readOnly: boolean;
  /** 本端是否该保存。 */
  mayWrite: boolean;
  lockHolderName: string | null;
  isViewer: boolean;
  collab: EditorCollabBinding | undefined;
  markSaved(revisionId: string): void;
}

export function usePdfCollab(options: UsePdfCollabOptions): PdfCollab {
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

  const synced = room?.status === "synced";
  const holderId = room?.lock?.holder?.id ?? "";
  const holdsLock = Boolean(room && holderId && holderId === room.self.id);

  // 打开就申请，锁空了再申请；离开时释放。
  useEffect(() => {
    if (!room || !synced || room.role === "viewer" || holderId) return;
    void room.acquireLock().catch(() => undefined);
  }, [room, synced, holderId]);
  useEffect(() => {
    if (!room) return undefined;
    return () => room.releaseLock();
  }, [room]);

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

  return {
    mode: "whole",
    room,
    readOnly,
    mayWrite: !readOnly && (holdsLock || saveGate),
    lockHolderName: readOnly ? room?.lock?.holder?.name ?? null : null,
    isViewer: room?.role === "viewer",
    collab,
    markSaved,
  };
}
