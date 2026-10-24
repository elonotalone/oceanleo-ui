// W09B — line icons the kit doesn't have (UI-DESIGN: inline SVG, stroke 1.75, currentColor, no emoji).
import type { ReactNode } from "react";

type P = { className?: string };

function Svg({ className = "h-4 w-4", children }: P & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconUpload(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 15V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </Svg>
  );
}

export function IconUserCircle(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.8 18.2a6 6 0 0 1 10.4 0" />
    </Svg>
  );
}

export function IconGithub(p: P) {
  return (
    <Svg {...p}>
      <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    </Svg>
  );
}

export function IconPencil(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  );
}

export function IconEye(p: P) {
  return (
    <Svg {...p}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function IconTrash(p: P) {
  return (
    <Svg {...p}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function IconFolderPlus(p: P) {
  return (
    <Svg {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M12 10.5v5M9.5 13h5" />
    </Svg>
  );
}

export function IconRefresh(p: P) {
  return (
    <Svg {...p}>
      <path d="M20 11a8 8 0 0 0-14.8-4M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.8 4M20 20v-4h-4" />
    </Svg>
  );
}

export function IconExternal(p: P) {
  return (
    <Svg {...p}>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </Svg>
  );
}

/** Author mark for official skills (a small four-point spark). */
export function IconAuthor(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" />
    </Svg>
  );
}

export function IconScale(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 3v18M7 21h10" />
      <path d="M5 7h14" />
      <path d="m5 7-3 6a3 3 0 0 0 6 0Z" />
      <path d="m19 7-3 6a3 3 0 0 0 6 0Z" />
    </Svg>
  );
}
