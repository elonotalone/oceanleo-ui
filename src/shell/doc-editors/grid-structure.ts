export interface GridRange {
  firstRow: number;
  lastRow: number;
  firstCol: number;
  lastCol: number;
}

export interface GridMerge extends GridRange {}

export type GridConditionalOperator =
  | "greater-than"
  | "less-than"
  | "equal"
  | "not-equal"
  | "contains";

export interface GridConditionalFormat {
  id: string;
  range: GridRange;
  operator: GridConditionalOperator;
  value: string;
  color?: string;
  background?: string;
  bold?: boolean;
}

const COLOR = /^#[0-9a-f]{6}$/i;

function finiteInteger(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  const numeric = Number(value);
  return Math.max(
    0,
    Math.min(maximum, Number.isFinite(numeric) ? Math.floor(numeric) : fallback),
  );
}

function normalizeRange(
  value: unknown,
  maxRows: number,
  maxCols: number,
): GridRange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const firstRow = finiteInteger(source.firstRow, 0, maxRows - 1);
  const lastRow = finiteInteger(source.lastRow, firstRow, maxRows - 1);
  const firstCol = finiteInteger(source.firstCol, 0, maxCols - 1);
  const lastCol = finiteInteger(source.lastCol, firstCol, maxCols - 1);
  return {
    firstRow: Math.min(firstRow, lastRow),
    lastRow: Math.max(firstRow, lastRow),
    firstCol: Math.min(firstCol, lastCol),
    lastCol: Math.max(firstCol, lastCol),
  };
}

export function rangesIntersect(left: GridRange, right: GridRange): boolean {
  return !(
    left.lastRow < right.firstRow ||
    left.firstRow > right.lastRow ||
    left.lastCol < right.firstCol ||
    left.firstCol > right.lastCol
  );
}

export function rangeContainsCell(
  range: GridRange,
  row: number,
  col: number,
): boolean {
  return (
    row >= range.firstRow &&
    row <= range.lastRow &&
    col >= range.firstCol &&
    col <= range.lastCol
  );
}

export function normalizeGridMerges(
  value: unknown,
  maxRows: number,
  maxCols: number,
): GridMerge[] {
  const result: GridMerge[] = [];
  for (const entry of Array.isArray(value) ? value.slice(0, 1_000) : []) {
    const range = normalizeRange(entry, maxRows, maxCols);
    if (
      !range ||
      (range.firstRow === range.lastRow && range.firstCol === range.lastCol) ||
      result.some((current) => rangesIntersect(current, range))
    ) {
      continue;
    }
    result.push(range);
  }
  return result;
}

export function normalizeGridConditionalFormats(
  value: unknown,
  maxRows: number,
  maxCols: number,
): GridConditionalFormat[] {
  const used = new Set<string>();
  return (Array.isArray(value) ? value.slice(0, 500) : []).flatMap(
    (entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const source = entry as Record<string, unknown>;
      const range = normalizeRange(source.range || source, maxRows, maxCols);
      const operator = String(source.operator) as GridConditionalOperator;
      if (
        !range ||
        !["greater-than", "less-than", "equal", "not-equal", "contains"].includes(
          operator,
        )
      ) {
        return [];
      }
      let id = String(source.id || `conditional-${index + 1}`)
        .replace(/[^a-z0-9_.:-]/gi, "-")
        .slice(0, 80);
      if (!id || used.has(id)) id = `conditional-${index + 1}`;
      used.add(id);
      const color = String(source.color || "");
      const background = String(source.background || "");
      return [
        {
          id,
          range,
          operator,
          value: String(source.value ?? "").slice(0, 240),
          ...(COLOR.test(color) ? { color } : {}),
          ...(COLOR.test(background) ? { background } : {}),
          ...(source.bold === true ? { bold: true } : {}),
        },
      ];
    },
  );
}

export function gridMergeAt(
  merges: readonly GridMerge[],
  row: number,
  col: number,
): GridMerge | undefined {
  return merges.find((merge) => rangeContainsCell(merge, row, col));
}

export function mergeGridRange(
  merges: readonly GridMerge[],
  range: GridRange,
): GridMerge[] {
  if (range.firstRow === range.lastRow && range.firstCol === range.lastCol) {
    return [...merges];
  }
  const partiallyOverlapping = merges.some(
    (merge) =>
      rangesIntersect(merge, range) &&
      !(
        merge.firstRow >= range.firstRow &&
        merge.lastRow <= range.lastRow &&
        merge.firstCol >= range.firstCol &&
        merge.lastCol <= range.lastCol
      ),
  );
  if (partiallyOverlapping) {
    throw new Error("不能跨越已有合并区域再次合并");
  }
  return [
    ...merges.filter((merge) => !rangesIntersect(merge, range)),
    { ...range },
  ];
}

export function splitGridRange(
  merges: readonly GridMerge[],
  range: GridRange,
): GridMerge[] {
  return merges.filter((merge) => !rangesIntersect(merge, range));
}

export function transformGridRanges<T extends GridRange>(
  values: readonly T[],
  axis: "row" | "col",
  index: number,
  amount: number,
): T[] {
  const first = axis === "row" ? "firstRow" : "firstCol";
  const last = axis === "row" ? "lastRow" : "lastCol";
  return values.flatMap((value) => {
    const next = { ...value };
    if (amount > 0) {
      if (next[first] >= index) {
        next[first] += amount;
        next[last] += amount;
      } else if (next[last] >= index) {
        next[last] += amount;
      }
    } else {
      const count = -amount;
      const deletionEnd = index + count - 1;
      if (next[first] > deletionEnd) {
        next[first] -= count;
        next[last] -= count;
      } else if (next[last] >= index) {
        next[first] = Math.min(next[first], index);
        next[last] =
          next[last] > deletionEnd ? next[last] - count : index - 1;
      }
    }
    return next[last] < next[first] ? [] : [next as T];
  });
}

function numeric(value: string | number): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value.replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(parsed)
    ? value.trim().endsWith("%")
      ? parsed / 100
      : parsed
    : null;
}

export function conditionalRuleMatches(
  cellValue: string | number,
  rule: GridConditionalFormat,
): boolean {
  if (rule.operator === "contains") {
    return String(cellValue)
      .toLocaleLowerCase()
      .includes(rule.value.toLocaleLowerCase());
  }
  if (rule.operator === "equal" || rule.operator === "not-equal") {
    const leftNumber = numeric(cellValue);
    const rightNumber = numeric(rule.value);
    const equal =
      leftNumber !== null && rightNumber !== null
        ? leftNumber === rightNumber
        : String(cellValue) === rule.value;
    return rule.operator === "equal" ? equal : !equal;
  }
  const left = numeric(cellValue);
  const right = numeric(rule.value);
  if (left === null || right === null) return false;
  return rule.operator === "greater-than" ? left > right : left < right;
}

export function conditionalGridStyle(
  rules: readonly GridConditionalFormat[],
  row: number,
  col: number,
  value: string | number,
): Pick<GridConditionalFormat, "color" | "background" | "bold"> {
  return rules.reduce<Pick<GridConditionalFormat, "color" | "background" | "bold">>(
    (style, rule) =>
      rangeContainsCell(rule.range, row, col) &&
      conditionalRuleMatches(value, rule)
        ? {
            ...style,
            ...(rule.color ? { color: rule.color } : {}),
            ...(rule.background ? { background: rule.background } : {}),
            ...(rule.bold ? { bold: true } : {}),
          }
        : style,
    {},
  );
}
