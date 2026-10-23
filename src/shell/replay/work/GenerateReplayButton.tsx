"use client";

// 「生成回放」（W11 挂，契约 §8.2）：选范围——今天 / 最近 7 天 / 自定义，生成后打开播放层。
//
// 编辑器第一行（D1，2026-10-23）不再放这个图标，入口在 `···` 菜单里：
// 菜单项打开的是同一个 `GenerateReplayPanel`，锚在 `···` 按钮上（由 CollabActionSlotInner 画）。
// `GenerateReplayButton` 留给没有 `···` 宿主的地方，弹的也是这一个面板。
// 面板走 AnchoredPopover：portal 出去不被 overflow 裁掉，插件主题 token 也跟着重建；
// 颜色一律走 token，深色下不再是一块白岛。
import { useRef, useState, type RefObject } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { Button, IconButton } from "../../../ui/Button";
import { useImEnabled } from "../../../lib/im/client";
import type { ImEditorKind } from "../../../lib/im/types";
import { AdvancedEditorIcon } from "../../AdvancedEditorIcon";
import { AnchoredPopover } from "../../anchored-popover";
import { createWorkReplay } from "./replay-work-api";
import { openWorkReplay } from "./open-work-replay";

export interface GenerateReplayButtonProps {
  resource: { kind: "artifact"; id: string; title: string; editorKind: ImEditorKind };
  iconOnly?: boolean;
}

export type ReplayRangeChoice = "today" | "week" | "custom";

/** 范围选择 → 起止时间（ISO）。自定义要两个都填且起点早于终点，否则返回 null。 */
export function replayRangeFor(
  choice: ReplayRangeChoice,
  now: Date,
  custom?: { from: string; to: string },
): { range_from: string; range_to: string } | null {
  if (choice === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { range_from: start.toISOString(), range_to: now.toISOString() };
  }
  if (choice === "week") {
    return { range_from: new Date(now.getTime() - 7 * 86_400_000).toISOString(), range_to: now.toISOString() };
  }
  if (!custom?.from || !custom.to) return null;
  const from = new Date(custom.from);
  const to = new Date(custom.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return null;
  return { range_from: from.toISOString(), range_to: to.toISOString() };
}

const INPUT_CLASS =
  "w-full rounded-lg border border-[var(--awb-border,var(--border,#e7e5e4))] bg-transparent px-2 py-1 text-[var(--awb-text,var(--fg,#292524))]";

export interface GenerateReplayPanelProps {
  resource: GenerateReplayButtonProps["resource"];
  open: boolean;
  /** 面板锚点：`···` 按钮，或者独立的回放按钮。 */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

/** 选范围 → 生成 → 打开播放层。开关由调用方管；选过的范围在两次打开之间保留（与原来一致）。 */
export function GenerateReplayPanel({
  resource,
  open,
  anchorRef,
  onClose,
}: GenerateReplayPanelProps) {
  const tt = useUI();
  const [choice, setChoice] = useState<ReplayRangeChoice>("today");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    const range = replayRangeFor(choice, new Date(), custom);
    if (!range) {
      setError(tt("请选好开始和结束时间，开始要早于结束。"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createWorkReplay({
      scope: "personal",
      sources: [{ key: `artifact:${resource.id}` }],
      title: resource.title ? tt("{title}的工作回放", { title: resource.title }) : undefined,
      ...range,
    });
    setBusy(false);
    if (result.ok && result.data) {
      onClose();
      openWorkReplay(result.data.replay.id);
    } else if (result.status === 422) {
      setError(tt("这段时间里这个作品没有可以回放的记录。"));
    } else if (result.status === 429) {
      setError(tt("今天生成的回放已经到上限了，明天再试。"));
    } else {
      setError(tt("没有生成成功，请再试一次。"));
    }
  };

  return (
    <AnchoredPopover
      open={open}
      anchorRef={anchorRef}
      onClose={onClose}
      role="dialog"
      ariaLabel={tt("生成回放")}
      align="end"
      lockScroll={false}
      initialFocusSelector="[data-replay-range]:checked"
      attributes={{ "data-generate-replay-panel": true }}
      className="z-[2147483550] w-64 space-y-2 rounded-xl border border-[var(--awb-border,var(--border,#e7e5e4))] bg-[var(--awb-popover-bg,var(--card,#ffffff))] p-3 text-[13px] text-[var(--awb-text,var(--fg,#292524))] shadow-2xl"
    >
      <p className="text-[var(--awb-muted,var(--muted,#78716c))]">
        {tt("从平时的编辑记录里生成一段快进回放，不需要提前录制。")}
      </p>
      {(["today", "week", "custom"] as const).map((key) => (
        <label key={key} className="flex items-center gap-2">
          <input
            type="radio"
            name="replay-range"
            data-replay-range={key}
            checked={choice === key}
            onChange={() => setChoice(key)}
            className="accent-[var(--awb-accent,var(--accent,#7c3aed))]"
          />
          {key === "today" ? tt("今天") : key === "week" ? tt("最近 7 天") : tt("自定义")}
        </label>
      ))}
      {choice === "custom" ? (
        <div className="space-y-1">
          <input
            type="datetime-local"
            data-replay-custom-from
            value={custom.from}
            onChange={(event) => setCustom((value) => ({ ...value, from: event.target.value }))}
            className={INPUT_CLASS}
          />
          <input
            type="datetime-local"
            data-replay-custom-to
            value={custom.to}
            onChange={(event) => setCustom((value) => ({ ...value, to: event.target.value }))}
            className={INPUT_CLASS}
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-[12px] text-[var(--awb-danger,var(--danger,#dc2626))]">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {tt("取消")}
        </Button>
        <Button
          variant="primary"
          data-replay-generate
          loading={busy}
          loadingLabel={tt("正在生成…")}
          onClick={() => void generate()}
        >
          {tt("生成")}
        </Button>
      </div>
    </AnchoredPopover>
  );
}

export function GenerateReplayButton({
  resource,
  iconOnly = false,
}: GenerateReplayButtonProps) {
  const tt = useUI();
  const enabled = useImEnabled();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  if (!enabled) return null;

  const label = tt("生成回放");
  return (
    <span className="relative inline-block">
      {iconOnly ? (
        <IconButton
          ref={anchorRef}
          data-generate-replay
          label={label}
          icon={<AdvancedEditorIcon name="history" className="h-4 w-4" />}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((value) => !value)}
        />
      ) : (
        <Button
          ref={anchorRef}
          variant="ghost"
          data-generate-replay
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((value) => !value)}
        >
          {label}
        </Button>
      )}
      <GenerateReplayPanel
        resource={resource}
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
      />
    </span>
  );
}
