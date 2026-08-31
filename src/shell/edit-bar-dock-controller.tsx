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
  clampFloatingToolbarToBounds,
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

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}
/**
 * 双击进入移动模式的判定窗口。刻意自己判而不用 onDoubleClick：
 * 原生 dblclick 在两次 click 都派发完之后才触发，控件会被误触两次。
 * 在 pointerdown 的**捕获阶段**判定，才来得及吞掉第二次激活。
 */
const DOUBLE_PRESS_MS = 400;
const DOUBLE_PRESS_SLOP_PX = 10;

interface EditBarDrag {
  /** 移动模式没有捕获指针，用 -1 占位。 */
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
  /** 移动模式：双击后条跟随指针，再点一下落下，Esc 取消。 */
  moveMode: boolean;
  /** 摊到浮层根节点上，实现「双击条上任意位置都能拖」。 */
  rootProps: {
    onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
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
  const lastPressRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
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
  const [dropActive, setDropActive] = useState(false);
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
    const point = positionRef.current;
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
      // 收起态先判：小圆用图层绝对坐标，既不跟选区锚点也不参与停靠。
      if (presentationRef.current === "collapsed") {
        const base = collapsedPositionRef.current || positionRef.current;
        return clampFloatingToolbarToBounds(base, bounds, size);
      }
      const stage = stageRef.current?.getBoundingClientRect();
      const layer = readLayerElement()?.getBoundingClientRect();
      const dockBounds = readDockTargetBounds();
      if (targetMode === "docked" && dockBounds && stage && layer && toolbar) {
        // Sit immediately above the stage/iframe. Vertical centering inside a
        // short dock sentinel let a taller SelectionToolbar chrome overlap the
        // website frame (V5 WEBSITE_EDIT_BAR_MISPLACED gap=-3).
        return dockedFloatingToolbarPosition({
          layerLeft: layer.left,
          layerTop: layer.top,
          dock: dockBounds,
          stageTop: stage.top,
          toolbar: { width: toolbar.width, height: toolbar.height },
        });
      }
      if (!toolbar) return positionRef.current;
      const anchor = defaultPosition();
      return clampFloatingToolbarToBounds(
        { x: anchor.x + nextOffset.x, y: anchor.y + nextOffset.y },
        bounds,
        size,
      );
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
    presentationRef.current = "collapsed";
    setPresentation("collapsed");
    collapsedPositionRef.current = boundedEditBarDockOffset(target);
    commitPosition(collapsedPositionRef.current);
    persistState();
  }, [commitPosition, persistState]);

  const expand = useCallback(() => {
    if (presentationRef.current === "expanded") return;
    presentationRef.current = "expanded";
    setPresentation("expanded");
    persistState();
    // 位置在 DOM 换回胶囊后由 presentation 依赖的 layout effect 重算。
  }, [persistState]);

  const toggleCollapsed = useCallback(() => {
    if (presentationRef.current === "collapsed") expand();
    else collapse();
  }, [collapse, expand]);

  const moveByKeyboard = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        if (!dockRootRef || presentationRef.current === "collapsed") return;
        event.preventDefault();
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
        event.preventDefault();
        resetPosition();
        return;
      }
      if (!next) return;
      event.preventDefault();
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
      dockRootRef,
      resetPosition,
      setCollapsedPosition,
      setSharedOffset,
      toggleDock,
    ],
  );

  const startDrag = useCallback(
    (
      kind: EditBarDrag["kind"],
      pointerId: number,
      clientX: number,
      clientY: number,
    ) => {
      readDockTargetBounds();
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
    [readDockTargetBounds],
  );

  const updateDrag = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== pointerId) return false;
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
      setDropActive(pointNearDock(clientX, clientY));
      return true;
    },
    [applyLivePosition, pointNearDock],
  );

  const settleDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const overDock = pointNearDock(clientX, clientY);
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
    },
    [
      applyModeAndOffset,
      dockRootRef,
      persistState,
      pointNearDock,
      setCollapsedPosition,
      setFloatingPosition,
    ],
  );

  const revertDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    collapsedPositionRef.current = drag.originCollapsedPosition;
    applyModeAndOffset(drag.originMode, drag.originOffset);
  }, [applyModeAndOffset]);

  /**
   * 吞掉紧随其后的一次 click。进入移动模式的第二次按下、以及落下时的那一次
   * 点击，都不应该穿透到控件或画布上。
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

  /** Esc 取消移动后必须立刻解除，否则紧接着的第一次真实点击会被白吞掉。 */
  const releaseClickSuppression = useCallback(() => {
    suppressClickRef.current = null;
    clickSwallowCleanupRef.current?.();
    clickSwallowCleanupRef.current = null;
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

  const beginMoveMode = useCallback(
    (clientX: number, clientY: number) => {
      startDrag("move-mode", -1, clientX, clientY);
      setMoveMode(true);
      swallowNextClick(clientX, clientY);
    },
    [startDrag, swallowNextClick],
  );

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (presentationRef.current === "collapsed") return;
      if (dragRef.current) return;
      const now =
        typeof performance === "undefined" ? Date.now() : performance.now();
      const previous = lastPressRef.current;
      const isDoublePress = Boolean(
        previous &&
          now - previous.time <= DOUBLE_PRESS_MS &&
          Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <=
            DOUBLE_PRESS_SLOP_PX,
      );
      lastPressRef.current = isDoublePress
        ? null
        : { time: now, x: event.clientX, y: event.clientY };
      if (!isDoublePress) return;
      // 捕获阶段吞掉，控件收不到这第二次按下，不会被二次激活。
      event.preventDefault();
      event.stopPropagation();
      beginMoveMode(event.clientX, event.clientY);
    },
    [beginMoveMode],
  );

  const onClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!shouldSwallowClick(event.clientX, event.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    [shouldSwallowClick],
  );

  /**
   * 拖拽手柄取消后，键盘用户就失去了移动这条的唯一入口。改挂在浮层根上：
   * 焦点在条内任意控件时都生效。一律要求 Alt 修饰，否则会和条内的
   * 数字输入框、下拉框抢方向键。
   */
  const onRootKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ".") {
        event.preventDefault();
        toggleCollapsed();
        return;
      }
      if (!event.altKey) return;
      if (event.key === "Enter") {
        if (!dockRootRef) return;
        event.preventDefault();
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
        event.preventDefault();
        resetPosition();
        return;
      }
      if (!next) return;
      event.preventDefault();
      if (modeRef.current === "docked") applyModeAndOffset("floating", next);
      else setSharedOffset(next);
    },
    [
      applyModeAndOffset,
      dockRootRef,
      resetPosition,
      setSharedOffset,
      toggleCollapsed,
      toggleDock,
    ],
  );

  // 移动模式：条跟随指针，任意位置再点一下落下，Esc 还原。
  useEffect(() => {
    if (!moveMode || typeof window === "undefined") return;
    const handleMove = (event: PointerEvent) => {
      updateDrag(-1, event.clientX, event.clientY);
    };
    const handleDown = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      settleDrag(event.clientX, event.clientY);
      finishDrag();
      swallowNextClick(event.clientX, event.clientY);
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      revertDrag();
      finishDrag();
      releaseClickSuppression();
    };
    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerdown", handleDown, true);
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerdown", handleDown, true);
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
        updateDrag(event.pointerId, event.clientX, event.clientY);
      },
      onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        updateDrag(event.pointerId, event.clientX, event.clientY);
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

  useEffect(
    () => () => {
      dragRef.current = null;
    },
    [],
  );

  const rootProps = useMemo(
    () => ({ onPointerDownCapture, onClickCapture, onKeyDown: onRootKeyDown }),
    [onClickCapture, onPointerDownCapture, onRootKeyDown],
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
