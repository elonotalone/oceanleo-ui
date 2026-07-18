export interface GridSheetIdentity {
  id: string;
}

export interface NormalizedGridSheetIdentities {
  ids: string[];
  activeSheetId: string;
}

const GRID_SHEET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const RESERVED_GRID_SHEET_IDS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export function isValidGridSheetId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    GRID_SHEET_ID_PATTERN.test(value) &&
    !RESERVED_GRID_SHEET_IDS.has(value)
  );
}

function repairedGridSheetId(
  index: number,
  reserved: ReadonlySet<string>,
  used: ReadonlySet<string>,
): string {
  const base = `sheet-${index + 1}`;
  let candidate = base;
  let serial = 2;
  while (reserved.has(candidate) || used.has(candidate)) {
    candidate = `${base}-${serial}`;
    serial += 1;
  }
  return candidate;
}

/**
 * Keep the first occurrence of every safe persisted ID. Missing, unsafe, and
 * repeated IDs receive stable index-based replacements. Raw IDs are reserved
 * up front so a repaired ID can never displace a later valid persisted ID.
 */
export function normalizeGridSheetIdentities(
  rawIds: readonly unknown[],
  requestedActiveSheetId: unknown = "",
): NormalizedGridSheetIdentities {
  const reserved = new Set(rawIds.filter(isValidGridSheetId));
  const used = new Set<string>();
  const firstIdAlias = new Map<string, string>();
  const ids = rawIds.map((rawId, index) => {
    const id =
      isValidGridSheetId(rawId) && !used.has(rawId)
        ? rawId
        : repairedGridSheetId(index, reserved, used);
    used.add(id);
    if (typeof rawId === "string" && !firstIdAlias.has(rawId)) {
      firstIdAlias.set(rawId, id);
    }
    return id;
  });
  const requested =
    typeof requestedActiveSheetId === "string" ? requestedActiveSheetId : "";
  const mappedActive = firstIdAlias.get(requested) || requested;
  return {
    ids,
    activeSheetId: ids.includes(mappedActive) ? mappedActive : ids[0] || "",
  };
}

export function resolveGridActiveSheetId(
  sheets: readonly GridSheetIdentity[],
  requestedActiveSheetId: unknown,
  fallbackActiveSheetId: unknown = "",
): string {
  const available = new Set(sheets.map((sheet) => sheet.id));
  const requested =
    typeof requestedActiveSheetId === "string" ? requestedActiveSheetId : "";
  if (available.has(requested)) return requested;
  const fallback =
    typeof fallbackActiveSheetId === "string" ? fallbackActiveSheetId : "";
  if (available.has(fallback)) return fallback;
  return sheets[0]?.id || "";
}
