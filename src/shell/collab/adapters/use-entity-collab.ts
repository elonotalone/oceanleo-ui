"use client";

/**
 * 实体型编辑器接协同的共用胶水（视频 / 3D / 音频 / 游戏页表）。
 *
 * 每个编辑器只需交出：本地状态（`local`，没载入完是 null）、把远端状态应用进编辑器的函数（`applyRemote`）、
 * 适配器的 toEntities / fromEntities。本 hook 负责：开房间、种子、首次对齐、本地改动推送、远端改动回灌（不回环）、
 * 只读、保存闸、外部版本。
 *
 * 不在这里处理：选区与撤销栈的保留（编辑器各自在 `applyRemote` 里做）、`markSaved`（保存成功处调 `markSaved`）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImEditorKind } from "../../../lib/im/types";
import { useImEnabled } from "../../../lib/im/client";
import type { LibraryItem } from "../../library-data";
import {
  bindJsonState,
  useCollabReadOnly,
  useCollabRoom,
  useCollabRoomVersion,
  useCollabSaveGate,
  type CollabRoom,
  type EditorCollabBinding,
  type EntityShape,
  type JsonStateBinding,
} from "../index";

type Entities = Record<string, Record<string, unknown>>;

export interface UseEntityCollabOptions<T> {
  item: { artifactId?: string; title?: string };
  editorKind: ImEditorKind;
  rootName: string;
  toEntities(state: T): EntityShape;
  fromEntities(
    input: { order: string[]; entities: Entities; meta: Record<string, unknown> },
    prev: T | null,
  ): T;
  /** 本地当前状态；源没载入完（或本来就没有可协同的状态）时为 null，此时什么都不推、不种。 */
  local: T | null;
  /** 把远端状态应用进编辑器。要自己保住本地选中与播放头；不要因此把「已保存」标成未保存之外的状态。 */
  applyRemote(state: T): void;
  /** 取某个外部版本的状态（AI 或别人另存的新版）；null = 取不到。 */
  loadRevision?: (revisionId: string) => Promise<T | null>;
}

export interface EntityCollab {
  room: CollabRoom | null;
  readOnly: boolean;
  /** 自动保存闸：false 时本端不自动保存（由房间里的存档人保存）。 */
  saveGate: boolean;
  collab: EditorCollabBinding | undefined;
  /** 保存成功后调用，告诉房间这一版已落库。 */
  markSaved(revisionId: string): void;
  /** 对方正在编辑、你只能看时的名字；没有则为 null。 */
  lockHolderName: string | null;
}

function stableKey(shape: EntityShape): string {
  return JSON.stringify([shape.order, shape.entities, shape.meta ?? {}]);
}

export function useEntityCollab<T>(opts: UseEntityCollabOptions<T>): EntityCollab {
  const { item, editorKind, rootName, local } = opts;
  const imOn = useImEnabled();
  const artifactId = String(item.artifactId || "");
  const room = useCollabRoom({
    resource: artifactId ? { kind: "artifact", id: artifactId } : null,
    editorKind,
    enabled: imOn,
  });
  const readOnly = useCollabReadOnly(room);
  const saveGate = useCollabSaveGate(room);
  useCollabRoomVersion(room);

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const localRef = useRef(local);
  localRef.current = local;

  const [binding, setBinding] = useState<JsonStateBinding<T> | null>(null);
  const aligned = useRef(false);
  const lastKey = useRef("");

  // 开绑定（房间换了就重来）。
  useEffect(() => {
    aligned.current = false;
    lastKey.current = "";
    if (!room) {
      setBinding(null);
      return undefined;
    }
    const next = bindJsonState<T>({
      room,
      rootName,
      toEntities: (state) => optsRef.current.toEntities(state),
      fromEntities: (input, prev) => optsRef.current.fromEntities(input, prev),
    });
    setBinding(next);
    const off = next.onRemote((state) => {
      lastKey.current = stableKey(optsRef.current.toEntities(state));
      optsRef.current.applyRemote(state);
    });
    return () => {
      off();
      next.destroy();
      setBinding(null);
    };
  }, [room, rootName]);

  // 首次对齐：我是第一个 → 种；否则等 synced 后取房间里的状态应用到编辑器。
  const synced = room?.status === "synced";
  const needsSeed = Boolean(room?.needsSeed);
  useEffect(() => {
    if (!room || !binding || !synced || aligned.current) return;
    const current = localRef.current;
    // 等本端自己的源载入完再对齐：先应用远端、之后载入完成又把旧版盖回来，会把旧版推给所有人。
    if (current === null) return;
    if (needsSeed) {
      binding.seed(current);
      lastKey.current = stableKey(optsRef.current.toEntities(current));
      aligned.current = true;
      return;
    }
    const remote = binding.read();
    if (remote === null) return; // 另一端正在种，等它
    aligned.current = true;
    const key = stableKey(optsRef.current.toEntities(remote));
    if (stableKey(optsRef.current.toEntities(current)) === key) {
      lastKey.current = key;
      return;
    }
    lastKey.current = key;
    optsRef.current.applyRemote(remote);
  }, [room, binding, synced, needsSeed, local]);

  // 本地改动 → 推送。
  useEffect(() => {
    if (!room || !binding || !aligned.current || readOnly || local === null) return;
    const key = stableKey(optsRef.current.toEntities(local));
    if (key === lastKey.current) return;
    lastKey.current = key;
    binding.push(local);
  }, [room, binding, readOnly, local, synced]);

  // 外部版本：取来、应用、推进文档、标记已保存。
  useEffect(() => {
    if (!room || !binding) return undefined;
    return room.onExternalRevision((revisionId) => {
      const load = optsRef.current.loadRevision;
      if (!load) return;
      void load(revisionId)
        .then((state) => {
          if (!state) return;
          lastKey.current = stableKey(optsRef.current.toEntities(state));
          optsRef.current.applyRemote(state);
          binding.push(state);
          room.markSaved(revisionId);
        })
        .catch(() => undefined);
    });
  }, [room, binding]);

  const collab = useMemo<EditorCollabBinding | undefined>(
    () =>
      artifactId
        ? { room, artifact: { id: artifactId, title: item.title || "", editorKind } }
        : undefined,
    [artifactId, editorKind, item.title, room],
  );
  const markSaved = useCallback(
    (revisionId: string) => {
      if (room && revisionId) room.markSaved(revisionId);
    },
    [room],
  );
  return {
    room,
    readOnly,
    saveGate,
    collab,
    markSaved,
    lockHolderName: room?.lock?.holder?.name ?? null,
  };
}

/**
 * 取某个版本的工程 JSON：先问库拿这个版本的条目，再按编辑器给的规则挑 JSON 地址去读。
 * 取不到返回 null，不抛。
 */
export async function fetchRevisionJson(
  artifactId: string,
  revisionId: string,
  pickUrl: (item: LibraryItem) => string,
): Promise<unknown | null> {
  try {
    const { getArtifactItem } = await import("../../artifact-client");
    const result = await getArtifactItem(artifactId, revisionId);
    const data = (result as { ok?: boolean; data?: unknown }).data;
    if (!data) return null;
    const url = pickUrl(data as LibraryItem);
    if (!url) return null;
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ 一次一人

export interface UseLockedEditCollabOptions {
  item: { artifactId?: string; title?: string } | null | undefined;
  editorKind: ImEditorKind;
  /** 别人保存了新版：拿到这一版的条目，编辑器据此刷新（只读时画面自动更新）。 */
  onExternalItem(item: LibraryItem): void;
}

export interface LockedEditCollab {
  room: CollabRoom | null;
  /** 别人持有编辑锁（或你是只读成员）：普通编辑面要变只读。 */
  readOnly: boolean;
  /** 本端是否该保存：没读写冲突的前提下，持锁人或房间存档人才存。 */
  mayWrite: boolean;
  collab: EditorCollabBinding | undefined;
  markSaved(revisionId: string): void;
  lockHolderName: string | null;
}

/**
 * 画布 / 字节写入没有「按实体写入」入口的编辑器（PDF、流程图）：一次只有一个人能改。
 * 打开作品就申请编辑锁（锁被别人持有时本端只读），锁空了再申请；离开时释放。
 * 别人保存新版后，经 `onExternalItem` 让编辑器重新载入。
 */
export function useLockedEditCollab(opts: UseLockedEditCollabOptions): LockedEditCollab {
  const artifactId = String(opts.item?.artifactId || "");
  const imOn = useImEnabled();
  const room = useCollabRoom({
    resource: artifactId ? { kind: "artifact", id: artifactId } : null,
    editorKind: opts.editorKind,
    enabled: imOn,
  });
  const readOnly = useCollabReadOnly(room);
  const saveGate = useCollabSaveGate(room);
  useCollabRoomVersion(room);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const synced = room?.status === "synced";
  const holderId = room?.lock?.holder?.id ?? "";
  const holdsLock = Boolean(room && holderId && holderId === room.self.id);

  // 锁是空的就申请（打开时、别人离开后）。
  useEffect(() => {
    if (!room || !synced || room.role === "viewer" || holderId) return;
    void room.acquireLock().catch(() => undefined);
  }, [room, synced, holderId]);
  // 只在离开 / 换房间时释放。
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
        ? { room, artifact: { id: artifactId, title: opts.item?.title || "", editorKind: opts.editorKind } }
        : undefined,
    [artifactId, opts.editorKind, opts.item?.title, room],
  );
  const markSaved = useCallback(
    (revisionId: string) => {
      if (room && revisionId) room.markSaved(revisionId);
    },
    [room],
  );
  return {
    room,
    readOnly,
    mayWrite: !readOnly && (holdsLock || saveGate),
    collab,
    markSaved,
    lockHolderName: readOnly ? room?.lock?.holder?.name ?? null : null,
  };
}
