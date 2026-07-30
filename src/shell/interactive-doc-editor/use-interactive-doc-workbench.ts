"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMediaBlob } from "../../lib/media-proxy";
import type { EditorManifestV1, LibraryItem } from "../library-data";
import {
  INTERACTIVE_DOC_GRID,
  coerceInteractiveDocParameter,
  formatInteractiveDocValue,
  interactiveDocControlFamily,
  interactiveDocLabelIssue,
  interactiveDocParameterDomainIssue,
  isNumericParameterKind,
  parseInteractiveDocText,
  type InteractiveDocControlDescriptor,
  type InteractiveDocIssue,
  type InteractiveDocParameterValue,
  type InteractiveDocTextToken,
} from "./interactive-doc-controls";
import {
  InteractiveDocHistory,
  emptyInteractiveDocProgress,
  type InteractiveDocProgress,
  type InteractiveDocScheduleProgress,
  type InteractiveDocSnapshot,
} from "./interactive-doc-history";
import type {
  InteractiveDocBlock,
  InteractiveDocProject,
} from "./interactive-doc-schema";

/**
 * Viewport layer for `oceanleo.interactive-doc.v1`: §3.3 compute-graph state
 * machine, the topological sort that drives recompute, and the behaviours the
 * carrier contract calls "带行为" — recompute fan-out, state advancement and
 * validated input.
 *
 * The data layer (`interactive-doc-schema` / `-source` / `-persistence` /
 * `-render`, owner W6) is reached only through {@link InteractiveDocPorts}.
 * `InteractiveDocRoute.tsx` binds the real exports by their pinned signatures;
 * keeping the seam here is what lets the state machine be exercised headlessly
 * and keeps this file free of every runtime code-construction form banned by
 * §1.2 / §5.5 / §3.4 (the closed expression subset). Nothing in this directory
 * imports the chart carrier's editor directory (arbitration D4).
 */

export const INTERACTIVE_DOC_EDITOR_ID = "interactive-doc@1";
export const INTERACTIVE_DOC_SCHEMA_ID = "oceanleo.interactive-doc.v1";
export const INTERACTIVE_DOC_SOURCE_MEDIA_TYPE = "application/json";

/** §4 数值常量表 — the rows this viewport is answerable for. */
export const INTERACTIVE_DOC_LIMITS = {
  parametersMin: 3,
  parametersMax: 120,
  computationsMin: 2,
  computationsMax: 400,
  blocksMin: 4,
  blocksMax: 200,
  expressionMaxChars: 2000,
  assertMaxChars: 1000,
  graphDepthMax: 32,
  nodeDependencyMax: 64,
  functionWhitelistSize: 24,
  precisionMax: 8,
  gridColumns: 12,
  spanMin: 1,
  spanMax: 12,
  recomputeBudgetMsDefault: 200,
  recomputeBudgetMsMax: 2000,
  scenarioSlotsMax: 8,
  inlineRowsMax: 2000,
  externalRowsMax: 200000,
  columnsMax: 64,
  dependencyBytesMax: 16777216,
  dependencyCountMax: 128,
  dependencyClosureBytesMax: 67108864,
  irrIterationsMax: 200,
  tieToleranceCurrency: 0.01,
  easeFactorInitial: 2.5,
  easeFactorFloor: 1.3,
  firstIntervalDays: 1,
  secondIntervalDays: 6,
  qualityMin: 0,
  qualityMax: 5,
  qualityFailBelow: 3,
  quizChoicesMin: 2,
  quizChoicesMax: 10,
  quizItemsMin: 6,
  formulaStepsMin: 2,
  formulaStepsMax: 24,
  chartSeriesMax: 8,
  tableRowsMax: 500,
  sourceBytesMin: 8192,
  sourceBytesMax: 2097152,
  proseCharactersMin: 300,
  boundComputationRatioMin: 0.5,
} as const;

/**
 * §3.4 function whitelist (24 names). Used here only lexically: identifiers in
 * call position are functions, everything else is a reference to a parameter,
 * computation or dataset id and therefore a graph edge. Arity and semantics
 * belong to the data layer's evaluator.
 */
export const INTERACTIVE_DOC_FUNCTION_WHITELIST = [
  "abs",
  "min",
  "max",
  "round",
  "floor",
  "ceil",
  "pow",
  "sqrt",
  "exp",
  "ln",
  "log10",
  "sum",
  "avg",
  "count",
  "median",
  "stdev",
  "npv",
  "irr",
  "pmt",
  "if",
  "clamp",
  "lookup",
  "days",
  "coalesce",
] as const;

const FUNCTION_NAMES = new Set<string>(INTERACTIVE_DOC_FUNCTION_WHITELIST);
const LITERAL_WORDS = new Set(["true", "false", "null"]);

/** §3.3 状态集合. */
export type InteractiveDocPhase =
  | "empty"
  | "parsing"
  | "linking"
  | "ready"
  | "computing"
  | "invalid"
  | "cyclic"
  | "degraded";

export type InteractiveDocEvent =
  | "source-bytes"
  | "parse-failed"
  | "parse-ok"
  | "link-cyclic"
  | "link-degraded"
  | "link-invalid"
  | "link-ready"
  | "parameter-changed"
  | "commit-recompute"
  | "compute-done"
  | "compute-timeout"
  | "reload";

/** §3.3 迁移表, one row per documented transition. */
export const INTERACTIVE_DOC_TRANSITIONS = [
  { from: "empty", event: "source-bytes", to: "parsing" },
  { from: "parsing", event: "parse-failed", to: "invalid" },
  { from: "parsing", event: "parse-ok", to: "linking" },
  { from: "linking", event: "link-cyclic", to: "cyclic" },
  { from: "linking", event: "link-degraded", to: "degraded" },
  { from: "linking", event: "link-invalid", to: "invalid" },
  { from: "linking", event: "link-ready", to: "ready" },
  { from: "ready", event: "parameter-changed", to: "computing" },
  { from: "ready", event: "commit-recompute", to: "computing" },
  { from: "computing", event: "compute-done", to: "ready" },
  { from: "computing", event: "compute-timeout", to: "degraded" },
  { from: "degraded", event: "reload", to: "parsing" },
  { from: "invalid", event: "reload", to: "parsing" },
  { from: "cyclic", event: "reload", to: "parsing" },
  { from: "ready", event: "reload", to: "parsing" },
] as const;

/** §3.3 非法迁移 (MUST NOT 发生). `saving` is modelled by `save()` refusing. */
export const INTERACTIVE_DOC_FORBIDDEN_TRANSITIONS = [
  {
    from: "parsing",
    to: "ready",
    why: "跳过链接期会让悬空引用在用户改参数时才炸",
  },
  {
    from: "cyclic",
    to: "computing",
    why: "有环图求值会栈溢出或死循环",
  },
  { from: "cyclic", to: "ready", why: "有环工程不得当作可用" },
  { from: "degraded", to: "saving", why: "缺依赖态保存会制造第二个残缺产物" },
  { from: "invalid", to: "computing", why: "非法源不得进入求值" },
] as const;

export type InteractiveDocTransitionResult =
  | { ok: true; to: InteractiveDocPhase }
  | {
      ok: false;
      code: "interactive-doc-illegal-transition";
      from: InteractiveDocPhase;
      event: InteractiveDocEvent;
      message: string;
    };

export function interactiveDocTransition(
  from: InteractiveDocPhase,
  event: InteractiveDocEvent,
): InteractiveDocTransitionResult {
  const row = INTERACTIVE_DOC_TRANSITIONS.find(
    (entry) => entry.from === from && entry.event === event,
  );
  if (!row) {
    return {
      ok: false,
      code: "interactive-doc-illegal-transition",
      from,
      event,
      message: `状态 ${from} 不接受事件 ${event}（§3.3）`,
    };
  }
  return { ok: true, to: row.to as InteractiveDocPhase };
}

export function isForbiddenInteractiveDocTransition(
  from: string,
  to: string,
): boolean {
  return INTERACTIVE_DOC_FORBIDDEN_TRANSITIONS.some(
    (entry) => entry.from === from && entry.to === to,
  );
}

/**
 * Lexical identifier scan over one expression. Strings are removed first so a
 * quoted word never becomes a graph edge; identifiers directly followed by `(`
 * are §3.4 whitelist calls, not references.
 */
export function interactiveDocExpressionIdentifiers(
  expression: string,
): string[] {
  const stripped = String(expression ?? "").replace(
    /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g,
    " ",
  );
  const found: string[] = [];
  const seen = new Set<string>();
  const pattern = /[A-Za-z_][A-Za-z0-9_]*/g;
  let match = pattern.exec(stripped);
  while (match) {
    const name = match[0];
    const rest = stripped.slice(match.index + name.length);
    const isCall = /^\s*\(/.test(rest);
    if (!isCall && !LITERAL_WORDS.has(name) && !seen.has(name)) {
      seen.add(name);
      found.push(name);
    }
    match = pattern.exec(stripped);
  }
  return found;
}

export interface InteractiveDocTopology {
  /** Computation ids in deterministic topological order. */
  order: readonly string[];
  /** Longest path length in computation nodes (§4 C9 ≤ 32). */
  depth: number;
  /** node id -> ids it reads (parameters, datasets, computations). */
  dependencies: Record<string, readonly string[]>;
  /** any id -> computations that read it. */
  dependents: Record<string, readonly string[]>;
  /** Full id sequence of one cycle, first id repeated last (§6 F2). */
  cycle: readonly string[] | null;
  unknownReferences: Array<{ nodeId: string; missing: string }>;
  overDependencyLimit: readonly string[];
}

function projectParameters(project: unknown): readonly unknown[] {
  const value = (project as { parameters?: unknown })?.parameters;
  return Array.isArray(value) ? value : [];
}

function projectComputations(project: unknown): readonly unknown[] {
  const value = (project as { computations?: unknown })?.computations;
  return Array.isArray(value) ? value : [];
}

function projectBlocks(project: unknown): readonly unknown[] {
  const value = (project as { blocks?: unknown })?.blocks;
  return Array.isArray(value) ? value : [];
}

function projectDatasets(project: unknown): readonly unknown[] {
  const value = (project as { datasets?: unknown })?.datasets;
  return Array.isArray(value) ? value : [];
}

function projectValidations(project: unknown): readonly unknown[] {
  const value = (project as { validation?: unknown })?.validation;
  return Array.isArray(value) ? value : [];
}

function idOf(entry: unknown): string {
  return String((entry as { id?: unknown })?.id || "");
}

/**
 * Kahn topological sort over `computations`. The ready queue is kept in
 * declaration order so the same project always yields the same order
 * (§5.4: Node and browser must agree bit-for-bit). On failure a full cycle
 * path is extracted with a DFS so §6 F2 can print the id sequence instead of
 * "计算失败".
 */
export function interactiveDocTopology(
  project: unknown,
): InteractiveDocTopology {
  const computations = projectComputations(project);
  const computationIds = computations.map(idOf).filter(Boolean);
  const computationIndex = new Map<string, number>();
  computationIds.forEach((id, index) => computationIndex.set(id, index));
  const parameterIds = new Set(projectParameters(project).map(idOf));
  const datasetIds = new Set(projectDatasets(project).map(idOf));

  const dependencies: Record<string, string[]> = {};
  const dependents: Record<string, string[]> = {};
  const unknownReferences: Array<{ nodeId: string; missing: string }> = [];
  const overDependencyLimit: string[] = [];

  const addDependent = (source: string, target: string) => {
    if (!dependents[source]) dependents[source] = [];
    if (!dependents[source].includes(target)) dependents[source].push(target);
  };

  for (const node of computations) {
    const nodeId = idOf(node);
    if (!nodeId) continue;
    const declared = Array.isArray((node as { dependsOn?: unknown }).dependsOn)
      ? ((node as { dependsOn?: unknown[] }).dependsOn as unknown[]).map(String)
      : [];
    const scanned = interactiveDocExpressionIdentifiers(
      String((node as { expression?: unknown }).expression || ""),
    );
    const merged: string[] = [];
    for (const reference of [...declared, ...scanned]) {
      if (!reference || merged.includes(reference)) continue;
      merged.push(reference);
    }
    const resolved: string[] = [];
    for (const reference of merged) {
      if (
        computationIndex.has(reference) ||
        parameterIds.has(reference) ||
        datasetIds.has(reference)
      ) {
        resolved.push(reference);
        addDependent(reference, nodeId);
      } else {
        unknownReferences.push({ nodeId, missing: reference });
      }
    }
    if (resolved.length > INTERACTIVE_DOC_LIMITS.nodeDependencyMax) {
      overDependencyLimit.push(nodeId);
    }
    dependencies[nodeId] = resolved;
  }

  const indegree = new Map<string, number>();
  for (const id of computationIds) {
    indegree.set(
      id,
      (dependencies[id] || []).filter((reference) =>
        computationIndex.has(reference),
      ).length,
    );
  }
  const ready = computationIds.filter((id) => (indegree.get(id) || 0) === 0);
  ready.sort(
    (left, right) =>
      (computationIndex.get(left) ?? 0) - (computationIndex.get(right) ?? 0),
  );
  const order: string[] = [];
  const depthOf = new Map<string, number>();
  while (ready.length) {
    const id = ready.shift() as string;
    order.push(id);
    const upstreamDepth = (dependencies[id] || [])
      .filter((reference) => computationIndex.has(reference))
      .map((reference) => depthOf.get(reference) || 0);
    depthOf.set(id, 1 + (upstreamDepth.length ? Math.max(...upstreamDepth) : 0));
    const next = dependents[id] || [];
    const unlocked: string[] = [];
    for (const consumer of next) {
      if (!computationIndex.has(consumer)) continue;
      const remaining = (indegree.get(consumer) || 0) - 1;
      indegree.set(consumer, remaining);
      if (remaining === 0) unlocked.push(consumer);
    }
    unlocked.sort(
      (left, right) =>
        (computationIndex.get(left) ?? 0) - (computationIndex.get(right) ?? 0),
    );
    for (const consumer of unlocked) ready.push(consumer);
  }

  const cycle =
    order.length === computationIds.length
      ? null
      : findInteractiveDocCycle(computationIds, dependencies, computationIndex);

  return {
    order,
    depth: order.length ? Math.max(...order.map((id) => depthOf.get(id) || 1)) : 0,
    dependencies,
    dependents,
    cycle,
    unknownReferences,
    overDependencyLimit,
  };
}

function findInteractiveDocCycle(
  ids: readonly string[],
  dependencies: Record<string, readonly string[]>,
  index: Map<string, number>,
): readonly string[] | null {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  let cycle: string[] | null = null;

  const visit = (id: string): boolean => {
    if (state.get(id) === 2) return false;
    if (state.get(id) === 1) {
      const start = stack.indexOf(id);
      cycle = [...stack.slice(start), id];
      return true;
    }
    state.set(id, 1);
    stack.push(id);
    const upstream = (dependencies[id] || []).filter((reference) =>
      index.has(reference),
    );
    for (const reference of upstream) {
      if (visit(reference)) return true;
    }
    stack.pop();
    state.set(id, 2);
    return false;
  };

  for (const id of ids) {
    if (visit(id)) break;
  }
  // The DFS walks dependency edges (consumer -> producer); reverse so the
  // printed sequence reads in evaluation direction.
  return cycle ? [...(cycle as string[])].reverse() : null;
}

export interface InteractiveDocLink {
  phase: Extract<
    InteractiveDocPhase,
    "ready" | "invalid" | "cyclic" | "degraded"
  >;
  topology: InteractiveDocTopology;
  diagnostics: InteractiveDocIssue[];
  danglingBinds: Array<{ blockId: string; missing: string }>;
  deadNodes: string[];
  missingDependencyPaths: string[];
  boundComputationRatio: number;
  proseCharacters: number;
  inert: boolean;
}

function blockBinds(block: unknown): string[] {
  const binds: string[] = [];
  const record = block as {
    bind?: unknown;
    table?: { rows?: unknown[] };
    chart?: { series?: unknown[] };
    formula?: { computationId?: unknown };
  };
  if (typeof record.bind === "string" && record.bind) binds.push(record.bind);
  for (const row of record.table?.rows || []) {
    const bind = (row as { bind?: unknown })?.bind;
    if (typeof bind === "string" && bind) binds.push(bind);
  }
  for (const series of record.chart?.series || []) {
    const bind = (series as { bind?: unknown })?.bind;
    if (typeof bind === "string" && bind) binds.push(bind);
  }
  if (
    typeof record.formula?.computationId === "string" &&
    record.formula.computationId
  ) {
    binds.push(record.formula.computationId);
  }
  return binds;
}

/**
 * §3.3 `linking` — resolves every reference, rejects cycles, detects the §6 F1
 * "排版冒充计算" shape and the §6 F7 missing dependency closure, then reports
 * the phase the machine must enter.
 */
export function linkInteractiveDocProject(
  project: unknown,
  options: { availableDependencyPaths?: readonly string[] } = {},
): InteractiveDocLink {
  const topology = interactiveDocTopology(project);
  const diagnostics: InteractiveDocIssue[] = [];
  const computations = projectComputations(project);
  const computationIds = new Set(computations.map(idOf).filter(Boolean));
  const parameters = projectParameters(project);
  const parameterIds = new Set(parameters.map(idOf));
  const datasets = projectDatasets(project);
  const blocks = projectBlocks(project);

  for (const parameter of parameters) {
    const labelIssue = interactiveDocLabelIssue(parameter);
    if (labelIssue) diagnostics.push(labelIssue);
    const domainIssue = interactiveDocParameterDomainIssue(parameter);
    if (domainIssue) diagnostics.push(domainIssue);
  }

  const danglingBinds: Array<{ blockId: string; missing: string }> = [];
  const boundComputations = new Set<string>();
  for (const block of blocks) {
    const blockId = idOf(block);
    for (const bind of blockBinds(block)) {
      if (computationIds.has(bind)) {
        boundComputations.add(bind);
      } else if (parameterIds.has(bind)) {
        // A block may surface a raw parameter; that is a valid reference.
        continue;
      } else {
        danglingBinds.push({ blockId, missing: bind });
      }
    }
    const parameterRefs = (block as { parameterIds?: unknown }).parameterIds;
    if (Array.isArray(parameterRefs)) {
      for (const reference of parameterRefs) {
        if (!parameterIds.has(String(reference))) {
          danglingBinds.push({ blockId, missing: String(reference) });
        }
      }
    }
  }

  for (const rule of projectValidations(project)) {
    const assertText = String((rule as { assert?: unknown }).assert || "");
    for (const reference of interactiveDocExpressionIdentifiers(assertText)) {
      if (computationIds.has(reference)) boundComputations.add(reference);
      else if (!parameterIds.has(reference) && !datasets.some((entry) => idOf(entry) === reference)) {
        danglingBinds.push({
          blockId: `validation:${idOf(rule)}`,
          missing: reference,
        });
      }
    }
    if (assertText.length > INTERACTIVE_DOC_LIMITS.assertMaxChars) {
      diagnostics.push({
        code: "interactive-doc-assert-too-long",
        severity: "error",
        message: `勾稽 ${idOf(rule)} 的 assert 超过 ${INTERACTIVE_DOC_LIMITS.assertMaxChars} 字符（§4 C8）`,
        nodeId: idOf(rule),
      });
    }
  }

  for (const node of computations) {
    const expression = String((node as { expression?: unknown }).expression || "");
    if (expression.length > INTERACTIVE_DOC_LIMITS.expressionMaxChars) {
      diagnostics.push({
        code: "interactive-doc-expression-too-long",
        severity: "error",
        message: `计算节点 ${idOf(node)} 的表达式超过 ${INTERACTIVE_DOC_LIMITS.expressionMaxChars} 字符（§4 C7）`,
        nodeId: idOf(node),
      });
    }
    for (const reference of topology.dependencies[idOf(node)] || []) {
      if (computationIds.has(reference)) boundComputations.add(reference);
    }
  }

  const deadNodes = [...computationIds].filter((id) => !boundComputations.has(id));
  const boundComputationRatio = computationIds.size
    ? Math.round(
        ((computationIds.size - deadNodes.length) / computationIds.size) * 1000,
      ) / 1000
    : 0;

  const proseCharacters = blocks.reduce((total, block) => {
    const record = block as { kind?: unknown; text?: unknown };
    if (String(record.kind || "") !== "prose") return total;
    return total + String(record.text || "").length;
  }, 0);

  const presentationKinds = new Set(["metric", "table", "chart"]);
  const presentationBlocks = blocks.filter((block) =>
    presentationKinds.has(String((block as { kind?: unknown }).kind || "")),
  );
  const inert =
    computations.length < INTERACTIVE_DOC_LIMITS.computationsMin ||
    parameters.length < INTERACTIVE_DOC_LIMITS.parametersMin ||
    blocks.length < INTERACTIVE_DOC_LIMITS.blocksMin ||
    presentationBlocks.length < 1;
  if (inert) {
    diagnostics.push({
      code: "interactive-doc-inert",
      severity: "error",
      message: `排版冒充计算：parameters=${parameters.length}（≥3）、computations=${computations.length}（≥2）、blocks=${blocks.length}（≥4）、metric/table/chart 块=${presentationBlocks.length}（≥1）（§6 F1）`,
    });
  }

  const available = new Set(options.availableDependencyPaths || []);
  const declaredDependencyPaths = new Set(
    (Array.isArray((project as { dependencies?: unknown }).dependencies)
      ? ((project as { dependencies?: unknown[] }).dependencies as unknown[])
      : []
    ).map((entry) => String((entry as { path?: unknown })?.path || "")),
  );
  const missingDependencyPaths: string[] = [];
  for (const dataset of datasets) {
    const source = (dataset as { source?: unknown }).source as
      | { dependencyPath?: unknown }
      | undefined;
    const path = String(source?.dependencyPath || "");
    if (!path) continue;
    const known = declaredDependencyPaths.has(path);
    const resolvable = options.availableDependencyPaths
      ? available.has(path)
      : known;
    if (!resolvable) missingDependencyPaths.push(path);
  }

  const datasetIds = new Set(datasets.map(idOf));
  const computationsTouchDatasets = computations.some((node) =>
    (topology.dependencies[idOf(node)] || []).some((reference) =>
      datasetIds.has(reference),
    ),
  );

  if (topology.cycle) {
    diagnostics.push({
      code: "interactive-doc-cyclic",
      severity: "error",
      message: `计算图存在环：${topology.cycle.join(" → ")}（§6 F2）`,
    });
    return {
      phase: "cyclic",
      topology,
      diagnostics,
      danglingBinds,
      deadNodes,
      missingDependencyPaths,
      boundComputationRatio,
      proseCharacters,
      inert,
    };
  }

  if (topology.unknownReferences.length) {
    for (const entry of topology.unknownReferences) {
      diagnostics.push({
        code: "interactive-doc-unresolved-identifier",
        severity: "error",
        message: `计算节点 ${entry.nodeId} 引用了不存在的 id「${entry.missing}」（§3.3 linking → invalid）`,
        nodeId: entry.nodeId,
      });
    }
  }
  if (danglingBinds.length) {
    for (const entry of danglingBinds) {
      diagnostics.push({
        code: "interactive-doc-dangling-bind",
        severity: "error",
        message: `块 ${entry.blockId} 绑定了不存在的 id「${entry.missing}」（§6 F4）`,
        blockId: entry.blockId,
      });
    }
  }
  if (topology.depth > INTERACTIVE_DOC_LIMITS.graphDepthMax) {
    diagnostics.push({
      code: "interactive-doc-graph-too-deep",
      severity: "error",
      message: `计算图深度 ${topology.depth} 超过 ${INTERACTIVE_DOC_LIMITS.graphDepthMax} 层（§4 C9）`,
    });
  }
  for (const nodeId of topology.overDependencyLimit) {
    diagnostics.push({
      code: "interactive-doc-too-many-dependencies",
      severity: "error",
      message: `计算节点 ${nodeId} 的依赖数超过 ${INTERACTIVE_DOC_LIMITS.nodeDependencyMax}（§4 C10）`,
      nodeId,
    });
  }

  const hardInvalid =
    inert ||
    topology.unknownReferences.length > 0 ||
    danglingBinds.length > 0 ||
    topology.depth > INTERACTIVE_DOC_LIMITS.graphDepthMax ||
    topology.overDependencyLimit.length > 0 ||
    diagnostics.some(
      (entry) =>
        entry.code === "interactive-doc-expression-too-long" ||
        entry.code === "interactive-doc-assert-too-long",
    );

  if (hardInvalid) {
    return {
      phase: "invalid",
      topology,
      diagnostics,
      danglingBinds,
      deadNodes,
      missingDependencyPaths,
      boundComputationRatio,
      proseCharacters,
      inert,
    };
  }

  if (missingDependencyPaths.length) {
    // §3.3: degraded only when every computation is parameter-driven, so the
    // document still computes. Otherwise the missing blob is fatal (§6 F7).
    if (computationsTouchDatasets) {
      diagnostics.push({
        code: "interactive-doc-dataset-missing",
        severity: "error",
        message: `依赖件缺失且计算图依赖 datasets：${missingDependencyPaths.join(", ")}（§6 F7）`,
      });
      return {
        phase: "invalid",
        topology,
        diagnostics,
        danglingBinds,
        deadNodes,
        missingDependencyPaths,
        boundComputationRatio,
        proseCharacters,
        inert,
      };
    }
    diagnostics.push({
      code: "interactive-doc-degraded-dependencies",
      severity: "warn",
      message: `依赖件缺失，已进入 degraded 且禁止保存：${missingDependencyPaths.join(", ")}（§3.3 / §6 F7）`,
    });
    return {
      phase: "degraded",
      topology,
      diagnostics,
      danglingBinds,
      deadNodes,
      missingDependencyPaths,
      boundComputationRatio,
      proseCharacters,
      inert,
    };
  }

  if (deadNodes.length) {
    diagnostics.push({
      code: "interactive-doc-dead-node",
      severity: "warn",
      message: `无人引用的死节点：${deadNodes.join(", ")}（§5.1）`,
    });
  }
  if (boundComputationRatio < INTERACTIVE_DOC_LIMITS.boundComputationRatioMin) {
    diagnostics.push({
      code: "interactive-doc-bound-ratio-low",
      severity: "warn",
      message: `被引用的 computations 占比 ${boundComputationRatio} 低于 ${INTERACTIVE_DOC_LIMITS.boundComputationRatioMin}（§8.2）`,
    });
  }
  if (proseCharacters < INTERACTIVE_DOC_LIMITS.proseCharactersMin) {
    diagnostics.push({
      code: "interactive-doc-prose-too-short",
      severity: "warn",
      message: `prose 正文合计 ${proseCharacters} 字符，低于 ${INTERACTIVE_DOC_LIMITS.proseCharactersMin}（§8.2）`,
    });
  }

  return {
    phase: "ready",
    topology,
    diagnostics,
    danglingBinds,
    deadNodes,
    missingDependencyPaths,
    boundComputationRatio,
    proseCharacters,
    inert,
  };
}

/** Downstream closure of the changed ids, emitted in topological order. */
export function planInteractiveDocRecompute(
  topology: InteractiveDocTopology,
  changed: readonly string[] = [],
): { order: readonly string[]; affected: readonly string[] } {
  if (!changed.length) {
    return { order: topology.order, affected: topology.order };
  }
  const affected = new Set<string>();
  const queue = [...changed];
  while (queue.length) {
    const id = queue.shift() as string;
    for (const consumer of topology.dependents[id] || []) {
      if (affected.has(consumer)) continue;
      affected.add(consumer);
      queue.push(consumer);
    }
  }
  const order = topology.order.filter((id) => affected.has(id));
  return { order, affected: order };
}

/** Transitive parameter ids a computation depends on (SC 1.3.1 for result cards). */
export function interactiveDocUpstreamParameters(
  topology: InteractiveDocTopology,
  nodeId: string,
  parameterIds: ReadonlySet<string>,
): string[] {
  const found = new Set<string>();
  const seen = new Set<string>();
  const queue = [nodeId];
  while (queue.length) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const reference of topology.dependencies[id] || []) {
      if (parameterIds.has(reference)) found.add(reference);
      else queue.push(reference);
    }
  }
  return [...found].sort();
}

export interface InteractiveDocComputeValues {
  values: Record<string, unknown>;
  errors: InteractiveDocIssue[];
  cycle: readonly string[] | null;
}

/**
 * Normalizes whatever `evaluateComputeGraph` returns. The pinned signature
 * fixes the arguments but not the result shape, so the common spellings are
 * accepted and non-finite numbers are folded to `null` — §6 F3 forbids a NaN
 * literal reaching a metric block.
 */
export function normalizeComputeGraphResult(
  result: unknown,
): InteractiveDocComputeValues {
  const errors: InteractiveDocIssue[] = [];
  const empty: InteractiveDocComputeValues = { values: {}, errors, cycle: null };
  if (!result || typeof result !== "object") return empty;
  const record = result as Record<string, unknown>;
  const candidate =
    (record.values as Record<string, unknown> | undefined) ??
    (record.results as Record<string, unknown> | undefined) ??
    (record.nodes as Record<string, unknown> | undefined) ??
    (record.ok === undefined && record.errors === undefined ? record : undefined);
  const values: Record<string, unknown> = {};
  if (candidate && typeof candidate === "object") {
    for (const [key, raw] of Object.entries(candidate)) {
      const value =
        raw && typeof raw === "object" && "value" in (raw as object)
          ? (raw as { value: unknown }).value
          : raw;
      if (typeof value === "number" && !Number.isFinite(value)) {
        values[key] = null;
        errors.push({
          code: "interactive-doc-nan-guarded",
          severity: "warn",
          message: `节点 ${key} 求值为非有限数，已按 guard 兜底为空值（§3.4 / §6 F3）`,
          nodeId: key,
        });
        continue;
      }
      values[key] = value === undefined ? null : value;
    }
  }
  const rawErrors = Array.isArray(record.errors)
    ? record.errors
    : Array.isArray(record.diagnostics)
      ? record.diagnostics
      : [];
  for (const entry of rawErrors) {
    const source = (entry || {}) as Record<string, unknown>;
    errors.push({
      code: String(source.code || "interactive-doc-evaluation-error"),
      severity: source.severity === "warn" ? "warn" : "error",
      message: String(
        source.message || source.detail || "计算图求值失败（数据层未给出细节）",
      ),
      ...(source.nodeId ? { nodeId: String(source.nodeId) } : {}),
    });
  }
  const rawCycle = Array.isArray(record.cycle)
    ? record.cycle
    : Array.isArray(record.cyclePath)
      ? record.cyclePath
      : null;
  return {
    values,
    errors,
    cycle: rawCycle ? rawCycle.map(String) : null,
  };
}

export const INTERACTIVE_DOC_ASSERT_PREFIX = "assert_";

/**
 * §3.5 — `validation[].assert` is written in the same closed language as
 * `computations[].expression`, so it is evaluated by appending probe nodes to a
 * copy of the project and handing that copy to the data layer's evaluator. No
 * second evaluator is written here (§1.2 forbids one) and W6's files are not
 * touched: the probe is data.
 */
export function buildInteractiveDocValidationProbe(project: unknown): {
  project: unknown;
  probes: Array<{ ruleId: string; nodeId: string; severity: string; message: string; tolerance: number | null }>;
} {
  const rules = projectValidations(project);
  const computations = projectComputations(project);
  const existing = new Set(computations.map(idOf));
  const probes: Array<{
    ruleId: string;
    nodeId: string;
    severity: string;
    message: string;
    tolerance: number | null;
  }> = [];
  const extra: unknown[] = [];
  for (const rule of rules) {
    const ruleId = idOf(rule);
    const assertText = String((rule as { assert?: unknown }).assert || "");
    if (!ruleId || !assertText) continue;
    let nodeId = `${INTERACTIVE_DOC_ASSERT_PREFIX}${ruleId}`.slice(0, 48);
    let salt = 0;
    while (existing.has(nodeId)) {
      salt += 1;
      nodeId = `${INTERACTIVE_DOC_ASSERT_PREFIX}${salt}_${ruleId}`.slice(0, 48);
    }
    existing.add(nodeId);
    if (
      computations.length + extra.length >=
      INTERACTIVE_DOC_LIMITS.computationsMax
    ) {
      break;
    }
    extra.push({ id: nodeId, label: ruleId, expression: assertText });
    const tolerance = (rule as { tolerance?: unknown }).tolerance;
    probes.push({
      ruleId,
      nodeId,
      severity: String((rule as { severity?: unknown }).severity || "error"),
      message: String((rule as { message?: unknown }).message || ruleId),
      tolerance: typeof tolerance === "number" ? tolerance : null,
    });
  }
  if (!extra.length) return { project, probes: [] };
  return {
    project: {
      ...(project as Record<string, unknown>),
      computations: [...computations, ...extra],
    },
    probes,
  };
}

export interface InteractiveDocValidationOutcome {
  ruleId: string;
  severity: string;
  message: string;
  passed: boolean;
  value: unknown;
}

export interface InteractiveDocPorts {
  /** `evaluateComputeGraph(project, inputs)` — W6, pinned by D7. */
  evaluate: (project: unknown, inputs: Record<string, unknown>) => unknown;
  /** Optional per-node evaluation; when present the topological order drives it. */
  evaluateNode?: (args: {
    project: unknown;
    nodeId: string;
    scope: Record<string, unknown>;
  }) => unknown;
  /** `parseInteractiveDocSource(input)` — W6. */
  parse?: (input: string | Uint8Array) => unknown;
  /** `serializeInteractiveDocProject(project)` — W6. */
  serialize?: (project: unknown) => string;
  /** `validateInteractiveDocProject(project)` — W6. */
  validate?: (project: unknown) => unknown;
  /** `commitInteractiveDocProject(args)` — W6. */
  commit?: (args: unknown) => Promise<unknown>;
  /** `renderInteractiveDocBlock(args)` — W6. */
  render?: (args: unknown) => unknown;
  /** `INTERACTIVE_DOC_PROJECT_SCHEMA` — W6; checked against the parsed source. */
  projectSchema?: string;
  now?: () => number;
}

export interface InteractiveDocRecomputeRecord {
  changed: readonly string[];
  order: readonly string[];
  affected: readonly string[];
  evaluatedSequence: readonly string[];
  durationMs: number;
  timedOut: boolean;
  budgetMs: number;
}

export type InteractiveDocStageBlock =
  | {
      kind: "prose";
      id: string;
      span: number;
      title: string;
      tokens: InteractiveDocTextToken[];
      characters: number;
    }
  | {
      kind: "parameter-panel";
      id: string;
      span: number;
      title: string;
      controls: InteractiveDocControlDescriptor[];
    }
  | {
      kind: "metric";
      id: string;
      span: number;
      title: string;
      bind: string;
      display: string;
      raw: unknown;
      unit: string;
      precision: number | null;
      dependsOnParameterIds: string[];
      stale: boolean;
      issue: InteractiveDocIssue | null;
    }
  | {
      kind: "table";
      id: string;
      span: number;
      title: string;
      datasetId: string;
      rowHeightPx: number;
      rows: Array<{
        label: string;
        bind: string;
        emphasis: string;
        display: string;
        raw: unknown;
      }>;
    }
  | {
      kind: "chart";
      id: string;
      span: number;
      title: string;
      chartType: string;
      xAxisLabel: string;
      yAxisLabel: string;
      series: Array<{
        name: string;
        bind: string;
        color: string;
        display: string;
        raw: unknown;
      }>;
    }
  | {
      kind: "formula";
      id: string;
      span: number;
      title: string;
      computationId: string;
      display: string;
      steps: Array<{ expression: string; note: string }>;
    }
  | {
      kind: "callout";
      id: string;
      span: number;
      title: string;
      tone: string;
      tokens: InteractiveDocTextToken[];
    }
  | {
      kind: "quiz-item";
      id: string;
      span: number;
      title: string;
      prompt: string;
      answerKind: string;
      choices: string[];
      tolerance: number | null;
      explanation: string;
      submitted: unknown;
      answered: boolean;
      correct: boolean;
      attempts: number;
      explanationVisible: boolean;
    }
  | {
      kind: "schedule";
      id: string;
      span: number;
      title: string;
      bind: string;
      display: string;
      controls: InteractiveDocControlDescriptor[];
      feedback: Array<{ parameterId: string; computationId: string }>;
      progress: InteractiveDocScheduleProgress;
      qualityParameterId: string;
    }
  | { kind: "divider"; id: string; span: number };

export interface InteractiveDocWorkbenchState {
  phase: InteractiveDocPhase;
  project: InteractiveDocProject | null;
  link: InteractiveDocLink | null;
  values: Record<string, InteractiveDocParameterValue>;
  results: Record<string, unknown>;
  controls: InteractiveDocControlDescriptor[];
  blocks: InteractiveDocStageBlock[];
  parameterIssues: Record<string, InteractiveDocIssue>;
  diagnostics: InteractiveDocIssue[];
  validations: InteractiveDocValidationOutcome[];
  lastRecompute: InteractiveDocRecomputeRecord | null;
  pendingParameterIds: string[];
  progress: InteractiveDocProgress;
  scenarios: Array<Record<string, InteractiveDocParameterValue> | null>;
  recomputeMode: "on-change" | "on-commit";
  recomputeBudgetMs: number;
  stale: boolean;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  sourceReady: boolean;
  savingAllowed: boolean;
  editRevision: number;
  error: string;
  notice: string;
  canUndo: boolean;
  canRedo: boolean;
}

export interface InteractiveDocEngine {
  state: () => InteractiveDocWorkbenchState;
  setParameter: (
    id: string,
    raw: unknown,
  ) => { ok: boolean; issue?: InteractiveDocIssue };
  commitInputs: () => { ok: boolean };
  recompute: (
    changed?: readonly string[],
  ) => { ok: boolean; record?: InteractiveDocRecomputeRecord; code?: string };
  submitQuizAnswer: (
    blockId: string,
    answer: unknown,
  ) => { ok: boolean; correct?: boolean; code?: string };
  revealQuizExplanation: (blockId: string) => void;
  advanceSchedule: (
    blockId: string,
    quality: number,
  ) => { ok: boolean; code?: string; written?: Array<{ parameterId: string; value: InteractiveDocParameterValue }> };
  saveScenario: (slot: number) => { ok: boolean; code?: string };
  applyScenario: (slot: number) => { ok: boolean; code?: string };
  reset: () => { ok: boolean; code?: string };
  undo: () => boolean;
  redo: () => boolean;
  snapshot: () => InteractiveDocSnapshot;
  restore: (snapshot: unknown) => boolean;
  save: () => Promise<{ ok: boolean; code?: string; result?: unknown }>;
  serialize: () => string;
}

function defaultParameterValues(
  project: unknown,
): Record<string, InteractiveDocParameterValue> {
  const values: Record<string, InteractiveDocParameterValue> = {};
  for (const parameter of projectParameters(project)) {
    const id = idOf(parameter);
    const fallback = (parameter as { default?: unknown }).default;
    if (
      typeof fallback === "string" ||
      typeof fallback === "number" ||
      typeof fallback === "boolean"
    ) {
      values[id] = fallback;
    }
  }
  return values;
}

function interactionsOf(project: unknown): {
  recomputeMode: "on-change" | "on-commit";
  resetEnabled: boolean;
  scenarioSlots: number;
  maxRecomputeMs: number;
} {
  const source = ((project as { interactions?: unknown })?.interactions ||
    {}) as Record<string, unknown>;
  const budget = Number(source.maxRecomputeMs);
  return {
    recomputeMode:
      source.recomputeMode === "on-commit" ? "on-commit" : "on-change",
    resetEnabled: source.resetEnabled !== false,
    scenarioSlots: Math.max(
      0,
      Math.min(
        INTERACTIVE_DOC_LIMITS.scenarioSlotsMax,
        Number(source.scenarioSlots) || 0,
      ),
    ),
    maxRecomputeMs: Number.isFinite(budget)
      ? Math.max(
          1,
          Math.min(INTERACTIVE_DOC_LIMITS.recomputeBudgetMsMax, budget),
        )
      : INTERACTIVE_DOC_LIMITS.recomputeBudgetMsDefault,
  };
}

function scheduleFeedbackPairs(
  project: unknown,
  block: unknown,
): Array<{ parameterId: string; computationId: string }> {
  const computationIds = new Set(projectComputations(project).map(idOf));
  const references = (block as { parameterIds?: unknown }).parameterIds;
  const parameterIds = Array.isArray(references)
    ? references.map(String)
    : projectParameters(project).map(idOf);
  const pairs: Array<{ parameterId: string; computationId: string }> = [];
  for (const parameterId of parameterIds) {
    const candidates = [`next_${parameterId}`, `${parameterId}_next`];
    const computationId = candidates.find((candidate) =>
      computationIds.has(candidate),
    );
    if (computationId) pairs.push({ parameterId, computationId });
  }
  return pairs;
}

function qualityParameterId(project: unknown, block: unknown): string {
  const references = (block as { parameterIds?: unknown }).parameterIds;
  const parameterIds = Array.isArray(references)
    ? references.map(String)
    : projectParameters(project).map(idOf);
  return (
    parameterIds.find((id) => /quality|grade|rating/.test(id)) ||
    parameterIds[0] ||
    ""
  );
}

function emptyScheduleProgress(): InteractiveDocScheduleProgress {
  return {
    step: 0,
    lastQuality: null,
    easeFactor: INTERACTIVE_DOC_LIMITS.easeFactorInitial,
    repetition: 0,
    intervalDays: INTERACTIVE_DOC_LIMITS.firstIntervalDays,
  };
}

function gradeQuiz(
  quiz: Record<string, unknown>,
  answer: unknown,
): boolean {
  const kind = String(quiz.answerKind || "");
  const expected = quiz.answer;
  if (kind === "numeric") {
    const tolerance =
      typeof quiz.tolerance === "number" ? Math.abs(quiz.tolerance) : 0;
    const given = Number(answer);
    const target = Number(expected);
    if (!Number.isFinite(given) || !Number.isFinite(target)) return false;
    return Math.abs(given - target) <= tolerance;
  }
  if (kind === "multi-choice") {
    const given = (Array.isArray(answer) ? answer : [answer]).map((entry) =>
      String(entry).trim(),
    );
    const target = (Array.isArray(expected) ? expected : [expected]).map(
      (entry) => String(entry).trim(),
    );
    if (given.length !== target.length) return false;
    const targetSet = new Set(target);
    return given.every((entry) => targetSet.has(entry));
  }
  if (kind === "short-text") {
    return (
      String(answer ?? "").trim().toLowerCase() ===
      String(expected ?? "").trim().toLowerCase()
    );
  }
  return String(answer ?? "").trim() === String(expected ?? "").trim();
}

/**
 * Framework-free workbench engine. Everything the React surfaces do is a call
 * into this object, which is what makes the recompute fan-out, the state
 * machine and the input validation testable without a DOM.
 */
export function createInteractiveDocEngine(args: {
  project: unknown;
  ports: InteractiveDocPorts;
  values?: Record<string, InteractiveDocParameterValue>;
  progress?: InteractiveDocProgress;
  availableDependencyPaths?: readonly string[];
  item?: LibraryItem | null;
  siteId?: string;
}): InteractiveDocEngine {
  const ports = args.ports;
  const now = ports.now || (() => Date.now());
  const history = new InteractiveDocHistory();

  let project = JSON.parse(JSON.stringify(args.project)) as InteractiveDocProject;
  let phase: InteractiveDocPhase = "parsing";
  let link = linkInteractiveDocProject(project, {
    availableDependencyPaths: args.availableDependencyPaths,
  });
  let values: Record<string, InteractiveDocParameterValue> = {
    ...defaultParameterValues(project),
    ...(args.values || {}),
  };
  let baseline = { ...values };
  let results: Record<string, unknown> = {};
  let parameterIssues: Record<string, InteractiveDocIssue> = {};
  let diagnostics: InteractiveDocIssue[] = [...link.diagnostics];
  let validations: InteractiveDocValidationOutcome[] = [];
  let lastRecompute: InteractiveDocRecomputeRecord | null = null;
  let pendingParameterIds: string[] = [];
  let progress: InteractiveDocProgress = args.progress
    ? JSON.parse(JSON.stringify(args.progress))
    : emptyInteractiveDocProgress();
  let interactions = interactionsOf(project);
  let scenarios: Array<Record<string, InteractiveDocParameterValue> | null> =
    new Array(interactions.scenarioSlots).fill(null);
  let stale = false;
  let dirty = false;
  let saving = false;
  let editRevision = 0;
  let error = "";
  let notice = "";

  const parse = interactiveDocTransition(phase, "parse-ok");
  phase = parse.ok ? parse.to : "linking";
  const linkEvent: InteractiveDocEvent =
    link.phase === "ready"
      ? "link-ready"
      : link.phase === "cyclic"
        ? "link-cyclic"
        : link.phase === "degraded"
          ? "link-degraded"
          : "link-invalid";
  const linked = interactiveDocTransition(phase, linkEvent);
  phase = linked.ok ? linked.to : "invalid";
  if (phase !== "ready" && phase !== "degraded") {
    error = diagnostics.find((entry) => entry.severity === "error")?.message || "";
  }

  const parameterIdSet = () => new Set(projectParameters(project).map(idOf));

  const evaluateGraph = (
    plannedOrder: readonly string[],
  ): { values: Record<string, unknown>; errors: InteractiveDocIssue[]; sequence: string[] } => {
    const inputs: Record<string, unknown> = { ...values };
    const probe = buildInteractiveDocValidationProbe(project);
    const sequence: string[] = [];
    if (ports.evaluateNode) {
      const scope: Record<string, unknown> = { ...inputs, ...results };
      const errors: InteractiveDocIssue[] = [];
      const produced: Record<string, unknown> = {};
      const nodeIds = [
        ...plannedOrder,
        ...probe.probes.map((entry) => entry.nodeId),
      ];
      for (const nodeId of nodeIds) {
        sequence.push(nodeId);
        const raw = ports.evaluateNode({
          project: probe.project,
          nodeId,
          scope,
        });
        const normalized =
          typeof raw === "number" && !Number.isFinite(raw) ? null : raw;
        if (normalized === null && typeof raw === "number") {
          errors.push({
            code: "interactive-doc-nan-guarded",
            severity: "warn",
            message: `节点 ${nodeId} 求值为非有限数，已按 guard 兜底为空值（§3.4 / §6 F3）`,
            nodeId,
          });
        }
        produced[nodeId] = normalized === undefined ? null : normalized;
        scope[nodeId] = produced[nodeId];
      }
      return { values: produced, errors, sequence };
    }
    const normalized = normalizeComputeGraphResult(
      ports.evaluate(probe.project, inputs),
    );
    return {
      values: normalized.values,
      errors: normalized.errors,
      sequence: [...plannedOrder],
    };
  };

  const applyValidations = (computed: Record<string, unknown>) => {
    const probe = buildInteractiveDocValidationProbe(project);
    validations = probe.probes.map((entry) => {
      const value = computed[entry.nodeId];
      return {
        ruleId: entry.ruleId,
        severity: entry.severity,
        message: entry.message,
        passed: value === true,
        value: value === undefined ? null : value,
      };
    });
  };

  const runRecompute = (
    changed: readonly string[],
  ): { ok: boolean; record?: InteractiveDocRecomputeRecord; code?: string } => {
    if (phase === "cyclic") {
      return { ok: false, code: "interactive-doc-cyclic" };
    }
    if (phase === "invalid") {
      return { ok: false, code: "interactive-doc-invalid" };
    }
    const from: InteractiveDocPhase = phase === "degraded" ? "ready" : phase;
    const transition = interactiveDocTransition(
      from,
      changed.length ? "parameter-changed" : "commit-recompute",
    );
    if (!transition.ok) return { ok: false, code: transition.code };
    phase = transition.to;
    const plan = planInteractiveDocRecompute(link.topology, changed);
    const startedAt = now();
    let computed: Record<string, unknown> = {};
    let evaluationErrors: InteractiveDocIssue[] = [];
    let sequence: string[] = [];
    try {
      const outcome = evaluateGraph(plan.order);
      computed = outcome.values;
      evaluationErrors = outcome.errors;
      sequence = outcome.sequence;
    } catch (caught) {
      const done = interactiveDocTransition(phase, "compute-done");
      phase = done.ok ? done.to : "ready";
      const message =
        caught instanceof Error ? caught.message : "计算图求值失败";
      error = message;
      diagnostics = [
        ...link.diagnostics,
        {
          code: "interactive-doc-evaluation-failed",
          severity: "error",
          message,
        },
      ];
      return { ok: false, code: "interactive-doc-evaluation-failed" };
    }
    const durationMs = Math.max(0, now() - startedAt);
    const budgetMs = interactions.maxRecomputeMs;
    const timedOut = durationMs > budgetMs;
    const record: InteractiveDocRecomputeRecord = {
      changed: [...changed],
      order: plan.order,
      affected: plan.affected,
      evaluatedSequence: sequence,
      durationMs,
      timedOut,
      budgetMs,
    };
    lastRecompute = record;
    if (timedOut) {
      // §3.3 computing → degraded, §5.3: keep the previous round and flag it.
      const degraded = interactiveDocTransition(phase, "compute-timeout");
      phase = degraded.ok ? degraded.to : "degraded";
      stale = true;
      diagnostics = [
        ...link.diagnostics,
        {
          code: "interactive-doc-recompute-timeout",
          severity: "warn",
          message: `重算耗时 ${durationMs} ms 超过 ${budgetMs} ms，已保留上一轮结果并标注过期（§3.3 / §5.3）`,
        },
      ];
      return { ok: false, code: "interactive-doc-recompute-timeout", record };
    }
    results = { ...results, ...computed };
    applyValidations({ ...results, ...computed });
    evaluationErrors.push(
      ...validations
        .filter((entry) => !entry.passed && entry.severity === "error")
        .map((entry) => ({
          code: "interactive-doc-validation-failed",
          severity: "error" as const,
          message: `${entry.ruleId}: ${entry.message}`,
          nodeId: entry.ruleId,
        })),
    );
    diagnostics = [...link.diagnostics, ...evaluationErrors];
    stale = false;
    const done = interactiveDocTransition(phase, "compute-done");
    // A dependency-degraded project may still compute (§3.3: every computation
    // is parameter-driven there), but it MUST NOT climb back to `ready`,
    // otherwise `degraded → saving` would become reachable.
    phase = link.phase === "degraded" ? "degraded" : done.ok ? done.to : "ready";
    error =
      evaluationErrors.find((entry) => entry.severity === "error")?.message || "";
    return { ok: true, record };
  };

  const snapshot = (): InteractiveDocSnapshot => ({
    project: JSON.parse(JSON.stringify(project)),
    values: { ...values },
    progress: JSON.parse(JSON.stringify(progress)),
    scenarios: JSON.parse(JSON.stringify(scenarios)),
  });

  const recordHistory = (before: InteractiveDocSnapshot) => {
    if (history.record(before, snapshot())) {
      editRevision += 1;
      dirty = true;
    }
  };

  const applySnapshot = (next: InteractiveDocSnapshot) => {
    project = next.project;
    values = { ...next.values };
    progress = next.progress;
    scenarios = next.scenarios;
    interactions = interactionsOf(project);
    link = linkInteractiveDocProject(project, {
      availableDependencyPaths: args.availableDependencyPaths,
    });
    parameterIssues = {};
    editRevision += 1;
    dirty = true;
    runRecompute([]);
  };

  const stageBlocks = (): InteractiveDocStageBlock[] => {
    const parameterIds = parameterIdSet();
    const parameters = projectParameters(project);
    const computations = projectComputations(project);
    const computationById = new Map<string, Record<string, unknown>>();
    for (const node of computations) {
      computationById.set(idOf(node), node as Record<string, unknown>);
    }
    const readValue = (bind: string): unknown =>
      bind in results ? results[bind] : parameterIds.has(bind) ? values[bind] : null;
    const displayFor = (bind: string): string => {
      const node = computationById.get(bind);
      const parameter = parameters.find((entry) => idOf(entry) === bind);
      const unit = String(
        (node?.unit as string | undefined) ||
          ((parameter as { unit?: unknown })?.unit as string | undefined) ||
          "",
      );
      const precision =
        typeof node?.precision === "number"
          ? (node.precision as number)
          : typeof (parameter as { precision?: unknown })?.precision === "number"
            ? ((parameter as { precision?: number }).precision as number)
            : null;
      return formatInteractiveDocValue(readValue(bind), { precision, unit });
    };
    const controlsFor = (
      ids: readonly string[],
    ): InteractiveDocControlDescriptor[] =>
      interactiveDocControlFamily({
        parameters: parameters.filter((entry) => ids.includes(idOf(entry))),
        values,
        issues: parameterIssues,
        dependents: link.topology.dependents as Record<string, readonly string[]>,
      });

    const blocks: InteractiveDocStageBlock[] = [];
    for (const raw of projectBlocks(project)) {
      const block = raw as Record<string, unknown> & InteractiveDocBlock;
      const id = idOf(block);
      const span = Math.max(
        INTERACTIVE_DOC_LIMITS.spanMin,
        Math.min(INTERACTIVE_DOC_LIMITS.spanMax, Number(block.span) || 12),
      );
      const title = String(block.title || "");
      const kind = String(block.kind || "");
      if (kind === "prose") {
        const text = String(block.text || "");
        blocks.push({
          kind: "prose",
          id,
          span,
          title,
          tokens: parseInteractiveDocText(text),
          characters: text.length,
        });
        continue;
      }
      if (kind === "parameter-panel") {
        const ids = Array.isArray(block.parameterIds)
          ? (block.parameterIds as unknown[]).map(String)
          : [];
        blocks.push({
          kind: "parameter-panel",
          id,
          span: Math.max(span, INTERACTIVE_DOC_GRID.parameterPanelMinColumns),
          title,
          controls: controlsFor(ids),
        });
        continue;
      }
      if (kind === "metric") {
        const bind = String(block.bind || "");
        const node = computationById.get(bind);
        blocks.push({
          kind: "metric",
          id,
          span: Math.max(span, INTERACTIVE_DOC_GRID.resultCardMinColumns),
          title,
          bind,
          display: displayFor(bind),
          raw: readValue(bind),
          unit: String(node?.unit || ""),
          precision:
            typeof node?.precision === "number" ? (node.precision as number) : null,
          dependsOnParameterIds: interactiveDocUpstreamParameters(
            link.topology,
            bind,
            parameterIds,
          ),
          stale,
          issue:
            diagnostics.find((entry) => entry.nodeId === bind) || null,
        });
        continue;
      }
      if (kind === "table") {
        const table = (block.table || {}) as {
          datasetId?: unknown;
          rows?: unknown[];
        };
        blocks.push({
          kind: "table",
          id,
          span,
          title,
          datasetId: String(table.datasetId || ""),
          rowHeightPx: INTERACTIVE_DOC_GRID.tableRowHeightPx,
          rows: (table.rows || []).map((row) => {
            const entry = row as Record<string, unknown>;
            const bind = String(entry.bind || "");
            return {
              label: String(entry.label || ""),
              bind,
              emphasis: String(entry.emphasis || "none"),
              display: bind ? displayFor(bind) : "",
              raw: bind ? readValue(bind) : null,
            };
          }),
        });
        continue;
      }
      if (kind === "chart") {
        const chart = (block.chart || {}) as Record<string, unknown>;
        const series = Array.isArray(chart.series) ? chart.series : [];
        blocks.push({
          kind: "chart",
          id,
          span,
          title,
          chartType: String(chart.chartType || "line"),
          xAxisLabel: String(chart.xAxisLabel || ""),
          yAxisLabel: String(chart.yAxisLabel || ""),
          series: series
            .slice(0, INTERACTIVE_DOC_LIMITS.chartSeriesMax)
            .map((entry) => {
              const record = entry as Record<string, unknown>;
              const bind = String(record.bind || "");
              return {
                name: String(record.name || bind),
                bind,
                color: String(record.color || ""),
                display: displayFor(bind),
                raw: readValue(bind),
              };
            }),
        });
        continue;
      }
      if (kind === "formula") {
        const formula = (block.formula || {}) as Record<string, unknown>;
        const computationId = String(formula.computationId || "");
        const steps = Array.isArray(formula.steps) ? formula.steps : [];
        blocks.push({
          kind: "formula",
          id,
          span,
          title,
          computationId,
          display: displayFor(computationId),
          steps: steps
            .slice(0, INTERACTIVE_DOC_LIMITS.formulaStepsMax)
            .map((step) => ({
              expression: String((step as { expression?: unknown }).expression || ""),
              note: String((step as { note?: unknown }).note || ""),
            })),
        });
        continue;
      }
      if (kind === "callout") {
        blocks.push({
          kind: "callout",
          id,
          span,
          title,
          tone: String(block.callout || "info"),
          tokens: parseInteractiveDocText(String(block.text || "")),
        });
        continue;
      }
      if (kind === "quiz-item") {
        const quiz = (block.quiz || {}) as Record<string, unknown>;
        const state = progress.quiz[id];
        blocks.push({
          kind: "quiz-item",
          id,
          span,
          title,
          prompt: String(quiz.prompt || ""),
          answerKind: String(quiz.answerKind || ""),
          choices: Array.isArray(quiz.choices)
            ? (quiz.choices as unknown[]).map(String)
            : [],
          tolerance:
            typeof quiz.tolerance === "number" ? (quiz.tolerance as number) : null,
          explanation: String(quiz.explanation || ""),
          submitted: state?.submitted ?? null,
          answered: Boolean(state && state.attempts > 0),
          correct: Boolean(state?.correct),
          attempts: state?.attempts || 0,
          explanationVisible: Boolean(state?.explanationVisible),
        });
        continue;
      }
      if (kind === "schedule") {
        const ids = Array.isArray(block.parameterIds)
          ? (block.parameterIds as unknown[]).map(String)
          : [];
        const bind = String(block.bind || "");
        blocks.push({
          kind: "schedule",
          id,
          span,
          title,
          bind,
          display: bind ? displayFor(bind) : "",
          controls: controlsFor(ids),
          feedback: scheduleFeedbackPairs(project, block),
          progress: progress.schedule[id] || emptyScheduleProgress(),
          qualityParameterId: qualityParameterId(project, block),
        });
        continue;
      }
      blocks.push({ kind: "divider", id, span });
    }
    return blocks;
  };

  const state = (): InteractiveDocWorkbenchState => ({
    phase,
    project,
    link,
    values: { ...values },
    results: { ...results },
    controls: interactiveDocControlFamily({
      parameters: projectParameters(project),
      values,
      issues: parameterIssues,
      dependents: link.topology.dependents as Record<string, readonly string[]>,
    }),
    blocks: stageBlocks(),
    parameterIssues: { ...parameterIssues },
    diagnostics: [...diagnostics],
    validations: [...validations],
    lastRecompute,
    pendingParameterIds: [...pendingParameterIds],
    progress: JSON.parse(JSON.stringify(progress)),
    scenarios: JSON.parse(JSON.stringify(scenarios)),
    recomputeMode: interactions.recomputeMode,
    recomputeBudgetMs: interactions.maxRecomputeMs,
    stale,
    loading: false,
    saving,
    dirty,
    sourceReady: phase !== "invalid" && phase !== "cyclic",
    savingAllowed:
      phase === "ready" && !stale && !isForbiddenInteractiveDocTransition(phase, "saving"),
    editRevision,
    error,
    notice,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  });

  // First pass so `ready` documents show computed values before any input.
  if (phase === "ready") runRecompute([]);
  else if (phase === "degraded") applyValidations(results);

  return {
    state,
    setParameter: (id, raw) => {
      const parameter = projectParameters(project).find(
        (entry) => idOf(entry) === id,
      );
      if (!parameter) {
        const issue: InteractiveDocIssue = {
          code: "interactive-doc-unknown-parameter",
          severity: "error",
          message: `参数「${id}」不存在`,
          parameterId: id,
        };
        parameterIssues = { ...parameterIssues, [id]: issue };
        error = issue.message;
        return { ok: false, issue };
      }
      if (phase === "cyclic" || phase === "invalid") {
        const issue: InteractiveDocIssue = {
          code:
            phase === "cyclic"
              ? "interactive-doc-cyclic"
              : "interactive-doc-invalid",
          severity: "error",
          message:
            phase === "cyclic"
              ? `计算图存在环，已停止求值：${(link.topology.cycle || []).join(" → ")}（§6 F2）`
              : "源不合法，已停止求值（§3.3 invalid）",
          parameterId: id,
        };
        error = issue.message;
        return { ok: false, issue };
      }
      const coerced = coerceInteractiveDocParameter(parameter, raw);
      if (!coerced.ok) {
        parameterIssues = { ...parameterIssues, [id]: coerced.issue };
        error = coerced.issue.message;
        return { ok: false, issue: coerced.issue };
      }
      const before = snapshot();
      const nextIssues = { ...parameterIssues };
      if (coerced.issue) nextIssues[id] = coerced.issue;
      else delete nextIssues[id];
      parameterIssues = nextIssues;
      values = { ...values, [id]: coerced.value };
      error = coerced.issue?.severity === "error" ? coerced.issue.message : "";
      recordHistory(before);
      if (interactions.recomputeMode === "on-commit") {
        if (!pendingParameterIds.includes(id)) {
          pendingParameterIds = [...pendingParameterIds, id];
        }
        notice = "已记录输入，待提交后重算";
        return { ok: true, ...(coerced.issue ? { issue: coerced.issue } : {}) };
      }
      notice = "";
      runRecompute([id]);
      return { ok: true, ...(coerced.issue ? { issue: coerced.issue } : {}) };
    },
    commitInputs: () => {
      if (!pendingParameterIds.length) return { ok: false };
      const changed = [...pendingParameterIds];
      pendingParameterIds = [];
      notice = "";
      const outcome = runRecompute(changed);
      return { ok: outcome.ok };
    },
    recompute: (changed = []) => runRecompute(changed),
    submitQuizAnswer: (blockId, answer) => {
      const block = projectBlocks(project).find((entry) => idOf(entry) === blockId);
      const quiz = (block as { quiz?: unknown } | undefined)?.quiz as
        | Record<string, unknown>
        | undefined;
      if (!block || !quiz) {
        return { ok: false, code: "interactive-doc-unknown-quiz-block" };
      }
      const kind = String(quiz.answerKind || "");
      if (kind === "numeric" && !Number.isFinite(Number(answer))) {
        parameterIssues = {
          ...parameterIssues,
          [blockId]: {
            code: "interactive-doc-quiz-answer-not-a-number",
            severity: "error",
            message: "本题需要一个数值答案",
            blockId,
          },
        };
        return { ok: false, code: "interactive-doc-quiz-answer-not-a-number" };
      }
      if (
        (kind === "single-choice" || kind === "multi-choice") &&
        Array.isArray(quiz.choices)
      ) {
        const choices = (quiz.choices as unknown[]).map(String);
        const given = (Array.isArray(answer) ? answer : [answer]).map((entry) =>
          String(entry),
        );
        if (given.some((entry) => !choices.includes(entry))) {
          return { ok: false, code: "interactive-doc-quiz-answer-not-a-choice" };
        }
      }
      const before = snapshot();
      const previous = progress.quiz[blockId];
      const correct = gradeQuiz(quiz, answer);
      progress = {
        ...progress,
        quiz: {
          ...progress.quiz,
          [blockId]: {
            submitted: Array.isArray(answer)
              ? answer.map((entry) => String(entry))
              : (answer as InteractiveDocParameterValue),
            correct,
            attempts: (previous?.attempts || 0) + 1,
            explanationVisible: previous?.explanationVisible || correct,
          },
        },
      };
      recordHistory(before);
      notice = correct ? "回答正确" : "回答错误，可查看解析后重试";
      return { ok: true, correct };
    },
    revealQuizExplanation: (blockId) => {
      const previous = progress.quiz[blockId];
      progress = {
        ...progress,
        quiz: {
          ...progress.quiz,
          [blockId]: {
            submitted: previous?.submitted ?? null,
            correct: Boolean(previous?.correct),
            attempts: previous?.attempts || 0,
            explanationVisible: true,
          },
        },
      };
    },
    advanceSchedule: (blockId, quality) => {
      const block = projectBlocks(project).find((entry) => idOf(entry) === blockId);
      if (!block) return { ok: false, code: "interactive-doc-unknown-block" };
      if (
        !Number.isInteger(quality) ||
        quality < INTERACTIVE_DOC_LIMITS.qualityMin ||
        quality > INTERACTIVE_DOC_LIMITS.qualityMax
      ) {
        return { ok: false, code: "interactive-doc-quality-out-of-range" };
      }
      const qualityId = qualityParameterId(project, block);
      if (!qualityId) return { ok: false, code: "interactive-doc-no-quality-parameter" };
      const pairs = scheduleFeedbackPairs(project, block);
      if (!pairs.length) {
        return { ok: false, code: "interactive-doc-no-schedule-feedback" };
      }
      const qualityParameter = projectParameters(project).find(
        (entry) => idOf(entry) === qualityId,
      );
      const coerced = coerceInteractiveDocParameter(qualityParameter, quality);
      if (!coerced.ok) return { ok: false, code: coerced.issue.code };
      const before = snapshot();
      values = { ...values, [qualityId]: coerced.value };
      const recomputed = runRecompute([qualityId]);
      if (!recomputed.ok) {
        values = { ...before.values };
        return { ok: false, code: recomputed.code };
      }
      // State advancement: the freshly computed successors are written back into
      // the project's parameter defaults, so serializing the project persists
      // the new schedule state instead of leaving it in volatile UI state.
      const written: Array<{ parameterId: string; value: InteractiveDocParameterValue }> = [];
      const parameters = projectParameters(project).map((entry) => {
        const id = idOf(entry);
        const pair = pairs.find((candidate) => candidate.parameterId === id);
        if (!pair) return entry;
        const next = results[pair.computationId];
        if (
          typeof next !== "string" &&
          typeof next !== "number" &&
          typeof next !== "boolean"
        ) {
          return entry;
        }
        const validated = coerceInteractiveDocParameter(entry, next);
        if (!validated.ok) return entry;
        written.push({ parameterId: id, value: validated.value });
        return { ...(entry as Record<string, unknown>), default: validated.value };
      });
      project = {
        ...(project as unknown as Record<string, unknown>),
        parameters,
      } as unknown as InteractiveDocProject;
      for (const entry of written) values[entry.parameterId] = entry.value;
      const scheduleState = progress.schedule[blockId] || emptyScheduleProgress();
      const easeFactorWrite = written.find((entry) =>
        /ease|ef/.test(entry.parameterId),
      );
      const intervalWrite = written.find((entry) =>
        /interval/.test(entry.parameterId),
      );
      const repetitionWrite = written.find((entry) =>
        /repetition|streak/.test(entry.parameterId),
      );
      progress = {
        ...progress,
        schedule: {
          ...progress.schedule,
          [blockId]: {
            step: scheduleState.step + 1,
            lastQuality: quality,
            easeFactor: Math.max(
              INTERACTIVE_DOC_LIMITS.easeFactorFloor,
              Number(easeFactorWrite?.value ?? scheduleState.easeFactor) ||
                scheduleState.easeFactor,
            ),
            repetition:
              quality < INTERACTIVE_DOC_LIMITS.qualityFailBelow
                ? 0
                : Number(repetitionWrite?.value ?? scheduleState.repetition + 1) ||
                  scheduleState.repetition + 1,
            intervalDays:
              Number(intervalWrite?.value ?? scheduleState.intervalDays) ||
              scheduleState.intervalDays,
          },
        },
      };
      link = linkInteractiveDocProject(project, {
        availableDependencyPaths: args.availableDependencyPaths,
      });
      recordHistory(before);
      // The written-back defaults are new inputs; recompute so every dependent
      // block reflects the advanced state in topological order.
      runRecompute(written.map((entry) => entry.parameterId));
      notice = `已推进排程状态（第 ${progress.schedule[blockId].step} 步）`;
      return { ok: true, written };
    },
    saveScenario: (slot) => {
      if (!Number.isInteger(slot) || slot < 0 || slot >= scenarios.length) {
        return { ok: false, code: "interactive-doc-scenario-slot-out-of-range" };
      }
      const before = snapshot();
      scenarios = scenarios.map((entry, index) =>
        index === slot ? { ...values } : entry,
      );
      recordHistory(before);
      return { ok: true };
    },
    applyScenario: (slot) => {
      if (!Number.isInteger(slot) || slot < 0 || slot >= scenarios.length) {
        return { ok: false, code: "interactive-doc-scenario-slot-out-of-range" };
      }
      const stored = scenarios[slot];
      if (!stored) return { ok: false, code: "interactive-doc-scenario-empty" };
      const before = snapshot();
      const changed = Object.keys(stored).filter(
        (id) => values[id] !== stored[id],
      );
      values = { ...values, ...stored };
      recordHistory(before);
      runRecompute(changed);
      return { ok: true };
    },
    reset: () => {
      if (!interactions.resetEnabled) {
        return { ok: false, code: "interactive-doc-reset-disabled" };
      }
      const before = snapshot();
      values = { ...baseline };
      parameterIssues = {};
      pendingParameterIds = [];
      recordHistory(before);
      runRecompute([]);
      notice = "已重置为初始参数";
      return { ok: true };
    },
    undo: () => {
      const previous = history.undo(snapshot());
      if (!previous) return false;
      applySnapshot(previous);
      return true;
    },
    redo: () => {
      const next = history.redo(snapshot());
      if (!next) return false;
      applySnapshot(next);
      return true;
    },
    snapshot,
    restore: (candidate) => {
      if (!candidate || typeof candidate !== "object") return false;
      const record = candidate as Record<string, unknown>;
      const incoming = record.project;
      if (
        !incoming ||
        typeof incoming !== "object" ||
        (incoming as { schema?: unknown }).schema !==
          (ports.projectSchema || INTERACTIVE_DOC_SCHEMA_ID)
      ) {
        return false;
      }
      if (ports.validate) {
        const verdict = ports.validate(incoming) as { ok?: unknown } | null;
        if (verdict && verdict.ok === false) return false;
      }
      project = JSON.parse(JSON.stringify(incoming)) as InteractiveDocProject;
      values = {
        ...defaultParameterValues(project),
        ...((record.values as Record<string, InteractiveDocParameterValue>) || {}),
      };
      baseline = { ...defaultParameterValues(project) };
      progress = (record.progress as InteractiveDocProgress) || emptyInteractiveDocProgress();
      scenarios = Array.isArray(record.scenarios)
        ? (record.scenarios as Array<Record<string, InteractiveDocParameterValue> | null>)
        : new Array(interactionsOf(project).scenarioSlots).fill(null);
      interactions = interactionsOf(project);
      link = linkInteractiveDocProject(project, {
        availableDependencyPaths: args.availableDependencyPaths,
      });
      phase = link.phase;
      parameterIssues = {};
      diagnostics = [...link.diagnostics];
      dirty = true;
      editRevision += 1;
      if (phase === "ready") runRecompute([]);
      notice = "已恢复上次未同步的本地草稿";
      return true;
    },
    save: async () => {
      if (phase === "degraded") {
        // §3.3: degraded → saving is a forbidden transition (§6 F7).
        error = "缺依赖或结果过期，已阻止保存（§3.3 degraded → saving 为非法迁移）";
        return { ok: false, code: "interactive-doc-degraded-save-blocked" };
      }
      if (phase !== "ready") {
        error = "文档未进入 ready，已阻止保存";
        return { ok: false, code: "interactive-doc-not-ready" };
      }
      if (!ports.commit) {
        return { ok: false, code: "interactive-doc-commit-port-missing" };
      }
      saving = true;
      try {
        const result = await ports.commit({
          item: args.item || null,
          siteId: args.siteId || "",
          project,
          editRevision,
          progress,
          scenarios,
          projectSchema: ports.projectSchema || INTERACTIVE_DOC_SCHEMA_ID,
        });
        dirty = false;
        notice = "已保存";
        return { ok: true, result };
      } catch (caught) {
        error = caught instanceof Error ? caught.message : "保存失败";
        return { ok: false, code: "interactive-doc-commit-failed" };
      } finally {
        saving = false;
      }
    },
    serialize: () =>
      ports.serialize ? ports.serialize(project) : JSON.stringify(project),
  };
}

export function interactiveDocEditorManifest(): EditorManifestV1 {
  return {
    schema: "oceanleo.editor-manifest.v1",
    id: INTERACTIVE_DOC_EDITOR_ID,
    version: 1,
    capabilities: ["load", "mutate", "save", "reopen"],
    source: { kind: "inline", format: INTERACTIVE_DOC_SCHEMA_ID },
  };
}

function interactiveDocSourceText(item: LibraryItem): string {
  const inline = item.content;
  return typeof inline === "string" ? inline : "";
}

function interactiveDocSourceUrl(item: LibraryItem): string {
  return String(
    item.meta?.editor_project_url || item.url || item.previewUrl || "",
  );
}

export const INTERACTIVE_DOC_SOURCE_TOO_LARGE = "interactive-doc-source-too-large";
export const INTERACTIVE_DOC_SOURCE_READ_FAILED = "interactive-doc-source-read-failed";
export const INTERACTIVE_DOC_SOURCE_ABORTED = "interactive-doc-source-aborted";

/** Structural shape of what a bounded media read hands back. */
export interface InteractiveDocSourceBlob {
  size: number;
  text: () => Promise<string>;
}

export type InteractiveDocBlobFetcher = (
  url: string,
  options: { maxBytes?: number; signal?: AbortSignal; cache?: RequestCache },
) => Promise<InteractiveDocSourceBlob>;

export type InteractiveDocSourceRead =
  | { ok: true; text: string; bytes: number }
  | { ok: false; code: string; message: string; bytes?: number };

/**
 * §4 C40 / §5.2 / A7 — the byte ceiling is enforced where the bytes actually
 * arrive, not merely declared as a constant. Remote reads go through the
 * platform's `fetchMediaBlob`, which rejects on both the declared
 * `content-length` and the delivered blob size; the delivered size is checked
 * again here so an over-limit source is a controlled refusal with a code, never
 * a silent truncation and never a bare exception reaching the caller.
 */
export async function readInteractiveDocSourceBytes(
  url: string,
  options: { signal?: AbortSignal; fetchBlob?: InteractiveDocBlobFetcher } = {},
): Promise<InteractiveDocSourceRead> {
  const maxBytes = INTERACTIVE_DOC_LIMITS.sourceBytesMax;
  const fetchBlob = options.fetchBlob || (fetchMediaBlob as InteractiveDocBlobFetcher);
  const tooLarge = (bytes?: number): InteractiveDocSourceRead => ({
    ok: false,
    code: INTERACTIVE_DOC_SOURCE_TOO_LARGE,
    message: `交互文档源超过 ${maxBytes} 字节上限${
      bytes ? `（实测 ${bytes} 字节）` : ""
    }，已拒绝载入（§4 C40 / §7 A7）`,
    bytes,
  });
  let blob: InteractiveDocSourceBlob;
  try {
    blob = await fetchBlob(url, {
      maxBytes,
      signal: options.signal,
      cache: "no-store",
    });
  } catch (caught) {
    if (options.signal?.aborted) {
      return { ok: false, code: INTERACTIVE_DOC_SOURCE_ABORTED, message: "已取消载入" };
    }
    const detail = caught instanceof Error ? caught.message : "交互文档源读取失败";
    // `fetchMediaBlob` refuses over-limit blobs by throwing; keep that refusal
    // typed as the byte-ceiling failure instead of a generic read error.
    if (detail.includes("过大")) return tooLarge();
    return {
      ok: false,
      code: INTERACTIVE_DOC_SOURCE_READ_FAILED,
      message: detail,
    };
  }
  const bytes = Number(blob?.size) || 0;
  if (bytes > maxBytes) return tooLarge(bytes);
  try {
    const text = await blob.text();
    return { ok: true, text, bytes };
  } catch (caught) {
    return {
      ok: false,
      code: INTERACTIVE_DOC_SOURCE_READ_FAILED,
      message: caught instanceof Error ? caught.message : "交互文档源读取失败",
      bytes,
    };
  }
}

export interface InteractiveDocWorkbench extends InteractiveDocWorkbenchState {
  setParameter: InteractiveDocEngine["setParameter"];
  commitInputs: InteractiveDocEngine["commitInputs"];
  recompute: InteractiveDocEngine["recompute"];
  submitQuizAnswer: InteractiveDocEngine["submitQuizAnswer"];
  revealQuizExplanation: InteractiveDocEngine["revealQuizExplanation"];
  advanceSchedule: InteractiveDocEngine["advanceSchedule"];
  saveScenario: InteractiveDocEngine["saveScenario"];
  applyScenario: InteractiveDocEngine["applyScenario"];
  reset: InteractiveDocEngine["reset"];
  undo: () => void;
  redo: () => void;
  save: InteractiveDocEngine["save"];
  /** Deterministic source bytes via the data layer's serializer. */
  serialize: () => string;
  captureRecovery: () => unknown;
  restoreRecovery: (payload: unknown) => boolean;
  renderBlock: (blockId: string, host: unknown) => unknown;
}

const EMPTY_STATE: InteractiveDocWorkbenchState = {
  phase: "empty",
  project: null,
  link: null,
  values: {},
  results: {},
  controls: [],
  blocks: [],
  parameterIssues: {},
  diagnostics: [],
  validations: [],
  lastRecompute: null,
  pendingParameterIds: [],
  progress: emptyInteractiveDocProgress(),
  scenarios: [],
  recomputeMode: "on-change",
  recomputeBudgetMs: INTERACTIVE_DOC_LIMITS.recomputeBudgetMsDefault,
  stale: false,
  loading: true,
  saving: false,
  dirty: false,
  sourceReady: false,
  savingAllowed: false,
  editRevision: 0,
  error: "",
  notice: "",
  canUndo: false,
  canRedo: false,
};

/**
 * React binding. `ports` carries the data layer so this hook never imports it
 * directly; `InteractiveDocRoute.tsx` supplies the real W6 exports.
 */
export function useInteractiveDocWorkbench(
  item: LibraryItem,
  siteId: string,
  ports: InteractiveDocPorts,
): InteractiveDocWorkbench {
  const aliveRef = useRef(true);
  const engineRef = useRef<InteractiveDocEngine | null>(null);
  const portsRef = useRef(ports);
  portsRef.current = ports;
  const [state, setState] = useState<InteractiveDocWorkbenchState>(EMPTY_STATE);
  const identity = `${item.key}:${item.id}:${String(
    item.meta?.editor_revision_id || item.meta?.editor_project_url || "",
  )}`;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const publish = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !aliveRef.current) return;
    setState(engine.state());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    engineRef.current = null;
    setState({ ...EMPTY_STATE, loading: true });
    const parse = portsRef.current.parse;
    if (!parse) {
      setState({
        ...EMPTY_STATE,
        loading: false,
        error: "数据层解析入口缺失，编辑器已停止",
      });
      return () => controller.abort();
    }
    const boot = (text: string) => {
      if (controller.signal.aborted) return;
      try {
        const project = parse(text);
        const validate = portsRef.current.validate;
        if (validate) {
          const verdict = validate(project) as
            | { ok?: unknown; errors?: unknown }
            | null;
          if (verdict && verdict.ok === false) {
            const errors = Array.isArray(verdict.errors) ? verdict.errors : [];
            const detail = errors
              .map((entry) =>
                String(
                  (entry as { message?: unknown })?.message ||
                    (entry as { code?: unknown })?.code ||
                    entry,
                ),
              )
              .slice(0, 6)
              .join("；");
            setState({
              ...EMPTY_STATE,
              loading: false,
              phase: "invalid",
              error: detail || "交互文档源校验失败",
            });
            return;
          }
        }
        engineRef.current = createInteractiveDocEngine({
          project,
          ports: portsRef.current,
          item,
          siteId,
        });
        publish();
      } catch (caught) {
        setState({
          ...EMPTY_STATE,
          loading: false,
          phase: "invalid",
          error:
            caught instanceof Error
              ? caught.message
              : "交互文档源读取失败",
        });
      }
    };

    const inline = interactiveDocSourceText(item);
    if (inline) {
      boot(inline);
      return () => controller.abort();
    }
    const url = interactiveDocSourceUrl(item);
    if (!url) {
      setState({
        ...EMPTY_STATE,
        loading: false,
        phase: "invalid",
        error: "这条素材没有可编辑的结构化源",
      });
      return () => controller.abort();
    }
    void readInteractiveDocSourceBytes(url, {
      signal: controller.signal,
    }).then((outcome) => {
      if (controller.signal.aborted) return;
      if (!outcome.ok) {
        setState({
          ...EMPTY_STATE,
          loading: false,
          phase: "invalid",
          error: outcome.message,
        });
        return;
      }
      boot(outcome.text);
    });
    return () => controller.abort();
  }, [identity, item, publish, siteId]);

  const run = useCallback(
    <T,>(action: (engine: InteractiveDocEngine) => T, fallback: T): T => {
      const engine = engineRef.current;
      if (!engine) return fallback;
      const outcome = action(engine);
      publish();
      return outcome;
    },
    [publish],
  );

  return useMemo<InteractiveDocWorkbench>(
    () => ({
      ...state,
      setParameter: (id, raw) =>
        run((engine) => engine.setParameter(id, raw), { ok: false }),
      commitInputs: () => run((engine) => engine.commitInputs(), { ok: false }),
      recompute: (changed) =>
        run((engine) => engine.recompute(changed), { ok: false }),
      submitQuizAnswer: (blockId, answer) =>
        run((engine) => engine.submitQuizAnswer(blockId, answer), {
          ok: false,
        }),
      revealQuizExplanation: (blockId) =>
        run((engine) => engine.revealQuizExplanation(blockId), undefined),
      advanceSchedule: (blockId, quality) =>
        run((engine) => engine.advanceSchedule(blockId, quality), { ok: false }),
      saveScenario: (slot) =>
        run((engine) => engine.saveScenario(slot), { ok: false }),
      applyScenario: (slot) =>
        run((engine) => engine.applyScenario(slot), { ok: false }),
      reset: () => run((engine) => engine.reset(), { ok: false }),
      undo: () => run((engine) => engine.undo(), false),
      redo: () => run((engine) => engine.redo(), false),
      save: async () => {
        const engine = engineRef.current;
        if (!engine) return { ok: false, code: "interactive-doc-not-ready" };
        const outcome = await engine.save();
        publish();
        return outcome;
      },
      captureRecovery: () => engineRef.current?.snapshot() ?? null,
      restoreRecovery: (payload) =>
        run((engine) => engine.restore(payload), false),
      renderBlock: (blockId, host) => {
        const engine = engineRef.current;
        const render = portsRef.current.render;
        if (!engine || !render) return null;
        const current = engine.state();
        const block = (current.project as { blocks?: unknown[] } | null)?.blocks?.find(
          (entry) => String((entry as { id?: unknown })?.id || "") === blockId,
        );
        if (!block) return null;
        return render({
          project: current.project,
          block,
          values: current.values,
          results: current.results,
          host,
        });
      },
    }),
    [publish, run, state],
  );
}

export function interactiveDocNumericParameterIds(
  project: unknown,
): string[] {
  return projectParameters(project)
    .filter((parameter) =>
      isNumericParameterKind(String((parameter as { kind?: unknown }).kind || "")),
    )
    .map(idOf);
}
