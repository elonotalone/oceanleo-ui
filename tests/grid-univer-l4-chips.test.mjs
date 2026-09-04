/**
 * W03 判据 6 —— L4：表格的 chips 与「agent 改动进审阅」。
 *
 * 两条断言撑起这份闸：
 * ① chips 必须过**宿主那一份**校验器（不是我复制的一份），否则两边慢慢长歪；
 * ② `buildGridReviewProposal` 只造消息、**一个字都不写进工作簿**——
 *    规范 §7 判据 3「接受前 revision 不前进」的落点就在这里。
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
  CHIP_ANY_SELECTION,
  chipsForSelection,
  renderChipPrompt,
  validAgentChips,
  validReviewProposal,
} from "../src/shell/hosted-editor/index.ts";
import {
  GRID_AGENT_CHIPS,
  GRID_SELECTION_KINDS,
  buildGridReviewProposal,
  gridAgentChipsAreValid,
  gridToolsManifestChips,
} from "../src/shell/doc-editors/grid-univer/l4-chips.ts";

test("chips 过宿主那一份校验器（不是本地复制的一份）", () => {
  assert.equal(gridAgentChipsAreValid(), true);
  assert.equal(validAgentChips(GRID_AGENT_CHIPS), true);
});

test("规范 §3：chips 上限 8，表格用满 8 条且 id 不重复", () => {
  assert.equal(GRID_AGENT_CHIPS.length, 8);
  const ids = GRID_AGENT_CHIPS.map((chip) => chip.id);
  assert.equal(new Set(ids).size, 8);
  for (const id of ids) assert.match(id, /^grid\.chip\./);
});

test("appliesTo 只许写表格真的会发出的那五种 kind（写错一个字 chip 永远不出现）", () => {
  const allowed = new Set([...GRID_SELECTION_KINDS, CHIP_ANY_SELECTION]);
  for (const chip of GRID_AGENT_CHIPS) {
    assert.ok(chip.appliesTo.length > 0, chip.id);
    for (const kind of chip.appliesTo) {
      assert.ok(allowed.has(kind), `${chip.id} 的 appliesTo 有 ${kind}`);
    }
  }
});

test("那五种 kind 与 GridContextToolbar 在 HEAD 上真的发出去的逐字一致", () => {
  // 清单类判据判 HEAD 而不是工作树（`_COMMON.md` §7b⑪b）：共享树上同事的在途
  // 改动会让这份清单一会儿多一会儿少。
  const source = execFileSync(
    "git",
    ["show", "HEAD:src/shell/doc-editors/GridContextToolbar.tsx"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  const emitted = [
    ...new Set([...source.matchAll(/"(grid-(?:cell|range|row|column|sheet))"/g)].map(
      (match) => match[1],
    )),
  ].sort();
  // 先验正则本身：抓不到就是工具错了，不是「表格不发选区」。
  assert.ok(emitted.length > 0, "扫不到任何 grid-* 选区 kind ⇒ 正则可疑");
  assert.deepEqual(emitted, [...GRID_SELECTION_KINDS].sort());
});

test("每个选区形态下至少有一个 chip 可用——否则那个形态的 L4 是空的", () => {
  for (const kind of GRID_SELECTION_KINDS) {
    const offered = chipsForSelection(GRID_AGENT_CHIPS, kind);
    assert.ok(offered.length > 0, `${kind} 下一个 chip 都没有`);
  }
});

test("无选区时只剩声明了通配符的那条（生成公式）", () => {
  const offered = chipsForSelection(GRID_AGENT_CHIPS, null);
  assert.deepEqual(
    offered.map((chip) => chip.id),
    ["grid.chip.formula"],
  );
});

test("提示词模板只认两个占位符，且只替换一轮", () => {
  const chip = GRID_AGENT_CHIPS.find((entry) => entry.id === "grid.chip.formula");
  const rendered = renderChipPrompt(chip, { selection: "B2:B9" });
  assert.match(rendered, /B2:B9/);
  assert.doesNotMatch(rendered, /\{selection\}/);
  // 用户内容里带占位符不该被再展开一轮（否则能把整份文档灌进提示词）。
  const nested = renderChipPrompt(chip, { selection: "{document}" });
  assert.match(nested, /\{document\}/);
});

test("每条 chip 的 prompt 都带得上选区或明确不需要", () => {
  for (const chip of GRID_AGENT_CHIPS) {
    const usesSelection = chip.prompt.includes("{selection}");
    assert.ok(usesSelection, `${chip.id} 的提示词没有带上选区`);
  }
});

test("tools-manifest v2 的两个可选字段：版本必须是 2，chips 是副本", () => {
  const manifest = gridToolsManifestChips();
  assert.equal(manifest.manifestVersion, 2);
  assert.equal(manifest.chips.length, 8);
  manifest.chips.pop();
  assert.equal(GRID_AGENT_CHIPS.length, 8, "返回的必须是副本，不能被外部改掉");
});

test("判据 6：agent 的一批改动包成提案，逐格可数，过宿主校验器", () => {
  const proposal = buildGridReviewProposal({
    proposalId: "p-1",
    commandId: "grid.set-cell",
    changes: [
      { address: "B2", before: "3", after: "5" },
      { address: "B3", before: "", after: "7" },
    ],
    revision: 11,
  });
  assert.ok(proposal);
  assert.equal(validReviewProposal(proposal), true);
  assert.equal(proposal.objects.length, 2);
  assert.equal(proposal.objects[0].id, "B2");
  assert.equal(proposal.objects[0].op, "update");
  assert.equal(proposal.objects[0].before, "3");
  assert.equal(proposal.objects[0].after, "5");
  // 表格给 objects[] 而不是文本 diff——契约要求两者恰好给一个。
  assert.equal(proposal.diff, undefined);
});

test("判据 6：提案带的 revision 是「尚未落地」的那一版", () => {
  const proposal = buildGridReviewProposal({
    proposalId: "p-2",
    commandId: "grid.set-cell",
    changes: [{ address: "A1", before: "x", after: "y" }],
    revision: 42,
  });
  assert.equal(proposal.revision, 42, "接受之前 revision 不许前进");
});

test("摘要点名前三个地址并在更多时说「等」——「若干单元格将被改写」没法核对", () => {
  const many = Array.from({ length: 5 }, (_unused, index) => ({
    address: `A${index + 1}`,
    before: "",
    after: "x",
  }));
  const proposal = buildGridReviewProposal({
    proposalId: "p-3",
    commandId: "grid.set-cell",
    changes: many,
    revision: 1,
  });
  assert.match(proposal.summary.after, /A1、A2、A3/);
  assert.match(proposal.summary.after, /等/);
  const few = buildGridReviewProposal({
    proposalId: "p-4",
    commandId: "grid.set-cell",
    changes: many.slice(0, 2),
    revision: 1,
  });
  assert.doesNotMatch(few.summary.after, /等/);
});

test("空改动与超量改动都不成提案（宁可不出，不要出一条假的）", () => {
  assert.equal(
    buildGridReviewProposal({
      proposalId: "p-5",
      commandId: "grid.set-cell",
      changes: [],
      revision: 1,
    }),
    null,
  );
  const tooMany = Array.from({ length: 201 }, (_unused, index) => ({
    address: `A${index + 1}`,
    before: "",
    after: "x",
  }));
  assert.equal(
    buildGridReviewProposal({
      proposalId: "p-6",
      commandId: "grid.set-cell",
      changes: tooMany,
      revision: 1,
    }),
    null,
  );
});

test("targetSelection 缺省是 null 而不是 undefined（契约要显式的「没有」）", () => {
  const proposal = buildGridReviewProposal({
    proposalId: "p-7",
    commandId: "grid.set-cell",
    changes: [{ address: "A1", before: "", after: "1" }],
    revision: 2,
  });
  assert.equal(proposal.targetSelection, null);
});
