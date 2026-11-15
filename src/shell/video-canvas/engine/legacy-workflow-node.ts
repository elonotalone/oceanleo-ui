export type LegacyPortDirection = "input" | "output";

export interface LegacyWorkflowPort {
  id: string;
  direction: LegacyPortDirection;
  handleType: "target" | "source";
  position: "left" | "right";
  ariaLabel: string;
  top: string;
}

export type LegacyParameterEditRule =
  | { input: "number"; min: number; max: number; step: number }
  | { input: "text"; maxLength: number };

export interface LegacyParameterView {
  key: string;
  value: unknown;
  displayValue: string;
  editRule?: LegacyParameterEditRule;
}

export interface LegacyParameterUpdate {
  ok: boolean;
  source?: Record<string, unknown>;
  reason?: string;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isLegacyWorkflowSource(
  value: unknown,
): value is Record<string, unknown> {
  return objectRecord(value) !== null;
}

export function legacySourceKind(source: Record<string, unknown>): string {
  return typeof source.kind === "string" && source.kind.trim()
    ? source.kind
    : "unknown";
}

function readPortList(
  value: unknown,
  direction: LegacyPortDirection,
): LegacyWorkflowPort[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index, entries) => {
    const port = objectRecord(candidate);
    if (!port || typeof port.name !== "string" || !port.name.trim()) return [];
    const name = port.name;
    return [{
      id: name,
      direction,
      handleType: direction === "input" ? "target" : "source",
      position: direction === "input" ? "left" : "right",
      ariaLabel: `${direction === "input" ? "Input" : "Output"} ${name}`,
      top: `${((index + 1) / (entries.length + 1)) * 100}%`,
    }];
  });
}

export function legacyWorkflowPorts(
  source: Record<string, unknown>,
): LegacyWorkflowPort[] {
  const ports = objectRecord(source.ports);
  return [
    ...readPortList(ports?.inputs, "input"),
    ...readPortList(ports?.outputs, "output"),
  ];
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return "Unserializable source value";
  }
}

function numericRule(
  kind: string,
  key: string,
): LegacyParameterEditRule | undefined {
  const ranges: Record<string, Record<string, [number, number, number]>> = {
    trim: {
      startMs: [0, 3_600_000, 100],
      endMs: [0, 3_600_000, 100],
    },
    text: {
      fontSize: [8, 256, 1],
      startMs: [0, 3_600_000, 100],
      endMs: [0, 3_600_000, 100],
    },
    overlay: { opacity: [0, 1, 0.01] },
    "audio-mix": {
      gain: [0, 4, 0.05],
      fadeInMs: [0, 3_600_000, 100],
      fadeOutMs: [0, 3_600_000, 100],
      durationMs: [100, 3_600_000, 100],
    },
    output: {
      width: [16, 7_680, 16],
      height: [16, 4_320, 16],
      fps: [1, 120, 1],
      durationMs: [100, 3_600_000, 100],
    },
  };
  const range = ranges[kind]?.[key];
  return range
    ? { input: "number", min: range[0], max: range[1], step: range[2] }
    : undefined;
}

export function legacyParameterEditRule(
  source: Record<string, unknown>,
  key: string,
  value: unknown,
): LegacyParameterEditRule | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return numericRule(legacySourceKind(source), key);
  }
  if (
    legacySourceKind(source) === "text" &&
    key === "text" &&
    typeof value === "string"
  ) {
    return { input: "text", maxLength: 20_000 };
  }
  return undefined;
}

export function legacyParameterViews(
  source: Record<string, unknown>,
): LegacyParameterView[] {
  const params = objectRecord(source.params);
  if (!params) return [];
  return Object.entries(params).map(([key, value]) => ({
    key,
    value,
    displayValue: displayValue(value),
    editRule: legacyParameterEditRule(source, key, value),
  }));
}

export function updateLegacyParameter(
  source: Record<string, unknown>,
  path: string,
  value: unknown,
): LegacyParameterUpdate {
  const match = /^params\.([A-Za-z][A-Za-z0-9_]*)$/.exec(path);
  if (!match) {
    return { ok: false, reason: "Only supported top-level legacy params can be edited." };
  }
  const key = match[1];
  const params = objectRecord(source.params);
  const currentValue = params?.[key];
  const rule = legacyParameterEditRule(source, key, currentValue);
  if (!params || !Object.hasOwn(params, key) || !rule) {
    return { ok: false, reason: `${key} is preserved as read-only source data.` };
  }
  if (rule.input === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < rule.min ||
      value > rule.max
    ) {
      return {
        ok: false,
        reason: `${key} must be a finite number from ${rule.min} to ${rule.max}.`,
      };
    }
    const sibling = key === "startMs" ? "endMs" : key === "endMs" ? "startMs" : "";
    const siblingValue = sibling ? params[sibling] : undefined;
    if (
      sibling &&
      typeof siblingValue === "number" &&
      ((key === "startMs" && value > siblingValue) ||
        (key === "endMs" && value < siblingValue))
    ) {
      return { ok: false, reason: `${key} must remain within the existing ${sibling} boundary.` };
    }
  } else if (typeof value !== "string" || value.length > rule.maxLength) {
    return {
      ok: false,
      reason: `${key} must be text no longer than ${rule.maxLength} characters.`,
    };
  }
  return {
    ok: true,
    source: { ...source, params: { ...params, [key]: value } },
  };
}

export function updateLegacyTitle(
  source: Record<string, unknown>,
  title: string,
): Record<string, unknown> {
  const key =
    typeof source.label === "string"
      ? "label"
      : typeof source.title === "string"
        ? "title"
        : "label";
  return { ...source, [key]: title };
}

export function updateLegacyPosition(
  source: Record<string, unknown>,
  axis: "x" | "y",
  value: number,
): Record<string, unknown> {
  return { ...source, [axis]: value };
}

export function legacyExecutionBlockReason(
  source: unknown,
  command: {
    commandId: string;
    scope: string;
    execution: string;
    billing: string;
  },
): string | undefined {
  if (!isLegacyWorkflowSource(source)) return undefined;
  if (
    command.scope === "run" ||
    command.execution === "server" ||
    command.billing !== "none" ||
    command.commandId.startsWith("canvas.node.generate.") ||
    command.commandId.startsWith("canvas.node.update.ai.")
  ) {
    return `Legacy ${legacySourceKind(source)} nodes preserve their original source data but cannot run v2 provider, generation, or Run commands. Edit a supported parameter or the node title/position instead.`;
  }
  return undefined;
}
