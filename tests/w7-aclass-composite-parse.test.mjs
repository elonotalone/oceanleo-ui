// W7 A 类重造的解析自检：三元组落库后，`advancedCapabilityForArtifactFields()`
// 必须解出 design_canvas 契约（V4 判据「缺任一条解析即为 null」）。
// 数据来自 /tmp/w7-aclass-rebuild/db-triples.json（由 supabase 实测导出，不是脚本自述）。
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { advancedCapabilityForArtifactFields } from "../src/shell/artifact-contract.ts";

const DUMP = "/tmp/w7-aclass-rebuild/db-triples.json";

test("重造的 69 行三元组解析出 design_canvas，不为 null", () => {
  const rows = JSON.parse(fs.readFileSync(DUMP, "utf8"));
  assert.ok(rows.length > 0, "没有导出行");
  const nulls = [];
  const wrong = [];
  for (const row of rows) {
    const entry = advancedCapabilityForArtifactFields({
      artifactType: row.artifact_type,
      sourceFormat: row.source_format,
      editorCapability: row.editor_capability,
    });
    if (!entry) nulls.push(row.id);
    else if (entry.featureId !== "design_canvas" || entry.adapter !== "design-canvas") wrong.push(row.id);
  }
  assert.deepEqual(nulls, [], `解析为 null 的行：${nulls.join(",")}`);
  assert.deepEqual(wrong, [], `解析到非 design_canvas 的行：${wrong.join(",")}`);
});

test("三元组缺任一条就解析为 null（证明这不是恒真断言）", () => {
  const full = {
    artifactType: "composite_image",
    sourceFormat: "oceanleo.design-document.v1",
    editorCapability: "design-canvas",
  };
  assert.ok(advancedCapabilityForArtifactFields(full));
  // 只把形态改回位图（source_format 还是图层工程）也解析不出来 —— 正是「只改一列」的下场
  assert.equal(advancedCapabilityForArtifactFields({ ...full, artifactType: "single_file_image" }), null);
  assert.equal(advancedCapabilityForArtifactFields({ ...full, sourceFormat: "webp" }), null);
  assert.equal(advancedCapabilityForArtifactFields({ ...full, editorCapability: "image-editor" }), null);
});
