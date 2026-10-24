// Skills overhaul 2026-10-24 — W09A：大弹窗与查看器用到的线性图标。
// UI-DESIGN：缺的图标用内联 SVG（stroke 1.75，currentColor），不用 emoji。
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

export function KitIconClose(p: P) {
  return <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
}
export function KitIconPlus(p: P) {
  return <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
}
export function KitIconChevronDown(p: P) {
  return <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>;
}
export function KitIconChevronRight(p: P) {
  return <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>;
}
export function KitIconChevronLeft(p: P) {
  return <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
}
export function KitIconSearch(p: P) {
  return <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Svg>;
}
export function KitIconFilter(p: P) {
  return <Svg {...p}><path d="M4 6h16M7 12h10M10 18h4" /></Svg>;
}
export function KitIconMore(p: P) {
  return (
    <Svg {...p}>
      <circle cx="5.5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1" fill="currentColor" />
    </Svg>
  );
}
export function KitIconFolder(p: P) {
  return <Svg {...p}><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></Svg>;
}
export function KitIconFolderOpen(p: P) {
  return (
    <Svg {...p}>
      <path d="M3.5 17V7.5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2V11" />
      <path d="M3.5 17l2.3-5.2a1.5 1.5 0 0 1 1.4-.8H20a1 1 0 0 1 .9 1.4L18.6 17.6a2 2 0 0 1-1.8 1.1H5.4A1.9 1.9 0 0 1 3.5 17z" />
    </Svg>
  );
}
export function KitIconFile(p: P) {
  return (
    <Svg {...p}>
      <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" />
      <path d="M14 3.5v5h5" />
    </Svg>
  );
}
export function KitIconFileText(p: P) {
  return (
    <Svg {...p}>
      <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" />
      <path d="M14 3.5v5h5M8.5 13h7M8.5 16.5h5" />
    </Svg>
  );
}
export function KitIconCode(p: P) {
  return <Svg {...p}><path d="M9 8l-4 4 4 4M15 8l4 4-4 4" /></Svg>;
}
export function KitIconImage(p: P) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M20.5 16l-4.5-4.5L6 19.5" />
    </Svg>
  );
}
export function KitIconCopy(p: P) {
  return (
    <Svg {...p}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </Svg>
  );
}
export function KitIconCheck(p: P) {
  return <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
}
export function KitIconDownload(p: P) {
  return <Svg {...p}><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" /></Svg>;
}
export function KitIconShare(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 15V4M8 7.5L12 4l4 3.5" />
      <path d="M8 11H6.5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H16" />
    </Svg>
  );
}
export function KitIconShield(p: P) {
  return <Svg {...p}><path d="M12 3.5l7 2.5v5.5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></Svg>;
}
export function KitIconPuzzle(p: P) {
  return (
    <Svg {...p}>
      <path d="M10 3.5a2 2 0 1 1 4 0V5h3a2 2 0 0 1 2 2v3h-1.5a2 2 0 1 0 0 4H19v3a2 2 0 0 1-2 2h-3v-1.5a2 2 0 1 0-4 0V19H7a2 2 0 0 1-2-2v-3h1.5a2 2 0 1 0 0-4H5V7a2 2 0 0 1 2-2h3z" />
    </Svg>
  );
}
export function KitIconAlert(p: P) {
  return <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.2v.1" /></Svg>;
}
