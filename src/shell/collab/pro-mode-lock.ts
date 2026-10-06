/**
 * 专业模式锁的接线（契约 §9.15 / 任务书）：
 * - 进专业模式前 `acquireLock()`，拿不到 → 拦下，并说清是谁在用；
 * - 退出专业模式（模式回到普通）→ `releaseLock()`；页面关闭由 provider 的 `pagehide` 释放；
 * - 上次记住的就是专业模式、打开作品时直接落在专业模式 → 房间就绪后补拿锁，拿不到就退回普通模式；
 * - 在专业模式里锁被别人拿走/过期 → 同样退回普通模式并提示。
 *
 * 唯一的公共切换点是 `plugin-mode-store.ts` 的 `setPluginMode`（顶栏开关、页签、各路由的重试都走它），
 * 把关函数通过 `registerProModeGuard` 挂在那里；各编辑器里什么都不用改。
 */
import type { PluginThemeId } from "../plugin-theme";
import {
  currentPluginMode,
  registerProModeGuard,
  setPluginMode,
  subscribePluginMode,
} from "../plugin-chrome/plugin-mode-store";
import type { CollabRoom, CollabUser } from "./index";

export type ProEntryVerdict =
  | { ok: true }
  | { ok: false; reason: "viewer" }
  | { ok: false; reason: "locked"; holder: CollabUser | null };

function holdsLock(room: CollabRoom): boolean {
  return Boolean(room.lock && room.self.id && room.lock.holder.id === room.self.id);
}

/** 能不能进专业模式；会真的去拿锁。 */
export async function decideProEntry(room: CollabRoom | null): Promise<ProEntryVerdict> {
  if (!room) return { ok: true };
  if (room.status === "denied" || room.status === "disabled") return { ok: true };
  if (room.role === "viewer") return { ok: false, reason: "viewer" };
  // 还没连上（连接中 / 离线）：没法问服务端，先放行；房间就绪后 reconcile 会补拿锁、拿不到再退回。
  if (room.status !== "syncing" && room.status !== "synced") return { ok: true };
  if (holdsLock(room)) return { ok: true };
  const acquired = await room.acquireLock();
  if (acquired) return { ok: true };
  const holder = room.lock && room.lock.holder.id !== room.self.id ? room.lock.holder : null;
  return { ok: false, reason: "locked", holder };
}

export interface AttachProModeLockOptions {
  pluginId: PluginThemeId;
  room: CollabRoom;
  /** 被拦下 / 被退回时通知界面（弹提示）。 */
  onBlocked(verdict: Exclude<ProEntryVerdict, { ok: true }>): void;
}

/** 把锁接到某个插件的专业模式开关上；返回清理函数（同时释放锁）。 */
export function attachProModeLock({ pluginId, room, onBlocked }: AttachProModeLockOptions): () => void {
  let disposed = false;
  let reconciling = false;

  const unregister = registerProModeGuard(pluginId, async () => {
    const verdict = await decideProEntry(room);
    if (!verdict.ok && !disposed) onBlocked(verdict);
    return verdict.ok;
  });

  const reconcile = async () => {
    if (disposed || reconciling) return;
    if (currentPluginMode(pluginId) !== "pro") return;
    if (room.status !== "syncing" && room.status !== "synced") return;
    if (holdsLock(room)) return;
    reconciling = true;
    try {
      const verdict = await decideProEntry(room);
      if (disposed || verdict.ok) return;
      onBlocked(verdict);
      // 退回普通模式：离开专业模式不需要把关。
      setPluginMode(pluginId, "normal");
    } finally {
      reconciling = false;
    }
  };

  const unsubscribeMode = subscribePluginMode(pluginId, () => {
    if (currentPluginMode(pluginId) !== "pro") room.releaseLock();
    else void reconcile();
  });
  const unsubscribeRoom = room.subscribe(() => void reconcile());
  void reconcile();

  return () => {
    disposed = true;
    unregister();
    unsubscribeMode();
    unsubscribeRoom();
    room.releaseLock();
  };
}
