import type { MediaType } from "../lib/database";
import {
  ADVANCED_CAPABILITY_MATRIX,
  advancedCapabilityForFeatureId,
  type AdvancedEditorAdapterId,
  type AdvancedFeatureId,
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

export interface RegistryEntry {
  routeType: EditorRoute["type"];
  artifactCapabilities: readonly string[];
  featureId: AdvancedFeatureId | null;
  routable: boolean;
  roundTrip: readonly EditorCapabilityName[];
  projectSchema: string;
  viewportOwnership: "content" | "native";
  toolbarOwnership: "shared" | "native";
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
