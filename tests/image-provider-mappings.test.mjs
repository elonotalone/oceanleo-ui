import assert from "node:assert/strict";
import test from "node:test";

import {
  OCEANLEO_IMAGE_AI_PROVIDER_MAPPINGS,
  buildOceanLeoImageAiRequests,
  createImageRecipeDocument,
  createOceanLeoImageAiProvider,
  executeImageAiCommand,
  startImageAiCommand,
  validateImageAiCommand,
} from "../src/lib/image-ai-edit.ts";

const SOURCE = {
  byteDigest: "c".repeat(64),
  byteLength: 4_096,
  mimeType: "image/png",
  assetId: "asset-source",
  revisionId: "revision-7",
  url: "https://cdn.example/source.png",
};

const COMMANDS = [
  { id: "relight", params: { direction: "left", intensity: 1.25 } },
  { id: "multi-angle", params: { count: 3, prompt: "product orbit" } },
  { id: "panorama", params: { fieldOfView: 270 } },
  { id: "grid-4", params: {} },
  { id: "grid-9", params: {} },
  { id: "grid-25", params: {} },
  { id: "grid-split", params: { rows: 2, columns: 2 } },
  { id: "upscale", params: { scale: 4 } },
  {
    id: "inpaint",
    params: {
      prompt: "remove mark",
      maskUrl: "https://cdn.example/mask.png",
    },
  },
  { id: "outpaint", params: { left: 128, right: 64 } },
  { id: "portrait-quality", params: { strength: 0.65 } },
];

function document() {
  return createImageRecipeDocument(SOURCE, { outputId: "source-output" });
}

function requestInput() {
  return {
    sourceUrl: SOURCE.url,
    maskUrl: "https://cdn.example/mask.png",
    siteId: "image",
    source: SOURCE,
    parentOutputId: "source-output",
  };
}

test("all eleven semantic mappings expose exact executable request schemas", () => {
  assert.deepEqual(Object.keys(OCEANLEO_IMAGE_AI_PROVIDER_MAPPINGS), [
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
  ]);
  for (const candidate of COMMANDS) {
    const command = validateImageAiCommand(candidate);
    const requests = buildOceanLeoImageAiRequests(command, requestInput());
    assert.ok(requests.length > 0, `${command.id} has an execution request`);
    for (const request of requests) {
      assert.equal(request.commandId, command.id);
      assert.equal(request.schema, "oceanleo.image-gateway-request@1");
      assert.equal(request.inputLineage.sourceByteDigest, SOURCE.byteDigest);
      assert.equal(request.inputLineage.parentOutputId, "source-output");
      assert.ok(Object.isFrozen(request));
      assert.ok(Object.isFrozen(request.body));
    }
  }
});

test("production grid splitting fails closed when canvas decoding is unavailable", () => {
  const provider = createOceanLeoImageAiProvider();
  const availability = provider.availability("grid-split");
  assert.equal(availability.enabled, false);
  assert.match(availability.reason, /createImageBitmap|canvas/);
});

test("mapping bodies match deployed edit, upscale, mask and local split contracts", () => {
  const multi = buildOceanLeoImageAiRequests(
    validateImageAiCommand(COMMANDS[1]),
    requestInput(),
  );
  assert.equal(multi.length, 3);
  assert.equal(new Set(multi.map((request) => request.body.prompt)).size, 3);
  for (const request of multi) {
    assert.equal(request.endpoint, "/v1/images/edit");
    assert.equal(request.requestSchema, "oceanleo.gateway.images.edit@1");
    assert.equal(request.body.function, "description_edit");
    assert.equal(request.body.n, 1);
  }

  const upscale = buildOceanLeoImageAiRequests(
    validateImageAiCommand(COMMANDS[7]),
    requestInput(),
  )[0];
  assert.equal(upscale.endpoint, "/v1/images/upscale");
  assert.equal(upscale.body.upscale_factor, 4);

  const inpaint = buildOceanLeoImageAiRequests(
    validateImageAiCommand(COMMANDS[8]),
    requestInput(),
  )[0];
  assert.deepEqual(inpaint.body.image_urls, [
    SOURCE.url,
    "https://cdn.example/mask.png",
  ]);
  assert.match(inpaint.body.prompt, /second image is a mask/);

  const split = buildOceanLeoImageAiRequests(
    validateImageAiCommand(COMMANDS[6]),
    requestInput(),
  )[0];
  assert.equal(split.endpoint, "local-grid-split");
  assert.equal(split.expectedOutputCount, 4);
  assert.deepEqual(split.body, { rows: 2, columns: 2 });
});

test("production adapter executes all eleven mappings with immutable lineage", async () => {
  let gatewayCalls = 0;
  let uploadCalls = 0;
  const fetcher = async (url, init = {}) => {
    if ((init.method || "GET") === "GET") {
      return new Response(new Blob(["source"], { type: "image/png" }), {
        status: 200,
      });
    }
    gatewayCalls += 1;
    const body = JSON.parse(String(init.body || "{}"));
    assert.equal(body.site_id, "image");
    assert.equal(body.key_mode, "platform");
    return new Response(
      JSON.stringify({
        images: [`https://cdn.example/generated-${gatewayCalls}.png`],
        credits_spent: 1,
        request_id: `request-${gatewayCalls}`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const provider = createOceanLeoImageAiProvider({
    fetcher,
    getAccessToken: async () => "token",
    splitGrid: async (_source, rows, columns) =>
      Array.from(
        { length: rows * columns },
        (_, index) => new Blob([`cell-${index}`], { type: "image/png" }),
      ),
    upload: async () => {
      uploadCalls += 1;
      return `https://cdn.example/grid-cell-${uploadCalls}.png`;
    },
    wait: async () => {},
  });
  const baseDocument = document();
  for (const candidate of COMMANDS) {
    const receipt = await executeImageAiCommand(
      provider,
      candidate,
      {
        source: baseDocument.source,
        parentLineage: baseDocument.lineage,
      },
    );
    assert.equal(receipt.status, "succeeded", candidate.id);
    const expected =
      candidate.id === "multi-angle"
        ? candidate.params.count
        : candidate.id === "grid-split"
          ? candidate.params.rows * candidate.params.columns
          : 1;
    assert.equal(receipt.outputs.length, expected, candidate.id);
    for (const output of receipt.outputs) {
      assert.equal(output.lineage.sourceByteDigest, SOURCE.byteDigest);
      assert.deepEqual(output.lineage.parentOutputIds, ["source-output"]);
      assert.equal(output.lineage.commandId, candidate.id);
      assert.ok(Object.isFrozen(output.lineage));
    }
    if (candidate.id === "grid-split") {
      assert.equal(receipt.billing.amount, 0);
      assert.equal(receipt.billing.charged, false);
    } else {
      assert.equal(receipt.billing.currency, "OCEANLEO_CREDITS");
    }
  }
  assert.equal(gatewayCalls, 12);
  assert.equal(uploadCalls, 4);
});

test("async gateway responses poll, expose typed errors and cancel cooperatively", async () => {
  let polls = 0;
  const progress = [];
  const asyncProvider = createOceanLeoImageAiProvider({
    fetcher: async (_url, init = {}) => {
      if (init.method === "POST") {
        return new Response(
          JSON.stringify({
            job_id: "job-1",
            status: "queued",
            status_url: "/v1/images/jobs/job-1",
            cancel_url: "/v1/images/jobs/job-1",
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      }
      polls += 1;
      return new Response(
        JSON.stringify(
          polls === 1
            ? { job_id: "job-1", status: "running", progress: 55 }
            : {
                job_id: "job-1",
                status: "succeeded",
                images: ["https://cdn.example/async.png"],
              },
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
    getAccessToken: async () => "token",
    wait: async () => {},
  });
  const baseDocument = document();
  const receipt = await executeImageAiCommand(
    asyncProvider,
    { id: "relight", params: {} },
    {
      source: baseDocument.source,
      parentLineage: baseDocument.lineage,
    },
    { onState: (state) => progress.push(state.progress.phase) },
  );
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.providerRunId, "job-1");
  assert.equal(polls, 2);
  assert.ok(progress.includes("processing"));

  const failedProvider = createOceanLeoImageAiProvider({
    fetcher: async () =>
      new Response(JSON.stringify({ detail: "rate limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    getAccessToken: async () => "token",
  });
  const failed = await executeImageAiCommand(
    failedProvider,
    { id: "relight", params: {} },
    {
      source: baseDocument.source,
      parentLineage: baseDocument.lineage,
    },
  );
  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.error, {
    code: "image-provider-throttled",
    message: "rate limited",
    retryable: true,
  });

  let untrustedCalls = 0;
  const untrustedPollingProvider = createOceanLeoImageAiProvider({
    fetcher: async () => {
      untrustedCalls += 1;
      return new Response(
        JSON.stringify({
          job_id: "job-untrusted",
          status: "queued",
          status_url: "https://attacker.example/jobs/job-untrusted",
          cancel_url: "https://attacker.example/jobs/job-untrusted",
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      );
    },
    getAccessToken: async () => "token",
  });
  const untrusted = await executeImageAiCommand(
    untrustedPollingProvider,
    { id: "relight", params: {} },
    {
      source: baseDocument.source,
      parentLineage: baseDocument.lineage,
    },
  );
  assert.equal(untrusted.status, "failed");
  assert.equal(untrusted.error.code, "image-provider-polling-unavailable");
  assert.equal(untrustedCalls, 1, "auth token never reaches an untrusted status URL");

  let cancelDeletes = 0;
  const cancelProvider = createOceanLeoImageAiProvider({
    fetcher: async (_url, init = {}) => {
      if (init.method === "DELETE") {
        cancelDeletes += 1;
        return new Response(null, { status: 204 });
      }
      return new Response(
        JSON.stringify({
          job_id: "job-cancel",
          status: "queued",
          status_url: "/v1/images/jobs/job-cancel",
          cancel_url: "/v1/images/jobs/job-cancel",
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      );
    },
    getAccessToken: async () => "token",
    wait: (_milliseconds, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  });
  const handle = startImageAiCommand(
    cancelProvider,
    { id: "relight", params: {} },
    {
      source: baseDocument.source,
      parentLineage: baseDocument.lineage,
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  handle.cancel();
  const canceled = await handle.result;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(canceled.status, "canceled");
  assert.equal(cancelDeletes, 1);
});
