/**
 * W02 判据 2：chips 消费已入库产出，过宿主 validAgentChips，不自研校验器。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  validAgentChips,
  chipsForSelection,
} from "../src/shell/hosted-editor/index.ts";
import { gridToolsManifestChips } from "../src/shell/doc-editors/grid-univer/l4-chips.ts";
import { imageDesignChipManifestEntries } from "../src/shell/image-editor/design-mode/l4-chips.ts";
import { pdfToolsManifestV2Fields } from "../src/shell/media-editors/pdf-agent-chips.ts";
import {
  chipsForEditor,
  fallbackChipLabels,
  promptForChip,
} from "../src/shell/quick-actions/catalog.ts";
import { rememberEditorChips, resetAgentReviewInbox } from "../src/shell/agent-review/inbox.ts";

test("表格 chips 来自 gridToolsManifestChips，过宿主校验器", () => {
  const fields = gridToolsManifestChips();
  assert.equal(fields.manifestVersion, 2);
  assert.equal(validAgentChips(fields.chips), true);
  const offered = chipsForEditor("grid", "grid-column");
  assert.ok(offered.length > 0);
  assert.ok(offered.every((chip) => fields.chips.some((item) => item.id === chip.id)));
});

test("图片·设计 chips 来自 imageDesignChipManifestEntries", () => {
  const entries = imageDesignChipManifestEntries("design");
  assert.equal(validAgentChips(entries), true);
  const offered = chipsForEditor("image", null);
  assert.ok(offered.length > 0);
  assert.ok(offered.every((chip) => entries.some((item) => item.id === chip.id)));
});

test("PDF chips 来自 pdfToolsManifestV2Fields", () => {
  const fields = pdfToolsManifestV2Fields();
  assert.equal(validAgentChips(fields.chips), true);
  const offered = chipsForEditor("pdf", null);
  assert.deepEqual(
    offered.map((chip) => chip.id).sort(),
    fields.chips
      .filter((chip) => chip.appliesTo.includes("*"))
      .map((chip) => chip.id)
      .sort(),
  );
});

test("richdoc 运行期注入 W08 的 chips 后优先于回退表", () => {
  resetAgentReviewInbox();
  const hosted = [
    {
      id: "richdoc.shorten",
      label: "缩短",
      kind: "rewrite",
      appliesTo: ["text"],
      prompt: "from-umo {selection}",
    },
  ];
  assert.equal(rememberEditorChips("richdoc", hosted), true);
  const offered = chipsForEditor("richdoc", "text");
  assert.equal(offered.length, 1);
  assert.equal(offered[0].prompt, "from-umo {selection}");
  resetAgentReviewInbox();
});

test("umo-hosted RICHDOC_CHIPS 的八个 label 与规范回退表一致", () => {
  const source = readFileSync(
    "/root/projects/umo-hosted/src/bridge/tools-manifest.ts",
    "utf8",
  );
  assert.match(source, /export const RICHDOC_CHIPS/);
  const labels = [...source.matchAll(/label:\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((label) =>
      ["缩短", "加长", "换语气", "翻译", "润色", "生成摘要", "转公众号排版", "加目录"].includes(
        label,
      ),
    );
  assert.deepEqual(labels, fallbackChipLabels("richdoc"));
});

test("点击 chip 的 prompt 走宿主 renderChipPrompt，只替换一轮", () => {
  const chip = chipsForEditor("grid", "grid-column").find(
    (item) => item.id === "grid.chip.summarize-column",
  );
  assert.ok(chip);
  const prompt = promptForChip(chip, { selection: "B 列 {document}" });
  assert.match(prompt, /B 列 \{document\}/);
  assert.doesNotMatch(prompt, /\{selection\}/);
});

test("无选区时只出现声明了 * 的 chip", () => {
  const none = chipsForSelection(gridToolsManifestChips().chips, null);
  assert.deepEqual(
    none.map((chip) => chip.id),
    ["grid.chip.formula"],
  );
});

test("QuickActionChips 源码按入库 id 画出按钮", () => {
  const source = readFileSync(
    new URL("../src/shell/quick-actions/QuickActionChips.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /data-quick-action-chip=\{chip\.id\}/);
  const chips = gridToolsManifestChips().chips.slice(0, 2);
  assert.equal(chips[0].id, "grid.chip.chart");
  assert.equal(chips[0].label, "一键成图");
});

test("反面：9 条 chips 过不了宿主校验器，目录返回空", () => {
  resetAgentReviewInbox();
  const nine = Array.from({ length: 9 }, (_, i) => ({
    id: `grid.chip.x${i}`,
    label: `x${i}`,
    kind: "analyze",
    appliesTo: ["*"],
    prompt: "x",
  }));
  assert.equal(validAgentChips(nine), false);
  assert.equal(rememberEditorChips("grid", nine), false);
  const offered = chipsForEditor("grid", "grid-sheet");
  assert.equal(validAgentChips(gridToolsManifestChips().chips), true);
  assert.ok(offered.length > 0 && offered.length <= 8);
  resetAgentReviewInbox();
});
