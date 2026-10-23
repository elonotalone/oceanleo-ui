"use client";

/**
 * 游戏「编辑」页的「玩法」抽屉：描述这一轮的玩法改动 → 迭代；版本列表；结果提示。
 *
 * 2026-10-23 编辑器整改（W15）：
 * - 结果提示（成功 / 失败）以前只进 `adapter.status`，编辑页上没有任何地方显示它——
 *   「迭代这一版」失败时用户什么都看不到。现在提示就住在按钮下面（失败 role=alert）。
 * - 颜色全部走 `--awb-*` 主题 token，不写浅色回退；浅色站点下就是浅色面板。
 * - 文案经 `tt`（由路由传入，便于测试桩替换）。
 */
import type { ReactNode } from "react";

export interface GamePlayVersion {
  key: string;
  prompt: string;
}

export interface GamePlayPanelProps {
  tt: (key: string, vars?: Record<string, string | number>) => string;
  prompt: string;
  onPromptChange: (next: string) => void;
  onIterate: () => void;
  busy: boolean;
  /** 已有可玩产物：按钮写「迭代这一版」，否则「生成第一版」。 */
  hasDocument: boolean;
  /** 不能迭代的原因已由外层判定（只读、源码载入失败）。 */
  blocked: boolean;
  viewOnlyMessage?: string;
  error: string;
  notice: string;
  versions: readonly GamePlayVersion[];
  cursor: number;
  onSelectVersion: (index: number) => void;
}

export const GAME_PLAY_PANEL_TESTID = "game-play-panel";

export function GamePlayPanel(props: GamePlayPanelProps): ReactNode {
  const { tt } = props;
  return (
    <div data-testid={GAME_PLAY_PANEL_TESTID} className="flex flex-col gap-3 p-3">
      <label
        className="text-xs font-medium text-[var(--awb-muted)]"
        htmlFor="game-prompt"
      >
        {tt("描述这一轮想要的玩法改动")}
      </label>
      <textarea
        id="game-prompt"
        value={props.prompt}
        onChange={(event) => props.onPromptChange(event.target.value)}
        rows={6}
        disabled={props.busy}
        placeholder={tt("例：加入二段跳，被击中三次后结束并显示得分。")}
        className="w-full resize-y rounded-lg border border-[var(--awb-border)] bg-[var(--awb-chrome-bg)] p-2 text-sm text-[var(--awb-text)] placeholder:text-[var(--awb-muted)] outline-none focus:border-[var(--awb-accent)]"
      />
      <button
        type="button"
        onClick={props.onIterate}
        disabled={props.busy || props.blocked || !props.prompt.trim()}
        className="rounded-lg bg-[var(--awb-accent)] px-3 py-2 text-sm font-medium text-[var(--awb-on-accent)] disabled:opacity-50"
      >
        {props.busy
          ? tt("生成中…")
          : props.hasDocument
            ? tt("迭代这一版")
            : tt("生成第一版")}
      </button>
      {props.error ? (
        <p
          role="alert"
          data-testid="game-play-error"
          className="rounded-md bg-[var(--awb-danger-soft)] px-2 py-1.5 text-xs leading-5 text-[var(--awb-danger)]"
        >
          {props.error}
        </p>
      ) : props.notice ? (
        <p
          role="status"
          data-testid="game-play-notice"
          className="rounded-md bg-[var(--awb-accent-soft)] px-2 py-1.5 text-xs leading-5 text-[var(--awb-text)]"
        >
          {props.notice}
        </p>
      ) : null}
      {props.viewOnlyMessage ? (
        <p role="status" className="text-xs text-[var(--awb-muted)]">
          {props.viewOnlyMessage}
        </p>
      ) : null}
      {props.versions.length > 0 ? (
        <ol className="flex flex-col gap-1 text-xs text-[var(--awb-muted)]">
          {props.versions.map((entry, index) => (
            <li key={entry.key}>
              <button
                type="button"
                onClick={() => props.onSelectVersion(index)}
                disabled={props.busy}
                aria-current={index === props.cursor ? "true" : undefined}
                className={`w-full truncate rounded px-2 py-1 text-left ${
                  index === props.cursor
                    ? "bg-[var(--awb-accent-soft)] text-[var(--awb-accent)]"
                    : "hover:bg-[var(--awb-hover)]"
                }`}
              >
                {`v${index + 1} · ${entry.prompt || tt("初始版本")}`}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
