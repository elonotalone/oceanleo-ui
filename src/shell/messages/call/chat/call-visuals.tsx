"use client";

// 通话聊天界面的小图形：耳机（通话入口的图标，操作员定）、听筒（接听 / 挂断）、录制点、头像与头像叠。
// 只画 SVG 与 <img>，头像地址只认 https（httpsAvatarUrl），不内联任何 HTML。
import type { ImProfile } from "../../../../lib/im/types";
import { httpsAvatarUrl } from "../../../../lib/im/types";

export function HeadphonesIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      data-call-icon="headphones"
    >
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <path d="M4 15h2.5A1.5 1.5 0 0 1 8 16.5v2A1.5 1.5 0 0 1 6.5 20h-1A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M20 15h-2.5a1.5 1.5 0 0 0-1.5 1.5v2a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5Z" />
    </svg>
  );
}

/** 听筒；`hangup` 时转 135° 表示拒接。 */
export function HandsetIcon({ size = 18, hangup = false }: { size?: number; hangup?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      style={hangup ? { transform: "rotate(135deg)" } : undefined}
    >
      <path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.5 11.5 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.58 3.57a1 1 0 0 1-.25 1Z" />
    </svg>
  );
}

export function RecordDotIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
    </svg>
  );
}

export function TranscriptIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M7 10h4M13 10h4M7 14h7M16 14h1" />
    </svg>
  );
}

/** 名字首字；名字还没到（来电卡片的 D4 情形）就什么也不画，不用「?」充数。 */
function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "";
}

export function CallAvatar({
  profile,
  name,
  size = 24,
  ring = false,
}: {
  profile: ImProfile | undefined;
  name: string;
  size?: number;
  /** 叠在一起时给每个头像一圈白边。 */
  ring?: boolean;
}) {
  const url = httpsAvatarUrl(profile?.avatar_url ?? null);
  const box = { width: size, height: size };
  const ringClass = ring ? " ring-2 ring-white dark:ring-neutral-900" : "";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        style={box}
        className={"shrink-0 rounded-full object-cover" + ringClass}
        title={name || undefined}
      />
    );
  }
  return (
    <span
      style={box}
      title={name || undefined}
      className={
        "inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-200" +
        ringClass
      }
      aria-hidden="true"
    >
      {initialOf(name)}
    </span>
  );
}

/** 头像叠：最多 `max` 个，多出来的写「+N」。 */
export function AvatarStack({
  userIds,
  profileOf,
  nameOf,
  max = 5,
  size = 22,
}: {
  userIds: string[];
  profileOf: (userId: string) => ImProfile | undefined;
  nameOf: (userId: string) => string;
  max?: number;
  size?: number;
}) {
  if (userIds.length === 0) return null;
  const shown = userIds.slice(0, max);
  const extra = userIds.length - shown.length;
  return (
    <span className="flex items-center" data-call-avatars={userIds.length}>
      {shown.map((id, index) => (
        <span key={id} className={index === 0 ? "" : "-ml-1.5"}>
          <CallAvatar profile={profileOf(id)} name={nameOf(id)} size={size} ring />
        </span>
      ))}
      {extra > 0 ? (
        <span className="ml-1 text-[11.5px] text-neutral-500 dark:text-neutral-400" data-call-avatars-more={extra}>
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
