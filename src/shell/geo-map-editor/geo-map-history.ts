import type { GeoMapErrorCode, GeoMapProject } from "./geo-map-schema";

const GEO_MAP_HISTORY_LIMIT = 80;

function cloneGeoMapProject(project: GeoMapProject): GeoMapProject {
  return JSON.parse(JSON.stringify(project)) as GeoMapProject;
}

function sameGeoMapProject(
  left: GeoMapProject,
  right: GeoMapProject,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * One project history shared by every geo-map surface. Layer selection and
 * camera-only view moves never enter the stack; each successful model mutation
 * records exactly one snapshot.
 */
export class GeoMapProjectHistory {
  readonly limit: number;
  #past: GeoMapProject[] = [];
  #future: GeoMapProject[] = [];

  constructor(limit = GEO_MAP_HISTORY_LIMIT) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  reset(): void {
    this.#past = [];
    this.#future = [];
  }

  record(before: GeoMapProject, after: GeoMapProject): boolean {
    if (sameGeoMapProject(before, after)) return false;
    this.#past = [...this.#past, cloneGeoMapProject(before)].slice(-this.limit);
    this.#future = [];
    return true;
  }

  undo(current: GeoMapProject): GeoMapProject | null {
    const previous = this.#past.pop();
    if (!previous) return null;
    this.#future.push(cloneGeoMapProject(current));
    return cloneGeoMapProject(previous);
  }

  redo(current: GeoMapProject): GeoMapProject | null {
    const next = this.#future.pop();
    if (!next) return null;
    this.#past.push(cloneGeoMapProject(current));
    return cloneGeoMapProject(next);
  }
}

export type GeoMapLoadState =
  | "empty"
  | "parsing"
  | "resolving"
  | "ready"
  | "dirty"
  | "saving"
  | "invalid"
  | "degraded";

export type GeoMapLoadEvent =
  | "source-bytes"
  | "parse-failed"
  | "schema-ok"
  | "closure-complete"
  | "closure-partial"
  | "closure-empty"
  | "edit"
  | "commit"
  | "commit-accepted"
  | "commit-conflict";

export interface GeoMapLoadTransition {
  from: GeoMapLoadState;
  event: GeoMapLoadEvent;
  to: GeoMapLoadState;
  /** geo-map.md §3.3 trigger column, kept verbatim for the acceptance table. */
  trigger: string;
}

/** geo-map.md §3.3, all ten rows in spec order. */
export const GEO_MAP_LOAD_TRANSITIONS: readonly GeoMapLoadTransition[] =
  Object.freeze([
    {
      from: "empty",
      event: "source-bytes",
      to: "parsing",
      trigger: "取得 source rendition 字节",
    },
    {
      from: "parsing",
      event: "parse-failed",
      to: "invalid",
      trigger: "JSON 解析失败，或 §3.2 校验失败",
    },
    {
      from: "parsing",
      event: "schema-ok",
      to: "resolving",
      trigger: "schema 校验通过",
    },
    {
      from: "resolving",
      event: "closure-complete",
      to: "ready",
      trigger:
        "dependencies[] 全部 sha256 命中且 layers[].source 全部解析到 sources 的键",
    },
    {
      from: "resolving",
      event: "closure-partial",
      to: "degraded",
      trigger: '有依赖缺失但 basemap.provider != "none"，可只渲底图',
    },
    {
      from: "resolving",
      event: "closure-empty",
      to: "invalid",
      trigger: '全部依赖缺失，或 basemap.provider == "none" 且依赖缺失',
    },
    {
      from: "ready",
      event: "edit",
      to: "dirty",
      trigger: "编辑器发生任一字段变更",
    },
    {
      from: "dirty",
      event: "commit",
      to: "saving",
      trigger: "提交 CommitRevisionRequest",
    },
    {
      from: "saving",
      event: "commit-accepted",
      to: "ready",
      trigger: "收到新 revision_id",
    },
    {
      from: "saving",
      event: "commit-conflict",
      to: "dirty",
      trigger: "expected_revision_id 冲突，回落并保留本地变更",
    },
  ] as const);

/**
 * Editing while already dirty is the same state, not a spec row. It is kept out
 * of GEO_MAP_LOAD_TRANSITIONS so the acceptance table can compare that array
 * against §3.3 one row at a time.
 */
const GEO_MAP_SELF_TRANSITIONS: readonly {
  from: GeoMapLoadState;
  event: GeoMapLoadEvent;
}[] = Object.freeze([{ from: "dirty", event: "edit" }] as const);

/** geo-map.md §3.3 "非法迁移(MUST NOT 发生，发生即为缺陷)". */
export const GEO_MAP_ILLEGAL_TRANSITIONS: readonly {
  from: GeoMapLoadState;
  to: GeoMapLoadState;
  reason: string;
}[] = Object.freeze([
  { from: "parsing", to: "ready", reason: "跳过依赖解析" },
  {
    from: "degraded",
    to: "saving",
    reason: "降级态保存会把缺依赖的状态写成新 revision，制造第二个空壳",
  },
  { from: "invalid", to: "dirty", reason: "非法源不得进入可编辑态" },
  { from: "ready", to: "empty", reason: "不得静默丢弃已载入工程" },
  {
    from: "saving",
    to: "invalid",
    reason: "保存路径不得用校验失败当终态，必须退回 dirty 并保留字节",
  },
] as const);

export function geoMapIsIllegalTransition(
  from: GeoMapLoadState,
  to: GeoMapLoadState,
): boolean {
  return GEO_MAP_ILLEGAL_TRANSITIONS.some(
    (entry) => entry.from === from && entry.to === to,
  );
}

/** Returns the next state, or null when the event is not legal from `from`. */
export function geoMapNextLoadState(
  from: GeoMapLoadState,
  event: GeoMapLoadEvent,
): GeoMapLoadState | null {
  const row = GEO_MAP_LOAD_TRANSITIONS.find(
    (entry) => entry.from === from && entry.event === event,
  );
  if (row) {
    return geoMapIsIllegalTransition(row.from, row.to) ? null : row.to;
  }
  return GEO_MAP_SELF_TRANSITIONS.some(
    (entry) => entry.from === from && entry.event === event,
  )
    ? from
    : null;
}

export const GEO_MAP_EDITABLE_STATES: readonly GeoMapLoadState[] = Object.freeze(
  ["ready", "dirty"] as const,
);

export function geoMapStateAllowsMutation(state: GeoMapLoadState): boolean {
  return GEO_MAP_EDITABLE_STATES.includes(state);
}

/**
 * `degraded` accepts no mutation event at all. §3.3 only names `degraded →
 * saving` as illegal, but allowing `degraded → dirty` would reach `saving`
 * through `dirty → saving` and persist an incomplete closure anyway, which is
 * exactly the second hollow shell that transition forbids.
 */
export function geoMapStateAllowsSave(state: GeoMapLoadState): boolean {
  return state === "dirty";
}

/**
 * §6 names one controlled code per failure mode and the schema plane owns that
 * list. The viewport never invents a second vocabulary for the same failures.
 */
export type GeoMapFailureCode = GeoMapErrorCode;

export interface GeoMapFailure {
  code: GeoMapFailureCode;
  /** Single-sentence headline; the stage must never render a blank surface. */
  summary: string;
  /** Per-item evidence, for example each dangling layer id or missing sha256. */
  details: readonly string[];
}

export class GeoMapLoadMachine {
  #state: GeoMapLoadState = "empty";
  #visited: GeoMapLoadState[] = ["empty"];
  #failure: GeoMapFailure | null = null;

  get state(): GeoMapLoadState {
    return this.#state;
  }

  get visited(): readonly GeoMapLoadState[] {
    return this.#visited;
  }

  get failure(): GeoMapFailure | null {
    return this.#failure;
  }

  reset(): void {
    this.#state = "empty";
    this.#visited = ["empty"];
    this.#failure = null;
  }

  send(event: GeoMapLoadEvent, failure: GeoMapFailure | null = null): boolean {
    const next = geoMapNextLoadState(this.#state, event);
    if (!next) return false;
    if (next !== this.#state) this.#visited.push(next);
    this.#state = next;
    if (next === "invalid" || next === "degraded") {
      this.#failure = failure;
    } else if (next === "ready") {
      this.#failure = null;
    }
    return true;
  }
}
