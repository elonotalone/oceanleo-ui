import type { MediaType } from "../lib/database";
import {
  ADVANCED_CAPABILITY_MATRIX,
  ARTIFACT_EDITOR_CAPABILITIES,
  advancedCapabilityForFeatureId,
  type AdvancedEditorAdapterId,
  type AdvancedFeatureId,
  type ArtifactType,
} from "./artifact-contract";
import type { EditorCapabilityName, EditorManifestV1 } from "./library-data";

export type EditorRoute =
  | { type: "video-timeline" }
  | { type: "audio" }
  | { type: "image" }
  | { type: "pdf" }
  | { type: "richdoc" }
  | { type: "grid"; adapter?: "chart-editor@1" }
  | { type: "deck" }
  | { type: "threed" }
  | { type: "game" }
  // `advanced-session.ts` remains outside this task and still deserializes these
  // historical route labels. No adapter or workbench route is registered here.
  | { type: "geo-map" }
  | { type: "interactive-doc" }
  | { type: "embed"; base: string; mediaType: MediaType }
  | { type: "none" };

export type EditorAdapterId = AdvancedEditorAdapterId | "none";

export const LEGACY_OFFICE_ADAPTER_ID = "office" as const;
export const LEGACY_OFFICE_EDITOR_CAPABILITY = "office-editor" as const;
export const LEGACY_OFFICE_PROJECT_SCHEMA = "office-file@1" as const;

const LEGACY_OFFICE_METADATA_TOKENS = new Set<string>([
  LEGACY_OFFICE_ADAPTER_ID,
  LEGACY_OFFICE_EDITOR_CAPABILITY,
  LEGACY_OFFICE_PROJECT_SCHEMA,
]);

export function isLegacyOfficeMetadata(value: unknown): boolean {
  return LEGACY_OFFICE_METADATA_TOKENS.has(
    String(value || "").trim().toLowerCase(),
  );
}

export interface EditorCapability {
  available: boolean;
  adapter: EditorAdapterId;
  route: EditorRoute;
  manifest: EditorManifestV1 | null;
  unavailableReason: string;
}

/**
 * 编辑栏归谁。
 *
 * `shared` = 外壳渲染那条共享编辑栏；`native` = 交给外站编辑器自己的 chrome；
 * `none` = **这一次挂载根本没有编辑栏**。
 *
 * 第三档是给非编辑类插件的：编辑栏是用来编辑一件素材的，而非编辑类插件没有素材
 * 输入，自身即体验，所以它一律没有编辑栏。这一档**不是适配器的属性**，因此下面
 * 15 个适配器一个都不写它：`grid` 一身二任（既是编辑类插件「表格编辑器」的内核，
 * 又是台账/文献矩阵/三表模型的渲染内核），同一个适配器两种挂法。哪一次挂载落进
 * `none`，由 `workbench-routes.ts` 的 `editBarOwnershipForItem()` 按挂的是插件
 * 实例还是素材来判。
 */
export type ToolbarOwnership = "shared" | "native" | "none";

export interface RegistryEntry {
  routeType: EditorRoute["type"];
  artifactCapabilities: readonly string[];
  featureId: AdvancedFeatureId | null;
  routable: boolean;
  roundTrip: readonly EditorCapabilityName[];
  projectSchema: string;
  viewportOwnership: "content" | "native";
  toolbarOwnership: ToolbarOwnership;
  persistence: "project" | "native-callback";
}

export type LegacyOfficeRegistryEntry = Omit<
  RegistryEntry,
  | "routeType"
  | "artifactCapabilities"
  | "featureId"
  | "routable"
  | "roundTrip"
  | "projectSchema"
> & {
  readonly routeType: "none";
  readonly artifactCapabilities: readonly [];
  readonly featureId: null;
  readonly routable: false;
  readonly roundTrip: readonly [];
  readonly projectSchema: typeof LEGACY_OFFICE_PROJECT_SCHEMA;
};

type RegistryRuntime = Omit<
  RegistryEntry,
  "artifactCapabilities" | "featureId" | "routable"
>;

const ROUND_TRIP = ["load", "mutate", "save", "reopen"] as const;

/** Runtime mechanics only; typed capability ownership comes from the matrix. */
const EDITOR_ADAPTER_RUNTIME: Readonly<
  Record<Exclude<EditorAdapterId, "none">, RegistryRuntime>
> = {
  "video-timeline": {
    routeType: "video-timeline",
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.timeline.v1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  audio: {
    routeType: "audio",
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.audio-project.v1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  image: {
    routeType: "image",
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.fabric-image.v1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  pdf: {
    routeType: "pdf",
    roundTrip: ROUND_TRIP,
    projectSchema: "pdf-binary@1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  richdoc: {
    routeType: "richdoc",
    roundTrip: ROUND_TRIP,
    projectSchema: "tiptap-json@1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  grid: {
    routeType: "grid",
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.grid.v1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  "chart-editor@1": {
    routeType: "grid",
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.chart.v1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  deck: {
    routeType: "deck",
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.deck.v1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  threed: {
    routeType: "threed",
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.model-view@1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  /**
   * 游戏走本地 route 而不是 `embed`：`embed` 会把整块视口交给一个外站编辑器
   * （website/design/video 三家），而游戏的可玩预览必须留在受控沙箱宿主里。
   */
  game: {
    routeType: "game",
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.game-bundle.v1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  website: {
    routeType: "embed",
    roundTrip: ROUND_TRIP,
    projectSchema: "website-source@1",
    viewportOwnership: "native",
    toolbarOwnership: "native",
    persistence: "project",
  },
  "design-canvas": {
    routeType: "embed",
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.design-document.v1",
    viewportOwnership: "native",
    toolbarOwnership: "native",
    persistence: "project",
  },
  "video-canvas": {
    routeType: "embed",
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.video-canvas.v1",
    viewportOwnership: "native",
    toolbarOwnership: "native",
    persistence: "project",
  },
};

function artifactCapabilitiesForAdapter(
  adapter: Exclude<EditorAdapterId, "none">,
): readonly string[] {
  const matrixEntry = ADVANCED_CAPABILITY_MATRIX.find(
    (entry) => entry.adapter === adapter,
  );
  return matrixEntry
    ? Object.freeze([
        ...new Set(
          matrixEntry.artifactBindings.flatMap(
            (binding) => binding.editorCapabilities,
          ),
        ),
      ])
    : Object.freeze([]);
}

/** Executable projection of the canonical matrix plus adapter runtime mechanics. */
const ROUTABLE_EDITOR_REGISTRY = Object.freeze(
  Object.fromEntries(
    Object.entries(EDITOR_ADAPTER_RUNTIME).map(([adapterValue, runtime]) => {
      const adapter = adapterValue as Exclude<EditorAdapterId, "none">;
      const matrixEntry = ADVANCED_CAPABILITY_MATRIX.find(
        (entry) => entry.adapter === adapter,
      );
      return [
        adapter,
        Object.freeze({
          ...runtime,
          artifactCapabilities: artifactCapabilitiesForAdapter(adapter),
          featureId: matrixEntry?.featureId || null,
          routable: Boolean(matrixEntry),
        }),
      ];
    }),
  ),
) as Readonly<Record<Exclude<EditorAdapterId, "none">, RegistryEntry>>;

const LEGACY_OFFICE_REGISTRY_ENTRY: LegacyOfficeRegistryEntry = Object.freeze({
  routeType: "none",
  artifactCapabilities: Object.freeze([] as const),
  featureId: null,
  routable: false,
  roundTrip: Object.freeze([] as const),
  projectSchema: LEGACY_OFFICE_PROJECT_SCHEMA,
  viewportOwnership: "content",
  toolbarOwnership: "shared",
  persistence: "project",
});

/**
 * `office` is a rejection sentinel, not an EditorAdapterId. Keeping the
 * historical metadata contract explicit prevents callers from interpreting a
 * missing registry key as permission to guess a fallback editor.
 */
export const TRUSTED_EDITOR_REGISTRY = Object.freeze({
  ...ROUTABLE_EDITOR_REGISTRY,
  office: LEGACY_OFFICE_REGISTRY_ENTRY,
}) as Readonly<
  Record<Exclude<EditorAdapterId, "none">, RegistryEntry> & {
    office: LegacyOfficeRegistryEntry;
  }
>;

const TRUSTED_ADAPTER_IDS = new Set<string>(
  Object.keys(ROUTABLE_EDITOR_REGISTRY),
);

for (const capability of ADVANCED_CAPABILITY_MATRIX) {
  if (!TRUSTED_ADAPTER_IDS.has(capability.adapter)) {
    throw new Error(
      `Advanced capability ${capability.featureId} references unknown adapter ${capability.adapter}`,
    );
  }
  const registry = TRUSTED_EDITOR_REGISTRY[capability.adapter];
  if (
    !registry.routable ||
    registry.featureId !== capability.featureId ||
    registry.projectSchema !== capability.projectSchema ||
    !registry.artifactCapabilities.includes(capability.editorCapability)
  ) {
    throw new Error(
      `Advanced capability ${capability.featureId} drifted from adapter ${capability.adapter}`,
    );
  }
}

if (
  TRUSTED_EDITOR_REGISTRY.office.routable ||
  TRUSTED_EDITOR_REGISTRY.office.routeType !== "none" ||
  TRUSTED_EDITOR_REGISTRY.office.featureId !== null ||
  TRUSTED_EDITOR_REGISTRY.office.artifactCapabilities.length !== 0 ||
  TRUSTED_EDITOR_REGISTRY.office.roundTrip.length !== 0 ||
  TRUSTED_EDITOR_REGISTRY.office.projectSchema !== LEGACY_OFFICE_PROJECT_SCHEMA
) {
  throw new Error(
    "Legacy Office/native-Chrome adapter must not be routable",
  );
}

export function registryEntryForAdvancedFeature(
  featureId: AdvancedFeatureId,
): RegistryEntry {
  const capability = advancedCapabilityForFeatureId(featureId);
  if (!capability) {
    throw new Error(`Unknown advanced feature: ${featureId}`);
  }
  return TRUSTED_EDITOR_REGISTRY[capability.adapter];
}

const ARTIFACT_CAPABILITY_ADAPTER = new Map<
  string,
  AdvancedEditorAdapterId
>();
const AMBIGUOUS_ARTIFACT_CAPABILITIES = new Set<string>();

for (const entry of ADVANCED_CAPABILITY_MATRIX) {
  for (const binding of entry.artifactBindings) {
    for (const capability of binding.editorCapabilities) {
      const normalized = capability.trim().toLowerCase();
      if (AMBIGUOUS_ARTIFACT_CAPABILITIES.has(normalized)) continue;
      const existing = ARTIFACT_CAPABILITY_ADAPTER.get(normalized);
      if (existing && existing !== entry.adapter) {
        ARTIFACT_CAPABILITY_ADAPTER.delete(normalized);
        AMBIGUOUS_ARTIFACT_CAPABILITIES.add(normalized);
        continue;
      }
      ARTIFACT_CAPABILITY_ADAPTER.set(normalized, entry.adapter);
    }
  }
}

if (
  !AMBIGUOUS_ARTIFACT_CAPABILITIES.has(
    LEGACY_OFFICE_EDITOR_CAPABILITY,
  ) ||
  ARTIFACT_CAPABILITY_ADAPTER.has(LEGACY_OFFICE_EDITOR_CAPABILITY)
) {
  throw new Error(
    "Legacy office-editor capability must require a typed artifact remap",
  );
}

export function editorAdapterForArtifactCapability(
  capability: unknown,
): AdvancedEditorAdapterId | null {
  return (
    ARTIFACT_CAPABILITY_ADAPTER.get(
      String(capability || "").trim().toLowerCase(),
    ) || null
  );
}

export function editorRouteHintForArtifactCapability(
  capability: unknown,
): Exclude<EditorRoute["type"], "none"> | "" {
  const adapter = editorAdapterForArtifactCapability(capability);
  const route = adapter ? TRUSTED_EDITOR_REGISTRY[adapter].routeType : "none";
  return route === "none" ? "" : route;
}

/**
 * 这一类 artifact 有没有一个**到得了的**编辑器。
 *
 * 存在的理由是一次真实的误答。素材站要回答「这件素材该不该出编辑按钮」，手里没有
 * 这个函数，于是抄了后端的 `RELEASED_EDITOR_FEATURE_IDS`（六个 feature id）当判据，
 * 结果 `website`、`composite_image`、`vector_image`、`model_3d`、`deck`、`video`
 * 这些**编辑器早就存在并且可路由**的类型全被判成「这一类还没有已发布的编辑器」，
 * 一颗编辑按钮都不出。
 *
 * 那份名单本身没错，错在被拿去回答另一个问题：它钉的是 `ADVANCED_FEATURE_PACKS`，
 * 也就是**哪些能力被打包成了高级功能包**——一个产品与计费的划分。
 * 「用户能不能编辑这件东西」是另一件事，答案在这里：适配器注册表里
 * `routable` 为真、且承接了这一类声明的某个编辑能力。
 *
 * 注意 `route: "embed"` 同样算数。`website` / `design-canvas` / `video-canvas`
 * 走的是嵌入路由——共享工作台把站点自己的编辑器嵌进来——那是**一种落点，不是没有
 * 落点**。把 embed 排除掉会重蹈这个函数要修的那个错。
 *
 * 判据是推导出来的，不是又一份手抄清单：新增一个可路由适配器，这里自动跟上。
 */
export function artifactTypeHasRoutableEditor(artifactType: unknown): boolean {
  const key = String(artifactType || "").trim().toLowerCase() as ArtifactType;
  const capabilities = ARTIFACT_EDITOR_CAPABILITIES[key];
  if (!capabilities) return false;
  for (const capability of capabilities) {
    if (editorRouteHintForArtifactCapability(capability)) return true;
  }
  return false;
}
