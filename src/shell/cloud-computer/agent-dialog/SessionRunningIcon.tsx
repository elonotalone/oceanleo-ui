"use client";

/** 8×8 crisp-edge walker. Two stepped frames + a 1px bob; CSS, not a fade. */
const PIXEL_RUN_CSS = `
[data-oceanleo-acp-session-status="running"] svg {
  display: block;
  overflow: visible;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
[data-oceanleo-acp-session-status="running"] .oceanleo-pixel-bob {
  animation: oceanleo-pixel-bob 0.4s steps(2, end) infinite;
}
[data-oceanleo-acp-session-status="running"] .oceanleo-pixel-a {
  animation: oceanleo-pixel-swap 0.4s steps(1, end) infinite;
}
[data-oceanleo-acp-session-status="running"] .oceanleo-pixel-b {
  animation: oceanleo-pixel-swap 0.4s steps(1, end) infinite reverse;
}
@keyframes oceanleo-pixel-bob {
  0% { transform: translateY(1px); }
  100% { transform: translateY(0); }
}
@keyframes oceanleo-pixel-swap {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  [data-oceanleo-acp-session-status="running"] .oceanleo-pixel-bob,
  [data-oceanleo-acp-session-status="running"] .oceanleo-pixel-a,
  [data-oceanleo-acp-session-status="running"] .oceanleo-pixel-b {
    animation: none;
  }
  [data-oceanleo-acp-session-status="running"] .oceanleo-pixel-b {
    opacity: 0;
  }
}
`;

export function SessionRunningIcon({ label }: { label: string }) {
  return (
    <span
      data-oceanleo-acp-session-status="running"
      data-oceanleo-acp-pixel-run=""
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex size-3 shrink-0 text-emerald-700 dark:text-emerald-300"
    >
      <style>{PIXEL_RUN_CSS}</style>
      <svg
        width="12"
        height="12"
        viewBox="0 0 8 8"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <g className="oceanleo-pixel-bob">
          <rect x="3" y="0" width="2" height="1" fill="currentColor" />
          <rect x="2" y="1" width="4" height="2" fill="currentColor" />
          <rect x="3" y="3" width="2" height="2" fill="currentColor" />
          <g className="oceanleo-pixel-a">
            <rect x="2" y="3" width="1" height="1" fill="currentColor" />
            <rect x="5" y="3" width="1" height="1" fill="currentColor" />
            <rect x="2" y="5" width="1" height="2" fill="currentColor" />
            <rect x="5" y="5" width="1" height="2" fill="currentColor" />
          </g>
          <g className="oceanleo-pixel-b">
            <rect x="1" y="3" width="1" height="1" fill="currentColor" />
            <rect x="6" y="3" width="1" height="1" fill="currentColor" />
            <rect x="1" y="5" width="1" height="2" fill="currentColor" />
            <rect x="6" y="5" width="1" height="2" fill="currentColor" />
          </g>
        </g>
      </svg>
    </span>
  );
}
