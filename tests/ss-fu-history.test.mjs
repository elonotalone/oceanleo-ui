import assert from "node:assert/strict";
import test from "node:test";
import { loadSelectionHistory, TASK_FORWARD_LIMIT, QUOTE_FORWARD_LIMIT } from "../src/shell/messages/conversation/selection-history.ts";
import { everythingSelected, orderedSelection, selectionText } from "../src/shell/messages/conversation/message-selection.ts";
import { LOCALES } from "../src/i18n/config.ts";
import { ssFuCopy, SS_FU_COPY } from "../src/i18n/ui/messages/ss-fu-copy.ts";

const message = seq => ({ id: `m${seq}`, seq, sender_kind: "user", sender_id: "u", kind: "text", body: `line ${seq}`, created_at: "2026-11-21T00:00:00Z", attachments: [] });
function history(size, overrides = {}) {
  const calls = [];
  return { calls, async fetch(params) {
    calls.push(params);
    const end = Math.min(size + 1, params.before_seq ?? size + 1);
    const start = Math.max(1, end - params.limit);
    const items = Array.from({ length: end - start }, (_, index) => ({ ...message(start + index), ...(overrides[start + index] || {}) }));
    return { items, has_more_before: start > 1, has_more_after: false };
  } };
}

test("Copy reads every page beyond both forward limits, in record order", async () => {
  const pages = history(2307);
  const result = await loadSelectionHistory(pages.fetch);
  assert.equal(result.length, 2307);
  assert.equal(pages.calls.length, 24);
  assert.equal(pages.calls[0].before_seq, undefined, "starts newest regardless of the visible search window");
  assert.equal(result[0].seq, 1);
  assert.equal(result.at(-1).seq, 2307);
  const text = selectionText(result, () => "Ann");
  assert.equal(text.split("\n").length, 2307);
  assert.match(text.split("\n")[0], /line 1$/);
});

for (const [name, limit] of [["task bundle", TASK_FORWARD_LIMIT], ["quote card", QUOTE_FORWARD_LIMIT]]) {
  test(`${name}: keeps the newest ${limit} selectable messages, not just the loaded window`, async () => {
    const pages = history(2307, { 2307: { recalled_at: "now" }, 2306: { kind: "system" }, 2305: { hidden_reason: "moderation" } });
    const result = await loadSelectionHistory(pages.fetch, limit);
    assert.equal(result.length, limit);
    assert.equal(result.at(-1).seq, 2304);
    assert.equal(result[0].seq, 2305 - limit);
    assert.ok(pages.calls.length <= Math.ceil(limit / 100) + 1);
  });
}

test("small history stays whole; explicit deselection copies only chosen IDs; no 500-message all-selected shortcut", async () => {
  const pages = history(3);
  assert.deepEqual((await loadSelectionHistory(pages.fetch, 500)).map(m => m.id), ["m1", "m2", "m3"]);
  assert.deepEqual(orderedSelection([message(3), message(1), message(2)], new Set(["m1", "m3"])).map(m => m.id), ["m1", "m3"]);
  assert.equal(everythingSelected(Array.from({ length: 600 }, (_, i) => message(i + 1)), new Set(Array.from({ length: 500 }, (_, i) => `m${i + 1}`)), true), false);
});

test("paging errors and repeated/empty cursors fail rather than returning a partial Copy", async () => {
  const page = history(120);
  await assert.rejects(loadSelectionHistory(async params => {
    if (params.before_seq) throw new Error("offline");
    return page.fetch(params);
  }), /offline/);
  await assert.rejects(loadSelectionHistory(async () => ({ items: [message(5)], has_more_before: true })), /did not advance/);
  await assert.rejects(loadSelectionHistory(async () => ({ items: [], has_more_before: true })), /did not advance/);
});

test("all FU selection and limit copy exists in every supported locale", () => {
  assert.equal(ssFuCopy("en")[SS_FU_COPY.allMessages], "All messages");
  assert.equal(ssFuCopy("en")[SS_FU_COPY.quoteLimit], "Only the newest 500 messages fit in a quote.");
  for (const locale of LOCALES) {
    for (const key of Object.values(SS_FU_COPY)) assert.ok(ssFuCopy(locale)[key]?.trim(), `${locale}: ${key}`);
  }
});
