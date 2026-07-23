import type {
  ImageAiCommand,
  ImageAiCommandId,
  ImageSourceReference,
} from "./image-capability-engine";

export const IMAGE_GATEWAY_REQUEST_SCHEMA =
  "oceanleo.image-gateway-request@1" as const;
export const IMAGE_GATEWAY_EDIT_BODY_SCHEMA =
  "oceanleo.gateway.images.edit@1" as const;
export const IMAGE_GATEWAY_UPSCALE_BODY_SCHEMA =
  "oceanleo.gateway.images.upscale@1" as const;
export const IMAGE_LOCAL_GRID_SPLIT_BODY_SCHEMA =
  "oceanleo.image.grid-split@1" as const;

export type OceanLeoImageGatewayEndpoint =
  | "/v1/images/edit"
  | "/v1/images/upscale"
  | "local-grid-split";

export interface OceanLeoImageProviderMapping {
  commandId: ImageAiCommandId;
  endpoint: OceanLeoImageGatewayEndpoint;
  execution: "gateway-blocking" | "local-durable";
  requestSchema:
    | typeof IMAGE_GATEWAY_EDIT_BODY_SCHEMA
    | typeof IMAGE_GATEWAY_UPSCALE_BODY_SCHEMA
    | typeof IMAGE_LOCAL_GRID_SPLIT_BODY_SCHEMA;
  providerCapability:
    | "image_to_image"
    | "super_resolution"
    | "deterministic_grid_split";
  cancellation:
    | "abort-client-request"
    | "abort-local-operation";
}

const editMapping = (
  commandId: ImageAiCommandId,
): Readonly<OceanLeoImageProviderMapping> =>
  Object.freeze({
    commandId,
    endpoint: "/v1/images/edit",
    execution: "gateway-blocking",
    requestSchema: IMAGE_GATEWAY_EDIT_BODY_SCHEMA,
    providerCapability: "image_to_image",
    cancellation: "abort-client-request",
  });

export const OCEANLEO_IMAGE_AI_PROVIDER_MAPPINGS = Object.freeze({
  relight: editMapping("relight"),
  "multi-angle": editMapping("multi-angle"),
  panorama: editMapping("panorama"),
  "grid-4": editMapping("grid-4"),
  "grid-9": editMapping("grid-9"),
  "grid-25": editMapping("grid-25"),
  "grid-split": Object.freeze({
    commandId: "grid-split",
    endpoint: "local-grid-split",
    execution: "local-durable",
    requestSchema: IMAGE_LOCAL_GRID_SPLIT_BODY_SCHEMA,
    providerCapability: "deterministic_grid_split",
    cancellation: "abort-local-operation",
  }),
  upscale: Object.freeze({
    commandId: "upscale",
    endpoint: "/v1/images/upscale",
    execution: "gateway-blocking",
    requestSchema: IMAGE_GATEWAY_UPSCALE_BODY_SCHEMA,
    providerCapability: "super_resolution",
    cancellation: "abort-client-request",
  }),
  inpaint: editMapping("inpaint"),
  outpaint: editMapping("outpaint"),
  "portrait-quality": editMapping("portrait-quality"),
}) satisfies Readonly<
  Record<ImageAiCommandId, Readonly<OceanLeoImageProviderMapping>>
>;

export interface OceanLeoImageGatewayEditBody {
  site_id: string;
  key_mode: "platform";
  image_url: string;
  image_urls?: readonly string[];
  prompt: string;
  function: "description_edit";
  ratio?: "1:1" | "2:1" | "1:2" | "16:9" | "9:16";
  sharpness: "2K";
  n: 1;
}

export interface OceanLeoImageGatewayUpscaleBody {
  site_id: string;
  key_mode: "platform";
  image_url: string;
  upscale_factor: 2 | 4;
  prompt: string;
}

export interface OceanLeoImageLocalGridSplitBody {
  rows: number;
  columns: number;
}

export type OceanLeoImageGatewayRequestBody =
  | OceanLeoImageGatewayEditBody
  | OceanLeoImageGatewayUpscaleBody
  | OceanLeoImageLocalGridSplitBody;

export interface OceanLeoImageGatewayRequest {
  schema: typeof IMAGE_GATEWAY_REQUEST_SCHEMA;
  commandId: ImageAiCommandId;
  requestIndex: number;
  endpoint: OceanLeoImageGatewayEndpoint;
  requestSchema: OceanLeoImageProviderMapping["requestSchema"];
  expectedOutputCount: number;
  inputLineage: Readonly<{
    sourceByteDigest: string;
    sourceByteLength: number;
    sourceMimeType: string;
    sourceAssetId?: string;
    sourceRevisionId?: string;
    parentOutputId: string;
  }>;
  body: Readonly<OceanLeoImageGatewayRequestBody>;
}

export interface BuildOceanLeoImageRequestsInput {
  sourceUrl: string;
  maskUrl?: string;
  siteId: string;
  source: Readonly<ImageSourceReference>;
  parentOutputId: string;
}

const ANGLE_PROMPTS = Object.freeze([
  "front view",
  "front-left three-quarter view",
  "left profile view",
  "rear-left three-quarter view",
  "rear view",
  "rear-right three-quarter view",
  "right profile view",
  "front-right three-quarter view",
  "high front view",
  "high rear view",
  "low front hero view",
  "low rear view",
  "top-down view",
  "low side view",
  "close detail from the left",
  "close detail from the right",
]);

function userPrompt(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 4_000) : "";
}

function withUserPrompt(instruction: string, prompt: unknown): string {
  const addition = userPrompt(prompt);
  return addition ? `${instruction} Additional direction: ${addition}` : instruction;
}

function lineage(
  input: BuildOceanLeoImageRequestsInput,
): OceanLeoImageGatewayRequest["inputLineage"] {
  return Object.freeze({
    sourceByteDigest: input.source.byteDigest,
    sourceByteLength: input.source.byteLength,
    sourceMimeType: input.source.mimeType,
    ...(input.source.assetId ? { sourceAssetId: input.source.assetId } : {}),
    ...(input.source.revisionId
      ? { sourceRevisionId: input.source.revisionId }
      : {}),
    parentOutputId: input.parentOutputId,
  });
}

function editRequest(
  commandId: ImageAiCommandId,
  requestIndex: number,
  input: BuildOceanLeoImageRequestsInput,
  prompt: string,
  options: {
    imageUrls?: readonly string[];
    ratio?: OceanLeoImageGatewayEditBody["ratio"];
  } = {},
): Readonly<OceanLeoImageGatewayRequest> {
  const body: OceanLeoImageGatewayEditBody = Object.freeze({
    site_id: input.siteId,
    key_mode: "platform",
    image_url: input.sourceUrl,
    ...(options.imageUrls?.length
      ? { image_urls: Object.freeze([...options.imageUrls]) }
      : {}),
    prompt,
    function: "description_edit",
    ...(options.ratio ? { ratio: options.ratio } : {}),
    sharpness: "2K",
    n: 1,
  });
  return Object.freeze({
    schema: IMAGE_GATEWAY_REQUEST_SCHEMA,
    commandId,
    requestIndex,
    endpoint: "/v1/images/edit",
    requestSchema: IMAGE_GATEWAY_EDIT_BODY_SCHEMA,
    expectedOutputCount: 1,
    inputLineage: lineage(input),
    body,
  });
}

function gridDimension(commandId: "grid-4" | "grid-9" | "grid-25"): number {
  if (commandId === "grid-4") return 2;
  if (commandId === "grid-9") return 3;
  return 5;
}

/**
 * Build the exact HTTP/local requests for each semantic command. The gateway
 * body mirrors the deployed FastAPI models; immutable lineage stays in this
 * client envelope and is attached to every returned output by the engine.
 */
export function buildOceanLeoImageAiRequests(
  command: Readonly<ImageAiCommand>,
  input: BuildOceanLeoImageRequestsInput,
): readonly Readonly<OceanLeoImageGatewayRequest>[] {
  const sourceUrl = input.sourceUrl.trim();
  if (!sourceUrl) throw new Error(`${command.id} requires a durable source URL`);
  if (!input.parentOutputId.trim()) {
    throw new Error(`${command.id} requires an immutable parent output`);
  }
  switch (command.id) {
    case "relight": {
      const direction = command.params.direction || "ambient";
      const intensity = command.params.intensity ?? 1;
      return Object.freeze([
        editRequest(
          command.id,
          0,
          input,
          withUserPrompt(
            `Relight this exact image from the ${direction} at intensity ${intensity.toFixed(
              2,
            )}. Preserve identity, geometry, materials, framing and all non-lighting details.`,
            command.params.prompt,
          ),
        ),
      ]);
    }
    case "multi-angle":
      return Object.freeze(
        ANGLE_PROMPTS.slice(0, command.params.count).map((angle, index) =>
          editRequest(
            command.id,
            index,
            input,
            withUserPrompt(
              `Create the ${angle} of the same subject. Preserve exact identity, proportions, materials, clothing and environment; change only viewpoint.`,
              command.params.prompt,
            ),
          ),
        ),
      );
    case "panorama": {
      const fieldOfView = command.params.fieldOfView ?? 180;
      return Object.freeze([
        editRequest(
          command.id,
          0,
          input,
          withUserPrompt(
            `Extend this scene into one seamless ${fieldOfView} degree equirectangular-style panorama. Preserve the source content and continue boundaries consistently without seams or duplicated subjects.`,
            command.params.prompt,
          ),
          { ratio: "2:1" },
        ),
      ]);
    }
    case "grid-4":
    case "grid-9":
    case "grid-25": {
      const dimension = gridDimension(command.id);
      const cellCount = dimension * dimension;
      return Object.freeze([
        editRequest(
          command.id,
          0,
          input,
          withUserPrompt(
            `Create one square ${dimension} by ${dimension} contact sheet with exactly ${cellCount} equal cells and clean straight gutters. Each cell shows a coherent variation of the same source subject; do not add captions, borders or extra cells.`,
            command.params.prompt,
          ),
          { ratio: "1:1" },
        ),
      ]);
    }
    case "grid-split":
      return Object.freeze([
        Object.freeze({
          schema: IMAGE_GATEWAY_REQUEST_SCHEMA,
          commandId: command.id,
          requestIndex: 0,
          endpoint: "local-grid-split",
          requestSchema: IMAGE_LOCAL_GRID_SPLIT_BODY_SCHEMA,
          expectedOutputCount:
            command.params.rows * command.params.columns,
          inputLineage: lineage(input),
          body: Object.freeze({
            rows: command.params.rows,
            columns: command.params.columns,
          }),
        }),
      ]);
    case "upscale":
      return Object.freeze([
        Object.freeze({
          schema: IMAGE_GATEWAY_REQUEST_SCHEMA,
          commandId: command.id,
          requestIndex: 0,
          endpoint: "/v1/images/upscale",
          requestSchema: IMAGE_GATEWAY_UPSCALE_BODY_SCHEMA,
          expectedOutputCount: 1,
          inputLineage: lineage(input),
          body: Object.freeze({
            site_id: input.siteId,
            key_mode: "platform",
            image_url: sourceUrl,
            upscale_factor: command.params.scale,
            prompt:
              "Restore fine detail while preserving exact identity, composition, colors and texture.",
          }),
        }),
      ]);
    case "inpaint": {
      const maskUrl = input.maskUrl?.trim() || command.params.maskUrl || "";
      if (!maskUrl) throw new Error("inpaint requires a durable mask URL");
      return Object.freeze([
        editRequest(
          command.id,
          0,
          input,
          withUserPrompt(
            "The first image is the source and the second image is a mask. Edit only masked pixels, blend boundaries naturally, and preserve every unmasked pixel and subject identity.",
            command.params.prompt || "Fill the masked region consistently.",
          ),
          { imageUrls: [sourceUrl, maskUrl] },
        ),
      ]);
    }
    case "outpaint": {
      const { top = 0, right = 0, bottom = 0, left = 0 } = command.params;
      return Object.freeze([
        editRequest(
          command.id,
          0,
          input,
          withUserPrompt(
            `Outpaint the canvas by ${top}px top, ${right}px right, ${bottom}px bottom and ${left}px left. Preserve every source pixel and extend only beyond the original boundaries with coherent perspective and lighting.`,
            command.params.prompt,
          ),
        ),
      ]);
    }
    case "portrait-quality": {
      const strength = command.params.strength ?? 0.5;
      return Object.freeze([
        editRequest(
          command.id,
          0,
          input,
          withUserPrompt(
            `Enhance this portrait at strength ${strength.toFixed(
              2,
            )}. Preserve facial identity, expression, age, skin texture, hair, pose and composition; improve only natural detail, exposure and artifact cleanup.`,
            command.params.prompt,
          ),
        ),
      ]);
    }
  }
}
