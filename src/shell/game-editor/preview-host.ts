"use client";

/**
 * 沙箱预览容器的注入槽位。
 *
 * ## 为什么共享包永远不自己渲染游戏 iframe
 *
 * sandbox 属性、沙箱子域（`s-<32hex>.oceanleo.app`，命名空间 C）、`postMessage`
 * 双向 origin 校验全部是**宿主站**的职责。共享包一旦自己渲染，这三样就会漂移到
 * 36 个 consumer 各自的构建里，域隔离方案随之失效。所以这里只有一个槽位，
 * 真身由 game 仓在启动路径上注册（`app/_console/UgcHostBridge.tsx`）。
 *
 * ## 这个文件为什么从 `GameRoute.tsx` 里搬出来
 *
 * 双核之后 `legacy`（prompt 迭代面）与 `next`（代码编辑面）两个分支都要读这个槽位，
 * 而 `next` 是 `dynamic()` 懒加载的叶子。槽位留在 `GameRoute.tsx` 里，叶子就得反过来
 * import 路由，形成一条只在运行时才解开的环。搬到这里之后**只有一个模块实例持有槽位**，
 * `GameRoute.tsx` 原样 re-export 出去，`src/shell/index.ts` 的公开导出面**一个字不用改**
 * （那个文件不是我的面）。
 */

import { useEffect, useState, type ComponentType } from "react";

/** 宿主桥仍保留旧的二值类型，但新载体只会交出 `html`。 */
export type GameBundleFormat = "html" | "js";

export interface GamePreviewHostProps {
  artifactId: string;
  revisionId: string;
  /**
   * `oceanleo.game-document.v1` 信封的签名 URL（`full` rendition，application/json）。
   * 宿主必须让沙箱域去取它并在那边装载完整文档，**不得**塞进 iframe 的 `srcdoc`
   * —— `srcdoc` 文档继承父页面 origin，会让整个域隔离方案失效。
   */
  envelopeUrl: string;
  bundleFormat: GameBundleFormat;
  engineApiVersion: string;
  title: string;
  /** 沙箱回报的运行时错误，用于把「生成的东西跑不起来」显式暴露给用户。 */
  onRuntimeError?: (message: string) => void;

  // ── 以下四项是 W14 为代码编辑面新增的，**全部可选** ──────────────────────
  //
  // 可选是硬要求而不是客气：game 仓今天注册进来的 `SandboxPreviewHost` 只认上面
  // 那六项。新增项若是必填，共享包一 bump，宿主站当场类型不过、预览整个打不开。

  /**
   * 暂停。对应沙箱 `lifecycle` 的 `paused`，走 MessagePort，**不重载 iframe**。
   * 「停止」在产品上就是这个 —— 真把 iframe 拆掉再挂回来是「重载」。
   */
  paused?: boolean;
  /**
   * 重载键。**变一次就重挂一次 iframe**（换一个新的一次性通道），
   * 用于「重载」按钮与「刚保存了新一版」这两种场合。
   */
  reloadKey?: number;
  /**
   * 这一版声明的可调参数（3–6 项）。声明来自**产物本身**，不由沙箱运行期上报——
   * 沙箱里跑的是用户代码，它说有几个滑块不算数。
   */
  paramDeclarations?: Record<string, unknown>;
  /** 参数当前取值。变化时走 MessagePort 投进沙箱，游戏不重启。 */
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
