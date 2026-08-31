/**
 * 动效原语的唯一入口。手势点从这里 import，不直接 import `./spring`。
 * 允许 import 本目录的文件清单见 `docs/architecture/motion-system.md`
 * §手势点清单，由 `tests/motion-spring-ownership.test.mjs` 判红。
 *
 * 这一层与 `./spring` 的分工：`./spring` 是**不碰 DOM** 的纯积分器，
 * 挂 `window` 的测试钩子只能在这里做（它必须读 `document` 上的标记属性）。
 */

export {
  createSpring,
  createSpring2D,
  jumpAllSpringsToRest,
  type Spring2DValue,
  type SpringConfig,
  type SpringValue,
} from "./spring";
export {
  createPointerVelocityTracker,
  type PointerVelocityTracker,
} from "./pointer-velocity";

import { jumpAllSpringsToRest } from "./spring";

declare global {
  interface Window {
    /**
     * 把全场弹簧推到终态。`W10` 的离线视觉回归闸在截图前调用它——
     * Playwright 的 `animations: 'disabled'` 只关 CSS 动画与过渡，
     * 不停 JS 驱动的 rAF 弹簧，缺了这个钩子那道闸就是假阳性工厂。
     */
    __leoMotionJumpAllToRest?: () => void;
  }
}

/**
 * 规范二实现约束 6：非 production，或页面显式打了 `data-leo-motion-test`
 * 标记时才挂。生产站点默认拿不到这个钩子，所以它不是一个可被外部脚本
 * 利用的开关。
 */
function motionTestHookAllowed(): boolean {
  const env = globalThis.process?.env?.NODE_ENV;
  if (env !== "production") return true;
  if (typeof document === "undefined") return false;
  return document.documentElement?.hasAttribute("data-leo-motion-test") === true;
}

if (typeof window !== "undefined" && motionTestHookAllowed()) {
  window.__leoMotionJumpAllToRest = jumpAllSpringsToRest;
}
