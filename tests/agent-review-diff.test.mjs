/**
 * W02 判据 1：行级 / 词级 diff。反面：把 before/after 对调必须看到 add/remove 对换。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { lineDiff, unifiedDiff, wordDiff } from "../src/shell/agent-review/diff.ts";

test("行级 diff 标出增删", () => {
  const ops = lineDiff("hello\nworld", "hello\nthere");
  assert.deepEqual(
    ops.map((op) => `${op.type}:${op.text}`),
    ["equal:hello", "remove:world", "add:there"],
  );
});

test("unifiedDiff 非空且含 +/-（契约 diff 字段 required）", () => {
  const text = unifiedDiff("旧文案", "新文案");
  assert.ok(text.length > 0);
  assert.match(text, /^-/);
  assert.match(text, /^\+/m);
});

test("词级 diff 能拆开同一行里改掉的词", () => {
  const ops = wordDiff("把 这格 改成 1", "把 这格 改成 2");
  assert.ok(ops.some((op) => op.type === "remove" && op.text.includes("1")));
  assert.ok(ops.some((op) => op.type === "add" && op.text.includes("2")));
});

test("反面：对调前后，add 与 remove 对换", () => {
  const forward = lineDiff("A\nB", "A\nC").filter((op) => op.type !== "equal");
  const backward = lineDiff("A\nC", "A\nB").filter((op) => op.type !== "equal");
  assert.equal(forward[0].type, "remove");
  assert.equal(backward[0].type, "remove");
  assert.equal(forward[0].text, "B");
  assert.equal(backward[0].text, "C");
});
