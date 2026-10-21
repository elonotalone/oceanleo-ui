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
  | "uploads"
  // 统一 chrome：视图切换与窗口控制。此前网站工作台用 ◉ </> ▦ ▤ ▱ ⚙ 这类
  // 排版字符当图标，换字体就塌，且与其余插件的描边图标不是一套。
  | "preview"
  | "code"
  | "dashboard"
  | "database"
  | "storage"
  | "close"
  | "fullscreen"
  | "fullscreen-exit"
  | "history"
  | "panel"
  | "chevron"
  | "share"
  | "star"
  | "back"
  | "list"
  | "font-size"
  | "underline-color"
  | "linethrough";

/** Shared 24×24 text-tool glyphs. */
const paths: Record<string, string> = {
  bold: "M7.5 4.5V19.5M7.5 4.5H13.1C16.2 4.5 16.2 11.1 13.1 11.1H7.5M7.5 11.1H13.7C17.2 11.1 17.2 19.5 13.7 19.5H7.5",
  italic: "M10 4.5H18M6 19.5H14M15.4 4.5L8.6 19.5",
  underline: "M6.8 4.5V12C6.8 15.9 9.4 18.4 12 18.4C14.6 18.4 17.2 15.9 17.2 12V4.5M5 20.8H19",
  strike:
    "M16.8 7C15.8 5.4 14 4.5 11.7 4.5C8.7 4.5 6.7 6.1 6.7 8.2C6.7 10.4 8.5 11.4 12 12.2C15.5 13 17.3 14 17.3 16.2C17.3 18.5 15.1 19.7 11.8 19.7C9.3 19.7 7.3 18.7 6.4 17.2M4.5 12H19.5",
  linethrough:
    "M16.8 7C15.8 5.4 14 4.5 11.7 4.5C8.7 4.5 6.7 6.1 6.7 8.2C6.7 10.4 8.5 11.4 12 12.2C15.5 13 17.3 14 17.3 16.2C17.3 18.5 15.1 19.7 11.8 19.7C9.3 19.7 7.3 18.7 6.4 17.2M4.5 12H19.5",
  "align-left": "M4 5.5H20M4 9.5H14.5M4 13.5H20M4 17.5H12.5",
  "align-center": "M4 5.5H20M6.5 9.5H17.5M4 13.5H20M8 17.5H16",
  "align-right": "M4 5.5H20M9.5 9.5H20M4 13.5H20M11.5 17.5H20",
  "align-justify": "M4 5.5H20M4 9.5H20M4 13.5H20M4 17.5H20",
  font: "M5 19L12 4L19 19M7.6 13.6H16.4",
  case: "M4 18.5L8.2 5.5H9.6L13.8 18.5M5.6 13.7H12.2M19.2 12.8V18.8M19.2 15C15.6 15 15.6 18.2 19.2 18.2",
  "font-size":
    "M6 16L9.5 6H11L14.5 16M7.4 12.2H13.1M17 5V10M15.2 7L17 5L18.8 7M17 19V14M15.2 17L17 19L18.8 17",
  "underline-color": "M6 17L12 4.5L18 17M8.1 12.8H15.9M5.5 20.5H18.5",
  spacing:
    "M3.5 6H14M3.5 12H14M3.5 18H14M18.5 4V20M16 6.8L18.5 4L21 6.8M16 17.2L18.5 20L21 17.2",
  effects:
    "M12 5.2a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6M17 10.2a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6M12 15.2a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6M7 10.2a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6",
  animate: "M8.5 6.8L8.5 17.2L18.2 12Z M4.8 8.8A8 8 0 0 0 4.8 15.2",
  position:
    "M12 3.2V20.8M3.2 12H20.8M8.8 6.6L12 3.2L15.2 6.6M17.4 8.8L20.8 12L17.4 15.2M15.2 17.4L12 20.8L8.8 17.4M6.6 15.2L3.2 12L6.6 8.8",
  more: "M5 10.6A1.4 1.4 0 1 1 5 13.4A1.4 1.4 0 1 1 5 10.6M12 10.6A1.4 1.4 0 1 1 12 13.4A1.4 1.4 0 1 1 12 10.6M19 10.6A1.4 1.4 0 1 1 19 13.4A1.4 1.4 0 1 1 19 10.6",
  list: "M5 5.4A1.1 1.1 0 1 1 5 7.6A1.1 1.1 0 1 1 5 5.4M5 10.9A1.1 1.1 0 1 1 5 13.1A1.1 1.1 0 1 1 5 10.9M5 16.4A1.1 1.1 0 1 1 5 18.6A1.1 1.1 0 1 1 5 16.4M9 6.5H20M9 12H20M9 17.5H20",
};

const glyphs: Record<WorkbenchIconName, ReactNode> = {
  add: <path d="M12 5v14M5 12h14" />,
  ai: (
    <>
      <path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18 12h3M16.3 7.7l2.1-2.1" />
      <rect x="6" y="7" width="12" height="12" rx="4" />
      <path d="M9.5 13h.01M14.5 13h.01M9.5 16h5" />
    </>
  ),
  "align-center": <path d={paths["align-center"]} />,
  "align-justify": <path d={paths["align-justify"]} />,
  "align-left": <path d={paths["align-left"]} />,
  "align-right": <path d={paths["align-right"]} />,
  animate: <path d={paths.animate} />,
  background: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M4 15l4-4 3 3 3-4 6 6" />
    </>
  ),
  bold: <path d={paths.bold} />,
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
  case: <path d={paths.case} />,
  crop: (
    <>
      <path d="M7 3v14a2 2 0 002 2h12M3 7h14a2 2 0 012 2v12" />
    </>
  ),
  color: (
    <>
      <path d="M12 3s6 6.2 6 11a6 6 0 01-12 0c0-4.8 6-11 6-11z" />
      <path d="M9 15.5a3.5 3.5 0 003 1.5" />
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
  draw: (
    <>
      <path d="M4 19c3-5 5-8 8-11l4-4 4 4-4 4c-3 3-6 5-11 8z" />
      <path d="M13 7l4 4M4 20h7" />
    </>
  ),
  duplicate: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </>
  ),
  effects: <path d={paths.effects} />,
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
  font: <path d={paths.font} />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M3 17l5-5 4 4 3-3 6 5" />
    </>
  ),
  italic: <path d={paths.italic} />,
  "font-size": <path d={paths["font-size"]} />,
  layers: (
    <>
      <path d="M12 3L3 8l9 5 9-5-9-5z" />
      <path d="M3 12l9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  linethrough: <path d={paths.linethrough} />,
  line: (
    <>
      <path d="M5 18L19 6" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="6" r="2" />
    </>
  ),
  list: <path d={paths.list} />,
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
  more: <path d={paths.more} />,
  note: (
    <>
      <path d="M5 3h14a2 2 0 012 2v10l-6 6H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path d="M15 21v-6h6" />
    </>
  ),
  opacity: (
    <>
      <path d="M12 3s6 6.2 6 11a6 6 0 11-12 0c0-4.8 6-11 6-11z" />
      <path d="M8 15c2.5-1.2 5.5-1.2 8 0" />
    </>
  ),
  position: <path d={paths.position} />,
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
  select: (
    <>
      <path d="M5 3l13 9-6 2-3 6z" />
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
  signature: (
    <>
      <path d="M4 17c2-5 3-9 5-9 3 0-1 9 2 9 2 0 3-5 5-5 2 0 0 5 4 5" />
      <path d="M3 21h18" />
    </>
  ),
  spacing: <path d={paths.spacing} />,
  strike: <path d={paths.strike} />,
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
    </>
  ),
  text: <path d="M4 5h16M12 5v14M8 19h8" />,
  transparency: (
    <>
      <path d="M4 4h16v16H4zM12 4v16M4 12h16" />
      <path d="M4 4h8v8H4zM12 12h8v8h-8z" fill="currentColor" stroke="none" opacity=".28" />
    </>
  ),
  "underline-color": <path d={paths["underline-color"]} />,
  underline: <path d={paths.underline} />,
  undo: <path d="M6 8l-3 3 3 3M3 11h8a7 7 0 017 7M18 5v4h4" />,
  unlock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 017.5-2" />
    </>
  ),
  "vertical-text": (
    <>
      <path d="M8 4h8M12 4v9" />
      <path d="M8 16h8M9 20h6" />
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
  preview: (
    <>
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  code: <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />,
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="4.5" rx="1.5" />
      <rect x="13.5" y="12" width="7.5" height="9" rx="1.5" />
      <rect x="3" y="14.5" width="7.5" height="6.5" rx="1.5" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  storage: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  fullscreen: <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />,
  "fullscreen-exit": <path d="M3 9h6V3M21 9h-6V3M3 15h6v6M21 15h-6v6" />,
  history: (
    <>
      <path d="M3 12a9 9 0 109-9 9 9 0 00-7.6 4.2M3 3v4.5h4.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  chevron: <path d="M6 9l6 6 6-6" />,
  share: (
    <>
      <path d="M12 16V3M7 8l5-5 5 5" />
      <path d="M5 13v7h14v-7" />
    </>
  ),
  star: (
    <path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
  ),
  back: <path d="M15 6l-6 6 6 6" />,
};

export function AdvancedEditorIcon({
  name,
  className = "h-4 w-4",
  strokeWidth = 1.8,
  filled = false,
}: {
  name: WorkbenchIconName;
  className?: string;
  strokeWidth?: number;
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {glyphs[name]}
    </svg>
  );
}
