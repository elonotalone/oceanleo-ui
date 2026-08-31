export const IMAGE_RECIPE_SCHEMA = "oceanleo.image-recipe@1" as const;
export const IMAGE_RUN_RECEIPT_SCHEMA =
  "oceanleo.image-command-receipt@1" as const;

export type ImageLocalCommandId =
  | "crop"
  | "rotate"
  | "flip"
  | "adjust"
  | "filter";

export type ImageAiCommandId =
  | "relight"
  | "multi-angle"
  | "panorama"
  | "grid-4"
  | "grid-9"
  | "grid-25"
  | "grid-split"
  | "upscale"
  | "inpaint"
  | "outpaint"
  | "portrait-quality";

export type ImageSemanticCommandId = ImageLocalCommandId | ImageAiCommandId;

export interface ImageSourceReference {
  /** SHA-256 of the immutable original bytes. */
  byteDigest: string;
  byteLength: number;
  mimeType: string;
  assetId?: string;
  revisionId?: string;
  url?: string;
}

export interface ImageOutputLineage {
  outputId: string;
  parentOutputIds: readonly string[];
  sourceByteDigest: string;
  commandId: ImageSemanticCommandId | "source";
  operationId: string;
  createdAt: string;
}

export interface ImageBillingMetadata {
  charged: boolean;
  amount: number | null;
  currency: string;
  estimated: boolean;
  provider?: string;
  quoteId?: string;
}

export interface ImageProgressMetadata {
  phase:
    | "validating"
    | "uploading"
    | "queued"
    | "processing"
    | "finalizing"
    | "complete"
    | "canceling";
  progress: number;
  message?: string;
}

export interface ImageErrorMetadata {
  code: string;
  message: string;
  retryable: boolean;
}

export type ImageLocalCommand =
  | {
      id: "crop";
      rect: { x: number; y: number; width: number; height: number };
    }
  | { id: "rotate"; degrees: number }
  | { id: "flip"; axis: "horizontal" | "vertical" }
  | {
      id: "adjust";
      brightness?: number;
      contrast?: number;
      saturation?: number;
      exposure?: number;
    }
  | {
      id: "filter";
      preset:
        | "none"
        | "grayscale"
        | "sepia"
        | "vintage"
        | "cool"
        | "warm";
      intensity?: number;
    };

export interface ImagePromptParameters {
  prompt?: string;
}

export interface ImageAiCommandParameters {
  relight: ImagePromptParameters & {
    intensity?: number;
    direction?: "front" | "back" | "left" | "right" | "top" | "ambient";
  };
  "multi-angle": ImagePromptParameters & { count: number };
  panorama: ImagePromptParameters & { fieldOfView?: number };
  "grid-4": ImagePromptParameters;
  "grid-9": ImagePromptParameters;
  "grid-25": ImagePromptParameters;
  "grid-split": { rows: number; columns: number };
  upscale: { scale: 2 | 4 };
  inpaint: ImagePromptParameters & { maskUrl?: string };
  outpaint: ImagePromptParameters & {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  "portrait-quality": ImagePromptParameters & { strength?: number };
}

export type ImageAiCommand = {
  [CommandId in ImageAiCommandId]: {
    id: CommandId;
    params: ImageAiCommandParameters[CommandId];
  };
}[ImageAiCommandId];

export interface ImageCommandDescriptor {
  id: ImageSemanticCommandId;
  execution: "local" | "provider";
  billing: "never" | "provider";
  outputCount: { minimum: number; maximum: number };
  preservesSourceBytes: true;
  description: string;
}

const localDescriptor = (
  id: ImageLocalCommandId,
  description: string,
): ImageCommandDescriptor => ({
  id,
  execution: "local",
  billing: "never",
  outputCount: { minimum: 1, maximum: 1 },
  preservesSourceBytes: true,
  description,
});

const providerDescriptor = (
  id: ImageAiCommandId,
  description: string,
  minimum = 1,
  maximum = 1,
): ImageCommandDescriptor => ({
  id,
  execution: "provider",
  billing: "provider",
  outputCount: { minimum, maximum },
  preservesSourceBytes: true,
  description,
});

export const IMAGE_LOCAL_COMMAND_REGISTRY = Object.freeze([
  localDescriptor("crop", "Append a normalized non-destructive crop rectangle."),
  localDescriptor("rotate", "Append a non-destructive image rotation."),
  localDescriptor("flip", "Append a horizontal or vertical mirror operation."),
  localDescriptor("adjust", "Append bounded tonal adjustments."),
  localDescriptor("filter", "Append a named filter and bounded intensity."),
]) as readonly ImageCommandDescriptor[];

export const IMAGE_AI_COMMAND_REGISTRY = Object.freeze([
  providerDescriptor("relight", "Relight an image through an explicit provider."),
  providerDescriptor(
    "multi-angle",
    "Generate multiple viewpoints through an explicit provider.",
    2,
    16,
  ),
  providerDescriptor(
    "panorama",
    "Generate a panorama through an explicit provider.",
  ),
  providerDescriptor("grid-4", "Generate a four-cell image grid."),
  providerDescriptor("grid-9", "Generate a nine-cell image grid."),
  providerDescriptor("grid-25", "Generate a twenty-five-cell image grid."),
  providerDescriptor(
    "grid-split",
    "Split a grid into immutable provider outputs.",
    1,
    625,
  ),
  providerDescriptor("upscale", "Upscale through an explicit provider."),
  providerDescriptor("inpaint", "Inpaint a masked image through a provider."),
  providerDescriptor("outpaint", "Extend image bounds through a provider."),
  providerDescriptor(
    "portrait-quality",
    "Enhance portrait quality through an explicit provider.",
  ),
]) as readonly ImageCommandDescriptor[];

export const IMAGE_COMMAND_REGISTRY = Object.freeze([
  ...IMAGE_LOCAL_COMMAND_REGISTRY,
  ...IMAGE_AI_COMMAND_REGISTRY,
]) as readonly ImageCommandDescriptor[];

export interface ImageLocalRecipeOperation {
  id: string;
  command: ImageLocalCommand;
  createdAt: string;
}

export interface ImageRecipeDocument {
  schema: typeof IMAGE_RECIPE_SCHEMA;
  source: Readonly<ImageSourceReference>;
  operations: readonly Readonly<ImageLocalRecipeOperation>[];
  lineage: Readonly<ImageOutputLineage>;
}

export interface ImageLocalCommandReceipt {
  schema: typeof IMAGE_RUN_RECEIPT_SCHEMA;
  runId: string;
  commandId: ImageLocalCommandId;
  execution: "local";
  status: "succeeded";
  progress: Readonly<ImageProgressMetadata>;
  billing: Readonly<ImageBillingMetadata>;
  output: Readonly<ImageRecipeDocument>;
  startedAt: string;
  completedAt: string;
}

export interface ImageEngineClock {
  now?: () => string;
  makeId?: (prefix: string) => string;
}

function defaultId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "");
  return `${prefix}_${random || `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2)}`}`;
}

function now(clock?: ImageEngineClock): string {
  return clock?.now?.() || new Date().toISOString();
}

function makeId(prefix: string, clock?: ImageEngineClock): string {
  return clock?.makeId?.(prefix) || defaultId(prefix);
}

function finite(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return numeric;
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const numeric = finite(value, label, minimum, maximum);
  if (!Number.isInteger(numeric)) throw new Error(`${label} must be an integer`);
  return numeric;
}

function safeText(value: unknown, maximum = 4_000): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function safeUrl(value: unknown): string {
  const url = safeText(value, 8_192);
  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    return ["http:", "https:"].includes(new URL(url).protocol) ? url : "";
  } catch {
    return "";
  }
}

export function validateImageSourceReference(
  value: ImageSourceReference,
): Readonly<ImageSourceReference> {
  const byteDigest = String(value.byteDigest || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(byteDigest)) {
    throw new Error("source byteDigest must be a SHA-256 hex digest");
  }
  const byteLength = integer(
    value.byteLength,
    "source byteLength",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const mimeType = String(value.mimeType || "").trim().toLowerCase();
  if (!/^image\/[a-z0-9.+-]+$/.test(mimeType)) {
    throw new Error("source mimeType must be an image MIME type");
  }
  const source = {
    byteDigest,
    byteLength,
    mimeType,
    ...(safeText(value.assetId, 200)
      ? { assetId: safeText(value.assetId, 200) }
      : {}),
    ...(safeText(value.revisionId, 200)
      ? { revisionId: safeText(value.revisionId, 200) }
      : {}),
    ...(safeUrl(value.url) ? { url: safeUrl(value.url) } : {}),
  };
  return Object.freeze(source);
}

function normalizeLocalCommand(
  command: ImageLocalCommand,
): Readonly<ImageLocalCommand> {
  switch (command.id) {
    case "crop": {
      const rect = {
        x: finite(command.rect?.x, "crop.x", 0, 1),
        y: finite(command.rect?.y, "crop.y", 0, 1),
        width: finite(command.rect?.width, "crop.width", Number.EPSILON, 1),
        height: finite(command.rect?.height, "crop.height", Number.EPSILON, 1),
      };
      if (rect.x + rect.width > 1 || rect.y + rect.height > 1) {
        throw new Error("crop rectangle must stay within normalized image bounds");
      }
      return Object.freeze({ id: "crop", rect: Object.freeze(rect) });
    }
    case "rotate": {
      const degrees = finite(command.degrees, "rotation", -360, 360);
      const normalized = ((degrees % 360) + 360) % 360;
      return Object.freeze({
        id: "rotate",
        degrees: normalized > 180 ? normalized - 360 : normalized,
      });
    }
    case "flip":
      if (command.axis !== "horizontal" && command.axis !== "vertical") {
        throw new Error("flip axis must be horizontal or vertical");
      }
      return Object.freeze({ id: "flip", axis: command.axis });
    case "adjust": {
      const present = [
        command.brightness,
        command.contrast,
        command.saturation,
        command.exposure,
      ].some((value) => value !== undefined);
      if (!present) throw new Error("adjust requires at least one value");
      return Object.freeze({
        id: "adjust",
        ...(command.brightness === undefined
          ? {}
          : {
              brightness: finite(
                command.brightness,
                "brightness",
                -1,
                1,
              ),
            }),
        ...(command.contrast === undefined
          ? {}
          : { contrast: finite(command.contrast, "contrast", 0, 2) }),
        ...(command.saturation === undefined
          ? {}
          : {
              saturation: finite(command.saturation, "saturation", 0, 3),
            }),
        ...(command.exposure === undefined
          ? {}
          : { exposure: finite(command.exposure, "exposure", -5, 5) }),
      });
    }
    case "filter": {
      if (
        !["none", "grayscale", "sepia", "vintage", "cool", "warm"].includes(
          command.preset,
        )
      ) {
        throw new Error("unknown image filter preset");
      }
      return Object.freeze({
        id: "filter",
        preset: command.preset,
        intensity:
          command.preset === "none"
            ? 0
            : finite(command.intensity ?? 1, "filter intensity", 0, 1),
      });
    }
  }
}

export function createImageRecipeDocument(
  sourceInput: ImageSourceReference,
  options: ImageEngineClock & { outputId?: string } = {},
): Readonly<ImageRecipeDocument> {
  const createdAt = now(options);
  const source = validateImageSourceReference(sourceInput);
  const operationId = makeId("image_source", options);
  const lineage = Object.freeze({
    outputId: options.outputId || operationId,
    parentOutputIds: Object.freeze([]) as readonly string[],
    sourceByteDigest: source.byteDigest,
    commandId: "source" as const,
    operationId,
    createdAt,
  });
  return Object.freeze({
    schema: IMAGE_RECIPE_SCHEMA,
    source,
    operations: Object.freeze([]),
    lineage,
  });
}

export function applyLocalImageCommand(
  document: Readonly<ImageRecipeDocument>,
  commandInput: ImageLocalCommand,
  clock: ImageEngineClock = {},
): Readonly<ImageLocalCommandReceipt> {
  if (document.schema !== IMAGE_RECIPE_SCHEMA) {
    throw new Error(`unsupported image recipe schema: ${String(document.schema)}`);
  }
  const source = validateImageSourceReference(document.source);
  if (source.byteDigest !== document.lineage.sourceByteDigest) {
    throw new Error("image lineage source digest does not match source bytes");
  }
  const command = normalizeLocalCommand(commandInput);
  const startedAt = now(clock);
  const operationId = makeId("image_operation", clock);
  const outputId = makeId("image_output", clock);
  const operation = Object.freeze({
    id: operationId,
    command,
    createdAt: startedAt,
  });
  const operations = Object.freeze([...document.operations, operation]);
  const lineage = Object.freeze({
    outputId,
    parentOutputIds: Object.freeze([document.lineage.outputId]),
    sourceByteDigest: document.source.byteDigest,
    commandId: command.id,
    operationId,
    createdAt: startedAt,
  });
  const output = Object.freeze({
    schema: IMAGE_RECIPE_SCHEMA,
    // Preserve this exact immutable reference: local commands never rewrite bytes.
    source: document.source,
    operations,
    lineage,
  });
  return Object.freeze({
    schema: IMAGE_RUN_RECEIPT_SCHEMA,
    runId: makeId("image_run", clock),
    commandId: command.id,
    execution: "local",
    status: "succeeded",
    progress: Object.freeze({ phase: "complete", progress: 1 }),
    billing: Object.freeze({
      charged: false,
      amount: 0,
      currency: "USD",
      estimated: false,
    }),
    output,
    startedAt,
    completedAt: now(clock),
  });
}

export interface ImageCapabilityAvailability {
  enabled: boolean;
  reason?: string;
  estimatedCost?: Readonly<ImageBillingMetadata>;
}

export interface ImageAiExecutionInput {
  source: Readonly<ImageSourceReference>;
  parentLineage: Readonly<ImageOutputLineage>;
  recipe?: Readonly<ImageRecipeDocument>;
  /** Frozen composite raster supplied to providers that cannot evaluate recipes. */
  raster?: Blob;
  /** Optional binary mask used by inpaint. */
  mask?: Blob;
}

export interface ImageAiProviderOutput {
  id?: string;
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  byteDigest?: string;
}

export interface ImageAiProviderResult {
  outputs: readonly ImageAiProviderOutput[];
  cost?: ImageBillingMetadata;
  providerRunId?: string;
}

export interface ImageAiProviderContext {
  runId: string;
  signal: AbortSignal;
  onProgress: (progress: ImageProgressMetadata) => void;
}

export interface ImageAiProvider {
  id: string;
  availability: (commandId: ImageAiCommandId) => ImageCapabilityAvailability;
  execute: (
    command: Readonly<ImageAiCommand>,
    input: Readonly<ImageAiExecutionInput>,
    context: ImageAiProviderContext,
  ) => Promise<ImageAiProviderResult>;
  cancel?: (runId: string, providerRunId?: string) => Promise<void>;
}

export interface ImageAiOutput {
  id: string;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
  byteDigest?: string;
  lineage: Readonly<ImageOutputLineage>;
}

export type ImageAiRunStatus =
  | "unsupported"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export interface ImageAiRunReceipt {
  schema: typeof IMAGE_RUN_RECEIPT_SCHEMA;
  runId: string;
  commandId: ImageAiCommandId;
  execution: "provider";
  status: Exclude<ImageAiRunStatus, "running">;
  progress: Readonly<ImageProgressMetadata>;
  billing: Readonly<ImageBillingMetadata>;
  outputs: readonly Readonly<ImageAiOutput>[];
  provider?: string;
  providerRunId?: string;
  disabledReason?: string;
  error?: Readonly<ImageErrorMetadata>;
  startedAt: string;
  completedAt: string;
}

export interface ImageAiRunSnapshot {
  runId: string;
  commandId: ImageAiCommandId;
  status: ImageAiRunStatus;
  progress: Readonly<ImageProgressMetadata>;
  billing: Readonly<ImageBillingMetadata>;
  disabledReason?: string;
  error?: Readonly<ImageErrorMetadata>;
}

export interface ImageAiRunHandle {
  runId: string;
  result: Promise<Readonly<ImageAiRunReceipt>>;
  cancel: () => void;
  snapshot: () => Readonly<ImageAiRunSnapshot>;
}

function promptParameters(value: { prompt?: unknown }): ImagePromptParameters {
  const prompt = safeText(value.prompt);
  return prompt ? Object.freeze({ prompt }) : Object.freeze({});
}

export function validateImageAiCommand(
  command: ImageAiCommand,
  input?: Pick<ImageAiExecutionInput, "mask">,
): Readonly<ImageAiCommand> {
  const params = command.params as unknown as Record<string, unknown>;
  switch (command.id) {
    case "relight": {
      const direction = String(params.direction || "");
      return Object.freeze({
        id: command.id,
        params: Object.freeze({
          ...promptParameters(params),
          ...(direction &&
          ["front", "back", "left", "right", "top", "ambient"].includes(
            direction,
          )
            ? { direction }
            : {}),
          ...(params.intensity === undefined
            ? {}
            : { intensity: finite(params.intensity, "relight intensity", 0, 2) }),
        }),
      }) as Readonly<ImageAiCommand>;
    }
    case "multi-angle":
      return Object.freeze({
        id: command.id,
        params: Object.freeze({
          ...promptParameters(params),
          count: integer(params.count, "angle count", 2, 16),
        }),
      }) as Readonly<ImageAiCommand>;
    case "panorama":
      return Object.freeze({
        id: command.id,
        params: Object.freeze({
          ...promptParameters(params),
          ...(params.fieldOfView === undefined
            ? {}
            : {
                fieldOfView: finite(
                  params.fieldOfView,
                  "panorama field of view",
                  90,
                  360,
                ),
              }),
        }),
      }) as Readonly<ImageAiCommand>;
    case "grid-4":
    case "grid-9":
    case "grid-25":
      return Object.freeze({
        id: command.id,
        params: Object.freeze(promptParameters(params)),
      }) as Readonly<ImageAiCommand>;
    case "grid-split":
      return Object.freeze({
        id: command.id,
        params: Object.freeze({
          rows: integer(params.rows, "grid rows", 1, 25),
          columns: integer(params.columns, "grid columns", 1, 25),
        }),
      }) as Readonly<ImageAiCommand>;
    case "upscale":
      if (params.scale !== 2 && params.scale !== 4) {
        throw new Error("upscale scale must be 2 or 4");
      }
      return Object.freeze({
        id: command.id,
        params: Object.freeze({ scale: params.scale }),
      }) as Readonly<ImageAiCommand>;
    case "inpaint": {
      const maskUrl = safeUrl(params.maskUrl);
      if (!maskUrl && !input?.mask) {
        throw new Error("inpaint requires maskUrl or a binary mask");
      }
      return Object.freeze({
        id: command.id,
        params: Object.freeze({
          ...promptParameters(params),
          ...(maskUrl ? { maskUrl } : {}),
        }),
      }) as Readonly<ImageAiCommand>;
    }
    case "outpaint": {
      const margins = {
        top: integer(params.top ?? 0, "outpaint top", 0, 4_096),
        right: integer(params.right ?? 0, "outpaint right", 0, 4_096),
        bottom: integer(params.bottom ?? 0, "outpaint bottom", 0, 4_096),
        left: integer(params.left ?? 0, "outpaint left", 0, 4_096),
      };
      if (!Object.values(margins).some((value) => value > 0)) {
        throw new Error("outpaint requires at least one positive margin");
      }
      return Object.freeze({
        id: command.id,
        params: Object.freeze({
          ...promptParameters(params),
          ...margins,
        }),
      }) as Readonly<ImageAiCommand>;
    }
    case "portrait-quality":
      return Object.freeze({
        id: command.id,
        params: Object.freeze({
          ...promptParameters(params),
          ...(params.strength === undefined
            ? {}
            : {
                strength: finite(
                  params.strength,
                  "portrait quality strength",
                  0,
                  1,
                ),
              }),
        }),
      }) as Readonly<ImageAiCommand>;
  }
}

export function imageCommandAvailability(
  commandId: ImageSemanticCommandId,
  provider?: ImageAiProvider | null,
): Readonly<ImageCapabilityAvailability> {
  if (
    IMAGE_LOCAL_COMMAND_REGISTRY.some((descriptor) => descriptor.id === commandId)
  ) {
    return Object.freeze({ enabled: true });
  }
  if (!provider) {
    return Object.freeze({
      enabled: false,
      reason: `No image AI provider adapter is configured for ${commandId}`,
    });
  }
  const availability = provider.availability(commandId as ImageAiCommandId);
  return Object.freeze({
    enabled: availability.enabled === true,
    ...(availability.reason ? { reason: availability.reason } : {}),
    ...(availability.estimatedCost
      ? { estimatedCost: Object.freeze({ ...availability.estimatedCost }) }
      : {}),
  });
}

function normalizeProgress(
  value: ImageProgressMetadata,
  previous: number,
): Readonly<ImageProgressMetadata> {
  const progress = Math.max(
    previous,
    Math.min(1, Number.isFinite(value.progress) ? value.progress : previous),
  );
  return Object.freeze({
    phase: value.phase,
    progress,
    ...(safeText(value.message, 500)
      ? { message: safeText(value.message, 500) }
      : {}),
  });
}

function unknownBilling(
  provider?: string,
  estimated = true,
): Readonly<ImageBillingMetadata> {
  return Object.freeze({
    charged: false,
    amount: null,
    currency: "USD",
    estimated,
    ...(provider ? { provider } : {}),
  });
}

function imageRunError(caught: unknown): Readonly<ImageErrorMetadata> {
  const record =
    caught && typeof caught === "object"
      ? (caught as { code?: unknown; retryable?: unknown })
      : {};
  return Object.freeze({
    code: safeText(record.code, 100) || "image-ai-failed",
    message:
      caught instanceof Error
        ? caught.message.slice(0, 2_000)
        : "Image AI provider failed",
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

function imageAiOutputRange(
  command: Readonly<ImageAiCommand>,
): { minimum: number; maximum: number } {
  if (command.id === "multi-angle") {
    return {
      minimum: command.params.count,
      maximum: command.params.count,
    };
  }
  if (command.id === "grid-split") {
    const count = command.params.rows * command.params.columns;
    return { minimum: count, maximum: count };
  }
  return (
    IMAGE_AI_COMMAND_REGISTRY.find(
      (descriptor) => descriptor.id === command.id,
    )?.outputCount || { minimum: 1, maximum: 1 }
  );
}

export function startImageAiCommand(
  provider: ImageAiProvider | null | undefined,
  commandInput: ImageAiCommand,
  input: ImageAiExecutionInput,
  options: ImageEngineClock & {
    onState?: (snapshot: Readonly<ImageAiRunSnapshot>) => void;
  } = {},
): ImageAiRunHandle {
  const command = validateImageAiCommand(commandInput, input);
  const source = validateImageSourceReference(input.source);
  if (source.byteDigest !== input.parentLineage.sourceByteDigest) {
    throw new Error("AI input lineage does not match immutable source bytes");
  }
  const runId = makeId("image_ai_run", options);
  const startedAt = now(options);
  const controller = new AbortController();
  const availability = imageCommandAvailability(command.id, provider);
  let providerRunId = "";
  let current: ImageAiRunSnapshot = Object.freeze({
    runId,
    commandId: command.id,
    status: availability.enabled ? "running" : "unsupported",
    progress: Object.freeze({ phase: "validating", progress: 0 }),
    billing:
      availability.estimatedCost ||
      unknownBilling(provider?.id, availability.enabled),
    ...(!availability.enabled && availability.reason
      ? { disabledReason: availability.reason }
      : {}),
  });
  const emit = (patch: Partial<ImageAiRunSnapshot>) => {
    current = Object.freeze({ ...current, ...patch });
    options.onState?.(current);
  };
  options.onState?.(current);

  const unsupportedReceipt = (): Readonly<ImageAiRunReceipt> =>
    Object.freeze({
      schema: IMAGE_RUN_RECEIPT_SCHEMA,
      runId,
      commandId: command.id,
      execution: "provider",
      status: "unsupported",
      progress: current.progress,
      billing: current.billing,
      outputs: Object.freeze([]),
      ...(provider?.id ? { provider: provider.id } : {}),
      ...(current.disabledReason
        ? { disabledReason: current.disabledReason }
        : {}),
      startedAt,
      completedAt: now(options),
    });

  let result: Promise<Readonly<ImageAiRunReceipt>>;
  if (!provider || !availability.enabled) {
    result = Promise.resolve(unsupportedReceipt());
  } else {
    result = (async () => {
      try {
        const providerResult = await provider.execute(
          command,
          Object.freeze({ ...input, source }),
          {
            runId,
            signal: controller.signal,
            onProgress: (progress) => {
              const normalized = normalizeProgress(
                progress,
                current.progress.progress,
              );
              emit({ progress: normalized });
            },
          },
        );
        providerRunId = safeText(providerResult.providerRunId, 300);
        if (controller.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        const expectedOutputs = imageAiOutputRange(command);
        if (
          providerResult.outputs.length < expectedOutputs.minimum ||
          providerResult.outputs.length > expectedOutputs.maximum
        ) {
          throw new Error(
            `Image AI provider returned ${providerResult.outputs.length} outputs; ` +
              `${command.id} requires ${expectedOutputs.minimum}` +
              (expectedOutputs.minimum === expectedOutputs.maximum
                ? ""
                : `..${expectedOutputs.maximum}`),
          );
        }
        const outputs = Object.freeze(
          providerResult.outputs.map((candidate) => {
            const url = safeUrl(candidate.url);
            if (!url) throw new Error("Image AI provider returned an unsafe URL");
            const operationId = makeId("image_ai_operation", options);
            const id = safeText(candidate.id, 300) || makeId("image_ai_output", options);
            const lineage = Object.freeze({
              outputId: id,
              parentOutputIds: Object.freeze([input.parentLineage.outputId]),
              sourceByteDigest: source.byteDigest,
              commandId: command.id,
              operationId,
              createdAt: now(options),
            });
            return Object.freeze({
              id,
              url,
              mimeType:
                /^image\/[a-z0-9.+-]+$/i.test(candidate.mimeType || "")
                  ? String(candidate.mimeType).toLowerCase()
                  : "image/png",
              ...(Number.isFinite(candidate.width) && Number(candidate.width) > 0
                ? { width: Math.round(Number(candidate.width)) }
                : {}),
              ...(Number.isFinite(candidate.height) &&
              Number(candidate.height) > 0
                ? { height: Math.round(Number(candidate.height)) }
                : {}),
              ...(/^[a-f0-9]{64}$/i.test(candidate.byteDigest || "")
                ? { byteDigest: String(candidate.byteDigest).toLowerCase() }
                : {}),
              lineage,
            });
          }),
        );
        const billing = Object.freeze({
          ...(providerResult.cost || current.billing),
          provider: provider.id,
        });
        const progress = Object.freeze({
          phase: "complete" as const,
          progress: 1,
        });
        emit({ status: "succeeded", progress, billing });
        return Object.freeze({
          schema: IMAGE_RUN_RECEIPT_SCHEMA,
          runId,
          commandId: command.id,
          execution: "provider",
          status: "succeeded",
          progress,
          billing,
          outputs,
          provider: provider.id,
          ...(providerRunId ? { providerRunId } : {}),
          startedAt,
          completedAt: now(options),
        });
      } catch (caught) {
        if (controller.signal.aborted || isAbort(caught)) {
          const progress = Object.freeze({
            phase: "canceling" as const,
            progress: current.progress.progress,
          });
          emit({ status: "canceled", progress });
          return Object.freeze({
            schema: IMAGE_RUN_RECEIPT_SCHEMA,
            runId,
            commandId: command.id,
            execution: "provider",
            status: "canceled",
            progress,
            billing: current.billing,
            outputs: Object.freeze([]),
            provider: provider.id,
            ...(providerRunId ? { providerRunId } : {}),
            startedAt,
            completedAt: now(options),
          });
        }
        const error = imageRunError(caught);
        emit({ status: "failed", error });
        return Object.freeze({
          schema: IMAGE_RUN_RECEIPT_SCHEMA,
          runId,
          commandId: command.id,
          execution: "provider",
          status: "failed",
          progress: current.progress,
          billing: current.billing,
          outputs: Object.freeze([]),
          provider: provider.id,
          ...(providerRunId ? { providerRunId } : {}),
          error,
          startedAt,
          completedAt: now(options),
        });
      }
    })();
  }

  return {
    runId,
    result,
    cancel: () => {
      if (current.status !== "running") return;
      emit({
        progress: Object.freeze({
          phase: "canceling",
          progress: current.progress.progress,
        }),
      });
      controller.abort();
      if (provider?.cancel) {
        void provider.cancel(runId, providerRunId).catch(() => undefined);
      }
    },
    snapshot: () => current,
  };
}

export async function executeImageAiCommand(
  provider: ImageAiProvider | null | undefined,
  command: ImageAiCommand,
  input: ImageAiExecutionInput,
  options?: ImageEngineClock & {
    onState?: (snapshot: Readonly<ImageAiRunSnapshot>) => void;
  },
): Promise<Readonly<ImageAiRunReceipt>> {
  return startImageAiCommand(provider, command, input, options).result;
}

// ===========================================================================
// 直连网关的图片操作 —— 与上面 11 条语义 recipe 命令平行的第二条腿
// ---------------------------------------------------------------------------
// 抠图 `/v1/images/remove-bg` 没有参数、只出一张图、不进 recipe 血缘，走不了
// `ImageAiCommand` 那套。它**故意不进** `ImageAiCommandId`：那个联合同时是
// `image-provider-mappings.ts` 里 `Record<ImageAiCommandId, …>` 的键源与
// `buildOceanLeoImageAiRequests` 穷尽 switch 的判别源，往里加一条会让那个文件
// 当场两处编译红，而它不在本 owner 的独占面上。
// ===========================================================================

/**
 * 画布与导出共同的硬上限。fabric 控制器把文档尺寸夹在这个值内
 * （`fabric-controller-core.ts:97-98`），导出前也按它缩放
 * （`use-fabric-image-editor.ts:100`）。超分预检用的就是同一个数。
 */
export const IMAGE_MAX_DIMENSION = 8_192;

export type ImageDirectCommandId = "remove-bg";

/** 用户可见的全部图片能力：本地 + 语义 AI + 直连。 */
export type ImageCapabilityId = ImageSemanticCommandId | ImageDirectCommandId;

export interface ImageDirectCommandDescriptor
  extends Omit<ImageCommandDescriptor, "id"> {
  id: ImageDirectCommandId;
  /** 网关路由，逐字等于 `backend/app/routers/images_router.py` 的注册值。 */
  endpoint: string;
  /** 结果是否带 alpha 通道（决定 UI 要不要画棋盘格背景）。 */
  producesAlpha: boolean;
}

export const IMAGE_DIRECT_COMMAND_REGISTRY = Object.freeze([
  Object.freeze({
    id: "remove-bg",
    execution: "provider",
    billing: "provider",
    outputCount: { minimum: 1, maximum: 1 },
    preservesSourceBytes: true,
    description: "Cut the subject onto a transparent background.",
    endpoint: "/v1/images/remove-bg",
    producesAlpha: true,
  }),
]) as readonly ImageDirectCommandDescriptor[];

/**
 * AI 结果的落点策略。**只有一个合法值**：结果一律加成新图层，永不覆盖背景。
 * 用户要能反悔——这比让他去按撤销更直接（任务书 P1）。
 * 既有的 `use-fabric-image-editor.ts:1183` `runAiEdit()` 走的是
 * `replaceWithBackground()`，那条旧路径正是本轮要绕开的反面样本。
 */
export const IMAGE_AI_RESULT_PLACEMENT = "new-layer" as const;

export type ImageAiResultPlacement = typeof IMAGE_AI_RESULT_PLACEMENT;

export interface ImageAiPanelCapability {
  id: ImageCapabilityId;
  /** 中文名。不把 `inpaint` 这种词直接摆给用户看。 */
  label: string;
  /** 一句话说明这条能力对坐在屏幕前的人干了什么。 */
  summary: string;
  kind: "direct" | "semantic";
  /** 一等公民：不埋进列表，编辑栏上有明位入口。 */
  featured: boolean;
  /** 需要用户先写一句话描述。 */
  needsPrompt: boolean;
}

/**
 * 面板真正接出来的能力。刻意不接的两类，理由都写在 `verdicts/W18-delivery.md`：
 *
 * - `multi-angle` / `grid-4` / `grid-9` / `grid-25` / `grid-split`：一次出
 *   2–16 张（`grid-split` 上限 625 张）的拼版图不是办公场景要的东西，
 *   接出来只会烧额度。
 * - `inpaint`（局部重绘）：`validateImageAiCommand()` 要求 `maskUrl` 或二进制
 *   蒙版，而画蒙版的地方在 `FabricImageStage` 与 fabric 控制器里——那是本任务书
 *   的明文禁区。没有蒙版编写面就把按钮摆出来，等于摆一个必然报错的按钮。
 *   已写 `signals/W18-request.md`。
 */
export const IMAGE_AI_PANEL_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "remove-bg",
    label: "抠图",
    summary: "把主体抠出来，背景变透明。证件照、产品图、PPT 配图都用得上。",
    kind: "direct",
    featured: true,
    needsPrompt: false,
  }),
  Object.freeze({
    id: "upscale",
    label: "放大高清",
    summary: "把图放大到 2 倍或 4 倍，同时补回细节。",
    kind: "semantic",
    featured: false,
    needsPrompt: false,
  }),
  Object.freeze({
    id: "portrait-quality",
    label: "人像精修",
    summary: "提亮肤色、去噪点，五官和表情保持原样。",
    kind: "semantic",
    featured: false,
    needsPrompt: false,
  }),
  Object.freeze({
    id: "relight",
    label: "重新打光",
    summary: "换一个光照方向，物体本身不变。",
    kind: "semantic",
    featured: false,
    needsPrompt: false,
  }),
  Object.freeze({
    id: "outpaint",
    label: "扩展画面",
    summary: "往四周补出画面外的内容，原图一个像素都不动。",
    kind: "semantic",
    featured: false,
    needsPrompt: false,
  }),
  Object.freeze({
    id: "panorama",
    label: "全景延展",
    summary: "把这一张接成一整幅无缝全景。",
    kind: "semantic",
    featured: false,
    needsPrompt: false,
  }),
]) as readonly ImageAiPanelCapability[];

export interface ImageUpscalePreflight {
  ok: boolean;
  scale: 2 | 4;
  sourceWidth: number;
  sourceHeight: number;
  /** 放大之后的尺寸，超限时也照实算出来给用户看。 */
  width: number;
  height: number;
  limit: number;
  reason?: string;
}

/**
 * 超分预检：2× 之后到底多大、有没有越过 8192。**越了就在本地拦下**，
 * 不把请求发出去等服务端退回来——那要等十几秒、还可能已经扣了额度（任务书 P3）。
 */
export function imageUpscalePreflight(
  sourceWidth: number,
  sourceHeight: number,
  scale: 2 | 4,
): Readonly<ImageUpscalePreflight> {
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  const longest = Math.max(width, height);
  const base = {
    scale,
    sourceWidth: Math.round(sourceWidth),
    sourceHeight: Math.round(sourceHeight),
    width,
    height,
    limit: IMAGE_MAX_DIMENSION,
  };
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)) {
    return Object.freeze({
      ...base,
      ok: false,
      reason: "画布尺寸还没读出来，稍后再试。",
    });
  }
  if (longest > IMAGE_MAX_DIMENSION) {
    return Object.freeze({
      ...base,
      ok: false,
      reason:
        `放大 ${scale} 倍后是 ${width}×${height}，超过 ${IMAGE_MAX_DIMENSION}px 上限。` +
        `请换更小的倍数，或先把画布改小。`,
    });
  }
  return Object.freeze({ ...base, ok: true });
}

export type ImageAiFailureKind =
  | "quota"
  | "unavailable"
  | "too-large"
  | "auth"
  | "canceled"
  | "unknown";

export interface ImageAiFailure {
  kind: ImageAiFailureKind;
  /** 一行标题，直接摆在面板上。 */
  title: string;
  /** 具体到能让用户知道下一步干什么。 */
  detail: string;
  retryable: boolean;
}

const TOO_LARGE_PATTERN =
  /too\s*large|payload|尺寸|过大|太大|max(?:imum)?\s*(?:size|dimension)|8192/i;
const QUOTA_PATTERN =
  /quota|credit|insufficient|balance|billing|额度|余额|欠费/i;

/**
 * 把网关抛出来的东西分成用户能据以行动的几类。任务书 P1 点名要分开说的三类是
 * 额度不足 / 模型不可用 / 图太大——它们的下一步动作完全不同：
 * 充值、等一会儿再试、把图改小。混成一句「AI 失败了」等于什么都没说。
 */
export function classifyImageAiFailure(caught: unknown): Readonly<ImageAiFailure> {
  if (isAbort(caught)) {
    return Object.freeze({
      kind: "canceled",
      title: "已取消",
      detail: "这次处理已经停下，没有产生新图层。",
      retryable: true,
    });
  }
  const record =
    caught && typeof caught === "object"
      ? (caught as { code?: unknown; status?: unknown; retryable?: unknown })
      : {};
  const code = safeText(record.code, 100);
  const status = Number(record.status);
  const message =
    caught instanceof Error ? caught.message : safeText(caught, 2_000);

  if (status === 402 || code === "image-provider-billing" || QUOTA_PATTERN.test(message)) {
    return Object.freeze({
      kind: "quota",
      title: "额度不足",
      detail: message.trim() || "账户额度不够跑这次处理，充值后可以继续。",
      retryable: false,
    });
  }
  if (status === 413 || TOO_LARGE_PATTERN.test(message) || code === "image-too-large") {
    return Object.freeze({
      kind: "too-large",
      title: "图太大",
      detail:
        message.trim() ||
        `这张图超过了 ${IMAGE_MAX_DIMENSION}px 上限，先把画布改小再试。`,
      retryable: false,
    });
  }
  if (status === 401 || status === 403 || code === "image-provider-auth") {
    return Object.freeze({
      kind: "auth",
      title: "需要重新登录",
      detail: message.trim() || "登录状态已过期，重新登录后再试。",
      retryable: false,
    });
  }
  if (
    code === "image-provider-unavailable" ||
    code === "image-provider-not-configured" ||
    code === "image-provider-network" ||
    code === "image-provider-poll-network" ||
    code === "image-provider-timeout" ||
    code === "image-provider-throttled" ||
    code === "image-provider-job-failed" ||
    code === "image-provider-empty-output" ||
    (Number.isFinite(status) && status >= 500) ||
    status === 408 ||
    status === 429
  ) {
    return Object.freeze({
      kind: "unavailable",
      title: "模型暂时不可用",
      detail: message.trim() || "这条能力现在连不上，过一会儿再试。",
      retryable: true,
    });
  }
  return Object.freeze({
    kind: "unknown",
    title: "处理失败",
    detail: message.trim() || "这次处理没能完成。",
    retryable: record.retryable === true,
  });
}

export interface ImageDirectRunInput {
  /** 已经落到文件库、网关取得到的源图地址。 */
  sourceUrl: string;
  signal: AbortSignal;
}

/** 宿主注入的直连执行器：给源图地址，回结果图地址。 */
export type ImageDirectExecutor = (
  commandId: ImageDirectCommandId,
  input: ImageDirectRunInput,
) => Promise<string>;

export interface ImageDirectRunResult {
  commandId: ImageDirectCommandId;
  status: "succeeded" | "failed" | "canceled" | "unsupported";
  outputs: readonly Readonly<{ url: string; mimeType: string }>[];
  failure?: Readonly<ImageAiFailure>;
  disabledReason?: string;
}

export interface ImageDirectRunHandle {
  result: Promise<Readonly<ImageDirectRunResult>>;
  cancel: () => void;
}

/**
 * 跑一条直连能力。可打断是硬要求：`cancel()` 当场 abort，
 * 面板不必等网关回话（`_COMMON.md` §3「可打断」）。
 */
export function startImageDirectCommand(
  executor: ImageDirectExecutor | null | undefined,
  commandId: ImageDirectCommandId,
  input: Omit<ImageDirectRunInput, "signal">,
  options: {
    availability?: Readonly<ImageCapabilityAvailability>;
    onProgress?: (progress: Readonly<ImageProgressMetadata>) => void;
  } = {},
): ImageDirectRunHandle {
  const controller = new AbortController();
  const descriptor = IMAGE_DIRECT_COMMAND_REGISTRY.find(
    (entry) => entry.id === commandId,
  );
  const disabledReason = !descriptor
    ? `No direct image capability is registered for ${commandId}`
    : !executor
      ? `No image AI provider adapter is configured for ${commandId}`
      : options.availability && options.availability.enabled === false
        ? options.availability.reason ||
          `${commandId} is unavailable on this account`
        : "";
  if (disabledReason) {
    return {
      result: Promise.resolve(
        Object.freeze({
          commandId,
          status: "unsupported" as const,
          outputs: Object.freeze([]),
          disabledReason,
        }),
      ),
      cancel: () => controller.abort(),
    };
  }
  const run = executor as ImageDirectExecutor;
  const emit = (phase: ImageProgressMetadata["phase"], progress: number) =>
    options.onProgress?.(Object.freeze({ phase, progress }));
  const result = (async (): Promise<Readonly<ImageDirectRunResult>> => {
    emit("validating", 0);
    try {
      if (!safeUrl(input.sourceUrl)) {
        throw new Error(`${commandId} requires a durable source URL`);
      }
      emit("processing", 0.35);
      const url = safeUrl(
        await run(commandId, {
          sourceUrl: input.sourceUrl,
          signal: controller.signal,
        }),
      );
      if (controller.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (!url) throw new Error("抠图没有返回可用的结果图。");
      emit("complete", 1);
      return Object.freeze({
        commandId,
        status: "succeeded" as const,
        outputs: Object.freeze([
          Object.freeze({ url, mimeType: "image/png" }),
        ]),
      });
    } catch (caught) {
      const failure = classifyImageAiFailure(
        controller.signal.aborted && !isAbort(caught)
          ? new DOMException("Aborted", "AbortError")
          : caught,
      );
      emit(failure.kind === "canceled" ? "canceling" : "complete", 1);
      return Object.freeze({
        commandId,
        status: failure.kind === "canceled" ? ("canceled" as const) : ("failed" as const),
        outputs: Object.freeze([]),
        failure,
      });
    }
  })();
  return { result, cancel: () => controller.abort() };
}

/**
 * 从一段字节算出引擎要的不可变源引用。语义命令的 `ImageAiExecutionInput.source`
 * 要 SHA-256 摘要，画布这边只有 Blob，这里把两者接上。
 */
export async function imageSourceFromBytes(
  bytes: ArrayBuffer,
  reference: Omit<ImageSourceReference, "byteDigest" | "byteLength">,
): Promise<Readonly<ImageSourceReference>> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const byteDigest = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return validateImageSourceReference({
    ...reference,
    byteDigest,
    byteLength: bytes.byteLength,
  });
}
