"use client";

import type { ReactNode } from "react";
import type { SelectionControlIcon } from "./selection-context";

export type WorkbenchIconName =
  | SelectionControlIcon
  | "agent"
  | "elements"
  | "file"
  | "library"
  | "materials"
  | "pages"
  | "settings"
  | "tasks"
  | "templates"
  | "timeline"
  | "uploads";

const paths: Record<WorkbenchIconName, ReactNode> = {
  add: <path d="M12 5v14M5 12h14" />,
  ai: (
    <>
      <path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18 12h3M16.3 7.7l2.1-2.1" />
      <rect x="6" y="7" width="12" height="12" rx="4" />
      <path d="M9.5 13h.01M14.5 13h.01M9.5 16h5" />
    </>
  ),
  "align-center": <path d="M5 6h14M7 10h10M5 14h14M8 18h8" />,
  "align-left": <path d="M4 6h16M4 10h11M4 14h16M4 18h9" />,
  "align-right": <path d="M4 6h16M9 10h11M4 14h16M11 18h9" />,
  animate: (
    <>
      <path d="M4 12h4l3-7 3 14 3-7h3" />
      <path d="M3 3v18h18" />
    </>
  ),
  background: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M4 15l4-4 3 3 3-4 6 6" />
    </>
  ),
  bold: <path d="M8 5h5.2a3.3 3.3 0 010 6.6H8zm0 6.6h6a3.7 3.7 0 010 7.4H8z" />,
  border: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h8v8H8z" />
    </>
  ),
  "bring-forward": (
    <>
      <rect x="8" y="4" width="12" height="12" rx="2" />
      <path d="M4 8v10a2 2 0 002 2h10" />
    </>
  ),
  crop: (
    <>
      <path d="M7 3v14a2 2 0 002 2h12M3 7h14a2 2 0 012 2v12" />
    </>
  ),
  delete: (
    <>
      <path d="M4 7h16M9 3h6l1 4H8l1-4zM7 7l1 14h8l1-14" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  duplicate: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </>
  ),
  effects: (
    <>
      <path d="M12 3l1.8 4.8L19 9.5l-4.1 3.1L15 18l-3-2-3 2 .1-5.4L5 9.5l5.2-1.7L12 3z" />
    </>
  ),
  filter: (
    <>
      <path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="14" cy="18" r="2" />
    </>
  ),
  "flip-horizontal": (
    <>
      <path d="M12 3v18" strokeDasharray="2 2" />
      <path d="M4 7l6-3v16l-6-3zM20 7l-6-3v16l6-3z" />
    </>
  ),
  "flip-vertical": (
    <>
      <path d="M3 12h18" strokeDasharray="2 2" />
      <path d="M7 4l-3 6h16l-3-6zM7 20l-3-6h16l-3 6z" />
    </>
  ),
  font: <path d="M5 19L11 5h2l6 14M7.5 14h9" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M3 17l5-5 4 4 3-3 6 5" />
    </>
  ),
  italic: <path d="M10 5h8M6 19h8M14 5L10 19" />,
  layers: (
    <>
      <path d="M12 3L3 8l9 5 9-5-9-5z" />
      <path d="M3 12l9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 007 0l2-2a5 5 0 00-7-7l-1 1" />
      <path d="M14 11a5 5 0 00-7 0l-2 2a5 5 0 007 7l1-1" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  opacity: (
    <>
      <path d="M12 3s6 6.2 6 11a6 6 0 11-12 0c0-4.8 6-11 6-11z" />
      <path d="M8 15c2.5-1.2 5.5-1.2 8 0" />
    </>
  ),
  position: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M18 9l3 3-3 3M9 18l3 3 3-3M6 9l-3 3 3 3" />
    </>
  ),
  redo: <path d="M18 8l3 3-3 3M21 11h-8a7 7 0 00-7 7M6 5v4H2" />,
  rotate: (
    <>
      <path d="M20 11a8 8 0 10-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  save: (
    <>
      <path d="M5 3h12l3 3v15H4V4a1 1 0 011-1z" />
      <path d="M8 3v6h8V3M8 21v-7h8v7" />
    </>
  ),
  "send-backward": (
    <>
      <rect x="4" y="8" width="12" height="12" rx="2" />
      <path d="M8 8V6a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2h-2" />
    </>
  ),
  shape: (
    <>
      <rect x="3" y="8" width="10" height="10" rx="2" />
      <circle cx="16" cy="9" r="5" />
    </>
  ),
  spacing: <path d="M4 7h16M4 17h16M8 10l4 4 4-4M12 14v-4" />,
  text: <path d="M4 5h16M12 5v14M8 19h8" />,
  underline: <path d="M7 4v7a5 5 0 0010 0V4M5 21h14" />,
  undo: <path d="M6 8l-3 3 3 3M3 11h8a7 7 0 017 7M18 5v4h4" />,
  unlock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 017.5-2" />
    </>
  ),
  agent: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="5" />
      <path d="M12 2v3M8 12h.01M16 12h.01M8 16h8" />
    </>
  ),
  elements: (
    <>
      <circle cx="8" cy="8" r="4" />
      <rect x="12" y="12" width="8" height="8" rx="1" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h5" />
    </>
  ),
  library: (
    <>
      <path d="M4 5a2 2 0 012-2h14v16H6a2 2 0 00-2 2z" />
      <path d="M4 5v16M8 7h8M8 11h6" />
    </>
  ),
  materials: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h10M7 12h6M7 16h8" />
    </>
  ),
  pages: (
    <>
      <rect x="6" y="3" width="12" height="16" rx="2" />
      <path d="M3 7v14h12" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 13.5l2-1.5-2-1.5-.5-1.3.7-2.4-2.4-.7-1.3.5L14 4h-4L8.5 6.6l-1.3-.5-2.4.7.7 2.4L5 10.5 3 12l2 1.5.5 1.3-.7 2.4 2.4.7 1.3-.5L10 20h4l1.5-2.6 1.3.5 2.4-.7-.7-2.4.5-1.3z" />
    </>
  ),
  tasks: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  templates: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
    </>
  ),
  timeline: (
    <>
      <path d="M3 7h18M3 12h18M3 17h18" />
      <path d="M8 5v4M14 10v4M18 15v4" />
    </>
  ),
  uploads: (
    <>
      <path d="M12 16V3M7 8l5-5 5 5" />
      <path d="M4 14v7h16v-7" />
    </>
  ),
};

export function AdvancedEditorIcon({
  name,
  className = "h-4 w-4",
  strokeWidth = 1.8,
}: {
  name: WorkbenchIconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
