// ---------------------------------------------------------------------------
// Streaming Markdown: inline formatting in the open tail + CJK-friendly emphasis
// (2026-10-31).
// ---------------------------------------------------------------------------
// Two bugs the operator saw as "`**Sidebar My Tasks order:** why …` shows raw
// `**` for a minute, then turns bold — rendering depends on later content":
//
// 1. `TypewriterMarkdown` keeps the unclosed tail (the paragraph / list still
//    being typed) as plain text until a blank line closes the block. A long
//    paragraph or a list stays raw for its whole life. The tail must not grow
//    structure early (no <table>, <pre>, <li> before its block closes:
//    tests/incremental-markdown), but its INLINE formatting can be rendered at
//    once: `streamingTailSource` neutralises every block marker (the prefix is
//    shown as typed) and closes a dangling `**` / `*` / `` ` `` / `~~` at the
//    very end, so bold shows as soon as the text after the opener arrives.
//
// 2. CommonMark flanking: a closing `**` preceded by punctuation and followed by
//    a letter (`**粗体：**后文`) is not right-flanking, so it never closes, even
//    in the finished message (same for an opener followed by punctuation after a
//    letter: `前文**「引语」**`). `cjkFriendlyEmphasis` puts a zero-width space
//    between the punctuation side and the run; U+200B is neither whitespace nor
//    punctuation to micromark, so the run flanks and pairs. Code is untouched.

const ZWSP = "​";
const PUNCT_RE = /[\p{P}\p{S}]/u;
const SPACE_RE = /\s/u;
const FENCE_LINE_RE = /^ {0,3}(`{3,}|~{3,})/;

const isPunct = (char: string | undefined) => Boolean(char && PUNCT_RE.test(char));
const isSpace = (char: string | undefined) => !char || SPACE_RE.test(char);
/** A letter-like neighbour: present, not whitespace, not punctuation. */
const isWord = (char: string | undefined) => !isSpace(char) && !isPunct(char);

/** Spans of `line` outside inline code (backtick runs pair by equal length). */
function outsideCode(line: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let start = 0;
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") { i += 1; continue; }
    let run = 1;
    while (line[i + run] === "`") run += 1;
    const ticks = "`".repeat(run);
    let close = line.indexOf(ticks, i + run);
    while (close >= 0 && (line[close + run] === "`" || line[close - 1] === "`")) {
      close = line.indexOf(ticks, close + 1);
    }
    if (close < 0) { i += run; continue; }
    spans.push([start, i]);
    i = close + run;
    start = i;
  }
  spans.push([start, line.length]);
  return spans;
}

function fixLineEmphasis(line: string): string {
  // Asterisk runs of length 1–3 outside code, skipping list bullets and runs with
  // whitespace on both sides (`2 * 3`). Runs of equal length pair in order.
  const runs: { at: number; len: number }[] = [];
  for (const [from, to] of outsideCode(line)) {
    let i = from;
    while (i < to) {
      if (line[i] !== "*" || line[i - 1] === "\\") { i += 1; continue; }
      let len = 1;
      while (i + len < to && line[i + len] === "*") len += 1;
      const before = line[i - 1];
      const after = line[i + len];
      const bullet = !line.slice(0, i).trim() && isSpace(after);
      if (len <= 3 && !bullet && !(isSpace(before) && isSpace(after))) runs.push({ at: i, len });
      i += len;
    }
  }
  const inserts: number[] = [];
  for (const len of [1, 2, 3]) {
    const same = runs.filter((run) => run.len === len);
    for (let k = 0; k + 1 < same.length; k += 2) {
      const open = same[k];
      const close = same[k + 1];
      const openAfter = line[open.at + len];
      if (isPunct(openAfter) && isWord(line[open.at - 1])) inserts.push(open.at + len);
      const closeBefore = line[close.at - 1];
      if (isPunct(closeBefore) && isWord(line[close.at + len])) inserts.push(close.at);
    }
  }
  if (!inserts.length) return line;
  inserts.sort((a, b) => b - a);
  let out = line;
  for (const at of inserts) out = out.slice(0, at) + ZWSP + out.slice(at);
  return out;
}

/** Make `**粗体：**后文`-style emphasis pair; fenced code is left as is. */
export function cjkFriendlyEmphasis(source: string): string {
  if (!source || !source.includes("*")) return source;
  let fence = "";
  return source
    .split("\n")
    .map((line) => {
      const marker = line.match(FENCE_LINE_RE)?.[1];
      if (fence) {
        if (marker && marker[0] === fence[0] && marker.length >= fence.length && !line.slice(line.indexOf(marker) + marker.length).trim()) fence = "";
        return line;
      }
      if (marker) { fence = marker; return line; }
      return fixLineEmphasis(line);
    })
    .join("\n");
}

const DELIMITER_ROW_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$|^\s*\|\s*:?-+:?\s*\|?\s*$/;
// Heading, quote, list bullet / number, or a line of only `-*_=` (thematic break,
// setext underline). `**bold**` at a line start is NOT a block marker.
const BLOCK_START_RE = /^(?:#{1,6}(?=\s|$)|>|[-+*](?=\s|$)|\d{1,9}[.)](?=\s|$)|[-*_=](?:[ \t]*[-*_=])*[ \t]*$)/;

/** Close what the stream left open at the very end of the tail. */
function closeDangling(text: string): string {
  let out = text;
  // An unclosed inline code span: close it (its content is literal).
  const spans = outsideCode(out);
  const last = spans[spans.length - 1];
  const rest = out.slice(last[0], last[1]);
  const tick = rest.indexOf("`");
  if (tick >= 0) {
    const run = rest.slice(tick).match(/^`+/)![0];
    return rest.slice(tick + run.length).trim() ? `${out}${run}` : out.slice(0, last[0] + tick).replace(/\s+$/, "");
  }
  // Only the line being typed: emphasis left open on an earlier line is the
  // model's own (it stays as it will in the finished message).
  const from = Math.max(last[0], out.lastIndexOf("\n") + 1);
  for (const marker of ["~~", "**", "*"]) {
    const re = marker === "*" ? /(?<![*\\])\*(?!\*)/g : marker === "**" ? /(?<![*\\])\*\*(?!\*)/g : /~~/g;
    const hits = [...out.slice(from).matchAll(re)].map((m) => from + (m.index ?? 0));
    // Whitespace on both sides (a `* ` bullet, `2 * 3`) is not emphasis; the end
    // of the text is not whitespace yet (the next token decides).
    const real = hits.filter((at) => {
      const next = at + marker.length;
      return !(isSpace(out[at - 1]) && next < out.length && isSpace(out[next]));
    });
    if (real.length % 2 === 0) continue;
    const opener = real[real.length - 1];
    const inner = out.slice(opener + marker.length);
    // Nothing (or only a space) typed after the opener yet: hide it for now.
    if (!inner.trim() || /^\s/.test(inner)) {
      if (!inner.trim()) out = out.slice(0, opener).replace(/[ \t]+$/, "");
      continue;
    }
    out = `${out.replace(/\s+$/, "")}${marker}`;
  }
  return out;
}

/**
 * The open tail of a streaming reply → Markdown that renders INLINE formatting
 * only: every block marker is escaped (shown as typed), indentation becomes
 * no-break spaces, a table delimiter row cannot form a table, and dangling
 * markers at the end are closed (or hidden while nothing follows them).
 * `null`: keep the tail plain text — it is code (a fence or an indented block),
 * or has no inline marker at all (the common frame: no parse, same output).
 */
export function streamingTailSource(tail: string): string | null {
  if (!/[*_`~[\]\\<&!]/.test(tail)) return null;
  const first = tail.split("\n").find((line) => line.trim()) ?? "";
  if (FENCE_LINE_RE.test(first) || /^(?: {4}|\t)/.test(first)) return null;
  const lines = closeDangling(tail).split("\n").map((line) => {
    if (!line.trim()) return "";
    const indent = line.match(/^[ \t]*/)![0];
    let body = line.slice(indent.length);
    if (DELIMITER_ROW_RE.test(body)) body = body.replace(/[-:]/g, (c) => `\\${c}`);
    else if (BLOCK_START_RE.test(body)) {
      body = /^\d/.test(body) ? body.replace(/^(\d{1,9})([.)])/, "$1\\$2") : `\\${body}`;
    }
    return indent.replace(/\t/g, "    ").replace(/ /g, " ") + body;
  });
  return lines.join("\n");
}
