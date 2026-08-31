/**
 * Excel-compatible number format strings.
 *
 * Zero dependency on purpose (W13 red line 6): the grid already carries
 * `exceljs` and `xlsx`, but neither exposes a renderer, and pulling a
 * formatter library would add a runtime dependency to all 31 tenant sites.
 *
 * The load-bearing invariant of this module is that **formatting is a
 * projection, never a mutation**. Every entry point takes a raw cell value and
 * returns text; nothing here writes back. Sorting, filtering and the formula
 * engine all read the raw value, so a format that changed storage would make
 * `12` sort after `100` the moment either was displayed as `¥12.00`.
 */

/** `[Red]` and friends. Values follow the Excel indexed colour table. */
const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: "#000000",
  blue: "#0000ff",
  cyan: "#00ffff",
  green: "#008000",
  magenta: "#ff00ff",
  red: "#ff0000",
  white: "#ffffff",
  yellow: "#ffff00",
};

const INDEXED_COLORS: readonly string[] = [
  "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00",
  "#ff00ff", "#00ffff", "#800000", "#008000", "#000080", "#808000",
  "#800080", "#008080", "#c0c0c0", "#808080",
];

export type NumberFormatComparison = "<" | "<=" | ">" | ">=" | "=" | "<>";

export interface NumberFormatCondition {
  operator: NumberFormatComparison;
  value: number;
}

export type NumberFormatSectionKind = "number" | "date" | "text";

type DateUnit =
  | "year"
  | "month"
  | "day"
  | "weekday"
  | "hour"
  | "minute"
  | "second"
  | "month-or-minute";

type SectionToken =
  | { kind: "digit"; char: "0" | "#" | "?" }
  | { kind: "point" }
  | { kind: "comma" }
  | { kind: "percent" }
  | { kind: "at" }
  | { kind: "literal"; text: string }
  | { kind: "date"; unit: DateUnit; width: number }
  | { kind: "elapsed"; unit: "hour" | "minute" | "second"; width: number }
  | { kind: "ampm"; short: boolean }
  | { kind: "fraction-seconds"; width: number };

export interface NumberFormatSection {
  readonly kind: NumberFormatSectionKind;
  readonly color?: string;
  readonly condition?: NumberFormatCondition;
  readonly tokens: readonly SectionToken[];
}

export interface NumberFormatSpec {
  readonly source: string;
  readonly sections: readonly NumberFormatSection[];
  /** True when at least one section carries an explicit `[>0]`-style test. */
  readonly conditional: boolean;
}

export interface NumberFormatResult {
  readonly text: string;
  readonly color?: string;
  /** Which section produced the text; `"raw"` means no section applied. */
  readonly section: NumberFormatSectionKind | "raw";
}

/** `#DIV/0!`, `#CYCLE!`, `#N/A` … — error text is a value, not a number. */
const GRID_ERROR_VALUE = /^#(?:[A-Z][A-Z0-9/]*[!?]|N\/A)$/;

/** `General` and the empty pattern both mean "show the value as stored". */
export function isGeneralNumberFormat(pattern: string): boolean {
  const trimmed = pattern.trim();
  return trimmed === "" || trimmed.toLowerCase() === "general";
}

/* ----------------------------- tokenisation ----------------------------- */

const DATE_TOKENS: readonly {
  match: RegExp;
  unit: DateUnit;
}[] = [
  { match: /^y{3,4}/i, unit: "year" },
  { match: /^y{1,2}/i, unit: "year" },
  { match: /^m{1,5}/i, unit: "month-or-minute" },
  { match: /^d{1,4}/i, unit: "day" },
  { match: /^h{1,2}/i, unit: "hour" },
  { match: /^s{1,2}/i, unit: "second" },
  { match: /^a{3,4}/i, unit: "weekday" },
];

function readBracket(source: string, start: number): { body: string; next: number } | null {
  const close = source.indexOf("]", start);
  if (close < 0) return null;
  return { body: source.slice(start + 1, close), next: close + 1 };
}

function parseColor(body: string): string | undefined {
  const key = body.trim().toLowerCase();
  if (key in NAMED_COLORS) return NAMED_COLORS[key];
  const indexed = /^color\s*(\d{1,2})$/.exec(key);
  if (!indexed) return undefined;
  const index = Number(indexed[1]) - 1;
  return INDEXED_COLORS[index] ?? undefined;
}

function parseCondition(body: string): NumberFormatCondition | undefined {
  const match = /^(<=|>=|<>|<|>|=)\s*(-?\d+(?:\.\d+)?)$/.exec(body.trim());
  if (!match) return undefined;
  return {
    operator: match[1] as NumberFormatComparison,
    value: Number(match[2]),
  };
}

function tokenizeSection(source: string): {
  tokens: SectionToken[];
  color?: string;
  condition?: NumberFormatCondition;
} {
  const tokens: SectionToken[] = [];
  let color: string | undefined;
  let condition: NumberFormatCondition | undefined;
  let index = 0;
  const pushLiteral = (text: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.kind === "literal") {
      tokens[tokens.length - 1] = { kind: "literal", text: last.text + text };
      return;
    }
    tokens.push({ kind: "literal", text });
  };

  while (index < source.length) {
    const char = source[index];

    if (char === "[") {
      const bracket = readBracket(source, index);
      if (!bracket) {
        pushLiteral(char);
        index += 1;
        continue;
      }
      const elapsed = /^(h+|m+|s+)$/i.exec(bracket.body.trim());
      const named = parseColor(bracket.body);
      const test = parseCondition(bracket.body);
      if (elapsed) {
        const unit = elapsed[1][0].toLowerCase();
        tokens.push({
          kind: "elapsed",
          unit: unit === "h" ? "hour" : unit === "m" ? "minute" : "second",
          width: elapsed[1].length,
        });
      } else if (named) {
        color = named;
      } else if (test) {
        condition = test;
      }
      // Locale hints such as `[$-804]` are dropped rather than rendered.
      index = bracket.next;
      continue;
    }

    if (char === "\\") {
      if (index + 1 < source.length) pushLiteral(source[index + 1]);
      index += 2;
      continue;
    }

    if (char === '"') {
      const close = source.indexOf('"', index + 1);
      if (close < 0) {
        pushLiteral(source.slice(index + 1));
        break;
      }
      pushLiteral(source.slice(index + 1, close));
      index = close + 1;
      continue;
    }

    // `_x` reserves the width of `x`; we approximate with one space, which is
    // what accounting patterns need in order to line up against `(1.00)`.
    if (char === "_") {
      pushLiteral(" ");
      index += 2;
      continue;
    }

    // `*x` repeats `x` across the remaining column width. A projection has no
    // column width, so the repeat degrades to nothing rather than guessing.
    if (char === "*") {
      index += 2;
      continue;
    }

    if (char === "0" || char === "#" || char === "?") {
      tokens.push({ kind: "digit", char });
      index += 1;
      continue;
    }

    if (char === ".") {
      const fractional = /^\.(0+)/.exec(source.slice(index));
      const previous = tokens[tokens.length - 1];
      if (fractional && previous && previous.kind === "date" && previous.unit === "second") {
        tokens.push({ kind: "fraction-seconds", width: fractional[1].length });
        index += fractional[0].length;
        continue;
      }
      tokens.push({ kind: "point" });
      index += 1;
      continue;
    }

    if (char === ",") {
      tokens.push({ kind: "comma" });
      index += 1;
      continue;
    }

    if (char === "%") {
      tokens.push({ kind: "percent" });
      index += 1;
      continue;
    }

    if (char === "@") {
      tokens.push({ kind: "at" });
      index += 1;
      continue;
    }

    const rest = source.slice(index);
    const ampm = /^(AM\/PM|A\/P)/i.exec(rest);
    if (ampm) {
      tokens.push({ kind: "ampm", short: ampm[1].length === 3 });
      index += ampm[1].length;
      continue;
    }

    const date = DATE_TOKENS.find((entry) => entry.match.test(rest));
    if (date) {
      const matched = date.match.exec(rest) as RegExpExecArray;
      tokens.push({ kind: "date", unit: date.unit, width: matched[0].length });
      index += matched[0].length;
      continue;
    }

    pushLiteral(char);
    index += 1;
  }

  return { tokens, color, condition };
}

/**
 * Excel's month/minute rule for `m` and `mm`: a run of `m` means minutes when
 * it directly follows an hour token or directly precedes a seconds token, and
 * months everywhere else. Literals between the two do not break the pairing,
 * which is why `hh:mm` and `mm:ss` both mean minutes while `yyyy-mm` does not.
 */
function resolveMonthOrMinute(tokens: SectionToken[]): SectionToken[] {
  const significant = (token: SectionToken): boolean =>
    token.kind === "date" || token.kind === "elapsed" || token.kind === "ampm";
  return tokens.map((token, position) => {
    if (token.kind !== "date" || token.unit !== "month-or-minute") return token;
    let previous: SectionToken | undefined;
    for (let index = position - 1; index >= 0; index -= 1) {
      if (significant(tokens[index])) {
        previous = tokens[index];
        break;
      }
    }
    let next: SectionToken | undefined;
    for (let index = position + 1; index < tokens.length; index += 1) {
      if (significant(tokens[index])) {
        next = tokens[index];
        break;
      }
    }
    const afterHour =
      (previous?.kind === "date" && previous.unit === "hour") ||
      (previous?.kind === "elapsed" && previous.unit === "hour");
    const beforeSecond =
      (next?.kind === "date" && next.unit === "second") ||
      (next?.kind === "elapsed" && next.unit === "second");
    return {
      ...token,
      unit: afterHour || beforeSecond ? "minute" : "month",
    } as SectionToken;
  });
}

function sectionKind(tokens: readonly SectionToken[]): NumberFormatSectionKind {
  let sawDate = false;
  let sawNumeric = false;
  let sawText = false;
  for (const token of tokens) {
    if (token.kind === "date" || token.kind === "elapsed" || token.kind === "ampm") {
      sawDate = true;
    } else if (token.kind === "digit" || token.kind === "point" || token.kind === "percent") {
      sawNumeric = true;
    } else if (token.kind === "at") {
      sawText = true;
    }
  }
  if (sawDate) return "date";
  if (sawNumeric) return "number";
  if (sawText) return "text";
  return "number";
}

function splitSections(pattern: string): string[] {
  const sections: string[] = [];
  let current = "";
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === "\\") {
      current += pattern.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (char === '"') {
      const close = pattern.indexOf('"', index + 1);
      const end = close < 0 ? pattern.length : close + 1;
      current += pattern.slice(index, end);
      index = end;
      continue;
    }
    if (char === "[") {
      const close = pattern.indexOf("]", index);
      const end = close < 0 ? pattern.length : close + 1;
      current += pattern.slice(index, end);
      index = end;
      continue;
    }
    if (char === ";") {
      sections.push(current);
      current = "";
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  sections.push(current);
  return sections;
}

const SPEC_CACHE = new Map<string, NumberFormatSpec>();

/** Parse an Excel format string into at most four sections. */
export function parseNumberFormat(pattern: string): NumberFormatSpec {
  const cached = SPEC_CACHE.get(pattern);
  if (cached) return cached;
  const sections = splitSections(pattern)
    .slice(0, 4)
    .map((source) => {
      const parsed = tokenizeSection(source);
      const tokens = resolveMonthOrMinute(parsed.tokens);
      return {
        kind: sectionKind(tokens),
        ...(parsed.color ? { color: parsed.color } : {}),
        ...(parsed.condition ? { condition: parsed.condition } : {}),
        tokens,
      } satisfies NumberFormatSection;
    });
  const spec: NumberFormatSpec = {
    source: pattern,
    sections,
    conditional: sections.some((section) => section.condition !== undefined),
  };
  // Bounded so a pathological document cannot grow the cache without limit.
  if (SPEC_CACHE.size < 512) SPEC_CACHE.set(pattern, spec);
  return spec;
}

/* ------------------------------ date maths ------------------------------ */

const MS_PER_DAY = 86_400_000;

/**
 * Excel's serial epoch. Day 60 is the 1900 leap-year bug Lotus shipped and
 * Excel kept; serials at or above 61 are one day ahead of the true calendar,
 * so the two branches below are the compatibility, not an off-by-one.
 */
export function excelSerialToDate(serial: number): Date {
  const whole = Math.floor(serial);
  const fraction = serial - whole;
  const base = whole >= 61 ? Date.UTC(1899, 11, 30) : Date.UTC(1899, 11, 31);
  return new Date(base + whole * MS_PER_DAY + Math.round(fraction * MS_PER_DAY));
}

const ISO_LIKE =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;

/**
 * Deterministic date parsing. `new Date(string)` is locale and timezone
 * dependent, which would make the same workbook render differently on the
 * server and in the browser, so only explicit shapes are accepted.
 */
export function parseGridDateValue(value: string | number): Date | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? excelSerialToDate(value) : null;
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const iso = ISO_LIKE.exec(trimmed);
  if (iso) {
    const [, year, month, day, hour, minute, second] = iso;
    const date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour ?? 0),
        Number(minute ?? 0),
        Number(second ?? 0),
      ),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const serial = Number(trimmed);
  if (Number.isFinite(serial) && trimmed !== "") return excelSerialToDate(serial);
  return null;
}

const WEEKDAY_SHORT = ["日", "一", "二", "三", "四", "五", "六"];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LONG_EN = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

function pad(value: number, width: number): string {
  return String(Math.abs(value)).padStart(width, "0");
}

function renderDateSection(
  section: NumberFormatSection,
  value: string | number,
): string | null {
  const date = parseGridDateValue(value);
  if (!date) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  const elapsedBase = Number.isFinite(numeric)
    ? numeric
    : (date.getTime() - Date.UTC(1899, 11, 30)) / MS_PER_DAY;
  const twelveHour = section.tokens.some((token) => token.kind === "ampm");
  const hours24 = date.getUTCHours();
  const hours = twelveHour ? hours24 % 12 || 12 : hours24;
  let out = "";
  for (const token of section.tokens) {
    if (token.kind === "literal") {
      out += token.text;
      continue;
    }
    if (token.kind === "ampm") {
      const morning = hours24 < 12;
      out += token.short ? (morning ? "A" : "P") : morning ? "AM" : "PM";
      continue;
    }
    if (token.kind === "fraction-seconds") {
      const millis = date.getUTCMilliseconds();
      out += `.${String(millis).padStart(3, "0").slice(0, token.width)}`;
      continue;
    }
    if (token.kind === "elapsed") {
      const totalHours = elapsedBase * 24;
      const amount =
        token.unit === "hour"
          ? Math.floor(totalHours)
          : token.unit === "minute"
            ? Math.floor(totalHours * 60)
            : Math.floor(totalHours * 3600);
      out += pad(amount, token.width);
      continue;
    }
    if (token.kind !== "date") continue;
    switch (token.unit) {
      case "year":
        out += token.width <= 2
          ? pad(date.getUTCFullYear() % 100, 2)
          : pad(date.getUTCFullYear(), 4);
        break;
      case "month": {
        const month = date.getUTCMonth();
        out +=
          token.width >= 5
            ? MONTH_SHORT[month][0]
            : token.width === 4
              ? MONTH_LONG[month]
              : token.width === 3
                ? MONTH_SHORT[month]
                : pad(month + 1, token.width);
        break;
      }
      case "day": {
        const weekday = date.getUTCDay();
        out +=
          token.width === 4
            ? WEEKDAY_LONG_EN[weekday]
            : token.width === 3
              ? WEEKDAY_LONG_EN[weekday].slice(0, 3)
              : pad(date.getUTCDate(), token.width);
        break;
      }
      case "weekday":
        // `aaa` / `aaaa` are the Chinese weekday tokens; they are the reason a
        // localised grid can print 星期三 without a locale library.
        out +=
          token.width >= 4
            ? `星期${WEEKDAY_SHORT[date.getUTCDay()]}`
            : WEEKDAY_SHORT[date.getUTCDay()];
        break;
      case "hour":
        out += pad(hours, token.width);
        break;
      case "minute":
        out += pad(date.getUTCMinutes(), token.width);
        break;
      case "second":
        out += pad(date.getUTCSeconds(), token.width);
        break;
      default:
        break;
    }
  }
  return out;
}

/* ----------------------------- number render ---------------------------- */

/** The only tokens the digit ledgers below ever hold; `char` is theirs alone. */
type DigitToken = Extract<SectionToken, { kind: "digit" }>;

interface NumericLayout {
  integerDigits: DigitToken[];
  fractionDigits: DigitToken[];
  grouped: boolean;
  scale: number;
  percent: number;
}

/**
 * A comma means two different things and the position decides which.
 *
 * Between digit placeholders it is the thousands separator (`#,##0`). After the
 * last placeholder it divides by a thousand per comma (`#,##0,` shows millions
 * as thousands, `0.0,,` shows them as units) — and Excel counts those trailing
 * commas whether or not a decimal point came first, which is why the scan below
 * anchors on the last digit token rather than on the point.
 */
function measure(section: NumberFormatSection): NumericLayout {
  const tokens = section.tokens;
  const integerDigits: DigitToken[] = [];
  const fractionDigits: DigitToken[] = [];
  const digitPositions: number[] = [];
  let pointPosition = -1;
  let percent = 0;

  tokens.forEach((token, position) => {
    if (token.kind === "point") {
      if (pointPosition < 0) pointPosition = position;
      return;
    }
    if (token.kind === "percent") {
      percent += 1;
      return;
    }
    if (token.kind !== "digit") return;
    digitPositions.push(position);
    if (pointPosition >= 0) fractionDigits.push(token);
    else integerDigits.push(token);
  });

  const integerPositions = digitPositions.filter(
    (position) => pointPosition < 0 || position < pointPosition,
  );
  const grouped =
    integerPositions.length >= 2 &&
    tokens.some(
      (token, position) =>
        token.kind === "comma" &&
        position > integerPositions[0] &&
        position < integerPositions[integerPositions.length - 1],
    );

  let scale = 0;
  for (
    let position = (digitPositions[digitPositions.length - 1] ?? -1) + 1;
    position < tokens.length;
    position += 1
  ) {
    if (tokens[position].kind !== "comma") break;
    scale += 1;
  }

  return { integerDigits, fractionDigits, grouped, scale, percent };
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function renderNumberSection(
  section: NumberFormatSection,
  value: number,
): string {
  const layout = measure(section);
  let scaled = value;
  for (let index = 0; index < layout.percent; index += 1) scaled *= 100;
  for (let index = 0; index < layout.scale; index += 1) scaled /= 1000;

  const fractionWidth = layout.fractionDigits.length;
  const fixed = scaled.toFixed(Math.min(20, fractionWidth));
  const negative = fixed.startsWith("-");
  const [rawInteger, rawFraction = ""] = fixed.replace(/^-/, "").split(".");

  const integerZeros = layout.integerDigits.filter((token) => token.char === "0").length;
  const integerBlanks = layout.integerDigits.filter((token) => token.char === "?").length;
  let integerOut = rawInteger;
  if (integerOut === "0" && integerZeros === 0) integerOut = "";
  integerOut = integerOut.padStart(integerZeros, "0");
  if (layout.grouped && integerOut !== "") integerOut = groupThousands(integerOut);
  integerOut = integerOut.padStart(integerBlanks, " ");

  let fractionOut = "";
  for (let index = 0; index < fractionWidth; index += 1) {
    const token = layout.fractionDigits[index];
    const digit = rawFraction[index] ?? "0";
    fractionOut += digit;
    if (token.char === "0") continue;
    // `#` drops a trailing zero, `?` blanks it while keeping the column width.
    const remainderIsZero = /^0*$/.test(rawFraction.slice(index));
    if (remainderIsZero) {
      fractionOut = fractionOut.slice(0, -1) + (token.char === "?" ? " " : "");
    }
  }

  let out = "";
  let integerEmitted = false;
  let fractionEmitted = false;
  let seenPoint = false;
  for (const token of section.tokens) {
    switch (token.kind) {
      case "literal":
        out += token.text;
        break;
      case "percent":
        out += "%";
        break;
      case "point":
        seenPoint = true;
        // A `#` fraction that rounded away takes the decimal point with it.
        if (fractionOut.trim() !== "" || layout.fractionDigits.some((d) => d.char === "0")) {
          out += ".";
        }
        break;
      case "comma":
        break;
      case "digit":
        if (seenPoint) {
          if (!fractionEmitted) {
            out += fractionOut;
            fractionEmitted = true;
          }
        } else if (!integerEmitted) {
          out += integerOut;
          integerEmitted = true;
        }
        break;
      default:
        break;
    }
  }
  if (!integerEmitted && layout.integerDigits.length === 0 && integerOut !== "") {
    out = integerOut + out;
  }
  return negative && !/^\s*[-(]/.test(out) ? `-${out}` : out;
}

function renderTextSection(
  section: NumberFormatSection,
  value: string | number,
): string {
  let out = "";
  for (const token of section.tokens) {
    if (token.kind === "literal") out += token.text;
    else if (token.kind === "at") out += String(value);
  }
  return out;
}

function conditionHolds(condition: NumberFormatCondition, value: number): boolean {
  switch (condition.operator) {
    case "<":
      return value < condition.value;
    case "<=":
      return value <= condition.value;
    case ">":
      return value > condition.value;
    case ">=":
      return value >= condition.value;
    case "=":
      return value === condition.value;
    case "<>":
      return value !== condition.value;
    default:
      return false;
  }
}

function numericValue(value: string | number): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const percent = trimmed.endsWith("%");
  const parsed = Number(
    (percent ? trimmed.slice(0, -1) : trimmed).replace(/,/g, ""),
  );
  if (!Number.isFinite(parsed)) return null;
  return percent ? parsed / 100 : parsed;
}

/**
 * Section selection, four-section semantics.
 *
 * One section  → every number, text falls through to General.
 * Two sections → `>= 0` and `< 0`.
 * Three        → positive, negative, zero.
 * Four         → positive, negative, zero, text.
 *
 * The negative section receives the **absolute** value, which is what lets
 * `#,##0.00;[Red](#,##0.00)` print `(1,234.00)` in red without a stray sign.
 */
function selectSection(
  spec: NumberFormatSpec,
  value: string | number,
): { section: NumberFormatSection; magnitude: number | null } | null {
  const sections = spec.sections;
  if (sections.length === 0) return null;
  const numeric = numericValue(value);

  if (numeric === null) {
    // A four-section pattern reserves the last slot for text, so it wins.
    if (sections.length >= 4) return { section: sections[3], magnitude: null };
    // Otherwise an ISO-like string under a date pattern is still a date: it is
    // orderable and renderable even though it is not a number.
    const dateSection = sections.find((section) => section.kind === "date");
    if (dateSection && parseGridDateValue(value) !== null) {
      return { section: dateSection, magnitude: 0 };
    }
    const only = sections.find((section) => section.kind === "text");
    return only ? { section: only, magnitude: null } : null;
  }

  if (spec.conditional) {
    for (const section of sections) {
      if (section.condition && conditionHolds(section.condition, numeric)) {
        return { section, magnitude: Math.abs(numeric) };
      }
    }
    const fallback = sections.filter((section) => !section.condition).pop();
    return fallback ? { section: fallback, magnitude: numeric } : null;
  }

  if (sections.length === 1) return { section: sections[0], magnitude: numeric };
  if (sections.length === 2) {
    return numeric < 0
      ? { section: sections[1], magnitude: Math.abs(numeric) }
      : { section: sections[0], magnitude: numeric };
  }
  if (numeric > 0) return { section: sections[0], magnitude: numeric };
  if (numeric < 0) return { section: sections[1], magnitude: Math.abs(numeric) };
  return { section: sections[2], magnitude: 0 };
}

/**
 * Render one raw cell value through one format string.
 *
 * Never mutates and never consults anything but its two arguments, so the same
 * value formats identically in the canvas, in the export and in a test.
 */
export function formatWithNumberFormat(
  value: string | number,
  pattern: string,
): NumberFormatResult {
  if (isGeneralNumberFormat(pattern)) {
    return { text: String(value), section: "raw" };
  }
  // Formula errors are values in their own right and must survive untouched.
  if (typeof value === "string" && GRID_ERROR_VALUE.test(value)) {
    return { text: value, section: "raw" };
  }
  const spec = parseNumberFormat(pattern);
  const chosen = selectSection(spec, value);
  if (!chosen) return { text: String(value), section: "raw" };
  const { section, magnitude } = chosen;
  const color = section.color;

  if (section.kind === "text" || magnitude === null) {
    const text = section.kind === "text"
      ? renderTextSection(section, value)
      : String(value);
    return { text, section: "text", ...(color ? { color } : {}) };
  }
  if (section.kind === "date") {
    const rendered = renderDateSection(section, value);
    if (rendered === null) return { text: String(value), section: "raw" };
    return { text: rendered, section: "date", ...(color ? { color } : {}) };
  }
  return {
    text: renderNumberSection(section, magnitude),
    section: "number",
    ...(color ? { color } : {}),
  };
}

/* ------------------------------- presets -------------------------------- */

export interface NumberFormatPreset {
  readonly id: string;
  readonly label: string;
  readonly pattern: string;
  readonly sample: string;
}

/** Offered in the toolbar; each one is also a regression fixture. */
export const NUMBER_FORMAT_PRESETS: readonly NumberFormatPreset[] = [
  { id: "general", label: "常规", pattern: "General", sample: "1234.5" },
  { id: "integer", label: "整数", pattern: "#,##0", sample: "1,235" },
  { id: "decimal2", label: "两位小数", pattern: "#,##0.00", sample: "1,234.50" },
  {
    id: "accounting",
    label: "会计（负数括号）",
    pattern: "#,##0.00_);[Red](#,##0.00)",
    sample: "(1,234.50)",
  },
  { id: "currency-cny", label: "人民币", pattern: "¥#,##0.00", sample: "¥1,234.50" },
  { id: "currency-usd", label: "美元", pattern: "$#,##0.00", sample: "$1,234.50" },
  { id: "percent", label: "百分比", pattern: "0.00%", sample: "12.35%" },
  { id: "thousands", label: "以千为单位", pattern: "#,##0,\"千\"", sample: "1千" },
  { id: "date-iso", label: "日期 yyyy-mm-dd", pattern: "yyyy-mm-dd", sample: "2026-08-31" },
  { id: "date-cn", label: "日期（中文星期）", pattern: "yyyy年m月d日 aaaa", sample: "2026年8月31日 星期一" },
  { id: "time", label: "时间 hh:mm:ss", pattern: "hh:mm:ss", sample: "13:05:09" },
  { id: "datetime", label: "日期时间", pattern: "yyyy-mm-dd hh:mm", sample: "2026-08-31 13:05" },
  { id: "text", label: "文本", pattern: "@", sample: "0031" },
];

/**
 * Bridge for the six legacy `GridCellFormat.type` values so one renderer backs
 * both the old enum and custom patterns. Kept byte-identical to the shapes the
 * export path already emitted, so switching a cell to the engine cannot move
 * an existing workbook's `numFmt`.
 */
export function legacyNumberFormatPattern(
  type: string | undefined,
  decimals: number | undefined,
): string {
  const places = Math.max(0, Math.min(8, decimals ?? 2));
  const tail = places ? `.${"0".repeat(places)}` : "";
  switch (type) {
    case "currency":
      return `¥#,##0${tail}`;
    case "percent":
      return `0${tail}%`;
    case "date":
      return "yyyy-mm-dd";
    case "number":
      return `0${tail}`;
    case "text":
      return "@";
    default:
      return "General";
  }
}

/**
 * Escape a pattern for `<numFmt formatCode="…"/>`. Non-ASCII is emitted as a
 * numeric character reference to match the codes already in the styles table.
 */
export function numberFormatToXlsxCode(pattern: string): string {
  return pattern.replace(/[&<>"'\u0080-\uffff]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    if (char === "'") return "&apos;";
    return `&#${char.charCodeAt(0)};`;
  });
}

/** Inverse of `numberFormatToXlsxCode`, for reading a workbook back in. */
export function numberFormatFromXlsxCode(code: string): string {
  return code
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCharCode(Number(digits)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * The comparator sorting must use. It reads the **raw** value; a caller that
 * sorted display text would order `¥1,234.00` before `¥9.00`.
 */
export function compareRawGridValues(left: string, right: string): number {
  const leftNumber = numericValue(left);
  const rightNumber = numericValue(right);
  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
  }
  if (leftNumber !== null) return -1;
  if (rightNumber !== null) return 1;
  return left.localeCompare(right, "zh-Hans-CN");
}

export const __numberFormatInternals = { numericValue, measure, splitSections };
