// ============================================================================
// @oceanleo/ui — leo 面板定位（纯函数，合同 §2.1 / W5A P2）
// ----------------------------------------------------------------------------
// 规则（任务书字面）：
//   · 紧凑态 384 × min(560, 视口高 − 24)；
//   · 有锚点（入口按钮的视口矩形）：面板底边 = anchor.top − 8，右边 = anchor.right，
//     越界夹紧——面板从按钮上方弹出，永不盖住发送键；
//   · 用户拖过（dragged 有值）：一律用拖拽位置（夹紧）；
//   · 放大态：94vw × 90vh 居中；
//   · 无锚点无拖拽：右下角默认位（边距 20）。
// ============================================================================

/** 入口按钮（或划词矩形）的视口位置。结构兼容 DOMRect。 */
export interface LeoPanelAnchor {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface LeoPanelViewport {
  width: number;
  height: number;
}

/** 用户拖拽后的左上角。 */
export interface LeoPanelDragged {
  left: number;
  top: number;
}

export interface LeoPanelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LeoPanelBoxInput {
  anchor?: LeoPanelAnchor | null;
  viewport: LeoPanelViewport;
  dragged?: LeoPanelDragged | null;
  expanded?: boolean;
}

export const LEO_PANEL_WIDTH = 384;
export const LEO_PANEL_MAX_HEIGHT = 560;
/** 面板与视口四边的最小间距（越界夹紧用）。 */
export const LEO_PANEL_VIEWPORT_MARGIN = 8;
/** 面板底边与锚点顶边的间距——「底边在输入框上方 8px」。 */
export const LEO_PANEL_ANCHOR_GAP = 8;
/** 无锚点时的右下角默认边距。 */
export const LEO_PANEL_DEFAULT_MARGIN = 20;
/** 放大态宽高占视口比例（94vw × 90vh，居中）。 */
export const LEO_PANEL_EXPANDED_WIDTH_RATIO = 0.94;
export const LEO_PANEL_EXPANDED_HEIGHT_RATIO = 0.9;

/** 紧凑态尺寸：384 × min(560, vh − 24)，窄视口再夹进左右边距。 */
export function leoPanelCompactSize(viewport: LeoPanelViewport): {
  width: number;
  height: number;
} {
  const width = Math.min(
    LEO_PANEL_WIDTH,
    Math.max(0, viewport.width - LEO_PANEL_VIEWPORT_MARGIN * 2),
  );
  const height = Math.min(
    LEO_PANEL_MAX_HEIGHT,
    Math.max(0, viewport.height - 24),
  );
  return { width, height };
}

function clampBox(
  left: number,
  top: number,
  size: { width: number; height: number },
  viewport: LeoPanelViewport,
): LeoPanelBox {
  const maxLeft = Math.max(
    LEO_PANEL_VIEWPORT_MARGIN,
    viewport.width - LEO_PANEL_VIEWPORT_MARGIN - size.width,
  );
  const maxTop = Math.max(
    LEO_PANEL_VIEWPORT_MARGIN,
    viewport.height - LEO_PANEL_VIEWPORT_MARGIN - size.height,
  );
  return {
    left: Math.min(Math.max(LEO_PANEL_VIEWPORT_MARGIN, Math.round(left)), maxLeft),
    top: Math.min(Math.max(LEO_PANEL_VIEWPORT_MARGIN, Math.round(top)), maxTop),
    width: size.width,
    height: size.height,
  };
}

/** 面板唯一的定位入口。优先级：放大 > 拖拽 > 锚点 > 右下角默认。 */
export function panelBox({
  anchor = null,
  viewport,
  dragged = null,
  expanded = false,
}: LeoPanelBoxInput): LeoPanelBox {
  if (expanded) {
    const width = Math.round(viewport.width * LEO_PANEL_EXPANDED_WIDTH_RATIO);
    const height = Math.round(viewport.height * LEO_PANEL_EXPANDED_HEIGHT_RATIO);
    return {
      left: Math.round((viewport.width - width) / 2),
      top: Math.round((viewport.height - height) / 2),
      width,
      height,
    };
  }
  const size = leoPanelCompactSize(viewport);
  if (dragged) return clampBox(dragged.left, dragged.top, size, viewport);
  if (anchor) {
    return clampBox(
      anchor.right - size.width,
      anchor.top - LEO_PANEL_ANCHOR_GAP - size.height,
      size,
      viewport,
    );
  }
  return clampBox(
    viewport.width - LEO_PANEL_DEFAULT_MARGIN - size.width,
    viewport.height - LEO_PANEL_DEFAULT_MARGIN - size.height,
    size,
    viewport,
  );
}
