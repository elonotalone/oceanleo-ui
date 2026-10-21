import type { PluginAgentContext } from "./types";

/** Bound real source data without ever emitting a cut-off JSON document. */
export function boundedAgentContent(
  source: unknown,
  note?: string,
): PluginAgentContext {
  let remaining = 5_500;
  let truncated = false;
  const ancestors = new Set<object>();
  function visit(value: unknown, depth: number): unknown {
    if (remaining < 8 || depth > 10) {
      truncated = true;
      return undefined;
    }
    if (value === null || typeof value === "boolean" || typeof value === "number") {
      const encoded = JSON.stringify(value);
      remaining -= encoded.length;
      return value;
    }
    if (typeof value === "string") {
      // Includes escaped quotes/newlines in the budget, not just raw characters.
      let text = value.slice(0, Math.min(1_200, remaining - 2));
      while (text && JSON.stringify(text).length > remaining) text = text.slice(0, Math.floor(text.length * 0.8));
      truncated ||= text.length < value.length;
      remaining -= JSON.stringify(text).length;
      return text;
    }
    if (typeof value !== "object") {
      truncated = true;
      return undefined;
    }
    if (ancestors.has(value)) {
      truncated = true;
      return undefined;
    }
    ancestors.add(value);
    remaining -= 2;
    let result: unknown;
    if (Array.isArray(value)) {
      const entries: unknown[] = [];
      for (const entry of value.slice(0, 80)) {
        remaining -= 1;
        const next = visit(entry, depth + 1);
        if (next !== undefined) entries.push(next);
        if (remaining < 8) break;
      }
      truncated ||= entries.length < value.length;
      result = entries;
    } else {
      const entries: Record<string, unknown> = Object.create(null);
      for (const [key, entry] of Object.entries(value)) {
        if (/^(?:authorization|access_?token|refresh_?token|api_?key|password|secret)$/i.test(key)) {
          truncated = true;
          continue;
        }
        const cost = JSON.stringify(key).length + 2;
        if (remaining - cost < 8) {
          truncated = true;
          break;
        }
        remaining -= cost;
        const next = visit(entry, depth + 1);
        if (next !== undefined) entries[key] = next;
      }
      result = entries;
    }
    ancestors.delete(value);
    return result;
  }
  const content = visit(source, 0);
  if (content === undefined) return { ready: false, reason: "当前编辑内容无法读取。" };
  return {
    ready: true,
    kind: "structured",
    content,
    truncated,
    note: [note, truncated ? "这是当前内容的有界节选；省略部分不代表不存在，不要猜测未提供的内容。" : ""]
      .filter(Boolean).join(" "),
  };
}
