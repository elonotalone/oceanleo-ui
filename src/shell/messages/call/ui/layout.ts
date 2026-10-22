// 通话界面（W07）的版面纯函数与常量：小窗格子、放大视图分页与宫格形状、角落吸附、时长、共享提示、独处倒计时。
// 排序与换位不在这里——那是 W05 引擎 ordering 的事（合同 §3.1）；这里只把引擎给的 order / visibleIds 原样摆上去。
// 本文件不碰 DOM、不读时钟（时间一律由参数传入），tests/call-ui-*.test.mjs 直接跑。
import type { CallParticipantView, CallSnapshot } from "../engine";

/** 合同 §3.1：小窗最多 4 格；放大视图每页 9 格，窄屏（手机浏览器）每页 4 格。 */
export const DOCK_TILES = 4;
export const STAGE_PAGE = 9;
export const STAGE_PAGE_NARROW = 4;
/** 有人共享屏幕时，人像侧栏每页的格数。 */
export const STAGE_RAIL_PAGE = 4;
/** 合同 §3.1 `ALONE_COUNTDOWN=60s`：倒计时条按它画进度。 */
export const ALONE_COUNTDOWN_SECONDS = 60;

/** 窄屏判定：手机浏览器。小窗变成底部条，放大视图每页 4 格。 */
export const NARROW_MEDIA_QUERY = "(max-width: 640px)";

/**
 * 层级（数字走行内 style，不新增 Tailwind 任意值类）：
 * 消息浮层 999、共用 Modal/ConfirmDialog 1000 < 小窗 1050 < 放大视图 1100 < 通话菜单 1150 < 举报框 1200（ReportDialog 自带）。
 * 小窗压在消息浮层与普通对话框上面：通话控制在任何页面、任何浮层下都要够得着。
 */
export const CALL_DOCK_Z = 1050;
export const CALL_STAGE_Z = 1100;
export const CALL_MENU_Z = 1150;

export const DOCK_WIDTH_PX = 320;
export const DOCK_MARGIN_PX = 16;
export const DOCK_TILE_PX = 58;

export type DockCorner = "bottom-left" | "bottom-right" | "top-left" | "top-right";
export const DOCK_CORNERS: readonly DockCorner[] = ["bottom-left", "bottom-right", "top-left", "top-right"];
/** 操作员定：小窗固定在左下角（可拖到另外三个角，记住位置）。 */
export const DEFAULT_DOCK_CORNER: DockCorner = "bottom-left";

export function isDockCorner(value: unknown): value is DockCorner {
  return typeof value === "string" && (DOCK_CORNERS as readonly string[]).includes(value);
}

/** 拖动松手时小窗中心落在视口哪个象限，就吸到哪个角。 */
export function nearestCorner(centerX: number, centerY: number, viewport: { width: number; height: number }): DockCorner {
  const vertical = centerY < viewport.height / 2 ? "top" : "bottom";
  const horizontal = centerX < viewport.width / 2 ? "left" : "right";
  return `${vertical}-${horizontal}` as DockCorner;
}

/** 固定侧栏占掉的左右宽度（AppShell 的侧栏是 fixed，左下角是账户区，小窗要让开）。 */
export interface SideInsets {
  left: number;
  right: number;
}

export const NO_INSETS: SideInsets = { left: 0, right: 0 };

/** 小窗贴角的 fixed 定位：贴侧栏那一侧时让出侧栏宽度。 */
export function dockPlacement(
  corner: DockCorner,
  insets: SideInsets = NO_INSETS,
  margin: number = DOCK_MARGIN_PX,
): { left?: number; right?: number; top?: number; bottom?: number } {
  const top = corner.startsWith("top");
  const left = corner.endsWith("left");
  return {
    ...(top ? { top: margin } : { bottom: margin }),
    ...(left ? { left: Math.max(0, insets.left) + margin } : { right: Math.max(0, insets.right) + margin }),
  };
}

/** 侧栏量出来的矩形 → 让位宽度。贴左边就让左边，贴右边（RTL）就让右边，都不贴就不让。 */
export function insetsFromSidebarRect(rect: { left: number; right: number; width: number } | null, viewportWidth: number): SideInsets {
  if (!rect || rect.width <= 0) return NO_INSETS;
  if (rect.left <= 1) return { left: Math.round(rect.right), right: 0 };
  if (rect.right >= viewportWidth - 1) return { left: 0, right: Math.round(viewportWidth - rect.left) };
  return NO_INSETS;
}

/** 通话时长：不到一小时 `m:ss`，否则 `h:mm:ss`；开始时间缺失或非法给空串（界面就不显示）。 */
export function formatCallDuration(startedAt: string | null, now: number): string {
  if (!startedAt) return "";
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return "";
  const total = Math.max(0, Math.floor((now - start) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

function participantsById(participants: readonly CallParticipantView[]): Map<string, CallParticipantView> {
  return new Map(participants.map((participant) => [participant.participantId, participant]));
}

function knownUnique(ids: readonly string[], byId: Map<string, CallParticipantView>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * 小窗的格子：**原样**按引擎的 `visibleIds` 摆（换位规则在引擎里，说话只亮不挪），最多 4 格；
 * 引擎还没给 `visibleIds` 时按 `order` 取前 4，再不行按名单。
 * 「+N」= 在场人数 − 摆出来的格数（与界面上看到的一致，不另信别的计数）。
 */
export function dockTiles(snapshot: Pick<CallSnapshot, "participants" | "order" | "visibleIds">): {
  tiles: CallParticipantView[];
  overflow: number;
} {
  const byId = participantsById(snapshot.participants);
  let ids = knownUnique(snapshot.visibleIds, byId);
  if (!ids.length) ids = knownUnique(snapshot.order, byId);
  if (!ids.length) ids = knownUnique(snapshot.participants.map((participant) => participant.participantId), byId);
  ids = ids.slice(0, DOCK_TILES);
  return {
    tiles: ids.map((id) => byId.get(id) as CallParticipantView),
    overflow: Math.max(0, snapshot.participants.length - ids.length),
  };
}

/** 放大视图的完整顺序：引擎的 `order`（入场顺序、自己第一），名单里有但 `order` 漏掉的人补在最后。 */
export function stageOrder(snapshot: Pick<CallSnapshot, "participants" | "order">): CallParticipantView[] {
  const byId = participantsById(snapshot.participants);
  const ids = knownUnique(snapshot.order, byId);
  const listed = new Set(ids);
  for (const participant of snapshot.participants) {
    if (!listed.has(participant.participantId)) {
      listed.add(participant.participantId);
      ids.push(participant.participantId);
    }
  }
  return ids.map((id) => byId.get(id) as CallParticipantView);
}

export function stagePageSize(layout: "grid" | "share", narrow: boolean): number {
  if (layout === "share") return STAGE_RAIL_PAGE;
  return narrow ? STAGE_PAGE_NARROW : STAGE_PAGE;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

export function clampPage(page: number, total: number, pageSize: number): number {
  const last = pageCount(total, pageSize) - 1;
  return Math.min(Math.max(0, Math.floor(page)), last);
}

export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const size = Math.max(1, pageSize);
  const current = clampPage(page, items.length, size);
  return items.slice(current * size, current * size + size);
}

/** 宫格行列：宽屏 1 人一格、2 人并排、3–4 人田字、5–9 人三列；窄屏（竖屏手机）1–2 人一列、3–4 人田字。 */
export function gridShape(count: number, narrow: boolean): { cols: number; rows: number } {
  const n = Math.max(1, Math.min(Math.floor(count), narrow ? STAGE_PAGE_NARROW : STAGE_PAGE));
  const cols = narrow ? (n <= 2 ? 1 : 2) : n === 1 ? 1 : n <= 4 ? 2 : 3;
  return { cols, rows: Math.ceil(n / cols) };
}

/**
 * 共享屏幕的提示：别人在共享 → 小窗出「XX 在共享屏幕 · 查看」、放大视图切到共享版式；
 * 自己在共享 → 只给「你正在共享屏幕 · 停止共享」，不把自己的屏幕再画一遍。
 */
export function shareState(snapshot: Pick<CallSnapshot, "participants" | "screenSharerId" | "me">): {
  other: CallParticipantView | null;
  self: boolean;
} {
  const sharer = snapshot.screenSharerId
    ? snapshot.participants.find((participant) => participant.participantId === snapshot.screenSharerId) ?? null
    : null;
  return {
    other: sharer && !sharer.isMe ? sharer : null,
    self: snapshot.me.screen || Boolean(sharer?.isMe),
  };
}

/** 独处倒计时还剩几秒（向上取整，不小于 0）；没有倒计时给 null。 */
export function aloneSecondsLeft(deadline: number | null, now: number): number | null {
  if (deadline === null || !Number.isFinite(deadline)) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** 倒计时条的进度（0–100，剩得越少越短）。 */
export function aloneProgress(secondsLeft: number): number {
  return Math.max(0, Math.min(100, (secondsLeft / ALONE_COUNTDOWN_SECONDS) * 100));
}

/** 这个阶段算「在通话里」：小窗/放大视图的五个按钮可用。 */
export function isLivePhase(phase: CallSnapshot["phase"]): boolean {
  return phase === "joining" || phase === "connected" || phase === "reconnecting" || phase === "leaving";
}

/** 结束态（已结束 / 出错）的身份：换了一通通话或换了一个错误，被关掉的小窗要重新出现。 */
export function finalStateKey(snapshot: Pick<CallSnapshot, "phase" | "callId" | "error" | "conversationId">): string | null {
  if (snapshot.phase !== "ended" && snapshot.phase !== "error") return null;
  return [snapshot.phase, snapshot.callId ?? "", snapshot.conversationId ?? "", snapshot.error?.code ?? ""].join("|");
}
