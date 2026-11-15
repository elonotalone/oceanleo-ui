"use client";

/** Host registration for read-only Library, feed and marketplace game play. */
import { useEffect, useState, type ComponentType } from "react";

export interface GamePreviewHostProps {
  artifactId: string;
  revisionId: string;
  title: string;
  onRuntimeError?: (message: string) => void;
  reloadKey?: number;
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
