"use client";

// 群头像、人头像、在线小圆点。名字与头像地址一律当纯文本 / 普通 <img> 渲染（契约 §10）。

import type { ImPresence } from "../../../lib/im/types";

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

export function GroupAvatar(props: AvatarProps) {
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
