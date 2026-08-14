import assert from "node:assert/strict";
import test from "node:test";

import {
  artifactTypeHasRoutableEditor,
  TRUSTED_EDITOR_REGISTRY,
} from "../src/shell/workbench-capability-registry.ts";
import {
  ARTIFACT_TYPES,
  ARTIFACT_EDITOR_CAPABILITIES,
  VIEW_ONLY_ARTIFACT_TYPES,
} from "../src/shell/artifact-contract.ts";

// 这一组用例存在的理由是一次真实的误答，不是为了覆盖率。
//
// 素材站要回答「这件素材该不该出编辑按钮」，手里没有判据，于是抄了后端的
// `RELEASED_EDITOR_FEATURE_IDS`（六个 feature id）。那份名单钉的是
// `ADVANCED_FEATURE_PACKS`——哪些能力被打包成了高级功能包，一个产品与计费的划分。
// 拿它去答「有没有编辑器」，16 种类型里有 10 种被判错，网站是其中之一。
const PACKS_NOT_EDITORS = [
  "grid",
  "single_file_image",
  "pdf",
  "chart",
  "geo_map",
  "interactive_doc",
];

test("每一种 artifact 类型都有一个到得了的编辑器", () => {
  // 后端 `_EDITOR_CAPABILITIES` 给 16 种类型都声明了编辑能力，而共享工作台
  // 为每一种能力都备了可路由的适配器。所以正确答案是「全是 true」——
  // 这正是那份六项清单错得有多远的度量。
  for (const artifactType of ARTIFACT_TYPES) {
    assert.equal(
      artifactTypeHasRoutableEditor(artifactType),
      true,
      `${artifactType} 应当有可路由编辑器`,
    );
  }
});

test("旧的六项清单是真子集，说明这次是放宽而不是改判", () => {
  // 六项里有四项是 typed artifact（grid / single_file_image / pdf / chart），它们
  // 确实各有一个到得了的编辑器 —— 这就是「真子集」。
  //
  // 另外两项 `geo_map` / `interactive_doc` 连 artifact 类型名单都不在：它们是**只有
  // 浏览侧**的目录类型，至今没有编辑器。`7bee5da`（2026-07-30 的保护性提交）提交了
  // 「两个新工作台」的契约，实现从未落地，`TRUSTED_EDITOR_REGISTRY` 至今 14 条。
  // 所以这两项钉死 false：那份六项清单错得比原判还多一层 —— 它把两个没有编辑器的
  // 浏览类也一起数了进来。**编辑器落地时这两项会自动变 true 并让这一格红**，
  // 那时把它们移出 `VIEW_ONLY_ARTIFACT_TYPES` 即可。
  for (const artifactType of PACKS_NOT_EDITORS) {
    assert.equal(
      artifactTypeHasRoutableEditor(artifactType),
      !VIEW_ONLY_ARTIFACT_TYPES.includes(artifactType),
      artifactType,
    );
  }
  for (const viewOnly of VIEW_ONLY_ARTIFACT_TYPES) {
    assert.equal(
      ARTIFACT_TYPES.includes(viewOnly),
      false,
      `${viewOnly} 进了 ARTIFACT_TYPES：它已经有编辑/上传链路了，本组判据要跟着翻`,
    );
  }
  const gained = ARTIFACT_TYPES.filter((t) => !PACKS_NOT_EDITORS.includes(t));
  assert.equal(gained.length, 10, "应当恰好恢复 10 类");
  assert.ok(gained.includes("website"), "网站必须在恢复之列");
});

test("embed 路由算落点：网站走的就是它", () => {
  // `website` / `design-canvas` / `video-canvas` 的 routeType 是 "embed" ——
  // 共享工作台把站点自己的编辑器嵌进来。那是一种落点，不是没有落点。
  // 把 embed 当成「没有编辑器」，就会重蹈本文件要修的那个错。
  const website = TRUSTED_EDITOR_REGISTRY["website"];
  assert.equal(website.routeType, "embed");
  assert.equal(website.routable, true);
  assert.equal(website.featureId, "website_finetuning");
  assert.ok(ARTIFACT_EDITOR_CAPABILITIES["website"].has("website-editor"));
});

test("不认识的类型一律 false，不猜", () => {
  for (const bogus of ["", "nonsense", "web site", null, undefined, 42, {}]) {
    assert.equal(artifactTypeHasRoutableEditor(bogus), false, `${String(bogus)} 不该被认作类型`);
  }
});

test("大小写与首尾空白是容错的，那是有意的", () => {
  // 类型值一路从数据库流过来，不是代码里的字面量。收紧到「必须完全相等」会把
  // `"WEBSITE "` 这种判成没有编辑器，那又是一颗本该出现却消失的按钮。
  // 容错只到规范化为止：`"web site"` 仍然是 false（见上一条），不做模糊匹配。
  for (const spelling of ["WEBSITE", " website", "Website "]) {
    assert.equal(artifactTypeHasRoutableEditor(spelling), true, spelling);
  }
});

test("判据是推导的，不是又一份手抄清单", () => {
  // 若有人把某个适配器改成不可路由，这里必须立刻反映出来，而不是继续报 true。
  for (const artifactType of ARTIFACT_TYPES) {
    const capabilities = [...ARTIFACT_EDITOR_CAPABILITIES[artifactType]];
    const routable = capabilities.some((capability) =>
      Object.values(TRUSTED_EDITOR_REGISTRY).some(
        (entry) =>
          entry.routable &&
          (entry.artifactCapabilities || []).includes(capability),
      ),
    );
    assert.equal(artifactTypeHasRoutableEditor(artifactType), routable, artifactType);
  }
});
