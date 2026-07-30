/**
 * `oceanleo.vector.v1` source pipeline: SVG text → sanitized SVG → tokenized IR.
 *
 * Spec: docs/specs/oceanleo-material-and-game-v1/L1-carriers/vector.md
 * — §1.2 backlog vs target state, §1.3 licence tiers, §3.3 state machine,
 * §5.1 the three capabilities the bitmap adapter used to swallow, §5.4
 * portability, §6 failure modes, §8 byte floors and completeness.
 *
 * The pipeline is pure: same SVG bytes in, same IR and same state trace out.
 * The `flattened-only` bypass terminal is the load-bearing part — it separates
 * "can be viewed" from "can be edited" so the 46,487-item backlog can be
 * triaged mechanically instead of being relabelled `native` wholesale (§1.2).
 */

import {
  VECTOR_CONSTANTS,
  VECTOR_COMPLETENESS_THRESHOLDS,
  VECTOR_PROJECT_SCHEMA,
  VectorCarrierError,
  serializeVectorProject,
  validateVectorProject,
  vectorFrameColorFloor,
  vectorShapeCountFloor,
  vectorSourceByteFloor,
  type VectorAttributionEntry,
  type VectorCanvasKind,
  type VectorDef,
  type VectorPaletteToken,
  type VectorProject,
  type VectorShape,
  type VectorShapeType,
} from "./vector-schema";
import {
  residualDangerousConstructs,
  sanitizeSvg,
  type SvgSanitizeReport,
} from "./vector-sanitize";

export const VECTOR_STATES = Object.freeze([
  "empty",
  "parsed",
  "sanitized",
  "tokenized",
  "ready",
  "dirty",
  "saving",
  "invalid",
  "flattened-only",
]);

export type VectorState = (typeof VECTOR_STATES)[number];

/**
 * §3.3 transition table, one row per spec row. `empty → parsed` fires once the
 * SVG bytes are in hand; the spec puts "XML 非良构" on `parsed → invalid`, so
 * `parsed` means "parse attempted", and a malformed document is rejected on the
 * next edge rather than getting an edge of its own.
 */
export const VECTOR_TRANSITIONS = Object.freeze([
  Object.freeze({
    from: "empty",
    to: "parsed",
    trigger: "SVG 文本可被 XML 解析且有 viewBox",
  }),
  Object.freeze({
    from: "parsed",
    to: "invalid",
    trigger: "XML 非良构，或无 viewBox 且无 width/height",
  }),
  Object.freeze({
    from: "parsed",
    to: "sanitized",
    trigger: "§3.2 全部净化项执行完毕",
  }),
  Object.freeze({
    from: "sanitized",
    to: "flattened-only",
    trigger: "全部图形被压成 1 个 path，或形状数 < 2",
  }),
  Object.freeze({
    from: "sanitized",
    to: "tokenized",
    trigger: "颜色抽成 palette token，形状抽成 shapes",
  }),
  Object.freeze({
    from: "tokenized",
    to: "ready",
    trigger: "§8.2 完备判据全部成立",
  }),
  Object.freeze({
    from: "tokenized",
    to: "invalid",
    trigger: "use[].refId 悬空或 group.childIds 悬空",
  }),
  Object.freeze({
    from: "ready",
    to: "dirty",
    trigger: "编辑器改动锚点 / 配色 / 图形",
  }),
  Object.freeze({ from: "dirty", to: "saving", trigger: "提交" }),
  Object.freeze({ from: "saving", to: "ready", trigger: "收到新 revision_id" }),
]);

/**
 * §3.3 illegal transitions. `parsed → tokenized` is the security-critical one:
 * it is the edge that would carry a `<script>` into the library, and it MUST
 * NOT happen even once.
 */
export const VECTOR_ILLEGAL_TRANSITIONS = Object.freeze([
  Object.freeze({
    from: "parsed",
    to: "tokenized",
    reason: "跳过净化会把 <script> 带进库；安全性问题，一次都不许发生",
  }),
  Object.freeze({
    from: "flattened-only",
    to: "ready",
    reason: "压平成单 path 的矢量没有可编辑的图形层级，MUST NOT 落 native",
  }),
  Object.freeze({
    from: "flattened-only",
    to: "dirty",
    reason: "同上",
  }),
  Object.freeze({
    from: "invalid",
    to: "saving",
    reason: "非法源 MUST NOT 落盘",
  }),
  Object.freeze({ from: "empty", to: "ready", reason: "空壳产生路径" }),
]);

export function vectorTransitionAllowed(
  from: VectorState,
  to: VectorState,
): boolean {
  if (
    VECTOR_ILLEGAL_TRANSITIONS.some(
      (illegal) => illegal.from === from && illegal.to === to,
    )
  ) {
    return false;
  }
  return VECTOR_TRANSITIONS.some(
    (transition) => transition.from === from && transition.to === to,
  );
}

// ---------------------------------------------------------------------------
// Path anchors (§5.1 "改锚点")
// ---------------------------------------------------------------------------

export interface VectorPathCommand {
  command: string;
  args: number[];
}

export interface VectorPathAnchor {
  /** Index into the absolute command list this anchor terminates. */
  commandIndex: number;
  command: string;
  x: number;
  y: number;
}

const COMMAND_ARITY: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

export function parsePathCommands(d: string): VectorPathCommand[] {
  const commands: VectorPathCommand[] = [];
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) return commands;
  let index = 0;
  let letter = "";
  while (index < tokens.length) {
    const token = tokens[index];
    if (/[a-z]/i.test(token)) {
      letter = token;
      index += 1;
    } else if (!letter) {
      throw new VectorCarrierError(
        "path d 以数值开头，缺少命令字母。",
        "vector-invalid-ir",
      );
    }
    const arity = COMMAND_ARITY[letter.toLowerCase()];
    if (arity === undefined) {
      throw new VectorCarrierError(
        `path d 含不支持的命令 ${letter}。`,
        "vector-invalid-ir",
      );
    }
    if (arity === 0) {
      commands.push({ command: letter, args: [] });
      continue;
    }
    const args: number[] = [];
    for (let step = 0; step < arity; step += 1) {
      const value = Number(tokens[index + step]);
      if (!Number.isFinite(value)) {
        throw new VectorCarrierError(
          `path d 的 ${letter} 命令参数不完整。`,
          "vector-invalid-ir",
        );
      }
      args.push(value);
    }
    index += arity;
    commands.push({ command: letter, args });
    // Repeated coordinate sets after a command letter implicitly repeat it,
    // with `M`/`m` degrading to `L`/`l` per the SVG grammar.
    if (letter === "M") letter = "L";
    else if (letter === "m") letter = "l";
  }
  return commands;
}

/** Normalizes to absolute coordinates; H/V become L so editing is uniform. */
export function absolutePathCommands(
  commands: readonly VectorPathCommand[],
): VectorPathCommand[] {
  const out: VectorPathCommand[] = [];
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  for (const entry of commands) {
    const relative = entry.command === entry.command.toLowerCase();
    const kind = entry.command.toLowerCase();
    switch (kind) {
      case "z":
        out.push({ command: "Z", args: [] });
        currentX = startX;
        currentY = startY;
        break;
      case "h": {
        const x = relative ? currentX + entry.args[0] : entry.args[0];
        out.push({ command: "L", args: [x, currentY] });
        currentX = x;
        break;
      }
      case "v": {
        const y = relative ? currentY + entry.args[0] : entry.args[0];
        out.push({ command: "L", args: [currentX, y] });
        currentY = y;
        break;
      }
      case "a": {
        const [rx, ry, rotation, largeArc, sweep, rawX, rawY] = entry.args;
        const x = relative ? currentX + rawX : rawX;
        const y = relative ? currentY + rawY : rawY;
        out.push({
          command: "A",
          args: [rx, ry, rotation, largeArc, sweep, x, y],
        });
        currentX = x;
        currentY = y;
        break;
      }
      default: {
        const args: number[] = [];
        for (let index = 0; index < entry.args.length; index += 2) {
          const x = relative ? currentX + entry.args[index] : entry.args[index];
          const y = relative
            ? currentY + entry.args[index + 1]
            : entry.args[index + 1];
          args.push(x, y);
        }
        currentX = args[args.length - 2];
        currentY = args[args.length - 1];
        const command = kind === "m" ? "M" : kind.toUpperCase();
        out.push({ command, args });
        if (command === "M") {
          startX = currentX;
          startY = currentY;
        }
        break;
      }
    }
  }
  return out;
}

function roundCoordinate(value: number): number {
  return Number.isInteger(value) ? value : Number(value.toFixed(4));
}

export function serializePathCommands(
  commands: readonly VectorPathCommand[],
): string {
  return commands
    .map((entry) =>
      entry.args.length === 0
        ? entry.command
        : `${entry.command} ${entry.args.map(roundCoordinate).join(" ")}`,
    )
    .join(" ");
}

/** §5.1: `shapes[].d` MUST be parseable into an anchor sequence. */
export function parsePathAnchors(d: string): VectorPathAnchor[] {
  const commands = absolutePathCommands(parsePathCommands(d));
  const anchors: VectorPathAnchor[] = [];
  for (const [commandIndex, entry] of commands.entries()) {
    if (entry.command === "Z") continue;
    const x = entry.args[entry.args.length - 2];
    const y = entry.args[entry.args.length - 1];
    anchors.push({ commandIndex, command: entry.command, x, y });
  }
  return anchors;
}

export function shapeAnchorCount(shape: VectorShape): number {
  switch (shape.type) {
    case "path":
      return shape.d ? parsePathAnchors(shape.d).length : 0;
    case "rect":
      return 4;
    case "circle":
    case "ellipse":
      return 4;
    case "line":
      return 2;
    case "polyline":
    case "polygon":
      return shape.points
        ? shape.points.trim().split(/[\s,]+/).filter(Boolean).length / 2
        : 0;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Tokenization (§3.3 `sanitized → tokenized`)
// ---------------------------------------------------------------------------

const KNOWN_TOKEN_NAMES: Record<string, string> = {
  "#FFFFFF": "vec-white",
  "#1F2328": "vec-ink",
  "#1F6FEB": "vec-accent",
  "#C47323": "vec-accent-2",
  "#8C959F": "vec-neutral",
  "#F5F7FA": "vec-surface",
};

const SHAPE_TAGS: Record<string, VectorShapeType> = {
  path: "path",
  rect: "rect",
  circle: "circle",
  ellipse: "ellipse",
  line: "line",
  polyline: "polyline",
  polygon: "polygon",
  g: "group",
  use: "use",
  text: "text",
};

const DEF_TAGS: Record<string, VectorDef["kind"]> = {
  lineargradient: "linear-gradient",
  radialgradient: "radial-gradient",
  clippath: "clip-path",
  mask: "mask",
  symbol: "symbol",
};

interface RawElement {
  tag: string;
  attributes: Map<string, string>;
  children: RawElement[];
  text: string;
}

function localName(name: string): string {
  const colon = name.indexOf(":");
  return (colon === -1 ? name : name.slice(colon + 1)).toLowerCase();
}

/**
 * Minimal reader over already-sanitized SVG. It is deliberately separate from
 * the sanitizer's scanner: the tokenizer never sees the original bytes, only
 * the sanitized text, which is how `parsed → tokenized` stays unreachable.
 */
function readElements(svg: string): RawElement[] {
  const roots: RawElement[] = [];
  const stack: RawElement[] = [];
  const tagPattern = /<(\/?)([^\s/>!?]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let match: RegExpExecArray | null;
  let cursor = 0;
  while ((match = tagPattern.exec(svg)) !== null) {
    const [raw, closing, name, attributeText, selfClosing] = match;
    const text = svg.slice(cursor, match.index);
    cursor = match.index + raw.length;
    const parent = stack[stack.length - 1];
    if (parent && text.trim()) parent.text += text;
    if (closing) {
      stack.pop();
      continue;
    }
    const attributes = new Map<string, string>();
    const attributePattern =
      /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let attributeMatch: RegExpExecArray | null;
    while ((attributeMatch = attributePattern.exec(attributeText)) !== null) {
      attributes.set(
        localName(attributeMatch[1]),
        attributeMatch[2] ?? attributeMatch[3] ?? attributeMatch[4] ?? "",
      );
    }
    const element: RawElement = {
      tag: localName(name),
      attributes,
      children: [],
      text: "",
    };
    if (parent) parent.children.push(element);
    else roots.push(element);
    if (!selfClosing) stack.push(element);
  }
  return roots;
}

function findSvgRoot(elements: readonly RawElement[]): RawElement | null {
  for (const element of elements) {
    if (element.tag === "svg") return element;
    const nested = findSvgRoot(element.children);
    if (nested) return nested;
  }
  return null;
}

export interface VectorViewBox {
  width: number;
  height: number;
}

function readSvgViewBox(root: RawElement | null): VectorViewBox | null {
  if (!root) return null;
  const viewBox = root.attributes.get("viewbox");
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
      const width = parts[2];
      const height = parts[3];
      if (width > 0 && height > 0) return { width, height };
    }
  }
  const width = Number.parseFloat(root.attributes.get("width") ?? "");
  const height = Number.parseFloat(root.attributes.get("height") ?? "");
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }
  return null;
}

/** §3.3 `empty → parsed` requires a usable viewBox (or width/height). */
export function svgViewBox(svg: string): VectorViewBox | null {
  return readSvgViewBox(findSvgRoot(readElements(svg)));
}

export interface VectorTokenizeOptions {
  title: string;
  kind: VectorCanvasKind;
  accessibility: { label: string; decorative: boolean; description?: string };
  attribution: VectorAttributionEntry[];
  /**
   * §2.4 / §5.4: a single-ink icon MUST inherit `currentColor` so consumers can
   * recolour it. On by default; turning it off is only for multi-colour art.
   */
  monochromeAsCurrentColor?: boolean;
}

export interface VectorTokenizeResult {
  project: VectorProject;
  /** Shapes that carried a literal colour before tokenization (F4 evidence). */
  hardcodedColorShapeIds: string[];
}

function normalizeColor(value: string): string {
  const probe = value.trim();
  if (/^currentcolor$/i.test(probe)) return "currentColor";
  if (/^none$/i.test(probe)) return "none";
  if (/^#[0-9a-f]{6}$/i.test(probe)) return probe.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(probe)) {
    return `#${probe
      .slice(1)
      .split("")
      .map((character) => character + character)
      .join("")}`.toUpperCase();
  }
  if (/^#[0-9a-f]{8}$/i.test(probe)) return probe.toUpperCase();
  return "";
}

/** §3.3 `sanitized → tokenized`: colours become tokens, shapes become `shapes`. */
export function tokenizeSvgToVectorProject(
  sanitizedSvg: string,
  options: VectorTokenizeOptions,
): VectorTokenizeResult {
  const residual = residualDangerousConstructs(sanitizedSvg);
  if (residual.length > 0) {
    // Defence in depth: the tokenizer refuses to run on unsanitized text even
    // if a caller tries to skip the `parsed → sanitized` edge.
    throw new VectorCarrierError(
      `tokenize 拒绝未净化的 SVG（残留 ${residual.join(", ")}）。`,
      "vector-script-residue",
    );
  }
  const roots = readElements(sanitizedSvg);
  const root = findSvgRoot(roots);
  const viewBox = readSvgViewBox(root);
  if (!root || !viewBox) {
    throw new VectorCarrierError(
      "SVG 缺少可用的 viewBox 或 width/height。",
      "vector-missing-viewbox",
    );
  }

  const paletteOrder: string[] = [];
  const tokenByColor = new Map<string, string>();
  let anonymousInk = 0;
  const tokenFor = (color: string): string => {
    const existing = tokenByColor.get(color);
    if (existing) return existing;
    let token = KNOWN_TOKEN_NAMES[color];
    if (!token) {
      if (color === "currentColor") token = "vec-current";
      else if (color === "none") token = "vec-none";
      else {
        anonymousInk += 1;
        token = `ink-${anonymousInk}`;
      }
    }
    tokenByColor.set(color, token);
    paletteOrder.push(color);
    return token;
  };

  const shapes: VectorShape[] = [];
  const defs: VectorDef[] = [];
  const hardcodedColorShapeIds: string[] = [];
  let shapeSerial = 0;
  const shapeId = (element: RawElement): string => {
    const declared = element.attributes.get("id") ?? "";
    if (/^[a-z][a-zA-Z0-9_-]{0,47}$/.test(declared)) return declared;
    shapeSerial += 1;
    return `shape-${shapeSerial}`;
  };

  const numeric = (element: RawElement, name: string): number | undefined => {
    const raw = element.attributes.get(name);
    if (raw === undefined) return undefined;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : undefined;
  };

  const collectDefs = (element: RawElement) => {
    const kind = DEF_TAGS[element.tag];
    const id = element.attributes.get("id") ?? "";
    if (kind && /^[a-z][a-zA-Z0-9_-]{0,47}$/.test(id)) {
      const stops = element.children
        .filter((child) => child.tag === "stop")
        .slice(0, VECTOR_CONSTANTS.C24_maximumGradientStops)
        .map((child) => {
          const offsetRaw = child.attributes.get("offset") ?? "0";
          const offset = offsetRaw.endsWith("%")
            ? Number.parseFloat(offsetRaw) / 100
            : Number.parseFloat(offsetRaw);
          const color = normalizeColor(
            child.attributes.get("stop-color") ?? "#000000",
          );
          return {
            offset: Number.isFinite(offset)
              ? Math.min(1, Math.max(0, offset))
              : 0,
            colorToken: tokenFor(color || "#000000"),
          };
        });
      defs.push({ id, kind, ...(stops.length > 0 ? { stops } : {}) });
    }
    for (const child of element.children) collectDefs(child);
  };

  const walk = (element: RawElement): string | null => {
    if (element.tag === "defs" || DEF_TAGS[element.tag]) {
      collectDefs(element);
      return null;
    }
    const type = SHAPE_TAGS[element.tag];
    if (!type) {
      for (const child of element.children) walk(child);
      return null;
    }
    const id = shapeId(element);
    const shape: VectorShape = { id, type, z: shapes.length };
    shapes.push(shape);

    const fill = normalizeColor(element.attributes.get("fill") ?? "");
    const stroke = normalizeColor(element.attributes.get("stroke") ?? "");
    if (fill) {
      shape.fillToken = tokenFor(fill);
      if (fill !== "currentColor" && fill !== "none") {
        hardcodedColorShapeIds.push(id);
      }
    }
    if (stroke) {
      shape.strokeToken = tokenFor(stroke);
      if (
        stroke !== "currentColor" &&
        stroke !== "none" &&
        !hardcodedColorShapeIds.includes(id)
      ) {
        hardcodedColorShapeIds.push(id);
      }
    }

    const strokeWidth = numeric(element, "stroke-width");
    if (strokeWidth !== undefined) shape.strokeWidth = strokeWidth;
    const linecap = element.attributes.get("stroke-linecap");
    if (linecap === "butt" || linecap === "round" || linecap === "square") {
      shape.strokeLinecap = linecap;
    }
    const linejoin = element.attributes.get("stroke-linejoin");
    if (linejoin === "miter" || linejoin === "round" || linejoin === "bevel") {
      shape.strokeLinejoin = linejoin;
    }
    const fillRule = element.attributes.get("fill-rule");
    if (fillRule === "nonzero" || fillRule === "evenodd") {
      shape.fillRule = fillRule;
    }
    const opacity = numeric(element, "opacity");
    if (opacity !== undefined) shape.opacity = Math.min(1, Math.max(0, opacity));
    const transform = element.attributes.get("transform");
    if (transform) shape.transform = transform.slice(0, 300);

    switch (type) {
      case "path": {
        shape.d = element.attributes.get("d") ?? "";
        break;
      }
      case "rect": {
        shape.x = numeric(element, "x") ?? 0;
        shape.y = numeric(element, "y") ?? 0;
        shape.width = numeric(element, "width") ?? 0;
        shape.height = numeric(element, "height") ?? 0;
        const rx = numeric(element, "rx");
        const ry = numeric(element, "ry");
        if (rx !== undefined) shape.rx = rx;
        if (ry !== undefined) shape.ry = ry;
        break;
      }
      case "circle": {
        shape.cx = numeric(element, "cx") ?? 0;
        shape.cy = numeric(element, "cy") ?? 0;
        shape.r = numeric(element, "r") ?? 0;
        break;
      }
      case "ellipse": {
        shape.cx = numeric(element, "cx") ?? 0;
        shape.cy = numeric(element, "cy") ?? 0;
        shape.rx = numeric(element, "rx") ?? 0;
        shape.ry = numeric(element, "ry") ?? 0;
        break;
      }
      case "line": {
        shape.x = numeric(element, "x1") ?? 0;
        shape.y = numeric(element, "y1") ?? 0;
        shape.width = Math.max(
          0.0001,
          Math.abs((numeric(element, "x2") ?? 0) - (numeric(element, "x1") ?? 0)),
        );
        shape.height = Math.max(
          0.0001,
          Math.abs((numeric(element, "y2") ?? 0) - (numeric(element, "y1") ?? 0)),
        );
        break;
      }
      case "polyline":
      case "polygon": {
        shape.points = (element.attributes.get("points") ?? "").slice(0, 20_000);
        break;
      }
      case "text": {
        shape.x = numeric(element, "x") ?? 0;
        shape.y = numeric(element, "y") ?? 0;
        shape.text = element.text.trim().slice(0, 300);
        break;
      }
      case "use": {
        const reference = (
          element.attributes.get("href") ??
          element.attributes.get("xlink:href") ??
          ""
        ).trim();
        shape.refId = reference.startsWith("#")
          ? reference.slice(1, 49)
          : reference.slice(0, 48);
        break;
      }
      case "group": {
        const childIds: string[] = [];
        for (const child of element.children) {
          const childId = walk(child);
          if (childId) childIds.push(childId);
        }
        shape.childIds = childIds.slice(
          0,
          VECTOR_CONSTANTS.C25_maximumGroupChildren,
        );
        break;
      }
      default:
        break;
    }

    const anchors = shapeAnchorCount(shape);
    if (anchors > 0) shape.anchorCount = anchors;
    return id;
  };

  for (const child of root.children) walk(child);
  // `z` is document order and therefore unique by construction (§8.2).
  for (const [index, shape] of shapes.entries()) shape.z = index;

  const inkColors = paletteOrder.filter(
    (color) => color !== "none" && color !== "currentColor",
  );
  const monochrome =
    options.monochromeAsCurrentColor !== false && inkColors.length === 1;
  const palette: VectorPaletteToken[] = paletteOrder.map((color) => ({
    token: tokenByColor.get(color) as string,
    value: monochrome && color === inkColors[0] ? "currentColor" : color,
  }));

  const project: VectorProject = {
    schema: VECTOR_PROJECT_SCHEMA,
    version: 1,
    title: options.title,
    canvas: {
      viewBoxWidth: viewBox.width,
      viewBoxHeight: viewBox.height,
      kind: options.kind,
    },
    palette:
      palette.length > 0
        ? palette
        : [{ token: "vec-current", value: "currentColor" }],
    shapes,
    ...(defs.length > 0 ? { defs } : {}),
    accessibility: options.accessibility,
    attribution: { entries: options.attribution },
  };
  const gridUnits = VECTOR_CONSTANTS.C8_allowedGridUnits.find(
    (units) => units === viewBox.width && units === viewBox.height,
  );
  if (gridUnits) {
    project.canvas.gridUnits = gridUnits as 16 | 24 | 32 | 48;
  }
  return { project, hardcodedColorShapeIds };
}

// ---------------------------------------------------------------------------
// §5.1 the three capabilities
// ---------------------------------------------------------------------------

export interface VectorCapabilityReport {
  ok: boolean;
  anchorEditing: { ok: boolean; totalAnchors: number; editableShapeIds: string[] };
  recoloring: {
    ok: boolean;
    tokenCount: number;
    tokenReferenceRatio: number;
    hardcodedShapeIds: string[];
  };
  shapeSwapping: {
    ok: boolean;
    shapeCount: number;
    independentlySelectable: boolean;
  };
  flattened: boolean;
}

/**
 * §5.1: the three capabilities the bitmap adapter used to swallow. Failing any
 * one makes the artifact `flattened-only` (§3.3) and it MUST NOT claim `native`.
 */
export function vectorCapabilityReport(
  project: VectorProject,
): VectorCapabilityReport {
  const totalAnchors = project.shapes.reduce(
    (sum, shape) => sum + (shape.anchorCount ?? shapeAnchorCount(shape)),
    0,
  );
  const editableShapeIds = project.shapes
    .filter((shape) => shape.type === "path" && Boolean(shape.d))
    .map((shape) => shape.id);
  const anchorEditing = {
    ok: totalAnchors >= VECTOR_CONSTANTS.C22_minimumTotalAnchors,
    totalAnchors,
    editableShapeIds,
  };

  const drawable = project.shapes.filter((shape) => shape.type !== "group");
  const tokenReferencing = drawable.filter(
    (shape) => Boolean(shape.fillToken) || Boolean(shape.strokeToken),
  );
  const tokenReferenceRatio =
    drawable.length === 0 ? 0 : tokenReferencing.length / drawable.length;
  const recoloring = {
    ok:
      project.palette.length >= VECTOR_CONSTANTS.C18_paletteTokens.minimum &&
      tokenReferenceRatio >=
        VECTOR_COMPLETENESS_THRESHOLDS.minimumTokenReferenceRatio,
    tokenCount: project.palette.length,
    tokenReferenceRatio,
    hardcodedShapeIds: drawable
      .filter((shape) => !shape.fillToken && !shape.strokeToken)
      .map((shape) => shape.id),
  };

  const zValues = new Set(project.shapes.map((shape) => shape.z));
  const shapeSwapping = {
    ok:
      project.shapes.length >= vectorShapeCountFloor(project.canvas.kind) &&
      zValues.size === project.shapes.length,
    shapeCount: project.shapes.length,
    independentlySelectable: zValues.size === project.shapes.length,
  };

  const ok = anchorEditing.ok && recoloring.ok && shapeSwapping.ok;
  return {
    ok,
    anchorEditing,
    recoloring,
    shapeSwapping,
    flattened: !ok,
  };
}

export interface VectorReferenceReport {
  ok: boolean;
  danglingRefIds: string[];
  danglingChildIds: string[];
}

/** §3.3 `tokenized → invalid` / F5. */
export function verifyVectorReferences(
  project: VectorProject,
): VectorReferenceReport {
  const shapeIds = new Set(project.shapes.map((shape) => shape.id));
  const defIds = new Set((project.defs ?? []).map((def) => def.id));
  const danglingRefIds: string[] = [];
  const danglingChildIds: string[] = [];
  for (const shape of project.shapes) {
    if (shape.type === "use" && shape.refId) {
      if (!defIds.has(shape.refId) && !shapeIds.has(shape.refId)) {
        danglingRefIds.push(shape.refId);
      }
    }
    for (const childId of shape.childIds ?? []) {
      if (!shapeIds.has(childId)) danglingChildIds.push(childId);
    }
  }
  return {
    ok: danglingRefIds.length === 0 && danglingChildIds.length === 0,
    danglingRefIds,
    danglingChildIds,
  };
}

const COVERAGE_GRID = 64;

/** §8.2: graphic coverage of the viewBox, union-aware on a fixed lattice. */
export function vectorCoverageRatio(project: VectorProject): number {
  const { viewBoxWidth, viewBoxHeight } = project.canvas;
  const cellWidth = viewBoxWidth / COVERAGE_GRID;
  const cellHeight = viewBoxHeight / COVERAGE_GRID;
  const cells = new Set<number>();
  const mark = (
    left: number,
    top: number,
    right: number,
    bottom: number,
  ) => {
    const columnStart = Math.max(0, Math.floor(left / cellWidth));
    const columnEnd = Math.min(
      COVERAGE_GRID - 1,
      Math.ceil(right / cellWidth) - 1,
    );
    const rowStart = Math.max(0, Math.floor(top / cellHeight));
    const rowEnd = Math.min(COVERAGE_GRID - 1, Math.ceil(bottom / cellHeight) - 1);
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let column = columnStart; column <= columnEnd; column += 1) {
        cells.add(row * COVERAGE_GRID + column);
      }
    }
  };
  for (const shape of project.shapes) {
    if (shape.opacity === 0) continue;
    switch (shape.type) {
      case "path": {
        if (!shape.d) break;
        const anchors = parsePathAnchors(shape.d);
        if (anchors.length === 0) break;
        const xs = anchors.map((anchor) => anchor.x);
        const ys = anchors.map((anchor) => anchor.y);
        mark(
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs),
          Math.max(...ys),
        );
        break;
      }
      case "rect":
      case "line":
      case "text":
        mark(
          shape.x ?? 0,
          shape.y ?? 0,
          (shape.x ?? 0) + (shape.width ?? 0),
          (shape.y ?? 0) + (shape.height ?? 0),
        );
        break;
      case "circle":
        mark(
          (shape.cx ?? 0) - (shape.r ?? 0),
          (shape.cy ?? 0) - (shape.r ?? 0),
          (shape.cx ?? 0) + (shape.r ?? 0),
          (shape.cy ?? 0) + (shape.r ?? 0),
        );
        break;
      case "ellipse":
        mark(
          (shape.cx ?? 0) - (shape.rx ?? 0),
          (shape.cy ?? 0) - (shape.ry ?? 0),
          (shape.cx ?? 0) + (shape.rx ?? 0),
          (shape.cy ?? 0) + (shape.ry ?? 0),
        );
        break;
      case "polyline":
      case "polygon": {
        const numbers = (shape.points ?? "")
          .trim()
          .split(/[\s,]+/)
          .map(Number)
          .filter((value) => Number.isFinite(value));
        const xs: number[] = [];
        const ys: number[] = [];
        for (let index = 0; index + 1 < numbers.length; index += 2) {
          xs.push(numbers[index]);
          ys.push(numbers[index + 1]);
        }
        if (xs.length > 0) {
          mark(
            Math.min(...xs),
            Math.min(...ys),
            Math.max(...xs),
            Math.max(...ys),
          );
        }
        break;
      }
      default:
        break;
    }
  }
  return cells.size / (COVERAGE_GRID * COVERAGE_GRID);
}

// ---------------------------------------------------------------------------
// §1.3 licence tiers
// ---------------------------------------------------------------------------

export type VectorLicenseTier =
  | "free"
  | "composite-component-only"
  | "forbidden";

export interface VectorLicenseDecision {
  tier: VectorLicenseTier;
  reason: string;
  standaloneDownloadAllowed: boolean;
  attributionRequired: boolean;
}

/**
 * §1.3. The contract's own stance, not a re-derivation: the upstream ruling on
 * svgrepo is a ToS/contract question rather than a copyright one, so svgrepo
 * items MAY stay as components inside composites but MUST NOT become new
 * standalone downloadable assets until W9 rules; openmoji's CC-BY-SA is out of
 * v1 entirely; tabler's MIT is free but still attributed.
 */
export function vectorLicenseDecision(input: {
  provider?: string;
  licenseCode: string;
}): VectorLicenseDecision {
  const provider = (input.provider ?? "").trim().toLowerCase();
  const licenseCode = input.licenseCode.trim().toUpperCase();
  if (licenseCode === "CC-BY-SA" || provider === "openmoji") {
    return {
      tier: "forbidden",
      reason:
        "CC-BY-SA（openmoji 1,644 份）MUST NOT 进入 v1 组合产物（§1.3 / 合同 §2.8 雷 3）。",
      standaloneDownloadAllowed: false,
      attributionRequired: true,
    };
  }
  if (provider === "svgrepo") {
    return {
      tier: "composite-component-only",
      reason:
        "svgrepo 处置结论未出（§1.3，归 W9）：MAY 作组合产物内部成分，MUST NOT 新增以单件为主体的独立可下载素材。",
      standaloneDownloadAllowed: false,
      attributionRequired: true,
    };
  }
  return {
    tier: "free",
    reason:
      provider === "tabler"
        ? "tabler 182 份 MIT，MAY 自由使用，attribution 仍 MUST 记录（§1.3）。"
        : "许可在 §3.1 枚举内，attribution MUST 记录。",
    standaloneDownloadAllowed: true,
    attributionRequired: true,
  };
}

export interface VectorLicenseManifest {
  ok: boolean;
  entries: (VectorAttributionEntry & { decision: VectorLicenseDecision })[];
  forbidden: string[];
  standaloneDownloadAllowed: boolean;
}

/** §1.3 made visible in the artifact metadata (and in the exported SVG). */
export function vectorLicenseManifest(
  project: VectorProject,
): VectorLicenseManifest {
  const entries = project.attribution.entries.map((entry) => ({
    ...entry,
    decision: vectorLicenseDecision({
      provider: entry.provider,
      licenseCode: entry.licenseCode,
    }),
  }));
  const forbidden = entries
    .filter((entry) => entry.decision.tier === "forbidden")
    .map((entry) => entry.provider || entry.licenseCode);
  return {
    ok: forbidden.length === 0,
    entries,
    forbidden,
    standaloneDownloadAllowed:
      forbidden.length === 0 &&
      entries.every((entry) => entry.decision.standaloneDownloadAllowed),
  };
}

// ---------------------------------------------------------------------------
// §8 byte floors and completeness
// ---------------------------------------------------------------------------

export interface VectorCriterion {
  id: string;
  criterion: string;
  threshold: string;
  actual: string;
  ok: boolean;
  spec: string;
}

export interface VectorCompletenessReport {
  ok: boolean;
  criteria: VectorCriterion[];
  failed: string[];
}

export interface VectorCompletenessInput {
  svgByteSize: number;
  irByteSize: number;
  frameColorCount?: number | null;
  residualDangerCount?: number;
}

export function evaluateVectorCompleteness(
  project: VectorProject,
  input: VectorCompletenessInput,
): VectorCompletenessReport {
  const kind = project.canvas.kind;
  const capability = vectorCapabilityReport(project);
  const references = verifyVectorReferences(project);
  const coverage = vectorCoverageRatio(project);
  const license = vectorLicenseManifest(project);
  const typesUsed = new Set(project.shapes.map((shape) => shape.type));
  const zValues = new Set(project.shapes.map((shape) => shape.z));
  const duplicateZ = project.shapes.length - zValues.size;
  const wellFormedAttribution = project.attribution.entries.filter(
    (entry) =>
      Boolean(entry.text) &&
      Boolean(entry.licenseCode) &&
      entry.licenseUrl.startsWith("https://"),
  );
  const residualDanger = input.residualDangerCount ?? 0;
  const sourceFloor = vectorSourceByteFloor(kind);
  const colorFloor = vectorFrameColorFloor(kind);

  const criteria: VectorCriterion[] = [
    {
      id: "svg-bytes",
      criterion: `svg 源字节（kind=${kind}）`,
      threshold: `${sourceFloor} – ${VECTOR_CONSTANTS.C31_maximumSourceBytes} B`,
      actual: `${input.svgByteSize} B`,
      ok:
        input.svgByteSize >= sourceFloor &&
        input.svgByteSize <= VECTOR_CONSTANTS.C31_maximumSourceBytes,
      spec: "§8.1 / C29 / C30 / C31",
    },
    {
      id: "ir-bytes",
      criterion: "oceanleo.vector.v1 IR 字节",
      threshold: `≥ ${VECTOR_CONSTANTS.C32_irByteFloor} B`,
      actual: `${input.irByteSize} B`,
      ok: input.irByteSize >= VECTOR_CONSTANTS.C32_irByteFloor,
      spec: "§8.1 / C32",
    },
    {
      id: "shape-count",
      criterion: "shapes 条数",
      threshold: `≥ ${sourceFloorLabel(kind)}`,
      actual: String(project.shapes.length),
      ok: project.shapes.length >= vectorShapeCountFloor(kind),
      spec: "§8.2 / C1 / C3 / C4",
    },
    {
      id: "anchor-total",
      criterion: "全份 anchorCount 合计",
      threshold: `≥ ${VECTOR_CONSTANTS.C22_minimumTotalAnchors}`,
      actual: String(capability.anchorEditing.totalAnchors),
      ok: capability.anchorEditing.ok,
      spec: "§8.2 / C22 / F1",
    },
    {
      id: "shape-types",
      criterion: "用到的形状类型种数",
      threshold: `≥ ${VECTOR_CONSTANTS.C6_minimumShapeTypesUsed}`,
      actual: String(typesUsed.size),
      ok: typesUsed.size >= VECTOR_CONSTANTS.C6_minimumShapeTypesUsed,
      spec: "§8.2 / C6",
    },
    {
      id: "duplicate-z",
      criterion: "z 重复数",
      threshold: "= 0",
      actual: String(duplicateZ),
      ok: duplicateZ === 0,
      spec: "§8.2 / C19",
    },
    {
      id: "dangling-references",
      criterion: "悬空 refId / childIds 数",
      threshold: "= 0",
      actual: String(
        references.danglingRefIds.length + references.danglingChildIds.length,
      ),
      ok: references.ok,
      spec: "§8.2 / F5 / §3.3",
    },
    {
      id: "palette-tokens",
      criterion: "palette token 数",
      threshold: `≥ ${VECTOR_CONSTANTS.C18_paletteTokens.minimum}`,
      actual: String(project.palette.length),
      ok: project.palette.length >= VECTOR_CONSTANTS.C18_paletteTokens.minimum,
      spec: "§8.2 / C18 / F4",
    },
    {
      id: "token-reference-ratio",
      criterion: "引用 fillToken 或 strokeToken 的形状占比",
      threshold: `≥ ${VECTOR_COMPLETENESS_THRESHOLDS.minimumTokenReferenceRatio}`,
      actual: capability.recoloring.tokenReferenceRatio.toFixed(4),
      ok:
        capability.recoloring.tokenReferenceRatio >=
        VECTOR_COMPLETENESS_THRESHOLDS.minimumTokenReferenceRatio,
      spec: "§8.2 / F4",
    },
    {
      id: "residual-danger",
      criterion: "§3.2 的 8 类危险构造残留数",
      threshold: "= 0",
      actual: String(residualDanger),
      ok: residualDanger === 0,
      spec: "§8.2 / §3.2 / C28 / F3",
    },
    {
      id: "accessible-name",
      criterion: "非装饰件的 accessibility.label 长度",
      threshold: `≥ ${VECTOR_CONSTANTS.C26_minimumLabelLength} 字符`,
      actual: project.accessibility.decorative
        ? "decorative=true"
        : String([...project.accessibility.label].length),
      ok:
        project.accessibility.decorative ||
        [...project.accessibility.label].length >=
          VECTOR_CONSTANTS.C26_minimumLabelLength,
      spec: "§8.2 / C26 / F7 / WCAG 2.2 SC 1.1.1",
    },
    {
      id: "attribution",
      criterion: "attribution.entries",
      threshold: `≥ ${VECTOR_COMPLETENESS_THRESHOLDS.minimumAttributionEntries}，三字段齐全，无 CC-BY-SA`,
      actual: `${wellFormedAttribution.length}/${project.attribution.entries.length}，forbidden=${license.forbidden.join(",") || "none"}`,
      ok:
        project.attribution.entries.length >=
          VECTOR_COMPLETENESS_THRESHOLDS.minimumAttributionEntries &&
        wellFormedAttribution.length === project.attribution.entries.length &&
        license.ok,
      spec: "§8.2 / §1.3 / F6",
    },
    {
      id: "title",
      criterion: "title 长度",
      threshold: `≥ ${VECTOR_COMPLETENESS_THRESHOLDS.minimumTitleLength} 字符`,
      actual: String([...project.title].length),
      ok:
        [...project.title].length >=
        VECTOR_COMPLETENESS_THRESHOLDS.minimumTitleLength,
      spec: "§8.2 / reviewed_material_catalog.py:3309",
    },
    {
      id: "frame-colors",
      criterion: `抓帧颜色数（kind=${kind}）`,
      threshold: `≥ ${colorFloor} 种`,
      actual:
        input.frameColorCount === undefined || input.frameColorCount === null
          ? "未抓帧"
          : String(input.frameColorCount),
      ok:
        typeof input.frameColorCount === "number" &&
        input.frameColorCount >= colorFloor,
      spec: "§8.2 / C36 / C37 / A5",
    },
    {
      id: "coverage",
      criterion: "图形覆盖 viewBox 面积比",
      threshold: `≥ ${VECTOR_COMPLETENESS_THRESHOLDS.minimumCoverageRatio}`,
      actual: coverage.toFixed(4),
      ok: coverage >= VECTOR_COMPLETENESS_THRESHOLDS.minimumCoverageRatio,
      spec: "§8.2",
    },
  ];

  const failed = criteria.filter((row) => !row.ok).map((row) => row.id);
  return { ok: failed.length === 0, criteria, failed };
}

/**
 * §8.2 criteria that need a rendered frame. Enforced on `tokenized → ready`;
 * a byte-level gate MUST NOT claim to have judged them.
 */
export const VECTOR_RASTER_STAGE_CRITERIA = Object.freeze(["frame-colors"]);

/** The source-only slice of §8.1 + §8.2, for gates that run before rendering. */
export function vectorSourceCompleteness(
  project: VectorProject,
  input: Omit<VectorCompletenessInput, "frameColorCount">,
): VectorCompletenessReport {
  const full = evaluateVectorCompleteness(project, {
    ...input,
    frameColorCount: null,
  });
  const criteria = full.criteria.filter(
    (row) => !VECTOR_RASTER_STAGE_CRITERIA.includes(row.id),
  );
  const failed = criteria.filter((row) => !row.ok).map((row) => row.id);
  return { ok: failed.length === 0, criteria, failed };
}

function sourceFloorLabel(kind: VectorCanvasKind): string {
  return kind === "icon"
    ? `${VECTOR_CONSTANTS.C3_minimumIconShapes}（icon）`
    : kind === "illustration"
      ? `${VECTOR_CONSTANTS.C4_minimumIllustrationShapes}（illustration）`
      : String(VECTOR_CONSTANTS.C1_minimumShapes);
}

// ---------------------------------------------------------------------------
// §3.3 driver
// ---------------------------------------------------------------------------

export interface VectorLoadInput {
  svg?: string | Uint8Array | null;
  tokenize: VectorTokenizeOptions;
  frameColorCount?: number | null;
}

export interface VectorLoadResult {
  state: VectorState;
  trace: VectorState[];
  sanitize: SvgSanitizeReport | null;
  project: VectorProject | null;
  capability: VectorCapabilityReport | null;
  completeness: VectorCompletenessReport | null;
  code: string | null;
  reason: string;
}

/**
 * §3.3 driver. Sanitization sits on the only path from `parsed` to `tokenized`,
 * and every step is checked against `vectorTransitionAllowed`, so a trace that
 * reaches `tokenized` is itself the C-2/C-5 evidence.
 */
export function loadVectorSource(input: VectorLoadInput): VectorLoadResult {
  const trace: VectorState[] = ["empty"];
  const result: VectorLoadResult = {
    state: "empty",
    trace,
    sanitize: null,
    project: null,
    capability: null,
    completeness: null,
    code: null,
    reason: "",
  };
  const step = (to: VectorState, code?: string, reason?: string) => {
    const from = result.state;
    if (!vectorTransitionAllowed(from, to)) {
      throw new VectorCarrierError(
        `vector 载入路径出现非法迁移 ${from} → ${to}。`,
        "vector-invalid-ir",
      );
    }
    result.state = to;
    trace.push(to);
    if (code) result.code = code;
    if (reason) result.reason = reason;
  };

  const svg =
    input.svg === undefined || input.svg === null
      ? ""
      : typeof input.svg === "string"
        ? input.svg
        : new TextDecoder().decode(input.svg);
  if (!svg.trim()) {
    result.reason = "没有 SVG 字节，停在 empty。";
    return result;
  }

  step("parsed");
  const sanitize = sanitizeSvg(svg);
  result.sanitize = sanitize;
  if (!sanitize.svg) {
    step("invalid", "vector-invalid-xml", "XML 非良构，无法净化。");
    return result;
  }
  if (!sanitize.hasViewBox) {
    step(
      "invalid",
      "vector-missing-viewbox",
      "无 viewBox 且无可用 width/height。",
    );
    return result;
  }
  if (sanitize.residual.length > 0) {
    step(
      "invalid",
      "vector-script-residue",
      `净化后仍残留危险构造：${sanitize.residual.join(", ")}。`,
    );
    return result;
  }
  if (!sanitize.renderable) {
    step(
      "invalid",
      "vector-missing-viewbox",
      "净化后已无可渲染图形，MUST NOT 当作达标。",
    );
    return result;
  }

  step("sanitized");
  let tokenized: VectorTokenizeResult;
  try {
    tokenized = tokenizeSvgToVectorProject(sanitize.svg, input.tokenize);
  } catch (caught) {
    const error =
      caught instanceof VectorCarrierError
        ? caught
        : new VectorCarrierError("tokenize 失败。", "vector-invalid-ir");
    step("flattened-only", error.code, error.message);
    return result;
  }
  const project = tokenized.project;
  result.project = project;
  const capability = vectorCapabilityReport(project);
  result.capability = capability;
  const validation = validateVectorProject(project);
  if (!validation.ok || capability.flattened) {
    step(
      "flattened-only",
      capability.flattened
        ? "vector-flattened-only"
        : "vector-invalid-ir",
      capability.flattened
        ? `§5.1 三件能力未全部成立（shapes=${capability.shapeSwapping.shapeCount}，anchors=${capability.anchorEditing.totalAnchors}，tokenRatio=${capability.recoloring.tokenReferenceRatio.toFixed(2)}）。`
        : `IR 未通过 §3.1 校验：${validation.ok ? "" : validation.errors[0]?.message}`,
    );
    return result;
  }

  step("tokenized");
  const references = verifyVectorReferences(project);
  if (!references.ok) {
    step(
      "invalid",
      "vector-dangling-reference",
      `悬空引用：refId=${references.danglingRefIds.join(",")} childIds=${references.danglingChildIds.join(",")}。`,
    );
    return result;
  }
  const completeness = evaluateVectorCompleteness(project, {
    svgByteSize: new TextEncoder().encode(sanitize.svg).byteLength,
    irByteSize: new TextEncoder().encode(serializeVectorProject(project))
      .byteLength,
    frameColorCount: input.frameColorCount ?? null,
    residualDangerCount: sanitize.residual.length,
  });
  result.completeness = completeness;
  if (!completeness.ok) {
    result.reason = `§8.2 未全部成立，停在 tokenized：${completeness.failed.join(", ")}。`;
    result.code = "vector-incomplete";
    return result;
  }

  step("ready");
  return result;
}

// ---------------------------------------------------------------------------
// §5.1 editing operations
// ---------------------------------------------------------------------------

function clone(project: VectorProject): VectorProject {
  return JSON.parse(JSON.stringify(project)) as VectorProject;
}

function shapeOf(project: VectorProject, shapeId: string): VectorShape {
  const shape = project.shapes.find((candidate) => candidate.id === shapeId);
  if (!shape) {
    throw new VectorCarrierError(
      `形状 ${shapeId} 不存在。`,
      "vector-invalid-ir",
    );
  }
  return shape;
}

/** §5.1 改锚点: add one anchor and write it back into `d`. */
export function insertVectorAnchor(
  project: VectorProject,
  shapeId: string,
  afterAnchorIndex: number,
  point: { x: number; y: number },
): VectorProject {
  const next = clone(project);
  const shape = shapeOf(next, shapeId);
  if (shape.type !== "path" || !shape.d) {
    throw new VectorCarrierError(
      `形状 ${shapeId} 不是可改锚点的 path。`,
      "vector-invalid-ir",
    );
  }
  const commands = absolutePathCommands(parsePathCommands(shape.d));
  const anchors = parsePathAnchors(shape.d);
  const anchor = anchors[afterAnchorIndex];
  if (!anchor) {
    throw new VectorCarrierError(
      `锚点索引 ${afterAnchorIndex} 越界。`,
      "vector-invalid-ir",
    );
  }
  commands.splice(anchor.commandIndex + 1, 0, {
    command: "L",
    args: [point.x, point.y],
  });
  shape.d = serializePathCommands(commands);
  shape.anchorCount = parsePathAnchors(shape.d).length;
  return next;
}

/** §5.1 改锚点: delete one anchor and write the shortened `d` back. */
export function removeVectorAnchor(
  project: VectorProject,
  shapeId: string,
  anchorIndex: number,
): VectorProject {
  const next = clone(project);
  const shape = shapeOf(next, shapeId);
  if (shape.type !== "path" || !shape.d) {
    throw new VectorCarrierError(
      `形状 ${shapeId} 不是可改锚点的 path。`,
      "vector-invalid-ir",
    );
  }
  const commands = absolutePathCommands(parsePathCommands(shape.d));
  const anchors = parsePathAnchors(shape.d);
  const anchor = anchors[anchorIndex];
  if (!anchor) {
    throw new VectorCarrierError(
      `锚点索引 ${anchorIndex} 越界。`,
      "vector-invalid-ir",
    );
  }
  if (anchors.length <= 2) {
    throw new VectorCarrierError(
      "路径至少保留 2 个锚点，否则形状不再可渲染。",
      "vector-flattened-only",
    );
  }
  if (anchor.commandIndex === 0) {
    // Dropping the opening `M` would leave the path without a start point; the
    // following anchor is promoted instead.
    const successor = commands[1];
    if (!successor) {
      throw new VectorCarrierError(
        "路径只有一个子命令，无法删除首锚点。",
        "vector-flattened-only",
      );
    }
    commands.splice(0, 2, {
      command: "M",
      args: [
        successor.args[successor.args.length - 2],
        successor.args[successor.args.length - 1],
      ],
    });
  } else {
    commands.splice(anchor.commandIndex, 1);
  }
  shape.d = serializePathCommands(commands);
  shape.anchorCount = parsePathAnchors(shape.d).length;
  return next;
}

export interface VectorRecolorResult {
  project: VectorProject;
  changedShapeIds: string[];
}

/** §5.1 配色: one token change MUST move every shape referencing it. */
export function recolorVectorToken(
  project: VectorProject,
  token: string,
  value: string,
): VectorRecolorResult {
  const next = clone(project);
  const entry = next.palette.find((candidate) => candidate.token === token);
  if (!entry) {
    throw new VectorCarrierError(
      `palette token ${token} 不存在。`,
      "vector-invalid-ir",
    );
  }
  entry.value = value;
  const changedShapeIds = next.shapes
    .filter(
      (shape) => shape.fillToken === token || shape.strokeToken === token,
    )
    .map((shape) => shape.id);
  return { project: next, changedShapeIds };
}

/** §5.1 换图形: replace one shape without disturbing the others. */
export function replaceVectorShape(
  project: VectorProject,
  shapeId: string,
  replacement: Omit<VectorShape, "id" | "z">,
): VectorProject {
  const next = clone(project);
  const index = next.shapes.findIndex((candidate) => candidate.id === shapeId);
  if (index === -1) {
    throw new VectorCarrierError(
      `形状 ${shapeId} 不存在。`,
      "vector-invalid-ir",
    );
  }
  const previous = next.shapes[index];
  const replaced: VectorShape = {
    ...replacement,
    id: previous.id,
    z: previous.z,
  };
  if (replaced.anchorCount === undefined) {
    const anchors = shapeAnchorCount(replaced);
    if (anchors > 0) replaced.anchorCount = anchors;
  }
  next.shapes[index] = replaced;
  return next;
}

/** Visual identity; changes whenever a render would change. */
export function vectorRenderDigest(project: VectorProject): string {
  const tokens = new Map(
    project.palette.map((entry) => [entry.token, entry.value]),
  );
  const parts = [
    `${project.canvas.viewBoxWidth}x${project.canvas.viewBoxHeight}`,
    project.canvas.kind,
  ];
  for (const shape of [...project.shapes].sort((left, right) => left.z - right.z)) {
    parts.push(
      [
        shape.z,
        shape.type,
        shape.id,
        shape.d ?? "",
        shape.points ?? "",
        shape.x ?? "",
        shape.y ?? "",
        shape.width ?? "",
        shape.height ?? "",
        shape.cx ?? "",
        shape.cy ?? "",
        shape.r ?? "",
        shape.rx ?? "",
        shape.ry ?? "",
        tokens.get(shape.fillToken ?? "") ?? "",
        tokens.get(shape.strokeToken ?? "") ?? "",
        shape.strokeWidth ?? "",
        shape.opacity ?? 1,
        shape.transform ?? "",
        shape.text ?? "",
        shape.refId ?? "",
      ].join("|"),
    );
  }
  return parts.join("\n");
}

/**
 * §5.4 / A8: emit the IR back to SVG. The output always carries `viewBox` and
 * no `width`/`height`, so it scales proportionally, and the attribution travels
 * inside a `<metadata>` element with the artifact.
 */
export function renderVectorProjectToSvg(project: VectorProject): string {
  const tokens = new Map(
    project.palette.map((entry) => [entry.token, entry.value]),
  );
  const paint = (token: string | undefined): string | null => {
    if (!token) return null;
    return tokens.get(token) ?? null;
  };
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const paintAttributes = (shape: VectorShape) => {
    const fill = paint(shape.fillToken);
    const stroke = paint(shape.strokeToken);
    return [
      fill === null ? "" : ` fill="${escape(fill)}"`,
      stroke === null ? "" : ` stroke="${escape(stroke)}"`,
      shape.strokeWidth === undefined
        ? ""
        : ` stroke-width="${shape.strokeWidth}"`,
      shape.strokeLinecap ? ` stroke-linecap="${shape.strokeLinecap}"` : "",
      shape.strokeLinejoin ? ` stroke-linejoin="${shape.strokeLinejoin}"` : "",
      shape.fillRule ? ` fill-rule="${shape.fillRule}"` : "",
      shape.opacity === undefined ? "" : ` opacity="${shape.opacity}"`,
      shape.transform ? ` transform="${escape(shape.transform)}"` : "",
    ].join("");
  };
  const emit = (shape: VectorShape): string => {
    const common = `${paintAttributes(shape)}`;
    switch (shape.type) {
      case "path":
        return `<path d="${escape(shape.d ?? "")}"${common}/>`;
      case "rect":
        return `<rect x="${shape.x ?? 0}" y="${shape.y ?? 0}" width="${shape.width ?? 0}" height="${shape.height ?? 0}"${
          shape.rx === undefined ? "" : ` rx="${shape.rx}"`
        }${shape.ry === undefined ? "" : ` ry="${shape.ry}"`}${common}/>`;
      case "circle":
        return `<circle cx="${shape.cx ?? 0}" cy="${shape.cy ?? 0}" r="${shape.r ?? 0}"${common}/>`;
      case "ellipse":
        return `<ellipse cx="${shape.cx ?? 0}" cy="${shape.cy ?? 0}" rx="${shape.rx ?? 0}" ry="${shape.ry ?? 0}"${common}/>`;
      case "line":
        return `<line x1="${shape.x ?? 0}" y1="${shape.y ?? 0}" x2="${(shape.x ?? 0) + (shape.width ?? 0)}" y2="${(shape.y ?? 0) + (shape.height ?? 0)}"${common}/>`;
      case "polyline":
        return `<polyline points="${escape(shape.points ?? "")}"${common}/>`;
      case "polygon":
        return `<polygon points="${escape(shape.points ?? "")}"${common}/>`;
      case "text":
        return `<text x="${shape.x ?? 0}" y="${shape.y ?? 0}"${common}>${escape(shape.text ?? "")}</text>`;
      case "use":
        return `<use href="#${escape(shape.refId ?? "")}"${common}/>`;
      case "group": {
        const childIds = new Set(shape.childIds ?? []);
        const children = project.shapes
          .filter((candidate) => childIds.has(candidate.id))
          .sort((left, right) => left.z - right.z)
          .map(emit)
          .join("");
        return `<g${common}>${children}</g>`;
      }
      default:
        return "";
    }
  };
  const grouped = new Set(
    project.shapes.flatMap((shape) => shape.childIds ?? []),
  );
  const body = project.shapes
    .filter((shape) => !grouped.has(shape.id))
    .sort((left, right) => left.z - right.z)
    .map(emit)
    .join("");
  const accessible = project.accessibility.decorative
    ? ` aria-hidden="true"`
    : ` role="img" aria-label="${escape(project.accessibility.label)}"`;
  const title = project.accessibility.decorative
    ? ""
    : `<title>${escape(project.accessibility.label)}</title>`;
  const attribution = project.attribution.entries
    .map(
      (entry) =>
        `<oceanleo:credit license="${escape(entry.licenseCode)}" url="${escape(entry.licenseUrl)}"${
          entry.provider ? ` provider="${escape(entry.provider)}"` : ""
        }>${escape(entry.text)}</oceanleo:credit>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:oceanleo="https://oceanleo.com/ns/vector" viewBox="0 0 ${project.canvas.viewBoxWidth} ${project.canvas.viewBoxHeight}"${accessible}>${title}<metadata>${attribution}</metadata>${body}</svg>`;
}

export interface VectorConformance {
  ok: boolean;
  checks: { id: string; ok: boolean; detail: string }[];
}

/** §9 C-2/C-3/C-4/C-7/C-9 in one call. */
export function assertVectorCarrierConformance(input: {
  svg: string;
  project: unknown;
  svgByteSize?: number;
  irByteSize?: number;
  frameColorCount?: number | null;
}): VectorConformance {
  const residual = residualDangerousConstructs(input.svg);
  const validation = validateVectorProject(input.project);
  if (!validation.ok) {
    return {
      ok: false,
      checks: [
        {
          id: "C-2",
          ok: residual.length === 0,
          detail: `residual=${residual.join(",") || "none"}`,
        },
        {
          id: "C-3",
          ok: false,
          detail: validation.errors
            .slice(0, 6)
            .map((error) => `${error.path || "<root>"} ${error.message}`)
            .join("；"),
        },
      ],
    };
  }
  const project = validation.project;
  const capability = vectorCapabilityReport(project);
  const completeness = evaluateVectorCompleteness(project, {
    svgByteSize:
      input.svgByteSize ?? new TextEncoder().encode(input.svg).byteLength,
    irByteSize:
      input.irByteSize ??
      new TextEncoder().encode(serializeVectorProject(project)).byteLength,
    frameColorCount: input.frameColorCount ?? null,
    residualDangerCount: residual.length,
  });
  const license = vectorLicenseManifest(project);
  const checks = [
    {
      id: "C-2",
      ok: residual.length === 0,
      detail: `residual=${residual.join(",") || "none"}`,
    },
    { id: "C-3", ok: true, detail: "§3.1 校验通过" },
    {
      id: "C-4",
      ok: capability.ok,
      detail: `anchors=${capability.anchorEditing.totalAnchors} tokenRatio=${capability.recoloring.tokenReferenceRatio.toFixed(2)} shapes=${capability.shapeSwapping.shapeCount}`,
    },
    {
      id: "C-7",
      ok: completeness.ok,
      detail:
        completeness.failed.length === 0
          ? "§8.1 / §8.2 全部成立"
          : `未达标：${completeness.failed.join(", ")}`,
    },
    {
      id: "C-9",
      ok: license.ok,
      detail: `forbidden=${license.forbidden.join(",") || "none"} standalone=${license.standaloneDownloadAllowed}`,
    },
  ];
  return { ok: checks.every((check) => check.ok), checks };
}
