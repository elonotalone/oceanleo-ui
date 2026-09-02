"use client";

// 统一插件外壳（`PluginChromeFrame`）的 edit bar 手势层。
//
// ── 它为什么存在（W31，2026-08-31）──────────────────────────────────────
//
// 操作员对编辑栏提过三条：「双击 edit bar 任何位置都能拖拽」「点击后缩为一个
// 圆形，再点击展开」「缩小版也可以拖拽到各个位置」。这三条在走
// `InlineAdvancedWorkbenchShell` 的 10 件插件上成立，在走 `PluginChromeFrame`
// 的三件 extracted 插件（设计画布 / 网站编辑 / 视频画布）上**一条都不成立**
// ——`V1` 实测：那三个包对 `useEditBarDockController` / `FloatingContextToolbar`
// 零命中，chrome 的 edit bar 是版式契约里一行静态 DOM，不是可拖拽浮层
// （`verdicts/V1-verdict.md` A1-缺口）。
//
// ── 它为什么长这个样子（绕开约束，而不是无视约束）────────────────────
//
// `signals/W22-chrome-contract.md` §5/§9 把 `contextBarLeading/Trailing`
// **刻意**写死成 `undefined`，理由是「chrome 没有浮动上下文条这个概念，
// 版式契约把它固化进 edit bar 行了」。那条约束是对的，不该推翻：
// `SelectionToolbar` 一旦在槽内拿到 `AdvancedLayout`，会同时长出第二个 AI 键、
// 被强制翻成 floating 胶囊、把选区检查器改道左抽屉（契约 §4-3 记的三条副作用）。
//
// 所以这一层**不碰那两个槽**，走的是另一条路：把 chrome 那一行原封不动地
// 交给共享的 `FloatingContextToolbar` 当内容，行本身降级成停靠带——
// 与 10 件插件那侧 `EditBarDockHost` + 浮层的分工逐字相同。
// 槽内 `AdvancedLayout` 仍是 `null`，契约 §4-3 的三条副作用一条都不会发生。
//
// ── 一条刻意的降级（按活宿主，不按控制器快照）────────────────────────
//
// 还没有可挂的宿主元素时（首帧、SSR、宿主尚未挂上），这一层把内容原样留在
// 行里，与接手势之前逐字相同。契约 §9 承诺 AI 键恒在 edit bar 右段，
// 「浮层没起来 ⇒ AI 键消失」会让那条承诺变成看运气。宁可没有手势，
// 不可没有 AI 键。
//
// 宿主元素一旦出现——包括控制器的 `portalRoot` 仍是 null、但 frame 根 /
// 停靠行 / 舞台的 ref 已经挂上——必须立刻补装浮层。早先用
// `if (!controller.portalRoot) return children` 一刀切，三个 embed 类插件
// 的栏会永远停在行里拖不动：控制器只在 ref 对象身份变化时抄一次 portalRoot，
// 元素晚一拍挂上就再也抄不到。

import {
  useLayoutEffect,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  FloatingContextToolbar,
  type FloatingContextToolbarController,
} from "./FloatingContextToolbar";
import {
  readEditBarPortalHost,
  resolveEditBarGestureSurface,
} from "./edit-bar-dock-state";
import type { PluginThemeMode } from "./plugin-theme";

export interface PluginChromeEditBarGestureBridge {
  /** 挂 frame 根：浮层的 portal 宿主，也是浮层坐标的原点。 */
  layerRef: RefObject<HTMLDivElement | null>;
  /** 挂舞台：默认停放位置与可见边界都按它算。 */
  stageRef: RefObject<HTMLDivElement | null>;
  /** 挂 edit bar 行：这一行就是停靠带，甩回来会重新吸附进去。 */
  dockRef: RefObject<HTMLDivElement | null>;
  controller: FloatingContextToolbarController;
}

const HOST_RETRY_FRAMES = 120;

function readBridgeHost(
  bridge: PluginChromeEditBarGestureBridge,
): HTMLElement | null {
  return readEditBarPortalHost({
    liveHost: bridge.layerRef.current,
    dockHost: bridge.dockRef.current,
    stageHost: bridge.stageRef.current,
    controllerPortalRoot: bridge.controller.portalRoot,
  });
}

export function PluginChromeEditBarGestureLayer({
  bridge,
  accent,
  theme,
  children,
}: {
  bridge: PluginChromeEditBarGestureBridge;
  accent: string;
  theme: PluginThemeMode | null;
  children: ReactNode;
}) {
  const { controller } = bridge;
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  // 无依赖数组是刻意的：每次 commit 都从活 ref 再读一遍宿主。控制器的
  // `portalRoot` 是快照，ref.current 在第一帧 layout 之后才有，两者会错开。
  useLayoutEffect(() => {
    let raf = 0;
    let frames = 0;
    const sync = () => {
      const next = readBridgeHost(bridge);
      setPortalHost((prev) => (prev === next ? prev : next));
      return Boolean(next);
    };
    if (sync()) return undefined;
    const tick = () => {
      if (sync() || frames++ > HOST_RETRY_FRAMES) return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const observer =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            if (sync()) observer?.disconnect();
          });
    if (typeof document !== "undefined" && document.documentElement) {
      observer?.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  });

  const surface = resolveEditBarGestureSurface(portalHost);
  if (surface.kind === "inline") return <>{children}</>;
  return (
    <FloatingContextToolbar
      controller={{ ...controller, portalRoot: surface.portalRoot }}
      accent={accent}
      theme={theme}
    >
      {children}
    </FloatingContextToolbar>
  );
}
