export const MODEL3D_DIRECTOR_SCHEMA =
  "oceanleo.model3d-director@1" as const;
export const MODEL3D_PREVIS_RECEIPT_SCHEMA =
  "oceanleo.model3d-previs-receipt@1" as const;

export type Model3DDirectorCommandId =
  | "bind-scene"
  | "create-shot"
  | "remove-shot"
  | "create-take"
  | "select-take"
  | "set-camera"
  | "set-lighting"
  | "set-pose"
  | "upsert-keyframe"
  | "remove-keyframe"
  | "capture-screenshot"
  | "capture-playblast";

export interface Model3DDirectorCommandDescriptor {
  id: Model3DDirectorCommandId;
  execution: "document" | "capture";
  requiresRenderer: boolean;
  description: string;
}

const directorCommand = (
  id: Model3DDirectorCommandId,
  execution: "document" | "capture",
  requiresRenderer: boolean,
  description: string,
): Model3DDirectorCommandDescriptor => ({
  id,
  execution,
  requiresRenderer,
  description,
});

export const MODEL3D_DIRECTOR_COMMAND_REGISTRY = Object.freeze([
  directorCommand("bind-scene", "document", false, "Bind a durable scene identity."),
  directorCommand("create-shot", "document", false, "Create a timed shot."),
  directorCommand("remove-shot", "document", false, "Remove a shot and its takes."),
  directorCommand("create-take", "document", false, "Create a take inside a shot."),
  directorCommand("select-take", "document", false, "Select an active shot and take."),
  directorCommand("set-camera", "document", false, "Set validated camera and lens metadata."),
  directorCommand("set-lighting", "document", false, "Set a shot lighting plan."),
  directorCommand("set-pose", "document", false, "Bind a node pose to a take."),
  directorCommand(
    "upsert-keyframe",
    "document",
    false,
    "Upsert a sorted camera motion keyframe.",
  ),
  directorCommand(
    "remove-keyframe",
    "document",
    false,
    "Remove a camera motion keyframe.",
  ),
  directorCommand(
    "capture-screenshot",
    "capture",
    false,
    "Capture a local scene screenshot when a capture adapter exists.",
  ),
  directorCommand(
    "capture-playblast",
    "capture",
    true,
    "Capture a playblast only through an explicit renderer adapter.",
  ),
]) as readonly Model3DDirectorCommandDescriptor[];

export type Model3DVector3 = readonly [number, number, number];

export interface Model3DDirectorTransform {
  position: Model3DVector3;
  /** Euler rotation in degrees, matching the real Three workbench controls. */
  rotation: Model3DVector3;
  scale: Model3DVector3;
}

export interface Model3DDirectorCamera {
  projection: "perspective" | "orthographic";
  fovDegrees: number;
  focalLengthMm: number;
  sensorWidthMm: number;
  apertureFStop: number;
  depthOfFieldEnabled: boolean;
  focusDistance: number;
  near: number;
  far: number;
  transform: Readonly<Model3DDirectorTransform>;
  target: Model3DVector3;
}

export interface Model3DDirectorLight {
  id: string;
  nodeId?: string;
  kind: "directional" | "point" | "spot" | "ambient";
  color: string;
  intensity: number;
  transform: Readonly<Model3DDirectorTransform>;
}

export interface Model3DDirectorLighting {
  environmentUrl: string;
  environmentIntensity: number;
  exposure: number;
  lights: readonly Readonly<Model3DDirectorLight>[];
}

export interface Model3DDirectorPose {
  id: string;
  nodeId: string;
  nodePath?: string;
  transform: Readonly<Model3DDirectorTransform>;
}

export interface Model3DMotionKeyframe {
  id: string;
  timeMs: number;
  transform: Readonly<Model3DDirectorTransform>;
  target: Model3DVector3;
  fovDegrees: number;
  focalLengthMm: number;
  apertureFStop: number;
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export interface Model3DDirectorTake {
  id: string;
  name: string;
  poses: readonly Readonly<Model3DDirectorPose>[];
  motionPath: readonly Readonly<Model3DMotionKeyframe>[];
}

export interface Model3DDirectorShot {
  id: string;
  name: string;
  startMs: number;
  durationMs: number;
  camera: Readonly<Model3DDirectorCamera>;
  lighting: Readonly<Model3DDirectorLighting>;
  takes: readonly Readonly<Model3DDirectorTake>[];
}

export interface Model3DSceneBinding {
  id: string;
  name?: string;
  sourceAssetId?: string;
  sourceRevisionId?: string;
}

export interface Model3DDirectorDocument {
  schema: typeof MODEL3D_DIRECTOR_SCHEMA;
  revision: number;
  scene: Readonly<Model3DSceneBinding>;
  shots: readonly Readonly<Model3DDirectorShot>[];
  activeShotId: string;
  activeTakeId: string;
  updatedAt: string;
}

export interface Model3DDirectorClock {
  now?: () => string;
  makeId?: (prefix: string) => string;
}

const DEFAULT_TRANSFORM: Model3DDirectorTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

function now(clock?: Model3DDirectorClock): string {
  return clock?.now?.() || new Date().toISOString();
}

function defaultId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "");
  return `${prefix}_${random || `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2)}`}`;
}

function makeId(prefix: string, clock?: Model3DDirectorClock): string {
  return clock?.makeId?.(prefix) || defaultId(prefix);
}

function finite(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const numeric = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return numeric;
}

function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const numeric = finite(value, fallback, minimum, maximum, label);
  if (!Number.isInteger(numeric)) throw new Error(`${label} must be an integer`);
  return numeric;
}

function safeId(value: unknown, fallback = ""): string {
  const id = typeof value === "string" ? value.trim() : "";
  return (id || fallback)
    .replace(/[^a-z0-9_.:-]/gi, "-")
    .slice(0, 120);
}

function safeText(value: unknown, maximum = 240): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function safeUrl(value: unknown): string {
  const url = safeText(value, 2_000);
  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    return ["http:", "https:"].includes(new URL(url).protocol) ? url : "";
  } catch {
    return "";
  }
}

function vector3(
  value: unknown,
  fallback: Model3DVector3,
  label: string,
  minimum = -1_000_000,
  maximum = 1_000_000,
): Model3DVector3 {
  const values = Array.isArray(value) ? value : fallback;
  if (values.length < 3) throw new Error(`${label} must contain three values`);
  return Object.freeze([
    finite(values[0], fallback[0], minimum, maximum, `${label}.x`),
    finite(values[1], fallback[1], minimum, maximum, `${label}.y`),
    finite(values[2], fallback[2], minimum, maximum, `${label}.z`),
  ]) as Model3DVector3;
}

export function normalizeModel3DDirectorTransform(
  value: unknown,
  fallback: Model3DDirectorTransform = DEFAULT_TRANSFORM,
): Readonly<Model3DDirectorTransform> {
  const record =
    value && typeof value === "object"
      ? (value as Partial<Model3DDirectorTransform>)
      : {};
  return Object.freeze({
    position: vector3(record.position, fallback.position, "position"),
    rotation: vector3(
      record.rotation,
      fallback.rotation,
      "rotation",
      -3_600,
      3_600,
    ),
    scale: vector3(record.scale, fallback.scale, "scale", 0.0001, 100_000),
  });
}

export function model3DFovForLens(
  focalLengthMm: number,
  sensorWidthMm = 36,
): number {
  const focal = finite(focalLengthMm, 50, 1, 500, "focal length");
  const sensor = finite(sensorWidthMm, 36, 1, 100, "sensor width");
  return (2 * Math.atan(sensor / (2 * focal)) * 180) / Math.PI;
}

export function model3DLensForFov(
  fovDegrees: number,
  sensorWidthMm = 36,
): number {
  const fov = finite(fovDegrees, 39.6, 1, 179, "field of view");
  const sensor = finite(sensorWidthMm, 36, 1, 100, "sensor width");
  return sensor / (2 * Math.tan((fov * Math.PI) / 360));
}

const DEFAULT_CAMERA: Model3DDirectorCamera = {
  projection: "perspective",
  fovDegrees: model3DFovForLens(50, 36),
  focalLengthMm: 50,
  sensorWidthMm: 36,
  apertureFStop: 2.8,
  depthOfFieldEnabled: false,
  focusDistance: 5,
  near: 0.01,
  far: 10_000,
  transform: {
    ...DEFAULT_TRANSFORM,
    position: [0, 1.5, 5],
  },
  target: [0, 0, 0],
};

export function normalizeModel3DDirectorCamera(
  value: unknown,
  fallback: Model3DDirectorCamera = DEFAULT_CAMERA,
  authority: "fov" | "lens" = "fov",
): Readonly<Model3DDirectorCamera> {
  const record =
    value && typeof value === "object"
      ? (value as Partial<Model3DDirectorCamera>)
      : {};
  const sensorWidthMm = finite(
    record.sensorWidthMm,
    fallback.sensorWidthMm,
    1,
    100,
    "sensor width",
  );
  let fovDegrees = finite(
    record.fovDegrees,
    fallback.fovDegrees,
    1,
    179,
    "field of view",
  );
  let focalLengthMm = finite(
    record.focalLengthMm,
    fallback.focalLengthMm,
    1,
    500,
    "focal length",
  );
  if (authority === "lens") {
    fovDegrees = model3DFovForLens(focalLengthMm, sensorWidthMm);
  } else {
    focalLengthMm = model3DLensForFov(fovDegrees, sensorWidthMm);
  }
  const near = finite(record.near, fallback.near, 0.0001, 1_000_000, "near");
  const far = finite(record.far, fallback.far, 0.001, 10_000_000, "far");
  if (far <= near) throw new Error("camera far plane must be greater than near");
  return Object.freeze({
    projection:
      record.projection === "orthographic" ? "orthographic" : "perspective",
    fovDegrees,
    focalLengthMm,
    sensorWidthMm,
    apertureFStop: finite(
      record.apertureFStop,
      fallback.apertureFStop,
      0.7,
      64,
      "aperture",
    ),
    depthOfFieldEnabled:
      record.depthOfFieldEnabled === undefined
        ? fallback.depthOfFieldEnabled
        : record.depthOfFieldEnabled === true,
    focusDistance: finite(
      record.focusDistance,
      fallback.focusDistance,
      0.001,
      1_000_000,
      "focus distance",
    ),
    near,
    far,
    transform: normalizeModel3DDirectorTransform(
      record.transform,
      fallback.transform,
    ),
    target: vector3(record.target, fallback.target, "camera target"),
  });
}

const DEFAULT_LIGHTING: Model3DDirectorLighting = {
  environmentUrl: "",
  environmentIntensity: 1,
  exposure: 1,
  lights: [],
};

function normalizeLight(
  value: unknown,
  fallbackId: string,
): Readonly<Model3DDirectorLight> {
  const record =
    value && typeof value === "object"
      ? (value as Partial<Model3DDirectorLight>)
      : {};
  const color = String(record.color || "#ffffff");
  return Object.freeze({
    id: safeId(record.id, fallbackId),
    ...(safeId(record.nodeId) ? { nodeId: safeId(record.nodeId) } : {}),
    kind: ["directional", "point", "spot", "ambient"].includes(
      String(record.kind),
    )
      ? (record.kind as Model3DDirectorLight["kind"])
      : "directional",
    color: /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#ffffff",
    intensity: finite(record.intensity, 1, 0, 100_000, "light intensity"),
    transform: normalizeModel3DDirectorTransform(record.transform),
  });
}

export function normalizeModel3DDirectorLighting(
  value: unknown,
  fallback: Model3DDirectorLighting = DEFAULT_LIGHTING,
): Readonly<Model3DDirectorLighting> {
  const record =
    value && typeof value === "object"
      ? (value as Partial<Model3DDirectorLighting>)
      : {};
  const values = Array.isArray(record.lights) ? record.lights.slice(0, 64) : [];
  const used = new Set<string>();
  const lights = values.flatMap((entry, index) => {
    const light = normalizeLight(entry, `light-${index + 1}`);
    if (!light.id || used.has(light.id)) return [];
    used.add(light.id);
    return [light];
  });
  return Object.freeze({
    environmentUrl:
      safeUrl(record.environmentUrl) || fallback.environmentUrl || "",
    environmentIntensity: finite(
      record.environmentIntensity,
      fallback.environmentIntensity,
      0,
      10,
      "environment intensity",
    ),
    exposure: finite(record.exposure, fallback.exposure, 0.01, 20, "exposure"),
    lights: Object.freeze(lights),
  });
}

function normalizePose(
  value: unknown,
  fallbackId: string,
): Readonly<Model3DDirectorPose> {
  const record =
    value && typeof value === "object"
      ? (value as Partial<Model3DDirectorPose>)
      : {};
  const nodeId = safeId(record.nodeId);
  if (!nodeId) throw new Error("director pose requires a nodeId");
  return Object.freeze({
    id: safeId(record.id, fallbackId),
    nodeId,
    ...(safeText(record.nodePath, 1_000)
      ? { nodePath: safeText(record.nodePath, 1_000) }
      : {}),
    transform: normalizeModel3DDirectorTransform(record.transform),
  });
}

function normalizeKeyframe(
  value: unknown,
  camera: Model3DDirectorCamera,
  durationMs: number,
  fallbackId: string,
): Readonly<Model3DMotionKeyframe> {
  const record =
    value && typeof value === "object"
      ? (value as Partial<Model3DMotionKeyframe>)
      : {};
  const fovDegrees = finite(
    record.fovDegrees,
    camera.fovDegrees,
    1,
    179,
    "keyframe field of view",
  );
  const focalLengthMm =
    record.focalLengthMm === undefined
      ? model3DLensForFov(fovDegrees, camera.sensorWidthMm)
      : finite(
          record.focalLengthMm,
          camera.focalLengthMm,
          1,
          500,
          "keyframe focal length",
        );
  return Object.freeze({
    id: safeId(record.id, fallbackId),
    timeMs: integer(
      record.timeMs,
      0,
      0,
      durationMs,
      "keyframe time",
    ),
    transform: normalizeModel3DDirectorTransform(
      record.transform,
      camera.transform,
    ),
    target: vector3(record.target, camera.target, "keyframe target"),
    fovDegrees,
    focalLengthMm,
    apertureFStop: finite(
      record.apertureFStop,
      camera.apertureFStop,
      0.7,
      64,
      "keyframe aperture",
    ),
    easing: ["linear", "ease-in", "ease-out", "ease-in-out"].includes(
      String(record.easing),
    )
      ? (record.easing as Model3DMotionKeyframe["easing"])
      : "linear",
  });
}

function normalizeTake(
  value: unknown,
  camera: Model3DDirectorCamera,
  durationMs: number,
  fallbackId: string,
): Readonly<Model3DDirectorTake> {
  const record =
    value && typeof value === "object"
      ? (value as Partial<Model3DDirectorTake>)
      : {};
  const poseIds = new Set<string>();
  const poses = (Array.isArray(record.poses) ? record.poses : [])
    .slice(0, 512)
    .flatMap((entry, index) => {
      try {
        const pose = normalizePose(entry, `pose-${index + 1}`);
        if (poseIds.has(pose.id)) return [];
        poseIds.add(pose.id);
        return [pose];
      } catch {
        return [];
      }
    });
  const keyframes = (Array.isArray(record.motionPath) ? record.motionPath : [])
    .slice(0, 2_000)
    .flatMap((entry, index) => {
      try {
        return [
          normalizeKeyframe(
            entry,
            camera,
            durationMs,
            `keyframe-${index + 1}`,
          ),
        ];
      } catch {
        return [];
      }
    })
    .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));
  const uniqueTimes = new Set<number>();
  return Object.freeze({
    id: safeId(record.id, fallbackId),
    name: safeText(record.name) || `Take ${fallbackId}`,
    poses: Object.freeze(poses),
    motionPath: Object.freeze(
      keyframes.filter((entry) => {
        if (uniqueTimes.has(entry.timeMs)) return false;
        uniqueTimes.add(entry.timeMs);
        return true;
      }),
    ),
  });
}

function normalizeShot(
  value: unknown,
  fallbackId: string,
): Readonly<Model3DDirectorShot> {
  const record =
    value && typeof value === "object"
      ? (value as Partial<Model3DDirectorShot>)
      : {};
  const durationMs = integer(
    record.durationMs,
    5_000,
    100,
    86_400_000,
    "shot duration",
  );
  const camera = normalizeModel3DDirectorCamera(record.camera);
  const takeIds = new Set<string>();
  const takes = (Array.isArray(record.takes) ? record.takes : [])
    .slice(0, 128)
    .flatMap((entry, index) => {
      const take = normalizeTake(
        entry,
        camera,
        durationMs,
        `take-${index + 1}`,
      );
      if (!take.id || takeIds.has(take.id)) return [];
      takeIds.add(take.id);
      return [take];
    });
  const resolvedTakes = takes.length
    ? takes
    : [normalizeTake({ id: "take-1", name: "Take 1" }, camera, durationMs, "take-1")];
  return Object.freeze({
    id: safeId(record.id, fallbackId),
    name: safeText(record.name) || `Shot ${fallbackId}`,
    startMs: integer(
      record.startMs,
      0,
      0,
      86_400_000,
      "shot start",
    ),
    durationMs,
    camera,
    lighting: normalizeModel3DDirectorLighting(record.lighting),
    takes: Object.freeze(resolvedTakes),
  });
}

function freezeDirector(
  value: Model3DDirectorDocument,
): Readonly<Model3DDirectorDocument> {
  return Object.freeze(value);
}

export function createModel3DDirectorDocument(
  sceneId = "",
  clock: Model3DDirectorClock = {},
): Readonly<Model3DDirectorDocument> {
  return freezeDirector({
    schema: MODEL3D_DIRECTOR_SCHEMA,
    revision: 0,
    scene: Object.freeze({ id: safeId(sceneId) }),
    shots: Object.freeze([]),
    activeShotId: "",
    activeTakeId: "",
    updatedAt: now(clock),
  });
}

export function normalizeModel3DDirectorDocument(
  value: unknown,
  fallbackSceneId = "",
): Readonly<Model3DDirectorDocument> {
  if (!value || typeof value !== "object") {
    return createModel3DDirectorDocument(fallbackSceneId);
  }
  const record = value as Partial<Model3DDirectorDocument>;
  const sceneRecord =
    record.scene && typeof record.scene === "object" ? record.scene : { id: "" };
  const scene = Object.freeze({
    id: safeId(sceneRecord.id, safeId(fallbackSceneId)),
    ...(safeText(sceneRecord.name)
      ? { name: safeText(sceneRecord.name) }
      : {}),
    ...(safeId(sceneRecord.sourceAssetId)
      ? { sourceAssetId: safeId(sceneRecord.sourceAssetId) }
      : {}),
    ...(safeId(sceneRecord.sourceRevisionId)
      ? { sourceRevisionId: safeId(sceneRecord.sourceRevisionId) }
      : {}),
  });
  const ids = new Set<string>();
  const shots = (Array.isArray(record.shots) ? record.shots : [])
    .slice(0, 128)
    .flatMap((entry, index) => {
      try {
        const shot = normalizeShot(entry, `shot-${index + 1}`);
        if (!shot.id || ids.has(shot.id)) return [];
        ids.add(shot.id);
        return [shot];
      } catch {
        return [];
      }
    });
  const requestedShot = safeId(record.activeShotId);
  const activeShot =
    shots.find((entry) => entry.id === requestedShot) || shots[0] || null;
  const requestedTake = safeId(record.activeTakeId);
  const activeTake =
    activeShot?.takes.find((entry) => entry.id === requestedTake) ||
    activeShot?.takes[0] ||
    null;
  return freezeDirector({
    schema: MODEL3D_DIRECTOR_SCHEMA,
    revision: integer(record.revision, 0, 0, Number.MAX_SAFE_INTEGER, "director revision"),
    scene,
    shots: Object.freeze(shots),
    activeShotId: activeShot?.id || "",
    activeTakeId: activeTake?.id || "",
    updatedAt: safeText(record.updatedAt, 100) || new Date(0).toISOString(),
  });
}

export type Model3DDirectorCommand =
  | { id: "bind-scene"; scene: Model3DSceneBinding }
  | {
      id: "create-shot";
      shot: {
        id: string;
        name?: string;
        startMs?: number;
        durationMs?: number;
        takeId?: string;
      };
    }
  | { id: "remove-shot"; shotId: string }
  | { id: "create-take"; shotId: string; take: { id: string; name?: string } }
  | { id: "select-take"; shotId: string; takeId: string }
  | {
      id: "set-camera";
      shotId: string;
      patch: Partial<Model3DDirectorCamera>;
      authority?: "fov" | "lens";
    }
  | {
      id: "set-lighting";
      shotId: string;
      lighting: Model3DDirectorLighting;
    }
  | {
      id: "set-pose";
      shotId: string;
      takeId: string;
      pose: Model3DDirectorPose;
    }
  | {
      id: "upsert-keyframe";
      shotId: string;
      takeId: string;
      keyframe: Model3DMotionKeyframe;
    }
  | {
      id: "remove-keyframe";
      shotId: string;
      takeId: string;
      keyframeId: string;
    };

function shotIndex(
  document: Readonly<Model3DDirectorDocument>,
  shotId: string,
): number {
  const index = document.shots.findIndex((entry) => entry.id === safeId(shotId));
  if (index < 0) throw new Error(`Director shot not found: ${shotId}`);
  return index;
}

function takeIndex(shot: Readonly<Model3DDirectorShot>, takeId: string): number {
  const index = shot.takes.findIndex((entry) => entry.id === safeId(takeId));
  if (index < 0) throw new Error(`Director take not found: ${takeId}`);
  return index;
}

export function applyModel3DDirectorCommand(
  document: Readonly<Model3DDirectorDocument>,
  command: Model3DDirectorCommand,
  clock: Model3DDirectorClock = {},
): Readonly<Model3DDirectorDocument> {
  if (document.schema !== MODEL3D_DIRECTOR_SCHEMA) {
    throw new Error("Unsupported model3d director schema");
  }
  let shots = [...document.shots];
  let scene = document.scene;
  let activeShotId = document.activeShotId;
  let activeTakeId = document.activeTakeId;
  switch (command.id) {
    case "bind-scene": {
      const id = safeId(command.scene.id);
      if (!id) throw new Error("Director scene binding requires an id");
      scene = Object.freeze({
        id,
        ...(safeText(command.scene.name)
          ? { name: safeText(command.scene.name) }
          : {}),
        ...(safeId(command.scene.sourceAssetId)
          ? { sourceAssetId: safeId(command.scene.sourceAssetId) }
          : {}),
        ...(safeId(command.scene.sourceRevisionId)
          ? { sourceRevisionId: safeId(command.scene.sourceRevisionId) }
          : {}),
      });
      break;
    }
    case "create-shot": {
      const id = safeId(command.shot.id);
      if (!id) throw new Error("Director shot requires an id");
      if (shots.some((entry) => entry.id === id)) {
        throw new Error(`Director shot id already exists: ${id}`);
      }
      const takeId = safeId(command.shot.takeId, makeId("take", clock));
      const shot = normalizeShot(
        {
          id,
          name: command.shot.name,
          startMs: command.shot.startMs,
          durationMs: command.shot.durationMs,
          takes: [{ id: takeId, name: "Take 1" }],
        },
        id,
      );
      shots.push(shot);
      activeShotId = shot.id;
      activeTakeId = shot.takes[0].id;
      break;
    }
    case "remove-shot": {
      const index = shotIndex(document, command.shotId);
      shots.splice(index, 1);
      const active = shots[0] || null;
      activeShotId = active?.id || "";
      activeTakeId = active?.takes[0]?.id || "";
      break;
    }
    case "create-take": {
      const index = shotIndex(document, command.shotId);
      const shot = shots[index];
      const id = safeId(command.take.id);
      if (!id) throw new Error("Director take requires an id");
      if (shot.takes.some((entry) => entry.id === id)) {
        throw new Error(`Director take id already exists: ${id}`);
      }
      const take = normalizeTake(
        { id, name: command.take.name },
        shot.camera,
        shot.durationMs,
        id,
      );
      shots[index] = Object.freeze({
        ...shot,
        takes: Object.freeze([...shot.takes, take]),
      });
      activeShotId = shot.id;
      activeTakeId = take.id;
      break;
    }
    case "select-take": {
      const shot = document.shots[shotIndex(document, command.shotId)];
      const take = shot.takes[takeIndex(shot, command.takeId)];
      activeShotId = shot.id;
      activeTakeId = take.id;
      break;
    }
    case "set-camera": {
      const index = shotIndex(document, command.shotId);
      const shot = shots[index];
      const camera = normalizeModel3DDirectorCamera(
        { ...shot.camera, ...command.patch },
        shot.camera,
        command.authority || "fov",
      );
      shots[index] = Object.freeze({ ...shot, camera });
      break;
    }
    case "set-lighting": {
      const index = shotIndex(document, command.shotId);
      const shot = shots[index];
      shots[index] = Object.freeze({
        ...shot,
        lighting: normalizeModel3DDirectorLighting(
          command.lighting,
          shot.lighting,
        ),
      });
      break;
    }
    case "set-pose": {
      const index = shotIndex(document, command.shotId);
      const shot = shots[index];
      const takePosition = takeIndex(shot, command.takeId);
      const take = shot.takes[takePosition];
      const pose = normalizePose(command.pose, command.pose.id);
      const poses = [
        ...take.poses.filter((entry) => entry.id !== pose.id),
        pose,
      ];
      const takes = [...shot.takes];
      takes[takePosition] = Object.freeze({
        ...take,
        poses: Object.freeze(poses),
      });
      shots[index] = Object.freeze({ ...shot, takes: Object.freeze(takes) });
      break;
    }
    case "upsert-keyframe": {
      const index = shotIndex(document, command.shotId);
      const shot = shots[index];
      const takePosition = takeIndex(shot, command.takeId);
      const take = shot.takes[takePosition];
      const keyframe = normalizeKeyframe(
        command.keyframe,
        shot.camera,
        shot.durationMs,
        command.keyframe.id,
      );
      const path = [
        ...take.motionPath.filter(
          (entry) =>
            entry.id !== keyframe.id && entry.timeMs !== keyframe.timeMs,
        ),
        keyframe,
      ].sort(
        (left, right) =>
          left.timeMs - right.timeMs || left.id.localeCompare(right.id),
      );
      const takes = [...shot.takes];
      takes[takePosition] = Object.freeze({
        ...take,
        motionPath: Object.freeze(path),
      });
      shots[index] = Object.freeze({ ...shot, takes: Object.freeze(takes) });
      break;
    }
    case "remove-keyframe": {
      const index = shotIndex(document, command.shotId);
      const shot = shots[index];
      const takePosition = takeIndex(shot, command.takeId);
      const take = shot.takes[takePosition];
      const path = take.motionPath.filter(
        (entry) => entry.id !== safeId(command.keyframeId),
      );
      if (path.length === take.motionPath.length) {
        throw new Error(`Director keyframe not found: ${command.keyframeId}`);
      }
      const takes = [...shot.takes];
      takes[takePosition] = Object.freeze({
        ...take,
        motionPath: Object.freeze(path),
      });
      shots[index] = Object.freeze({ ...shot, takes: Object.freeze(takes) });
      break;
    }
  }
  return freezeDirector({
    schema: MODEL3D_DIRECTOR_SCHEMA,
    revision: document.revision + 1,
    scene,
    shots: Object.freeze(shots),
    activeShotId,
    activeTakeId,
    updatedAt: now(clock),
  });
}

export type Model3DPrevisKind = "screenshot" | "playblast";

export interface Model3DPrevisAvailability {
  enabled: boolean;
  reason?: string;
}

export interface Model3DPrevisMedia {
  url: string;
  mimeType: string;
  sourceUrl?: string;
  renderJobId?: string;
  timelineSchema?: string;
  byteDigest?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  fps?: number;
  frameCount?: number;
}

export interface Model3DPrevisProgress {
  phase: "capturing" | "encoding" | "uploading" | "complete" | "canceling";
  progress: number;
  message?: string;
}

export interface Model3DPrevisAdapterContext {
  requestId: string;
  signal: AbortSignal;
  onProgress: (progress: Model3DPrevisProgress) => void;
}

export interface Model3DPrevisAdapter {
  id: string;
  availability: (kind: Model3DPrevisKind) => Model3DPrevisAvailability;
  capture: (
    kind: Model3DPrevisKind,
    document: Readonly<Model3DDirectorDocument>,
    context: Model3DPrevisAdapterContext,
  ) => Promise<Model3DPrevisMedia>;
  cancel?: (requestId: string, kind: Model3DPrevisKind) => Promise<void>;
}

export interface Model3DPrevisError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface Model3DPrevisReceipt {
  schema: typeof MODEL3D_PREVIS_RECEIPT_SCHEMA;
  requestId: string;
  kind: Model3DPrevisKind;
  status: "unsupported" | "succeeded" | "failed" | "canceled";
  sceneId: string;
  shotId: string;
  takeId: string;
  directorRevision: number;
  adapter?: string;
  disabledReason?: string;
  media?: Readonly<Model3DPrevisMedia>;
  error?: Readonly<Model3DPrevisError>;
  progress: Readonly<Model3DPrevisProgress>;
  startedAt: string;
  completedAt: string;
}

export interface Model3DPrevisHandle {
  requestId: string;
  result: Promise<Readonly<Model3DPrevisReceipt>>;
  cancel: () => void;
}

export function model3DPrevisAvailability(
  document: Readonly<Model3DDirectorDocument>,
  kind: Model3DPrevisKind,
  adapter?: Model3DPrevisAdapter | null,
): Readonly<Model3DPrevisAvailability> {
  if (!document.scene.id) {
    return Object.freeze({
      enabled: false,
      reason: "Bind a scene before capturing previs",
    });
  }
  const shot = document.shots.find(
    (entry) => entry.id === document.activeShotId,
  );
  const take = shot?.takes.find(
    (entry) => entry.id === document.activeTakeId,
  );
  if (!shot || !take) {
    return Object.freeze({
      enabled: false,
      reason: "Create and select a shot/take before capturing previs",
    });
  }
  if (!adapter) {
    return Object.freeze({
      enabled: false,
      reason:
        kind === "playblast"
          ? "No playblast executor is configured"
          : "No screenshot capture adapter is configured",
    });
  }
  const availability = adapter.availability(kind);
  return Object.freeze({
    enabled: availability.enabled === true,
    ...(availability.reason ? { reason: availability.reason } : {}),
  });
}

function previsError(caught: unknown): Readonly<Model3DPrevisError> {
  const record =
    caught && typeof caught === "object"
      ? (caught as { code?: unknown; retryable?: unknown })
      : {};
  return Object.freeze({
    code:
      typeof record.code === "string" && record.code
        ? record.code.slice(0, 100)
        : "model3d-previs-failed",
    message:
      caught instanceof Error
        ? caught.message.slice(0, 2_000)
        : "3D previs capture failed",
    retryable: record.retryable === true,
  });
}

function isAbort(caught: unknown): boolean {
  return (
    (caught instanceof DOMException && caught.name === "AbortError") ||
    (Boolean(caught) &&
      typeof caught === "object" &&
      (caught as { name?: unknown }).name === "AbortError")
  );
}

export function startModel3DPrevis(
  document: Readonly<Model3DDirectorDocument>,
  kind: Model3DPrevisKind,
  adapter?: Model3DPrevisAdapter | null,
  options: Model3DDirectorClock & {
    onProgress?: (progress: Readonly<Model3DPrevisProgress>) => void;
  } = {},
): Model3DPrevisHandle {
  const requestId = makeId(`model3d_${kind}`, options);
  const startedAt = now(options);
  const availability = model3DPrevisAvailability(document, kind, adapter);
  const controller = new AbortController();
  const binding = {
    sceneId: document.scene.id,
    shotId: document.activeShotId,
    takeId: document.activeTakeId,
  };
  let progress: Readonly<Model3DPrevisProgress> = Object.freeze({
    phase: "capturing",
    progress: 0,
  });
  const updateProgress = (value: Model3DPrevisProgress) => {
    progress = Object.freeze({
      phase: value.phase,
      progress: Math.max(
        progress.progress,
        Math.min(
          1,
          Number.isFinite(value.progress) ? value.progress : progress.progress,
        ),
      ),
      ...(safeText(value.message, 500)
        ? { message: safeText(value.message, 500) }
        : {}),
    });
    options.onProgress?.(progress);
  };
  let result: Promise<Readonly<Model3DPrevisReceipt>>;
  if (!adapter || !availability.enabled) {
    result = Promise.resolve(
      Object.freeze({
        schema: MODEL3D_PREVIS_RECEIPT_SCHEMA,
        requestId,
        kind,
        status: "unsupported",
        ...binding,
        directorRevision: document.revision,
        ...(adapter?.id ? { adapter: adapter.id } : {}),
        ...(availability.reason
          ? { disabledReason: availability.reason }
          : {}),
        progress,
        startedAt,
        completedAt: now(options),
      }),
    );
  } else {
    result = (async () => {
      try {
        const candidate = await adapter.capture(kind, document, {
          requestId,
          signal: controller.signal,
          onProgress: updateProgress,
        });
        if (controller.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        const url = safeUrl(candidate.url);
        if (!url) throw new Error("Previs adapter returned an unsafe media URL");
        const mimeType = String(candidate.mimeType || "").toLowerCase();
        if (
          (kind === "screenshot" && !mimeType.startsWith("image/")) ||
          (kind === "playblast" && !mimeType.startsWith("video/"))
        ) {
          throw new Error(`Previs adapter returned invalid ${kind} media`);
        }
        const media = Object.freeze({
          ...candidate,
          url,
          mimeType,
        });
        updateProgress({ phase: "complete", progress: 1 });
        return Object.freeze({
          schema: MODEL3D_PREVIS_RECEIPT_SCHEMA,
          requestId,
          kind,
          status: "succeeded",
          ...binding,
          directorRevision: document.revision,
          adapter: adapter.id,
          media,
          progress,
          startedAt,
          completedAt: now(options),
        });
      } catch (caught) {
        if (controller.signal.aborted || isAbort(caught)) {
          updateProgress({
            phase: "canceling",
            progress: progress.progress,
          });
          return Object.freeze({
            schema: MODEL3D_PREVIS_RECEIPT_SCHEMA,
            requestId,
            kind,
            status: "canceled",
            ...binding,
            directorRevision: document.revision,
            adapter: adapter.id,
            progress,
            startedAt,
            completedAt: now(options),
          });
        }
        const error = previsError(caught);
        return Object.freeze({
          schema: MODEL3D_PREVIS_RECEIPT_SCHEMA,
          requestId,
          kind,
          status: "failed",
          ...binding,
          directorRevision: document.revision,
          adapter: adapter.id,
          error,
          progress,
          startedAt,
          completedAt: now(options),
        });
      }
    })();
  }
  return {
    requestId,
    result,
    cancel: () => {
      controller.abort();
      updateProgress({ phase: "canceling", progress: progress.progress });
      if (adapter?.cancel) {
        void adapter.cancel(requestId, kind).catch(() => undefined);
      }
    },
  };
}
