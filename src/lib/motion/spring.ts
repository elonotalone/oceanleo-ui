/**
 * 第一方弹簧原语。全包只允许存在这一份弹簧实现，规范见
 * `docs/architecture/motion-system.md` §规范二。
 *
 * 为什么不是 CSS：`linear()` 是**预计算**曲线，动画中途被新意图打断时拿不到
 * 当前速度当新动画的初速度，会顿一下。第 ④ 类（值由指针实时驱动、松手后物理
 * 收敛）就死在这一条上，其余四类仍旧全部走 CSS token。
 *
 * 本文件**不出现任何 DOM API**：不取节点、不读几何、不写样式。它只吐数值，
 * 调用方在 `onChange` 里自己写 `transform` / `opacity`。这条约束是可测试性的
 * 全部来源——纯 Node 里就能把积分器跑完，不需要 jsdom。
 * `window.__leoMotionJumpAllToRest` 的挂载因此放在 `./index`，不在这里。
 */

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass?: number;
  restDelta?: number;
  restSpeed?: number;
}

export interface SpringValue {
  readonly current: number;
  readonly velocity: number;
  readonly settled: boolean;
  /** 手势期间直接写值，并由内部速度追踪器记录瞬时速度 */
  set(value: number): void;
  /** 松手后交给弹簧；从当前速度起算，这就是可打断性的全部含义 */
  setTarget(value: number): void;
  /** 外部注入初速度（例如从指针速度追踪器接管） */
  setVelocity(v: number): void;
  /** 订阅每帧值；调用方自己写 DOM，原语不碰 DOM */
  onChange(cb: (value: number, velocity: number) => void): () => void;
  stop(): void;
  /** 立即落到终态。reduced-motion 与视觉回归测试都走这条 */
  jumpToRest(): void;
}

export interface Spring2DValue {
  readonly current: { x: number; y: number };
  readonly velocity: { x: number; y: number };
  set(v: { x: number; y: number }): void;
  setTarget(v: { x: number; y: number }): void;
  /**
   * 外部注入初速度，与 1D 的同名方法同义。
   *
   * 规范 §规范二 的 API 表只给 1D 列了这一条，但它注明的用途
   * （「例如从指针速度追踪器接管」）只可能发生在 2D 上——指针速度是二维的。
   * 这是规范的遗漏，不是刻意的省略，所以这里补齐；差异记在
   * `verdicts/W02-delivery.md` §2。
   */
  setVelocity(v: { x: number; y: number }): void;
  onChange(cb: (v: { x: number; y: number }) => void): () => void;
  stop(): void;
  jumpToRest(): void;
}

const DEFAULT_STIFFNESS = 210;
const DEFAULT_DAMPING = 20;
const DEFAULT_MASS = 1;
const DEFAULT_REST_DELTA = 0.01;
const DEFAULT_REST_SPEED = 0.05;

/** 固定子步长 = 1/120 s。规范二实现约束 1 的上限，不许调大。 */
const SUB_STEP_SECONDS = 1 / 120;
/**
 * 一帧最多补 64ms（8 个子步）。切后台再回来时 `deltaTime` 可能是几十秒，
 * 照实积分就是上千步——那既是一次卡顿，也会把弹簧算飞。丢掉超出的时间比
 * 追平它更接近用户预期：他看到的是「回来时它已经停好了」。
 */
const MAX_FRAME_SECONDS = 0.064;

interface DriverEntry {
  /** @returns 是否仍需下一帧 */
  advance(deltaSeconds: number): boolean;
}

const activeEntries = new Set<DriverEntry>();
let frameHandle = 0;
let lastFrameMs = 0;

function nowMs(): number {
  const clock = globalThis.performance;
  return typeof clock?.now === "function" ? clock.now() : Date.now();
}

/**
 * 每次都从 `globalThis` 现取 rAF，不在模块加载时捕获：捕获会让测试无法替身，
 * 也会在 SSR 求值时炸掉。没有 rAF 的环境退化成定时器，语义不变。
 */
function requestFrame(callback: (timestamp: number) => void): number {
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf === "function") return raf(callback);
  return setTimeout(() => callback(nowMs()), 16) as unknown as number;
}

function cancelFrame(handle: number): void {
  const cancel = globalThis.cancelAnimationFrame;
  if (typeof cancel === "function") cancel(handle);
  else clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}

function scheduleDriver(): void {
  if (frameHandle !== 0 || activeEntries.size === 0) return;
  frameHandle = requestFrame(runFrame);
}

function runFrame(timestamp: number): void {
  frameHandle = 0;
  const previous = lastFrameMs;
  lastFrameMs = timestamp;
  const elapsed =
    previous === 0 ? SUB_STEP_SECONDS : (timestamp - previous) / 1000;
  const delta = Math.min(Math.max(elapsed, 0), MAX_FRAME_SECONDS);
  for (const entry of [...activeEntries]) {
    if (!entry.advance(delta)) activeEntries.delete(entry);
  }
  if (activeEntries.size === 0) {
    // 规范二实现约束 2：全部 settled 就停掉 rAF。空转的 rAF 正是本规范要防的
    // 主线程成本，所以这里不做「留一帧看看」的保险。
    lastFrameMs = 0;
    return;
  }
  scheduleDriver();
}

function joinDriver(entry: DriverEntry): void {
  activeEntries.add(entry);
  scheduleDriver();
}

function leaveDriver(entry: DriverEntry): void {
  if (!activeEntries.delete(entry)) return;
  if (activeEntries.size > 0 || frameHandle === 0) return;
  cancelFrame(frameHandle);
  frameHandle = 0;
  lastFrameMs = 0;
}

/** 单轴积分状态。1D 与 2D 共用，2D 的两轴在同一个 driver entry 里推进。 */
interface Axis {
  current: number;
  velocity: number;
  target: number;
  settled: boolean;
  accumulator: number;
  lastSetMs: number;
}

interface Resolved {
  stiffness: number;
  damping: number;
  mass: number;
  restDelta: number;
  restSpeed: number;
}

function resolveConfig(config?: SpringConfig): Resolved {
  return {
    stiffness: config?.stiffness ?? DEFAULT_STIFFNESS,
    damping: config?.damping ?? DEFAULT_DAMPING,
    mass: config?.mass ?? DEFAULT_MASS,
    restDelta: config?.restDelta ?? DEFAULT_REST_DELTA,
    restSpeed: config?.restSpeed ?? DEFAULT_REST_SPEED,
  };
}

function createAxis(initial: number): Axis {
  return {
    current: initial,
    velocity: 0,
    target: initial,
    settled: true,
    accumulator: 0,
    lastSetMs: 0,
  };
}

function atRest(axis: Axis, config: Resolved): boolean {
  return (
    Math.abs(axis.target - axis.current) < config.restDelta &&
    Math.abs(axis.velocity) < config.restSpeed
  );
}

/** 半隐式欧拉：先更新速度，再用**新**速度更新位置。 */
function integrate(axis: Axis, config: Resolved, step: number): void {
  const acceleration =
    (-config.stiffness * (axis.current - axis.target) -
      config.damping * axis.velocity) /
    config.mass;
  axis.velocity += acceleration * step;
  axis.current += axis.velocity * step;
}

function advanceAxis(axis: Axis, config: Resolved, delta: number): boolean {
  if (axis.settled) return false;
  axis.accumulator += delta;
  // 整数个固定子步；余量留到下一帧，所以掉帧不会改变收敛轨迹的形状。
  while (axis.accumulator >= SUB_STEP_SECONDS) {
    axis.accumulator -= SUB_STEP_SECONDS;
    integrate(axis, config, SUB_STEP_SECONDS);
  }
  if (!atRest(axis, config)) return true;
  settleAxis(axis);
  return false;
}

function settleAxis(axis: Axis): void {
  axis.current = axis.target;
  axis.velocity = 0;
  axis.settled = true;
  axis.accumulator = 0;
}

/**
 * `set()` 期间的瞬时速度。两次写值之间的时间可能是 0（同一帧写两次）或很长
 * （指针停住后又动），都不该让速度炸掉，所以取 4ms~120ms 的窗口之外就不更新。
 */
function trackSetVelocity(axis: Axis, value: number): void {
  const stamp = nowMs();
  const elapsed = stamp - axis.lastSetMs;
  if (axis.lastSetMs > 0 && elapsed >= 4 && elapsed <= 120) {
    axis.velocity = ((value - axis.current) / elapsed) * 1000;
  }
  axis.lastSetMs = stamp;
  axis.current = value;
  axis.target = value;
}

function prefersReducedMotion(): boolean {
  const query = globalThis.matchMedia;
  if (typeof query !== "function") return false;
  try {
    return query.call(globalThis, "(prefers-reduced-motion: reduce)").matches;
  } catch {
    // 老 webview 的 matchMedia 会对不认识的特性抛错；当作「用户没要求降级」。
    return false;
  }
}

/**
 * 活着的弹簧登记处，`jumpAllSpringsToRest()` 靠它把全场按停。
 * 用 `WeakRef` 是因为弹簧没有显式 dispose：组件重挂载会造出新弹簧，
 * 强引用会让每一次路由切换都留一份垃圾。
 */
const livingSprings = new Set<WeakRef<{ jumpToRest(): void }>>();

function registerSpring(spring: { jumpToRest(): void }): void {
  livingSprings.add(new WeakRef(spring));
}

/**
 * 把所有活着的弹簧立刻推到终态并停掉 rAF。
 * `W10` 的离线视觉回归闸在截图前调用它——这是 JS 驱动的弹簧与 Playwright
 * `animations: 'disabled'`（只关 CSS 动画）共存的唯一办法。
 */
export function jumpAllSpringsToRest(): void {
  for (const ref of [...livingSprings]) {
    const spring = ref.deref();
    if (!spring) {
      livingSprings.delete(ref);
      continue;
    }
    spring.jumpToRest();
  }
}

export function createSpring(
  initial: number,
  config?: SpringConfig,
): SpringValue {
  const resolved = resolveConfig(config);
  const axis = createAxis(initial);
  const listeners = new Set<(value: number, velocity: number) => void>();
  const reduced = prefersReducedMotion();

  const emit = () => {
    for (const listener of [...listeners]) listener(axis.current, axis.velocity);
  };

  const entry: DriverEntry = {
    advance(delta) {
      const running = advanceAxis(axis, resolved, delta);
      emit();
      return running;
    },
  };

  const spring: SpringValue = {
    get current() {
      return axis.current;
    },
    get velocity() {
      return axis.velocity;
    },
    get settled() {
      return axis.settled;
    },
    set(value) {
      leaveDriver(entry);
      axis.settled = true;
      axis.accumulator = 0;
      trackSetVelocity(axis, value);
      emit();
    },
    setTarget(value) {
      axis.lastSetMs = 0;
      axis.target = value;
      if (reduced) {
        // 规范二实现约束 5：用户要求减少动效时，setTarget 等价 jumpToRest。
        spring.jumpToRest();
        return;
      }
      if (atRest(axis, resolved)) {
        settleAxis(axis);
        leaveDriver(entry);
        emit();
        return;
      }
      axis.settled = false;
      axis.accumulator = 0;
      joinDriver(entry);
    },
    setVelocity(v) {
      axis.velocity = v;
      axis.lastSetMs = 0;
      if (reduced || Math.abs(v) < resolved.restSpeed) return;
      // 注入了真速度就该看得见运动，即便目标点没变（甩一下会过冲再回来）。
      axis.settled = false;
      axis.accumulator = 0;
      joinDriver(entry);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    stop() {
      leaveDriver(entry);
      axis.target = axis.current;
      axis.velocity = 0;
      axis.settled = true;
      axis.accumulator = 0;
    },
    jumpToRest() {
      settleAxis(axis);
      axis.lastSetMs = 0;
      leaveDriver(entry);
      emit();
    },
  };

  registerSpring(spring);
  return spring;
}

export function createSpring2D(
  initial: { x: number; y: number },
  config?: SpringConfig,
): Spring2DValue {
  const resolved = resolveConfig(config);
  const axisX = createAxis(initial.x);
  const axisY = createAxis(initial.y);
  const listeners = new Set<(v: { x: number; y: number }) => void>();
  const reduced = prefersReducedMotion();

  const emit = () => {
    const value = { x: axisX.current, y: axisY.current };
    for (const listener of [...listeners]) listener(value);
  };

  // 两轴共用一个 entry，所以每帧只 emit 一次；两个独立弹簧会让调用方
  // 每帧写两次 transform，其中一次拿的是另一轴的旧值。
  const entry: DriverEntry = {
    advance(delta) {
      const runningX = advanceAxis(axisX, resolved, delta);
      const runningY = advanceAxis(axisY, resolved, delta);
      emit();
      return runningX || runningY;
    },
  };

  const spring: Spring2DValue = {
    get current() {
      return { x: axisX.current, y: axisY.current };
    },
    get velocity() {
      return { x: axisX.velocity, y: axisY.velocity };
    },
    set(v) {
      leaveDriver(entry);
      axisX.settled = true;
      axisY.settled = true;
      axisX.accumulator = 0;
      axisY.accumulator = 0;
      trackSetVelocity(axisX, v.x);
      trackSetVelocity(axisY, v.y);
      emit();
    },
    setTarget(v) {
      axisX.lastSetMs = 0;
      axisY.lastSetMs = 0;
      axisX.target = v.x;
      axisY.target = v.y;
      if (reduced) {
        spring.jumpToRest();
        return;
      }
      if (atRest(axisX, resolved) && atRest(axisY, resolved)) {
        settleAxis(axisX);
        settleAxis(axisY);
        leaveDriver(entry);
        emit();
        return;
      }
      axisX.settled = atRest(axisX, resolved);
      axisY.settled = atRest(axisY, resolved);
      axisX.accumulator = 0;
      axisY.accumulator = 0;
      joinDriver(entry);
    },
    setVelocity(v) {
      axisX.velocity = v.x;
      axisY.velocity = v.y;
      axisX.lastSetMs = 0;
      axisY.lastSetMs = 0;
      if (reduced) return;
      // 注入了真速度就该看得见运动，即便目标点没变（甩一下会过冲再回来）。
      // 逐轴判：只朝 x 甩时 y 没有理由醒过来多跑一帧。
      let woke = false;
      for (const axis of [axisX, axisY]) {
        if (Math.abs(axis.velocity) < resolved.restSpeed) continue;
        axis.settled = false;
        axis.accumulator = 0;
        woke = true;
      }
      if (woke) joinDriver(entry);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    stop() {
      leaveDriver(entry);
      for (const axis of [axisX, axisY]) {
        axis.target = axis.current;
        axis.velocity = 0;
        axis.settled = true;
        axis.accumulator = 0;
      }
    },
    jumpToRest() {
      settleAxis(axisX);
      settleAxis(axisY);
      axisX.lastSetMs = 0;
      axisY.lastSetMs = 0;
      leaveDriver(entry);
      emit();
    },
  };

  registerSpring(spring);
  return spring;
}
