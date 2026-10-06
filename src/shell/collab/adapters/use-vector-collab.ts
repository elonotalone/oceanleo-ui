"use client";

/**
 * 矢量图的「一次一个人」（work-chat W13）。
 *
 * 矢量图的编辑面是嵌入式画布（iframe，`EmbeddedRoute` 的 `vector_image`），协议里没有、也不能新增
 * 「把别人的改动套进来」的动词，所以不做实体级同改：
 *   - 打开作品开房间；进入编辑就 `acquireLock()`，拿到的人编辑，别人只读；
 *   - 只读的人看到提示，画布盖一层透明遮罩（点不进 iframe）；
 *   - 编辑者每次保存，房间里的其他人收到 `onExternalRevision`，这里读出那个版本，调用方据此换上新版本刷新画面；
 *   - 但本地有没保存的改动时（`localDirty`）不换：换上就会重新挂载画布，把没保存的改动冲掉。这时只记下
 *     `pendingRevision`，由调用方画提示条，让用户选「保存我的」（照常保存，形成新版本，新版本自然盖过它）
 *     或「看新版本」（`acceptPendingRevision`：放弃本地改动，重新载入）；没有本地改动时照旧自动刷新；
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
  /** 本地有没保存的改动时收到的外部新版本（暂存，未换上）；没有时为 null。 */
  pendingRevision: LibraryItem | null;
  /** 「看新版本」：放弃本地改动，换上暂存的新版本（让画布重新挂载）。没有暂存时什么也不做。 */
  acceptPendingRevision(): boolean;
  /** 我自己保存成功了：我的版本比暂存的新，丢掉暂存。 */
  dropPendingRevision(): void;
  /** 存成功后告诉房间这一版已落库。 */
  markSaved(revisionId: string): void;
}

export function useVectorCollab(opts: {
  /** 只有 vector_image 为 true；别的嵌入画布（网站、流程图）传 false，什么都不开。 */
  enabled: boolean;
  item: { artifactId?: string; title?: string };
  /** 画布里有没保存的本地改动。缺省 false（照旧：新版本到了就换）。 */
  localDirty?: boolean;
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
  const [pending, setPending] = useState<{ item: LibraryItem; revisionId: string } | null>(null);
  const acquiringRef = useRef(false);
  const dirtyRef = useRef(Boolean(opts.localDirty));
  dirtyRef.current = Boolean(opts.localDirty);

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
          if (decideExternalRevision({ localDirty: dirtyRef.current }) === "hold") {
            // 最新的外部版本覆盖更早暂存的那个；room.markSaved 等用户选了再调
            setPending({ item: data, revisionId });
            return;
          }
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

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const acceptPendingRevision = useCallback((): boolean => {
    const held = pendingRef.current;
    if (!held) return false;
    setPending(null);
    setRevisionItem(held.item);
    setRevisionNonce((value) => value + 1);
    if (room && held.revisionId) room.markSaved(held.revisionId);
    return true;
  }, [room]);
  const dropPendingRevision = useCallback(() => {
    setPending(null);
  }, []);

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
    pendingRevision: pending?.item ?? null,
    acceptPendingRevision,
    dropPendingRevision,
    markSaved,
  };
}

/**
 * 外部新版本到了：本地有没保存的改动就「hold」（暂存、出提示条，不重新挂载画布），否则「apply」（自动刷新）。
 * 单独导出成纯函数，测试直接断言这条规则。
 */
export function decideExternalRevision(state: { localDirty: boolean }): "apply" | "hold" {
  return state.localDirty ? "hold" : "apply";
}
