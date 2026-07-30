/**
 * workflow.md §3.3 图的确定性要求 + §5.1 / §5.3 / §5.4 的图与版本树自洽判据。
 *
 * 「同一份图 + 同一批素材 MUST 产出逐位相同的结果」在平台侧的可判形式是:
 *   1. 规范化(`canonicalizeGraph`)把任意书写顺序折成唯一序;
 *   2. 指纹(`graphFingerprint`)对规范化结果取值,同图同序 → 同指纹;
 *   3. 拓扑序(`topologicalOrder`)在并列可选时按 id 字典序定序,不依赖插入顺序。
 *
 * 除零 / NaN / 随机三项按 §3.3 逐条判;表达式语言按 §3.3 末条与
 * `interactive-doc.md` §3.4 的封闭子集一致 —— 本模块只做**语法面**的封闭子集
 * 拒绝(`eval`、`new Function`、随机函数、动态 import 一律不允许出现在
 * `edges[].condition` 里),求值器本体归 interactive-doc 载体,MUST NOT 另立一套。
 */

import {
  VIDEO_CANVAS_CONSTANTS,
  type VideoCanvasEdge,
  type VideoCanvasGraph,
  type VideoCanvasNode,
  type VideoCanvasProject,
  type VideoCanvasVersion,
} from "./video-canvas-schema";

function byId<T extends { id: string }>(left: T, right: T): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function sortedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort();
}

/** 参数对象的确定性投影:键序固定,数值原样保留(不做四舍五入)。 */
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const target: Record<string, unknown> = {};
    for (const key of sortedKeys(source)) target[key] = canonicalValue(source[key]);
    return target;
  }
  return value;
}

/**
 * §3.3 确定性的规范形:节点与边按 id 定序,端口按名定序,参数键按字典序。
 * 同一份图无论以何种书写顺序落库,规范形 MUST 逐位相同。
 */
export function canonicalizeGraph(graph: VideoCanvasGraph): VideoCanvasGraph {
  return {
    nodes: [...graph.nodes].sort(byId).map((node) => ({
      ...node,
      ports: {
        inputs: [...(node.ports.inputs || [])].sort((a, b) =>
          a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
        ),
        outputs: [...(node.ports.outputs || [])].sort((a, b) =>
          a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
        ),
      },
      ...(node.params
        ? { params: canonicalValue(node.params) as Record<string, unknown> }
        : {}),
    })),
    edges: [...graph.edges].sort(byId),
  };
}

/** FNV-1a(32 位,两轮)—— 纯函数、无平台依赖的稳定摘要,只用于同一性比较。 */
function stableDigest(text: string): string {
  let low = 0x811c9dc5;
  let high = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    low = Math.imul(low ^ code, 0x01000193) >>> 0;
    high = Math.imul(high ^ ((code << 1) | (index & 1)), 0x85ebca6b) >>> 0;
  }
  return `${low.toString(16).padStart(8, "0")}${high.toString(16).padStart(8, "0")}`;
}

/** 图指纹:先规范化再取摘要,故与节点/边的书写顺序无关。 */
export function graphFingerprint(graph: VideoCanvasGraph): string {
  return stableDigest(JSON.stringify(canonicalizeGraph(graph)));
}

export interface TopologicalOrderResult {
  ok: boolean;
  /** Kahn 序,并列可选时按 id 字典序 —— 同图同序。 */
  order: string[];
  /** §5.3:环上完整节点 id 序列,每个环一条。 */
  cycles: string[][];
  /** 拓扑排序后的最长路径层数,对照 C16 ≤ 64。 */
  depth: number;
}

/**
 * 确定性 Kahn 拓扑排序 + 环检测。
 * 有环时 `ok = false`,并给出环上完整节点 id 序列(§5.3 MUST 打印)。
 */
export function topologicalOrder(graph: VideoCanvasGraph): TopologicalOrderResult {
  const ids = [...graph.nodes.map((node) => node.id)].sort();
  const known = new Set(ids);
  const indegree = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of graph.edges) {
    if (!known.has(edge.fromNodeId) || !known.has(edge.toNodeId)) continue;
    outgoing.get(edge.fromNodeId)?.push(edge.toNodeId);
    indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) || 0) + 1);
  }
  for (const targets of outgoing.values()) targets.sort();

  const depthOf = new Map<string, number>();
  const queue = ids.filter((id) => (indegree.get(id) || 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    queue.sort();
    const id = queue.shift() as string;
    order.push(id);
    const currentDepth = depthOf.get(id) || 1;
    depthOf.set(id, currentDepth);
    for (const target of outgoing.get(id) || []) {
      depthOf.set(target, Math.max(depthOf.get(target) || 0, currentDepth + 1));
      const next = (indegree.get(target) || 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }

  const cycles = order.length === ids.length ? [] : findCycles(graph, order);
  const depth = order.length
    ? Math.max(...order.map((id) => depthOf.get(id) || 1))
    : 0;
  return { ok: order.length === ids.length, order, cycles, depth };
}

function findCycles(
  graph: VideoCanvasGraph,
  settled: readonly string[],
): string[][] {
  const remaining = new Set(
    graph.nodes.map((node) => node.id).filter((id) => !settled.includes(id)),
  );
  const outgoing = new Map<string, string[]>();
  for (const id of remaining) outgoing.set(id, []);
  for (const edge of graph.edges) {
    if (!remaining.has(edge.fromNodeId) || !remaining.has(edge.toNodeId)) continue;
    outgoing.get(edge.fromNodeId)?.push(edge.toNodeId);
  }
  for (const targets of outgoing.values()) targets.sort();

  const cycles: string[][] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const walk = (id: string) => {
    stack.push(id);
    onStack.add(id);
    for (const target of outgoing.get(id) || []) {
      if (onStack.has(target)) {
        const start = stack.indexOf(target);
        const cycle = stack.slice(start);
        const signature = [...cycle].sort().join(">");
        if (!cycles.some((known) => [...known].sort().join(">") === signature)) {
          cycles.push([...cycle, target]);
        }
        continue;
      }
      if (!seen.has(target)) {
        seen.add(target);
        walk(target);
      }
    }
    stack.pop();
    onStack.delete(id);
  };

  for (const id of [...remaining].sort()) {
    if (seen.has(id)) continue;
    seen.add(id);
    walk(id);
  }
  return cycles;
}

/** §5.1:从 `output` 节点反向可达全部节点,不可达者是死节点,MUST 报出。 */
export function unreachableFromOutput(graph: VideoCanvasGraph): string[] {
  const outputs = graph.nodes
    .filter((node) => node.kind === "output")
    .map((node) => node.id);
  const incoming = new Map<string, string[]>(
    graph.nodes.map((node) => [node.id, []]),
  );
  for (const edge of graph.edges) {
    incoming.get(edge.toNodeId)?.push(edge.fromNodeId);
  }
  const reached = new Set(outputs);
  const queue = [...outputs];
  while (queue.length) {
    const id = queue.shift() as string;
    for (const source of incoming.get(id) || []) {
      if (reached.has(source)) continue;
      reached.add(source);
      queue.push(source);
    }
  }
  return graph.nodes
    .map((node) => node.id)
    .filter((id) => !reached.has(id))
    .sort();
}

/** 出度 ≥ 2 或 `kind = branch` 的节点(C11 分支判据)。 */
export function branchNodeIds(graph: VideoCanvasGraph): string[] {
  const outDegree = new Map<string, number>();
  for (const edge of graph.edges) {
    outDegree.set(edge.fromNodeId, (outDegree.get(edge.fromNodeId) || 0) + 1);
  }
  return graph.nodes
    .filter(
      (node) => node.kind === "branch" || (outDegree.get(node.id) || 0) >= 2,
    )
    .map((node) => node.id)
    .sort();
}

export interface VersionTreeReport {
  ok: boolean;
  /** §5.4:恰有一个根(无 `parentId` 者)。 */
  rootIds: string[];
  /** `parentId` 指向不存在的版本(§6 F7)。 */
  danglingParentIds: string[];
  /** 版本树内的环。 */
  cyclicVersionIds: string[];
  /** `headVersionId` 是否命中 `versions[].id`。 */
  headResolved: boolean;
}

/** §5.4 + §6 F7:版本树自洽。 */
export function versionTreeReport(project: VideoCanvasProject): VersionTreeReport {
  const versions = project.versions || [];
  const ids = new Set(versions.map((version) => version.id));
  const rootIds = versions
    .filter((version) => !version.parentId)
    .map((version) => version.id)
    .sort();
  const danglingParentIds = versions
    .filter((version) => version.parentId && !ids.has(version.parentId))
    .map((version) => version.parentId as string)
    .sort();
  const parents = new Map(
    versions.map((version) => [version.id, version.parentId || ""]),
  );
  const cyclic = new Set<string>();
  for (const version of versions) {
    const seen = new Set<string>([version.id]);
    let cursor = parents.get(version.id) || "";
    while (cursor && ids.has(cursor)) {
      if (seen.has(cursor)) {
        cyclic.add(version.id);
        break;
      }
      seen.add(cursor);
      cursor = parents.get(cursor) || "";
    }
  }
  const headResolved = ids.has(project.headVersionId);
  return {
    ok:
      headResolved &&
      rootIds.length === 1 &&
      danglingParentIds.length === 0 &&
      cyclic.size === 0,
    rootIds,
    danglingParentIds,
    cyclicVersionIds: [...cyclic].sort(),
    headResolved,
  };
}

/**
 * §3.3 表达式封闭子集的语法闸。文法与函数白名单归 `interactive-doc.md` §3.4,
 * 本闸只拒绝规格逐条点名的非确定性与逃逸构造,MUST NOT 另立一套文法。
 */
const FORBIDDEN_EXPRESSION_CONSTRUCTS = Object.freeze([
  "eval",
  "Function",
  "import",
  "require",
  "Math.random",
  "random(",
  "Date.now",
  "now(",
  "=>",
  "`",
] as const);

export type DeterminismFinding =
  | { code: "non-deterministic-param"; nodeId: string; paramPath: string }
  | { code: "unseeded-random"; nodeId: string; paramPath: string }
  | { code: "nan-param"; nodeId: string; paramPath: string }
  | { code: "division-by-zero-unguarded"; nodeId: string; paramPath: string }
  | { code: "forbidden-expression"; edgeId: string; construct: string }
  | { code: "division-by-zero-unguarded-condition"; edgeId: string };

export interface DeterminismReport {
  ok: boolean;
  findings: DeterminismFinding[];
}

/** 明示随机时,种子 MUST 落库(§3.3 第 1 条)。 */
const RANDOM_PARAM_KEYS = Object.freeze(["random", "jitter", "shuffle"] as const);
const NON_DETERMINISTIC_PARAM_KEYS = Object.freeze([
  "now",
  "timestamp",
  "currentTime",
  "wallClock",
  "hostname",
  "sessionId",
] as const);

function hasSeed(params: Record<string, unknown>): boolean {
  return Object.keys(params).some((key) => /seed/i.test(key));
}

/** 表达式里的除法是否带兜底(三元、`||`、`??`、`safeDiv` 之一)。 */
function divisionIsGuarded(expression: string): boolean {
  if (!expression.includes("/")) return true;
  return /\?|\|\||\?\?|safeDiv|guard|max\(|abs\(|!==\s*0|!=\s*0|>\s*0/.test(
    expression,
  );
}

/**
 * 只有表达式位才做除零检查 —— 普通文本参数里的 `/` 是内容,不是运算符。
 * 键名约定与 `interactive-doc.md` §3.4 的表达式位一致。
 */
const EXPRESSION_PARAM_KEY = /expr|expression|formula|equation|condition/i;

function walkParams(
  node: VideoCanvasNode,
  findings: DeterminismFinding[],
): void {
  const params = node.params;
  if (!params) return;
  const visit = (value: unknown, path: string, isExpression: boolean) => {
    if (typeof value === "number" && Number.isNaN(value)) {
      findings.push({ code: "nan-param", nodeId: node.id, paramPath: path });
      return;
    }
    if (typeof value === "string") {
      if (isExpression && !divisionIsGuarded(value)) {
        findings.push({
          code: "division-by-zero-unguarded",
          nodeId: node.id,
          paramPath: path,
        });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) =>
        visit(entry, `${path}/${index}`, isExpression),
      );
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        visit(entry, `${path}/${key}`, isExpression || EXPRESSION_PARAM_KEY.test(key));
      }
    }
  };

  for (const [key, value] of Object.entries(params)) {
    const path = `params/${key}`;
    if (NON_DETERMINISTIC_PARAM_KEYS.some((banned) => key === banned)) {
      findings.push({
        code: "non-deterministic-param",
        nodeId: node.id,
        paramPath: path,
      });
      continue;
    }
    if (
      RANDOM_PARAM_KEYS.some((random) => key.toLowerCase().includes(random)) &&
      !hasSeed(params)
    ) {
      findings.push({
        code: "unseeded-random",
        nodeId: node.id,
        paramPath: path,
      });
    }
    visit(value, path, EXPRESSION_PARAM_KEY.test(key));
  }
}

/**
 * §3.3 四项(确定性 / 除零 / NaN / 表达式封闭子集)的可判形式。
 * 任一项不成立即 MUST NOT 进入 `parser-passed`(§3.2)。
 */
export function assessDeterminism(version: VideoCanvasVersion): DeterminismReport {
  const findings: DeterminismFinding[] = [];
  for (const node of version.graph.nodes) walkParams(node, findings);
  for (const edge of version.graph.edges as readonly VideoCanvasEdge[]) {
    const condition = edge.condition;
    if (!condition) continue;
    for (const construct of FORBIDDEN_EXPRESSION_CONSTRUCTS) {
      if (condition.includes(construct)) {
        findings.push({
          code: "forbidden-expression",
          edgeId: edge.id,
          construct,
        });
      }
    }
    if (!divisionIsGuarded(condition)) {
      findings.push({
        code: "division-by-zero-unguarded-condition",
        edgeId: edge.id,
      });
    }
  }
  return { ok: findings.length === 0, findings };
}

/** C16:拓扑排序后最长路径 ≤ 64 层。 */
export function graphDepthWithinBudget(graph: VideoCanvasGraph): boolean {
  return (
    topologicalOrder(graph).depth <= VIDEO_CANVAS_CONSTANTS.C16_GRAPH_DEPTH_MAX
  );
}

/**
 * §7 A11 / A12 与 §6 F8 的反孪生判据:对规范化后的图结构取 token 集算 Jaccard。
 * 只换 `note`、只改坐标的复制品 token 集完全相同 → 1.0,直接落在 C45 孪生阈之上。
 */
export function graphJaccard(
  left: VideoCanvasGraph,
  right: VideoCanvasGraph,
): number {
  const tokensOf = (graph: VideoCanvasGraph): Set<string> => {
    const canonical = canonicalizeGraph(graph);
    const tokens = new Set<string>();
    for (const node of canonical.nodes) {
      tokens.add(`node:${node.kind}`);
      for (const port of node.ports.inputs || []) {
        tokens.add(`in:${node.kind}:${port.dataType}`);
      }
      for (const port of node.ports.outputs || []) {
        tokens.add(`out:${node.kind}:${port.dataType}`);
      }
      for (const key of Object.keys(node.params || {})) {
        tokens.add(`param:${node.kind}:${key}`);
      }
    }
    const kindOf = new Map(canonical.nodes.map((node) => [node.id, node.kind]));
    for (const edge of canonical.edges) {
      tokens.add(
        `edge:${kindOf.get(edge.fromNodeId) || "?"}>${
          kindOf.get(edge.toNodeId) || "?"
        }`,
      );
    }
    return tokens;
  };
  const a = tokensOf(left);
  const b = tokensOf(right);
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}
