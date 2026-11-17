/** Deterministic revision fingerprint for timeline consumers; not a cryptographic digest. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deterministicDigest(value: unknown): string {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (const byte of bytes) {
    left ^= byte;
    left = Math.imul(left, 0x01000193) >>> 0;
    right ^= byte + 0x9d;
    right = Math.imul(right, 0x85ebca6b) >>> 0;
  }
  return `${left.toString(16).padStart(8, "0")}${right
    .toString(16)
    .padStart(8, "0")}`;
}
