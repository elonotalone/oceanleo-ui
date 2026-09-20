// 媒体 / 生成类请求必须带上付费主体（W22）。
//
// 判两件事：选了组织 → 请求体 `org_id` 就是那个组织；没选 → 恒为 `""`，
// 其余字段与改前相同。空串漏成 undefined / 省略字段会在网关那边悄悄记到个人账。
//
// 跑法（必须带 loader）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/payer-media-wiring.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { createEmptyDoc } from "../src/shell/video-editor/timeline-model.ts";

const payerStub = dataModule(`
  export function payerRequestFields(explicit) {
    const org = explicit !== undefined ? explicit : (globalThis.__W22_ORG_ID ?? "");
    return { org_id: String(org) };
  }
  export function persistedPayerOrgId() {
    return globalThis.__W22_ORG_ID ?? "";
  }
`);

const authClient = dataModule(`
  export async function accessToken() { return "tok"; }
`);
const authConfig = dataModule(`
  export const GATEWAY_BASE = "https://gw.test";
`);

function jsonOk(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    blob: async () => new Blob([JSON.stringify(payload)], { type: "application/json" }),
  };
}

function blobOk(bytes = "converted") {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
    blob: async () => new Blob([bytes], { type: "application/octet-stream" }),
  };
}

function installFetch(handler) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls);
  };
  return {
    calls,
    restore() {
      if (previous === undefined) delete globalThis.fetch;
      else globalThis.fetch = previous;
    },
  };
}

function jsonBody(init) {
  return JSON.parse(String(init?.body || "{}"));
}

function restWithoutOrg(body) {
  const rest = { ...body };
  delete rest.org_id;
  return rest;
}

function formStrings(body) {
  assert.ok(body instanceof FormData, "convert 必须走 multipart FormData");
  const out = {};
  for (const [key, value] of body.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

async function withOrg(orgId, fn) {
  const previous = globalThis.__W22_ORG_ID;
  globalThis.__W22_ORG_ID = orgId;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete globalThis.__W22_ORG_ID;
    else globalThis.__W22_ORG_ID = previous;
  }
}

const { runCapability } = await import(
  await compileModule("src/lib/capabilities.ts", {
    "./auth/client": authClient,
    "./auth/config": authConfig,
    "./payer": payerStub,
  })
);

const { createGatewayAiTransport } = await import(
  await compileModule("src/shell/plugin-ai/transport.ts", {
    "../../lib/auth/client": authClient,
    "../../lib/auth/config": authConfig,
    "../../lib/payer": payerStub,
  })
);

const { submitRenderJob } = await import(
  await compileModule("src/shell/video-editor/render-client.ts", {
    "../../lib/auth/client": authClient,
    "../../lib/auth/config": authConfig,
    "../../lib/payer": payerStub,
  })
);

const { convertImageBlob, convertMediaBlob } = await import(
  await compileModule("src/shell/media-editors/visual-convert-client.ts", {
    "../../lib/auth/client": authClient,
    "../../lib/auth/config": authConfig,
    "../../lib/payer": payerStub,
  })
);

const { convertOfficeBlob } = await import(
  await compileModule("src/shell/doc-editors/office-convert-client.ts", {
    "../../lib/auth/client": authClient,
    "../../lib/auth/config": authConfig,
    "../../lib/payer": payerStub,
  })
);

const { normalizeForEditor } = await import(
  await compileModule("src/shell/import-normalize.ts", {
    "../lib/auth/client": authClient,
    "../lib/auth/config": authConfig,
    "../lib/payer": payerStub,
  })
);

const { submitBailianAsr } = await import(
  await compileModule("src/shell/media-editors/audio-transcript.ts", {
    "../../lib/payer": payerStub,
  })
);

const {
  aiEditImage,
  createOceanLeoImageAiProvider,
  createImageRecipeDocument,
  executeImageAiCommand,
} = await import(
  await compileModule("src/lib/image-ai-edit.ts", {
    "./auth/client": authClient,
    "./auth/config": authConfig,
    "./payer": payerStub,
    "./database": dataModule(`
      export async function uploadFile() {
        return { ok: true, data: { file: { url: "https://cdn.test/src.png" } } };
      }
    `),
  })
);

function transportContext(capability) {
  return {
    capability,
    runId: "run-1",
    requestId: "req-1",
    siteId: "image",
    model: "",
    signal: new AbortController().signal,
    onProgress() {},
  };
}

async function assertJsonPayer(run, expectedRest) {
  await withOrg("", async () => {
    const fetch = installFetch(() => jsonOk({ images: ["https://x"], job_id: "j1", task_id: "t1", text: "ok", audio_url: "https://a" }));
    try {
      await run();
      const body = jsonBody(fetch.calls[0].init);
      assert.equal(body.org_id, "");
      assert.deepEqual(restWithoutOrg(body), expectedRest);
    } finally {
      fetch.restore();
    }
  });
  await withOrg("org-acme", async () => {
    const fetch = installFetch(() => jsonOk({ images: ["https://x"], job_id: "j1", task_id: "t1", text: "ok", audio_url: "https://a" }));
    try {
      await run();
      const body = jsonBody(fetch.calls[0].init);
      assert.equal(body.org_id, "org-acme");
      assert.deepEqual(restWithoutOrg(body), expectedRest);
    } finally {
      fetch.restore();
    }
  });
}

async function assertFormPayer(run, expectedRest) {
  await withOrg("", async () => {
    const fetch = installFetch(() => blobOk());
    try {
      await run();
      const fields = formStrings(fetch.calls[0].init.body);
      assert.equal(fields.org_id, "");
      const rest = { ...fields };
      delete rest.org_id;
      assert.deepEqual(rest, expectedRest);
    } finally {
      fetch.restore();
    }
  });
  await withOrg("org-acme", async () => {
    const fetch = installFetch(() => blobOk());
    try {
      await run();
      const fields = formStrings(fetch.calls[0].init.body);
      assert.equal(fields.org_id, "org-acme");
      const rest = { ...fields };
      delete rest.org_id;
      assert.deepEqual(rest, expectedRest);
    } finally {
      fetch.restore();
    }
  });
}

test("runCapability image/tts/search/convert JSON 体带 org_id，其余字段不变", async () => {
  await assertJsonPayer(
    () => runCapability("image", { prompt: "一只猫" }, { siteId: "image" }),
    { site_id: "image", key_mode: "platform", prompt: "一只猫" },
  );
  await assertJsonPayer(
    () => runCapability("tts", { text: "你好" }, { siteId: "audio" }),
    { site_id: "audio", text: "你好" },
  );
  await assertJsonPayer(
    () => runCapability("search", { query: "报价" }, { siteId: "oceanleo" }),
    { site_id: "oceanleo", query: "报价" },
  );
  await assertJsonPayer(
    () => runCapability("convert", { url: "https://f.test/a.docx", target: "pdf" }, { siteId: "docs" }),
    { site_id: "docs", url: "https://f.test/a.docx", target: "pdf" },
  );
});

test("plugin-ai 网关传输 image.generate / image.edit / videos.generate 带 org_id", async () => {
  const expectedGenerate = {
    site_id: "image",
    key_mode: "platform",
    prompt: "一只猫",
  };
  await withOrg("", async () => {
    const calls = [];
    const transport = createGatewayAiTransport({
      siteId: "image",
      streaming: false,
      fetcher: async (url, init) => {
        calls.push({ url: String(url), body: jsonBody(init) });
        return jsonOk({ images: ["https://x"], task_id: "t1", video_url: "https://v" });
      },
    });
    await transport.execute(
      "image.generate",
      { prompt: "一只猫" },
      transportContext("image.generate"),
    );
    assert.match(calls[0].url, /\/v1\/images\/generate$/);
    assert.equal(calls[0].body.org_id, "");
    assert.deepEqual(restWithoutOrg(calls[0].body), expectedGenerate);
  });
  await withOrg("org-acme", async () => {
    const calls = [];
    const transport = createGatewayAiTransport({
      siteId: "image",
      streaming: false,
      fetcher: async (url, init) => {
        calls.push({ url: String(url), body: jsonBody(init) });
        return jsonOk({
          images: ["https://x"],
          request_id: "r1",
        });
      },
    });
    await transport.execute(
      "image.edit",
      { source: { url: "https://cdn.test/src.png" }, prompt: "改光" },
      transportContext("image.edit"),
    );
    assert.match(calls[0].url, /\/v1\/images\/edit$/);
    assert.equal(calls[0].body.org_id, "org-acme");
    assert.equal(calls[0].body.image_url, "https://cdn.test/src.png");
    assert.equal(calls[0].body.site_id, "image");
    const again = [];
    const video = createGatewayAiTransport({
      siteId: "video",
      streaming: false,
      fetcher: async (url, init) => {
        again.push({ url: String(url), body: jsonBody(init) });
        return jsonOk({ video_url: "https://v" });
      },
    });
    await video.execute(
      "video.generate",
      { prompt: "海浪" },
      { ...transportContext("video.generate"), siteId: "video" },
    );
    assert.match(again[0].url, /\/v1\/videos\/generate$/);
    assert.equal(again[0].body.org_id, "org-acme");
    assert.equal(again[0].body.prompt, "海浪");
    assert.equal(again[0].body.site_id, "video");
  });
});

test("submitRenderJob 时间线 JSON 带 org_id，timeline 其余字段不变", async () => {
  const expectedKeys = new Set(["timeline", "title", "site_id"]);
  await withOrg("", async () => {
    const fetch = installFetch(() => jsonOk({ job_id: "job-1" }));
    try {
      await submitRenderJob({
        timeline: createEmptyDoc(),
        title: "导出",
        site_id: "video",
      });
      const body = jsonBody(fetch.calls[0].init);
      assert.match(fetch.calls[0].url, /\/v1\/video\/render-timeline$/);
      assert.equal(body.org_id, "");
      assert.equal(body.title, "导出");
      assert.equal(body.site_id, "video");
      assert.ok(body.timeline);
      assert.deepEqual(
        new Set(Object.keys(restWithoutOrg(body))),
        expectedKeys,
      );
    } finally {
      fetch.restore();
    }
  });
  await withOrg("org-acme", async () => {
    const fetch = installFetch(() => jsonOk({ job_id: "job-1" }));
    try {
      await submitRenderJob({
        timeline: createEmptyDoc(),
        title: "导出",
        site_id: "video",
      });
      const body = jsonBody(fetch.calls[0].init);
      assert.equal(body.org_id, "org-acme");
      assert.equal(body.title, "导出");
    } finally {
      fetch.restore();
    }
  });
});

test("convert image/media/office Form 字段 org_id，其余字段不变", async () => {
  const file = new Blob(["abc"], { type: "image/png" });
  await assertFormPayer(
    () => convertImageBlob(file, "a.png", "jpg", 80),
    { target: "jpg", quality: "80" },
  );
  await assertFormPayer(
    () => convertMediaBlob(file, "a.mov", "mp4"),
    { target: "mp4" },
  );
  await assertFormPayer(
    () => convertOfficeBlob(file, "a.docx", "pdf"),
    { target: "pdf" },
  );
});

test("normalizeForEditor 走 convert Form 时带 org_id", async () => {
  const file = new File(["abc"], "scan.heic", { type: "image/heic" });
  const plan = {
    editorId: "image",
    accept: ["png", "jpg"],
    rules: [{ from: ["heic"], to: "jpg", endpoint: "image", quality: 90 }],
  };
  await assertFormPayer(
    () => normalizeForEditor(file, "image", plan),
    { target: "jpg", quality: "90" },
  );
});

test("submitBailianAsr JSON 带 org_id，其余字段不变", async () => {
  const expected = {
    site_id: "music",
    file_urls: ["https://cdn.test/a.wav"],
    key_mode: "platform",
  };
  await withOrg("", async () => {
    const calls = [];
    await submitBailianAsr(
      {
        postJson: async (path, body) => {
          calls.push({ path, body });
          return { task_id: "t-1" };
        },
      },
      { siteId: "music", fileUrls: ["https://cdn.test/a.wav"] },
    );
    assert.equal(calls[0].path, "/v1/audio/asr");
    assert.equal(calls[0].body.org_id, "");
    assert.deepEqual(restWithoutOrg(calls[0].body), expected);
  });
  await withOrg("org-acme", async () => {
    const calls = [];
    await submitBailianAsr(
      {
        postJson: async (_path, body) => {
          calls.push(body);
          return { task_id: "t-1" };
        },
      },
      { siteId: "music", fileUrls: ["https://cdn.test/a.wav"] },
    );
    assert.equal(calls[0].org_id, "org-acme");
    assert.deepEqual(restWithoutOrg(calls[0]), expected);
  });
});

test("aiEditImage 与 OceanLeo image provider 发出的网关 JSON 带 org_id", async () => {
  await assertJsonPayer(
    () => aiEditImage("改光", new Blob(["img"], { type: "image/png" }), { siteId: "image" }),
    {
      site_id: "image",
      image_url: "https://cdn.test/src.png",
      prompt: "改光",
      n: 1,
    },
  );

  await withOrg("org-acme", async () => {
    const calls = [];
    const source = {
      byteDigest: "a".repeat(64),
      byteLength: 3,
      mimeType: "image/png",
      url: "https://cdn.test/src.png",
    };
    const provider = createOceanLeoImageAiProvider({
      siteId: "image",
      getAccessToken: async () => "tok",
      fetcher: async (_url, init = {}) => {
        if ((init.method || "GET") === "GET") {
          return new Response(new Blob(["x"], { type: "image/png" }), {
            status: 200,
          });
        }
        calls.push(jsonBody(init));
        return jsonOk({ images: ["https://cdn.test/out.png"] });
      },
      upload: async () => "https://cdn.test/src.png",
      wait: async () => {},
    });
    const recipe = createImageRecipeDocument(source, { outputId: "parent-1" });
    await executeImageAiCommand(
      provider,
      { id: "upscale", params: { scale: 2 } },
      {
        source: recipe.source,
        parentLineage: recipe.lineage,
      },
    );
    assert.equal(calls[0].org_id, "org-acme");
    assert.equal(calls[0].site_id, "image");
    assert.equal(calls[0].key_mode, "platform");
    assert.equal(calls[0].upscale_factor, 2);
  });
});
