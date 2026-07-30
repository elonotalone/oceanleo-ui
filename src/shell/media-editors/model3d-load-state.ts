/**
 * §3.2 载入状态机。
 *
 * `empty → parsing → closure-resolved → graph-verified → staged → ready`,
 * 旁路终态 `invalid` 与 `degraded`。规格明文列出的五条非法迁移在这里是**数据**,
 * 不是注释:`isLegalModel3DLoadTransition` 对它们一律返回 false,因此
 * 「跳过闭包与图校验直接 ready」这条 0.6 KB 空壳落库路径被封死(§3.2 末)。
 */

export const MODEL3D_LOAD_STATES = [
  "empty",
  "parsing",
  "closure-resolved",
  "graph-verified",
  "staged",
  "ready",
  "invalid",
  "degraded",
] as const;

export type Model3DLoadState = (typeof MODEL3D_LOAD_STATES)[number];

export const MODEL3D_LOAD_EVENTS = [
  "source-bytes",
  "parse-rejected",
  "closure-complete",
  "closure-missing-texture",
  "closure-missing-geometry",
  "graph-equal",
  "graph-mismatch",
  "framed",
  "bounds-degenerate",
  "preview-complete",
] as const;

export type Model3DLoadEvent = (typeof MODEL3D_LOAD_EVENTS)[number];

export interface Model3DLoadTransition {
  from: Model3DLoadState;
  event: Model3DLoadEvent;
  to: Model3DLoadState;
  /** §3.2 迁移表里的触发条件原文。 */
  trigger: string;
}

/** §3.2 迁移表,逐行照抄。 */
export const MODEL3D_LOAD_TRANSITIONS: readonly Model3DLoadTransition[] = [
  {
    from: "empty",
    event: "source-bytes",
    to: "parsing",
    trigger: "取得 source 字节",
  },
  {
    from: "parsing",
    event: "parse-rejected",
    to: "invalid",
    trigger: "非 JSON、asset.version 缺失或不为 \"2.0\"、buffers 缺失",
  },
  {
    from: "parsing",
    event: "closure-complete",
    to: "closure-resolved",
    trigger: "buffers[].uri 与 images[].uri 全部命中依赖闭包",
  },
  {
    from: "parsing",
    event: "closure-missing-texture",
    to: "degraded",
    trigger: "贴图缺失但几何完整，可只渲白模",
  },
  {
    from: "parsing",
    event: "closure-missing-geometry",
    to: "invalid",
    trigger: "buffers 指向的二进制缺失（无几何即无模型）",
  },
  {
    from: "closure-resolved",
    event: "graph-equal",
    to: "graph-verified",
    trigger: "§3.1 graph 六项与实际 glTF 图逐项相等",
  },
  {
    from: "closure-resolved",
    event: "graph-mismatch",
    to: "invalid",
    trigger: "六项中任一不等",
  },
  {
    from: "graph-verified",
    event: "framed",
    to: "staged",
    trigger: "镜头按 §2.1 取景，包围盒非退化",
  },
  {
    from: "staged",
    event: "preview-complete",
    to: "ready",
    trigger: "预览与缩略图渲出且满足 §8.2",
  },
  {
    from: "staged",
    event: "bounds-degenerate",
    to: "invalid",
    trigger: "包围盒退化（任一轴长为 0）",
  },
] as const;

/** §3.2「非法迁移(MUST NOT 发生)」五条,逐条照抄。 */
export const MODEL3D_FORBIDDEN_LOAD_TRANSITIONS: readonly {
  from: Model3DLoadState;
  to: Model3DLoadState;
  reason: string;
}[] = [
  {
    from: "parsing",
    to: "ready",
    reason: "跳过依赖闭包与图校验，正是 0.6 KB 空壳能落库的路径",
  },
  {
    from: "degraded",
    to: "ready",
    reason: "缺贴图的白模 MUST NOT 当作合规产物交付",
  },
  {
    from: "closure-resolved",
    to: "staged",
    reason: "跳过图校验会让 quality evidence 与实际不符，catalog 发布时才炸",
  },
  {
    from: "invalid",
    to: "staged",
    reason: "非法源 MUST NOT 进入取景",
  },
  {
    from: "empty",
    to: "ready",
    reason: "空壳产生路径，MUST 封死",
  },
] as const;

export const MODEL3D_TERMINAL_LOAD_STATES: readonly Model3DLoadState[] = [
  "ready",
  "invalid",
  "degraded",
];

export function isLegalModel3DLoadTransition(
  from: Model3DLoadState,
  to: Model3DLoadState,
): boolean {
  return MODEL3D_LOAD_TRANSITIONS.some(
    (entry) => entry.from === from && entry.to === to,
  );
}

export class Model3DLoadTransitionError extends Error {
  readonly from: Model3DLoadState;
  readonly event: Model3DLoadEvent;

  constructor(from: Model3DLoadState, event: Model3DLoadEvent) {
    super(`3D 载入状态机拒绝迁移：${from} --${event}-->`);
    this.name = "Model3DLoadTransitionError";
    this.from = from;
    this.event = event;
  }
}

/** 受控迁移:未登记的 (state, event) 组合抛错而不是静默停在原状态。 */
export function model3DLoadTransition(
  from: Model3DLoadState,
  event: Model3DLoadEvent,
): Model3DLoadState {
  const transition = MODEL3D_LOAD_TRANSITIONS.find(
    (entry) => entry.from === from && entry.event === event,
  );
  if (!transition) throw new Model3DLoadTransitionError(from, event);
  return transition.to;
}

/**
 * 一次完整载入的判定:只有走完 `closure-resolved → graph-verified → staged`
 * 才可能到 `ready`。`degraded` 与 `invalid` 都不是可交付终态(§5.3)。
 */
export function isDeliverableModel3DLoadState(
  state: Model3DLoadState,
): state is "ready" {
  return state === "ready";
}
