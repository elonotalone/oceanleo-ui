"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  createPointerVelocityTracker,
  createSpring,
  createSpring2D,
  type PointerVelocityTracker,
  type Spring2DValue,
  type SpringValue,
} from "../lib/motion";
import {
  EditBarCollapseButton,
  EditBarPinButton,
} from "./EditBarDockControls";
import {
  boundedEditBarDockOffset,
  parseEditBarDockState,
  serializeEditBarDockState,
  type EditBarDockMode,
  type EditBarDockState,
  type EditBarPresentation,
} from "./edit-bar-dock-state";
import { EDIT_BAR_COLLAPSED_SIZE_PX } from "./edit-bar-surface";
import {
  dockedFloatingToolbarPosition,
  isFloatingToolbarDockIntent,
  sameFloatingToolbarPoint,
  type FloatingToolbarBounds,
  type FloatingToolbarPoint,
} from "./floating-toolbar-geometry";
const DRAG_THRESHOLD_PX = 4;
const DOCK_REVEAL_PROXIMITY_PX = 24;

/**
 * 位置弹簧。ζ≈0.81：松手后过冲一次再收住，这一次过冲就是「有惯性」的全部
 * 观感来源。再软会飘，再硬就和瞬时赋值看不出区别。
 */
const POSITION_SPRING = { stiffness: 260, damping: 26 };
/**
 * 形变比位移**慢一档**（`_COMMON.md` §3「同层同档，跨层差一档」）。
 * 形状变化是比挪位置更大的事件；两者同档会糊成一团，看不出先后。
 */
const MORPH_SPRING = { stiffness: 190, damping: 24 };
/**
 * 甩向停靠带的投影窗口：按松手速度外推这么久，若落点仍在带内就算吸附意图。
 * 没有速度样本时投影等于松手点，行为与投影前逐字相同——所以这条只会新增
 * 「甩得到」的情形，不会改变已有的「停在带内」判定。
 */
const FLING_PROJECTION_SECONDS = 0.09;
/**
 * 展开态双击窗口：两次 pointerdown 的间隔上限。
 * 单击按键仍立刻走它自己的 onClick，不靠延迟派发来等这个窗口。
 */
const DOUBLE_PRESS_MS = 320;
/** 两次按下的落点容差。超过就当成另一次单击，不误触发拖。 */
const DOUBLE_PRESS_SLOP_PX = 12;
/**
 * 已选中后的待拖阈值。按下还没移动到这里时，按键 click 必须照常触发；
 * 超过才 beginHoldDrag。触控板双击常 >320ms，这条才是主路。
 */
const ARMED_DRAG_THRESHOLD_PX = 6;

/** 编辑栏可停靠区域从第二行页签底边再往下这么多。 */
export const EDIT_BAR_BELOW_CHROME_GAP_PX = 8;

/**
 * 两行 chrome 的底边（视口坐标）。优先量页签行，其次量
 * `data-plugin-chrome-rows` / `--plugin-chrome-rows-height`。
 */
export function readPluginChromeRowsBottom(
  root?: ParentNode | null,
): number | null {
  const scope =
    root && "querySelector" in root
      ? root
      : typeof document === "undefined"
        ? null
        : document;
  if (!scope) return null;
  const pageRow = scope.querySelector<HTMLElement>("[data-plugin-page-row]");
  if (pageRow) {
    const rect = pageRow.getBoundingClientRect();
    if (Number.isFinite(rect.bottom) && rect.bottom > 0) return rect.bottom;
  }
  const rows = scope.querySelector<HTMLElement>("[data-plugin-chrome-rows]");
  if (rows) {
    const cssRaw =
      rows.style.getPropertyValue("--plugin-chrome-rows-height") ||
      (typeof getComputedStyle === "function"
        ? getComputedStyle(rows).getPropertyValue("--plugin-chrome-rows-height")
        : "");
    const cssHeight = parseFloat(cssRaw);
    const rect = rows.getBoundingClientRect();
    if (Number.isFinite(cssHeight) && cssHeight > 0) {
      return rect.top + cssHeight;
    }
    if (rect.height > 0) return rect.bottom;
  }
  return null;
}

/**
 * 初始停靠、拖拽松手、窗口缩放共用的夹取：栏的 top 不得小于页签底边 + 8。
 */
export function clampEditBarBelowChrome(
  point: FloatingToolbarPoint,
  chromeBottom: number,
  viewport: FloatingToolbarBounds,
  toolbar: { width: number; height: number },
  gapPx = EDIT_BAR_BELOW_CHROME_GAP_PX,
): FloatingToolbarPoint {
  const inset = 8;
  const minTop = chromeBottom + gapPx;
  const minX = viewport.left + inset;
  const maxX = Math.max(minX, viewport.right - toolbar.width - inset);
  const maxY = Math.max(minTop, viewport.bottom - toolbar.height - inset);
  return {
    x: Math.max(minX, Math.min(point.x, maxX)),
    y: Math.max(minTop, Math.min(point.y, maxY)),
  };
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

type EditBarPressStamp = {
  pointerId: number;
  x: number;
  y: number;
  time: number;
};

/**
 * 同一指针、同一条、窗口内、落点靠近：第二次按下立刻起拖。
 * 按键与空白共用这一条，不给某个键开小灶。
 */
function isEditBarDoublePress(
  last: EditBarPressStamp | null,
  pointerId: number,
  clientX: number,
  clientY: number,
  time: number,
): boolean {
  if (!last || last.pointerId !== pointerId) return false;
  if (time < last.time || time - last.time > DOUBLE_PRESS_MS) return false;
  return (
    Math.hypot(clientX - last.x, clientY - last.y) <= DOUBLE_PRESS_SLOP_PX
  );
}

/**
 * 展开胶囊手势：
 * 第一次按下/松开照旧——按键立刻响应 onClick，条子进入选中（光晕是反馈，
 * 不是拖拽门槛）。同一指针在 DOUBLE_PRESS_MS 内、落点在 DOUBLE_PRESS_SLOP_PX
 * 内再按一次，无论落在按键还是空白，立刻 beginHoldDrag（快路）。
 * 已选中后再按任意处（含按键）进入待拖；pointermove > ARMED_DRAG_THRESHOLD_PX
 * 才 beginHoldDrag。未超阈则松开后按键 click 照常。条外按下取消选中。
 * 收起圆仍是按下即拖。不许延迟派发 click 来等双击窗口。
 */

interface EditBarDrag {
  pointerId: number;
  kind: "press" | "move-mode";
  startX: number;
  startY: number;
  originMode: EditBarDockMode;
  originOffset: FloatingToolbarPoint;
  originPosition: FloatingToolbarPoint;
  originCollapsedPosition: FloatingToolbarPoint | null;
  lastPosition: FloatingToolbarPoint;
  moved: boolean;
}

/** 形变期的两个盒子。`from` 是正在离开的形态，`to` 是正在到达的形态。 */
export interface EditBarMorphBox {
  width: number;
  height: number;
}

export interface EditBarDockController {
  leading: ReactNode;
  trailing: ReactNode;
  portalRoot: HTMLElement | null;
  dockRoot: HTMLElement | null;
  toolbarRef: RefObject<HTMLDivElement | null>;
  /** 形变期正在离开的那一层（惰性表面，不接指针）。 */
  morphGhostRef: RefObject<HTMLDivElement | null>;
  /** 常驻的内容层：展开态是 children，收起态是圆。 */
  morphLiveRef: RefObject<HTMLDivElement | null>;
  /**
   * 形变进行中。为真时浮层要额外渲染 ghost 层；为假时只渲染内容层，
   * 且内容层不带任何 transform/opacity 覆盖。
   */
  morphing: boolean;
  /** ghost 层的尺寸。收缩时是胶囊矩形，展开时是 48px 圆。 */
  morphGhost: EditBarMorphBox | null;
  /** ghost 层画的是哪一种表面。 */
  morphGhostKind: EditBarPresentation;
  mode: EditBarDockMode;
  dragging: boolean;
  dropActive: boolean;
  offset: FloatingToolbarPoint;
  position: FloatingToolbarPoint;
  presentation: EditBarPresentation;
  collapsed: boolean;
  /** 按住拖的进行中：条子跟手，松手落下，Esc 取消。 */
  moveMode: boolean;
  /** 条子被点过之后的选中态。光晕是反馈，不再是拖拽的前置条件。 */
  selected: boolean;
  /** 摊到浮层根上：双击任意处（含按键）起拖；单击选中；已选中再按任意处待拖。 */
  rootProps: {
    onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMoveCapture: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUpCapture: (event: ReactPointerEvent<HTMLElement>) => void;
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
    onDoubleClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    /**
     * 展开态的键盘广告位。手柄被删掉之前这条职责挂在手柄上，
     * 手柄一没，展开态就一个 `aria-keyshortcuts` 都不剩了。
     */
    "aria-keyshortcuts": string;
  };
  /** 摊到收起圆上。圆只有一个控件，所以用经典的按住即拖 + 阈值内算点击。 */
  collapsedProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  };
  collapse: () => void;
  expand: () => void;
  toggleCollapsed: () => void;
  dock: () => void;
  undock: () => void;
  resetPosition: () => void;
}

export function useEditBarDockController({
  workspaceRootRef,
  stageRef,
  dockRootRef,
  resetKey,
  storageKey,
}: {
  workspaceRootRef?: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  dockRootRef?: RefObject<HTMLDivElement | null>;
  resetKey: string;
  storageKey: string;
}): EditBarDockController {
  const defaultMode: EditBarDockMode = dockRootRef ? "docked" : "floating";
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<EditBarDrag | null>(null);
  const rememberedDockBoundsRef = useRef<FloatingToolbarBounds | null>(null);
  const hydratedStorageKeyRef = useRef("");
  const selectedRef = useRef(false);
  const pendingSelectRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const lastPressRef = useRef<EditBarPressStamp | null>(null);
  const armedDragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const armedWindowCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef<FloatingToolbarPoint | null>(null);
  const modeRef = useRef<EditBarDockMode>(defaultMode);
  const offsetRef = useRef<FloatingToolbarPoint>({ x: 0, y: 0 });
  const positionRef = useRef<FloatingToolbarPoint>({ x: 0, y: 0 });
  const presentationRef = useRef<EditBarPresentation>("expanded");
  const collapsedPositionRef = useRef<FloatingToolbarPoint | null>(null);
  const [mode, setMode] = useState<EditBarDockMode>(defaultMode);
  const [offset, setOffset] = useState<FloatingToolbarPoint>(offsetRef.current);
  const [position, setPosition] = useState<FloatingToolbarPoint>(
    positionRef.current,
  );
  const [presentation, setPresentation] =
    useState<EditBarPresentation>("expanded");
  const [dragging, setDragging] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [selected, setSelected] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const markSelected = useCallback((next: boolean) => {
    selectedRef.current = next;
    setSelected(next);
    if (!next) {
      pendingSelectRef.current = null;
      armedDragRef.current = null;
      armedWindowCleanupRef.current?.();
      armedWindowCleanupRef.current = null;
    }
  }, []);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [dockRoot, setDockRoot] = useState<HTMLElement | null>(null);

  // ── 动效层 ────────────────────────────────────────────────────────────────
  // 这一层是 W02 加的。它与上面那套 ref/state 的分工是死的：
  //   positionRef / presentationRef  = **逻辑态**，落盘、停靠判定、边界夹取都读它
  //   弹簧 + paintMotion()           = **视觉态**，只写 transform / opacity
  // 逻辑态在手势结束的那一刻就落定（所以持久化与 mode 切换不等动画），
  // 视觉态再从当前位置带着速度收敛过去。两者在 settle 时重合。
  const morphGhostRef = useRef<HTMLDivElement>(null);
  const morphLiveRef = useRef<HTMLDivElement>(null);
  const [morphing, setMorphing] = useState(false);
  const [morphGhost, setMorphGhost] = useState<EditBarMorphBox | null>(null);
  const [morphGhostKind, setMorphGhostKind] =
    useState<EditBarPresentation>("expanded");
  const morphingRef = useRef(false);
  const morphRef = useRef(0);
  const morphFromRef = useRef<EditBarMorphBox>({ width: 0, height: 0 });
  const morphToRef = useRef<EditBarMorphBox | null>(null);
  const morphStartedRef = useRef(true);
  /** 最近一次量到的展开态胶囊尺寸。展开时的目标盒先用它，量到了再校正。 */
  const expandedBoxRef = useRef<EditBarMorphBox | null>(null);
  /** 弹簧收敛中的中间位置。settle 后与 `positionRef` 重合。 */
  const visualPositionRef = useRef<FloatingToolbarPoint>({ x: 0, y: 0 });
  const positionTargetRef = useRef<FloatingToolbarPoint>({ x: 0, y: 0 });
  /**
   * 位置弹簧是否在飞。**为假时 `paintMotion` 直接读逻辑态**，写出的 transform
   * 与接弹簧之前逐字相同——键盘移动、Esc 取消、resize 重算都走这条，
   * 既有用例断言的正是那个字符串。只有手势松手与收起/展开会把它置真。
   */
  const positionAnimatingRef = useRef(false);

  const positionSpringRef = useRef<Spring2DValue | null>(null);
  const morphSpringRef = useRef<SpringValue | null>(null);
  const pointerVelocityRef = useRef<PointerVelocityTracker | null>(null);
  if (!positionSpringRef.current) {
    // 渲染期创建是安全的：造一个弹簧不启动 rAF、不碰 DOM，只往 WeakRef 登记处
    // 加一条（StrictMode 的二次渲染多出来的那个会被 GC）。
    positionSpringRef.current = createSpring2D({ x: 0, y: 0 }, POSITION_SPRING);
  }
  if (!morphSpringRef.current) {
    morphSpringRef.current = createSpring(0, MORPH_SPRING);
  }
  if (!pointerVelocityRef.current) {
    pointerVelocityRef.current = createPointerVelocityTracker();
  }

  /**
   * 唯一的 transform / opacity 写入点。
   *
   * 刻意**不**让 React 渲染 transform：那样每一帧弹簧都要过一次 React，而且
   * 渲染与弹簧会互相覆盖（谁最后跑谁赢）。改成浮层的 style 里不出现 transform，
   * 由这里在 rAF 帧与每次 commit 后各写一次，写入点就只有一个。
   */
  const paintMotion = useCallback(() => {
    const container = toolbarRef.current;
    if (!container) return;
    const point = positionAnimatingRef.current
      ? visualPositionRef.current
      : positionRef.current;
    container.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;

    const live = morphLiveRef.current;
    if (!live) return;
    if (!morphingRef.current) {
      live.style.transform = "";
      live.style.opacity = "";
      return;
    }
    const from = morphFromRef.current;
    const to = morphToRef.current || from;
    const progress = morphRef.current;
    const width = from.width + (to.width - from.width) * progress;
    const height = from.height + (to.height - from.height) * progress;
    // 两层各自缩放到**同一个**视觉盒，再靠不透明度交叉淡出。两端精确：
    // progress=0 时 ghost 是 1:1、内容层全透明；progress=1 时反过来。
    live.style.transform =
      to.width > 0 && to.height > 0
        ? `scale(${width / to.width}, ${height / to.height})`
        : "";
    // 弹簧会过冲，progress 短暂越过 1（形状轻微挤过头，正是想要的手感），
    // 但不透明度得夹住，否则中间几帧会写出 1.04 这种值。
    live.style.opacity = `${clampUnit(progress)}`;
    const ghost = morphGhostRef.current;
    if (!ghost) return;
    ghost.style.transform =
      from.width > 0 && from.height > 0
        ? `scale(${width / from.width}, ${height / from.height})`
        : "";
    ghost.style.opacity = `${clampUnit(1 - progress)}`;
  }, []);

  const readToolbarBox = useCallback((): EditBarMorphBox => {
    // 容器上只有 translate，没有 scale；缩放在内层。所以这里量到的是布局盒，
    // 不是被自己动画影响过的视觉盒。
    const rect = toolbarRef.current?.getBoundingClientRect();
    return {
      width: rect?.width || 0,
      height: rect?.height || 0,
    };
  }, []);

  const finishMorph = useCallback(() => {
    morphRef.current = 1;
    morphingRef.current = false;
    morphStartedRef.current = true;
    setMorphing(false);
    setMorphGhost(null);
    paintMotion();
  }, [paintMotion]);

  /**
   * 排一次形变。`to` 传 null 表示目标尺寸要等新形态挂上去才能量
   * （展开就是这种情况：胶囊还没进 DOM）。
   */
  const planMorph = useCallback(
    (
      ghostKind: EditBarPresentation,
      from: EditBarMorphBox,
      to: EditBarMorphBox | null,
    ) => {
      if (!(from.width > 0) || !(from.height > 0)) {
        // 量不到几何（例如还没挂载、或在无布局的宿主里）就不假装形变：
        // 直接落终态，比放一段瞎猜尺寸的动画诚实。
        finishMorph();
        return;
      }
      morphFromRef.current = from;
      morphToRef.current = to;
      morphRef.current = 0;
      morphingRef.current = true;
      morphStartedRef.current = false;
      setMorphGhost(from);
      setMorphGhostKind(ghostKind);
      setMorphing(true);
    },
    [finishMorph],
  );

  /**
   * 把视觉位置交给弹簧。
   *
   * `from` **不传**时沿用弹簧当前的位置与**速度**——松手的惯性全靠这一条：
   * 拖拽期间 `updateDrag` 每次 `set()` 都让原语内部记下瞬时速度，
   * 松手只需 `setTarget()`，弹簧就从那个速度起算。这里若多此一举地
   * 再 `set()` 一次，速度会被抹成 0，惯性也就没了。
   *
   * `from` 传了则先把弹簧摆过去（收起/展开要从按钮那一侧长出来，
   * 而键盘移动等不走弹簧的路径会让弹簧的位置变陈旧，必须显式对齐）。
   */
  const springPositionTo = useCallback(
    (to: FloatingToolbarPoint, from?: FloatingToolbarPoint) => {
      const spring = positionSpringRef.current;
      if (!spring) return;
      if (from) spring.set(from);
      positionTargetRef.current = to;
      visualPositionRef.current = spring.current;
      positionAnimatingRef.current = true;
      spring.setTarget(to);
      paintMotion();
    },
    [paintMotion],
  );

  /**
   * 视觉态立刻交还给逻辑态：**撤销**（Esc 取消这次拖拽）与卸载走这条。
   *
   * ⚠️ 新手势接管**不**走这条。撤销的语义是「把这次手势当没发生过」，所以视觉
   * 回到逻辑是对的；而接管的语义是「从条此刻所在的地方接着来」，把视觉拉回
   * 逻辑会让屏幕上的条当场跳一下（跳变幅度 = 当帧过冲量，`V1` 实测 −57px）。
   * 接管走 `adoptVisualPositionAsLogical()`，方向正好相反。
   */
  const releasePositionSpring = useCallback(() => {
    positionAnimatingRef.current = false;
    positionSpringRef.current?.set(positionRef.current);
    positionTargetRef.current = positionRef.current;
    paintMotion();
  }, [paintMotion]);

  // 订阅两个弹簧。mount-only：弹簧本身在渲染期就造好了，订阅关系不随渲染变。
  useLayoutEffect(() => {
    const position = positionSpringRef.current;
    const morph = morphSpringRef.current;
    if (!position || !morph) return;
    const releasePosition = position.onChange((value) => {
      visualPositionRef.current = value;
      // 收敛的那一帧 `current` 被逐字赋成 `target`，所以相等就是 settled。
      // （`Spring2DValue` 按规范没有 `settled`，1D 才有。）
      const target = positionTargetRef.current;
      if (value.x === target.x && value.y === target.y) {
        positionAnimatingRef.current = false;
      }
      paintMotion();
    });
    const releaseMorph = morph.onChange((value) => {
      morphRef.current = value;
      paintMotion();
      // progress 会过冲越过 1，所以判 `settled` 而不是判 `value >= 1`。
      // `morphStartedRef` 挡住起跑那一次 `set(0)` 的同步回调，
      // 否则形变会在开始的同一刻被判定为已结束。
      if (morphStartedRef.current && morph.settled) finishMorph();
    });
    return () => {
      releasePosition();
      releaseMorph();
      position.stop();
      morph.stop();
    };
  }, [finishMorph, paintMotion]);

  const readLayerElement = useCallback(
    () =>
      workspaceRootRef?.current ||
      dockRootRef?.current?.parentElement ||
      portalRoot ||
      stageRef.current,
    [dockRootRef, portalRoot, stageRef, workspaceRootRef],
  );

  const readDockTargetBounds = useCallback((): FloatingToolbarBounds | null => {
    const target = dockRootRef?.current || dockRoot;
    if (!target) return rememberedDockBoundsRef.current;
    const sentinel = target.querySelector<HTMLElement>(
      "[data-edit-bar-dock-sentinel]",
    );
    const sentinelRect = sentinel?.getBoundingClientRect();
    const measured =
      sentinelRect && sentinelRect.width > 0
        ? sentinelRect
        : target.getBoundingClientRect();
    if (
      Number.isFinite(measured.left) &&
      Number.isFinite(measured.top) &&
      measured.width > 0
    ) {
      const height = measured.height > 0 ? measured.height : 56;
      const next = {
        left: measured.left,
        top: measured.top,
        right: measured.right || measured.left + measured.width,
        bottom: measured.top + height,
      };
      rememberedDockBoundsRef.current = next;
      return next;
    }
    return rememberedDockBoundsRef.current;
  }, [dockRoot, dockRootRef]);

  const defaultPosition = useCallback((): FloatingToolbarPoint => {
    const stage = stageRef.current?.getBoundingClientRect();
    const layer = readLayerElement()?.getBoundingClientRect();
    if (!stage || !layer) return { x: 0, y: 0 };
    const selection = toolbarRef.current?.querySelector<HTMLElement>(
      "[data-selection-anchor-x][data-selection-anchor-y]",
    );
    if (selection) {
      const x = Number(selection.dataset.selectionAnchorX);
      const y = Number(selection.dataset.selectionAnchorY);
      const width = Number(selection.dataset.selectionAnchorWidth || 0);
      const height = Number(selection.dataset.selectionAnchorHeight || 0);
      const toolbarHeight =
        toolbarRef.current?.getBoundingClientRect().height || 0;
      const toolbarWidth =
        toolbarRef.current?.getBoundingClientRect().width || 0;
      if ([x, y, width, height].every(Number.isFinite)) {
        const above = y - layer.top - toolbarHeight - 8;
        const stageTop = stage.top - layer.top;
        return {
          x: x + width / 2 - layer.left - toolbarWidth / 2,
          y:
            above >= stageTop + 8
              ? above
              : y + height - layer.top + 8,
        };
      }
    }
    return {
      x: stage.left - layer.left + 8,
      y: stage.top - layer.top + 8,
    };
  }, [readLayerElement, stageRef]);

  /** 可见边界（图层局部坐标），收起态与浮动态共用同一套夹取范围。 */
  const readVisibleBounds = useCallback((): FloatingToolbarBounds | null => {
    const stage = stageRef.current?.getBoundingClientRect();
    const layer = readLayerElement()?.getBoundingClientRect();
    if (!stage || !layer) return null;
    const dockBounds = readDockTargetBounds();
    const visualViewport =
      typeof window === "undefined" ? null : window.visualViewport;
    const visualLeft = visualViewport?.offsetLeft || 0;
    const visualTop = visualViewport?.offsetTop || 0;
    const visualRight =
      visualLeft + (visualViewport?.width || window.innerWidth);
    const visualBottom =
      visualTop + (visualViewport?.height || window.innerHeight);
    // Include the full shell layer (action row + dock + stage) so the bar can
    // fly through the remembered dock band instead of clamping under it while
    // the pointer continues into chrome above the strip.
    const surfaceLeft = dockBounds
      ? Math.min(stage.left, dockBounds.left, layer.left)
      : Math.min(stage.left, layer.left);
    const surfaceTop = dockBounds
      ? Math.min(stage.top, dockBounds.top, layer.top)
      : Math.min(stage.top, layer.top);
    const surfaceRight = dockBounds
      ? Math.max(stage.right, dockBounds.right, layer.right)
      : Math.max(stage.right, layer.right);
    const surfaceBottom = dockBounds
      ? Math.max(stage.bottom, dockBounds.bottom, layer.bottom)
      : Math.max(stage.bottom, layer.bottom);
    const visibleLeft = Math.max(surfaceLeft, layer.left, visualLeft);
    const visibleTop = Math.max(surfaceTop, layer.top, visualTop);
    const visibleRight = Math.max(
      visibleLeft,
      Math.min(surfaceRight, layer.right, visualRight),
    );
    const visibleBottom = Math.max(
      visibleTop,
      Math.min(surfaceBottom, layer.bottom, visualBottom),
    );
    return {
      left: visibleLeft - layer.left,
      top: visibleTop - layer.top,
      right: visibleRight - layer.left,
      bottom: visibleBottom - layer.top,
    };
  }, [readDockTargetBounds, readLayerElement, stageRef]);

  const positionForOffset = useCallback(
    (
      nextOffset: FloatingToolbarPoint,
      targetMode = modeRef.current,
    ): FloatingToolbarPoint => {
      const toolbar = toolbarRef.current?.getBoundingClientRect();
      const bounds = readVisibleBounds();
      if (!bounds) return positionRef.current;
      const size = {
        width: toolbar?.width || EDIT_BAR_COLLAPSED_SIZE_PX,
        height: toolbar?.height || EDIT_BAR_COLLAPSED_SIZE_PX,
      };
      const layerEl = readLayerElement();
      const layer = layerEl?.getBoundingClientRect();
      const chromeBottomViewport = readPluginChromeRowsBottom(layerEl);
      const chromeBottom =
        chromeBottomViewport != null && layer
          ? Math.max(bounds.top, chromeBottomViewport - layer.top)
          : bounds.top;
      if (layerEl && chromeBottomViewport != null) {
        layerEl.style.setProperty(
          "--plugin-chrome-rows-height",
          `${Math.max(0, chromeBottom)}px`,
        );
      }
      const finalize = (point: FloatingToolbarPoint): FloatingToolbarPoint =>
        clampEditBarBelowChrome(point, chromeBottom, bounds, size);
      // 收起态先判：小圆用图层绝对坐标，既不跟选区锚点也不参与停靠。
      if (presentationRef.current === "collapsed") {
        const base = collapsedPositionRef.current || positionRef.current;
        return finalize(base);
      }
      const stage = stageRef.current?.getBoundingClientRect();
      const dockBounds = readDockTargetBounds();
      if (targetMode === "docked" && dockBounds && stage && layer && toolbar) {
        // Sit immediately above the stage/iframe. Vertical centering inside a
        // short dock sentinel let a taller SelectionToolbar chrome overlap the
        // website frame (V5 WEBSITE_EDIT_BAR_MISPLACED gap=-3).
        // Chrome clamp still wins: a 102px bar must not cover the page row.
        return finalize(
          dockedFloatingToolbarPosition({
            layerLeft: layer.left,
            layerTop: layer.top,
            dock: dockBounds,
            stageTop: stage.top,
            toolbar: { width: toolbar.width, height: toolbar.height },
          }),
        );
      }
      if (!toolbar) return positionRef.current;
      const anchor = defaultPosition();
      return finalize({
        x: anchor.x + nextOffset.x,
        y: anchor.y + nextOffset.y,
      });
    },
    [
      defaultPosition,
      readDockTargetBounds,
      readLayerElement,
      readVisibleBounds,
      stageRef,
    ],
  );

  /** 四个字段一起落盘。分开写过一次少写一次就会出现半截状态。 */
  const persistState = useCallback(() => {
    if (
      typeof window === "undefined" ||
      hydratedStorageKeyRef.current !== storageKey
    ) {
      return;
    }
    try {
      window.localStorage.setItem(
        storageKey,
        serializeEditBarDockState({
          version: 2,
          mode: modeRef.current,
          offset: offsetRef.current,
          presentation: presentationRef.current,
          collapsedPosition: collapsedPositionRef.current,
        }),
      );
    } catch {
      // Privacy-restricted embeds may disable storage. The live state remains usable.
    }
  }, [storageKey]);

  const commitPosition = useCallback((next: FloatingToolbarPoint) => {
    positionRef.current = next;
    setPosition((current) =>
      sameFloatingToolbarPoint(current, next) ? current : next,
    );
  }, []);

  const setSharedOffset = useCallback(
    (
      requestedOffset: FloatingToolbarPoint,
      persistChange = true,
      targetMode = modeRef.current,
    ) => {
      let nextOffset = boundedEditBarDockOffset(requestedOffset);
      const nextPosition = positionForOffset(nextOffset, targetMode);
      const stageRect = stageRef.current?.getBoundingClientRect();
      const toolbarRect = toolbarRef.current?.getBoundingClientRect();
      const layerRect = readLayerElement()?.getBoundingClientRect();
      const hasMeasurableGeometry = Boolean(
        stageRect &&
          toolbarRect &&
          layerRect &&
          stageRect.width > 0 &&
          stageRect.height > 0 &&
          toolbarRect.width > 0 &&
          toolbarRect.height > 0 &&
          layerRect.width > 0 &&
          layerRect.height > 0,
      );
      if (
        targetMode === "floating" &&
        presentationRef.current === "expanded" &&
        hasMeasurableGeometry
      ) {
        const anchor = defaultPosition();
        nextOffset = boundedEditBarDockOffset({
          x: nextPosition.x - anchor.x,
          y: nextPosition.y - anchor.y,
        });
      }
      offsetRef.current = nextOffset;
      setOffset((current) =>
        sameFloatingToolbarPoint(current, nextOffset) ? current : nextOffset,
      );
      commitPosition(nextPosition);
      if (persistChange) persistState();
      return nextOffset;
    },
    [
      commitPosition,
      defaultPosition,
      persistState,
      positionForOffset,
      readLayerElement,
      stageRef,
    ],
  );

  const setCollapsedPosition = useCallback(
    (requested: FloatingToolbarPoint, persistChange = true) => {
      collapsedPositionRef.current = boundedEditBarDockOffset(requested);
      const clamped = positionForOffset(offsetRef.current, modeRef.current);
      // 存夹取后的值，否则反复拖到边界外会让记忆位置持续外漂。
      collapsedPositionRef.current = clamped;
      commitPosition(clamped);
      if (persistChange) persistState();
      return clamped;
    },
    [commitPosition, persistState, positionForOffset],
  );

  const setFloatingPosition = useCallback(
    (requestedPosition: FloatingToolbarPoint, persistChange = true) => {
      const anchor = defaultPosition();
      return setSharedOffset(
        {
          x: requestedPosition.x - anchor.x,
          y: requestedPosition.y - anchor.y,
        },
        persistChange,
        "floating",
      );
    },
    [defaultPosition, setSharedOffset],
  );

  /** 拖动期间的统一落点：展开态写 offset，收起态写 collapsedPosition。 */
  const applyLivePosition = useCallback(
    (next: FloatingToolbarPoint, persistChange: boolean) => {
      if (presentationRef.current === "collapsed") {
        setCollapsedPosition(next, persistChange);
        return;
      }
      setFloatingPosition(next, persistChange);
    },
    [setCollapsedPosition, setFloatingPosition],
  );

  const applyModeAndOffset = useCallback(
    (nextMode: EditBarDockMode, nextOffset: FloatingToolbarPoint) => {
      modeRef.current = nextMode;
      setMode(nextMode);
      setSharedOffset(nextOffset, false, nextMode);
      persistState();
      setDropActive(false);
    },
    [persistState, setSharedOffset],
  );

  const readLiveToolbarBounds = useCallback((): FloatingToolbarBounds | null => {
    const layer = readLayerElement()?.getBoundingClientRect();
    const toolbar = toolbarRef.current?.getBoundingClientRect();
    if (
      !layer ||
      !toolbar ||
      !(toolbar.width > 0) ||
      !(toolbar.height > 0)
    ) {
      return null;
    }
    // Prefer the controller's post-clamp position so drop detection in the
    // same pointermove frame does not wait for a React transform commit.
    const left = layer.left + positionRef.current.x;
    const top = layer.top + positionRef.current.y;
    return {
      left,
      top,
      right: left + toolbar.width,
      bottom: top + toolbar.height,
    };
  }, [readLayerElement]);

  const pointNearDock = useCallback(
    (clientX: number, clientY: number) => {
      // 收起的小圆不参与停靠：它是自由停放的常驻物件。
      if (presentationRef.current === "collapsed") return false;
      const bounds = readDockTargetBounds();
      if (!bounds) return false;
      return isFloatingToolbarDockIntent(
        { x: clientX, y: clientY },
        bounds,
        readLiveToolbarBounds(),
        DOCK_REVEAL_PROXIMITY_PX,
      );
    },
    [readDockTargetBounds, readLiveToolbarBounds],
  );

  const dock = useCallback(() => {
    if (!dockRootRef) return;
    applyModeAndOffset("docked", offsetRef.current);
  }, [applyModeAndOffset, dockRootRef]);

  const undock = useCallback(() => {
    readDockTargetBounds();
    applyModeAndOffset("floating", offsetRef.current);
  }, [applyModeAndOffset, readDockTargetBounds]);

  const toggleDock = useCallback(() => {
    if (!dockRootRef) return;
    if (modeRef.current === "docked") undock();
    else dock();
  }, [dock, dockRootRef, undock]);

  const resetPosition = useCallback(() => {
    if (presentationRef.current === "collapsed") {
      collapsedPositionRef.current = null;
      setCollapsedPosition(defaultPosition());
      return;
    }
    setSharedOffset({ x: 0, y: 0 });
  }, [defaultPosition, setCollapsedPosition, setSharedOffset]);

  const finishDrag = useCallback((pointerId?: number) => {
    if (
      pointerId !== undefined &&
      dragRef.current?.pointerId !== pointerId
    ) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    setMoveMode(false);
    setDropActive(false);
  }, []);

  const collapse = useCallback(() => {
    if (presentationRef.current === "collapsed") return;
    const toolbar = toolbarRef.current?.getBoundingClientRect();
    // 朝着刚点下的收起按钮缩过去，而不是从左上角塌陷，过渡才连贯。
    const origin = positionRef.current;
    const target = toolbar
      ? {
          x: origin.x + Math.max(0, toolbar.width - EDIT_BAR_COLLAPSED_SIZE_PX),
          y:
            origin.y +
            Math.max(0, (toolbar.height - EDIT_BAR_COLLAPSED_SIZE_PX) / 2),
        }
      : origin;
    // 形变：正在离开的胶囊留成一层惰性 ghost，内容层同时缩到 48 圆并淡入。
    // 记住展开态的盒，展开时先按它起跑，量到真值再校正。
    const from = readToolbarBox();
    if (from.width > 0 && from.height > 0) expandedBoxRef.current = from;
    planMorph("expanded", from, {
      width: EDIT_BAR_COLLAPSED_SIZE_PX,
      height: EDIT_BAR_COLLAPSED_SIZE_PX,
    });
    presentationRef.current = "collapsed";
    setPresentation("collapsed");
    markSelected(false);
    collapsedPositionRef.current = boundedEditBarDockOffset(target);
    commitPosition(collapsedPositionRef.current);
    persistState();
    // 位置也弹过去。终点是刚点下的那枚收起按钮，这就是「动效有来源」。
    springPositionTo(collapsedPositionRef.current, origin);
  }, [
    commitPosition,
    markSelected,
    persistState,
    planMorph,
    readToolbarBox,
    springPositionTo,
  ]);

  const expand = useCallback(() => {
    if (presentationRef.current === "expanded") return;
    // 目标盒传 null：胶囊还没进 DOM，尺寸要等它挂上去才量得到，
    // 由文件末尾那个无依赖数组的 layout effect 补量并起跑。
    planMorph(
      "collapsed",
      { width: EDIT_BAR_COLLAPSED_SIZE_PX, height: EDIT_BAR_COLLAPSED_SIZE_PX },
      null,
    );
    presentationRef.current = "expanded";
    setPresentation("expanded");
    persistState();
    // 位置在 DOM 换回胶囊后由 presentation 依赖的 layout effect 重算。
  }, [persistState, planMorph]);

  const toggleCollapsed = useCallback(() => {
    if (presentationRef.current === "collapsed") expand();
    else collapse();
  }, [collapse, expand]);

  /**
   * 编辑栏真的消费掉这一次按键时，**顺手掐断冒泡**。
   *
   * 为什么必须有（W31，2026-08-31 实测）：收起圆收的是**裸**方向键，而设计画布
   * 的画布快捷键（`design/…/editor/useCanvasShortcuts.ts:105-107`）也收裸方向键，
   * 挂在 window 上、且**不看 `defaultPrevented`**。焦点在圆上按 ArrowLeft，
   * 两边都会动：圆挪 16px，画布上选中的元素也跟着挪。`preventDefault()` 拦不住
   * 这种事——它管的是浏览器默认行为，不是别人的监听器。
   *
   * 只在**已经决定要处理**的分支上掐：编辑栏不认的键照常冒泡出去，
   * 插件自己的快捷键一个都不会被抢。
   */
  const consumeKey = useCallback((event: KeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const moveByKeyboard = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        if (!dockRootRef || presentationRef.current === "collapsed") return;
        consumeKey(event);
        toggleDock();
        return;
      }
      const distance = event.shiftKey ? 48 : 16;
      const collapsed = presentationRef.current === "collapsed";
      const origin = collapsed
        ? collapsedPositionRef.current || positionRef.current
        : offsetRef.current;
      let next: FloatingToolbarPoint | null = null;
      if (event.key === "ArrowLeft") {
        next = { ...origin, x: origin.x - distance };
      } else if (event.key === "ArrowRight") {
        next = { ...origin, x: origin.x + distance };
      } else if (event.key === "ArrowUp") {
        next = { ...origin, y: origin.y - distance };
      } else if (event.key === "ArrowDown") {
        next = { ...origin, y: origin.y + distance };
      } else if (event.key === "Home") {
        consumeKey(event);
        resetPosition();
        return;
      }
      if (!next) return;
      consumeKey(event);
      if (collapsed) {
        setCollapsedPosition(next);
      } else if (modeRef.current === "docked") {
        applyModeAndOffset("floating", next);
      } else {
        setSharedOffset(next);
      }
    },
    [
      applyModeAndOffset,
      consumeKey,
      dockRootRef,
      resetPosition,
      setCollapsedPosition,
      setSharedOffset,
      toggleDock,
    ],
  );

  /**
   * 新手势接管在飞的动画（「可打断」）：把弹簧**当前的视觉位置**收编为逻辑位置。
   *
   * 收编的方向是本函数的全部内容。此前这里调的是 `releasePositionSpring()`，
   * 方向反了——它把视觉拉回逻辑，于是甩出去的条在飞行途中被抓住时，会先往回
   * 跳一个过冲量再跟手（`V1` 实测 −57px，`verdicts/V1-verdict.md` A2）。
   * 用户看到的是「我明明抓住了它，它却先弹开一下」。
   *
   * 收编之后 `positionRef` 就是条此刻真正所在的地方，所以紧接着建立的
   * `drag.originPosition` 也从那里起算——第一帧与后续每一帧都连续。
   *
   * 弹簧没在飞时（`positionAnimatingRef` 为假）视觉与逻辑本就重合，
   * 走原来的对齐路径，行为逐字不变。
   */
  const adoptVisualPositionAsLogical = useCallback(() => {
    const spring = positionSpringRef.current;
    if (!spring || !positionAnimatingRef.current) {
      releasePositionSpring();
      return;
    }
    positionAnimatingRef.current = false;
    // 走 `applyLivePosition` 而不是直接写 `positionRef`：逻辑态要经过边界夹取
    // 与落盘口径（展开态写 offset、收起态写 collapsedPosition），
    // 绕过去会留下一个夹不住、也存不回来的半截状态。
    applyLivePosition(spring.current, false);
    // 夹取真的改了值时，视觉跟着走到夹取后的位置——两者仍然重合，
    // 只是那一点差值是「它本来就飘到了看不见的地方」，不是接管引入的跳变。
    spring.set(positionRef.current);
    positionTargetRef.current = positionRef.current;
    visualPositionRef.current = positionRef.current;
    paintMotion();
  }, [applyLivePosition, paintMotion, releasePositionSpring]);

  const startDrag = useCallback(
    (
      kind: EditBarDrag["kind"],
      pointerId: number,
      clientX: number,
      clientY: number,
    ) => {
      readDockTargetBounds();
      adoptVisualPositionAsLogical();
      pointerVelocityRef.current?.reset();
      dragRef.current = {
        pointerId,
        kind,
        startX: clientX,
        startY: clientY,
        originMode: modeRef.current,
        originOffset: offsetRef.current,
        originPosition: positionRef.current,
        originCollapsedPosition: collapsedPositionRef.current,
        lastPosition: positionRef.current,
        moved: false,
      };
      setDragging(true);
    },
    [adoptVisualPositionAsLogical, readDockTargetBounds],
  );

  const updateDrag = useCallback(
    (
      pointerId: number,
      clientX: number,
      clientY: number,
      timeStamp: number,
    ) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== pointerId) return false;
      // 阈值内的微动也采样：松手前最后那几毫秒决定甩出去的速度。
      pointerVelocityRef.current?.sample(clientX, clientY, timeStamp);
      const deltaX = clientX - drag.startX;
      const deltaY = clientY - drag.startY;
      if (
        !drag.moved &&
        drag.kind === "press" &&
        Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX
      ) {
        return false;
      }
      drag.moved = true;
      if (
        modeRef.current === "docked" &&
        presentationRef.current === "expanded"
      ) {
        modeRef.current = "floating";
        setMode("floating");
      }
      applyLivePosition(
        {
          x: drag.originPosition.x + deltaX,
          y: drag.originPosition.y + deltaY,
        },
        false,
      );
      drag.lastPosition = positionRef.current;
      // 视觉态实时跟住真实落点（拖拽期间不许有延迟），同时让弹簧内部的
      // 速度追踪器把每一段位移记下来——`settleDrag` 的惯性就是从这里来的。
      positionAnimatingRef.current = false;
      positionTargetRef.current = positionRef.current;
      positionSpringRef.current?.set(positionRef.current);
      setDropActive(pointNearDock(clientX, clientY));
      return true;
    },
    [applyLivePosition, pointNearDock],
  );

  const settleDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      // 吸附判定按松手速度外推一次：朝停靠带甩过去也算吸附意图，不必停在带内。
      // 没有速度样本时投影**逐字等于**松手点，所以这只新增「甩得到」的情形，
      // 不会改变任何一条既有的「停在带内」判定。
      const fling = pointerVelocityRef.current?.velocity() || { x: 0, y: 0 };
      const overDock =
        pointNearDock(clientX, clientY) ||
        pointNearDock(
          clientX + fling.x * FLING_PROJECTION_SECONDS,
          clientY + fling.y * FLING_PROJECTION_SECONDS,
        );
      if (!drag.moved) {
        persistState();
      } else if (
        overDock &&
        dockRootRef &&
        presentationRef.current === "expanded"
      ) {
        applyModeAndOffset("docked", offsetRef.current);
      } else if (presentationRef.current === "collapsed") {
        setCollapsedPosition(drag.lastPosition);
      } else {
        modeRef.current = "floating";
        setMode("floating");
        setFloatingPosition(drag.lastPosition);
      }
      if (!drag.moved) return;
      // 逻辑态上面已经落定（mode 切换与落盘都不等动画）；这里只把**视觉态**
      // 交给弹簧，从松手时的位置带着松手时的速度收敛到最终落点。
      //
      // 初速度取**指针追踪器**的读数，不用 `set()` 内部那个墙钟估计：追踪器按
      // 事件自带的 `timeStamp` 采样，而 `set()` 只能按处理器执行时的
      // `performance.now()` 算。合并的指针事件与主线程卡顿都会把好几次 move 塞进
      // 同一个任务，墙钟差落到 4ms 门槛以下就记成 0——恰恰是甩得最狠的时候没惯性。
      // 没有速度样本时注入 0，弹簧不会醒，行为与接弹簧之前逐字相同。
      positionSpringRef.current?.setVelocity(fling);
      springPositionTo(positionRef.current);
    },
    [
      applyModeAndOffset,
      dockRootRef,
      persistState,
      pointNearDock,
      setCollapsedPosition,
      setFloatingPosition,
      springPositionTo,
    ],
  );

  const revertDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    collapsedPositionRef.current = drag.originCollapsedPosition;
    applyModeAndOffset(drag.originMode, drag.originOffset);
    // 取消保持**瞬时**，不接弹簧。取消是撤销不是松手：语义上没有「甩」这回事，
    // 而且既有用例断言 Esc 之后 transform 逐字等于取消前的字符串
    // （`tests/edit-bar-dock-console.test.mjs`），弹簧会把它变成某个中间帧。
    releasePositionSpring();
  }, [applyModeAndOffset, releasePositionSpring]);

  /**
   * 吞掉松手落下时的那一次点击，避免拖完立刻点到控件或画布。
   */
  const clickSwallowCleanupRef = useRef<(() => void) | null>(null);

  /**
   * 只吞掉「与本次手势同一落点」的那一次点击。早期实现是无差别吞下一次点击，
   * 结果落下后 700ms 内页面上任何位置的第一次点击都会失灵。
   */
  const shouldSwallowClick = useCallback(
    (clientX: number, clientY: number) => {
      const point = suppressClickRef.current;
      if (!point) return false;
      return Math.hypot(clientX - point.x, clientY - point.y) <= 12;
    },
    [],
  );

  /** Esc 取消拖拽后必须立刻解除，否则紧接着的第一次真实点击会被白吞掉。 */
  const releaseClickSuppression = useCallback(() => {
    suppressClickRef.current = null;
    clickSwallowCleanupRef.current?.();
    clickSwallowCleanupRef.current = null;
    pendingSelectRef.current = null;
  }, []);

  const swallowNextClick = useCallback(
    (clientX: number, clientY: number) => {
      if (typeof window === "undefined") return;
      clickSwallowCleanupRef.current?.();
      suppressClickRef.current = { x: clientX, y: clientY };
      let timer = 0;
      const cleanup = () => {
        suppressClickRef.current = null;
        window.removeEventListener("click", handler, true);
        window.clearTimeout(timer);
        clickSwallowCleanupRef.current = null;
      };
      const handler = (event: MouseEvent) => {
        if (!shouldSwallowClick(event.clientX, event.clientY)) return;
        event.preventDefault();
        event.stopPropagation();
        cleanup();
      };
      window.addEventListener("click", handler, true);
      timer = window.setTimeout(cleanup, 500);
      clickSwallowCleanupRef.current = cleanup;
    },
    [shouldSwallowClick],
  );

  const clearArmedDrag = useCallback(() => {
    armedDragRef.current = null;
    armedWindowCleanupRef.current?.();
    armedWindowCleanupRef.current = null;
  }, []);

  const beginHoldDrag = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      pendingSelectRef.current = null;
      lastPressRef.current = null;
      clearArmedDrag();
      startDrag("press", pointerId, clientX, clientY);
      setMoveMode(true);
      swallowNextClick(clientX, clientY);
      try {
        toolbarRef.current?.setPointerCapture?.(pointerId);
      } catch {
        // jsdom 与部分 webview 没有指针捕获。窗口监听仍然跟手。
      }
    },
    [clearArmedDrag, startDrag, swallowNextClick],
  );

  const promoteArmedDrag = useCallback(
    (event: {
      pointerId: number;
      clientX: number;
      clientY: number;
      timeStamp: number;
    }) => {
      const armed = armedDragRef.current;
      if (!armed || armed.pointerId !== event.pointerId) return false;
      if (dragRef.current) {
        clearArmedDrag();
        return false;
      }
      if (
        Math.hypot(event.clientX - armed.x, event.clientY - armed.y) <=
        ARMED_DRAG_THRESHOLD_PX
      ) {
        return false;
      }
      const origin = { ...armed };
      clearArmedDrag();
      beginHoldDrag(origin.pointerId, origin.x, origin.y);
      updateDrag(
        event.pointerId,
        event.clientX,
        event.clientY,
        event.timeStamp,
      );
      return true;
    },
    [beginHoldDrag, clearArmedDrag, updateDrag],
  );

  const armDrag = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      clearArmedDrag();
      armedDragRef.current = { pointerId, x: clientX, y: clientY };
      if (typeof window === "undefined") return;
      const onMove = (event: PointerEvent) => {
        if (!promoteArmedDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
      };
      const onUp = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        clearArmedDrag();
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
      armedWindowCleanupRef.current = () => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
      };
    },
    [clearArmedDrag, promoteArmedDrag],
  );

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (presentationRef.current === "collapsed") return;
      if (dragRef.current) return;
      const now = Number.isFinite(event.timeStamp) ? event.timeStamp : 0;
      if (
        isEditBarDoublePress(
          lastPressRef.current,
          event.pointerId,
          event.clientX,
          event.clientY,
          now,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        beginHoldDrag(event.pointerId, event.clientX, event.clientY);
        return;
      }
      lastPressRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: now,
      };
      if (selectedRef.current) {
        // 已选中：任意落点（含按键）只待拖，不 preventDefault，未移动则 click 照常。
        armDrag(event.pointerId, event.clientX, event.clientY);
        return;
      }
      pendingSelectRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    },
    [armDrag, beginHoldDrag],
  );

  const onPointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!promoteArmedDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    [promoteArmedDrag],
  );

  const onPointerUpCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (armedDragRef.current?.pointerId === event.pointerId) {
        clearArmedDrag();
      }
      const pending = pendingSelectRef.current;
      pendingSelectRef.current = null;
      if (!pending || pending.pointerId !== event.pointerId) return;
      if (dragRef.current) return;
      markSelected(true);
    },
    [clearArmedDrag, markSelected],
  );

  const onClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (shouldSwallowClick(event.clientX, event.clientY)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [shouldSwallowClick],
  );

  const onDoubleClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  /**
   * 拖拽手柄取消后，键盘用户就失去了移动这条的唯一入口。改挂在浮层根上：
   * 焦点在条内任意控件时都生效。一律要求 Alt 修饰，否则会和条内的
   * 数字输入框、下拉框抢方向键。
   */
  const onRootKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ".") {
        consumeKey(event);
        toggleCollapsed();
        return;
      }
      if (!event.altKey) return;
      if (event.key === "Enter") {
        if (!dockRootRef) return;
        consumeKey(event);
        toggleDock();
        return;
      }
      const distance = event.shiftKey ? 48 : 16;
      const origin = offsetRef.current;
      let next: FloatingToolbarPoint | null = null;
      if (event.key === "ArrowLeft") {
        next = { ...origin, x: origin.x - distance };
      } else if (event.key === "ArrowRight") {
        next = { ...origin, x: origin.x + distance };
      } else if (event.key === "ArrowUp") {
        next = { ...origin, y: origin.y - distance };
      } else if (event.key === "ArrowDown") {
        next = { ...origin, y: origin.y + distance };
      } else if (event.key === "Home") {
        consumeKey(event);
        resetPosition();
        return;
      }
      if (!next) return;
      consumeKey(event);
      if (modeRef.current === "docked") applyModeAndOffset("floating", next);
      else setSharedOffset(next);
    },
    [
      applyModeAndOffset,
      consumeKey,
      dockRootRef,
      resetPosition,
      setSharedOffset,
      toggleCollapsed,
      toggleDock,
    ],
  );

  useEffect(() => {
    if (!selected || typeof window === "undefined") return;
    const handleOutside = (event: PointerEvent) => {
      if (dragRef.current) return;
      const toolbar = toolbarRef.current;
      if (toolbar?.contains(event.target as Node)) return;
      lastPressRef.current = null;
      markSelected(false);
    };
    window.addEventListener("pointerdown", handleOutside, true);
    return () => window.removeEventListener("pointerdown", handleOutside, true);
  }, [markSelected, selected]);

  // 选中后再按下：条子跟手，松手落下，Esc 还原。不跟「没按住的指针」。
  useEffect(() => {
    if (!moveMode || typeof window === "undefined") return;
    const matching = (event: PointerEvent) => {
      const drag = dragRef.current;
      return Boolean(drag && drag.pointerId === event.pointerId);
    };
    const handleMove = (event: PointerEvent) => {
      if (!matching(event)) return;
      updateDrag(
        event.pointerId,
        event.clientX,
        event.clientY,
        event.timeStamp,
      );
    };
    const releaseCapture = (pointerId: number) => {
      try {
        toolbarRef.current?.releasePointerCapture?.(pointerId);
      } catch {
        // Capture may already be gone.
      }
    };
    const handleUp = (event: PointerEvent) => {
      if (!matching(event)) return;
      event.preventDefault();
      event.stopPropagation();
      settleDrag(event.clientX, event.clientY);
      const pointerId = event.pointerId;
      finishDrag(pointerId);
      swallowNextClick(event.clientX, event.clientY);
      releaseCapture(pointerId);
    };
    const handleCancel = (event: PointerEvent) => {
      if (!matching(event)) return;
      revertDrag();
      finishDrag(event.pointerId);
      releaseClickSuppression();
      releaseCapture(event.pointerId);
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      const pointerId = dragRef.current?.pointerId;
      revertDrag();
      finishDrag();
      releaseClickSuppression();
      if (pointerId !== undefined) releaseCapture(pointerId);
    };
    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", handleUp, true);
    window.addEventListener("pointercancel", handleCancel, true);
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", handleUp, true);
      window.removeEventListener("pointercancel", handleCancel, true);
      window.removeEventListener("keydown", handleKey, true);
    };
  }, [
    finishDrag,
    moveMode,
    releaseClickSuppression,
    revertDrag,
    settleDrag,
    swallowNextClick,
    updateDrag,
  ]);

  const collapsedProps = useMemo(
    () => ({
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.currentTarget.focus();
        startDrag("press", event.pointerId, event.clientX, event.clientY);
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // Pointer capture is optional in embedded/webview implementations.
        }
      },
      onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
        updateDrag(
          event.pointerId,
          event.clientX,
          event.clientY,
          event.timeStamp,
        );
      },
      onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        updateDrag(
          event.pointerId,
          event.clientX,
          event.clientY,
          event.timeStamp,
        );
        const moved = dragRef.current?.moved;
        settleDrag(event.clientX, event.clientY);
        finishDrag(event.pointerId);
        // 拖过就不算点击，否则松手即展开，小圆永远挪不动。
        if (moved) swallowNextClick(event.clientX, event.clientY);
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch {
          // Capture may already be gone after a webview boundary transition.
        }
      },
      onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        revertDrag();
        finishDrag(event.pointerId);
      },
      onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        revertDrag();
        finishDrag(event.pointerId);
      },
      onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
        if (shouldSwallowClick(event.clientX, event.clientY)) {
          event.preventDefault();
          return;
        }
        expand();
      },
      onKeyDown: moveByKeyboard,
    }),
    [
      expand,
      finishDrag,
      moveByKeyboard,
      revertDrag,
      settleDrag,
      shouldSwallowClick,
      startDrag,
      swallowNextClick,
      updateDrag,
    ],
  );

  const pinButton = useMemo(
    () =>
      dockRootRef ? (
        <EditBarPinButton mode={mode} onToggle={toggleDock} />
      ) : null,
    [dockRootRef, mode, toggleDock],
  );

  // 左侧不再有任何 chrome：拖拽手柄取消后前缀区应当彻底让位给插件控件。
  const leading = null;
  const trailing = useMemo(
    () => (
      <>
        {pinButton}
        <EditBarCollapseButton onCollapse={collapse} />
      </>
    ),
    [collapse, pinButton],
  );

  useLayoutEffect(() => {
    // Keep one shell-owned portal for docked and floating modes. React never
    // reparents the captured drag handle mid-gesture, while the clipped
    // absolute overlay cannot enlarge workspace or page scroll dimensions.
    setPortalRoot(
      workspaceRootRef?.current ||
        dockRootRef?.current?.parentElement ||
        stageRef.current,
    );
    setDockRoot(dockRootRef?.current || null);
  }, [dockRootRef, stageRef, workspaceRootRef]);

  useLayoutEffect(() => {
    let restored: EditBarDockState | null = null;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storageKey);
      restored = parseEditBarDockState(raw);
      if (raw && !restored) window.localStorage.removeItem(storageKey);
    } catch {
      // Keep deterministic defaults when storage is unavailable.
    }
    const nextMode =
      restored?.mode === "docked" && !dockRootRef
        ? "floating"
        : restored?.mode || defaultMode;
    const nextOffset = restored?.offset || { x: 0, y: 0 };
    const nextPresentation = restored?.presentation || "expanded";
    modeRef.current = nextMode;
    offsetRef.current = nextOffset;
    presentationRef.current = nextPresentation;
    collapsedPositionRef.current = restored?.collapsedPosition || null;
    setMode(nextMode);
    setOffset(nextOffset);
    setPresentation(nextPresentation);
    setDropActive(false);
    finishDrag();
    hydratedStorageKeyRef.current = storageKey;
    commitPosition(positionForOffset(nextOffset));
  }, [
    commitPosition,
    defaultMode,
    dockRootRef,
    finishDrag,
    positionForOffset,
    resetKey,
    storageKey,
  ]);

  useLayoutEffect(() => {
    setSharedOffset(offsetRef.current, false, mode);
  }, [dockRoot, mode, portalRoot, presentation, setSharedOffset]);

  useLayoutEffect(() => {
    if (!portalRoot) return;
    const update = () => {
      const drag = dragRef.current;
      if (drag?.moved) {
        applyLivePosition(drag.lastPosition, false);
        drag.lastPosition = positionRef.current;
        return;
      }
      if (presentationRef.current === "collapsed") {
        commitPosition(positionForOffset(offsetRef.current, modeRef.current));
        return;
      }
      setSharedOffset(offsetRef.current, false, modeRef.current);
    };
    update();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(update);
    observer?.observe(portalRoot);
    if (stageRef.current && stageRef.current !== portalRoot) {
      observer?.observe(stageRef.current);
    }
    if (dockRoot) observer?.observe(dockRoot);
    if (toolbarRef.current) observer?.observe(toolbarRef.current);
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(update);
    if (toolbarRef.current) {
      mutationObserver?.observe(toolbarRef.current, {
        attributes: true,
        subtree: true,
        attributeFilter: [
          "data-selection-anchor-x",
          "data-selection-anchor-y",
          "data-selection-anchor-width",
          "data-selection-anchor-height",
        ],
      });
    }
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [
    applyLivePosition,
    commitPosition,
    dockRoot,
    mode,
    portalRoot,
    positionForOffset,
    presentation,
    setSharedOffset,
    stageRef,
  ]);

  /**
   * **无依赖数组是刻意的**：每次 commit 之后都重写一遍 transform / opacity。
   * 浮层的 `style` 里已经不再有 transform，所以任何一次 React 重渲染都不会
   * 把动效值盖掉——写入点自始至终只有 `paintMotion()` 一个。
   *
   * 顺带在这里补量展开态的目标盒：`expand()` 排形变时胶囊还没进 DOM，
   * 只有等它挂上来才量得到真实尺寸。
   */
  useLayoutEffect(() => {
    if (morphingRef.current && !morphStartedRef.current) {
      if (!morphToRef.current) {
        const measured = readToolbarBox();
        morphToRef.current =
          measured.width > 0 && measured.height > 0
            ? measured
            : expandedBoxRef.current;
      }
      const to = morphToRef.current;
      if (!to || !(to.width > 0) || !(to.height > 0)) {
        // 量不到就不假装形变，直接落终态：比放一段瞎猜尺寸的动画诚实。
        finishMorph();
      } else {
        morphSpringRef.current?.set(0);
        morphStartedRef.current = true;
        morphSpringRef.current?.setTarget(1);
      }
    }
    paintMotion();
  });

  useEffect(
    () => () => {
      dragRef.current = null;
      pendingSelectRef.current = null;
      lastPressRef.current = null;
      armedDragRef.current = null;
      armedWindowCleanupRef.current?.();
      armedWindowCleanupRef.current = null;
    },
    [],
  );

  /**
   * 广告位与实现的单一事实源：`onRootKeyDown` 认哪些组合键，这里就列哪些。
   * `Alt+Enter` 只在真有停靠位时登场——没有 `dockRootRef` 时 `toggleDock()`
   * 直接返回，广告一个按了没反应的键比不广告更糟。
   * 收起圆不用这一串：它的 `moveByKeyboard` 收**裸**方向键（圆本身是按钮、
   * 拿得到焦点，不必和条内的输入框抢键），广告位在 `EditBarDockControls.tsx`。
   */
  const rootKeyShortcuts = useMemo(
    () =>
      [
        "Alt+ArrowLeft",
        "Alt+ArrowRight",
        "Alt+ArrowUp",
        "Alt+ArrowDown",
        "Alt+Home",
        dockRootRef ? "Alt+Enter" : null,
        "Control+.",
        "Meta+.",
      ]
        .filter((key): key is string => key !== null)
        .join(" "),
    [dockRootRef],
  );

  const rootProps = useMemo(
    () => ({
      onPointerDownCapture,
      onPointerMoveCapture,
      onPointerUpCapture,
      onClickCapture,
      onDoubleClickCapture,
      onKeyDown: onRootKeyDown,
      "aria-keyshortcuts": rootKeyShortcuts,
    }),
    [
      onClickCapture,
      onDoubleClickCapture,
      onPointerDownCapture,
      onPointerMoveCapture,
      onPointerUpCapture,
      onRootKeyDown,
      rootKeyShortcuts,
    ],
  );

  return {
    leading,
    trailing,
    portalRoot,
    dockRoot,
    toolbarRef,
    morphGhostRef,
    morphLiveRef,
    morphing,
    morphGhost,
    morphGhostKind,
    mode,
    dragging,
    dropActive,
    offset,
    position,
    presentation,
    collapsed: presentation === "collapsed",
    moveMode,
    selected,
    rootProps,
    collapsedProps,
    collapse,
    expand,
    toggleCollapsed,
    dock,
    undock,
    resetPosition,
  };
}
