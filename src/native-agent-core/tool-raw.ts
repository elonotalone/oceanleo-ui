/** Platform-independent raw tool payload helpers. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export const TOOL_PAYLOAD_LIMIT = 64 * 1024;

/** Canonical fields take precedence, including null, false, and redaction markers. */
export function toolRawValue(value: unknown, side: "input" | "output"): unknown {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const keys = side === "input" ? ["rawInput", "raw_input", "input"] : ["rawOutput", "raw_output", "output"];
  for (const key of keys) if (row[key] !== undefined) return row[key];
  return undefined;
}

/** A redacted envelope must never reveal its accompanying original value. */
export function toolPayloadText(value: unknown): string {
  try {
    const scrub = (_key: string, child: unknown) => {
      if (child && typeof child === "object") {
        const row = child as Record<string, unknown>;
        if (row.redacted === true || row._redacted === true) return "[REDACTED]";
      }
      return child;
    };
    const text = typeof value === "string" ? value : JSON.stringify(value, scrub, 2) ?? "";
    return text.length > TOOL_PAYLOAD_LIMIT ? text.slice(0, TOOL_PAYLOAD_LIMIT - 12) + "\n[TRUNCATED]" : text;
  } catch { return "[UNAVAILABLE]"; }
}

// Updates are patches. Missing raw fields retain the original; object patches merge
// recursively, while explicit scalars/arrays and privacy markers replace it.
export function mergeToolRaw(previous: unknown, next: unknown, depth = 0): unknown {
  if (next === undefined) return previous;
  const row = asRecord(next);
  if (!row || row.redacted === true || row._redacted === true || depth >= 12) return next;
  const before = asRecord(previous);
  if (!before || before.redacted === true || before._redacted === true) return next;
  const merged: Record<string, unknown> = { ...before };
  for (const [key, value] of Object.entries(row)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    merged[key] = mergeToolRaw(before[key], value, depth + 1);
  }
  return merged;
}
