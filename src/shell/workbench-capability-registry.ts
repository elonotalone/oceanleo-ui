import {
  ADVANCED_CAPABILITY_MATRIX,
  ARTIFACT_EDITOR_CAPABILITIES,
  advancedCapabilityForFeatureId,
  advancedCapabilityForAdapter,
  type AdvancedEditorAdapterId,
  type AdvancedFeatureId,
  type ArtifactType,
} from "./artifact-contract";
import type { EditorCapabilityName, EditorManifestV1 } from "./library-data";

export type EditorRoute =
  | { type: "video-timeline" }
  | { type: "image" }
  | { type: "pdf" }
  | { type: "richdoc" }
  | { type: "grid" }
  | { type: "deck" }
  | { type: "work" }
  // `advanced-session.ts` remains outside this task and still deserializes these
  // historical route labels. No adapter or workbench route is registered here.
  | { type: "geo-map" }
  | { type: "interactive-doc" }
  // 作品有独立工作台；设计画布并入图片编辑器。
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
 * 九个适配器一个都不写它：`grid` 一身二任（既是编辑类插件「表格编辑器」的内核，
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
  deck: {
    routeType: "deck",
    roundTrip: ROUND_TRIP,
    projectSchema: "pptx",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
};

function artifactCapabilitiesForAdapter(
  adapter: Exclude<EditorAdapterId, "none">,
): readonly string[] {
  return Object.freeze([...new Set(
    ADVANCED_CAPABILITY_MATRIX.filter((entry) => entry.adapter === adapter)
      .flatMap((entry) => entry.artifactBindings.flatMap((binding) => binding.editorCapabilities)),
  )]);
}

/** Executable projection of the canonical matrix plus adapter runtime mechanics. */
const ROUTABLE_EDITOR_REGISTRY = Object.freeze(
  Object.fromEntries(
    Object.entries(EDITOR_ADAPTER_RUNTIME).map(([adapterValue, runtime]) => {
      const adapter = adapterValue as Exclude<EditorAdapterId, "none">;
      const matrixEntry = advancedCapabilityForAdapter(adapter);
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

/** Six full editors. Historical Office metadata is rejected separately. */
export const TRUSTED_EDITOR_REGISTRY = ROUTABLE_EDITOR_REGISTRY;

const TRUSTED_ADAPTER_IDS = new Set<string>(
  Object.keys(ROUTABLE_EDITOR_REGISTRY),
);

for (const capability of ADVANCED_CAPABILITY_MATRIX) {
  if (capability.adapter === "work") continue;
  if (!TRUSTED_ADAPTER_IDS.has(capability.adapter)) {
    throw new Error(
      `Advanced capability ${capability.featureId} references unknown adapter ${capability.adapter}`,
    );
  }
  const registry = TRUSTED_EDITOR_REGISTRY[capability.adapter];
  if (
    !registry.routable ||
    !registry.artifactCapabilities.includes(capability.editorCapability)
  ) {
    throw new Error(
      `Advanced capability ${capability.featureId} drifted from adapter ${capability.adapter}`,
    );
  }
}

/**
 * 没有本地编辑器的存量 artifact 类型（矢量图 2026-10-22 起由图片编辑器打开，不在此列）：只读打开，原因写在 `workbench-routes.ts`。
 * - chart：图表编辑器已删除（2026-10-22）。
 * - audio / model_3d：保留音频播放与 3D 查看，不提供文件编辑器。
 * 单一来源——路由层与「有没有编辑器」的类型判据都读这里。
 */
export const READ_ONLY_ARTIFACT_TYPES: ReadonlySet<string> = new Set([
  "audio",
  "model_3d",
  "chart",
]);

export function registryEntryForAdvancedFeature(
  featureId: AdvancedFeatureId,
): RegistryEntry {
  const capability = advancedCapabilityForFeatureId(featureId);
  if (!capability || capability.adapter === "work") {
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
  if (entry.adapter === "work") continue;
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
 * 网站和游戏走作品工作台，不属于编辑器。音频与 3D 使用详情查看器。
 * 图表已无编辑器：合同矩阵与注册表都没有图表行，所以不算。
 *
 * 判据是推导出来的，不是又一份手抄清单：新增一个可路由适配器，这里自动跟上。
 */
export function artifactTypeHasRoutableEditor(artifactType: unknown): boolean {
  const key = String(artifactType || "").trim().toLowerCase() as ArtifactType;
  if (READ_ONLY_ARTIFACT_TYPES.has(key)) return false;
  const capabilities = ARTIFACT_EDITOR_CAPABILITIES[key];
  if (!capabilities) return false;
  for (const capability of capabilities) {
    if (editorRouteHintForArtifactCapability(capability)) return true;
  }
  return false;
}
