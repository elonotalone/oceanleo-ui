import assert from "node:assert/strict";
import test from "node:test";

import {
  IMAGE_AI_COMMAND_REGISTRY,
  IMAGE_COMMAND_REGISTRY,
  IMAGE_LOCAL_COMMAND_REGISTRY,
  applyLocalImageCommand,
  createImageRecipeDocument,
  executeImageAiCommand,
  imageCommandAvailability,
  startImageAiCommand,
  validateImageAiCommand,
} from "../src/shell/image-editor/image-capability-engine.ts";

const SOURCE = {
  byteDigest: "a".repeat(64),
  byteLength: 1_024,
  mimeType: "image/png",
  assetId: "asset-image",
  revisionId: "revision-image-4",
  url: "https://cdn.example/source.png",
};

function deterministicClock() {
  let sequence = 0;
  return {
    now: () => "2026-07-23T11:00:00.000Z",
    makeId: (prefix) => `${prefix}-${++sequence}`,
  };
}

test("image registry exposes every local and provider semantic operation", () => {
  assert.deepEqual(
    IMAGE_LOCAL_COMMAND_REGISTRY.map((entry) => entry.id),
    ["crop", "rotate", "flip", "adjust", "filter"],
  );
  assert.deepEqual(
    IMAGE_AI_COMMAND_REGISTRY.map((entry) => entry.id),
    [
      "relight",
      "multi-angle",
      "panorama",
      "grid-4",
      "grid-9",
      "grid-25",
      "grid-split",
      "upscale",
      "inpaint",
      "outpaint",
      "portrait-quality",
    ],
  );
  assert.equal(IMAGE_COMMAND_REGISTRY.length, 16);
  for (const command of IMAGE_LOCAL_COMMAND_REGISTRY) {
    assert.equal(command.execution, "local");
    assert.equal(command.billing, "never");
    assert.equal(command.preservesSourceBytes, true);
  }
  for (const command of IMAGE_AI_COMMAND_REGISTRY) {
    assert.equal(command.execution, "provider");
    assert.equal(command.billing, "provider");
    assert.equal(command.preservesSourceBytes, true);
  }
});

test("all local operations append immutable recipes with zero billing and lineage", () => {
  const clock = deterministicClock();
  let document = createImageRecipeDocument(SOURCE, {
    ...clock,
    outputId: "source-output",
  });
  const originalSource = document.source;
  const commands = [
    { id: "crop", rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } },
    { id: "rotate", degrees: 270 },
    { id: "flip", axis: "horizontal" },
    {
      id: "adjust",
      brightness: 0.25,
      contrast: 1.4,
      saturation: 0.8,
      exposure: -0.5,
    },
    { id: "filter", preset: "sepia", intensity: 0.7 },
  ];
  for (const [index, command] of commands.entries()) {
    const previous = document;
    const receipt = applyLocalImageCommand(document, command, clock);
    document = receipt.output;
    assert.equal(receipt.status, "succeeded");
    assert.equal(receipt.billing.charged, false);
    assert.equal(receipt.billing.amount, 0);
    assert.equal(receipt.output.source, originalSource);
    assert.equal(receipt.output.source.byteDigest, SOURCE.byteDigest);
    assert.equal(receipt.output.operations.length, index + 1);
    assert.equal(previous.operations.length, index);
    assert.equal(
      receipt.output.lineage.parentOutputIds[0],
      previous.lineage.outputId,
    );
    assert.equal(receipt.output.lineage.commandId, command.id);
    assert.equal(Object.isFrozen(receipt), true);
    assert.equal(Object.isFrozen(receipt.output.operations), true);
  }
  assert.equal(document.operations[1].command.degrees, -90);
  assert.throws(
    () =>
      applyLocalImageCommand(
        document,
        { id: "crop", rect: { x: 0.75, y: 0, width: 0.5, height: 1 } },
        clock,
      ),
    /within normalized image bounds/,
  );
});

test("every AI semantic operation has a validated parameter contract", () => {
  const mask = new Blob(["mask"], { type: "image/png" });
  const commands = [
    { id: "relight", params: { direction: "left", intensity: 1.2 } },
    { id: "multi-angle", params: { count: 8, prompt: "product orbit" } },
    { id: "panorama", params: { fieldOfView: 270 } },
    { id: "grid-4", params: { prompt: "four views" } },
    { id: "grid-9", params: {} },
    { id: "grid-25", params: {} },
    { id: "grid-split", params: { rows: 5, columns: 5 } },
    { id: "upscale", params: { scale: 4 } },
    { id: "inpaint", params: { prompt: "remove logo" } },
    { id: "outpaint", params: { left: 128, right: 128 } },
    { id: "portrait-quality", params: { strength: 0.65 } },
  ];
  for (const command of commands) {
    const normalized = validateImageAiCommand(
      command,
      command.id === "inpaint" ? { mask } : undefined,
    );
    assert.equal(normalized.id, command.id);
    assert.equal(Object.isFrozen(normalized), true);
    assert.equal(Object.isFrozen(normalized.params), true);
  }
  assert.throws(
    () => validateImageAiCommand({ id: "upscale", params: { scale: 3 } }),
    /2 or 4/,
  );
  assert.throws(
    () => validateImageAiCommand({ id: "inpaint", params: {} }),
    /requires maskUrl or a binary mask/,
  );
  assert.throws(
    () =>
      validateImageAiCommand({
        id: "outpaint",
        params: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
    /positive margin/,
  );
});

test("unsupported AI capabilities fail closed with an explicit provider reason", async () => {
  const document = createImageRecipeDocument(SOURCE, {
    outputId: "source-output",
  });
  const availability = imageCommandAvailability("upscale", null);
  assert.equal(availability.enabled, false);
  assert.match(availability.reason, /No image AI provider adapter/);
  const receipt = await executeImageAiCommand(
    null,
    { id: "upscale", params: { scale: 2 } },
    { source: document.source, parentLineage: document.lineage },
  );
  assert.equal(receipt.status, "unsupported");
  assert.match(receipt.disabledReason, /upscale/);
  assert.deepEqual(receipt.outputs, []);
  assert.equal(receipt.billing.amount, null);
});

test("AI execution records progress, immutable output lineage, and actual cost", async () => {
  const document = createImageRecipeDocument(SOURCE, {
    outputId: "source-output",
  });
  const states = [];
  const provider = {
    id: "proof-provider",
    availability: (commandId) => ({
      enabled: commandId === "relight",
      ...(commandId === "relight"
        ? {
            estimatedCost: {
              charged: false,
              amount: 0.03,
              currency: "USD",
              estimated: true,
              provider: "proof-provider",
            },
          }
        : { reason: `No endpoint for ${commandId}` }),
    }),
    async execute(_command, _input, context) {
      context.onProgress({ phase: "queued", progress: 0.1 });
      context.onProgress({ phase: "processing", progress: 0.75 });
      return {
        providerRunId: "provider-run-1",
        outputs: [
          {
            id: "relight-output",
            url: "https://cdn.example/relight.png",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
            byteDigest: "b".repeat(64),
          },
        ],
        cost: {
          charged: true,
          amount: 0.02,
          currency: "USD",
          estimated: false,
          provider: "proof-provider",
        },
      };
    },
  };
  const receipt = await executeImageAiCommand(
    provider,
    { id: "relight", params: { direction: "front" } },
    {
      source: document.source,
      parentLineage: document.lineage,
      recipe: document,
    },
    { ...deterministicClock(), onState: (state) => states.push(state) },
  );
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.billing.amount, 0.02);
  assert.equal(receipt.billing.estimated, false);
  assert.equal(receipt.providerRunId, "provider-run-1");
  assert.equal(receipt.outputs[0].lineage.outputId, "relight-output");
  assert.equal(
    receipt.outputs[0].lineage.parentOutputIds[0],
    document.lineage.outputId,
  );
  assert.equal(
    receipt.outputs[0].lineage.sourceByteDigest,
    SOURCE.byteDigest,
  );
  assert.deepEqual(
    states.map((state) => state.progress.progress),
    [0, 0.1, 0.75, 1],
  );
  assert.equal(Object.isFrozen(receipt.outputs[0].lineage), true);
});

test("AI cancellation and provider errors resolve to durable status metadata", async () => {
  const document = createImageRecipeDocument(SOURCE, {
    outputId: "source-output",
  });
  let cancelCalls = 0;
  const cancelingProvider = {
    id: "cancel-provider",
    availability: () => ({ enabled: true }),
    execute(_command, _input, context) {
      return new Promise((_resolve, reject) => {
        context.onProgress({ phase: "processing", progress: 0.4 });
        context.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    },
    async cancel() {
      cancelCalls += 1;
    },
  };
  const handle = startImageAiCommand(
    cancelingProvider,
    { id: "portrait-quality", params: { strength: 0.5 } },
    { source: document.source, parentLineage: document.lineage },
  );
  handle.cancel();
  const canceled = await handle.result;
  assert.equal(canceled.status, "canceled");
  assert.equal(handle.snapshot().status, "canceled");
  assert.equal(cancelCalls, 1);

  const failed = await executeImageAiCommand(
    {
      id: "error-provider",
      availability: () => ({ enabled: true }),
      async execute() {
        const error = new Error("provider quota exhausted");
        error.code = "quota";
        error.retryable = false;
        throw error;
      },
    },
    { id: "grid-4", params: {} },
    { source: document.source, parentLineage: document.lineage },
  );
  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.error, {
    code: "quota",
    message: "provider quota exhausted",
    retryable: false,
  });

  const wrongCardinality = await executeImageAiCommand(
    {
      id: "short-provider",
      availability: () => ({ enabled: true }),
      async execute() {
        return {
          outputs: [{ url: "https://cdn.example/only-one-angle.png" }],
        };
      },
    },
    { id: "multi-angle", params: { count: 4 } },
    { source: document.source, parentLineage: document.lineage },
  );
  assert.equal(wrongCardinality.status, "failed");
  assert.match(wrongCardinality.error.message, /requires 4/);
});
