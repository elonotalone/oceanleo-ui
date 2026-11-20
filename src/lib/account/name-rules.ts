// One account name per person (wave 2026-11-20 roles, contract §1.1).
// These rules are the client pre-check only; the gateway and the database decide.
// They must stay identical to `backend/app/account_names.py` and the 0610 SQL
// functions: same character sets, same order, same test vectors.

/** Whitespace runs collapse to one ASCII space (inside a name and inside the key). */
const WHITESPACE = "\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
/** Control characters: refused in a name, treated as whitespace in the key. */
const CONTROL = "\\u0000-\\u001f\\u007f-\\u009f";
/** Zero-width / format characters: refused in a name, removed from the key. */
const FORMAT = "\\u00ad\\u034f\\u061c\\u180e\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u206f\\ufeff";

const WHITESPACE_RUN = new RegExp(`[${WHITESPACE}]+`, "g");
const KEY_SPACE_RUN = new RegExp(`[${WHITESPACE}${CONTROL}]+`, "g");
const FORMAT_ANY = new RegExp(`[${FORMAT}]`, "g");
const FORBIDDEN = new RegExp(`[${CONTROL}${FORMAT}]`);

export const NAME_MIN_CHARS = 2;
export const NAME_MAX_CHARS = 30;

/** Reserved names, compared by key. */
export const RESERVED_NAME_KEYS: ReadonlySet<string> = new Set([
  "admin", "administrator", "official", "oceanleo", "leo", "support", "help", "system",
  "moderator", "root", "api", "null", "undefined", "官方", "管理员", "客服", "系统",
]);
const RESERVED_FRAGMENTS = ["oceanleo", "官方"];

export type NameRuleCode = "name_invalid" | "name_reserved";

/** The name as stored: whitespace runs become one space, ends trimmed. */
export function cleanName(raw: string): string {
  // Trim spaces only (not String#trim, which also drops U+FEFF): identical to SQL btrim(…, ' ').
  return String(raw ?? "").replace(WHITESPACE_RUN, " ").replace(/^ +| +$/g, "");
}

/** Uniqueness key: NFKC → lower case → format characters removed → whitespace collapsed. */
export function nameKey(raw: string): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(FORMAT_ANY, "")
    .replace(KEY_SPACE_RUN, " ")
    .trim();
}

/** `null` when the name may be used (availability is still the gateway's answer). */
export function checkName(raw: string): NameRuleCode | null {
  const name = cleanName(raw);
  const length = Array.from(name).length;
  if (length < NAME_MIN_CHARS || length > NAME_MAX_CHARS || FORBIDDEN.test(name)) return "name_invalid";
  const key = nameKey(name);
  if (!key) return "name_invalid";
  const compact = key.replace(/ /g, "");
  if (RESERVED_NAME_KEYS.has(key) || RESERVED_FRAGMENTS.some((part) => compact.includes(part))) {
    return "name_reserved";
  }
  return null;
}
