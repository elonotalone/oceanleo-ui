import type { CreationToolId } from "./creation-tools";

// A creation glyph always carries its own add marker. It is not a formatting icon.
const PATHS: Record<CreationToolId, string> = {
  highlight: "m4 15 7-9 4 3-7 9H4z M9 7l4 3 M3 20h8",
  underline: "M5 4v7a4 4 0 0 0 8 0V4 M3 19h12",
  strikeout: "M13 5C6 1 2 9 9 10s6 8-2 7 M2 11h14",
  check: "m3 11 5 5 8-11", cross: "m4 5 11 11 M15 5 4 16",
  text: "M3 5h12 M9 5v13 M6 18h6", signature: "M2 15c9-14 7-13 6-1 8-8 2 5 8-1 M2 19h11",
  ink: "m3 17 2-6 7-8 4 4-7 8-6 2z M5 11l4 4",
  note: "M3 3h12v11l-5 5H3z M10 19v-5h5 M6 7h6 M6 10h5",
  find: "M12 8a5 5 0 1 1-10 0 5 5 0 0 1 10 0z m-1 4 5 5",
  select: "M4 3v15l4-4 3 5 3-2-3-5h6z",
  templates: "M3 3h12v15H3z M3 8h12 M8 8v10",
  elements: "M3 3h5v5H3z M12 3l4 5H8z M5 12a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
  image: "M2 4h14v14H2z M4 15l4-5 3 3 3-4 M5 7h1",
  shape: "M3 4h11v11H3z M10 10h6v8h-6z",
  line: "M3 18 15 4 M3 14v4h4 M11 4h4v4",
  draw: "m3 18 2-6L13 3l3 3-8 9z M5 12l3 3",
  table: "M2 4h14v14H2z M2 9h14 M2 13h14 M7 4v14 M12 4v14",
  pages: "M3 5h10v14H3z M6 2h10v12 M6 9h4 M6 13h4",
  materials: "M2 5h6l2 3h6v10H2z M5 3h8",
  effects: "m9 2 2 6 5 2-5 2-2 6-2-6-5-2 5-2z",
  layers: "m2 7 7-5 7 5-7 5z M2 12l7 5 7-5 M2 17l7 5 4-3",
  audio: "M6 15V4l9-2v11 M6 15a3 2 0 1 1-3-2h3 M15 13a3 2 0 1 1-3-2h3",
  video: "M2 5h11v12H2z M13 9l4-3v10l-4-3",
  model: "m3 6 7-4 7 4v9l-7 4-7-4z M3 6l7 4 7-4 M10 10v9",
  properties: "M3 5h14 M3 11h14 M3 17h8 M6 3v4 M12 9v4 M7 15v4",
  action: "M3 4h12v14H3z M6 8h6 M6 12h5",
};

export function CreationToolIcon({ tool, className }: { tool: CreationToolId; className?: string }) {
  return <svg aria-hidden="true" data-creation-tool-icon={tool} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    <path d={PATHS[tool]} />
    <path d="M19 15v7 M15.5 18.5h7" />
  </svg>;
}
