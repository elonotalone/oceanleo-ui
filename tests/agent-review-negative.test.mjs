/**
 * W02 反面验证：每条判据「把改动撤掉必须当场红」。
 * 本文件用源码探针锁住关键挂钩；行为反面已分散在各 focused 闸里（见文末对照）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validAgentChips, validReviewProposal } from "../src/shell/hosted-editor/index.ts";
import { lineDiff } from "../src/shell/agent-review/diff.ts";
import { createReviewSession } from "../src/shell/agent-review/session.ts";
import { chipsForEditor } from "../src/shell/quick-actions/catalog.ts";
import { selectionFromToolbarAttrs } from "../src/shell/agent-review/selection-live.ts";
import { selectionToAgent } from "../src/shell/agent-review/selection-bridge.ts";

const chat = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
const catalog = readFileSync(
  new URL("../src/shell/quick-actions/catalog.ts", import.meta.url),
  "utf8",
);
const gate = readFileSync(new URL("../src/shell/agent-review/gate.ts", import.meta.url), "utf8");
const sessionSrc = readFileSync(
  new URL("../src/shell/agent-review/session.ts", import.meta.url),
  "utf8",
);

test("判据1 反面：闸源码必须在 mutates===false 之外停写；validReviewProposal 是唯一校验", () => {
  assert.match(gate, /spec\.mutates === false/);
  assert.match(gate, /validReviewProposal/);
  assert.match(gate, /from "\.\.\/hosted-editor\/index"/);
  assert.match(sessionSrc, /validReviewProposal/);
  const session = createReviewSession();
  const bad = {
    proposal: {
      proposalId: "p",
      commandId: "",
      summary: { before: "a", after: "b" },
      diff: "-a\n+b",
      targetSelection: null,
      revision: 0,
    },
    params: {},
    inverseParams: {},
    editorId: "grid",
  };
  assert.equal(session.receive(bad, 0), "invalid");
  assert.equal(validReviewProposal(bad.proposal), false);
});

test("判据1 反面：diff 对调前后 add/remove 对换（撤掉算法就红）", () => {
  const forward = lineDiff("A\nB", "A\nC").filter((op) => op.type !== "equal");
  const backward = lineDiff("A\nC", "A\nB").filter((op) => op.type !== "equal");
  assert.equal(forward[0].type, "remove");
  assert.equal(forward[0].text, "B");
  assert.equal(backward[0].text, "C");
});

test("判据2 反面：目录不得自写 validAgentChips；9 条 chips 宿主校验失败", () => {
  assert.match(catalog, /from "\.\.\/hosted-editor\/index"/);
  assert.match(catalog, /gridToolsManifestChips/);
  assert.match(catalog, /imageDesignChipManifestEntries/);
  assert.doesNotMatch(catalog, /function validAgentChips/);
  const nine = Array.from({ length: 9 }, (_, i) => ({
    id: `x.${i}`,
    label: `x${i}`,
    kind: "analyze",
    appliesTo: ["*"],
    prompt: "x",
  }));
  assert.equal(validAgentChips(nine), false);
  const offered = chipsForEditor("grid", "grid-column");
  assert.ok(offered.length > 0 && offered.length <= 8);
});

test("判据3 反面：缺 kind/id 的选区投影必须是 null", () => {
  assert.equal(selectionToAgent({ version: 1, kind: "", id: "A1", controls: [] }), null);
  assert.equal(selectionToAgent({ version: 1, kind: "grid-cell", id: "", controls: [] }), null);
  assert.equal(selectionFromToolbarAttrs({ kind: "none", id: "A1" }), null);
});

test("判据4 反面：AgentChat 不得静态 import CopilotKit（W01-deps §4）", () => {
  assert.doesNotMatch(chat, /@copilotkit/);
  assert.doesNotMatch(chat, /@assistant-ui\/react/);
});

test("判据5 反面：端到端闸必须消费 W03/W04 已入库函数名", () => {
  const e2e = readFileSync(
    new URL("./agent-review-e2e-grid-image.test.mjs", import.meta.url),
    "utf8",
  );
  assert.match(e2e, /buildGridReviewProposal/);
  assert.match(e2e, /gridToolsManifestChips/);
  assert.match(e2e, /imageDesignChipManifestEntries/);
  assert.match(e2e, /calls\.length, 0/);
});
