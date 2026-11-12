"use client";

/** Compatibility registration for consumer play panels. New project editors use the
 * server's /play URL with the same opaque sandbox, never an inline document. */
import { useEffect, useState, type ComponentType } from "react";

/** 宿主桥仍保留旧的二值类型，但新载体只会交出 `html`。 */
export type GameBundleFormat = "html" | "js";

export interface GamePreviewHostProps {
  artifactId: string;
  revisionId: string;
  title: string;
  onRuntimeError?: (message: string) => void;
  reloadKey?: number;
  paused?: boolean;
  /** Deprecated transport hints, accepted only for consumer compatibility. */
  envelopeUrl?: string;
  source?: string;
  bundleFormat?: GameBundleFormat;
  engineApiVersion?: string;
  paramDeclarations?: Record<string, unknown>;
  paramValues?: Record<string, number>;
}

export type GamePreviewHost = ComponentType<GamePreviewHostProps>;

let gamePreviewHost: GamePreviewHost | null = null;
const gamePreviewHostListeners = new Set<() => void>();

/** 由宿主站（game 仓）在模块初始化时注册 `UgcGameFrame` 的包装件。 */
export function registerGamePreviewHost(host: GamePreviewHost | null): void {
  gamePreviewHost = host;
  for (const listener of [...gamePreviewHostListeners]) listener();
}

export function useGamePreviewHost(): GamePreviewHost | null {
  const [host, setHost] = useState<GamePreviewHost | null>(
    () => gamePreviewHost,
  );
  useEffect(() => {
    // 宿主本身是个函数组件，直接 `setHost(host)` 会被 setState 当成 updater
    // 调用掉：组件在 render 里被执行，它的 hooks 就串进本组件的序列
    // （"Should have a queue"）。两层箭头是必须的，不是多余的包装。
    const onChange = () => setHost(() => gamePreviewHost);
    gamePreviewHostListeners.add(onChange);
    onChange();
    return () => {
      gamePreviewHostListeners.delete(onChange);
    };
  }, []);
  return host;
}
