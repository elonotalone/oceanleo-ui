import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ARTIFACT_TYPES } from "../src/shell/artifact-contract.ts";
import {
  ARTIFACT_PLUGIN_INSTANCE_TYPES,
  ARTIFACT_SAVE_NATIVE_COVER_TYPES,
  ARTIFACT_SAVE_STEPS,
  ARTIFACT_SAVE_STEP_LABEL,
  PLUGIN_INSTANCE_SAVE_RULE,
  artifactSaveContractFor,
  artifactSaveStepMessage,
  artifactSaveTargetAllowed,
  artifactSaveTargetsFor,
  isArtifactSaveStepMessage,
  planArtifactSaveRenditions,
  pluginInstanceSaveRuleFor,
} from "../src/shell/doc-editors/artifact-save-contract.ts";
import {
  pluginInitialStateIds,
  pluginInstanceLibraryItem,
} from "../src/shell/plugin-initial-state.ts";
import { saveFileToLibraryWithDependencies } from "../src/shell/doc-editors/doc-io.ts";
import {
  renderDeckPreviewPng,
  renderGridPreviewPng,
  renderRichDocPreviewPng,
  richDocPreviewLines,
} from "../src/shell/doc-editors/editor-preview-raster.ts";

if (!globalThis.File) globalThis.File = NodeFile;

const source = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const blob = (name) => ({
  url: `https://cdn.test/${name}`,
  digest: createHash("sha256").update(name).digest("hex"),
});

const DELIVERY = blob("delivery.bin");
const MANIFEST = blob("project.json");
const BITMAP = blob("cover.png");

const purposes = (plan) => plan.renditions.map((entry) => entry.purpose);

test("every registered artifact type has one save contract entry", () => {
  for (const artifactType of ARTIFACT_TYPES) {
    assert.ok(
      artifactSaveContractFor(artifactType),
      `${artifactType} 缺少保存契约条目`,
    );
  }
  assert.equal(artifactSaveContractFor("not-a-type"), null);
});

test("native-cover types match matrix §3.2 exactly", () => {
  // 矩阵那 14 行的判据一个字没动。
  const matrixTypes = [...ARTIFACT_SAVE_NATIVE_COVER_TYPES]
    .filter((artifactType) => artifactType !== "interactive_doc")
    .sort();
  assert.deepEqual(matrixTypes, [
    "deck",
    "document",
    "grid",
    "website",
    "workflow",
  ]);
  // `interactive_doc` 不在矩阵里——矩阵写于 2026-07-2x，这一类是 `7bee5da`
  // (07-30) 才进 ARTIFACT_TYPES 的。它算原生 cover 的出处是自己的提交路径：
  // preview 位图可选，缺位图时返回 nativeCover=true
  // (interactive-doc-persistence.ts:509-521,592)。
  assert.deepEqual([...ARTIFACT_SAVE_NATIVE_COVER_TYPES].sort(), [
    "deck",
    "document",
    "grid",
    "interactive_doc",
    "website",
    "workflow",
  ]);
});

test("geo_map publishes the three renditions its commit path actually sends", () => {
  // geo-map-persistence.ts:640-690 发 preview + full + editor_manifest 三件，
  // 且 :472-489 缺 PNG 封面就判 geo-map-commit-rejected（C37 短边 ≥ 128 px）。
  // 所以 preview 是必需，不是「有就带上」。
  const contract = artifactSaveContractFor("geo_map");
  assert.deepEqual(contract.required, ["preview", "full", "editor_manifest"]);
  assert.equal(contract.displayablePrimary, "bitmap");
  // full 装工程 JSON 而不是位图：_SAVE_CONTRACT[GEO_MAP].full_media =
  // "application/json"（该文件 :654-660）。
  assert.equal(contract.fullSource, "delivery");

  const complete = planArtifactSaveRenditions("geo_map", {
    delivery: DELIVERY,
    editorManifest: MANIFEST,
    previewBitmap: BITMAP,
  });
  assert.equal(complete.ok, true);
  assert.deepEqual(purposes(complete), ["preview", "full", "editor_manifest"]);
  assert.equal(
    complete.renditions.find((entry) => entry.purpose === "full").url,
    DELIVERY.url,
  );
  assert.equal(complete.nativeCover, false);

  const withoutCover = planArtifactSaveRenditions("geo_map", {
    delivery: DELIVERY,
    editorManifest: MANIFEST,
  });
  assert.equal(withoutCover.ok, false, "geo_map 缺封面必须在本地就拒绝");
  assert.deepEqual(withoutCover.missing, ["preview"]);
});

test("interactive_doc keeps its cover optional and falls back to native bytes", () => {
  // interactive-doc-persistence.ts:523-529：editor_manifest + full 恒发，
  // preview 只在调用方给得出 previewBlob 时才带。把 preview 写成必需，
  // 这一类在没有 canvas 的环境里就永远提交不了 revision。
  const contract = artifactSaveContractFor("interactive_doc");
  assert.deepEqual(contract.required, ["full", "editor_manifest"]);
  assert.deepEqual(contract.optional, ["preview"]);
  assert.equal(contract.displayablePrimary, "native");

  const withoutCover = planArtifactSaveRenditions("interactive_doc", {
    delivery: DELIVERY,
    editorManifest: MANIFEST,
  });
  assert.equal(withoutCover.ok, true);
  assert.deepEqual(purposes(withoutCover), ["full", "editor_manifest"]);
  assert.equal(withoutCover.nativeCover, true);

  const withCover = planArtifactSaveRenditions("interactive_doc", {
    delivery: DELIVERY,
    editorManifest: MANIFEST,
    previewBitmap: BITMAP,
  });
  assert.deepEqual(purposes(withCover), ["preview", "full", "editor_manifest"]);
  assert.equal(withCover.displayablePrimary, "bitmap");
  assert.equal(withCover.nativeCover, false);

  const manifestOnly = planArtifactSaveRenditions("interactive_doc", {
    editorManifest: MANIFEST,
  });
  assert.equal(manifestOnly.ok, false);
  assert.deepEqual(manifestOnly.missing, ["full"]);
});

test("the contract declares which carriers may hold a plugin instance", () => {
  // 派生对账，不手抄名单：今天真有第一屏的插件（plugin-initial-states/，W23 定稿）
  // 落在哪些载体类型上，本表就必须给哪些类型开 plugin-instance 那一档。
  const carriers = new Set();
  for (const pluginId of pluginInitialStateIds()) {
    const instance = pluginInstanceLibraryItem(pluginId, { siteId: "test" });
    assert.ok(instance, `${pluginId} 造不出实例`);
    carriers.add(String(instance.meta.content_type));
  }
  assert.ok(carriers.size > 0, "一个第一屏都没有，这条会假绿");
  assert.deepEqual(
    [...ARTIFACT_PLUGIN_INSTANCE_TYPES].sort(),
    [...carriers].sort(),
    "契约表允许承载功能数据的载体，与真有第一屏的载体对不上",
  );

  for (const artifactType of ARTIFACT_TYPES) {
    const allowed = artifactSaveTargetAllowed(artifactType, "plugin-instance");
    assert.equal(
      allowed,
      carriers.has(artifactType),
      `${artifactType} 的 plugin-instance 一档判错了`,
    );
    // 素材那一档每种类型都有：编辑器编辑真素材的路一条都没关。
    assert.ok(artifactSaveTargetsFor(artifactType).includes("material"));
    assert.equal(
      pluginInstanceSaveRuleFor(artifactType),
      allowed ? PLUGIN_INSTANCE_SAVE_RULE : null,
    );
  }
  // 反面：不许把这条对账写成恒真。
  assert.equal(artifactSaveTargetAllowed("deck", "plugin-instance"), false);
  assert.equal(artifactSaveTargetAllowed("not-a-type", "material"), false);
  assert.deepEqual(artifactSaveTargetsFor("not-a-type"), []);
});

test("the plugin-instance tier never plans a revision", () => {
  // 这一档不发 revision（插件永不进货架）。走到 rendition 计划就是有人把用户填的
  // 东西当成了一件待发布的素材——返回一份「合法的空计划」只会让它安静地发出去。
  for (const artifactType of ARTIFACT_PLUGIN_INSTANCE_TYPES) {
    const plan = planArtifactSaveRenditions(
      artifactType,
      { delivery: DELIVERY, editorManifest: MANIFEST, previewBitmap: BITMAP },
      { saveTarget: "plugin-instance" },
    );
    assert.equal(plan.ok, false, artifactType);
    assert.deepEqual(plan.renditions, [], artifactType);
    assert.match(plan.error, /不发 revision/, artifactType);
  }
  // 不允许承载功能数据的类型，报的是另一件事：这种载体压根没有这一档。
  const refused = planArtifactSaveRenditions(
    "deck",
    { delivery: DELIVERY, editorManifest: MANIFEST },
    { saveTarget: "plugin-instance" },
  );
  assert.equal(refused.ok, false);
  assert.match(refused.error, /不允许承载功能数据/);
  // 缺省仍然是素材那一档：既有调用方一个字都不用改。
  assert.equal(
    planArtifactSaveRenditions("deck", {
      delivery: DELIVERY,
      editorManifest: MANIFEST,
    }).ok,
    true,
  );
  assert.equal(PLUGIN_INSTANCE_SAVE_RULE.publishesRevision, false);
  assert.equal(PLUGIN_INSTANCE_SAVE_RULE.buildsDeliverable, false);
  assert.equal(PLUGIN_INSTANCE_SAVE_RULE.rendersPreview, false);
  assert.equal(PLUGIN_INSTANCE_SAVE_RULE.bytesGoTo, "session-snapshot");
});

test("office saves never publish an editor-manifest-only payload", () => {
  // deck used to send exactly this and the backend answered
  // "revision publish requires a preview or full rendition" → 422.
  for (const artifactType of ["document", "grid", "deck"]) {
    const manifestOnly = planArtifactSaveRenditions(artifactType, {
      editorManifest: MANIFEST,
    });
    assert.equal(manifestOnly.ok, false, artifactType);
    assert.deepEqual(manifestOnly.missing, ["full"], artifactType);

    const withDelivery = planArtifactSaveRenditions(artifactType, {
      delivery: DELIVERY,
      editorManifest: MANIFEST,
    });
    assert.equal(withDelivery.ok, true, artifactType);
    assert.deepEqual(purposes(withDelivery), ["full", "editor_manifest"]);
    assert.equal(withDelivery.displayablePrimary, "delivery");
    // Matrix §3.2: the office bytes are an accepted native cover, but they do
    // not pass the read-side has_displayable_primary_cover() shelf check.
    assert.equal(withDelivery.nativeCover, true, artifactType);
  }
});

test("a rendered cover becomes the displayable primary for the office three", () => {
  for (const artifactType of ["document", "grid", "deck"]) {
    const plan = planArtifactSaveRenditions(artifactType, {
      delivery: DELIVERY,
      editorManifest: MANIFEST,
      previewBitmap: BITMAP,
    });
    assert.equal(plan.ok, true, artifactType);
    assert.deepEqual(purposes(plan), ["preview", "full", "editor_manifest"]);
    assert.equal(plan.displayablePrimary, "bitmap");
    const byPurpose = Object.fromEntries(
      plan.renditions.map((entry) => [entry.purpose, entry.url]),
    );
    // docx/xlsx/pptx can never pass _require_displayable_primary, so the cover
    // takes `preview`. `full` keeps the real deliverable — swapping it for the
    // bitmap would leave users unable to download their own document.
    assert.equal(byPurpose.preview, BITMAP.url, artifactType);
    assert.equal(byPurpose.full, DELIVERY.url, artifactType);
    assert.equal(byPurpose.editor_manifest, MANIFEST.url, artifactType);
    assert.equal(plan.nativeCover, false, artifactType);
  }
});

test("the design canvas may commit a composite without a project sidecar", () => {
  // design-composite-commit.ts has never carried editor JSON; matrix §3.2 row 2
  // only demands preview/full plus the scene closure.
  const plan = planArtifactSaveRenditions("composite_image", {
    delivery: DELIVERY,
    previewBitmap: BITMAP,
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(purposes(plan), ["preview", "full"]);
});

test("the game type declares matrix §4 renditions so the table has no hole", () => {
  const contract = artifactSaveContractFor("game");
  assert.deepEqual(contract.required, ["preview", "full", "editor_manifest"]);
  assert.equal(contract.fullSource, "delivery");
  const plan = planArtifactSaveRenditions("game", {
    delivery: DELIVERY,
    editorManifest: MANIFEST,
    previewBitmap: BITMAP,
  });
  assert.deepEqual(purposes(plan), ["preview", "full", "editor_manifest"]);
  assert.equal(
    planArtifactSaveRenditions("game", {
      delivery: DELIVERY,
      editorManifest: MANIFEST,
    }).ok,
    false,
  );
});

test("bitmap-primary types refuse to publish without their bitmap", () => {
  for (const artifactType of ["chart", "composite_image"]) {
    const withoutBitmap = planArtifactSaveRenditions(artifactType, {
      delivery: DELIVERY,
      editorManifest: MANIFEST,
    });
    assert.equal(withoutBitmap.ok, false, artifactType);
    assert.deepEqual(
      withoutBitmap.missing.slice(0, 2),
      ["preview", "full"],
      artifactType,
    );

    const complete = planArtifactSaveRenditions(artifactType, {
      delivery: DELIVERY,
      editorManifest: MANIFEST,
      previewBitmap: BITMAP,
    });
    assert.deepEqual(purposes(complete), [
      "preview",
      "full",
      "editor_manifest",
    ]);
    // Their delivery is scene/option JSON, never a user download, so the PNG
    // is what belongs in `full` — matching chart/composite_image on main today.
    assert.equal(
      complete.renditions.find((entry) => entry.purpose === "full").url,
      BITMAP.url,
      artifactType,
    );
  }
});

test("delivery-displayable types publish their delivery as full", () => {
  for (const artifactType of ["pdf", "video", "audio", "model_3d"]) {
    const plan = planArtifactSaveRenditions(artifactType, {
      delivery: DELIVERY,
    });
    assert.equal(plan.ok, true, artifactType);
    assert.deepEqual(purposes(plan), ["full"], artifactType);
    assert.equal(plan.renditions[0].url, DELIVERY.url, artifactType);
  }
});

test("matrix §3.2 'preview 或 full' is satisfied by either one alone", () => {
  // video renders server-side: at save time the client holds a timeline project
  // and one cover frame, never product bytes. Demanding `full` here is exactly
  // what left this type with no commit path at all.
  for (const artifactType of [
    "single_file_image",
    "vector_image",
    "pdf",
    "video",
    "audio",
    "model_3d",
    "website",
    "workflow",
  ]) {
    const coverOnly = planArtifactSaveRenditions(artifactType, {
      previewBitmap: BITMAP,
    });
    assert.equal(coverOnly.ok, true, artifactType);
    assert.deepEqual(purposes(coverOnly), ["preview"], artifactType);

    const deliveryOnly = planArtifactSaveRenditions(artifactType, {
      delivery: DELIVERY,
    });
    assert.equal(deliveryOnly.ok, true, artifactType);
    assert.deepEqual(purposes(deliveryOnly), ["full"], artifactType);

    const neither = planArtifactSaveRenditions(artifactType, {
      editorManifest: MANIFEST,
    });
    assert.equal(neither.ok, false, artifactType);
    assert.match(neither.error, /至少有一项/, artifactType);
  }
});

test("renditions without a digest are not accepted as evidence", () => {
  const plan = planArtifactSaveRenditions("deck", {
    delivery: { url: DELIVERY.url, digest: "" },
    editorManifest: MANIFEST,
  });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.missing, ["full"]);
});

test("every save failure names the step that broke", () => {
  for (const step of ARTIFACT_SAVE_STEPS) {
    const message = artifactSaveStepMessage(step, "存储服务超时");
    assert.ok(message.includes(ARTIFACT_SAVE_STEP_LABEL[step]), step);
    assert.ok(message.includes("存储服务超时"), step);
    assert.ok(isArtifactSaveStepMessage(message), step);
  }
  // Already-attributed messages must not be wrapped twice.
  const once = artifactSaveStepMessage("delivery-upload", "网络中断");
  assert.equal(artifactSaveStepMessage("revision-publish", once), once);
});

test("no editor falls back to the unattributed 「保存到我的库失败」 copy", () => {
  for (const path of [
    "../src/shell/doc-editors/use-grid-editor.ts",
    "../src/shell/doc-editors/use-deck-editor.ts",
    "../src/shell/doc-editors/use-rich-doc-editor.ts",
    "../src/shell/doc-editors/doc-io.ts",
    "../src/shell/advanced-routes/RichDocRoute.tsx",
    "../src/shell/advanced-routes/GridRoute.tsx",
  ]) {
    assert.doesNotMatch(source(path), /保存到我的库失败/, path);
  }
});

test("cover rendering degrades to null instead of throwing without a canvas", async () => {
  // Node has no DOM. A save must still reach the publish step; matrix §3.2 lets
  // the office three fall back to a native cover.
  assert.equal(await renderDeckPreviewPng({ slides: [{ elements: [] }] }), null);
  assert.equal(await renderGridPreviewPng([{ name: "S", rows: [[""]] }]), null);
  assert.equal(await renderRichDocPreviewPng({}, "标题"), null);
  assert.equal(await renderDeckPreviewPng({ slides: [] }), null);
});

test("rich doc cover extracts visible paragraph and heading text", () => {
  const lines = richDocPreviewLines({
    type: "doc",
    content: [
      { type: "heading", content: [{ type: "text", text: "季度计划" }] },
      { type: "paragraph", content: [{ type: "text", text: "第一段" }] },
      { type: "paragraph", content: [] },
      {
        type: "blockquote",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "引用" }] },
        ],
      },
    ],
  });
  assert.deepEqual(lines, [
    { text: "季度计划", heading: true },
    { text: "第一段", heading: false },
    { text: "引用", heading: false },
  ]);
  assert.equal(richDocPreviewLines(null).length, 0);
});

test("grid save submits a typed artifact revision instead of a creation", () => {
  const save = source("../src/shell/doc-editors/use-grid-editor.ts");
  assert.match(save, /artifactRevision: \{\s*artifactType: "grid"/);
  assert.match(save, /editorManifest: \{/);
  assert.match(save, /createPreview: \(\) =>\s*renderGridPreviewPng/);
  assert.match(save, /gridSavedItemForHandoff/);
});

test("RichDocRoute no longer hand-builds a docx-as-full rendition", () => {
  const route = source("../src/shell/advanced-routes/RichDocRoute.tsx");
  assert.doesNotMatch(route, /purpose: "full"/);
  assert.doesNotMatch(route, /commitAdvancedSavedRevision/);
  assert.match(
    source("../src/shell/doc-editors/use-rich-doc-editor.ts"),
    /artifactRevision: \{\s*artifactType: "document"/,
  );
});

test("doc-io publishes the contract renditions and verifies them on the way back", async () => {
  const published = [];
  const uploads = [];
  const dependencies = {
    now: () => new Date("2026-07-28T00:00:00.000Z"),
    uploadFile: async (file, options) => {
      const role = /:project:/.test(options.idempotencyKey)
        ? "project"
        : /:preview:/.test(options.idempotencyKey)
          ? "preview"
          : "delivery";
      uploads.push(role);
      return {
        ok: true,
        data: {
          file: {
            id: `upload-${role}`,
            url: `https://cdn.test/grid.${role}`,
            meta: {
              content_digest: createHash("sha256")
                .update(Buffer.from(await file.arrayBuffer()))
                .digest("hex"),
            },
          },
        },
      };
    },
    saveCreations: async () => {
      throw new Error("typed save must not register a legacy creation");
    },
    createArtifactRevision: async (artifactId, commit) => {
      published.push(commit);
      const rendition = (purpose, digest, url) => ({
        purpose,
        revisionId: "r2",
        url,
        format: purpose === "editor_manifest" ? "oceanleo.grid.v1" : "xlsx",
        mediaType:
          purpose === "editor_manifest"
            ? "application/json"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        digest: `sha256:${digest}`,
      });
      return {
        ok: true,
        data: {
          key: `artifact:${artifactId}:r2`,
          source: "artifact",
          id: artifactId,
          artifactId,
          revisionId: "r2",
          artifactType: "grid",
          title: "Sheet",
          kind: "sheet",
          siteId: "excel",
          url: "https://signed.test/grid-r2.xlsx",
          favorite: false,
          meta: {
            artifact_id: artifactId,
            revision_id: "r2",
            artifact_type: "grid",
          },
          artifact: {
            artifactId,
            revisionId: "r2",
            artifactType: "grid",
            sourceFormat: "xlsx",
            integrity: { ok: true, code: "ok", reason: "" },
            renditions: Object.fromEntries([
              [
                "source",
                rendition(
                  "source",
                  commit.source.digest,
                  "https://signed.test/grid-r2.xlsx",
                ),
              ],
              ...commit.renditions.map((entry) => [
                entry.purpose,
                rendition(
                  entry.purpose,
                  entry.digest,
                  `https://signed.test/grid-r2.${entry.purpose}`,
                ),
              ]),
            ]),
          },
        },
      };
    },
  };

  const result = await saveFileToLibraryWithDependencies(
    {
      item: {
        key: "artifact:grid-artifact:r1",
        source: "artifact",
        id: "grid-artifact",
        artifactId: "grid-artifact",
        revisionId: "r1",
        artifactType: "grid",
        title: "Sheet",
        kind: "sheet",
        siteId: "excel",
        url: "https://cdn.test/original.xlsx",
        favorite: false,
        meta: {
          artifact_id: "grid-artifact",
          revision_id: "r1",
          artifact_type: "grid",
        },
      },
      siteId: "excel",
      fallbackSite: "excel",
      createFile: async () =>
        new File([new Uint8Array([1, 2, 3])], "Sheet.xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      // Node has no canvas; the cover render legitimately produces nothing.
      createPreview: async () => null,
      sourceFormat: "xlsx",
      sourceMediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      title: "Sheet",
      mediaType: "sheet",
      kind: "sheet",
      idempotencyKey: "grid:contract:r1",
      meta: {},
      project: { schema: "oceanleo.grid.v1", data: { sheets: [] } },
      editorManifest: { id: "grid-editor", format: "oceanleo.grid.v1" },
      artifactRevision: { artifactType: "grid" },
    },
    dependencies,
  );

  assert.equal(result.error, "");
  assert.equal(result.ok, true);
  assert.equal(result.artifactId, "grid-artifact");
  assert.equal(result.revisionId, "r2");
  assert.equal(result.previousRevisionId, "r1");
  assert.deepEqual(uploads, ["project", "delivery"]);
  assert.equal(published.length, 1);
  assert.deepEqual(
    published[0].renditions.map((entry) => entry.purpose),
    ["full", "editor_manifest"],
  );
  // A cover that could not be rendered travels with the result instead of
  // disappearing; it is the usual root cause of a later 422.
  assert.match(result.previewWarning, /封面/);
});

test("A9-1: the five reachable types now declare a typed revision", () => {
  for (const [path, artifactType] of [
    ["../src/shell/media-editors/use-pdf-workbench.ts", "pdf"],
    ["../src/shell/media-editors/model3d-project.ts", "model_3d"],
    ["../src/shell/media-editors/use-audio-persistence.ts", "audio"],
    ["../src/shell/video-editor/persistence.ts", "video"],
    ["../src/shell/image-editor/editor-persistence.ts", "single_file_image"],
  ]) {
    assert.match(
      source(path),
      new RegExp(`artifactType: "${artifactType}"`),
      path,
    );
  }
});

test("A9-1: autosave input can carry a typed revision at the type level", () => {
  // SaveProjectWorkingHeadInput used to Omit artifactRevision outright, which is
  // why audio/video/image could not commit a revision even in principle.
  const docIo = source("../src/shell/doc-editors/doc-io.ts");
  const omitBlock = docIo.slice(
    docIo.indexOf("export interface SaveProjectWorkingHeadInput"),
    docIo.indexOf("export async function saveProjectWorkingHead"),
  );
  assert.doesNotMatch(omitBlock, /\| "artifactRevision"/);
  assert.doesNotMatch(omitBlock, /\| "createPreview"/);
  assert.doesNotMatch(omitBlock, /\| "preparedPreview"/);
  assert.doesNotMatch(omitBlock, /\| "editorManifest"/);
});

test("A9-1: blocked types are not faked into committing", () => {
  // vector_image / website / workflow have no accepted source format coming out
  // of their editors today. Inventing one would trade a 422 for silent
  // corruption, so no call site may declare them.
  const shell = [
    "../src/shell/design-composite-commit.ts",
    "../src/shell/advanced-routes/EmbeddedRoute.tsx",
    "../src/shell/image-editor/editor-persistence.ts",
    "../src/shell/video-editor/persistence.ts",
  ].map(source).join("\n");
  for (const artifactType of ["vector_image", "website", "workflow"]) {
    assert.doesNotMatch(
      shell,
      new RegExp(`artifactRevision:[\\s\\S]{0,120}artifactType: "${artifactType}"`),
      artifactType,
    );
  }
});

test("a project-only editor publishes the project JSON as its source", async () => {
  // audio/video hold no product bytes at save time; their project schema is an
  // accepted source.format (matrix §3.2 rows 10/11).
  let committed;
  const result = await saveFileToLibraryWithDependencies(
    {
      item: {
        key: "artifact:audio-artifact:r1",
        source: "artifact",
        id: "audio-artifact",
        artifactId: "audio-artifact",
        revisionId: "r1",
        artifactType: "audio",
        title: "Track",
        kind: "audio",
        siteId: "audio",
        url: "https://cdn.test/original.mp3",
        favorite: false,
        meta: {
          artifact_id: "audio-artifact",
          revision_id: "r1",
          artifact_type: "audio",
        },
      },
      siteId: "audio",
      fallbackSite: "audio",
      projectOnly: true,
      title: "Track",
      mediaType: "audio",
      kind: "audio",
      idempotencyKey: "audio:contract:r1",
      meta: {},
      project: {
        schema: "oceanleo.audio-project.v1",
        data: { sourceUrl: "https://cdn.test/original.mp3", operations: [] },
      },
      editorManifest: {
        id: "audio-editor",
        format: "oceanleo.audio-project.v1",
      },
      createPreview: async () => new Blob([new Uint8Array([7, 7, 7])]),
      artifactRevision: { artifactType: "audio", editor: "audio-v3" },
    },
    {
      now: () => new Date("2026-07-28T00:00:00.000Z"),
      uploadFile: async (file, options) => ({
        ok: true,
        data: {
          file: {
            url: /:preview:/.test(options.idempotencyKey)
              ? "https://cdn.test/audio.waveform.png"
              : "https://cdn.test/audio.project.json",
            meta: {
              content_digest: createHash("sha256")
                .update(Buffer.from(await file.arrayBuffer()))
                .digest("hex"),
            },
          },
        },
      }),
      saveCreations: async () => {
        throw new Error("typed save must not register a legacy creation");
      },
      createArtifactRevision: async (artifactId, commit) => {
        committed = commit;
        const rendition = (purpose, digest, url, mediaType, format) => ({
          purpose,
          revisionId: "r2",
          url,
          format,
          mediaType,
          digest: `sha256:${digest}`,
        });
        return {
          ok: true,
          data: {
            key: `artifact:${artifactId}:r2`,
            source: "artifact",
            id: artifactId,
            artifactId,
            revisionId: "r2",
            artifactType: "audio",
            title: "Track",
            kind: "audio",
            siteId: "audio",
            url: "https://signed.test/audio-r2.json",
            favorite: false,
            meta: {},
            artifact: {
              artifactId,
              revisionId: "r2",
              artifactType: "audio",
              sourceFormat: "oceanleo.audio-project.v1",
              integrity: { ok: true, code: "ok", reason: "" },
              renditions: Object.fromEntries([
                [
                  "source",
                  rendition(
                    "source",
                    commit.source.digest,
                    "https://signed.test/audio-r2.json",
                    "application/json",
                    "oceanleo.audio-project.v1",
                  ),
                ],
                ...commit.renditions.map((entry) => [
                  entry.purpose,
                  rendition(
                    entry.purpose,
                    entry.digest,
                    `https://signed.test/audio-r2.${entry.purpose}`,
                    entry.purpose === "preview"
                      ? "image/png"
                      : "application/json",
                    entry.purpose === "preview"
                      ? "png"
                      : "oceanleo.audio-project.v1",
                  ),
                ]),
              ]),
            },
          },
        };
      },
    },
  );

  assert.equal(result.error, "");
  assert.equal(result.ok, true);
  assert.equal(result.revisionId, "r2");
  assert.equal(committed.source.format, "oceanleo.audio-project.v1");
  assert.equal(committed.source.url, "https://cdn.test/audio.project.json");
  // The waveform cover is what satisfies "preview 或 full" for this type.
  assert.deepEqual(
    committed.renditions.map((entry) => entry.purpose),
    ["preview", "editor_manifest"],
  );
});

test("a sidecar-less editor still publishes a typed revision", async () => {
  // pdf keeps no project JSON; the edited bytes are both source and full.
  let committed;
  const result = await saveFileToLibraryWithDependencies(
    {
      item: {
        key: "artifact:pdf-artifact:r1",
        source: "artifact",
        id: "pdf-artifact",
        artifactId: "pdf-artifact",
        revisionId: "r1",
        artifactType: "pdf",
        title: "Report",
        kind: "pdf",
        siteId: "oceanleo",
        url: "https://cdn.test/original.pdf",
        favorite: false,
        meta: {
          artifact_id: "pdf-artifact",
          revision_id: "r1",
          artifact_type: "pdf",
        },
      },
      siteId: "oceanleo",
      fallbackSite: "oceanleo",
      file: new File([new Uint8Array([37, 80, 68, 70])], "Report.pdf", {
        type: "application/pdf",
      }),
      sourceFormat: "pdf",
      sourceMediaType: "application/pdf",
      title: "Report",
      mediaType: "doc",
      kind: "pdf",
      idempotencyKey: "pdf:contract:r1",
      meta: {},
      deliveryProjectSchema: "pdf-binary@1",
      artifactRevision: { artifactType: "pdf", editor: "pdf-native-v1" },
    },
    {
      now: () => new Date("2026-07-28T00:00:00.000Z"),
      uploadFile: async (file) => ({
        ok: true,
        data: {
          file: {
            url: "https://cdn.test/report.pdf",
            meta: {
              content_digest: createHash("sha256")
                .update(Buffer.from(await file.arrayBuffer()))
                .digest("hex"),
            },
          },
        },
      }),
      saveCreations: async () => {
        throw new Error("typed save must not register a legacy creation");
      },
      createArtifactRevision: async (artifactId, commit) => {
        committed = commit;
        return {
          ok: true,
          data: {
            key: `artifact:${artifactId}:r2`,
            source: "artifact",
            id: artifactId,
            artifactId,
            revisionId: "r2",
            artifactType: "pdf",
            title: "Report",
            kind: "pdf",
            siteId: "oceanleo",
            url: "https://signed.test/report-r2.pdf",
            favorite: false,
            meta: {},
            artifact: {
              artifactId,
              revisionId: "r2",
              artifactType: "pdf",
              sourceFormat: "pdf",
              integrity: { ok: true, code: "ok", reason: "" },
              renditions: Object.fromEntries([
                [
                  "source",
                  {
                    purpose: "source",
                    revisionId: "r2",
                    url: "https://signed.test/report-r2.pdf",
                    format: "pdf",
                    mediaType: "application/pdf",
                    digest: `sha256:${commit.source.digest}`,
                  },
                ],
                ...commit.renditions.map((entry) => [
                  entry.purpose,
                  {
                    purpose: entry.purpose,
                    revisionId: "r2",
                    url: "https://signed.test/report-r2.pdf",
                    format: "pdf",
                    mediaType: "application/pdf",
                    digest: `sha256:${entry.digest}`,
                  },
                ]),
              ]),
            },
          },
        };
      },
    },
  );

  assert.equal(result.error, "");
  assert.equal(result.ok, true);
  assert.equal(committed.source.format, "pdf");
  assert.deepEqual(
    committed.renditions.map((entry) => entry.purpose),
    ["full"],
  );
});

test("A12: the host refuses a design document posing as vector/workflow source", async () => {
  const { embeddedTypedCommitAccepts, isEmbeddedTypedCommitType } =
    await import("../src/shell/design-composite-commit.ts");

  // composite keeps its own path; the three new types get the fail-closed one.
  assert.equal(isEmbeddedTypedCommitType("composite_image"), false);
  for (const artifactType of ["vector_image", "workflow", "website"]) {
    assert.equal(isEmbeddedTypedCommitType(artifactType), true, artifactType);
    // V1 reproduced this exact 422: "source format is incompatible with
    // artifact type". Refusing locally is the whole point of A12 route (b).
    assert.equal(
      embeddedTypedCommitAccepts(
        artifactType,
        "oceanleo.design-document.v1",
      ),
      false,
      artifactType,
    );
  }
  assert.equal(embeddedTypedCommitAccepts("vector_image", "svg"), true);
  assert.equal(embeddedTypedCommitAccepts("vector_image", "svg+xml"), true);
  assert.equal(
    embeddedTypedCommitAccepts("workflow", "oceanleo.workflow.v1"),
    true,
  );
  // A12-W: the backend does accept bare `json` for workflow, but relabelling a
  // design document as `json` is the same type-into-tag degradation the ruling
  // forbids. The host is deliberately stricter. Production has 211 workflow
  // revisions and none of them uses `json`, so this refuses nothing real.
  assert.equal(embeddedTypedCommitAccepts("workflow", "json"), false);
  assert.equal(
    embeddedTypedCommitAccepts("website", "website-source@1"),
    true,
  );
  // A raster format is not a vector source either.
  assert.equal(embeddedTypedCommitAccepts("vector_image", "png"), false);
});

test("A12: the protocol validator admits the new types without loosening composite", async () => {
  const { asEditorToHostMessage, EDITOR_PROTOCOL } = await import(
    "../src/shell/editor-protocol.ts"
  );
  const base = {
    protocol: EDITOR_PROTOCOL,
    type: "artifact-updated",
    url: "https://asset.oceanleo.com/x/preview.png",
    previewUrl: "https://asset.oceanleo.com/x/preview.png",
    title: "T",
    saveId: "s1",
    instanceId: "i1",
  };
  const accept = (meta, revision) =>
    asEditorToHostMessage({ ...base, revision, meta }, "i1");

  // composite still requires the full design-document + scene field set.
  const compositeMeta = {
    requires_typed_artifact_commit: true,
    artifact_type: "composite_image",
    editor_project_schema: "oceanleo.design-document.v1",
    source_format: "oceanleo.design-document.v1",
    artifact_id: "a1",
    expected_artifact_revision_id: "r1",
    editor_project_url: "https://asset.oceanleo.com/x/doc.json",
    design_document_url: "https://asset.oceanleo.com/x/doc.json",
    design_document_revision: 3,
    preview_revision: 3,
    preview_static_frame: "final",
  };
  assert.ok(accept(compositeMeta, 3));
  // Drop one composite-only field and it must still be refused.
  const { design_document_revision, ...missingRevision } = compositeMeta;
  assert.equal(accept(missingRevision, 3), null);

  // vector_image does not carry design_document_* and must be admitted.
  assert.ok(
    accept(
      {
        requires_typed_artifact_commit: true,
        artifact_type: "vector_image",
        source_format: "svg",
        artifact_id: "a1",
        expected_artifact_revision_id: "r1",
        editor_project_url: "https://asset.oceanleo.com/x/art.svg",
        preview_static_frame: "final",
      },
      3,
    ),
  );
  // An unknown artifact type is still refused.
  assert.equal(
    accept(
      {
        requires_typed_artifact_commit: true,
        artifact_type: "single_file_image",
        source_format: "png",
        artifact_id: "a1",
        expected_artifact_revision_id: "r1",
        editor_project_url: "https://asset.oceanleo.com/x/a.png",
        preview_static_frame: "final",
      },
      3,
    ),
    null,
  );
});

test("A13: the host adopts a server-materialised revision instead of re-committing", () => {
  // website materialises its revision server-side and deliberately omits
  // requires_typed_artifact_commit; committing again would double-publish.
  const host = source("../src/shell/use-embed-editor-messages.ts");
  assert.match(host, /getArtifactItem\(\s*declaredArtifactId,/);
  assert.match(host, /projection\.revisionId === declaredRevisionId/);
  assert.match(host, /savedItem = projection;/);
});

test("a dropped contract rendition is refused at the verify step", async () => {
  const result = await saveFileToLibraryWithDependencies(
    {
      item: {
        key: "artifact:deck-artifact:r1",
        source: "artifact",
        id: "deck-artifact",
        artifactId: "deck-artifact",
        revisionId: "r1",
        artifactType: "deck",
        title: "Deck",
        kind: "ppt",
        siteId: "ppt",
        url: "https://cdn.test/original.pptx",
        favorite: false,
        meta: {
          artifact_id: "deck-artifact",
          revision_id: "r1",
          artifact_type: "deck",
        },
      },
      siteId: "ppt",
      fallbackSite: "ppt",
      createFile: async () =>
        new File([new Uint8Array([4, 5, 6])], "Deck.pptx", {
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        }),
      sourceFormat: "pptx",
      sourceMediaType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      title: "Deck",
      mediaType: "ppt",
      kind: "deck",
      idempotencyKey: "deck:verify:r1",
      meta: {},
      project: { schema: "oceanleo.deck.v1", data: {} },
      editorManifest: { id: "deck-editor", format: "oceanleo.deck.v1" },
      artifactRevision: { artifactType: "deck" },
    },
    {
      now: () => new Date("2026-07-28T00:00:00.000Z"),
      uploadFile: async (file, options) => ({
        ok: true,
        data: {
          file: {
            url: /:project:/.test(options.idempotencyKey)
              ? "https://cdn.test/deck.project.json"
              : "https://cdn.test/deck.pptx",
            meta: {
              content_digest: createHash("sha256")
                .update(Buffer.from(await file.arrayBuffer()))
                .digest("hex"),
            },
          },
        },
      }),
      saveCreations: async () => {
        throw new Error("must not register a creation");
      },
      // Server silently drops `full`; the shelf would then have no thumbnail.
      createArtifactRevision: async (artifactId, commit) => ({
        ok: true,
        data: {
          key: `artifact:${artifactId}:r2`,
          source: "artifact",
          id: artifactId,
          artifactId,
          revisionId: "r2",
          artifactType: "deck",
          title: "Deck",
          kind: "ppt",
          siteId: "ppt",
          url: "https://signed.test/deck-r2.pptx",
          favorite: false,
          meta: {},
          artifact: {
            artifactId,
            revisionId: "r2",
            artifactType: "deck",
            sourceFormat: "pptx",
            integrity: { ok: true, code: "ok", reason: "" },
            renditions: {
              source: {
                purpose: "source",
                revisionId: "r2",
                url: "https://signed.test/deck-r2.pptx",
                format: "pptx",
                mediaType:
                  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                digest: `sha256:${commit.source.digest}`,
              },
              editor_manifest: {
                purpose: "editor_manifest",
                revisionId: "r2",
                url: "https://signed.test/deck-r2.json",
                format: "oceanleo.deck.v1",
                mediaType: "application/json",
                digest: `sha256:${
                  commit.renditions.find(
                    (entry) => entry.purpose === "editor_manifest",
                  ).digest
                }`,
              },
            },
          },
        },
      }),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.failedStep, "revision-verify");
  assert.match(result.error, /full/);
  assert.ok(isArtifactSaveStepMessage(result.error));
});
