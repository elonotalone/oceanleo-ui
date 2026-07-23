/**
 * Typed artifact control-plane contract.
 *
 * URLs are short-lived renditions. `artifactId + revisionId` is the identity
 * carried across Preview, Edit, Insert, Replace, favorites and bindings.
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
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

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
  preferredPurpose: "source";
  preferredMode: "source";
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
      {
        artifactType: "vector_image",
        editorCapabilities: ["vector-editor"],
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
] as const;

export type AdvancedFeatureId =
  (typeof ADVANCED_CAPABILITY_ROWS)[number]["featureId"];

const ADVANCED_DOWNLOAD_RULE: AdvancedCapabilityDownloadRule = Object.freeze({
  preferredPurpose: "source",
  preferredMode: "source",
  fallbackPurposes: Object.freeze(["full", "preview"] as const),
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
          download: ADVANCED_DOWNLOAD_RULE,
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

if (
  ADVANCED_CAPABILITY_MATRIX.length !== 12 ||
  ADVANCED_CAPABILITY_MATRIX.length !== ADVANCED_EDITOR_ADAPTER_IDS.length
) {
  throw new Error("The shared advanced capability plane must contain 12 rows");
}

export function advancedCapabilityContractPayload(): {
  schema: "oceanleo.advanced-capability-contract.v1";
  version: 1;
  roundTripCapabilities: readonly ["load", "mutate", "save", "reopen"];
  capabilities: readonly AdvancedCapabilityContractEntry[];
} {
  return {
    schema: "oceanleo.advanced-capability-contract.v1",
    version: 1,
    roundTripCapabilities: ["load", "mutate", "save", "reopen"],
    capabilities: ADVANCED_CAPABILITY_MATRIX,
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
  const sourceFormat = String(input.sourceFormat || "").trim().toLowerCase();
  const editorCapability = String(input.editorCapability || "")
    .trim()
    .toLowerCase();
  if (
    !sourceFormat ||
    !editorCapability ||
    !artifactSourceFormatIsCompatible(input.artifactType, sourceFormat)
  ) {
    return null;
  }
  return (
    ADVANCED_CAPABILITY_BY_BINDING.get(
      advancedBindingKey(input.artifactType, editorCapability),
    ) || null
  );
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
  digest: string | null;
}

export interface ArtifactSceneEvidence {
  schema: string;
  sceneRevisionId: string;
  closureStatus: "complete" | "not_required" | "missing" | "unknown";
  closureDigest: string | null;
  dependencyRevisionIds: string[];
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
  licenseUrl: string;
  attribution: string;
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
  provenance: ArtifactProvenance | null;
  bindings: ArtifactContextBinding[];
  integrity: ArtifactIntegrity;
  createdAt: string | null;
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

const ARTIFACT_TYPE_SET = new Set<string>(ARTIFACT_TYPES);
const RENDITION_PURPOSES: ArtifactRenditionPurpose[] = [
  "thumbnail",
  "preview",
  "full",
  "source",
  "editor_manifest",
];

const SOURCE_FORMAT_EXACT: Readonly<Record<ArtifactType, ReadonlySet<string>>> = {
  single_file_image: new Set([
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "bmp",
    "tiff",
    "psd",
    "avif",
  ]),
  composite_image: new Set([
    "fabric-json",
    "oceanleo-scene+json",
    "scene+json",
    "psd-manifest+json",
    "oceanleo.design-document.v1",
  ]),
  vector_image: new Set(["svg", "svg+xml", "ai", "eps"]),
  chart: new Set([
    "json",
    "vega",
    "vega-lite",
    "echarts",
    "echarts-option+json",
    "oceanleo.chart.v1",
  ]),
  document: new Set([
    "markdown",
    "md",
    "txt",
    "text",
    "html",
    "doc",
    "docx",
    "rtf",
    "odt",
    "json",
    "zip",
    "binary",
    "tiptap-json",
    "tiptap-json@1",
  ]),
  grid: new Set(["csv", "xls", "xlsx", "ods", "oceanleo.grid.v1"]),
  deck: new Set(["ppt", "pptx", "odp", "oceanleo.deck.v1"]),
  pdf: new Set(["pdf", "application/pdf"]),
  website: new Set([
    "html",
    "text/html",
    "zip",
    "website-source@1",
    "oceanleo.website-project.v1",
  ]),
  video: new Set([
    "mp4",
    "mov",
    "webm",
    "mkv",
    "avi",
    "timeline-json",
    "oceanleo.timeline.v1",
  ]),
  audio: new Set([
    "mp3",
    "wav",
    "ogg",
    "flac",
    "m4a",
    "aac",
    "oceanleo.audio-project.v1",
  ]),
  model_3d: new Set(["glb", "gltf", "obj", "fbx", "stl", "usdz"]),
  workflow: new Set([
    "json",
    "oceanleo.workflow.v1",
    "oceanleo.video-canvas.v1",
    "oceanleo.video.project.v2",
  ]),
};

const SOURCE_FORMAT_PREFIXES: Readonly<
  Record<ArtifactType, readonly string[]>
> = {
  single_file_image: ["image/", "raster-"],
  composite_image: ["scene+"],
  vector_image: ["vector-", "image/svg"],
  chart: ["chart-", "oceanleo.chart."],
  document: [
    "text/",
    "application/",
    "document-",
    "richdoc-",
    "oceanleo.document.",
  ],
  grid: ["grid-", "oceanleo.grid."],
  deck: ["deck-", "oceanleo.deck."],
  pdf: ["pdf-"],
  website: ["website-", "oceanleo.website-"],
  video: ["video/", "video-", "oceanleo.timeline."],
  audio: ["audio/", "audio-", "oceanleo.audio-"],
  model_3d: ["model/", "model-", "3d-"],
  workflow: ["workflow-", "oceanleo.workflow."],
};

const artifactEditorCapabilities = Object.fromEntries(
  ARTIFACT_TYPES.map((artifactType) => [artifactType, new Set<string>()]),
) as Record<ArtifactType, Set<string>>;

for (const entry of ADVANCED_CAPABILITY_MATRIX) {
  for (const binding of entry.artifactBindings) {
    for (const editorCapability of binding.editorCapabilities) {
      artifactEditorCapabilities[binding.artifactType].add(editorCapability);
    }
  }
}

if (
  ARTIFACT_TYPES.some(
    (artifactType) => artifactEditorCapabilities[artifactType].size === 0,
  )
) {
  throw new Error("Every typed artifact must resolve through the shared matrix");
}

export const ARTIFACT_EDITOR_CAPABILITIES: Readonly<
  Record<ArtifactType, ReadonlySet<string>>
> = Object.freeze(artifactEditorCapabilities);

const CHART_OPTION_SOURCE_FORMATS = new Set([
  "echarts-option+json",
  "oceanleo.chart.v1",
]);

export function artifactSourceFormatIsCompatible(
  artifactType: ArtifactType,
  sourceFormat: unknown,
): boolean {
  const normalized = String(sourceFormat || "").trim().toLowerCase();
  return Boolean(
    normalized &&
      (SOURCE_FORMAT_EXACT[artifactType].has(normalized) ||
        SOURCE_FORMAT_PREFIXES[artifactType].some((prefix) =>
          normalized.startsWith(prefix),
        )),
  );
}

export function artifactEditorCapabilityIsCompatible(
  artifactType: ArtifactType,
  editorCapability: unknown,
): boolean {
  return ARTIFACT_EDITOR_CAPABILITIES[artifactType].has(
    String(editorCapability || "").trim().toLowerCase(),
  );
}

export function chartOptionEvidenceIsPresent(input: {
  sourceFormat: unknown;
  editorManifest?: ArtifactRendition | null;
}): boolean {
  const sourceFormat = String(input.sourceFormat || "").trim().toLowerCase();
  return Boolean(
    CHART_OPTION_SOURCE_FORMATS.has(sourceFormat) ||
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

function trustedRenditionUrl(value: unknown): string {
  const candidate = text(value);
  if (!candidate || candidate.length > 4_096) return "";
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

function normalizeArtifactType(value: unknown): ArtifactType | null {
  const normalized = text(value).toLowerCase();
  return ARTIFACT_TYPE_SET.has(normalized)
    ? (normalized as ArtifactType)
    : null;
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
  const url = trustedRenditionUrl(
    text(raw.url, raw.signed_url, raw.signedUrl),
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
    digest: text(raw.digest, raw.sha256) || null,
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
  return result;
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
  };
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
  if (
    ![
      "owned",
      "generated",
      "internal",
      "user_upload",
      "agent",
      "agent_generated",
    ].includes(
      input.provenance.sourceKind.trim().toLowerCase(),
    ) &&
    !input.provenance.licenseUrl &&
    !input.provenance.attribution
  ) {
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
  if (
    input.editability !== "view_only" &&
    !artifactSourceFormatIsCompatible(input.artifactType, input.sourceFormat)
  ) {
    return {
      ok: false,
      code: "source-format-mismatch",
      reason: `source format ${input.sourceFormat || "missing"} 与 artifact type ${input.artifactType} 不匹配。`,
    };
  }
  if (
    input.editability !== "view_only" &&
    !artifactEditorCapabilityIsCompatible(
      input.artifactType,
      input.editorCapability,
    )
  ) {
    return {
      ok: false,
      code: "editor-capability-mismatch",
      reason: `editor capability ${input.editorCapability || "missing"} 与 artifact type ${input.artifactType} 不匹配。`,
    };
  }
  const advancedContract = advancedCapabilityForArtifactFields({
    artifactType: input.artifactType,
    sourceFormat: input.sourceFormat,
    editorCapability: input.editorCapability,
  });
  const declaredSourceMediaType = mediaType(input.renditions.source?.mediaType);
  if (
    advancedContract &&
    String(input.sourceFormat || "").trim().toLowerCase() ===
      advancedContract.sourceFormat &&
    declaredSourceMediaType &&
    declaredSourceMediaType !== advancedContract.sourceMediaType
  ) {
    return {
      ok: false,
      code: "source-format-mismatch",
      reason:
        `source Content-Type ${declaredSourceMediaType} 与 ${advancedContract.featureId} contract ` +
        `${advancedContract.sourceMediaType} 不一致。`,
    };
  }
  if (
    input.editability !== "view_only" &&
    input.artifactType === "chart" &&
    !chartOptionEvidenceIsPresent({
      sourceFormat: input.sourceFormat,
      editorManifest: input.renditions.editor_manifest,
    })
  ) {
    return {
      ok: false,
      code: "missing-editor-manifest",
      reason:
        "图表缺少 oceanleo.chart.v1 option 源或带摘要的 editor manifest，不能进入编辑器。",
    };
  }
  if (
    input.editability !== "view_only" &&
    input.artifactType === "composite_image"
  ) {
    if (!input.scene || input.scene.sceneRevisionId !== input.revisionId) {
      return {
        ok: false,
        code: "missing-scene",
        reason: "复合图片缺少与当前 revision 一致的 scene graph。",
      };
    }
    if (
      input.scene.closureStatus !== "complete" ||
      !input.scene.closureDigest
    ) {
      return {
        ok: false,
        code: "incomplete-dependency-closure",
        reason: "复合图片的 scene 依赖闭包不完整，不能安全编辑或重开。",
      };
    }
  }
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
  });
  const declaredIntegrity = record(raw.integrity);
  const declaredCode = text(declaredIntegrity?.code);
  const declaredReason = text(declaredIntegrity?.reason);
  const effectiveIntegrity =
    declaredIntegrity && declaredIntegrity.ok !== true
      ? {
          ok: false,
          code: (
            [
              "missing-acl",
              "missing-owner",
              "revision-mismatch",
              "missing-preview",
              "missing-source",
              "missing-scene",
              "missing-editor-manifest",
              "source-format-mismatch",
              "editor-capability-mismatch",
              "missing-provenance",
              "license-restricted",
              "incomplete-dependency-closure",
              "invalid-projection",
            ].includes(declaredCode)
              ? declaredCode
              : "invalid-projection"
          ) as ArtifactIntegrity["code"],
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
    provenance,
    bindings: normalizeBindings(
      raw.bindings ?? raw.context_bindings,
    ),
    integrity: effectiveIntegrity,
    createdAt: text(raw.createdAt, raw.created_at) || null,
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
      error: "artifact projection 缺少受支持的 artifactType。",
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
      ARTIFACT_TYPE_SET.has(value.artifactType),
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
    artifactType === "workflow"
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
    if (rendition?.url && rendition.revisionId === artifact.revisionId) {
      return rendition;
    }
  }
  return null;
}

export interface ArtifactDownloadCandidate {
  purpose: "source" | "editor_manifest" | "full" | "preview";
  mode: Extract<ArtifactAccessMode, "source" | "export">;
  rendition: ArtifactRendition;
}

/**
 * Contract-first download order. Source/editor-manifest renditions are
 * requested with `mode=source`; only rendered full/preview deliveries use
 * `mode=export`. A source-capable artifact fails closed instead of substituting
 * a rendered rendition.
 */
export function artifactDownloadPlanFor(
  artifact: ArtifactProjection,
): ArtifactDownloadCandidate[] {
  if (!artifact.access.canRead || !artifact.integrity.ok) return [];
  if (artifact.access.canExportSource) {
    const sourcePurpose = artifact.renditions.source
      ? "source"
      : "editor_manifest";
    const source = artifact.renditions[sourcePurpose];
    return source?.purpose === sourcePurpose &&
      source.revisionId === artifact.revisionId &&
      source.url &&
      source.digest
      ? [{ purpose: sourcePurpose, mode: "source", rendition: source }]
      : [];
  }
  const candidates: ArtifactDownloadCandidate[] = [];
  if (artifact.access.canPreview) {
    for (const purpose of ADVANCED_DOWNLOAD_RULE.fallbackPurposes) {
      const rendition = artifact.renditions[purpose];
      if (
        rendition?.purpose === purpose &&
        rendition.revisionId === artifact.revisionId &&
        rendition.url
      ) {
        candidates.push({ purpose, mode: "export", rendition });
      }
    }
  }
  return candidates;
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
        "artifact 未通过完整性校验，不能进入高级编辑器。",
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
  if (
    !artifactSourceFormatIsCompatible(
      artifact.artifactType,
      artifact.sourceFormat,
    )
  ) {
    return {
      ok: false,
      code: "incompatible-source",
      reason:
        `source format ${artifact.sourceFormat || "missing"} 与 artifact type ` +
        `${artifact.artifactType} 不匹配。`,
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
