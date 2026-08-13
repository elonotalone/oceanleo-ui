// 第 14 个 artifact type `game` 的前端注册契约（W9）。
//
// 判据出处：`01-decisions.md` D7/D8 与 `02-save-contract-matrix.md` §4。
// 全部是静态检查与纯函数断言，不起浏览器。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ADVANCED_CAPABILITY_MATRIX,
  ADVANCED_EDITOR_ADAPTER_IDS,
  ARTIFACT_EDITOR_CAPABILITIES,
  ARTIFACT_TYPES,
  GAME_DOCUMENT_SOURCE_FORMAT,
  LEGACY_GAME_BUNDLE_SOURCE_FORMAT,
  advancedCapabilityForArtifactFields,
  artifactDownloadPlanFor,
  artifactEditorCapabilityIsCompatible,
  artifactSourceFormatIsCompatible,
  gameSourceFormatAccess,
  viewerRenditionOrder,
} from "../src/shell/artifact-contract.ts";
import {
  artifactTypeForLibraryKind,
  libraryKindForArtifactType,
} from "../src/shell/library-data.ts";
import {
  TRUSTED_EDITOR_REGISTRY,
  editorAdapterForArtifactCapability,
  editorRouteHintForArtifactCapability,
} from "../src/shell/workbench-capability-registry.ts";

const gameRouteSource = readFileSync(
  fileURLToPath(
    new URL("../src/shell/advanced-routes/GameRoute.tsx", import.meta.url),
  ),
  "utf8",
);

/**
 * 注释里出现「不得塞进 iframe 的 srcdoc」这类说明是对的，不该让禁令断言变红。
 * 禁令只针对真正会执行的代码，所以先剥掉注释再断言。
 */
const gameRouteCode = gameRouteSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("//"))
  .join("\n");

test("game is the fourteenth artifact type and owns its own adapter", () => {
  assert.equal(ARTIFACT_TYPES.indexOf("game"), 13);
  assert.equal(
    ADVANCED_CAPABILITY_MATRIX.length,
    ADVANCED_EDITOR_ADAPTER_IDS.length,
  );
  assert.ok(ADVANCED_EDITOR_ADAPTER_IDS.includes("game"));

  const row = ADVANCED_CAPABILITY_MATRIX.find(
    (entry) => entry.artifactType === "game",
  );
  assert.ok(row, "matrix must carry a game row");
  // `game_editing` 是 `EXPECTED_CLASS_CONTRACT` 与 catalog-release
  // `expected_contracts` 的连接键；改名会直接 KeyError。
  assert.equal(row.featureId, "game_editing");
  assert.equal(row.editorCapability, "game-editor");
  assert.equal(row.adapter, "game");
  assert.equal(row.projectSchema, GAME_DOCUMENT_SOURCE_FORMAT);
  assert.equal(row.editability, "bounded");
});

test("the game row stays byte-for-byte aligned with the backend contract", () => {
  // B12：`text/html` 被 `media_rehost._BLOCKED_MIME` 与
  // `_validate_upload_media_type` 两道黑名单拒收，可玩产物只能是 JSON 信封。
  // 这五个字段是 A10 仲裁逐字点名的，任一漂回旧形状都会让保存链重新炸掉。
  const row = ADVANCED_CAPABILITY_MATRIX.find(
    (entry) => entry.artifactType === "game",
  );
  assert.equal(row.featureId, "game_editing");
  assert.equal(row.sourceFormat, GAME_DOCUMENT_SOURCE_FORMAT);
  assert.equal(row.sourceMediaType, "application/json");
  assert.equal(row.openMode, "structured-project");
  assert.deepEqual(row.requirement, {
    kind: "none",
    schema: null,
    requiredPaths: [],
    dependencyClosure: "not_required",
  });
  assert.deepEqual(
    {
      preferredPurpose: row.download.preferredPurpose,
      preferredMode: row.download.preferredMode,
      fallbackPurposes: [...row.download.fallbackPurposes],
      fallbackMode: row.download.fallbackMode,
    },
    {
      preferredPurpose: "full",
      preferredMode: "export",
      fallbackPurposes: ["preview"],
      fallbackMode: "export",
    },
  );
});

test("game never borrows the website source-code capability", () => {
  // D7：`website-editor` 背后是 Next 源码工作台（CAS 源码树 + dev preview）。
  assert.equal(
    artifactEditorCapabilityIsCompatible("game", "website-editor"),
    false,
  );
  assert.equal(
    artifactEditorCapabilityIsCompatible("website", "game-editor"),
    false,
  );
  assert.deepEqual([...ARTIFACT_EDITOR_CAPABILITIES.game], ["game-editor"]);
  assert.equal(editorAdapterForArtifactCapability("game-editor"), "game");

  const website = ADVANCED_CAPABILITY_MATRIX.find(
    (entry) => entry.artifactType === "website",
  );
  assert.notEqual(website.projectSchema, GAME_DOCUMENT_SOURCE_FORMAT);
  assert.equal(
    advancedCapabilityForArtifactFields({
      artifactType: "game",
      sourceFormat: GAME_DOCUMENT_SOURCE_FORMAT,
      editorCapability: "website-editor",
    }),
    null,
  );
});

test("only the complete-document carrier is editable; legacy is identified read-only", () => {
  assert.equal(
    artifactSourceFormatIsCompatible("game", GAME_DOCUMENT_SOURCE_FORMAT),
    true,
  );
  assert.equal(
    gameSourceFormatAccess(LEGACY_GAME_BUNDLE_SOURCE_FORMAT),
    "legacy-read-only",
  );
  assert.equal(
    artifactSourceFormatIsCompatible(
      "game",
      LEGACY_GAME_BUNDLE_SOURCE_FORMAT,
    ),
    false,
  );
  assert.equal(
    advancedCapabilityForArtifactFields({
      artifactType: "game",
      sourceFormat: LEGACY_GAME_BUNDLE_SOURCE_FORMAT,
      editorCapability: "game-editor",
    }),
    null,
  );
  // Raw html/js and unknown envelopes are neither current nor legacy.
  for (const format of [
    "html",
    "js",
    "text/html",
    "oceanleo.game-document.v2",
    "website-source@1",
    "docx",
    "",
  ]) {
    assert.equal(
      artifactSourceFormatIsCompatible("game", format),
      false,
      format || "empty",
    );
    assert.equal(gameSourceFormatAccess(format), null, format || "empty");
  }
});

function downloadableGame(sourceFormat) {
  const revisionId = "game-r1";
  return {
    artifactId: "game-a1",
    revisionId,
    artifactType: "game",
    sourceFormat,
    editorCapability: "game-editor",
    access: {
      canRead: true,
      canPreview: true,
      canEdit: false,
      canFork: false,
      canInsert: false,
      canReplace: false,
      canFavorite: false,
      canBind: false,
      canExportSource: true,
    },
    integrity: { ok: true, code: "ok", reason: "" },
    renditions: {
      source: {
        purpose: "source",
        revisionId,
        url: "https://signed.test/game.json",
        format: sourceFormat,
        mediaType: "application/json",
        digest: "sha256:game",
      },
    },
  };
}

test("legacy five-slot rows remain downloadable while unknown game formats fail closed", () => {
  const legacy = artifactDownloadPlanFor(
    downloadableGame(LEGACY_GAME_BUNDLE_SOURCE_FORMAT),
  );
  assert.deepEqual(
    legacy.map(({ purpose, mode }) => ({ purpose, mode })),
    [{ purpose: "source", mode: "source" }],
  );
  assert.deepEqual(
    artifactDownloadPlanFor(
      downloadableGame("oceanleo.game-unknown.v9"),
    ),
    [],
  );
});

test("game cards read the cover bitmap, never the playable bundle", () => {
  // `full` 是 application/json 的可玩信封，位图只能来自封面 `preview`。
  assert.deepEqual(viewerRenditionOrder("game"), ["preview", "full"]);
});

test("game routes to its own local route, not to an external embed", () => {
  assert.equal(editorRouteHintForArtifactCapability("game-editor"), "game");
  const registry = TRUSTED_EDITOR_REGISTRY.game;
  assert.equal(registry.routeType, "game");
  assert.equal(registry.routable, true);
  assert.equal(registry.featureId, "game_editing");
  assert.equal(registry.projectSchema, GAME_DOCUMENT_SOURCE_FORMAT);
  assert.deepEqual(
    [...registry.roundTrip],
    ["load", "mutate", "save", "reopen"],
  );
});

test("game artifacts land in their own library category", () => {
  assert.equal(libraryKindForArtifactType("game"), "game");
  assert.equal(artifactTypeForLibraryKind("game"), "game");
  // 并进 website 会让非 durable 回退路径把游戏送进 Next 源码编辑器。
  assert.notEqual(libraryKindForArtifactType("game"), "website");
});

test("GameRoute offers no upload entry and no code editing surface", () => {
  // D8：全站不提供任何上传/导入入口。adapter 不得声明 `upload`。
  assert.equal(/\bupload:\s*\{/.test(gameRouteCode), false);
  assert.equal(/accept:/.test(gameRouteCode), false);
  assert.equal(/type="file"/.test(gameRouteCode), false);
  assert.equal(/onFiles/.test(gameRouteCode), false);
  // 没有代码编辑面：不引入任何源码编辑器组件。
  for (const forbidden of ["CodeMirror", "monaco", "AceEditor", "codemirror"]) {
    assert.equal(gameRouteCode.includes(forbidden), false, forbidden);
  }
});

test("GameRoute rejects imported bundles and never renders its own iframe", () => {
  const origins = gameRouteCode.match(/GAME_REVISION_ORIGINS = \[([^\]]*)\]/);
  assert.ok(origins, "GAME_REVISION_ORIGINS must stay declared");
  assert.equal(origins[1].includes("import"), false);
  assert.ok(origins[1].includes("ai"));
  assert.ok(origins[1].includes("remix"));

  // 沙箱域隔离由宿主站的 UgcGameFrame 负责；共享包自己渲染 iframe 会绕过它。
  assert.equal(/<iframe/i.test(gameRouteCode), false);
  assert.equal(/srcdoc/i.test(gameRouteCode), false);
  assert.ok(gameRouteCode.includes("registerGamePreviewHost"));
});

test("GameRoute remix reuses the existing artifact fork endpoint", () => {
  // D7：血缘走 `POST /v1/artifacts/{id}:fork` 的 provenance.parent_revision_ids，
  // 不另建血缘表或第二套 remix 机制。
  assert.ok(gameRouteCode.includes("forkArtifact"));
  assert.equal(/remix_of|remixOf|lineage_table/.test(gameRouteCode), false);
});
