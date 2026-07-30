/**
 * W3 —— 两个新载体（`geo_map` / `interactive_doc`）在 UI 注册面与枚举面的聚焦用例。
 *
 * 规格来源（唯一实现依据）：
 *   · `docs/specs/oceanleo-material-and-game-v1/L1-carriers/geo-map.md` §1.1 / §10.3
 *   · `.../interactive-doc.md` §1.1 / §10.3
 *   · `.../chart.md` R6（`workbench-routes.ts` 历史 chart 拒绝文案）
 *   · `.../design-document.md` R3 / `vector.md` R1 / `workflow.md` R3
 *     （`design_canvas` 的三条 `artifactBindings`）
 *
 * 本文件的字段期望值是**从规格 §1.1 逐字抄下来的常量**，不是从被测代码反推的，
 * 所以它同时也是 UI 与后端 `ADVANCED_CAPABILITY_CONTRACT` 的共同参照系；
 * 末尾那条用例直接把后端源码里的同一行拆出来逐字段对账。
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  ADVANCED_CAPABILITY_CONTRACT,
  ADVANCED_CAPABILITY_MATRIX,
  ADVANCED_EDITOR_ADAPTER_IDS,
  ARTIFACT_EDITOR_CAPABILITIES,
  ARTIFACT_TYPES,
  advancedCapabilityForAdapter,
  advancedCapabilityForArtifactFields,
  artifactEditorCapabilityIsCompatible,
  artifactSourceFormatIsCompatible,
  artifactUserFacingDownloadHint,
  normalizeArtifactProjection,
  viewerRenditionOrder,
} from "../src/shell/artifact-contract.ts";
import {
  TRUSTED_EDITOR_REGISTRY,
  editorRouteHintForArtifactCapability,
} from "../src/shell/workbench-capability-registry.ts";
import {
  editorCapabilityFor,
  editorRouteFor,
  editorToolLabel,
} from "../src/shell/workbench-routes.ts";
import {
  ADVANCED_FEATURES,
  advancedFeatureById,
  isAdvancedEditableShelfItem,
} from "../src/shell/advanced-features.ts";
import {
  artifactProjectionToLibraryItem,
  artifactTypeForLibraryKind,
  inferLibraryKind,
  libraryKindForArtifactType,
} from "../src/shell/library-data.ts";
import {
  MATERIAL_TAXONOMY_LABEL,
  normalizedMaterialTaxonomy,
} from "../src/shell/material-library-controller.ts";
import { CATALOG_LIBRARY_KIND_CATEGORY } from "../src/shell/site-catalog-controller.ts";
import { WORKSPACE_KIND_LABELS } from "../src/shell/workspace-library-model.ts";
import {
  EXPLORE_MATERIAL_ARTIFACT_TYPES,
  EXPLORE_PLAYABLE_ARTIFACT_TYPES,
  exploreArtifactClassOf,
} from "../src/shell/explore-artifact-class.ts";
import { advancedSessionAppId } from "../src/shell/advanced-session.ts";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

/** `geo-map.md` §1.1 的四元组表，逐字。 */
const GEO_MAP_SPEC = {
  featureId: "geo_map_editing",
  artifactType: "geo_map",
  sourceFormat: "oceanleo.geo-map.v1",
  sourceMediaType: "application/json",
  editorCapability: "geo-map-editor",
  adapter: "geo-map",
  projectSchema: "oceanleo.geo-map.v1",
  editability: "native",
  sourceIntegrity: "complete_dependency_closure",
  openMode: "structured-project",
  previewPurposes: ["preview", "full"],
  requirementKind: "manifest",
  requirementSchema: "oceanleo.geo-map.v1",
  requirementPaths: ["sources", "layers"],
  dependencyClosure: "complete",
  routeType: "geo-map",
  libraryKind: "geo_map",
};

/** `interactive-doc.md` §1.1 的四元组表，逐字。 */
const INTERACTIVE_DOC_SPEC = {
  featureId: "interactive_doc_editing",
  artifactType: "interactive_doc",
  sourceFormat: "oceanleo.interactive-doc.v1",
  sourceMediaType: "application/json",
  editorCapability: "interactive-doc-editor",
  adapter: "interactive-doc",
  projectSchema: "oceanleo.interactive-doc.v1",
  editability: "native",
  sourceIntegrity: "complete_dependency_closure",
  openMode: "structured-project",
  previewPurposes: ["preview", "full"],
  requirementKind: "manifest",
  requirementSchema: "oceanleo.interactive-doc.v1",
  requirementPaths: ["blocks", "computations"],
  dependencyClosure: "complete",
  routeType: "interactive-doc",
  libraryKind: "interactive_doc",
};

const NEW_CARRIERS = [GEO_MAP_SPEC, INTERACTIVE_DOC_SPEC];

function durableProjection(spec) {
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: `artifact-${spec.artifactType}`,
    revision_id: "r1",
    artifact_type: spec.artifactType,
    roles: ["template"],
    title: `${spec.artifactType} fixture`,
    favorite: false,
    owner: {
      principal_id: "user-1",
      visibility: "public",
      origin_site_key: "asset",
      origin_app_id: spec.artifactType,
    },
    access: {
      read: true,
      preview: true,
      edit: true,
      fork: false,
      insert: true,
      replace: true,
      favorite: true,
      bind: true,
      export_source: true,
    },
    editability: spec.editability,
    editor_capability: spec.editorCapability,
    source_format: spec.sourceFormat,
    renditions: {
      thumbnail: {
        purpose: "thumbnail",
        revision_id: "r1",
        url: "https://signed.test/thumb.png",
        media_type: "image/png",
        format: "png",
      },
      preview: {
        purpose: "preview",
        revision_id: "r1",
        url: "https://signed.test/preview.png",
        media_type: "image/png",
        format: "png",
      },
      full: {
        purpose: "full",
        revision_id: "r1",
        url: "https://signed.test/full.json",
        media_type: "application/json",
        format: spec.sourceFormat,
      },
      source: {
        purpose: "source",
        revision_id: "r1",
        url: "https://signed.test/source.json",
        media_type: "application/json",
        format: spec.sourceFormat,
        digest: "sha256:source",
      },
    },
    provenance: { id: "prov-1", source_kind: "owned", license_code: "CC0" },
    integrity: { ok: true, code: "ok", reason: "" },
  };
}

// ── 注册面 1：`ARTIFACT_TYPES` ──────────────────────────────────────────────

test("注册面 1：两个新类型进 ARTIFACT_TYPES，且连字符拼法一个都不许出现", () => {
  assert.equal(ARTIFACT_TYPES.length, 16);
  assert.equal(new Set(ARTIFACT_TYPES).size, 16);
  // §1.1.1：进数据库的一律下划线，末位两项就是这两个新类型。
  assert.deepEqual(ARTIFACT_TYPES.slice(-2), ["geo_map", "interactive_doc"]);
  assert.ok(!ARTIFACT_TYPES.includes("geo-map"));
  assert.ok(!ARTIFACT_TYPES.includes("interactive-doc"));
});

// ── 注册面 2：`ADVANCED_EDITOR_ADAPTER_IDS` ─────────────────────────────────

test("注册面 2：两个 adapter id 进枚举，且与 matrix 行数一一对应", () => {
  assert.equal(ADVANCED_EDITOR_ADAPTER_IDS.length, 15);
  assert.ok(ADVANCED_EDITOR_ADAPTER_IDS.includes("geo-map"));
  assert.ok(ADVANCED_EDITOR_ADAPTER_IDS.includes("interactive-doc"));
  assert.equal(
    ADVANCED_CAPABILITY_MATRIX.length,
    ADVANCED_EDITOR_ADAPTER_IDS.length,
  );
});

// ── 注册面 3：`ADVANCED_CAPABILITY_ROWS`（经 MATRIX 投影读回） ───────────────

test("注册面 3：capability row 的每个字段逐字等于规格 §1.1", () => {
  for (const spec of NEW_CARRIERS) {
    const row = ADVANCED_CAPABILITY_MATRIX.find(
      (entry) => entry.artifactType === spec.artifactType,
    );
    assert.ok(row, `${spec.artifactType} 必须有 capability row`);
    assert.equal(row.featureId, spec.featureId);
    assert.equal(row.sourceFormat, spec.sourceFormat);
    assert.equal(row.sourceMediaType, spec.sourceMediaType);
    assert.equal(row.editorCapability, spec.editorCapability);
    assert.equal(row.adapter, spec.adapter);
    assert.equal(row.projectSchema, spec.projectSchema);
    assert.equal(row.editability, spec.editability);
    assert.equal(row.sourceIntegrity, spec.sourceIntegrity);
    assert.equal(row.openMode, spec.openMode);
    assert.deepEqual(row.previewSource.previewPurposes, spec.previewPurposes);
    assert.equal(row.requirement.kind, spec.requirementKind);
    assert.equal(row.requirement.schema, spec.requirementSchema);
    assert.deepEqual(row.requirement.requiredPaths, spec.requirementPaths);
    assert.equal(row.requirement.dependencyClosure, spec.dependencyClosure);
    // 单成员绑定：§1.1「editor_capability MUST 是唯一成员」，防退化去复用别的编辑器。
    assert.deepEqual(row.artifactBindings, [
      {
        artifactType: spec.artifactType,
        editorCapabilities: [spec.editorCapability],
      },
    ]);
    assert.deepEqual(
      [...ARTIFACT_EDITOR_CAPABILITIES[spec.artifactType]],
      [spec.editorCapability],
    );
    // 结构化工程 ⇒ 下载交付渲染导出，绝不交付裸 JSON 源字节。
    assert.equal(row.download.preferredPurpose, "full");
    assert.equal(row.download.preferredMode, "export");
    assert.equal(row.previewSource.renderedSourceSubstitution, "forbidden");
  }
  assert.strictEqual(ADVANCED_CAPABILITY_CONTRACT, ADVANCED_CAPABILITY_MATRIX);
});

test("source format 与 editor capability 的相容判定认新类型、拒 html 与拼错", () => {
  for (const spec of NEW_CARRIERS) {
    assert.equal(
      artifactSourceFormatIsCompatible(spec.artifactType, spec.sourceFormat),
      true,
    );
    // ADR-04：`html` 不得落库，前端相容判定同样不放行。
    assert.equal(
      artifactSourceFormatIsCompatible(spec.artifactType, "html"),
      false,
    );
    assert.equal(
      artifactSourceFormatIsCompatible(spec.artifactType, "text/html"),
      false,
    );
    assert.equal(
      artifactEditorCapabilityIsCompatible(
        spec.artifactType,
        spec.editorCapability,
      ),
      true,
    );
    assert.equal(
      artifactEditorCapabilityIsCompatible(spec.artifactType, "website-editor"),
      false,
    );
  }
  // interactive-doc.md §1.1：`-doc` 段省掉就是另一个格式串，必须被拒。
  assert.equal(
    artifactSourceFormatIsCompatible("interactive_doc", "oceanleo.interactive.v1"),
    false,
  );
});

// ── 注册面 4 + 5：`EditorRoute` 与 `EDITOR_ADAPTER_RUNTIME` ────────────────

test("注册面 4/5：两个 adapter 各有独立 routeType，MUST NOT 复用 chart 的 grid", () => {
  for (const spec of NEW_CARRIERS) {
    const entry = TRUSTED_EDITOR_REGISTRY[spec.adapter];
    assert.ok(entry, `${spec.adapter} 必须在受信任 registry 内`);
    assert.equal(entry.routeType, spec.routeType);
    assert.notEqual(entry.routeType, "grid");
    assert.notEqual(entry.routeType, "embed");
    assert.equal(entry.projectSchema, spec.projectSchema);
    assert.equal(entry.viewportOwnership, "content");
    assert.equal(entry.toolbarOwnership, "shared");
    assert.equal(entry.persistence, "project");
    assert.equal(entry.routable, true);
    assert.equal(entry.featureId, spec.featureId);
    assert.deepEqual(entry.roundTrip, ["load", "mutate", "save", "reopen"]);
    assert.equal(
      editorRouteHintForArtifactCapability(spec.editorCapability),
      spec.routeType,
    );
  }
  // 既有设计不受影响：`chart-editor@1` 仍然复用 grid 宿主视口。
  assert.equal(TRUSTED_EDITOR_REGISTRY["chart-editor@1"].routeType, "grid");
  // 两个新 routeType 互不相同，也不与既有任何一个撞。
  const routeTypes = Object.values(TRUSTED_EDITOR_REGISTRY).map(
    (entry) => entry.routeType,
  );
  assert.equal(routeTypes.filter((type) => type === "geo-map").length, 1);
  assert.equal(
    routeTypes.filter((type) => type === "interactive-doc").length,
    1,
  );
});

// ── 注册面 6：路由分派 ──────────────────────────────────────────────────────

test("注册面 6：durable projection 经共享 matrix 分派到各自的独立 route", () => {
  for (const spec of NEW_CARRIERS) {
    const artifact = normalizeArtifactProjection(durableProjection(spec));
    assert.ok(artifact, `${spec.artifactType} projection 必须能规范化`);
    assert.equal(artifact.integrity.ok, true);
    const item = artifactProjectionToLibraryItem(artifact);
    assert.equal(item.kind, spec.libraryKind);
    const capability = editorCapabilityFor(item);
    assert.equal(capability.available, true, capability.unavailableReason);
    assert.equal(capability.adapter, spec.adapter);
    assert.deepEqual(editorRouteFor(item), { type: spec.routeType });
    assert.equal(isAdvancedEditableShelfItem(item), true);
    // 会话面：route 与 kind 都必须已登记，否则挂载即抛「Legacy office route」。
    assert.ok(advancedSessionAppId(item, spec.routeType).startsWith("advanced:v2:"));
  }
});

test("注册面 6：pinned route 与 kind 回退都认新类型，且排在 website 分支之前", () => {
  for (const spec of NEW_CARRIERS) {
    const pinned = editorCapabilityFor({
      key: `local:${spec.artifactType}`,
      source: "creation",
      id: spec.artifactType,
      title: "fixture",
      kind: spec.libraryKind,
      siteId: "asset",
      favorite: false,
      meta: { advanced_editor_route: spec.routeType },
    });
    assert.equal(pinned.available, true, pinned.unavailableReason);
    assert.equal(pinned.adapter, spec.adapter);

    // 没有 pinned route 时按 kind 判，且**不得**被 richdoc / website 抢走：
    // 两者的 source 都是 JSON 文本，落到那两条就等于把工程当文本或站点打开。
    const byKind = editorCapabilityFor({
      key: `local:${spec.artifactType}:by-kind`,
      source: "creation",
      id: `${spec.artifactType}-by-kind`,
      title: "fixture",
      kind: spec.libraryKind,
      siteId: "asset",
      content: '{"schema":"oceanleo.geo-map.v1"}',
      favorite: false,
      meta: {},
    });
    assert.equal(byKind.adapter, spec.adapter);
    assert.equal(byKind.route.type, spec.routeType);
  }
});

test("工具栏「编辑」按钮对两个新 route 各有自己的名字", () => {
  assert.equal(editorToolLabel({ type: "geo-map" }), "地图编辑");
  assert.equal(editorToolLabel({ type: "interactive-doc" }), "交互文档编辑");
  // 既有取值未被顺手改动。
  assert.equal(
    editorToolLabel({ type: "grid", adapter: "chart-editor@1" }),
    "图表编辑",
  );
});

// ── 特性开关登记（`advanced-features.ts`） ─────────────────────────────────

test("两个新特性在 ADVANCED_FEATURES 里各有独立展示文案与 capability 行", () => {
  for (const spec of NEW_CARRIERS) {
    const feature = advancedFeatureById(spec.featureId);
    assert.ok(feature, `${spec.featureId} 必须登记`);
    assert.equal(feature.capability.artifactType, spec.artifactType);
    assert.equal(feature.capability.adapter, spec.adapter);
    assert.ok(feature.title.trim().length > 0);
    assert.ok(feature.eyebrow.trim().length > 0);
    assert.ok(feature.description.trim().length > 0);
    assert.ok(feature.examples.trim().length > 0);
    assert.equal(
      advancedCapabilityForAdapter(spec.adapter).featureId,
      spec.featureId,
    );
    assert.equal(
      advancedCapabilityForArtifactFields({
        artifactType: spec.artifactType,
        sourceFormat: spec.sourceFormat,
        editorCapability: spec.editorCapability,
      }).featureId,
      spec.featureId,
    );
  }
  assert.equal(ADVANCED_FEATURES.length, ADVANCED_CAPABILITY_MATRIX.length);
  assert.equal(
    new Set(ADVANCED_FEATURES.map((feature) => feature.title)).size,
    ADVANCED_FEATURES.length,
    "每个特性的标题必须互不相同，否则卡片上分不出是哪个编辑器",
  );
});

// ── 枚举面：卡片标签 / 类型筛选 / 图标 / 下载 / 插入 / 替换 / 收藏 / 搜索 ──

test("枚举面：卡片标签与类型筛选在四处标签表都有显式条目", () => {
  for (const spec of NEW_CARRIERS) {
    // 类型 chips 与下拉的文案源（`Record<ArtifactType, string>` 全覆盖）。
    assert.ok(MATERIAL_TAXONOMY_LABEL[spec.artifactType]);
    // 我的库 / 深链消费端 / 工作台卡片三处 kind 标签。
    assert.ok(CATALOG_LIBRARY_KIND_CATEGORY[spec.libraryKind]);
    assert.ok(WORKSPACE_KIND_LABELS[spec.libraryKind]);
    assert.equal(
      CATALOG_LIBRARY_KIND_CATEGORY[spec.libraryKind],
      MATERIAL_TAXONOMY_LABEL[spec.artifactType],
      "深链分类与类型标签必须同字",
    );
  }
  assert.equal(MATERIAL_TAXONOMY_LABEL.geo_map, "地图");
  assert.equal(MATERIAL_TAXONOMY_LABEL.interactive_doc, "交互文档");
  // `MyLibrary.tsx` 的 KIND_CATEGORY 与深链消费端逐字一致（源码对账）。
  const myLibrary = source("../src/shell/MyLibrary.tsx");
  assert.ok(myLibrary.includes('geo_map: "地图"'));
  assert.ok(myLibrary.includes('interactive_doc: "交互文档"'));
});

test("枚举面：kind ↔ artifactType 双向映射与类型 token 归一都认新类型", () => {
  for (const spec of NEW_CARRIERS) {
    assert.equal(libraryKindForArtifactType(spec.artifactType), spec.libraryKind);
    assert.equal(artifactTypeForLibraryKind(spec.libraryKind), spec.artifactType);
    // 搜索 / 深链 token 归一：连字符与无分隔写法都收敛到下划线枚举值。
    assert.equal(normalizedMaterialTaxonomy(spec.artifactType), spec.artifactType);
    assert.equal(
      normalizedMaterialTaxonomy(spec.artifactType.replace("_", "-")),
      spec.artifactType,
    );
    assert.equal(
      inferLibraryKind({ kind: spec.libraryKind, meta: {} }),
      spec.libraryKind,
    );
  }
  // `map` 这个裸词仍归画布（思维导图 / 白板），没有被地理地图抢走。
  assert.equal(inferLibraryKind({ kind: "map", meta: {} }), "canvas");
});

test("枚举面：图标与查看器各有显式分支，且不落到 default 兜底", () => {
  const viewers = source("../src/shell/library-viewers.tsx");
  // 图标：两条 path 各自独立，不与 canvas / document / image 共用。
  const iconPaths = ["geo_map", "interactive_doc"].map((kind) => {
    const matched = new RegExp(`\\n\\s+${kind}: "([^"]+)"`).exec(viewers);
    assert.ok(matched, `${kind} 必须有独立图标 path`);
    return matched[1];
  });
  assert.equal(new Set(iconPaths).size, 2);
  for (const kind of ["canvas", "document", "image", "file"]) {
    const matched = new RegExp(`\\n\\s+${kind}: "([^"]+)"`).exec(viewers);
    assert.ok(matched);
    assert.ok(
      !iconPaths.includes(matched[1]),
      `新图标 MUST NOT 与 ${kind} 同形`,
    );
  }
  // 查看器：显式分支存在，且明确排在 image 分支之前。
  const viewerBranch = viewers.indexOf('resolvedItem.kind === "geo_map"');
  const imageBranch = viewers.indexOf('resolvedItem.kind === "image" && url');
  assert.ok(viewerBranch > 0, "查看器必须有 geo_map 显式分支");
  assert.ok(viewers.includes('resolvedItem.kind === "interactive_doc"'));
  assert.ok(viewerBranch < imageBranch);
  // 标签表也各有一行。
  assert.ok(viewers.includes('geo_map: "地图"'));
  assert.ok(viewers.includes('interactive_doc: "交互文档"'));
});

test("枚举面：下载交付渲染导出，绝不把 JSON 工程当用户文件递出去", () => {
  for (const spec of NEW_CARRIERS) {
    const hint = artifactUserFacingDownloadHint({
      artifactType: spec.artifactType,
      sourceFormat: spec.sourceFormat,
      editorCapability: spec.editorCapability,
      title: "示例产物",
      renditions: {
        source: {
          purpose: "source",
          revisionId: "r1",
          url: "https://signed.test/source.json",
          mediaType: "application/json",
          format: spec.sourceFormat,
          digest: "sha256:source",
        },
        full: {
          purpose: "full",
          revisionId: "r1",
          url: "https://signed.test/full.png",
          mediaType: "image/png",
          format: "png",
        },
      },
    });
    assert.ok(hint);
    assert.equal(hint.mediaType, "image/png");
    assert.equal(hint.extension, "png");
    assert.ok(!hint.filename.endsWith(".json"));
  }
  // 卡片位图只能来自渲出的 preview：`full` 是 JSON 信封，不是位图。
  assert.deepEqual(viewerRenditionOrder("geo_map"), ["preview", "full"]);
  assert.deepEqual(viewerRenditionOrder("interactive_doc"), [
    "preview",
    "full",
  ]);
});

test("枚举面：封面既不裁切也不许走 HTML 通路；缩略图不许浏览器现生成", () => {
  const cover = source("../src/shell/workspace-library-cover.tsx");
  assert.ok(
    /artifactType === "geo_map" \|\| artifactType === "interactive_doc"[\s\S]{0,80}return "contain"/.test(
      cover,
    ),
    "两个新载体必须显式整幅显示（图例与归属条不得被裁）",
  );
  const websiteCover = cover.slice(cover.indexOf("function supportsWebsiteCover"));
  assert.ok(
    websiteCover.includes('artifactType === "geo_map"') &&
      websiteCover.includes("return false"),
    "HTML 封面通路必须显式拒绝两个新载体（ADR-04）",
  );
  const thumbnail = source("../src/shell/workspace-library-thumbnail.tsx");
  assert.ok(thumbnail.includes("forbidsGeneratedThumbnail"));
  assert.ok(
    /kind === "geo_map" \|\| kind === "interactive_doc"/.test(thumbnail),
  );
});

test("枚举面：插入面板按新类型收窄，不落到 all", () => {
  const panel = source("../src/shell/InlineEditorMaterialPanel.tsx");
  assert.ok(panel.includes('geo_map: "geo_map"'));
  assert.ok(panel.includes('interactive_doc: "interactive_doc"'));
});

test("枚举面：素材总栏目各给一个板块，board → artifactType 映射也补齐", () => {
  const catalog = source("../src/shell/material-catalog.tsx");
  // 板块 id 联合类型、tab 骨架、board→taxonomy 三处都要有，缺一处就是
  // 「有 tab 打不开」或「打开了筛不到东西」。
  assert.ok(/\|\s*"geo_map"/.test(catalog));
  assert.ok(/\|\s*"interactive_doc"/.test(catalog));
  assert.ok(catalog.includes('{ id: "geo_map", label: "地图" }'));
  assert.ok(catalog.includes('{ id: "interactive_doc", label: "交互文档" }'));
  const boardMap = catalog.slice(catalog.indexOf("BOARD_ARTIFACT_TYPE"));
  assert.ok(boardMap.includes('geo_map: "geo_map"'));
  assert.ok(boardMap.includes('interactive_doc: "interactive_doc"'));
  // 两个新板块 MUST NOT 借用别的 artifactType（借用 = 打开地图板块看到图片）。
  assert.ok(!/geo_map: "single_file_image"/.test(boardMap));
  assert.ok(!/interactive_doc: "document"/.test(boardMap));
});

test("枚举面：搜索 / 探索分类把两类新素材算进素材那一格，不进可玩 feed", () => {
  for (const spec of NEW_CARRIERS) {
    assert.equal(exploreArtifactClassOf(spec.artifactType), "material");
    assert.ok(EXPLORE_MATERIAL_ARTIFACT_TYPES.includes(spec.artifactType));
    assert.ok(!EXPLORE_PLAYABLE_ARTIFACT_TYPES.includes(spec.artifactType));
  }
  assert.equal(
    EXPLORE_MATERIAL_ARTIFACT_TYPES.length +
      EXPLORE_PLAYABLE_ARTIFACT_TYPES.length,
    ARTIFACT_TYPES.length,
    "分类必须全覆盖：漏一类会在模块加载时炸，而不是静默降级",
  );
});

test("枚举面：收藏 / 插入 / 替换权限位随 projection 走，两类新素材都拿得到", () => {
  for (const spec of NEW_CARRIERS) {
    const artifact = normalizeArtifactProjection(durableProjection(spec));
    assert.ok(artifact);
    assert.equal(artifact.access.canFavorite, true);
    assert.equal(artifact.access.canInsert, true);
    assert.equal(artifact.access.canReplace, true);
    const item = artifactProjectionToLibraryItem(artifact);
    assert.equal(item.artifactType, spec.artifactType);
    assert.equal(item.artifactId, artifact.artifactId);
    assert.equal(item.revisionId, artifact.revisionId);
  }
});

// ── `design_canvas` 的三条 artifactBindings ────────────────────────────────

test("design_canvas 的 artifactBindings 恰为三条（design-document R3 / vector R1 / workflow R3）", () => {
  const row = ADVANCED_CAPABILITY_MATRIX.find(
    (entry) => entry.featureId === "design_canvas",
  );
  assert.ok(row);
  assert.equal(row.adapter, "design-canvas");
  assert.deepEqual(row.artifactBindings, [
    { artifactType: "composite_image", editorCapabilities: ["design-canvas"] },
    { artifactType: "workflow", editorCapabilities: ["design-canvas"] },
    // vector.md R1：这条 MUST NOT 回退到 image_editing / 位图适配器。
    { artifactType: "vector_image", editorCapabilities: ["vector-editor"] },
  ]);
  assert.equal(
    advancedCapabilityForArtifactFields({
      artifactType: "vector_image",
      sourceFormat: "svg",
      editorCapability: "vector-editor",
    }).adapter,
    "design-canvas",
  );
});

// ── chart.md R6：历史 chart 拒绝文案 ───────────────────────────────────────

test("chart.md R6：历史 chart 的拒绝文案按三种成因分开给，不再一句话包办", () => {
  const legacyItem = (meta) => ({
    key: "asset:chart",
    source: "creation",
    id: "chart",
    title: "历史图表",
    kind: "image",
    siteId: "asset",
    favorite: false,
    url: "https://asset.test/cover.png",
    meta: { asset_type: "chart", ...meta },
  });
  const manifest = (patch = {}) => ({
    schema: "oceanleo.editor-manifest.v1",
    id: "chart-editor",
    version: 1,
    capabilities: ["load", "mutate", "save", "reopen"],
    source: {
      kind: "url",
      format: "oceanleo.chart.v1",
      url: "/v1/assets/library/chart-1/editor-source",
    },
    ...patch,
  });

  // 成因一：连 manifest 都没有 —— 只有渲染 HTML / 封面。
  const renderOnly = editorCapabilityFor(legacyItem({ format: "html" }));
  assert.equal(renderOnly.available, false);
  assert.match(renderOnly.unavailableReason, /只有渲染 HTML\/封面/);
  assert.match(renderOnly.unavailableReason, /oceanleo\.chart\.v1/);

  // 成因二：有 manifest 但没声明全套回写能力。
  const noRoundTrip = editorCapabilityFor(
    legacyItem({ editor: manifest({ capabilities: ["load"] }) }),
  );
  assert.equal(noRoundTrip.available, false);
  assert.match(noRoundTrip.unavailableReason, /回写能力/);
  assert.ok(!noRoundTrip.unavailableReason.includes("只有渲染 HTML/封面"));

  // 成因三：manifest 齐但取不到 option 源字节（声明 inline 却没有内联 option）。
  const noSource = editorCapabilityFor(
    legacyItem({
      editor: manifest({
        source: { kind: "inline", format: "oceanleo.chart.v1" },
      }),
    }),
  );
  assert.equal(noSource.available, false);
  assert.match(noSource.unavailableReason, /取不到 option 源字节/);
  assert.ok(!noSource.unavailableReason.includes("只有渲染 HTML/封面"));

  // 三句话互不相同，且服务端给了具体理由时仍然优先用服务端那句。
  const reasons = new Set([
    renderOnly.unavailableReason,
    noRoundTrip.unavailableReason,
    noSource.unavailableReason,
  ]);
  assert.equal(reasons.size, 3);
  const serverReason = editorCapabilityFor(
    legacyItem({ format: "html", unavailable_reason: "服务端给的具体理由。" }),
  );
  assert.equal(serverReason.unavailableReason, "服务端给的具体理由。");
});

// ── UI ↔ 后端 capability 契约逐字段对账 ───────────────────────────────────

/**
 * 后端 `ADVANCED_CAPABILITY_CONTRACT` 的位置参数顺序（`AdvancedCapabilityContract`，
 * `typed_artifact_models.py`）：feature_id / artifact_type / source_format /
 * source_media_type / editor_capability / adapter / project_schema / editability /
 * source_integrity / open_mode / preview_purposes / requirement_kind /
 * requirement_schema / requirement_paths / dependency_closure。
 *
 * 只读后端源码，不改它（W1 独占）。取不到文件就跳过，不把 W1 的排期算成本 owner 的失败。
 */
const BACKEND_MODELS =
  "/root/projects/oceanleo/backend/app/typed_artifact_models.py";

function backendCapabilityTokens(featureId) {
  const text = readFileSync(BACKEND_MODELS, "utf8");
  const start = text.indexOf(`"${featureId}"`);
  if (start < 0) return null;
  const blockStart = text.lastIndexOf("AdvancedCapabilityContract(", start);
  const blockEnd = text.indexOf("\n    ),", start);
  if (blockStart < 0 || blockEnd < 0) return null;
  const block = text
    .slice(blockStart, blockEnd)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n")
    .replace(/ArtifactType\.GEO_MAP/g, '"geo_map"')
    .replace(/ArtifactType\.INTERACTIVE_DOC/g, '"interactive_doc"')
    .replace(/Editability\.NATIVE/g, '"native"');
  return [...block.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

test("UI capability row 与后端 ADVANCED_CAPABILITY_CONTRACT 逐字段一致", (t) => {
  if (!existsSync(BACKEND_MODELS)) {
    t.skip("后端仓不可见，UI ↔ 后端对账留给 V1/V2");
    return;
  }
  for (const spec of NEW_CARRIERS) {
    const tokens = backendCapabilityTokens(spec.featureId);
    if (!tokens) {
      t.diagnostic(
        `后端尚未落 ${spec.featureId} 行（W1 排期），本轮只校验 UI 侧字段。`,
      );
      continue;
    }
    const expected = [
      spec.featureId,
      spec.artifactType,
      spec.sourceFormat,
      spec.sourceMediaType,
      spec.editorCapability,
      spec.adapter,
      spec.projectSchema,
      spec.editability,
      spec.sourceIntegrity,
      spec.openMode,
      ...spec.previewPurposes,
      spec.requirementKind,
      spec.requirementSchema,
      ...spec.requirementPaths,
      spec.dependencyClosure,
    ];
    assert.deepEqual(
      tokens,
      expected,
      `${spec.featureId}: 后端字段序列与规格 §1.1 不一致`,
    );

    // 同一份期望值也必须等于 UI 的 row —— 两侧对同一个参照系，不互相反推。
    const row = ADVANCED_CAPABILITY_MATRIX.find(
      (entry) => entry.featureId === spec.featureId,
    );
    assert.deepEqual(
      [
        row.featureId,
        row.artifactType,
        row.sourceFormat,
        row.sourceMediaType,
        row.editorCapability,
        row.adapter,
        row.projectSchema,
        row.editability,
        row.sourceIntegrity,
        row.openMode,
        ...row.previewSource.previewPurposes,
        row.requirement.kind,
        row.requirement.schema,
        ...row.requirement.requiredPaths,
        row.requirement.dependencyClosure,
      ],
      expected,
      `${spec.featureId}: UI 字段序列与规格 §1.1 不一致`,
    );
  }
});
