// 通知视图与收件箱通知行共用的小图标。纯展示，没有依赖。
import type { ReactElement } from "react";

export function NoticeBellIcon({ className = "h-[18px] w-[18px]" }: { className?: string }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 21h4" />
    </svg>
  );
}

export function NoticeChevronIcon({ className = "h-3.5 w-3.5" }: { className?: string }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/** 通知的头像：暖色渐变圆里一只铃铛（会话行的头像是彩色字母块 / 拼图，这个一眼能分出来）。 */
export function NoticeAvatar({ size = 40 }: { size?: number }): ReactElement {
  return (
    <span
      data-notices-avatar=""
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white"
      aria-hidden="true"
    >
      <NoticeBellIcon className={size >= 40 ? "h-5 w-5" : "h-[18px] w-[18px]"} />
    </span>
  );
}
