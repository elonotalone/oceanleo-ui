import type { NativeAgentMessage as AgentMessage, NativeTranscriptSession } from "../../native-agent-core/index";
import { applyDialog, initialDialogState } from "../cloud-computer/legacy-dialog/reduce";
import type { AgentDialogMessage, TurnItem } from "../../native-agent-core/index";
import { dialogToAgentMessages, type MapTranslate } from "./map-dialog";
import { orderNativeFrames } from "./order";

// ── Saved transcript + live conversation: merge, never switch (2026-11-02 F2) ──
//
// The cloud-saved transcript (every page read) and the live socket's messages
// are two windows on one conversation. After a gateway swap the new gateway
// adopts a running turn without replaying history, so the live side alone is
// not the whole conversation. The view is their union: prompts are aligned
// (text, and send time when both sides know it), the same prompt's replies are
// merged item by item (tool / permission / question ids, text containment), and
// whatever only one side has is kept. A live replay the gateway vouches for
// (`history` frame `replay:true`) takes over only once it covers what is saved.

type UserRow = Extract<AgentDialogMessage, { kind: "user" }>;
type TurnRow = Extract<AgentDialogMessage, { kind: "turn" }>;
type Segment = { user: UserRow; rest: AgentDialogMessage[] };
type Split = { head: AgentDialogMessage[]; segs: Segment[] };

/** Same prompt when both sides carry a send time this close (the echo vs the gateway's stamp). */
const USER_TIME_SLACK_MS = 10_000;
/** Shorter text items only dedupe on exact equality (a short "OK" inside a long reply is not the same row). */
const MIN_CONTAINED_TEXT = 16;

export type NativeMergeSource = "live" | "saved" | "merged";
export type NativeMergeResult = { messages: AgentDialogMessage[]; source: NativeMergeSource };

function conversational(messages: readonly AgentDialogMessage[]): boolean {
  return messages.some((message) => message.kind === "user" || message.kind === "turn");
}

function userKey(text: string): string {
  return text.replace(/\n*附件：[^\n]*/g, "").replace(/\s+/g, " ").trim();
}

function sameUser(a: UserRow, b: UserRow, aKey: string, bKey: string): boolean {
  // Gateway message ids / frame sequences survive archive reads and socket replay.
  if (a.id.startsWith("frame:") && b.id.startsWith("frame:")) return a.id === b.id;
  if (aKey !== bKey) return false;
  if (!aKey && JSON.stringify(a.attachments?.map((item) => [item.archive?.id, item.path, item.name]) ?? []) !==
      JSON.stringify(b.attachments?.map((item) => [item.archive?.id, item.path, item.name]) ?? [])) return false;
  if (typeof a.at === "number" && typeof b.at === "number") return Math.abs(a.at - b.at) <= USER_TIME_SLACK_MS;
  return true;
}

function split(messages: readonly AgentDialogMessage[]): Split {
  const head: AgentDialogMessage[] = [];
  const segs: Segment[] = [];
  for (const message of messages) {
    if (message.kind === "user") segs.push({ user: message, rest: [] });
    else if (segs.length) segs[segs.length - 1].rest.push(message);
    else head.push(message);
  }
  return { head, segs };
}

/** Best offset `d` (saved prompt index = live prompt index + d) whose whole overlap agrees. */
function align(saved: readonly UserRow[], live: readonly UserRow[]): { offset: number; overlap: number } | null {
  const savedKeys = saved.map((row) => userKey(row.text));
  const liveKeys = live.map((row) => userKey(row.text));
  let best: { offset: number; overlap: number } | null = null;
  for (let offset = -(live.length - 1); offset <= saved.length - 1; offset += 1) {
    const from = Math.max(0, -offset);
    const to = Math.min(live.length, saved.length - offset);
    if (to - from < 1) continue;
    let agrees = true;
    for (let index = from; index < to; index += 1) {
      if (!sameUser(saved[index + offset], live[index], savedKeys[index + offset], liveKeys[index])) { agrees = false; break; }
    }
    // Ties go to the later offset: the live side is the newer window.
    if (agrees && (!best || to - from >= best.overlap)) best = { offset, overlap: to - from };
  }
  return best;
}

function textOf(item: TurnItem): string | null {
  return item.kind === "assistant" || item.kind === "thought" ? item.text : null;
}

/** Where `item` already is in `items`, and whether the incoming copy should replace it. */
function findSame(items: readonly TurnItem[], item: TurnItem): { index: number; replace: boolean } {
  const miss = { index: -1, replace: false };
  switch (item.kind) {
    case "tool": {
      const index = items.findIndex((row) => row.kind === "tool" && row.tool.id === item.tool.id);
      return index >= 0 ? { index, replace: true } : miss;
    }
    case "permission": {
      const index = items.findIndex((row) => row.kind === "permission" && row.permId === item.permId);
      return index >= 0 ? { index, replace: true } : miss;
    }
    case "question": {
      const index = items.findIndex((row) => row.kind === "question" && row.questionId === item.questionId);
      return index >= 0 ? { index, replace: true } : miss;
    }
    case "plan":
    case "usage": {
      const index = items.findLastIndex((row) => row.kind === item.kind);
      return index >= 0 ? { index, replace: true } : miss;
    }
    case "assistant":
    case "thought": {
      const text = item.text;
      const contained = items.findIndex((row) => {
        const own = row.kind === item.kind ? textOf(row) : null;
        return own !== null && (own === text || (text.length >= MIN_CONTAINED_TEXT && own.includes(text)));
      });
      if (contained >= 0) return { index: contained, replace: false };
      // The same text still growing (saved mid-turn, live has more): the longer copy wins.
      const grown = items.findLastIndex((row) => {
        const own = row.kind === item.kind ? textOf(row) : null;
        return own !== null && own.length > 0 && text.startsWith(own);
      });
      return grown >= 0 ? { index: grown, replace: true } : miss;
    }
    default:
      return miss;
  }
}

function mergeItems(base: readonly TurnItem[], incoming: readonly TurnItem[]): { items: TurnItem[]; shared: number; fresh: TurnItem[] } {
  const items = base.slice();
  const fresh: TurnItem[] = [];
  let shared = 0;
  for (const item of incoming) {
    // An empty text row carries nothing to show or to match on.
    if (textOf(item) === "") continue;
    const found = findSame(items, item);
    if (found.index >= 0) {
      shared += 1;
      if (found.replace) items[found.index] = { ...item, id: items[found.index].id } as TurnItem;
      continue;
    }
    items.push(item);
    fresh.push(item);
  }
  return { items, shared, fresh };
}

function sameNotice(a: AgentDialogMessage, b: AgentDialogMessage): boolean {
  return a.kind === "notice" && b.kind === "notice" && a.code === b.code && (a.text ?? "") === (b.text ?? "");
}

/**
 * The live rows that follow a saved prompt's replies: the same turn continued
 * (merged item by item, live state wins) or a turn the saved copy does not have.
 */
function mergeRest(saved: readonly AgentDialogMessage[], live: readonly AgentDialogMessage[]): AgentDialogMessage[] {
  if (!live.length) return saved.slice();
  if (!saved.length) return live.slice();
  const out = saved.slice();
  let matchedAt = 0;
  for (const row of live) {
    if (row.kind !== "turn") {
      if (row.kind === "notice" && out.some((kept) => sameNotice(kept, row))) continue;
      out.push(row);
      continue;
    }
    // Replayed autonomous turns can share one prompt. Match the corresponding
    // turn instead of repeatedly comparing only with the last saved reply.
    let at = out.findLastIndex((kept) => kept.kind === "turn");
    let score = 0;
    for (let index = matchedAt; index < out.length; index += 1) {
      const candidate = out[index];
      if (candidate.kind !== "turn") continue;
      const shared = mergeItems(candidate.items, row.items).shared;
      if (shared > score) { score = shared; at = index; }
    }
    if (at < 0) { out.push(row); continue; }
    matchedAt = at;
    const base = out[at] as TurnRow;
    const merged = mergeItems(base.items, row.items);
    // A finished saved turn and live output it has none of: a new (autonomous) turn.
    const finished = Boolean(base.stop) && base.stop !== "stopping";
    if (finished && merged.shared === 0 && row.items.length > 0) { out.push(row); continue; }
    const turn: TurnRow = {
      ...base,
      items: merged.items,
      acpSession: row.acpSession || base.acpSession,
      // A live turn's own state wins; a replayed (not live) copy never reopens a finished one.
      stop: row.live === true ? row.stop : (row.stop || base.stop),
      live: row.live === true ? true : base.live,
      ...(row.orphans?.length ? { orphans: row.orphans } : {}),
    };
    out[at] = turn;
  }
  return out;
}

/** Saved rows are history: a turn that was open when it was saved is not live on this page. */
function settle(messages: readonly AgentDialogMessage[]): AgentDialogMessage[] {
  return messages.map((message) => (message.kind === "turn" && message.live ? { ...message, live: false } : message));
}

/** Two windows on one conversation as one list (see the block comment above). */
function union(savedRows: readonly AgentDialogMessage[], liveRows: readonly AgentDialogMessage[]): AgentDialogMessage[] {
  const saved = split(savedRows);
  const live = split(liveRows);
  // Adoption often starts with an autonomous turn and no user_message at all.
  // Its leading output still belongs after the saved conversation.
  if (!live.segs.length) return mergeRest(savedRows, live.head);
  const best = align(saved.segs.map((seg) => seg.user), live.segs.map((seg) => seg.user));
  // No common prompt: the live side follows what was saved (its leading rows continue the last turn).
  const offset = best ? best.offset : saved.segs.length;
  const chunks: AgentDialogMessage[][] = [];
  if (offset > 0) chunks.push(saved.head.slice());
  else if (offset < 0) chunks.push(live.head.slice());
  else chunks.push(mergeRest(saved.head, live.head));
  const first = Math.min(0, offset);
  const last = Math.max(saved.segs.length, live.segs.length + offset);
  for (let global = first; global < last; global += 1) {
    const liveIndex = global - offset;
    const s = global >= 0 && global < saved.segs.length ? saved.segs[global] : null;
    const l = liveIndex >= 0 && liveIndex < live.segs.length ? live.segs[liveIndex] : null;
    if (l && liveIndex === 0 && offset > 0 && live.head.length) {
      chunks[chunks.length - 1] = mergeRest(chunks[chunks.length - 1], live.head);
    }
    if (s && l) {
      // The saved prompt keeps its archive attachment rows when the live echo has none.
      const user = { ...l.user, id: s.user.id, ...(s.user.attachments?.length && !l.user.attachments?.length ? { attachments: s.user.attachments } : {}) };
      chunks.push([user, ...mergeRest(s.rest, l.rest)]);
    } else if (l) chunks.push([l.user, ...l.rest]);
    else if (s) chunks.push([s.user, ...s.rest]);
  }
  return chunks.flat();
}

/**
 * Saved transcript + live messages for one native conversation.
 * `replay`: the gateway's `history` frame for this session (true = the live
 * transcript is a full replay; false / null = assume none).
 */
export function mergeSavedAndLive(
  savedRows: readonly AgentDialogMessage[],
  liveRows: readonly AgentDialogMessage[],
  options: { replay?: boolean | null } = {},
): NativeMergeResult {
  const saved = settle(savedRows);
  if (!conversational(liveRows)) {
    // Nothing live yet (opening, reconnecting): the saved copy, with live notices under it.
    const notices = liveRows.filter((message) => message.kind === "notice" && !saved.some((kept) => sameNotice(kept, message)));
    return { messages: [...saved, ...notices], source: conversational(saved) ? "saved" : "live" };
  }
  if (!conversational(saved)) return { messages: liveRows.slice(), source: "live" };
  if (options.replay === true) {
    const savedUsers = split(saved).segs.map((seg) => seg.user);
    const liveUsers = split(liveRows).segs.map((seg) => seg.user);
    const best = align(savedUsers, liveUsers);
    // The replay covers the saved history: it starts no later and reaches at least as far
    // (every saved prompt is inside the agreeing overlap).
    const savedParts = split(saved);
    const liveParts = split(liveRows);
    const coversRows = (older: readonly AgentDialogMessage[], newer: readonly AgentDialogMessage[]) => older.every((row) =>
      row.kind !== "turn" || row.items.every((item) => newer.some((candidate) => {
        if (candidate.kind !== "turn") return false;
        const text = textOf(item);
        // A shorter replay is not coverage just because it is a prefix of the
        // saved reply. Taking it over would hide the saved reply's ending.
        if (text !== null) return candidate.items.some((liveItem) => liveItem.kind === item.kind &&
          (textOf(liveItem) ?? "").includes(text));
        return findSame(candidate.items, item).index >= 0;
      })));
    if (best && best.offset <= 0 && liveUsers.length + best.offset >= savedUsers.length &&
        coversRows(savedParts.head, liveParts.head) && savedParts.segs.every((part, index) =>
          coversRows(part.rest, liveParts.segs[index - best.offset]?.rest ?? []))) {
      return { messages: liveRows.slice(), source: "live" };
    }
  }
  return { messages: union(saved, liveRows), source: "merged" };
}

/** A re-read newest saved page joined onto the pages already read (no row twice, none lost). */
export function mergeTranscriptPages(
  pages: readonly AgentDialogMessage[],
  newer: readonly AgentDialogMessage[],
): AgentDialogMessage[] {
  if (!conversational(newer)) return settle(pages);
  if (!conversational(pages)) return settle(newer);
  return union(settle(pages), settle(newer));
}

export type NativeThreadSource = {
  session: Pick<NativeTranscriptSession, "id" | "program" | "created_at">;
  messages: AgentMessage[];
};

export function mapNativeTranscript(
  session: Pick<NativeTranscriptSession, "id" | "program" | "created_at" | "native_session_id">,
  frames: Record<string, unknown>[],
  tt?: MapTranslate,
): AgentMessage[] {
  const initial = initialDialogState();
  initial.program = session.program;
  initial.activeSession = session.native_session_id ?? "";
  const state = frames.reduce<ReturnType<typeof initialDialogState>>(
    (current, frame) => applyDialog(current, { type: "frame", frame }),
    initial,
  );
  // Untimed rows (replies, steps) are placed by the merge, after the timed row before them.
  return dialogToAgentMessages(state.messages, { live: false, tt, engine: session.program ?? undefined });
}


/** Merge every engine's mapped transcript into one stable, chronological stream. */
export function mergeNativeThreadMessages(sources: readonly NativeThreadSource[]): AgentMessage[] {
  const rows: { message: AgentMessage; time: number; source: number; order: number }[] = [];
  sources.forEach((source, sourceIndex) => {
    // Only user prompts carry a time in saved transcripts: a reply or step takes the time
    // of the row before it in its own session, so it stays right after its prompt.
    let time = Date.parse(source.session.created_at || "") || sourceIndex;
    source.messages.forEach((message, order) => {
      const own = message.created_at ? Date.parse(message.created_at) : NaN;
      if (Number.isFinite(own)) time = Math.max(time, own);
      rows.push({ message, time, source: sourceIndex, order });
    });
  });
  rows.sort((a, b) => a.time - b.time || a.source - b.source || a.order - b.order);
  return orderNativeFrames(rows.map(({ message }) => message), (message) => ({
    seq: typeof message.meta?.native_seq === "number" ? message.meta.native_seq : undefined,
    at: message.created_at ? Date.parse(message.created_at) : undefined,
  }));
}

