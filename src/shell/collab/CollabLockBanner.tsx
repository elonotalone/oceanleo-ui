"use client";

/**
 * 「X 正在专业模式中编辑」：别人持专业模式锁时，普通编辑器是只读的，这里告诉用户为什么。
 * viewer（只读权限）也在这里说明。锁在自己手里不显示。
 */
import { useUI } from "../../i18n/ui/useUI";
import type { CollabRoom } from "./index";
import { useCollabRoomVersion } from "./use-collab-room";

export function CollabLockBanner({ room, onTakeOver }: { room: CollabRoom | null; onTakeOver?: () => void }) {
  const tt = useUI();
  useCollabRoomVersion(room);
  if (!room) return null;
  const lock = room.lock;
  const lockedByOther = Boolean(lock && lock.holder.id !== room.self.id);
  if (!lockedByOther && room.role !== "viewer") return null;
  const text =
    lockedByOther && lock
      ? tt("{name} 正在专业模式中编辑", { name: lock.holder.name || tt("协作者") })
      : tt("你只能查看这个作品，不能修改");
  return (
    <div
      data-collab-lock-banner={lockedByOther ? "locked" : "viewer"}
      role="status"
      aria-live="polite"
      title={text}
      className="flex min-w-0 max-w-[18rem] shrink items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[12px] text-amber-900"
    >
      {lockedByOther && lock ? (
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: lock.holder.color }}
        />
      ) : null}
      <span className="min-w-0 truncate">{text}</span>
      {lockedByOther && onTakeOver ? (
        <button
          type="button"
          onClick={onTakeOver}
          className="shrink-0 rounded px-1 text-[12px] font-medium underline focus-visible:outline focus-visible:outline-2"
        >
          {tt("我来改")}
        </button>
      ) : null}
    </div>
  );
}
