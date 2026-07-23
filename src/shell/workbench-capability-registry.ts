import type { MediaType } from "../lib/database";
import {
  ADVANCED_CAPABILITY_CONTRACT,
  type AdvancedFeatureId,
} from "./artifact-contract";
import type { EditorCapabilityName, EditorManifestV1 } from "./library-data";

export type EditorRoute =
  | { type: "office"; ext: string }
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

export type EditorAdapterId =
  | "office"
  | "video-timeline"
  | "audio"
  | "image"
  | "pdf"
  | "richdoc"
  | "grid"
  | "chart-editor@1"
  | "deck"
  | "threed"
  | "website"
  | "design-canvas"
  | "video-canvas"
  | "none";

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
  roundTrip: readonly EditorCapabilityName[];
  projectSchema: string;
  viewportOwnership: "content" | "native";
  toolbarOwnership: "shared" | "native";
  persistence: "project" | "native-callback";
}

const ROUND_TRIP = ["load", "mutate", "save", "reopen"] as const;

/** The only executable adapter registry and artifact-capability route source. */
export const TRUSTED_EDITOR_REGISTRY: Readonly<
  Record<Exclude<EditorAdapterId, "none">, RegistryEntry>
> = {
  office: {
    routeType: "office",
    artifactCapabilities: ["office-editor"],
    roundTrip: ROUND_TRIP,
    projectSchema: "office-file@1",
    viewportOwnership: "native",
    toolbarOwnership: "native",
    persistence: "native-callback",
  },
  "video-timeline": {
    routeType: "video-timeline",
    artifactCapabilities: ["video-timeline"],
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.timeline.v1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  audio: {
    routeType: "audio",
    artifactCapabilities: ["audio-editor"],
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.audio-project.v1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  image: {
    routeType: "image",
    artifactCapabilities: [
      "image-editor",
      "composite-image-editor",
      "vector-editor",
    ],
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.fabric-image.v1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  pdf: {
    routeType: "pdf",
    artifactCapabilities: ["pdf-editor"],
    roundTrip: ROUND_TRIP,
    projectSchema: "pdf-binary@1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  richdoc: {
    routeType: "richdoc",
    artifactCapabilities: ["richdoc-editor"],
    roundTrip: ROUND_TRIP,
    projectSchema: "tiptap-json@1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  grid: {
    routeType: "grid",
    artifactCapabilities: ["grid-editor"],
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.grid.v1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  "chart-editor@1": {
    routeType: "grid",
    artifactCapabilities: ["chart-editor"],
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.chart.v1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  deck: {
    routeType: "deck",
    artifactCapabilities: ["deck-editor"],
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.deck.v1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  threed: {
    routeType: "threed",
    artifactCapabilities: ["model-3d-editor"],
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.model-view@1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  },
  website: {
    routeType: "embed",
    artifactCapabilities: ["website-editor", "website"],
    roundTrip: ROUND_TRIP,
    projectSchema: "website-source@1",
    viewportOwnership: "native",
    toolbarOwnership: "native",
    persistence: "project",
  },
  "design-canvas": {
    routeType: "embed",
    artifactCapabilities: ["design-canvas"],
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.design-document.v1",
    viewportOwnership: "native",
    toolbarOwnership: "native",
    persistence: "project",
  },
  "video-canvas": {
    routeType: "embed",
    artifactCapabilities: ["video-canvas"],
    roundTrip: ROUND_TRIP,
    projectSchema: "oceanleo.video-canvas.v1",
    viewportOwnership: "native",
    toolbarOwnership: "native",
    persistence: "project",
  },
};

const TRUSTED_ADAPTER_IDS = new Set<string>(
  Object.keys(TRUSTED_EDITOR_REGISTRY),
);

for (const capability of ADVANCED_CAPABILITY_CONTRACT) {
  if (!TRUSTED_ADAPTER_IDS.has(capability.adapter)) {
    throw new Error(
      `Advanced capability ${capability.featureId} references unknown adapter ${capability.adapter}`,
    );
  }
  const adapter = capability.adapter as Exclude<EditorAdapterId, "none">;
  const registry = TRUSTED_EDITOR_REGISTRY[adapter];
  if (
    registry.projectSchema !== capability.projectSchema ||
    !registry.artifactCapabilities.includes(capability.editorCapability)
  ) {
    throw new Error(
      `Advanced capability ${capability.featureId} drifted from adapter ${adapter}`,
    );
  }
}

export function registryEntryForAdvancedFeature(
  featureId: AdvancedFeatureId,
): RegistryEntry {
  const capability = ADVANCED_CAPABILITY_CONTRACT.find(
    (entry) => entry.featureId === featureId,
  );
  if (!capability || !TRUSTED_ADAPTER_IDS.has(capability.adapter)) {
    throw new Error(`Unknown advanced feature: ${featureId}`);
  }
  return TRUSTED_EDITOR_REGISTRY[
    capability.adapter as Exclude<EditorAdapterId, "none">
  ];
}

const ARTIFACT_CAPABILITY_ADAPTER = new Map<
  string,
  Exclude<EditorAdapterId, "none">
>();

for (const [adapter, entry] of Object.entries(TRUSTED_EDITOR_REGISTRY)) {
  for (const capability of entry.artifactCapabilities) {
    const normalized = capability.trim().toLowerCase();
    if (ARTIFACT_CAPABILITY_ADAPTER.has(normalized)) {
      throw new Error(
        `Duplicate trusted editor capability mapping: ${normalized}`,
      );
    }
    ARTIFACT_CAPABILITY_ADAPTER.set(
      normalized,
      adapter as Exclude<EditorAdapterId, "none">,
    );
  }
}

export function editorAdapterForArtifactCapability(
  capability: unknown,
): Exclude<EditorAdapterId, "none"> | null {
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
