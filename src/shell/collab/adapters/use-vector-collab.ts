"use client";

/**
 * 矢量图的「一次一个人」（work-chat W13）。
 *
 * 矢量图的编辑面是嵌入式画布（iframe，`EmbeddedRoute` 的 `vector_image`），协议里没有、也不能新增
 * 「把别人的改动套进来」的动词，所以不做实体级同改：
 *   - 打开作品开房间；进入编辑就 `acquireLock()`，拿到的人编辑，别人只读；
 *   - 只读的人看到提示，画布盖一层透明遮罩（点不进 iframe）；
 *   - 编辑者每次保存，房间里的其他人收到 `onExternalRevision`，这里读出那个版本，调用方据此换上新版本刷新画面；
 *   - 自动保存只在「持有编辑权」时跑（别人都是只读，不会有第二份未保存的改动）；存成功后 `markSaved`。
 *
 * 不在协同里（没开房间 / 离线 / 被拒）时一切照旧：`readOnly` 恒为 false，`canSave` 恒为 true。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useImEnabled } from "../../../lib/im/client";
import { getArtifactItem } from "../../artifact-client";
import type { LibraryItem } from "../../library-data";
import {
  useCollabRoom,
  useCollabRoomVersion,
  type CollabRoom,
  type EditorCollabBinding,
} from "../index";

export interface VectorCollab {
  room: CollabRoom | null;
  collab: EditorCollabBinding | undefined;
  /** 只读：浏览者，或别人持有编辑权，或还没抢到编辑权。 */
  readOnly: boolean;
  /** 别人持有编辑权时他的名字（浏览者、还在争取时为 null）。 */
  holderName: string | null;
  /** 房间已连上、我还在争取编辑权（尚无人持有）。 */
  waiting: boolean;
  /** 我是浏览者。 */
  viewer: boolean;
  /** 允许本端自动保存。 */
  canSave: boolean;
  /** 别人（编辑者）保存的最新版本；没有时为 null。换上它并让画布重新载入。 */
  revisionItem: LibraryItem | null;
  /** 每收到一次别人保存就 +1，用来让嵌入画布重新挂载。 */
  revisionNonce: number;
  /** 存成功后告诉房间这一版已落库。 */
  markSaved(revisionId: string): void;
}

export function useVectorCollab(opts: {
  /** 只有 vector_image 为 true；别的嵌入画布（网站、流程图）传 false，什么都不开。 */
  enabled: boolean;
  item: { artifactId?: string; title?: string };
}): VectorCollab {
  const imOn = useImEnabled();
  const artifactId = String(opts.item.artifactId || "");
  const active = opts.enabled && Boolean(artifactId);
  const room = useCollabRoom({
    resource: active ? { kind: "artifact", id: artifactId } : null,
    editorKind: "vector",
    enabled: imOn && active,
  });
  useCollabRoomVersion(room);
  const [acquired, setAcquired] = useState(false);
  const [revisionItem, setRevisionItem] = useState<LibraryItem | null>(null);
  const [revisionNonce, setRevisionNonce] = useState(0);
  const acquiringRef = useRef(false);

  const synced = room?.status === "synced";
  const viewer = room?.role === "viewer";
  const holderId = room?.lock?.holder.id ?? "";
  const selfId = room?.self.id ?? "";
  const heldByMe = Boolean(room?.lock) && holderId === selfId;
  const heldByOther = Boolean(room?.lock) && holderId !== selfId;

  // 进入编辑就争取编辑权；别人放手（锁空了）后再抢一次
  useEffect(() => {
    if (!room || !synced || viewer) {
      setAcquired(false);
      return;
    }
    if (heldByMe) {
      setAcquired(true);
      return;
    }
    if (heldByOther || acquiringRef.current) {
      setAcquired(false);
      return;
    }
    acquiringRef.current = true;
    void room
      .acquireLock()
      .then((ok) => setAcquired(Boolean(ok)))
      .catch(() => setAcquired(false))
      .finally(() => {
        acquiringRef.current = false;
      });
  }, [room, synced, viewer, heldByMe, heldByOther]);

  // 离开：放手编辑权
  useEffect(() => {
    if (!room) return undefined;
    return () => {
      try {
        room.releaseLock();
      } catch {
        /* 房间已销毁 */
      }
    };
  }, [room]);

  // 别人保存了新版本：读出来，换上
  useEffect(() => {
    if (!room || !artifactId) return undefined;
    return room.onExternalRevision((revisionId) => {
      void getArtifactItem(artifactId, revisionId)
        .then((result) => {
          const data = (result as { data?: LibraryItem }).data;
          if (!data) return;
          setRevisionItem(data);
          setRevisionNonce((value) => value + 1);
          room.markSaved(revisionId);
        })
        .catch(() => undefined);
    });
  }, [room, artifactId]);

  const markSaved = useCallback(
    (revisionId: string) => {
      if (room && revisionId) room.markSaved(revisionId);
    },
    [room],
  );

  const inRoom = Boolean(room) && synced;
  const readOnly = inRoom && !acquired;
  return {
    room,
    collab: artifactId && active
      ? { room, artifact: { id: artifactId, title: opts.item.title || "", editorKind: "vector" } }
      : undefined,
    readOnly,
    holderName: heldByOther ? room?.lock?.holder.name || null : null,
    waiting: inRoom && !viewer && !heldByOther && !acquired,
    viewer: Boolean(viewer),
    // 一次只有持有编辑权的人能改，所以由他自己保存（不等「房间存档人」——那个人可能根本没在编辑）
    canSave: !room || !synced || acquired,
    revisionItem,
    revisionNonce,
    markSaved,
  };
}
