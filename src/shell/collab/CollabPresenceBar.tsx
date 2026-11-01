"use client";

/**
 * 顶部的「谁也在这里」：房间里其他人的头像串。颜色按用户 id 固定，悬停出名字。
 * 断线时在头像旁提示协作连接状态；文件保存与同步由文件运行时负责。
 * 名字、头像一律当纯文本 / `<img>` 渲染（契约 §10）。
 */
import { useRef } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { CollabRoom, CollabUser } from "./index";
import { useCollabRoomVersion } from "./use-collab-room";

const MAX_AVATARS = 4;

function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "·";
}

function Avatar({ user, label }: { user: CollabUser; label: string }) {
  return (
    <span
      data-collab-avatar={user.id}
      title={label}
      aria-label={label}
      role="img"
      className="relative -ml-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-white text-[11px] font-semibold text-white first:ml-0"
      style={{ borderColor: user.color, backgroundColor: user.avatar_url ? "#fff" : user.color }}
    >
      {user.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatar_url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initialOf(label)}</span>
      )}
    </span>
  );
}

export function CollabPresenceBar({ room }: { room: CollabRoom | null }) {
  const tt = useUI();
  useCollabRoomVersion(room);
  const hadConnection = useRef(false);
  if (!room) return null;
  const peers = room.peers;
  if (room.status === "syncing" || room.status === "synced") hadConnection.current = true;
  // A room can be created while an editor is still loading. Do not call that
  // a collaboration outage unless the room had actually connected before, or
  // there are peers whose presence is meaningful to preserve.
  const offline = room.status === "offline" && (hadConnection.current || peers.length > 0);
  if (peers.length === 0 && !offline) return null;
  const shown = peers.slice(0, MAX_AVATARS);
  const more = peers.length - shown.length;
  return (
    <div data-collab-presence className="flex min-w-0 shrink-0 items-center gap-2">
      {peers.length > 0 ? (
        <div
          role="group"
          aria-label={tt("{count} 人也在这里", { count: peers.length })}
          className="flex items-center"
        >
          {shown.map((user) => (
            <Avatar key={user.id} user={user} label={user.name || tt("协作者")} />
          ))}
          {more > 0 ? (
            <span
              title={tt("还有 {count} 人", { count: more })}
              className="-ml-1.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border-2 border-neutral-300 bg-neutral-100 px-1 text-[10px] font-semibold text-neutral-600"
            >
              +{more}
            </span>
          ) : null}
        </div>
      ) : null}
      {offline ? (
        <span
          role="status"
          title={tt("协作连接已断开，正在重试")}
          className="max-w-[10rem] truncate text-[11px] text-[var(--awb-muted,#737373)]"
        >
          {tt("协作连接已断开，正在重试")}
        </span>
      ) : null}
    </div>
  );
}
