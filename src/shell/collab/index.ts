/**
 * 多人同改公共层（work-chat 契约 §8.4，W11）。
 *
 * 编辑器 owner（W12–W14）只从这里 import。用法：
 *
 *   const room = useCollabRoom({ resource: artifactId ? { kind: "artifact", id: artifactId } : null,
 *                                editorKind: "richdoc", enabled: imEnabledHere() });
 *   // 1) 交给动作栏：adapter.collab = { room, artifact: { id, title, editorKind } }
 *   // 2) 实体型编辑器：const bind = bindJsonState({ room, rootName: "oceanleo:grid", toEntities, fromEntities });
 *   //    room.needsSeed ? bind.seed(state) : 等 room.status === "synced" 后 bind.onRemote(setState)
 *   //    本地每次改动：bind.push(state)
 *   // 3) 只读：const readOnly = useCollabReadOnly(room);   // viewer 或专业模式锁在别人手里
 *   // 4) 保存：if (!useCollabSaveGate(room)) 不存版本（只有房间里的保存者存）；
 *   //    存成功后：room.markSaved(revisionId)
 *   // 5) 别人（AI / 专业模式）存了新版本：room.onExternalRevision((revisionId, origin) => 重新加载该版本)
 *
 * 当前实现状态见 P/signals/W11-api-ready.md。
 */
import type { ImEditorKind } from "../../lib/im/types";
import type { Doc } from "yjs";
import type { Awareness } from "y-protocols/awareness";

export type CollabRole = "editor" | "viewer";
export type CollabStatus = "connecting" | "syncing" | "synced" | "offline" | "denied" | "disabled";
export interface CollabUser { id: string; name: string; color: string; avatar_url: string | null }
export interface CollabLock { holder: CollabUser; mode: "pro"; expires_at: string }

export interface CollabRoom {
  roomKey: string;
  doc: Doc;
  awareness: Awareness;
  role: CollabRole;
  status: CollabStatus;
  self: CollabUser;
  needsSeed: boolean;
  isSaver: boolean;
  lock: CollabLock | null;
  /** 此刻在房间里的其他人（按用户去重，不含自己）。 */
  peers: CollabUser[];
  /** 种完发 seed.done；roots = 本次写入的根名（如 ["oceanleo:grid"]）。 */
  completeSeed(roots: string[]): void;
  onExternalRevision(cb: (revisionId: string, origin: string) => void): () => void;
  acquireLock(): Promise<boolean>;
  releaseLock(): void;
  markSaved(revisionId: string): void;
  /** 状态变化（role / status / isSaver / lock / peers）。配 useSyncExternalStore 用。 */
  subscribe(cb: () => void): () => void;
  destroy(): void;
}

export interface EntityShape {
  order: string[];
  entities: Record<string, Record<string, unknown>>;
  meta?: Record<string, unknown>;
}

export interface BindJsonStateOptions<T> {
  room: CollabRoom;
  /** 约定 "oceanleo:<editorKind>"。 */
  rootName: string;
  toEntities(state: T): EntityShape;
  fromEntities(
    input: { order: string[]; entities: Record<string, Record<string, unknown>>; meta: Record<string, unknown> },
    prev: T | null,
  ): T;
}

export interface JsonStateBinding<T> {
  push(state: T): void;
  seed(state: T): void;
  onRemote(cb: (state: T) => void): () => void;
  destroy(): void;
}

export interface EditorCollabBinding {
  room: CollabRoom | null;
  artifact: { id: string; title: string; editorKind: ImEditorKind } | null;
}

export type { UseCollabRoomOptions } from "./use-collab-room";
export { useCollabRoom, useCollabReadOnly, useCollabSaveGate } from "./use-collab-room";
export { bindJsonState } from "./bind-json-state";
export { bindTextarea } from "./bind-textarea";
export { CollabPresenceBar } from "./CollabPresenceBar";
export { CollabLockBanner } from "./CollabLockBanner";
export { CollabInviteButton } from "./CollabInviteButton";
export { colorForUser, fnv1a32 } from "./color";
export { grantCoeditToConversation } from "./grants-api";
export { collabEditorKindForAdapter } from "./collab-editor-kinds";
