"use client";

/** 「加节点」抽屉：编辑栏空态里的带字按钮打开它（D3）。点一项，画面中央多一个节点。 */
import { useUI } from "../../i18n/ui/useUI";
import { VIDEO_DOC_PALETTE, videoKindAccent } from "./video-canvas-kinds";
import type { VideoCanvasThemeMode } from "./video-canvas-theme";

export function VideoAddNodeDrawer({
  theme,
  onPick,
}: {
  theme: VideoCanvasThemeMode;
  onPick: (kind: string) => void;
}) {
  const tt = useUI();
  return (
    <div data-testid="video-canvas-add-node-drawer" className="space-y-1.5 p-3">
      {VIDEO_DOC_PALETTE.map((entry) => (
        <button
          key={entry.kind}
          type="button"
          data-testid="video-canvas-add-node"
          data-node-kind={entry.kind}
          onClick={() => onPick(entry.kind)}
          className="flex w-full items-start gap-2.5 rounded-lg border border-[var(--awb-border,#e4e4e7)] bg-[var(--awb-popover-bg,#fff)] px-3 py-2 text-left text-[var(--awb-text,#18181b)] transition-colors hover:bg-[var(--awb-hover,rgba(0,0,0,.05))]"
        >
          <span
            aria-hidden
            className="mt-1 h-3 w-1 shrink-0 rounded-full"
            style={{ background: videoKindAccent(entry.kind, theme) }}
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">{tt(entry.label)}</span>
            <span className="block text-[11.5px] text-[var(--awb-muted,#71717a)]">{tt(entry.hint)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
