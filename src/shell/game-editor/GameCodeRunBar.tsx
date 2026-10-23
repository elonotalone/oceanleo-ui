"use client";

/**
 * 游戏 Code 页的运行条：运行 / 停止 / 重载 + 参数滑块。
 *
 * 2026-10-23 编辑器整改（W15）[实测]：Code 是 aux 页，外壳在 aux 页不画编辑栏
 * （`editBarVisibleOnPage` 只认 artifact 页），而这几只按钮以前放在 adapter.toolbox
 * 里——只能从编辑栏空态的抽屉按钮打开，于是在 Code 页上根本点不到。现在它们直接住在
 * 代码舞台顶上。颜色全走 `--awb-*` 主题 token。
 */
import type { ReactNode } from "react";
import type { GameParamDeclaration } from "./game-source";

export type GameRunControl = "run" | "stop" | "reload";

export interface GameCodeRunBarProps {
  tt: (key: string, vars?: Record<string, string | number>) => string;
  onControl: (action: GameRunControl) => void;
  paused: boolean;
  params: ReadonlyArray<readonly [string, GameParamDeclaration]>;
  values: Record<string, number>;
  onParam: (name: string, value: number) => void;
}

const SECONDARY =
  "rounded-md border border-[var(--awb-border)] bg-[var(--awb-chrome-bg)] px-2.5 py-1 text-xs text-[var(--awb-text)] hover:bg-[var(--awb-hover)]";

export function GameCodeRunBar(props: GameCodeRunBarProps): ReactNode {
  const { tt } = props;
  return (
    <div
      data-testid="game-run-bar"
      className="flex flex-wrap items-center gap-2 border-b border-[var(--awb-border)] bg-[var(--awb-chrome-bg)] px-3 py-1.5"
    >
      <button
        type="button"
        data-testid="game-run"
        onClick={() => props.onControl("run")}
        className="rounded-md bg-[var(--awb-accent)] px-2.5 py-1 text-xs font-medium text-[var(--awb-on-accent)]"
      >
        {tt("运行")}
      </button>
      <button
        type="button"
        data-testid="game-stop"
        aria-pressed={props.paused}
        onClick={() => props.onControl("stop")}
        className={SECONDARY}
      >
        {tt("停止")}
      </button>
      <button
        type="button"
        data-testid="game-reload"
        onClick={() => props.onControl("reload")}
        className={SECONDARY}
      >
        {tt("重载")}
      </button>
      {props.paused ? (
        <span role="status" className="text-xs text-[var(--awb-muted)]">
          {tt("试玩已停止，点「运行」继续")}
        </span>
      ) : null}
      {props.params.length > 0 ? (
        <div
          data-testid="game-param-panel"
          className="ml-auto flex flex-wrap items-center gap-3"
        >
          {props.params.map(([name, declaration]) => (
            <label
              key={name}
              className="flex items-center gap-2 text-xs text-[var(--awb-muted)]"
            >
              <span className="max-w-20 truncate">{declaration.label}</span>
              <input
                type="range"
                data-testid={`game-param-${name}`}
                min={declaration.min}
                max={declaration.max}
                step={declaration.step}
                value={props.values[name] ?? declaration.default}
                onChange={(event) =>
                  props.onParam(name, Number(event.target.value))
                }
                className="accent-[var(--awb-accent)]"
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
