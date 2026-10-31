// 输入框最高多高（2026-10-31 晚 W7）：按视口高度的比例封顶，再高就在框内滚动。
// 参考 Manus 任务页（operator 截图 20261031T085855Z）：文字区最多约占视口的 30%
// （约 9 行），我们以前固定 280px，矮屏上能占半屏（截图 …085903Z）。
// `cap` 仍是绝对上限（宿主传的 maxHeight），比例只会让它更矮，不会更高。
import { useEffect, useState } from "react";

/** 文字区最多占视口高度的比例。 */
export const COMPOSER_VIEWPORT_SHARE = 0.3;
/** 再矮的视口也至少给这么高（约 5 行），否则打字看不见上下文。 */
export const COMPOSER_MIN_MAX_HEIGHT = 120;

export function composerMaxHeight(cap: number, viewportHeight: number | null | undefined): number {
  if (!viewportHeight || viewportHeight <= 0 || !Number.isFinite(viewportHeight)) return cap;
  const share = Math.round(viewportHeight * COMPOSER_VIEWPORT_SHARE);
  return Math.min(cap, Math.max(COMPOSER_MIN_MAX_HEIGHT, share));
}

function viewportHeight(): number | null {
  if (typeof window === "undefined") return null;
  return window.innerHeight || null;
}

/** `composerMaxHeight` 跟着窗口大小走。 */
export function useComposerMaxHeight(cap: number): number {
  const [height, setHeight] = useState<number | null>(viewportHeight);
  useEffect(() => {
    const update = () => setHeight(viewportHeight());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return composerMaxHeight(cap, height);
}
