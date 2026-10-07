// 消息悬浮版面的几何（纯函数）：圆角、贴底变矮、拖拽阈值与编辑栏相同。
// 消费站的 Tailwind 扫不到共享包任意值，层级数字也从这里交给行内 style。

export const DRAG_START_PX = 4;
export const DRAG_START_TOUCH_PX = 8;
export const MESSAGES_HEADER_HEIGHT_PX = 48;
export const MESSAGES_OVERLAY_RADIUS_PX = 16;
/** 低于共用 Modal/ConfirmDialog 的 z-[1000]，高于首页输入框的 z-30。 */
export const MESSAGES_OVERLAY_Z = 999;
export const MESSAGES_VIEWPORT_MARGIN_PX = 12;
export const MESSAGES_DEFAULT_HEIGHT_PX = 640;
/** 与 AppShell 展开侧栏同宽；浮层默认贴在侧栏右边、靠下，从铃铛这一侧长出来。 */
export const MESSAGES_SIDEBAR_EXPANDED_PX = 256;

export function dragStartThreshold(pointerType: string): number {
  return pointerType === "touch" ? DRAG_START_TOUCH_PX : DRAG_START_PX;
}

export interface OverlayOffset {
  x: number;
  y: number;
}

export interface OverlayViewport {
  width: number;
  height: number;
}

export interface OverlayBox {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
}

/** 默认贴在侧栏右边、靠下，四边留缝，四角圆角都落在视口里。 */
export function defaultOverlayOffset(viewport: OverlayViewport, width: number): OverlayOffset {
  const margin = MESSAGES_VIEWPORT_MARGIN_PX;
  const maxLeft = Math.max(margin, viewport.width - margin - width);
  const x = Math.min(MESSAGES_SIDEBAR_EXPANDED_PX + margin, maxLeft);
  const height = Math.min(MESSAGES_DEFAULT_HEIGHT_PX, Math.max(0, viewport.height - margin * 2));
  const y = Math.max(margin, viewport.height - margin - height);
  return { x, y };
}

export function overlayBox(input: {
  offset: OverlayOffset;
  width: number;
  preferredHeight: number;
  viewport: OverlayViewport;
  expanded?: boolean;
}): OverlayBox {
  const { viewport } = input;
  const margin = MESSAGES_VIEWPORT_MARGIN_PX;
  const radius = MESSAGES_OVERLAY_RADIUS_PX;

  if (input.expanded) {
    return {
      left: margin,
      top: margin,
      width: Math.max(0, viewport.width - margin * 2),
      height: Math.max(0, viewport.height - margin * 2),
      radius,
    };
  }

  const maxWidth = Math.max(0, viewport.width - margin * 2);
  const width = Math.min(input.width, maxWidth);
  const maxLeft = Math.max(margin, viewport.width - margin - width);
  const left = Math.min(Math.max(margin, Math.round(input.offset.x)), maxLeft);

  const maxTop = Math.max(margin, viewport.height - margin - MESSAGES_HEADER_HEIGHT_PX);
  const top = Math.min(Math.max(margin, Math.round(input.offset.y)), maxTop);
  const available = viewport.height - top - margin;
  const height = Math.max(MESSAGES_HEADER_HEIGHT_PX, Math.min(input.preferredHeight, available));

  return { left, top, width, height, radius };
}
