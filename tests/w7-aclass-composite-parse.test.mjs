// W7 A 类重造的解析自检：三元组落库后，`advancedCapabilityForArtifactFields()`
// 必须解出 design_canvas 契约（V4 判据「缺任一条解析即为 null」）。
//
// 2026-08-05（W25）夹具搬家：原来这份测试读
// `/tmp/w7-aclass-rebuild/db-triples.json` —— 2026-07-27（`32ee2bb`）落在 `/tmp` 的
// 一次性导出。`/tmp` 早被清空，于是它每次全量都 `ENOENT`，整份文件一条断言都不执行
// （`verdicts/W22-red-list.md` 第 12 条）。那一格罩的行为是有价值的：**库里真实存在的
// 三元组，解析链要给得出编辑器适配器**。所以不删这一格，把夹具搬进仓内
// `tests/fixtures/artifact-capability-triples.json`，并顺手从「A 类那 69 行」扩到
// **全表 44 种真实三元组**——原来那 69 行是同一个三元组重复 69 遍，等于一条断言抄了 69 次。
//
// 夹具出处：`supabase-sql oceanleo` 只读查询，见夹具里的 `source` / `capturedAt`。
// `/tmp` 与 `scratch/` 从此不许再当夹具，这条由
// `tests/w25-tests-out-of-repo-paths.test.mjs` 机检看住。
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  advancedCapabilityForArtifactFields,
  gameSourceFormatAccess,
  VIEW_ONLY_ARTIFACT_TYPES,
} from "../src/shell/artifact-contract.ts";

/** 只有浏览侧、至今没有编辑器的目录类型（`artifact-contract.ts` 是唯一出处）。 */
const VIEW_ONLY_TYPES = new Set(VIEW_ONLY_ARTIFACT_TYPES);

const FIXTURE = fileURLToPath(
  new URL("./fixtures/artifact-capability-triples.json", import.meta.url),
);
const { triples } = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

/** 夹具里的三元组喂进解析链；`sourceFormat` / `editorCapability` 的空串代表该列在库里为 NULL。 */
function resolve(triple) {
  return advancedCapabilityForArtifactFields({
    artifactType: triple.artifactType,
    sourceFormat: triple.sourceFormat || undefined,
    editorCapability: triple.editorCapability || undefined,
  });
}

test("夹具本身是活的：44 种真实三元组，不是空表也不是一条抄 44 遍", () => {
  assert.ok(triples.length >= 40, `夹具只剩 ${triples.length} 种三元组，像是被截断了`);
  const distinct = new Set(
    triples.map(
      (t) => `${t.artifactType}|${t.sourceFormat}|${t.editorCapability}`,
    ),
  );
  assert.equal(distinct.size, triples.length, "夹具里有重复三元组");
  // 原来那一格罩的 A 类行必须还在，否则这份测试就悄悄不再罩它了。
  assert.ok(
    triples.some(
      (t) =>
        t.artifactType === "composite_image" &&
        t.sourceFormat === "oceanleo.design-document.v1" &&
        t.editorCapability === "design-canvas",
    ),
    "A 类 composite_image 三元组不在夹具里",
  );
});

test("A 类 composite_image 三元组解析出 design_canvas，不为 null", () => {
  const aClass = triples.filter(
    (t) =>
      t.artifactType === "composite_image" &&
      t.sourceFormat === "oceanleo.design-document.v1" &&
      t.editorCapability === "design-canvas",
  );
  for (const triple of aClass) {
    const entry = resolve(triple);
    assert.ok(entry, "A 类三元组解析为 null");
    assert.equal(entry.featureId, "design_canvas");
    assert.equal(entry.adapter, "design-canvas");
  }
});

/**
 * 这一条不抄夹具里的 `expect`，判的是一条结构规律：**`editor_capability` 这一列
 * 通常就是解析链的开关。两个显式例外，两张名单各自钉死，别的行一律照常适用：
 *
 * 1. 退役 game bundle：库中旧行仍带历史 `editor_capability`，但它现在只可读/下载，
 *    绝不能再解析成新写入适配器。
 * 2. **声明了一个从未发货的编辑器**：`interactive_doc` 的那一行（库里真实存在，
 *    2026-08-14 复核仍是 1 行，`created_by = platform` 的模板素材）声明
 *    `interactive-doc-editor`，可树里没有这个编辑器 —— `7bee5da`（2026-07-30 的
 *    保护性提交）提交了「两个新工作台」的契约，实现从未落地：
 *    `src/shell/advanced-routes/` 下没有它们的 Route，`TRUSTED_EDITOR_REGISTRY`
 *    至今 14 条。交互文档与地图当前**只有浏览侧**（viewer、封面、类型筛选、explore
 *    分派都齐），所以解析链如实给 null 才是对的：把一颗打不开的「编辑」按钮亮给
 *    用户，比不给更糟。数据侧那行在对用户承诺一个不存在的能力，属于另一档缺陷，
 *    已交父 agent 裁决（见 tasks10/UA-journal.md）。
 *    **编辑器落地时把这一格翻回来**：那一行要回到上面的正常分支。
 */
test("editor_capability 非空会解析适配器，退役 game bundle 与未发货编辑器除外", () => {
  const wrongEmpty = [];
  const wrongPresent = [];
  const legacyReadOnly = [];
  const unshippedEditor = [];
  for (const triple of triples) {
    const entry = resolve(triple);
    const label = `${triple.artifactType}|${triple.sourceFormat}|${triple.editorCapability || "∅"}`;
    if (triple.editorCapability) {
      if (
        triple.artifactType === "game" &&
        gameSourceFormatAccess(triple.sourceFormat) === "legacy-read-only"
      ) {
        legacyReadOnly.push(label);
        if (entry) wrongPresent.push(`${label}（退役载体仍可编辑）`);
      } else if (VIEW_ONLY_TYPES.has(triple.artifactType)) {
        unshippedEditor.push(label);
        if (entry) wrongPresent.push(`${label}（浏览侧类型却解析出了编辑器）`);
      } else if (!entry) {
        wrongPresent.push(label);
      }
    } else if (entry) {
      wrongEmpty.push(label);
    }
  }
  assert.deepEqual(legacyReadOnly, [
    "game|oceanleo.game-bundle.v1|game-editor",
  ]);
  assert.deepEqual(unshippedEditor, [
    "interactive_doc|oceanleo.interactive-doc.v1|interactive-doc-editor",
  ]);
  assert.deepEqual(
    wrongPresent,
    [],
    "库里这些行声明了 editor_capability，解析链却给不出适配器（注册了类型没人声明怎么编辑）",
  );
  assert.deepEqual(
    wrongEmpty,
    [],
    "库里这些行没有 editor_capability，解析链却凭空给出了适配器",
  );
});

/**
 * 同一个 `editor_capability` 不许在不同载体上解析到不同适配器 ——
 * 这条也不抄 `expect`，是从解析结果里自己对出来的一致性规律。
 * 例：`vector-editor` 在库里 50416 行，解析到的是 `design-canvas`
 * （矢量实际路由到设计画布，`vector-editor` 是死代码，见 `artifact-contract.ts:168`）。
 */
test("同一个 editor_capability 只对应一个适配器", () => {
  const seen = new Map();
  const conflicts = [];
  for (const triple of triples) {
    const entry = resolve(triple);
    if (!entry) continue;
    const previous = seen.get(triple.editorCapability);
    if (previous && previous !== entry.adapter) {
      conflicts.push(`${triple.editorCapability} → ${previous} 与 ${entry.adapter}`);
    }
    seen.set(triple.editorCapability, entry.adapter);
  }
  assert.deepEqual(conflicts, [], "同一个 editor_capability 解析到了两个适配器");
});

/**
 * 回归锁。**`expect` 是今天行为的快照，不是独立推导出来的应然值**——它由被测函数自己
 * 生成，所以它只能证明「行为没变」，不能证明「行为是对的」。上面两条结构断言才是独立判据。
 * 这一格的价值在于：谁改动解析链而没意识到它罩着库里 12 万多行真实素材，这里立刻红。
 */
test("回归锁：44 种三元组的解析结果与钉住的快照逐格一致", () => {
  const drift = [];
  for (const triple of triples) {
    const entry = resolve(triple);
    const actual = entry
      ? { featureId: entry.featureId, adapter: entry.adapter }
      : null;
    const label = `${triple.artifactType}|${triple.sourceFormat}|${triple.editorCapability || "∅"}`;
    try {
      assert.deepEqual(actual, triple.expect);
    } catch {
      drift.push(
        `${label}: 钉住 ${JSON.stringify(triple.expect)}，实得 ${JSON.stringify(actual)}`,
      );
    }
  }
  assert.deepEqual(drift, [], "解析结果与夹具快照不一致");
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
