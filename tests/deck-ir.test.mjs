import assert from "node:assert/strict";
import test from "node:test";

import {
  DECK_IR_JSON_SCHEMA,
  validateDeckIr,
} from "../src/shell/doc-editors/deck-ir.ts";

function oldDeckIr(extra = {}) {
  return {
    schema: "oceanleo.deck.v1",
    version: 1,
    title: "不带具名装字段的既有幻灯片稿子",
    theme: { accent: "2563EB" },
    slides: [
      { layout: "title", title: "既有稿子", subtitle: "兼容性验证" },
      { layout: "section", title: "第一节" },
      { layout: "bullets", title: "要点", bullets: ["第一条", "第二条"] },
      { layout: "two-column", title: "对比", left: ["左侧"], right: ["右侧"] },
      { layout: "quote", quote: { text: "这是一句引文。", attribution: "测试" } },
      {
        layout: "timeline",
        title: "时间线",
        milestones: [{ at: "2026-08", label: "验证" }],
      },
    ],
    attribution: {
      entries: [
        {
          text: "OceanLeo test fixture",
          licenseCode: "CC0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        },
      ],
    },
    ...extra,
  };
}

test("既有稿子不带 packId/sequenceId 仍通过", () => {
  const draft = oldDeckIr();
  const validation = validateDeckIr(draft);

  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(validation.project, draft, "校验不得改写既有稿子对象");
  assert.equal(validation.project.packId, undefined);
  assert.equal(validation.project.sequenceId, undefined);
  assert.ok(!DECK_IR_JSON_SCHEMA.required.includes("packId"));
  assert.ok(!DECK_IR_JSON_SCHEMA.required.includes("sequenceId"));
});

test("packId/sequenceId 过 JSON 往返仍保留并通过", () => {
  const stored = JSON.parse(JSON.stringify(oldDeckIr({
    packId: "paper-cut-amber",
    sequenceId: "standard-briefing",
  })));
  const validation = validateDeckIr(stored);

  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(validation.project.packId, "paper-cut-amber");
  assert.equal(validation.project.sequenceId, "standard-briefing");
  assert.deepEqual(DECK_IR_JSON_SCHEMA.properties.packId, { type: "string" });
  assert.deepEqual(DECK_IR_JSON_SCHEMA.properties.sequenceId, { type: "string" });
});

test("packId/sequenceId 写了就必须是字符串", () => {
  for (const [field, value] of [["packId", 7], ["sequenceId", null]]) {
    const validation = validateDeckIr(oldDeckIr({ [field]: value }));

    assert.equal(validation.ok, false, `${field}=${JSON.stringify(value)} 不该通过`);
    assert.ok(
      validation.errors.some((error) => error.path === field && error.code === "type"),
      JSON.stringify(validation.errors),
    );
  }
});
