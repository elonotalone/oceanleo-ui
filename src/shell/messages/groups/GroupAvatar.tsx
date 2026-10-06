"use client";

// 群头像、人头像、在线小圆点。名字与头像地址一律当纯文本 / 普通 <img> 渲染（契约 §10）。

import { AVATAR_MEMBERS_MAX, avatarMembersOf, httpsAvatarUrl } from "../../../lib/im/types";
import type { ImAvatarMember, ImPresence } from "../../../lib/im/types";

const HUES = [262, 200, 160, 28, 340, 120, 210, 48];

function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

function initialOf(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  return Array.from(t)[0]!.toLocaleUpperCase();
}

function safeSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^(https?:\/\/|\/)/i.test(url) ? url : null;
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  seed?: string;
  className?: string;
}

function Avatar({ name, src, size = 36, seed, className = "", round }: AvatarProps & { round: boolean }) {
  const url = safeSrc(src);
  const shape = round ? "rounded-full" : "rounded-xl";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 object-cover ${shape} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const hue = hueOf(seed ?? name);
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center font-medium text-white ${shape} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: `hsl(${hue} 55% 48%)` }}
    >
      {initialOf(name)}
    </span>
  );
}

/** 拼图里的一格：有 https 头像画图，否则画名字首字的色块。 */
function MosaicTile({ member, fontSize }: { member: ImAvatarMember; fontSize: number }) {
  const url = httpsAvatarUrl(member.avatar_url);
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        data-avatar-tile="image"
        className="h-full w-full object-cover"
      />
    );
  }
  const hue = hueOf(member.user_id || member.display_name);
  return (
    <span
      aria-hidden="true"
      data-avatar-tile="initial"
      className="flex h-full w-full select-none items-center justify-center font-medium text-white"
      style={{ fontSize, background: `hsl(${hue} 55% 48%)` }}
    >
      {initialOf(member.display_name)}
    </span>
  );
}

/** 成员头像拼图：1 人整图，2 人左右，3–4 人田字格（最多取 4 人）。 */
function MemberMosaic({ members, size, className }: { members: ImAvatarMember[]; size: number; className: string }) {
  const count = members.length;
  const cols = count === 1 ? 1 : 2;
  const rows = count <= 2 ? 1 : 2;
  const fontSize = Math.max(8, Math.round(size * (count === 1 ? 0.42 : count === 2 ? 0.3 : 0.22)));
  return (
    <span
      aria-hidden="true"
      data-avatar-mosaic={count}
      className={`inline-grid shrink-0 overflow-hidden rounded-xl bg-neutral-100 ${className}`}
      style={{
        width: size,
        height: size,
        gap: count === 1 ? 0 : 1,
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {members.map((m) => (
        <span key={m.user_id} className="block min-h-0 min-w-0 overflow-hidden">
          <MosaicTile member={m} fontSize={fontSize} />
        </span>
      ))}
    </span>
  );
}

/**
 * 群头像。自己上传了头像（src）就用它；否则有成员头像就拼成图（最多 4 个）；
 * 都没有时仍是群名首字。
 */
export function GroupAvatar({ members, ...props }: AvatarProps & { members?: readonly ImAvatarMember[] | null }) {
  if (!safeSrc(props.src) && members && members.length > 0) {
    const safe = avatarMembersOf(members.slice(0, AVATAR_MEMBERS_MAX));
    if (safe.length > 0) return <MemberMosaic members={safe} size={props.size ?? 36} className={props.className ?? ""} />;
  }
  return <Avatar {...props} round={false} />;
}

export function PersonAvatar(props: AvatarProps) {
  return <Avatar {...props} round />;
}

const DOT: Record<ImPresence, string> = {
  online: "bg-emerald-500",
  away: "bg-amber-400",
  offline: "bg-neutral-300",
};

export function PresenceDot({ presence, label }: { presence: ImPresence | undefined; label?: string }) {
  const p = presence ?? "offline";
  return (
    <span
      role="img"
      aria-label={label}
      data-presence={p}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[p]}`}
    />
  );
}
