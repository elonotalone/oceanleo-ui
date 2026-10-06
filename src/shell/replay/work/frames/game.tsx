"use client";

// game 的回放画法（work-chat W14，契约 §8.4）：代码快照，只读等宽文本。
// 改动的行用作者颜色标在行号旁；不运行任何代码，不用 iframe / innerHTML。
import { useUI } from "../../../../i18n/ui/useUI";
import {
  gameChangedLines,
  gameDescribeChange,
  gameFromRevisionJson,
  gameFromYDoc,
  gameToArtifactJson,
  type GameCollabState,
} from "../../../collab/adapters/game";
import type { ReplayFrameProps, ReplayFrameRenderer } from "../frame-types";

const LINE_HEIGHT = 16;
const TAB_HEIGHT = 24;

function GameFrame({ snapshot, prev, width, height, authorColor = "#4f46e5" }: ReplayFrameProps) {
  const tt = useUI();
  const state = snapshot as GameCollabState;
  const before = (prev as GameCollabState | undefined)?.pages;
  const page = state.pages[0];
  const code = page?.code ?? "";
  const lines = code.split("\n");
  const previous = before?.find((p) => p.id === page?.id);
  const changed = new Set(prev ? gameChangedLines(previous?.code, code) : []);
  const capacity = Math.max(1, Math.floor((height - TAB_HEIGHT) / LINE_HEIGHT));
  const firstChanged = [...changed].sort((a, b) => a - b)[0];
  const start = Math.max(0, Math.min(lines.length - capacity, (firstChanged ?? 1) - 1 - Math.floor(capacity / 4)));
  const visible = lines.slice(start, start + capacity);
  return (
    <div
      data-replay-frame="game"
      style={{ width, height }}
      className="overflow-hidden rounded border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] font-mono text-[11px] text-[var(--foreground,#292524)]"
    >
      <div style={{ height: TAB_HEIGHT }} className="flex items-center gap-2 border-b border-[var(--border,#e7e5e4)] px-2">
        {state.pages.map((entry) => (
          <span key={entry.id} className={entry.id === page?.id ? "font-semibold" : "opacity-60"}>
            {entry.label}
          </span>
        ))}
      </div>
      {code.trim() === "" ? (
        <p className="p-3 font-sans text-[var(--muted-foreground,#57534e)]">{tt("还没有代码")}</p>
      ) : (
        <ol className="m-0 list-none p-0">
          {visible.map((text, index) => {
            const number = start + index + 1;
            const mark = changed.has(number);
            return (
              <li key={number} data-changed={mark ? "true" : undefined} style={{ height: LINE_HEIGHT }} className="flex whitespace-pre">
                <span
                  className="w-9 shrink-0 select-none pr-2 text-right opacity-60"
                  style={mark ? { borderLeft: `3px solid ${authorColor}`, background: `${authorColor}22`, opacity: 1 } : { borderLeft: "3px solid transparent" }}
                >
                  {number}
                </span>
                <span className="overflow-hidden text-ellipsis">{text}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const renderer: ReplayFrameRenderer = {
  kind: "game",
  fromY: gameFromYDoc,
  fromRevision: gameFromRevisionJson,
  Frame: GameFrame,
  describeChange: gameDescribeChange,
  toArtifactJson: gameToArtifactJson,
};

export default renderer;
