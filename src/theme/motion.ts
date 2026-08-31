// ===========================================================================
// motion.ts — 动效 token 的单一数据源（规范：docs/architecture/motion-system.md）
// ---------------------------------------------------------------------------
// 本文件是【数据 + 纯函数】，不 import 任何东西：`scripts/gen-theme-css.mjs` 用
// `tsc` 单文件编译它（与 theme-config.ts 同一条管线）后 import 取数，把 token 生成
// 进 `src/theme/globals.css` 的 THEME:GENERATED 标记区。**加一个 import 会当场打断
// 那条管线。**
//
// 为什么是这里而不是 CSS 里手写：01-verified-facts.md §2.3 实测 607 条裸 transition
// 对 62 条显式时长——约 90% 的动效跑在 Tailwind 默认的同一档上，没有层级、没有质感。
// token 化之后，「同层同档、跨层差一档」才有地方被表达，也才有地方被机检。
// ===========================================================================

export interface MotionToken {
  /** CSS 自定义属性名，含 `--leo-` 前缀（红线 8：不新增第四套前缀）。 */
  readonly name: string;
  readonly value: string;
  /** 用途，会原样写进生成的 CSS 注释。 */
  readonly use: string;
}

// ── 时长阶梯（motion-system.md §时长阶梯）────────────────────────────────────
// 层级规则比数值本身重要：同一视觉层级用同一档，跨层级差【恰好一档】。
export const MOTION_DURATION_TOKENS: readonly MotionToken[] = [
  { name: "--leo-dur-1", value: "90ms", use: "即时反馈：按下、勾选、开关拨动" },
  { name: "--leo-dur-2", value: "140ms", use: "状态变化：hover、颜色、边框" },
  { name: "--leo-dur-3", value: "200ms", use: "小件进出场：tooltip、popover、菜单" },
  { name: "--leo-dur-4", value: "280ms", use: "面板/对话框进场、抽屉" },
  { name: "--leo-dur-5", value: "380ms", use: "页面级、大面形变" },
  { name: "--leo-dur-6", value: "520ms", use: "大幅 morph、庆祝态" },
];

/**
 * 品牌曲线。**逐字等于**变量化之前 globals.css 里 `.v-fade-up` / `.v-scale-in` /
 * `.v-pop` / `.v-page > *` 四处写着的那条 —— 改品牌曲线不在本波范围
 * （motion-system.md §曲线 的 ⚠ 条）。测试 `motion-tokens.test.mjs` 逐字锁死它。
 */
export const BRAND_EMPHASIS_CURVE = "cubic-bezier(0.21, 1.02, 0.73, 1)";

// ── 曲线（motion-system.md §曲线）───────────────────────────────────────────
// 只有五条。`--leo-ease-spring` 不在这张表里，它由 @supports 分两段落（见下）。
export const MOTION_EASING_TOKENS: readonly MotionToken[] = [
  { name: "--leo-ease-standard", value: "cubic-bezier(0.2, 0, 0, 1)", use: "默认；位置/尺寸变化" },
  { name: "--leo-ease-decelerate", value: "cubic-bezier(0.05, 0.7, 0.1, 1)", use: "入场（从无到有）" },
  { name: "--leo-ease-accelerate", value: "cubic-bezier(0.3, 0, 0.8, 0.15)", use: "退场（从有到无）" },
  { name: "--leo-ease-emphasis", value: BRAND_EMPHASIS_CURVE, use: "既有品牌曲线，不许改值" },
];

// ── 位移幅度与错峰（motion-system.md §位移幅度与错峰）───────────────────────
export const MOTION_MOVE_TOKENS: readonly MotionToken[] = [
  { name: "--leo-move-xs", value: "2px", use: "极小位移" },
  { name: "--leo-move-sm", value: "6px", use: "入场位移；v-fade-up 沿用此值" },
  { name: "--leo-move-md", value: "12px", use: "较大入场位移" },
];

export const MOTION_STAGGER_TOKENS: readonly MotionToken[] = [
  { name: "--leo-stagger", value: "55ms", use: "列表错峰步长；沿用 .v-page 现值" },
  { name: "--leo-stagger-max", value: "320ms", use: "错峰封顶；沿用 .v-page 现值" },
];

// ── 载荷指示器与持续动效（motion-system.md §reduced-motion 的「例外」一段）──
// 这些是【循环】动效，全部长于六档阶梯的顶格 520ms，故不进阶梯、单列一组，
// 值逐字沿用变量化之前的现值（这一组的「逐帧不变」是完整成立的）。
export const MOTION_LOOP_TOKENS: readonly MotionToken[] = [
  { name: "--leo-loop-spin", value: "0.7s", use: "v-spin 转圈一周（载荷指示器）" },
  { name: "--leo-loop-shimmer", value: "1.4s", use: "v-shimmer 骨架微光（载荷指示器）" },
  { name: "--leo-loop-bounce-dot", value: "1.2s", use: "v-bounce-dot 打字点（载荷指示器）" },
  { name: "--leo-loop-pulse-dot", value: "1.6s", use: "v-pulse-dot 状态脉冲（载荷指示器）" },
  { name: "--leo-loop-dot-stagger", value: "0.15s", use: "打字三点之间的相位差" },
  { name: "--leo-loop-blink", value: "0.9s", use: "v-blink 光标闪烁（非载荷指示器）" },
  { name: "--leo-loop-sheen", value: "1.8s", use: "v-sheen 掠光（非载荷指示器）" },
  { name: "--leo-loop-halo", value: "2.6s", use: "leo-halo-breathe 光晕呼吸（非载荷指示器）" },
];

/** 载荷指示器的几何幅度——reduced-motion 下「降幅」降的就是这两个。 */
export const MOTION_AMPLITUDE_TOKENS: readonly MotionToken[] = [
  { name: "--leo-bounce-rise", value: "4px", use: "v-bounce-dot 抬升幅度" },
  { name: "--leo-pulse-ring", value: "4px", use: "v-pulse-dot 外环扩散幅度" },
];

/**
 * 载荷指示器四条（motion-system.md 点名的例外）。reduced-motion 下**不许归零**：
 * 它们表达「系统还在做事」，归零会让用户以为卡死。
 * `motion-tokens.test.mjs` 用这张表做反向断言。
 */
export const LOADING_INDICATOR_TOKENS: readonly string[] = [
  "--leo-loop-spin",
  "--leo-loop-shimmer",
  "--leo-loop-bounce-dot",
  "--leo-loop-pulse-dot",
];

/** reduced-motion 下归零的 token（六档时长 + 错峰两条 + 位移三条）。 */
export const REDUCED_MOTION_ZEROED: readonly MotionToken[] = [
  ...MOTION_DURATION_TOKENS.map((t) => ({ name: t.name, value: "0ms", use: t.use })),
  ...MOTION_STAGGER_TOKENS.map((t) => ({ name: t.name, value: "0ms", use: t.use })),
  ...MOTION_MOVE_TOKENS.map((t) => ({ name: t.name, value: "0px", use: t.use })),
];

/**
 * reduced-motion 下载荷指示器的降级值：**放慢一倍 + 幅度减半**，不归零。
 * 转圈（spin）只放慢不降幅——它没有几何幅度，「降幅」对它等于停转。
 */
export const REDUCED_MOTION_LOOP: readonly MotionToken[] = [
  { name: "--leo-loop-spin", value: "1.4s", use: "放慢一倍" },
  { name: "--leo-loop-shimmer", value: "2.8s", use: "放慢一倍" },
  { name: "--leo-loop-bounce-dot", value: "2.4s", use: "放慢一倍" },
  { name: "--leo-loop-pulse-dot", value: "3.2s", use: "放慢一倍" },
  { name: "--leo-bounce-rise", value: "2px", use: "幅度减半" },
  { name: "--leo-pulse-ring", value: "2px", use: "幅度减半" },
];

// ===========================================================================
// `--leo-ease-spring` 的 linear() 生成
// ---------------------------------------------------------------------------
// motion-system.md §linear() 弹簧曲线的生成方式（规范性）：「**不许手写这串数字。**」
// 规范点名 Linear Easing Generator。这里不是抄它的输出，而是把它的算法逐行搬进本
// 仓，由 `npm run build:themes` 每次重算——**比贴一串数字更满足那条规范的目的**：
// 参数留在代码里、结果可在 CI 里复算、改参数不会忘记同步注释。
//
// 上游出处（jakearchibald/linear-easing-generator，main 分支）：
//   · createSpring 解析解与 duration 求法 → src/shared/App/demos.ts
//   · 10000 个采样点                      → src/workers/process-script/index.ts
//   · Ramer–Douglas–Peucker 简化与舍入     → src/shared/App/useOptimizedPoints.ts
//   · 位置省略、同 y 分组、百分比格式化    → src/shared/App/useLinearSyntax.ts
// 站点默认参数 simplify=0.0017 / round=3 见 src/shared/App/useURLState.ts。
// ===========================================================================

export interface SpringSource {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
  readonly velocity: number;
  /** RDP 简化容差，等于生成器 UI 的 Simplify 滑块默认值。 */
  readonly simplify: number;
  /** 舍入位数，等于规范里的「3 位小数」。 */
  readonly round: number;
}

/** motion-system.md 指定的四个参数 + 生成器站点默认的简化/舍入。 */
export const SPRING_SOURCE: SpringSource = {
  stiffness: 210,
  damping: 20,
  mass: 1,
  velocity: 0,
  simplify: 0.0017,
  round: 3,
};

type Point = [number, number];

/**
 * 阻尼谐振子解析解 + 生成器求「理想时长」的那套走法。
 * 返回 `[durationMs, 归一化到 0..1 的缓动函数]`，与上游 createSpring 逐行等价。
 */
export function createSpring(src: SpringSource): [durationMs: number, ease: (t: number) => number] {
  const { mass, stiffness, damping, velocity } = src;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const wd = zeta < 1 ? w0 * Math.sqrt(1 - zeta * zeta) : 0;
  const b = zeta < 1 ? (zeta * w0 + -velocity) / wd : -velocity + w0;

  function solver(t: number): number {
    let v: number;
    if (zeta < 1) {
      v = Math.exp(-t * zeta * w0) * (1 * Math.cos(wd * t) + b * Math.sin(wd * t));
    } else {
      v = (1 + b * t) * Math.exp(-t * w0);
    }
    return 1 - v;
  }

  // 连续 16 个 1/6 秒步长都落在 0.001 之内，就认定从第一个落进来的时刻起已静止。
  const duration = ((): number => {
    const step = 1 / 6;
    let time = 0;
    // 上界只是防呆：210/20/1 这组参数在 5/6 秒就静止了。
    while (time < 100) {
      if (Math.abs(1 - solver(time)) < 0.001) {
        const restStart = time;
        let restSteps = 1;
        while (true) {
          time += step;
          if (Math.abs(1 - solver(time)) >= 0.001) break;
          restSteps++;
          if (restSteps === 16) return restStart;
        }
      }
      time += step;
    }
    throw new Error("spring never settles; check stiffness/damping/mass");
  })();

  return [duration * 1000, (t: number) => solver(duration * t)];
}

// 点到线段的平方距离（上游 getSqSegDist）。
function sqSegDist(p: Point, p1: Point, p2: Point): number {
  let x = p1[0];
  let y = p1[1];
  let dx = p2[0] - x;
  let dy = p2[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2[0];
      y = p2[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplifyStep(points: Point[], first: number, last: number, sqTolerance: number, out: Point[]): void {
  let maxSqDist = sqTolerance;
  let index = -1;

  for (let i = first + 1; i < last; i++) {
    const d = sqSegDist(points[i], points[first], points[last]);
    if (d > maxSqDist) {
      index = i;
      maxSqDist = d;
    }
  }

  if (maxSqDist > sqTolerance && index !== -1) {
    if (index - first > 1) simplifyStep(points, first, index, sqTolerance, out);
    out.push(points[index]);
    if (last - index > 1) simplifyStep(points, index, last, sqTolerance, out);
  }
}

/** Ramer–Douglas–Peucker（上游 simplifyDouglasPeucker）。 */
function simplifyDouglasPeucker(points: Point[], tolerance: number): Point[] {
  if (points.length <= 1) return points;
  const sqTolerance = tolerance * tolerance;
  const last = points.length - 1;
  const out: Point[] = [points[0]];
  simplifyStep(points, 0, last, sqTolerance, out);
  out.push(points[last]);
  return out;
}

/** 上游 worker 的采样密度。 */
const SAMPLE_COUNT = 10_000;

/**
 * 生成 `linear()` 的实参串（不含 `linear(` 与 `)`）。
 * 与上游 useLinearSyntax 一致：省略可推断的位置、按相同 y 分组、x 用百分比。
 */
export function springLinearStops(src: SpringSource = SPRING_SOURCE): string {
  const [, ease] = createSpring(src);
  const { simplify, round } = src;

  const full: Point[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const pos = i / (SAMPLE_COUNT - 1);
    full.push([pos, ease(pos)]);
  }

  // x 是百分比，低于 2 位没有意义（上游同款下限）。
  const xRounding = Math.max(round, 2);
  const points: Point[] = simplifyDouglasPeucker(full, simplify).map(
    ([x, y]) =>
      [Math.round(x * 10 ** xRounding) / 10 ** xRounding, Math.round(y * 10 ** round) / 10 ** round] as Point,
  );

  const xFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.max(round - 2, 0) });
  const yFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: round });

  // 哪些点的位置可以省略：首点在 0、末点在 1、以及正好落在前后两点中点的。
  const redundantX = new Set<Point>();
  const maxDelta = 1 / 10 ** round;

  points.forEach((value, i) => {
    const x = value[0];
    if (i === 0) {
      if (x === 0) redundantX.add(value);
      return;
    }
    if (i === points.length - 1) {
      if (x === 1 && points[i - 1][0] <= 1) redundantX.add(value);
      return;
    }
    const previous = points[i - 1][0];
    const next = points[i + 1][0];
    const averagePos = (next - previous) / 2 + previous;
    if (Math.abs(x - averagePos) < maxDelta) redundantX.add(value);
  });

  // 相同 y 的相邻点并成一组，组内可以只写首尾位置。
  const grouped: Point[][] = [[points[0]]];
  for (const value of points.slice(1)) {
    const tail = grouped[grouped.length - 1];
    if (value[1] === tail[0][1]) tail.push(value);
    else grouped.push([value]);
  }

  return grouped
    .map((group) => {
      const yValue = yFormat.format(group[0][1]);
      const regular = group
        .map((value) => (redundantX.has(value) ? yValue : `${yValue} ${xFormat.format(value[0] * 100)}%`))
        .join(", ");

      if (group.length === 1) return regular;

      const positional = [group[0][0], group[group.length - 1][0]]
        .map((x) => `${xFormat.format(x * 100)}%`)
        .join(" ");
      const skip = `${yValue} ${positional}`;
      return skip.length > regular.length ? regular : skip;
    })
    .join(", ");
}

// ===========================================================================
// 存量裸时长预算锁（motion-system.md §Proof and acceptance / W01 P5）
// ---------------------------------------------------------------------------
// 存量裸时长分散在别人的独占面上，W01 不改它们，只建这道闸：**只减不增**。
//
// 口径（tests/motion-no-raw-duration.test.mjs 用的是同一套，改一边必须改另一边）：
//   正则：\bduration-\[?[0-9]      —— 覆盖 `duration-150` 与任意值 `duration-[240ms]`
//   范围：src/ 全部，排除三个非调用点的文件：ui.css（tailwind --minify 的编译产物）、
//         globals.css（token 落地处）、以及本文件（token 数据源）
//   下过正对照：rg -c "duration-200" src/shell/AppShell.tsx → 3，正则本身可用
//               （_COMMON.md §7b③：零命中/计数类断言先验正则）
//
// 62 是 01-verified-facts.md §2.3 的数字，**未经本闸口径校准，实测不成立**：
// 台账表内 duration-* 分档相加也只有 53，且它没排除编译产物、口径未写明。
// 本闸口径实测 46 处（20 个文件）。
// 另：src/ 内联 `transition: …ms`（非 CSS 文件）实测 0 处，不构成第二个计数源。
// 2026-08-31 实测。
// ===========================================================================

/** 允许存在的裸 Tailwind 时长工具类（`duration-150` 之类）总数上限。 */
export const PENDING_RAW_DURATION = 46;
