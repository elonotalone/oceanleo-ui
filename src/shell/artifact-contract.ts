/**
 * Typed artifact control-plane contract.
 *
 * URLs are short-lived renditions. `artifactId + revisionId` is the identity
 * carried across Preview, Edit, Insert, Replace, favorites and bindings.
 */

/**
 * Built-in shelf choices. This is presentation data, not an allowlist:
 * transport accepts any non-empty self-reported artifact type.
 */
export const ARTIFACT_TYPES = [
  "single_file_image",
  "composite_image",
  "vector_image",
  "chart",
  "document",
  "grid",
  "deck",
  "pdf",
  "website",
  "video",
  "audio",
  "model_3d",
  "workflow",
  "game",
] as const;

export type BuiltInArtifactType = (typeof ARTIFACT_TYPES)[number];
export type ArtifactType = string;

/** New game revisions carry one complete, self-contained HTML document. */
export const GAME_DOCUMENT_SOURCE_FORMAT = "oceanleo.game-document.v1";
/** Retired five-slot carriers remain identifiable for stored-row reads/downloads only. */
export const LEGACY_GAME_BUNDLE_SOURCE_FORMAT = "oceanleo.game-bundle.v1";

export type GameSourceFormatAccess =
  | "current"
  | "legacy-read-only";

export function gameSourceFormatAccess(
  sourceFormat: unknown,
): GameSourceFormatAccess | null {
  const normalized = String(sourceFormat || "").trim().toLowerCase();
  if (normalized === GAME_DOCUMENT_SOURCE_FORMAT) return "current";
  if (normalized === LEGACY_GAME_BUNDLE_SOURCE_FORMAT) {
    return "legacy-read-only";
  }
  return null;
}

export const ADVANCED_EDITOR_ADAPTER_IDS = [
  "video-timeline",
  "website",
  "design-canvas",
  "deck",
  "richdoc",
  "grid",
  "image",
  "pdf",
  "audio",
  "chart-editor@1",
  "video-canvas",
  "threed",
  "game",
] as const;

export type AdvancedEditorAdapterId =
  (typeof ADVANCED_EDITOR_ADAPTER_IDS)[number];

export type AdvancedCapabilityRequirementKind = "none" | "scene" | "manifest";
export type AdvancedCapabilityDependencyClosure = "not_required" | "complete";
export type ArtifactAccessMode = "preview" | "source" | "export";

export interface AdvancedCapabilityPreviewSourceRule {
  previewPurposes: readonly ("preview" | "full")[];
  editorPurpose: "source";
  sameRevisionRequired: true;
  sourceDigestRequired: true;
  derivedFromSourceDigestRequired: true;
  renderedSourceSubstitution: "forbidden";
}

export interface AdvancedCapabilityDownloadRule {
  preferredPurpose: "source" | "full";
  preferredMode: Extract<ArtifactAccessMode, "source" | "export">;
  fallbackPurposes: readonly ("full" | "preview")[];
  fallbackMode: "export";
}

export interface AdvancedCapabilityRequirement {
  kind: AdvancedCapabilityRequirementKind;
  schema: string | null;
  requiredPaths: readonly string[];
  dependencyClosure: AdvancedCapabilityDependencyClosure;
}

export interface AdvancedCapabilityArtifactBinding {
  artifactType: ArtifactType;
  editorCapabilities: readonly string[];
}

export interface AdvancedCapabilityContractEntry {
  featureId: AdvancedFeatureId;
  artifactType: ArtifactType;
  sourceFormat: string;
  sourceMediaType: string;
  editorCapability: string;
  artifactBindings: readonly AdvancedCapabilityArtifactBinding[];
  adapter: AdvancedEditorAdapterId;
  projectSchema: string;
  editability: Exclude<ArtifactEditability, "view_only">;
  sourceIntegrity: "content_addressed" | "complete_dependency_closure";
  openMode: "native-file" | "structured-project";
  previewSource: AdvancedCapabilityPreviewSourceRule;
  download: AdvancedCapabilityDownloadRule;
  requirement: AdvancedCapabilityRequirement;
}

export type AdvancedCapabilityMachineContractEntry = Omit<
  AdvancedCapabilityContractEntry,
  "artifactBindings"
>;

const ADVANCED_CAPABILITY_ROWS = [
  {
    featureId: "video_editing",
    artifactType: "video",
    sourceFormat: "mp4",
    sourceMediaType: "video/mp4",
    editorCapability: "video-timeline",
    artifactBindings: [
      { artifactType: "video", editorCapabilities: ["video-timeline"] },
    ],
    adapter: "video-timeline",
    projectSchema: "oceanleo.timeline.v1",
    editability: "bounded",
    sourceIntegrity: "content_addressed",
    openMode: "native-file",
    previewPurposes: ["full", "preview"],
    requirement: {
      kind: "none",
      schema: null,
      requiredPaths: [],
      dependencyClosure: "not_required",
    },
  },
  {
    featureId: "website_finetuning",
    artifactType: "website",
    sourceFormat: "website-source@1",
    sourceMediaType: "application/json",
    editorCapability: "website-editor",
    artifactBindings: [
      { artifactType: "website", editorCapabilities: ["website-editor"] },
    ],
    adapter: "website",
    projectSchema: "website-source@1",
    editability: "native",
    sourceIntegrity: "complete_dependency_closure",
    openMode: "structured-project",
    previewPurposes: ["preview", "full"],
    requirement: {
      kind: "manifest",
      schema: "website-source@1",
      requiredPaths: ["pages", "sections"],
      dependencyClosure: "complete",
    },
  },
  {
    featureId: "design_canvas",
    artifactType: "composite_image",
    sourceFormat: "oceanleo.design-document.v1",
    sourceMediaType: "application/json",
    editorCapability: "design-canvas",
    artifactBindings: [
      {
        artifactType: "composite_image",
        editorCapabilities: ["design-canvas"],
      },
      { artifactType: "workflow", editorCapabilities: ["design-canvas"] },
      /**
       * 矢量素材（svg/ai/eps）走图层工程适配器，不走位图适配器。
       *
       * 这条绑定原先挂在 `image_editing` 上，于是 svg 被 `oceanleo.fabric-image.v1`
       * 当成一张位图打开：能裁切调色，改不了锚点、配不了色、换不了图形——
       * 矢量该有的编辑能力一条都拿不到。与「能不能改字」无关。
       */
      { artifactType: "vector_image", editorCapabilities: ["vector-editor"] },
    ],
    adapter: "design-canvas",
    projectSchema: "oceanleo.design-document.v1",
    editability: "native",
    sourceIntegrity: "content_addressed",
    openMode: "structured-project",
    previewPurposes: ["preview", "full"],
    requirement: {
      kind: "scene",
      schema: "oceanleo.design-document.v1",
      requiredPaths: ["document", "document.elements"],
      dependencyClosure: "complete",
    },
  },
  {
    featureId: "presentation_editing",
    artifactType: "deck",
    sourceFormat: "pptx",
    sourceMediaType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    editorCapability: "deck-editor",
    artifactBindings: [
      {
        artifactType: "deck",
        editorCapabilities: ["deck-editor", "office-editor"],
      },
    ],
    adapter: "deck",
    projectSchema: "oceanleo.deck.v1",
    editability: "native",
    sourceIntegrity: "content_addressed",
    openMode: "native-file",
    previewPurposes: ["full", "preview"],
    requirement: {
      kind: "none",
      schema: null,
      requiredPaths: [],
      dependencyClosure: "not_required",
    },
  },
  {
    featureId: "document_editing",
    artifactType: "document",
    sourceFormat: "docx",
    sourceMediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    editorCapability: "richdoc-editor",
    artifactBindings: [
      {
        artifactType: "document",
        editorCapabilities: [
          "richdoc-editor",
          "document-editor",
          "office-editor",
        ],
      },
    ],
    adapter: "richdoc",
    projectSchema: "tiptap-json@1",
    editability: "native",
    sourceIntegrity: "content_addressed",
    openMode: "native-file",
    previewPurposes: ["full", "preview"],
    requirement: {
      kind: "none",
      schema: null,
      requiredPaths: [],
      dependencyClosure: "not_required",
    },
  },
  {
    featureId: "spreadsheet_editing",
    artifactType: "grid",
    sourceFormat: "xlsx",
    sourceMediaType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    editorCapability: "grid-editor",
    artifactBindings: [
      {
        artifactType: "grid",
        editorCapabilities: ["grid-editor", "office-editor"],
      },
    ],
    adapter: "grid",
    projectSchema: "oceanleo.grid.v1",
    editability: "native",
    sourceIntegrity: "content_addressed",
    openMode: "native-file",
    previewPurposes: ["full", "preview"],
    requirement: {
      kind: "none",
      schema: null,
      requiredPaths: [],
      dependencyClosure: "not_required",
    },
  },
  {
    featureId: "image_editing",
    artifactType: "single_file_image",
    sourceFormat: "webp",
    sourceMediaType: "image/webp",
    editorCapability: "image-editor",
    artifactBindings: [
      {
        artifactType: "single_file_image",
        editorCapabilities: ["image-editor", "raster-image"],
      },
      {
        artifactType: "composite_image",
        editorCapabilities: ["composite-image-editor"],
      },
    ],
    adapter: "image",
    projectSchema: "oceanleo.fabric-image.v1",
    editability: "bounded",
    sourceIntegrity: "content_addressed",
    openMode: "native-file",
    previewPurposes: ["preview", "full"],
    requirement: {
      kind: "none",
      schema: null,
      requiredPaths: [],
      dependencyClosure: "not_required",
    },
  },
  {
    featureId: "pdf_editing",
    artifactType: "pdf",
    sourceFormat: "pdf",
    sourceMediaType: "application/pdf",
    editorCapability: "pdf-editor",
    artifactBindings: [
      { artifactType: "pdf", editorCapabilities: ["pdf-editor"] },
    ],
    adapter: "pdf",
    projectSchema: "pdf-binary@1",
    editability: "bounded",
    sourceIntegrity: "content_addressed",
    openMode: "native-file",
    previewPurposes: ["full", "preview"],
    requirement: {
      kind: "none",
      schema: null,
      requiredPaths: [],
      dependencyClosure: "not_required",
    },
  },
  {
    featureId: "audio_editing",
    artifactType: "audio",
    sourceFormat: "mp3",
    sourceMediaType: "audio/mpeg",
    editorCapability: "audio-editor",
    artifactBindings: [
      { artifactType: "audio", editorCapabilities: ["audio-editor"] },
    ],
    adapter: "audio",
    projectSchema: "oceanleo.audio-project.v1",
    editability: "bounded",
    sourceIntegrity: "content_addressed",
    openMode: "native-file",
    previewPurposes: ["full", "preview"],
    requirement: {
      kind: "none",
      schema: null,
      requiredPaths: [],
      dependencyClosure: "not_required",
    },
  },
  {
    featureId: "chart_editing",
    artifactType: "chart",
    sourceFormat: "oceanleo.chart.v1",
    sourceMediaType: "application/json",
    editorCapability: "chart-editor",
    artifactBindings: [
      { artifactType: "chart", editorCapabilities: ["chart-editor"] },
    ],
    adapter: "chart-editor@1",
    projectSchema: "oceanleo.chart.v1",
    editability: "native",
    sourceIntegrity: "content_addressed",
    openMode: "structured-project",
    previewPurposes: ["preview", "full"],
    requirement: {
      kind: "manifest",
      schema: "oceanleo.chart.v1",
      requiredPaths: ["option", "option.series"],
      dependencyClosure: "not_required",
    },
  },
  {
    featureId: "video_canvas",
    artifactType: "workflow",
    sourceFormat: "oceanleo.video.project.v2",
    sourceMediaType: "application/json",
    editorCapability: "video-canvas",
    artifactBindings: [
      { artifactType: "workflow", editorCapabilities: ["video-canvas"] },
    ],
    adapter: "video-canvas",
    projectSchema: "oceanleo.video-canvas.v1",
    editability: "native",
    sourceIntegrity: "complete_dependency_closure",
    openMode: "structured-project",
    previewPurposes: ["preview", "full"],
    requirement: {
      kind: "manifest",
      schema: "oceanleo.video.project.v2",
      requiredPaths: ["schemaVersion", "headVersionId", "versions", "assets"],
      dependencyClosure: "complete",
    },
  },
  {
    featureId: "model_3d",
    artifactType: "model_3d",
    sourceFormat: "gltf",
    sourceMediaType: "model/gltf+json",
    editorCapability: "model-3d-editor",
    artifactBindings: [
      { artifactType: "model_3d", editorCapabilities: ["model-3d-editor"] },
    ],
    adapter: "threed",
    projectSchema: "oceanleo.model-view@1",
    editability: "bounded",
    sourceIntegrity: "complete_dependency_closure",
    openMode: "native-file",
    previewPurposes: ["full", "preview"],
    requirement: {
      kind: "manifest",
      schema: "gltf/2.0",
      requiredPaths: ["asset.version", "buffers"],
      dependencyClosure: "complete",
    },
  },
  {
    /**
     * 用户生成的游戏（LeoPlay）。
     *
     * `game_editing` 而不是 `game_authoring`：这个 id 是
     * `reviewed_material_catalog.EXPECTED_CLASS_CONTRACT` 与 catalog-release
     * `expected_contracts` 的连接键，两处都已按这个拼写落地。
     *
     * 产物是 `oceanleo.game-document.v1` **JSON 信封**，不是裸 `text/html`：
     * `media_rehost._BLOCKED_MIME` 与
     * `typed_artifact_repository._validate_upload_media_type` 都拒收 text/html
     * （`<!doctype html` 正文另有 active-content 拒收），而那两份名单正是
     * `policy:security.untrusted-content-domain` 的落点，所以是契约让路而不是名单让路。
     * `source` 是完整 HTML 文档；沙箱域原样装载，不再补骨架或固定槽位。
     *
     * 刻意**不**复用 `website` 的 capability：`website-editor` 背后是 Next 源码
     * 工作台（CAS 源码树 + dev preview），把它接到一份自包含 bundle 上是错的
     * （`01-decisions.md` D7）。两者同为 JSON 信封只是形态巧合。
     */
    featureId: "game_editing",
    artifactType: "game",
    sourceFormat: GAME_DOCUMENT_SOURCE_FORMAT,
    sourceMediaType: "application/json",
    editorCapability: "game-editor",
    artifactBindings: [
      { artifactType: "game", editorCapabilities: ["game-editor"] },
    ],
    adapter: "game",
    projectSchema: GAME_DOCUMENT_SOURCE_FORMAT,
    editability: "bounded",
    sourceIntegrity: "content_addressed",
    // 与其他 JSON 信封能力（website / chart / design canvas / video canvas）一致：
    // 下载解析成 `full` 的导出，永远不交付裸 source 字节。
    openMode: "structured-project",
    previewPurposes: ["preview", "full"],
    requirement: {
      kind: "none",
      schema: null,
      requiredPaths: [],
      dependencyClosure: "not_required",
    },
  },
] as const;

export type AdvancedFeatureId =
  (typeof ADVANCED_CAPABILITY_ROWS)[number]["featureId"];

const SOURCE_DOWNLOAD_RULE: AdvancedCapabilityDownloadRule = Object.freeze({
  preferredPurpose: "source",
  preferredMode: "source",
  fallbackPurposes: Object.freeze(["full", "preview"] as const),
  fallbackMode: "export",
});

const RENDERED_DOWNLOAD_RULE: AdvancedCapabilityDownloadRule = Object.freeze({
  preferredPurpose: "full",
  preferredMode: "export",
  fallbackPurposes: Object.freeze(["preview"] as const),
  fallbackMode: "export",
});

/**
 * The canonical shared capability plane. Feature identity, accepted typed
 * artifact bindings and adapter identity are declared here once; all runtime
 * registries and presentation catalogs are projections of this object.
 */
export const ADVANCED_CAPABILITY_MATRIX: readonly AdvancedCapabilityContractEntry[] =
  Object.freeze(
    ADVANCED_CAPABILITY_ROWS.map(
      ({
        previewPurposes,
        artifactBindings,
        requirement,
        ...row
      }): AdvancedCapabilityContractEntry =>
        Object.freeze({
          ...row,
          artifactBindings: Object.freeze(
            artifactBindings.map((binding) =>
              Object.freeze({
                ...binding,
                editorCapabilities: Object.freeze([
                  ...binding.editorCapabilities,
                ]),
              }),
            ),
          ),
          requirement: Object.freeze({
            ...requirement,
            requiredPaths: Object.freeze([...requirement.requiredPaths]),
          }),
          previewSource: Object.freeze({
            previewPurposes: Object.freeze([...previewPurposes]),
            editorPurpose: "source",
            sameRevisionRequired: true,
            sourceDigestRequired: true,
            derivedFromSourceDigestRequired: true,
            renderedSourceSubstitution: "forbidden",
          }),
          download:
            row.openMode === "structured-project"
              ? RENDERED_DOWNLOAD_RULE
              : SOURCE_DOWNLOAD_RULE,
        }),
    ),
  );

/** Backward-compatible name; both exports intentionally share object identity. */
export const ADVANCED_CAPABILITY_CONTRACT = ADVANCED_CAPABILITY_MATRIX;

const ADVANCED_CAPABILITY_BY_FEATURE = new Map<
  AdvancedFeatureId,
  AdvancedCapabilityContractEntry
>();
const ADVANCED_CAPABILITY_BY_ADAPTER = new Map<
  AdvancedEditorAdapterId,
  AdvancedCapabilityContractEntry
>();
const ADVANCED_CAPABILITY_BY_BINDING = new Map<
  string,
  AdvancedCapabilityContractEntry
>();

function advancedBindingKey(
  artifactType: ArtifactType,
  editorCapability: string,
): string {
  return `${artifactType}\u0000${editorCapability.trim().toLowerCase()}`;
}

for (const entry of ADVANCED_CAPABILITY_MATRIX) {
  if (ADVANCED_CAPABILITY_BY_FEATURE.has(entry.featureId)) {
    throw new Error(`Duplicate advanced feature id: ${entry.featureId}`);
  }
  if (ADVANCED_CAPABILITY_BY_ADAPTER.has(entry.adapter)) {
    throw new Error(`Duplicate advanced adapter target: ${entry.adapter}`);
  }
  ADVANCED_CAPABILITY_BY_FEATURE.set(entry.featureId, entry);
  ADVANCED_CAPABILITY_BY_ADAPTER.set(entry.adapter, entry);

  const canonicalBinding = entry.artifactBindings.find(
    (binding) =>
      binding.artifactType === entry.artifactType &&
      binding.editorCapabilities.includes(entry.editorCapability),
  );
  if (!canonicalBinding) {
    throw new Error(
      `Advanced feature ${entry.featureId} omits its canonical typed binding`,
    );
  }
  for (const binding of entry.artifactBindings) {
    for (const editorCapability of binding.editorCapabilities) {
      const key = advancedBindingKey(binding.artifactType, editorCapability);
      const existing = ADVANCED_CAPABILITY_BY_BINDING.get(key);
      if (existing && existing.featureId !== entry.featureId) {
        throw new Error(
          `Typed artifact binding ${binding.artifactType}/${editorCapability} maps to multiple features`,
        );
      }
      ADVANCED_CAPABILITY_BY_BINDING.set(key, entry);
    }
  }
}

if (ADVANCED_CAPABILITY_MATRIX.length !== ADVANCED_EDITOR_ADAPTER_IDS.length) {
  throw new Error(
    "The shared advanced capability matrix and adapter list must have equal lengths",
  );
}

export function advancedCapabilityContractPayload(): {
  schema: "oceanleo.advanced-capability-contract.v1";
  version: 1;
  roundTripCapabilities: readonly ["load", "mutate", "save", "reopen"];
  capabilities: readonly AdvancedCapabilityMachineContractEntry[];
} {
  return {
    schema: "oceanleo.advanced-capability-contract.v1",
    version: 1,
    roundTripCapabilities: ["load", "mutate", "save", "reopen"],
    capabilities: ADVANCED_CAPABILITY_MATRIX.map(
      ({ artifactBindings: _artifactBindings, ...entry }) => entry,
    ),
  };
}

export function advancedCapabilityForFeatureId(
  featureId: string | null | undefined,
): AdvancedCapabilityContractEntry | null {
  return (
    ADVANCED_CAPABILITY_BY_FEATURE.get(
      String(featureId || "").trim() as AdvancedFeatureId,
    ) || null
  );
}

export function advancedCapabilityForAdapter(
  adapter: string | null | undefined,
): AdvancedCapabilityContractEntry | null {
  return (
    ADVANCED_CAPABILITY_BY_ADAPTER.get(
      String(adapter || "").trim() as AdvancedEditorAdapterId,
    ) || null
  );
}

export function advancedCapabilityForArtifactFields(input: {
  artifactType: ArtifactType;
  sourceFormat: string;
  editorCapability: string | null;
}): AdvancedCapabilityContractEntry | null {
  const artifactType = String(input.artifactType || "")
    .trim()
    .toLowerCase();
  const sourceFormat = String(input.sourceFormat || "").trim().toLowerCase();
  const editorCapability = String(input.editorCapability || "")
    .trim()
    .toLowerCase();
  if (!artifactType || !sourceFormat || !editorCapability) {
    return null;
  }
  const capability =
    ADVANCED_CAPABILITY_BY_BINDING.get(
      advancedBindingKey(artifactType, editorCapability),
    ) || null;
  // The retired five-slot game carrier is a stored-row compatibility format,
  // never an alias for creating or editing a complete-document revision.
  if (
    capability?.artifactType === "game" &&
    sourceFormat !== capability.sourceFormat
  ) {
    return null;
  }
  return capability;
}

export type ArtifactEditability = "native" | "bounded" | "view_only";
export type ArtifactVisibility = "private" | "workspace" | "public";
export type ArtifactRenditionPurpose =
  | "thumbnail"
  | "preview"
  | "full"
  | "source"
  | "editor_manifest";
export type ArtifactCardAction = "preview" | "edit" | "insert" | "replace";
export type ArtifactMutationAction = Exclude<ArtifactCardAction, "preview">;

export interface ArtifactIdentity {
  artifactId: string;
  revisionId: string;
}

export interface ArtifactOwner {
  principalId: string;
  visibility: ArtifactVisibility;
  originSiteKey: string | null;
  originAppId: string | null;
  originFunctionId: string | null;
}

export interface ArtifactAccess {
  canRead: boolean;
  canPreview: boolean;
  canEdit: boolean;
  canFork: boolean;
  canInsert: boolean;
  canReplace: boolean;
  canFavorite: boolean;
  canBind: boolean;
  canExportSource: boolean;
}

export interface ArtifactRendition {
  purpose: ArtifactRenditionPurpose;
  revisionId: string;
  url: string;
  mediaType: string;
  format: string;
  expiresAt: string | null;
  rendererVersion: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Declared payload size when the wire includes it; used to reject flat shelf-fill posters. */
  byteSize: number | null;
  digest: string | null;
}

export interface ArtifactSceneEvidence {
  schema: string;
  sceneRevisionId: string;
  closureStatus: "complete" | "not_required" | "missing" | "unknown";
  closureDigest: string | null;
  dependencyRevisionIds: string[];
}

/**
 * Server-verified source closure for one exact artifact revision.
 *
 * `scene` describes the editor-facing scene. This record separately proves
 * that the source bytes and every persisted dependency belong to the same
 * first-party revision closure; clients must never manufacture it from a
 * poster URL or from an unverified editor document.
 */
export interface ArtifactSourceClosureEvidence {
  revisionId: string;
  status: "complete" | "missing" | "unknown";
  digest: string | null;
  sourceDigest: string | null;
  dependencyDigests: string[];
  dependencyRevisionIds: string[];
  firstParty: boolean;
}

export interface ArtifactIntegrity {
  ok: boolean;
  code:
    | "ok"
    | "missing-acl"
    | "missing-owner"
    | "revision-mismatch"
    | "missing-preview"
    | "missing-source"
    | "missing-scene"
    | "missing-editor-manifest"
    | "source-format-mismatch"
    | "editor-capability-mismatch"
    | "missing-provenance"
    | "license-restricted"
    | "incomplete-dependency-closure"
    | "invalid-projection";
  reason: string;
}

export interface ArtifactContextBinding {
  contextId: string;
  role: string;
  rank: number | null;
  pinnedRevisionId: string | null;
}

export interface ArtifactProvenance {
  id: string;
  sourceKind: string;
  licenseCode: string;
  /**
   * 服务端已核验过「这份东西的权利归我们/上传者」。第一方素材（`owned` /
   * `generated` / `user_upload`）恒为真且通常**没有** license URL 与 attribution；
   * 第三方（`approved_provider`）恒为假且一定带 license URL。fork 会继承父级的这个
   * 标记，所以它是「官方素材的副本」与「第三方复用」之间唯一可靠的分界线。
   * 由后端 migration 0104 投影。
   *
   * **可选，且「缺失」与 `false` 同义**——这两件事都是刻意的：
   *   - 与后端 `ProvenanceProjection.rights_asserted: bool = False` 的默认值一致，
   *     老部署不发这个 key 时两端读出同一个结论；
   *   - 缺失按 `false` 是 fail-closed：没人替你主张权利时按第三方处理，仍然必须出示
   *     license URL 或 attribution。
   *   - 设成必填会逼着每个手写 fixture 的人给它填一个值，而「填 `true` 让编译过去」
   *     恰好会静默关掉那道 license 检查。唯一有资格声明它的是服务端，而权威产出者
   *     `normalizeProvenance()` 总会显式写入具体布尔值，必填对它没有任何增益。
   */
  rightsAsserted?: boolean;
  licenseUrl: string;
  attribution: string;
}

// ── 热度字段契约（放行层与取值层的唯一出处）────────────────────────────────
//
// 为什么住在**这个**文件里：热度这条链有两头——放行头在服务边界上
// （`normalizeArtifactProjection` 重建对象、丢弃未知键；`artifactProjectionToLibraryItem`
// 的 `meta` 是白名单），取值头在探索页（`explore-artifact-class.ts::explorePopularity`）。
// 两头各写一份键名，就会出现「放行了 `play_count`、取值只认 `plays`」这种**静默排错序**
// 的 bug：热度读不到不报错，只是页面顺序悄悄退回服务端给的创建时间序。
//
// 刻意不拆成独立模块：这条链上的两头（`library-data.ts`、`explore-artifact-class.ts`）
// 与素材控制器都已经 import 本文件，写在这里不新增任何模块边，也就不会让那些把源文件
// 逐个编译成 data module、再手工改写 import 名单的测试与消费方多一处要登记的依赖。

/** 热度可能被整份包进来的信封键。**只认一层**，不深递归。 */
export const POPULARITY_ENVELOPE_KEYS: readonly string[] = Object.freeze([
  "stats",
  "ugc_stats",
  "ugcStats",
  "popularity",
]);

/**
 * 每个指标的别名，按优先级排列（先命中者胜）。
 *
 * 为什么是**别名组 + 信封**而不是一组精确字段名：产出方还在动。可玩侧的权威是
 * `ugc_game_stats`（migration `0111` 的 `plays` / `likes` / `remixes`）；素材侧是导入时
 * 保留的原站数值（ambientCG `downloadCount`、Poly Haven `download_count`）。它们最终叫
 * `plays` 还是 `play_count`、挂在顶层还是 `stats` / `ugc_stats` 下，本包不该有意见——
 * 只要落在这两份名单里就接得上。
 *
 * 顺序即优先级：`plays` 与 `play_count` 同时出现时取前者，这样同一条数据在不同部署下
 * 排出来的顺序一致（SSR 与 hydration 也必须一致）。
 */
export const POPULARITY_METRIC_ALIASES = Object.freeze({
  plays: Object.freeze(["plays", "play_count", "playCount"] as const),
  likes: Object.freeze(["likes", "like_count", "likeCount"] as const),
  remixes: Object.freeze(["remixes", "remix_count", "remixCount"] as const),
  downloads: Object.freeze([
    "downloads",
    "download_count",
    "downloadCount",
    "source_download_count",
  ] as const),
});

export type PopularityMetricName = keyof typeof POPULARITY_METRIC_ALIASES;

export const POPULARITY_METRIC_NAMES: readonly PopularityMetricName[] =
  Object.freeze(["plays", "likes", "remixes", "downloads"] as const);

/** 放行后写进 `LibraryItem.meta` 的信封键。取值层认得它（见上面的信封名单）。 */
export const POPULARITY_META_KEY = "popularity";

/**
 * 放行下来的热度数值。键是**产出方用的原始别名**（见 `popularityMetricsFromWire`），
 * 所以这里是开放键名的 record 而不是四个固定字段。
 */
export type PopularityMetrics = Readonly<Record<string, number>>;

/**
 * 只接受有限非负数。字符串数字**不接受**——`"12"` 与 `"十二"` 分不开，而热度是排序键，
 * 读错一次就是整页顺序错；产出方发字符串属于契约违规，该在产出侧修。
 */
export function popularityCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/**
 * 一个原始 wire 对象上所有能读到的热度数值。
 *
 * 扫描面**刻意有界**：本层、`meta` 本层，以及这两层下各一层信封。热度是排序键，从任意
 * 深度捞一个同名数字上来是安全事故的形状（一条 `provenance.source.likes` 就能改排序）。
 *
 * 返回值的键**保留原始别名**（读到 `play_count` 就写 `play_count`），不改名成规范名：
 * 取值层认全部别名，而保留原名让证据与门禁能点出「这一份数据的产出方用的是哪个名字」。
 *
 * 没读到任何数值时返回 `null`，调用方据此**不写** `meta.popularity`——于是取值层如实
 * 得到 `known: false`、呈现层打 `data-explore-popularity-ready="false"`。空信封（`{}`）
 * 与「热度全是 0」必须区分得开，所以这里绝不返回空对象。
 */
export function popularityMetricsFromWire(
  raw: unknown,
): PopularityMetrics | null {
  const top = record(raw);
  if (!top) return null;
  const layers: Record<string, unknown>[] = [top];
  const meta = record(top.meta);
  if (meta) layers.push(meta);
  for (const layer of [top, meta]) {
    if (!layer) continue;
    for (const key of POPULARITY_ENVELOPE_KEYS) {
      const envelope = record(layer[key]);
      if (envelope) layers.push(envelope);
    }
  }
  const metrics: Record<string, number> = {};
  for (const metric of POPULARITY_METRIC_NAMES) {
    for (const alias of POPULARITY_METRIC_ALIASES[metric]) {
      let hit: number | null = null;
      for (const layer of layers) {
        hit = popularityCount(layer[alias]);
        if (hit !== null) break;
      }
      if (hit !== null) {
        metrics[alias] = hit;
        break;
      }
    }
  }
  return Object.keys(metrics).length > 0 ? metrics : null;
}

export interface ArtifactProjection extends ArtifactIdentity {
  schema: "oceanleo.artifact.v1";
  artifactType: ArtifactType;
  roles: string[];
  owner: ArtifactOwner;
  access: ArtifactAccess;
  editability: ArtifactEditability;
  editorCapability: string | null;
  sourceFormat: string;
  title: string;
  favorite: boolean;
  renditions: Partial<Record<ArtifactRenditionPurpose, ArtifactRendition>>;
  scene: ArtifactSceneEvidence | null;
  sourceClosure?: ArtifactSourceClosureEvidence | null;
  provenance: ArtifactProvenance | null;
  bindings: ArtifactContextBinding[];
  integrity: ArtifactIntegrity;
  createdAt: string | null;
  /**
   * 服务端给的热度数值（游玩 / 点赞 / 二创 / 下载），没有就是 `null`。
   *
   * 为什么它必须在**这个契约**上：这个 normalizer 重建对象、丢弃一切未知键，是整条链
   * 上唯一的信息瓶颈。热度停在这里的后果不是报错而是**静默排错序**——探索页按热度排，
   * 读不到就只能退回服务端给的创建时间序。所以这里给它留一条明确的路，而不是让下游各
   * 自去猜原始 wire 对象还在不在手上。
   *
   * 键名是产出方的原始别名（`plays` / `play_count` / …），本契约刻意不规范化：见
   * `popularity-fields.ts` 的别名表。`null` 与「全是 0」必须区分得开，所以读不到任何
   * 数值时是 `null`，不是 `{}`。
   *
   * 声明成**可选**是为了 36 个 consumer：它们里若有谁手写过 projection 字面量，加一个
   * 必填字段等于让那一站直接编译不过。normalizer 恒会填上这个字段，缺席只会出现在
   * 手写字面量上，而缺席的语义与 `null` 相同（热度未知）。
   */
  popularity?: PopularityMetrics | null;
}

/**
 * Compatibility-only generation receipt. It can be previewed, but all
 * durable mutations must first pass POST /v1/artifacts/ensure.
 */
export interface TransientGenerationResult {
  schema: "oceanleo.transient-generation.v1";
  operation: "generation" | "upload" | "legacy-import";
  resultId: string;
  idempotencyKey: string;
  payloadDigest: string;
  artifactType: ArtifactType;
  title: string;
  renditionUrl: string;
  sourceUrl?: string;
  sourceFormat?: string;
  siteId?: string;
  appId?: string;
  functionId?: string;
  provenance?: Record<string, unknown>;
}

export interface ArtifactContextRef {
  contextId: string;
  siteKey: string;
  appId?: string;
  functionId?: string;
}

export type AdvancedCapabilityDispatchPolicy =
  | { scope: "global" }
  | {
      scope: "exact-context";
      context: string | ArtifactContextRef;
    };

export interface AdvancedCapabilityDispatchReceipt extends ArtifactIdentity {
  schema: "oceanleo.advanced-capability-dispatch.v1";
  featureId: AdvancedFeatureId;
  artifactType: ArtifactType;
  sourceFormat: string;
  editorCapability: string;
  adapter: AdvancedEditorAdapterId;
  projectSchema: string;
  sourceRevisionId: string;
  sourceDigest: string;
  context: {
    scope: AdvancedCapabilityDispatchPolicy["scope"];
    contextId: string | null;
    siteKey: string | null;
    exact: boolean;
  };
}

export interface AdvancedCapabilityDispatchSuccess {
  ok: true;
  /** Exact canonical row; its identity is shared across every site context. */
  capability: AdvancedCapabilityContractEntry;
  receipt: AdvancedCapabilityDispatchReceipt;
}

export interface AdvancedCapabilityDispatchFailure {
  ok: false;
  code:
    | "invalid-artifact-identity"
    | "integrity-failed"
    | "access-denied"
    | "missing-source"
    | "incompatible-source"
    | "incompatible-capability"
    | "context-required"
    | "context-mismatch";
  reason: string;
}

export type AdvancedCapabilityDispatchResult =
  | AdvancedCapabilityDispatchSuccess
  | AdvancedCapabilityDispatchFailure;

export interface ArtifactCommandSource extends ArtifactIdentity {
  artifactType: ArtifactType;
  sourceFormat: string;
}

export interface ArtifactTargetRef {
  documentId: string;
  targetId?: string;
  slotId?: string;
  geometry?: Readonly<Record<string, number>>;
}

export type ArtifactMutationStrategy =
  | {
      mode: "insert-new-object";
      preserve?: never;
    }
  | {
      mode: "replace-selection" | "replace-slot";
      preserve: readonly ("slot" | "geometry")[];
    };

export interface ArtifactRevisionExpectation {
  targetRevisionId: string;
}

export interface ArtifactCompareAndSwap {
  expectedRevisionId: string;
}

export interface ArtifactEditorCommand {
  schema: "oceanleo.editor-command.v1";
  commandId: string;
  historyGroupId: string;
  action: "insert" | "replace";
  source: ArtifactCommandSource;
  target: ArtifactTargetRef;
  strategy: ArtifactMutationStrategy;
  expectedRevision: ArtifactRevisionExpectation;
  cas: ArtifactCompareAndSwap;
}

export type ArtifactApiErrorCode =
  | "unauthorized"
  | "not-found"
  | "unsupported-type"
  | "missing-source"
  | "license-restricted"
  | "revision-conflict"
  | "invalid-binding"
  | "integrity-failed"
  | "transient-persistence-failed"
  | "network-error"
  | "invalid-response"
  | "unknown";

export interface ArtifactProjectionNormalizationResult {
  ok: boolean;
  data?: ArtifactProjection;
  error?: string;
}

const RENDITION_PURPOSES: ArtifactRenditionPurpose[] = [
  "thumbnail",
  "preview",
  "full",
  "source",
  "editor_manifest",
];

const artifactEditorCapabilities: Record<string, Set<string>> =
  Object.create(null) as Record<string, Set<string>>;

for (const entry of ADVANCED_CAPABILITY_MATRIX) {
  for (const binding of entry.artifactBindings) {
    const capabilities =
      artifactEditorCapabilities[binding.artifactType] || new Set<string>();
    artifactEditorCapabilities[binding.artifactType] = capabilities;
    for (const editorCapability of binding.editorCapabilities) {
      capabilities.add(editorCapability);
    }
  }
}

export const ARTIFACT_EDITOR_CAPABILITIES: Readonly<
  Record<string, ReadonlySet<string>>
> = Object.freeze(artifactEditorCapabilities);

export function artifactSourceFormatIsCompatible(
  artifactType: ArtifactType,
  sourceFormat: unknown,
): boolean {
  if (String(artifactType || "").trim().toLowerCase() === "game") {
    return gameSourceFormatAccess(sourceFormat) === "current";
  }
  return Boolean(
    String(artifactType || "").trim() &&
      String(sourceFormat || "").trim(),
  );
}

export function artifactEditorCapabilityIsCompatible(
  artifactType: ArtifactType,
  editorCapability: unknown,
): boolean {
  const normalizedType = String(artifactType || "").trim().toLowerCase();
  const normalizedCapability = String(editorCapability || "")
    .trim()
    .toLowerCase();
  if (normalizedType === "game" || normalizedCapability === "game-editor") {
    return normalizedType === "game" && normalizedCapability === "game-editor";
  }
  return Boolean(
    normalizedType && normalizedCapability,
  );
}

export function chartOptionEvidenceIsPresent(input: {
  sourceFormat: unknown;
  editorManifest?: ArtifactRendition | null;
}): boolean {
  const sourceFormat = String(input.sourceFormat || "").trim().toLowerCase();
  return Boolean(
    sourceFormat ||
      (input.editorManifest?.url && input.editorManifest.digest),
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function mediaType(value: unknown): string {
  return text(value).toLowerCase().split(";", 1)[0]?.trim() || "";
}

function bool(value: unknown): boolean {
  return value === true;
}

function booleanField(
  value: Record<string, unknown>,
  ...names: string[]
): boolean | null {
  for (const name of names) {
    if (typeof value[name] === "boolean") return value[name] as boolean;
  }
  return null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Opaque token access path (browser-safe without Bearer). */
const ARTIFACT_ACCESS_PATH =
  /^\/v1\/artifact-renditions\/access\/[^/?#]+$/;
const PUBLIC_ARTIFACT_ACCESS_PATH =
  "/v1/artifact-renditions/access/public";
/** Auth-gated source-tree entrypoint; must stay gateway-relative for normalize. */
const ARTIFACT_SOURCE_TREE_PATH =
  /^\/v1\/artifacts\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/revisions\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/source-tree\/@source$/;

/**
 * Allowlisted gateway-relative rendition identities. Source-tree paths require
 * Bearer and must never be absolutized for anonymous browser GETs; opaque
 * access tokens and public thumbnail/preview query identities remain valid.
 */
export function isAllowlistedGatewayRelativeRenditionUrl(
  value: string,
): boolean {
  if (ARTIFACT_ACCESS_PATH.test(value)) return true;
  if (ARTIFACT_SOURCE_TREE_PATH.test(value)) return true;
  try {
    const parsed = new URL(value, "https://gateway.invalid");
    const keys = [...new Set(parsed.searchParams.keys())].sort();
    return (
      value.startsWith("/") &&
      !parsed.hash &&
      parsed.pathname === PUBLIC_ARTIFACT_ACCESS_PATH &&
      keys.join(",") === "artifactId,purpose,revisionId" &&
      Boolean(parsed.searchParams.get("artifactId")) &&
      Boolean(parsed.searchParams.get("revisionId")) &&
      ["thumbnail", "preview"].includes(
        parsed.searchParams.get("purpose") || "",
      )
    );
  } catch {
    return false;
  }
}

/** True when URL is the auth-gated source-tree entrypoint (relative or absolute). */
export function isArtifactSourceTreeUrl(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;
  if (ARTIFACT_SOURCE_TREE_PATH.test(candidate)) return true;
  try {
    const parsed = new URL(candidate);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      ARTIFACT_SOURCE_TREE_PATH.test(parsed.pathname) &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

/** Prefer relative source-tree path over absolute API URLs (anonymous GET → 401). */
export function artifactSourceTreeRelativePath(value: string): string {
  const candidate = value.trim();
  if (ARTIFACT_SOURCE_TREE_PATH.test(candidate)) return candidate;
  try {
    const parsed = new URL(candidate);
    if (
      ARTIFACT_SOURCE_TREE_PATH.test(parsed.pathname) &&
      !parsed.search &&
      !parsed.hash
    ) {
      return parsed.pathname;
    }
  } catch {
    // not a URL
  }
  return "";
}

function trustedRenditionUrl(value: unknown): string {
  const candidate = text(value);
  if (!candidate || candidate.length > 4_096) return "";
  // Fail-closed: never retain absolute source-tree API URLs for browser media.
  const sourceTreeRelative = artifactSourceTreeRelativePath(candidate);
  if (sourceTreeRelative) return sourceTreeRelative;
  if (isAllowlistedGatewayRelativeRenditionUrl(candidate)) {
    return candidate;
  }
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter(Boolean),
        ),
      ]
    : [];
}

function normalizedSha256(value: unknown): string {
  const digest = text(value).toLowerCase().replace(/^sha256:/, "");
  return /^[0-9a-f]{64}$/.test(digest) ? digest : "";
}

function normalizeArtifactType(value: unknown): ArtifactType | null {
  const normalized = text(value).toLowerCase();
  return normalized || null;
}

function preferOpaqueAccessOverSourceTree(
  primaryUrl: string,
  accessUrl: string,
): string {
  for (const candidate of [accessUrl, primaryUrl]) {
    if (
      candidate &&
      !isArtifactSourceTreeUrl(candidate) &&
      (ARTIFACT_ACCESS_PATH.test(candidate) ||
        (() => {
          try {
            const parsed = new URL(candidate);
            return (
              parsed.protocol === "https:" &&
              ARTIFACT_ACCESS_PATH.test(parsed.pathname) &&
              !parsed.search &&
              !parsed.hash
            );
          } catch {
            return false;
          }
        })())
    ) {
      return candidate;
    }
  }
  return primaryUrl;
}

function normalizeRendition(
  value: unknown,
  purposeHint: ArtifactRenditionPurpose,
  _revisionId: string,
): ArtifactRendition | null {
  const raw = record(value);
  if (!raw) return null;
  const purpose = text(raw.purpose, purposeHint) as ArtifactRenditionPurpose;
  if (!RENDITION_PURPOSES.includes(purpose) || purpose !== purposeHint) {
    return null;
  }
  const primaryUrl = text(raw.url, raw.signed_url, raw.signedUrl);
  const accessUrl = text(raw.accessUrl, raw.access_url);
  const url = trustedRenditionUrl(
    purpose === "source"
      ? preferOpaqueAccessOverSourceTree(primaryUrl, accessUrl)
      : primaryUrl,
  );
  const renditionRevisionId = text(raw.revisionId, raw.revision_id);
  if (!url || !renditionRevisionId) return null;
  return {
    purpose,
    revisionId: renditionRevisionId,
    url,
    mediaType: text(raw.mediaType, raw.media_type, raw.content_type),
    format: text(raw.format),
    expiresAt: text(raw.expiresAt, raw.expires_at) || null,
    rendererVersion:
      text(raw.rendererVersion, raw.renderer_version) || null,
    width: numberOrNull(raw.width),
    height: numberOrNull(raw.height),
    durationMs: numberOrNull(raw.durationMs ?? raw.duration_ms),
    byteSize: numberOrNull(raw.byteSize ?? raw.byte_size),
    digest: text(raw.digest, raw.sha256) || null,
  };
}

function rewriteSourceTreeFromSameDigestFull(
  renditions: Partial<Record<ArtifactRenditionPurpose, ArtifactRendition>>,
): Partial<Record<ArtifactRenditionPurpose, ArtifactRendition>> {
  const source = renditions.source;
  const full = renditions.full;
  if (
    !source ||
    !full?.url ||
    !isArtifactSourceTreeUrl(source.url) ||
    !source.digest ||
    !full.digest ||
    source.digest !== full.digest ||
    isArtifactSourceTreeUrl(full.url)
  ) {
    return renditions;
  }
  const opaque = trustedRenditionUrl(full.url);
  if (!opaque || isArtifactSourceTreeUrl(opaque)) return renditions;
  return {
    ...renditions,
    source: { ...source, url: opaque },
  };
}

function normalizeRenditions(
  raw: Record<string, unknown>,
  revisionId: string,
): Partial<Record<ArtifactRenditionPurpose, ArtifactRendition>> {
  const source = record(raw.renditions);
  const result: Partial<
    Record<ArtifactRenditionPurpose, ArtifactRendition>
  > = {};
  if (Array.isArray(raw.renditions)) {
    for (const value of raw.renditions) {
      const purpose = text(record(value)?.purpose) as ArtifactRenditionPurpose;
      if (!RENDITION_PURPOSES.includes(purpose)) continue;
      const rendition = normalizeRendition(value, purpose, revisionId);
      if (rendition) result[purpose] = rendition;
    }
  }
  for (const purpose of RENDITION_PURPOSES) {
    const rendition = normalizeRendition(
      source?.[purpose] ?? raw[purpose],
      purpose,
      revisionId,
    );
    if (rendition) result[purpose] = rendition;
  }
  return rewriteSourceTreeFromSameDigestFull(result);
}

function normalizeAccess(value: unknown): ArtifactAccess | null {
  const raw = record(value);
  if (!raw) return null;
  const canRead = booleanField(raw, "canRead", "can_read", "read");
  const canPreview = booleanField(
    raw,
    "canPreview",
    "can_preview",
    "preview",
  );
  const canEdit = booleanField(raw, "canEdit", "can_edit", "edit");
  const canFork = booleanField(raw, "canFork", "can_fork", "fork");
  const canInsert = booleanField(raw, "canInsert", "can_insert", "insert");
  const canReplace = booleanField(
    raw,
    "canReplace",
    "can_replace",
    "replace",
  );
  const canFavorite = booleanField(
    raw,
    "canFavorite",
    "can_favorite",
    "favorite",
  );
  const canBind = booleanField(raw, "canBind", "can_bind", "bind");
  const canExportSource = booleanField(
    raw,
    "canExportSource",
    "can_export_source",
    "export_source",
  );
  if (
    [
      canRead,
      canPreview,
      canEdit,
      canFork,
      canInsert,
      canReplace,
      canFavorite,
      canBind,
      canExportSource,
    ].some((entry) => entry === null)
  ) {
    return null;
  }
  return {
    canRead: canRead as boolean,
    canPreview: canPreview as boolean,
    canEdit: canEdit as boolean,
    canFork: canFork as boolean,
    canInsert: canInsert as boolean,
    canReplace: canReplace as boolean,
    canFavorite: canFavorite as boolean,
    canBind: canBind as boolean,
    canExportSource: canExportSource as boolean,
  };
}

function normalizeOwner(value: unknown): ArtifactOwner | null {
  const raw = record(value);
  if (!raw) return null;
  const visibility = text(raw.visibility);
  const principalId = text(raw.principalId, raw.principal_id);
  if (
    !principalId ||
    !["private", "workspace", "public"].includes(visibility)
  ) {
    return null;
  }
  return {
    principalId,
    visibility: visibility as ArtifactVisibility,
    originSiteKey:
      text(raw.originSiteKey, raw.origin_site_key) || null,
    originAppId: text(raw.originAppId, raw.origin_app_id) || null,
    originFunctionId:
      text(raw.originFunctionId, raw.origin_function_id) || null,
  };
}

function normalizeScene(
  value: unknown,
  revisionId: string,
): ArtifactSceneEvidence | null {
  const raw = record(value);
  if (!raw) return null;
  const closure = text(raw.closureStatus, raw.closure_status);
  return {
    schema: text(raw.schema),
    sceneRevisionId: text(
      raw.sceneRevisionId,
      raw.scene_revision_id,
      revisionId,
    ),
    closureStatus:
      closure === "complete" ||
      closure === "not_required" ||
      closure === "missing"
        ? closure
        : "unknown",
    closureDigest: text(raw.closureDigest, raw.closure_digest) || null,
    dependencyRevisionIds: stringList(
      raw.dependencyRevisionIds ?? raw.dependency_revision_ids,
    ),
  };
}

function normalizeSourceClosure(
  value: unknown,
): ArtifactSourceClosureEvidence | null {
  const raw = record(value);
  if (!raw) return null;
  const revisionId = text(raw.revisionId, raw.revision_id);
  const rawStatus = text(raw.status, raw.closureStatus, raw.closure_status);
  const firstParty = booleanField(raw, "firstParty", "first_party");
  const rawDependencyDigests =
    raw.dependencyDigests ?? raw.dependency_digests;
  const rawDependencyRevisionIds =
    raw.dependencyRevisionIds ?? raw.dependency_revision_ids;
  if (
    !revisionId ||
    !["complete", "missing", "unknown"].includes(rawStatus) ||
    firstParty === null ||
    !Array.isArray(rawDependencyDigests) ||
    !Array.isArray(rawDependencyRevisionIds)
  ) {
    return null;
  }
  const dependencyDigests = rawDependencyDigests.map(normalizedSha256);
  if (
    dependencyDigests.some((digest) => !digest) ||
    dependencyDigests.length !== new Set(dependencyDigests).size
  ) {
    return null;
  }
  return {
    revisionId,
    status: rawStatus as ArtifactSourceClosureEvidence["status"],
    digest: normalizedSha256(raw.digest) || null,
    sourceDigest:
      normalizedSha256(raw.sourceDigest ?? raw.source_digest) || null,
    dependencyDigests,
    dependencyRevisionIds: stringList(rawDependencyRevisionIds),
    firstParty,
  };
}

function normalizeBindings(value: unknown): ArtifactContextBinding[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const raw = record(entry);
    const contextId = text(raw?.contextId, raw?.context_id);
    if (!raw || !contextId) return [];
    return [
      {
        contextId,
        role: text(raw.role, raw.binding_role),
        rank: numberOrNull(raw.rank),
        pinnedRevisionId:
          text(raw.pinnedRevisionId, raw.pinned_revision_id) || null,
      },
    ];
  });
}

function normalizeProvenance(value: unknown): ArtifactProvenance | null {
  const raw = record(value);
  if (!raw) return null;
  const id = text(raw.id, raw.provenanceId, raw.provenance_id);
  const sourceKind = text(raw.sourceKind, raw.source_kind);
  const licenseCode = text(raw.licenseCode, raw.license_code);
  if (!id || !sourceKind || !licenseCode) return null;
  return {
    id,
    sourceKind,
    licenseCode,
    licenseUrl: text(raw.licenseUrl, raw.license_url),
    attribution: text(raw.attribution, raw.attribution_text),
    // 缺这个 key 的老部署按 `false` 处理，与后端 `ProvenanceProjection` 的默认值一致。
    rightsAsserted:
      raw.rightsAsserted === true || raw.rights_asserted === true,
  };
}

/**
 * 不需要再出示复用证据的第一方来源。
 *
 * 比后端那份（`{owned, generated, internal}`）多三个：后端在投影前会把
 * `user_upload` 归一成 `owned`，而 `agent` / `agent_generated` 是本前端历史上就认的
 * 写法。这里保持超集是为了不新拒今天能通过的东西——**收窄它属于行为变更，别顺手做**。
 */
const FIRST_PARTY_SOURCE_KINDS: readonly string[] = [
  "owned",
  "generated",
  "internal",
  "user_upload",
  "agent",
  "agent_generated",
];

/**
 * 「这是第三方复用，却一份复用证据都拿不出来」。
 *
 * ⚠️ **这条规则是后端 `typed_artifact_service.py` 那条的镜像**（搜
 * `third-party provenance lacks license URL and attribution`）。判据必须逐项对齐，
 * 两边任何一方改动都要同时改另一方——R-7 就是只改了后端、前端这份没跟上：
 * 用户 fork 一份官方素材后，副本 `sourceKind = "derivative"`，而官方素材本就没有
 * license URL 与 attribution，于是前端把整份「我的库」响应判为无效，一个条目都列不出来。
 *
 * `rightsAsserted` 是第三条出路，也正是解开 fork 的那一条：第一方素材恒为真，第三方
 * （`approved_provider`）恒为假且一定带 license URL；fork 继承父级的标记，所以官方
 * 素材的副本不再被当成第三方复用，而真正的第三方素材的副本仍然必须出示 license URL。
 * 生产数据实测（2026-07-27）：`derivative + rightsAsserted + 无 URL 无 attribution`
 * 共 19 行，全部是官方素材的用户副本。
 */
function provenanceLacksReuseEvidence(provenance: ArtifactProvenance): boolean {
  return (
    !FIRST_PARTY_SOURCE_KINDS.includes(
      provenance.sourceKind.trim().toLowerCase(),
    ) &&
    // 只有显式 `true` 才算主张过权利：缺失与 `false` 一样按第三方处理（fail-closed）。
    provenance.rightsAsserted !== true &&
    !provenance.licenseUrl &&
    !provenance.attribution
  );
}

export function artifactIntegrityFor(input: {
  artifactType: ArtifactType;
  revisionId: string;
  editability: ArtifactEditability;
  editorCapability: string | null;
  sourceFormat: string;
  owner: ArtifactOwner;
  access: ArtifactAccess;
  provenance: ArtifactProvenance | null;
  renditions: Partial<Record<ArtifactRenditionPurpose, ArtifactRendition>>;
  scene: ArtifactSceneEvidence | null;
  sourceClosure?: ArtifactSourceClosureEvidence | null;
}): ArtifactIntegrity {
  if (!input.owner.principalId) {
    return {
      ok: false,
      code: "missing-owner",
      reason: "artifact 缺少服务端主体 owner，不能确定可见性边界。",
    };
  }
  if (
    Object.values(input.access).some((permission) => typeof permission !== "boolean")
  ) {
    return {
      ok: false,
      code: "missing-acl",
      reason: "artifact 缺少完整、显式的 ACL 投影。",
    };
  }
  if (!input.provenance) {
    return {
      ok: false,
      code: "missing-provenance",
      reason: "artifact 缺少 provenance 或 license 证据。",
    };
  }
  const licenseCode = input.provenance.licenseCode.trim().toLowerCase();
  if (
    !licenseCode ||
    ["none", "unknown", "unlicensed", "restricted", "denied"].includes(
      licenseCode,
    )
  ) {
    return {
      ok: false,
      code: "license-restricted",
      reason: "artifact 的 license 不完整或明确限制复用。",
    };
  }
  if (provenanceLacksReuseEvidence(input.provenance)) {
    return {
      ok: false,
      code: "license-restricted",
      reason: "第三方 artifact 同时缺少 license URL 与 attribution。",
    };
  }
  const renditions = Object.values(input.renditions).filter(
    (value): value is ArtifactRendition => Boolean(value),
  );
  if (renditions.some((value) => value.revisionId !== input.revisionId)) {
    return {
      ok: false,
      code: "revision-mismatch",
      reason: "缩略图、预览、完整文件与源文件没有固定在同一 revision。",
    };
  }
  if (!input.renditions.preview && !input.renditions.full) {
    return {
      ok: false,
      code: "missing-preview",
      reason: "当前 revision 没有可查看的 preview 或 full rendition。",
    };
  }
  if (
    input.editability !== "view_only" &&
    (!input.sourceFormat ||
      !input.editorCapability ||
      !input.renditions.source ||
      !input.renditions.source.digest)
  ) {
    return {
      ok: false,
      code: "missing-source",
      reason:
        "素材声明可编辑，但当前 revision 缺少 source format、editor capability、source rendition 或 source digest。",
    };
  }
  // Artifact type, source format, editor capability and project shape are
  // self-reported content. The transport layer deliberately does not compare
  // any of them with a platform registry or inspect scene/manifest schemas.
  return { ok: true, code: "ok", reason: "" };
}

export function normalizeArtifactProjection(
  value: unknown,
): ArtifactProjection | null {
  const envelope = record(value);
  const raw =
    record(envelope?.item) ||
    record(envelope?.artifact) ||
    envelope;
  if (!raw || raw.schema !== "oceanleo.artifact.v1") return null;
  const artifactId = text(raw.artifactId, raw.artifact_id);
  const revisionId = text(
    raw.revisionId,
    raw.revision_id,
    record(raw.revision)?.id,
  );
  const artifactType = normalizeArtifactType(
    raw.artifactType ?? raw.artifact_type,
  );
  if (!artifactId || !revisionId || !artifactType) return null;
  const editabilityValue = text(raw.editability);
  const editability: ArtifactEditability =
    editabilityValue === "native" || editabilityValue === "bounded"
      ? editabilityValue
      : "view_only";
  const renditions = normalizeRenditions(raw, revisionId);
  const scene = normalizeScene(
    raw.scene ?? raw.source_scene ?? raw.source_manifest,
    revisionId,
  );
  const rawSourceClosure = raw.sourceClosure ?? raw.source_closure;
  const sourceClosure = normalizeSourceClosure(rawSourceClosure);
  const owner = normalizeOwner(raw.owner);
  const access = normalizeAccess(raw.access ?? raw.permissions ?? raw.acl);
  const provenance = normalizeProvenance(raw.provenance);
  if (!owner || !access) return null;
  const sourceFormat = text(raw.sourceFormat, raw.source_format);
  const editorCapability =
    text(raw.editorCapability, raw.editor_capability) || null;
  const integrity = artifactIntegrityFor({
    artifactType,
    revisionId,
    editability,
    editorCapability,
    sourceFormat,
    owner,
    access,
    provenance,
    renditions,
    scene,
    sourceClosure,
  });
  const declaredIntegrity = record(raw.integrity);
  const declaredCode = text(declaredIntegrity?.code);
  const declaredReason = text(declaredIntegrity?.reason);
  const declaredTransportFailure = [
    "missing-acl",
    "missing-owner",
    "revision-mismatch",
    "missing-preview",
    "missing-source",
    "missing-provenance",
    "license-restricted",
    "invalid-projection",
  ].includes(declaredCode);
  const effectiveIntegrity =
    declaredIntegrity &&
    declaredIntegrity.ok !== true &&
    declaredTransportFailure
      ? {
          ok: false,
          code: declaredCode as ArtifactIntegrity["code"],
          reason:
            declaredReason ||
            "服务端声明这个 artifact projection 未通过完整性校验。",
        }
      : integrity;
  return {
    schema: "oceanleo.artifact.v1",
    artifactId,
    revisionId,
    artifactType,
    roles: stringList(raw.roles),
    owner,
    access,
    editability,
    editorCapability,
    sourceFormat,
    title: text(raw.title) || "未命名素材",
    favorite: bool(raw.favorite),
    renditions,
    scene,
    sourceClosure,
    provenance,
    bindings: normalizeBindings(
      raw.bindings ?? raw.context_bindings,
    ),
    integrity: effectiveIntegrity,
    createdAt: text(raw.createdAt, raw.created_at) || null,
    // 热度不参与完整性判定：读不到只影响排序，不影响这个 artifact 能不能预览/编辑。
    // 所以它在这里是纯放行，绝不能让一份缺热度的投影被判成 invalid。
    popularity: popularityMetricsFromWire(raw),
  };
}

/**
 * Strict service-boundary normalization. Compatibility callers may still use
 * `normalizeArtifactProjection` to inspect an invalid projection's integrity
 * reason, but list/detail clients must reject every incomplete rich-v1 row.
 */
export function normalizeArtifactProjectionResult(
  value: unknown,
): ArtifactProjectionNormalizationResult {
  const envelope = record(value);
  const raw =
    record(envelope?.item) ||
    record(envelope?.artifact) ||
    envelope;
  if (!raw) {
    return {
      ok: false,
      error: "artifact projection 必须是对象。",
    };
  }
  if (raw.schema !== "oceanleo.artifact.v1") {
    return {
      ok: false,
      error: `未知 artifact schema：${text(raw.schema) || "missing"}。`,
    };
  }
  const revisionId = text(
    raw.revisionId,
    raw.revision_id,
    record(raw.revision)?.id,
  );
  if (
    !text(raw.artifactId, raw.artifact_id) ||
    !revisionId
  ) {
    return {
      ok: false,
      error: "artifact projection 缺少 artifactId/revisionId。",
    };
  }
  if (!normalizeArtifactType(raw.artifactType ?? raw.artifact_type)) {
    return {
      ok: false,
      error: "artifact projection 缺少非空 artifactType。",
    };
  }
  if (
    !Array.isArray(raw.roles) ||
    stringList(raw.roles).length !== raw.roles.length
  ) {
    return {
      ok: false,
      error: "artifact projection 缺少显式 roles。",
    };
  }
  if (!normalizeOwner(raw.owner)) {
    return {
      ok: false,
      error: "artifact projection 缺少完整 owner/visibility。",
    };
  }
  if (!normalizeAccess(raw.access)) {
    return {
      ok: false,
      error: "artifact projection 缺少完整显式 access ACL。",
    };
  }
  if (
    !["native", "bounded", "view_only"].includes(text(raw.editability))
  ) {
    return {
      ok: false,
      error: "artifact projection 缺少显式 editability。",
    };
  }
  if (typeof raw.favorite !== "boolean") {
    return {
      ok: false,
      error: "artifact projection 缺少显式 favorite 状态。",
    };
  }
  const declaredIntegrity = record(raw.integrity);
  if (
    !declaredIntegrity ||
    typeof declaredIntegrity.ok !== "boolean" ||
    !text(declaredIntegrity.code) ||
    typeof declaredIntegrity.reason !== "string" ||
    (declaredIntegrity.ok === true &&
      text(declaredIntegrity.code) !== "ok") ||
    (declaredIntegrity.ok === false &&
      text(declaredIntegrity.code) === "ok")
  ) {
    return {
      ok: false,
      error: "artifact projection 缺少显式 integrity 状态。",
    };
  }
  if (!normalizeProvenance(raw.provenance)) {
    return {
      ok: false,
      error: "artifact projection 缺少完整 provenance/license。",
    };
  }
  const rawRenditions = raw.renditions;
  const rawRenditionRecord = record(rawRenditions);
  const normalizedRenditions = normalizeRenditions(raw, revisionId);
  const renditionCount = Object.keys(normalizedRenditions).length;
  const declaredRenditionCount = Array.isArray(rawRenditions)
    ? rawRenditions.length
    : rawRenditionRecord
      ? Object.keys(rawRenditionRecord).length
      : -1;
  if (
    declaredRenditionCount < 1 ||
    renditionCount !== declaredRenditionCount
  ) {
    return {
      ok: false,
      error: "artifact projection 缺少完整、可验证的 renditions。",
    };
  }
  const rawBindings = raw.bindings ?? raw.context_bindings;
  if (
    !Array.isArray(rawBindings) ||
    normalizeBindings(rawBindings).length !== rawBindings.length ||
    rawBindings.some((value) => {
      const binding = record(value);
      return !binding || !text(binding.role, binding.binding_role);
    })
  ) {
    return {
      ok: false,
      error: "artifact projection 缺少完整 context bindings。",
    };
  }
  const projection = normalizeArtifactProjection(value);
  if (!projection) {
    return {
      ok: false,
      error: "artifact projection 无法按 rich v1 规范化。",
    };
  }
  if (!projection.integrity.ok) {
    return {
      ok: false,
      error:
        projection.integrity.reason ||
        "artifact projection 未通过完整性校验。",
    };
  }
  return { ok: true, data: projection };
}

export function isArtifactProjection(
  value: unknown,
): value is ArtifactProjection {
  return (
    record(value)?.schema === "oceanleo.artifact.v1" &&
    Boolean(normalizeArtifactProjection(value))
  );
}

export function isEnsureableTransient(
  value: TransientGenerationResult | null | undefined,
): value is TransientGenerationResult {
  // Callers cross the JS boundary from 31 sites; every field may be missing.
  const filled = (field: unknown): boolean =>
    typeof field === "string" && field.trim().length > 0;
  return Boolean(
    value &&
      value.schema === "oceanleo.transient-generation.v1" &&
      filled(value.resultId) &&
      filled(value.idempotencyKey) &&
      filled(value.payloadDigest) &&
      filled(value.renditionUrl) &&
      filled(value.artifactType),
  );
}

export function renditionNeedsRefresh(
  rendition: ArtifactRendition | null | undefined,
  now = Date.now(),
  skewMs = 60_000,
): boolean {
  if (!rendition?.url || !rendition.expiresAt) return false;
  const expires = Date.parse(rendition.expiresAt);
  return Number.isFinite(expires) && expires <= now + skewMs;
}

export function viewerRenditionOrder(
  artifactType: ArtifactType,
  _canExportSource = false,
): ArtifactRenditionPurpose[] {
  if (
    artifactType === "single_file_image" ||
    artifactType === "composite_image" ||
    artifactType === "vector_image" ||
    artifactType === "chart" ||
    artifactType === "website" ||
    artifactType === "workflow" ||
    // `full` 是可玩 bundle（text/html），卡片位图只能来自封面 `preview`。
    artifactType === "game"
  ) {
    return ["preview", "full"];
  }
  if (
    artifactType === "video" ||
    artifactType === "audio" ||
    artifactType === "model_3d"
  ) {
    return ["full", "preview"];
  }
  // Preview must never substitute an editable/download source rendition.
  return ["full", "preview"];
}

export function selectArtifactRendition(
  artifact: ArtifactProjection,
  purposes = viewerRenditionOrder(
    artifact.artifactType,
    artifact.access.canExportSource,
  ),
): ArtifactRendition | null {
  for (const purpose of purposes) {
    const rendition = artifact.renditions[purpose];
    if (
      rendition?.url &&
      rendition.revisionId === artifact.revisionId &&
      !isArtifactSourceTreeUrl(rendition.url)
    ) {
      return rendition;
    }
  }
  return null;
}

export interface ArtifactDownloadCandidate {
  purpose: "source" | "full" | "preview";
  mode: Extract<ArtifactAccessMode, "source" | "export">;
  rendition: ArtifactRendition;
}

/**
 * 矢量素材的用户交付物是 svg 源文件本身。
 *
 * 它的编辑面是图层工程适配器（`design_canvas` 行），但 `openMode` 推出来的
 * 「结构化工程 ⇒ 交付渲染导出」对矢量不成立：把 svg 换成 png/webp 就把矢量丢了。
 * 形态在这里胜过适配器，所以矢量单独走 source 交付规则。
 */
function downloadRuleFor(
  artifactType: ArtifactType,
  capability: AdvancedCapabilityContractEntry,
): AdvancedCapabilityDownloadRule {
  return artifactType === "vector_image"
    ? SOURCE_DOWNLOAD_RULE
    : capability.download;
}

/**
 * Contract-first card Download order. Native-file capabilities request their
 * standard source deliverable; structured projects request rendered exports.
 * `editor_manifest` is editor state and is never a user-facing Download target.
 */
/** Editor/project JSON is never a card Download deliverable. */
export function isEditorProjectDownloadMedia(
  formatValue: unknown,
  mediaTypeValue: unknown,
): boolean {
  const format = String(formatValue || "").trim().toLowerCase();
  const renditionMediaType = mediaType(mediaTypeValue);
  if (!renditionMediaType && !format) return false;
  if (renditionMediaType === "model/gltf+json") return false;
  return (
    renditionMediaType === "application/json" ||
    renditionMediaType.endsWith("+json") ||
    renditionMediaType.startsWith("application/vnd.oceanleo") ||
    format === "json" ||
    format.includes("json") ||
    format.startsWith("oceanleo.") ||
    /-source@\d+$/.test(format)
  );
}

/**
 * Shelf/API user-facing download hint derived from the capability contract.
 * Structured projects advertise a rendered image/export type; native files
 * advertise their binary source MIME/extension. Never returns editor JSON.
 */
export function artifactUserFacingDownloadHint(input: {
  artifactType: ArtifactType;
  sourceFormat: string;
  editorCapability: string | null;
  title?: string;
  renditions?: Partial<
    Record<"source" | "full" | "preview", ArtifactRendition | null | undefined>
  >;
}): {
  mediaType: string;
  extension: string;
  filename: string;
} | null {
  const capability =
    advancedCapabilityForArtifactFields({
      artifactType: input.artifactType,
      sourceFormat: input.sourceFormat,
      editorCapability: input.editorCapability,
    }) ||
    ADVANCED_CAPABILITY_MATRIX.find(
      (entry) =>
        entry.artifactBindings.some(
          (binding) => binding.artifactType === input.artifactType,
        ) &&
        (entry.editorCapability ===
          String(input.editorCapability || "")
            .trim()
            .toLowerCase() ||
          entry.sourceFormat ===
            String(input.sourceFormat || "").trim().toLowerCase()),
    ) ||
    null;
  if (!capability) return null;

  const stem =
    String(input.title || "")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/^\.+/, "")
      .slice(0, 160) || "artifact";

  const fromRendition = (
    rendition: ArtifactRendition | null | undefined,
  ): { mediaType: string; extension: string } | null => {
    if (!rendition) return null;
    if (isEditorProjectDownloadMedia(rendition.format, rendition.mediaType)) {
      return null;
    }
    const declared = mediaType(rendition.mediaType);
    if (!declared) return null;
    const extension = (() => {
      const lower = declared.toLowerCase();
      if (lower === "image/jpeg") return "jpg";
      if (lower === "image/svg+xml") return "svg";
      if (lower.startsWith("image/")) return lower.slice("image/".length);
      if (
        lower ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      ) {
        return "pptx";
      }
      if (
        lower ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) {
        return "xlsx";
      }
      if (
        lower ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        return "docx";
      }
      if (lower === "application/pdf") return "pdf";
      if (lower === "video/mp4") return "mp4";
      if (lower === "model/gltf+json") return "gltf";
      if (lower === "model/gltf-binary") return "glb";
      const format = String(rendition.format || "")
        .trim()
        .toLowerCase()
        .replace(/^\./, "");
      return /^[a-z0-9]{2,8}$/.test(format) ? format : "";
    })();
    if (!extension || extension === "json") return null;
    return { mediaType: declared, extension };
  };

  const rule = downloadRuleFor(input.artifactType, capability);

  if (rule.preferredMode === "source") {
    const source = fromRendition(input.renditions?.source || null);
    if (source) {
      return {
        mediaType: source.mediaType,
        extension: source.extension,
        filename: `${stem}.${source.extension}`,
      };
    }
    const extension = capability.sourceFormat.replace(/^\./, "");
    if (
      !extension ||
      extension === "json" ||
      extension.startsWith("oceanleo.") ||
      isEditorProjectDownloadMedia(extension, capability.sourceMediaType)
    ) {
      return null;
    }
    return {
      mediaType: capability.sourceMediaType,
      extension,
      filename: `${stem}.${extension}`,
    };
  }

  for (const purpose of [
    rule.preferredPurpose,
    ...rule.fallbackPurposes,
  ] as const) {
    if (purpose === "source") continue;
    const rendered = fromRendition(input.renditions?.[purpose] || null);
    if (rendered) {
      return {
        mediaType: rendered.mediaType,
        extension: rendered.extension,
        filename: `${stem}.${rendered.extension}`,
      };
    }
  }

  // Structured projects without a rendered export still advertise a safe
  // user-facing image type so shelf hints never fall back to editor JSON.
  return {
    mediaType: "image/png",
    extension: "png",
    filename: `${stem}.png`,
  };
}

export function artifactDownloadPlanFor(
  artifact: ArtifactProjection,
): ArtifactDownloadCandidate[] {
  if (!artifact.access.canRead || !artifact.integrity.ok) return [];
  const gameFormatAccess =
    artifact.artifactType === "game"
      ? gameSourceFormatAccess(artifact.sourceFormat)
      : null;

  const capability =
    advancedCapabilityForArtifactFields({
      artifactType: artifact.artifactType,
      sourceFormat: artifact.sourceFormat,
      editorCapability: artifact.editorCapability,
    }) ||
    ADVANCED_CAPABILITY_MATRIX.find(
      (entry) =>
        entry.sourceFormat === artifact.sourceFormat.trim().toLowerCase() &&
        entry.artifactBindings.some(
          (binding) => binding.artifactType === artifact.artifactType,
        ),
    ) ||
    null;

  const candidate = (
    purpose: "source" | "full" | "preview",
    mode: "source" | "export",
  ): ArtifactDownloadCandidate | null => {
    const rendition = artifact.renditions[purpose];
    if (
      rendition?.purpose !== purpose ||
      rendition.revisionId !== artifact.revisionId ||
      !rendition.url ||
      (mode === "source" && !rendition.digest)
    ) {
      return null;
    }
    if (
      purpose === "source" &&
      capability &&
      artifact.sourceFormat.trim().toLowerCase() === capability.sourceFormat &&
      (rendition.format.trim().toLowerCase() !== capability.sourceFormat ||
        mediaType(rendition.mediaType) !== capability.sourceMediaType)
    ) {
      return null;
    }
    if (
      purpose === "source" &&
      (!capability ||
        artifact.sourceFormat.trim().toLowerCase() !==
          capability.sourceFormat)
    ) {
      if (
        gameFormatAccess !== "legacy-read-only" &&
        isEditorProjectDownloadMedia(rendition.format, rendition.mediaType)
      ) {
        return null;
      }
    }
    if (
      mode === "export" &&
      (capability?.openMode === "structured-project" ||
        isEditorProjectDownloadMedia(rendition.format, rendition.mediaType))
    ) {
      if (isEditorProjectDownloadMedia(rendition.format, rendition.mediaType)) {
        return null;
      }
    }
    return { purpose, mode, rendition };
  };

  const exportCandidates = (
    purposes: readonly ("full" | "preview")[],
  ): ArtifactDownloadCandidate[] => {
    if (!artifact.access.canPreview) return [];
    return purposes.flatMap((purpose) => {
      const value = candidate(purpose, "export");
      return value ? [value] : [];
    });
  };

  if (capability) {
    const rule = downloadRuleFor(artifact.artifactType, capability);
    if (rule.preferredMode === "source") {
      if (artifact.access.canExportSource) {
        const source = candidate("source", "source");
        // A claimed source permission must not silently degrade around a
        // missing, stale, or wrongly typed source rendition.
        return source ? [source] : [];
      }
      return exportCandidates(rule.fallbackPurposes);
    }
    return exportCandidates([
      rule.preferredPurpose as "full",
      ...rule.fallbackPurposes,
    ]);
  }

  if (artifact.access.canExportSource) {
    const source = candidate("source", "source");
    return source ? [source] : [];
  }
  return exportCandidates(SOURCE_DOWNLOAD_RULE.fallbackPurposes);
}

/**
 * Canonical exact-binding context id shared by every OceanLeo site:
 * `olctx:v1:<siteKey>:app:<encodeURIComponent(appId)>`, both inputs trimmed.
 * Matches `catalog_contexts.external_context_id` in the production catalog.
 * Returns "" when either part is missing so callers can fall back to the
 * friendly no-context empty state instead of guessing a binding.
 */
export function canonicalArtifactContextId(
  siteKey: string,
  appId: string,
): string {
  const site = String(siteKey ?? "").trim();
  const app = String(appId ?? "").trim();
  if (!site || !app) return "";
  return `olctx:v1:${site}:app:${encodeURIComponent(app)}`;
}

/** Single source for the "no exact context" copy shown by material surfaces. */
export const ARTIFACT_CONTEXT_MISSING_MESSAGE =
  "素材面板缺少上下文标识，无法加载专属素材。";

export function normalizeArtifactContextRef(
  value: unknown,
): ArtifactContextRef | null {
  const raw = record(value);
  if (!raw) return null;
  const contextId = text(raw.contextId, raw.context_id);
  const siteKey = text(raw.siteKey, raw.site_key);
  if (!contextId || !siteKey) return null;
  const appId = text(raw.appId, raw.app_id);
  const functionId = text(raw.functionId, raw.function_id);
  return {
    contextId,
    siteKey,
    ...(appId ? { appId } : {}),
    ...(functionId ? { functionId } : {}),
  };
}

export function artifactContextKey(
  context: ArtifactContextRef,
): string {
  // JS callers may hand us refs with missing fields despite the TS type.
  return [
    String(context?.contextId ?? "").trim(),
    String(context?.siteKey ?? "").trim(),
    String(context?.appId ?? "").trim(),
    String(context?.functionId ?? "").trim(),
  ].join("::");
}

export function artifactContextsEqual(
  left: ArtifactContextRef,
  right: ArtifactContextRef,
): boolean {
  return artifactContextKey(left) === artifactContextKey(right);
}

export function artifactHasExactContext(
  artifact: ArtifactProjection,
  context: string | ArtifactContextRef,
): boolean {
  const expected =
    typeof context === "string"
      ? context.trim()
      : String(context?.contextId ?? "").trim();
  return Boolean(
    expected &&
      artifact.bindings.some(
        (binding) =>
          binding.contextId === expected &&
          binding.pinnedRevisionId === artifact.revisionId,
      ),
  );
}

/**
 * Resolve one typed artifact through the shared plane. Exact App filtering and
 * global routeability are explicit policies: neither the origin site nor the
 * calling site can alter feature/adapter identity.
 */
export function resolveAdvancedCapabilityDispatch(
  artifact: ArtifactProjection,
  policy: AdvancedCapabilityDispatchPolicy,
): AdvancedCapabilityDispatchResult {
  if (!artifact?.artifactId || !artifact.revisionId) {
    return {
      ok: false,
      code: "invalid-artifact-identity",
      reason: "artifact dispatch 缺少 artifactId/revisionId。",
    };
  }
  if (!artifact.integrity?.ok) {
    return {
      ok: false,
      code: "integrity-failed",
      reason:
        artifact.integrity?.reason ||
        "artifact 未通过完整性校验，不能进入进阶编辑器。",
    };
  }
  if (
    !artifact.access?.canRead ||
    (!artifact.access.canEdit && !artifact.access.canFork) ||
    artifact.editability === "view_only"
  ) {
    return {
      ok: false,
      code: "access-denied",
      reason: "当前主体没有读取并编辑或 fork 此 revision 的权限。",
    };
  }
  const source = artifact.renditions?.source;
  if (
    !source ||
    source.purpose !== "source" ||
    source.revisionId !== artifact.revisionId ||
    !source.url ||
    !source.digest
  ) {
    return {
      ok: false,
      code: "missing-source",
      reason: "当前 revision 缺少带摘要且 revision 一致的 source rendition。",
    };
  }
  const capability = advancedCapabilityForArtifactFields({
    artifactType: artifact.artifactType,
    sourceFormat: artifact.sourceFormat,
    editorCapability: artifact.editorCapability,
  });
  if (!capability) {
    return {
      ok: false,
      code: "incompatible-capability",
      reason:
        `editor capability ${artifact.editorCapability || "missing"} 与 typed artifact ` +
        `${artifact.artifactType} 不匹配。`,
    };
  }

  let contextId: string | null = null;
  let siteKey: string | null = null;
  if (policy?.scope === "exact-context") {
    contextId =
      typeof policy.context === "string"
        ? policy.context.trim()
        : String(policy.context?.contextId || "").trim();
    siteKey =
      typeof policy.context === "string"
        ? null
        : String(policy.context?.siteKey || "").trim() || null;
    if (!contextId) {
      return {
        ok: false,
        code: "context-required",
        reason: "exact-context dispatch 缺少 contextId。",
      };
    }
    if (!artifactHasExactContext(artifact, contextId)) {
      return {
        ok: false,
        code: "context-mismatch",
        reason: "artifact 未绑定到当前 App 的同一 revision。",
      };
    }
  } else if (policy?.scope !== "global") {
    return {
      ok: false,
      code: "context-required",
      reason: "dispatch 必须显式选择 global 或 exact-context policy。",
    };
  }

  return {
    ok: true,
    capability,
    receipt: {
      schema: "oceanleo.advanced-capability-dispatch.v1",
      artifactId: artifact.artifactId,
      revisionId: artifact.revisionId,
      featureId: capability.featureId,
      artifactType: artifact.artifactType,
      sourceFormat: artifact.sourceFormat,
      editorCapability: String(artifact.editorCapability),
      adapter: capability.adapter,
      projectSchema: capability.projectSchema,
      sourceRevisionId: source.revisionId,
      sourceDigest: source.digest,
      context: {
        scope: policy.scope,
        contextId,
        siteKey,
        exact: policy.scope === "exact-context",
      },
    },
  };
}

export function artifactIsVisible(
  artifact: ArtifactProjection,
): boolean {
  return Boolean(
    artifact.access.canRead &&
      artifact.access.canPreview &&
      artifact.integrity.ok &&
      artifact.provenance?.id &&
      artifact.provenance.sourceKind &&
      artifact.provenance.licenseCode,
  );
}

export function normalizeArtifactEditorCommand(
  value: unknown,
): ArtifactEditorCommand | null {
  const raw = record(value);
  const source = record(raw?.source);
  const target = record(raw?.target);
  const strategy = record(raw?.strategy);
  const expectedRevision = record(raw?.expectedRevision);
  const cas = record(raw?.cas);
  if (
    !raw ||
    raw.schema !== "oceanleo.editor-command.v1" ||
    !["insert", "replace"].includes(text(raw.action)) ||
    !text(raw.commandId) ||
    !text(raw.historyGroupId) ||
    !source ||
    !target ||
    !strategy ||
    !expectedRevision ||
    !cas
  ) {
    return null;
  }
  const action = text(raw.action) as "insert" | "replace";
  const artifactId = text(source.artifactId, source.artifact_id);
  const revisionId = text(source.revisionId, source.revision_id);
  const artifactType = normalizeArtifactType(
    source.artifactType ?? source.artifact_type,
  );
  const sourceFormat = text(source.sourceFormat, source.source_format);
  const documentId = text(target.documentId, target.document_id);
  const targetRevisionId = text(
    expectedRevision.targetRevisionId,
    expectedRevision.target_revision_id,
  );
  const expectedRevisionId = text(
    cas.expectedRevisionId,
    cas.expected_revision_id,
  );
  const mode = text(strategy.mode);
  if (
    !artifactId ||
    !revisionId ||
    !artifactType ||
    !sourceFormat ||
    !documentId ||
    !targetRevisionId ||
    !expectedRevisionId ||
    targetRevisionId !== expectedRevisionId ||
    (action === "insert" && mode !== "insert-new-object") ||
    (action === "replace" &&
      mode !== "replace-selection" &&
      mode !== "replace-slot")
  ) {
    return null;
  }
  const geometry = record(target.geometry);
  const preserve = stringList(strategy.preserve).filter(
    (entry): entry is "slot" | "geometry" =>
      entry === "slot" || entry === "geometry",
  );
  if (
    action === "replace" &&
    (!text(target.targetId, target.target_id) ||
      !text(target.slotId, target.slot_id) ||
      !geometry ||
      ![geometry.x, geometry.y, geometry.width, geometry.height].every(
        (entry) => typeof entry === "number" && Number.isFinite(entry),
      ) ||
      Number(geometry.width) <= 0 ||
      Number(geometry.height) <= 0 ||
      !preserve.includes("slot") ||
      !preserve.includes("geometry"))
  ) {
    return null;
  }
  const normalizedGeometry = geometry
    ? (Object.fromEntries(
        Object.entries(geometry).filter(
          ([, entry]) =>
            typeof entry === "number" && Number.isFinite(entry),
        ),
      ) as Record<string, number>)
    : null;
  return {
    schema: "oceanleo.editor-command.v1",
    commandId: text(raw.commandId),
    historyGroupId: text(raw.historyGroupId),
    action,
    source: {
      artifactId,
      revisionId,
      artifactType,
      sourceFormat,
    },
    target: {
      documentId,
      ...(text(target.targetId, target.target_id)
        ? { targetId: text(target.targetId, target.target_id) }
        : {}),
      ...(text(target.slotId, target.slot_id)
        ? { slotId: text(target.slotId, target.slot_id) }
        : {}),
      ...(normalizedGeometry
        ? { geometry: normalizedGeometry }
        : {}),
    },
    strategy:
      action === "insert"
        ? { mode: "insert-new-object" }
        : {
            mode: mode as "replace-selection" | "replace-slot",
            preserve,
          },
    expectedRevision: { targetRevisionId },
    cas: { expectedRevisionId },
  };
}
