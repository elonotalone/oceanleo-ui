/**
 * W02 判据 5：表格（W03）与图片·设计（W04）端到端。
 * 消费他们已入库的提案/chips；审阅接受前不写；点击 chip 带选区。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { validAgentChips, validReviewProposal } from "../src/shell/hosted-editor/index.ts";
import {
  buildGridReviewProposal,
  gridToolsManifestChips,
} from "../src/shell/doc-editors/grid-univer/l4-chips.ts";
import { imageDesignChipManifestEntries } from "../src/shell/image-editor/design-mode/l4-chips.ts";
import { createReviewSession } from "../src/shell/agent-review/session.ts";
import { applyParkedReview, gateSurfaceForAgent } from "../src/shell/agent-review/gate.ts";
import { chipsForEditor, promptForChip } from "../src/shell/quick-actions/catalog.ts";
import { publishAgentSelection, resetAgentReviewInbox } from "../src/shell/agent-review/inbox.ts";

test("表格：W03 提案进会话，接受前底层 0 写，接受后才写", async () => {
  resetAgentReviewInbox();
  const calls = [];
  const surface = {
    editorId: "grid",
    describe: () => [
      {
        id: "grid.set-cell",
        label: "改单元格",
        summary: "写格",
        mutates: true,
      },
    ],
    state: () => ({ revision: 2 }),
    async run(id, params) {
      calls.push({ id, params });
      return { ok: true, message: "ok", revision: 3 };
    },
  };
  const proposal = buildGridReviewProposal({
    proposalId: "grid-e2e-1",
    commandId: "grid.set-cell",
    changes: [{ address: "A1", before: "1", after: "99" }],
    revision: 2,
  });
  assert.ok(proposal);
  assert.equal(validReviewProposal(proposal), true);
  const session = createReviewSession();
  const gated = gateSurfaceForAgent(surface, session);
  await gated.run("grid.set-cell", { value: "sneak" });
  assert.equal(calls.length, 0, "agent 路径不得直接写格");
  session.reset();
  assert.equal(
    session.receive(
      {
        proposal,
        params: { value: "99" },
        inverseParams: { value: "1" },
        editorId: "grid",
      },
      2,
    ),
    "ok",
  );
  const snap = session.snapshot();
  assert.equal(snap.status, "open");
  assert.ok(snap.parked?.proposal.objects?.some((item) => item.id === "A1"));
  session.acceptAll();
  const parked = session.snapshot().parked;
  const result = await applyParkedReview(surface, parked);
  session.markApplied(result.revision);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.value, "99");
});

test("表格 chip 点击带上当前列选区", () => {
  resetAgentReviewInbox();
  publishAgentSelection({
    version: 1,
    kind: "grid-column",
    id: "col-B",
    label: "B 列",
    text: "B 列销售额",
    controls: [],
  });
  const chips = chipsForEditor("grid", "grid-column");
  const chip = chips.find((item) => item.id === "grid.chip.summarize-column");
  assert.ok(chip);
  const prompt = promptForChip(chip, { selection: "B 列销售额" });
  assert.match(prompt, /B 列销售额/);
  assert.equal(validAgentChips(gridToolsManifestChips().chips), true);
  resetAgentReviewInbox();
});

test("图片·设计：8 个 chips 过校验；选区进 prompt", () => {
  const entries = imageDesignChipManifestEntries("design");
  assert.equal(entries.length, 8);
  assert.equal(validAgentChips(entries), true);
  const offered = chipsForEditor("image", null);
  assert.ok(offered.length > 0);
  const erase = imageDesignChipManifestEntries("design").find(
    (item) => item.id === "image.chip.erase",
  );
  assert.ok(erase);
  const prompt = promptForChip(erase, { selection: "图层 hero" });
  assert.match(prompt, /图层 hero/);
});

test("图片·设计对象类提案：拒绝后 0 写", async () => {
  const calls = [];
  const surface = {
    editorId: "image",
    describe: () => [
      { id: "image.ai.inpaint", label: "擦除", summary: "inpaint", mutates: true },
    ],
    state: () => ({ revision: 1 }),
    async run(id, params) {
      calls.push({ id, params });
      return { ok: true, message: "ok", revision: 2 };
    },
  };
  const session = createReviewSession();
  const gated = gateSurfaceForAgent(surface, session);
  await gated.run("image.ai.inpaint", { region: "watermark" });
  assert.equal(calls.length, 0);
  session.rejectAll();
  session.markDiscarded();
  assert.equal(calls.length, 0);
});
