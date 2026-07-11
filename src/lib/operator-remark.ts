export const OPERATOR_REMARK_MAX_LENGTH = 4000;
const ACTIVE_REMARK_KEY = "__oceanleo_active_operator_remark_v1";

type RemarkGlobal = typeof globalThis & {
  [ACTIVE_REMARK_KEY]?: string;
};

export function setActiveOperatorRemark(remark: string): void {
  if (typeof window === "undefined") return;
  (globalThis as RemarkGlobal)[ACTIVE_REMARK_KEY] = (remark || "").slice(
    0,
    OPERATOR_REMARK_MAX_LENGTH,
  );
}

export function getActiveOperatorRemark(): string {
  if (typeof window === "undefined") return "";
  return (globalThis as RemarkGlobal)[ACTIVE_REMARK_KEY] || "";
}

/** Add the optional operator note only at the final AI prompt boundary. */
export function appendOperatorRemark(
  prompt: string,
  remark = getActiveOperatorRemark(),
): string {
  const base = (prompt || "").trim();
  const extra = (remark || "").trim();
  if (!extra) return base;
  const block = `补充备注：\n${extra}`;
  if (base.endsWith(block)) return base;
  return [base, block].filter(Boolean).join("\n\n");
}

/**
 * Thin-client transport adapter used by every OceanLeo site. It only touches
 * explicit AI prompt fields: top-level `prompt`, or the final user message.
 * Uploads, search queries, IDs, conversion text, and all other payload data
 * remain byte-for-byte unchanged.
 */
export function withOperatorRemarkRequest<T>(input: T): T {
  const remark = getActiveOperatorRemark();
  if (
    !remark.trim() ||
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    return input;
  }
  const source = input as Record<string, unknown>;
  let changed = false;
  const next: Record<string, unknown> = { ...source };
  if (typeof source.prompt === "string") {
    next.prompt = appendOperatorRemark(source.prompt, remark);
    changed = next.prompt !== source.prompt;
  }
  if (Array.isArray(source.messages)) {
    const messages = [...source.messages];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item = messages[index];
      if (
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        (item as Record<string, unknown>).role === "user" &&
        typeof (item as Record<string, unknown>).content === "string"
      ) {
        const message = item as Record<string, unknown>;
        const content = appendOperatorRemark(
          message.content as string,
          remark,
        );
        if (content !== message.content) {
          messages[index] = { ...message, content };
          next.messages = messages;
          changed = true;
        }
        break;
      }
    }
  }
  return (changed ? next : input) as T;
}
