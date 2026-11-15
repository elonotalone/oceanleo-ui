import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import http from "node:http";
import { openLibraryVideoCanvas } from "../src/shell/video-canvas/library-entry.ts";
import { createVideoProject } from "../src/shell/video-canvas/engine/project-model.ts";
import { renderVideoProjectPreview } from "../src/shell/workflow-carrier/video-project-preview.ts";
import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";
import * as gateway from "../src/shell/video-canvas/engine/canvas-gateway.ts";
import { PW_VM_MESSAGES } from "../src/i18n/ui/messages/pw-vm-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";
const item = { id: "root", artifactId: "root", revisionId: "r1", artifactType: "workflow", artifact: { sourceFormat: "oceanleo.video.project.v2" } };
const png = new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])], { type: "image/png" });

test("creating a canvas stages private JSON and a PNG then receives one typed root", async () => {
  const uploads = [], ensures = [];
  const creation = createVideoProject("Fixture");
  const deps = { current: async () => { throw new Error("unexpected current read"); }, preview: async () => png,
    upload: async (file, options) => { uploads.push({ file, options }); return { ok: true, data: { file: { url: "", blob_id: `project-assets:u/owner/${file.type === "image/png" ? "cover.png" : "source.json"}` } } }; },
    ensure: async value => { ensures.push(value); return { ok: true, data: item }; } };
  assert.deepEqual(await openLibraryVideoCanvas("", "Fixture", deps, creation), item);
  assert.equal(uploads.length, 2);
  for (const { options } of uploads) { assert.equal(options.privateUpload, true); assert.equal(options.registerAsset, false); }
  assert.match(ensures[0].sourceUrl, /^project-assets:.*source\.json$/);
  assert.match(ensures[0].renditionUrl, /^project-assets:.*cover\.png$/);
  assert.equal(ensures[0].sourceFormat, "oceanleo.video.project.v2");
  assert.equal(ensures[0].artifactType, "workflow");
  assert.equal(ensures[0].payloadDigest, createHash("sha256").update(await uploads[0].file.text()).digest("hex"));
  await openLibraryVideoCanvas("", "Fixture", deps, creation);
  assert.equal(ensures[0].idempotencyKey, ensures[1].idempotencyKey, "a failed response/retry reuses the initial intent");
  assert.equal(await uploads[0].file.text(), await uploads[2].file.text());
});

test("reopening resolves the current Library head without uploading or creating", async () => {
  let reads = 0;
  const opened = await openLibraryVideoCanvas("root", "Fixture", { current: async id => { assert.equal(id, "root"); reads++; return { ok: true, data: item }; },
    upload: async () => { throw new Error("must not upload"); }, ensure: async () => { throw new Error("must not create"); } });
  assert.equal(reads, 1); assert.deepEqual(opened, item);
  await assert.rejects(openLibraryVideoCanvas("root", "Fixture", { current: async () => ({ ok: false, error: "offline" }) }), /offline/);
});

test("a blank canvas still produces a real cover from its title", async () => {
  const previous = globalThis.document;
  const text = [];
  globalThis.document = { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({ fillRect() {}, fillText: value => text.push(value) }), toBlob: callback => callback(png) }) };
  try {
    const preview = await renderVideoProjectPreview(createVideoProject("Empty fixture"));
    assert.equal(preview.type, "image/png"); assert.deepEqual(text, ["Empty fixture"]);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});

test("generation uses the shared gateway from every editor entry (local HTTP)", async () => {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let text = ""; for await (const chunk of req) text += chunk;
    calls.push({ path: req.url, method: req.method, body: text ? JSON.parse(text) : null });
    const result = req.url === "/v1/chat" ? { text: "Fixture script" } : req.url.startsWith("/v1/images/") ? { images: ["https://media.invalid/fixture.png"] } : { providers: {} };
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const runtime = await import(await compileModule("src/shell/video-canvas/runtime.ts", {
      "../../lib/auth/client": dataModule('export async function accessToken(){ return "fixture-token"; }'),
      "../../lib/auth/config": dataModule(`export const GATEWAY_BASE=${JSON.stringify(url)};`),
      "../../lib/operator-remark": dataModule("export const withOperatorRemarkRequest=value=>value;"),
      "./engine/canvas-gateway": realModule("src/shell/video-canvas/engine/canvas-gateway.ts"),
    }));
    assert.deepEqual(await runtime.generateScript("Fixture"), { text: "Fixture script" });
    assert.equal((await runtime.generateImage("Fixture", "9:16")).images.length, 1);
    await runtime.getDurableVideoCapabilities();
    assert.deepEqual(calls.map(call => call.path), ["/v1/chat", "/v1/images/generate", "/v1/video-canvas/capabilities"]);
    assert.equal(calls[0].body.messages[0].content, "Fixture");
    assert.equal(calls[1].body.ratio, "9:16");
    const local = URL.createObjectURL(png);
    try {
      await gateway.generateImage("Connected image", "16:9", { sourceUrls: [local, "https://media.invalid/reference.png"] });
    } finally { URL.revokeObjectURL(local); }
    assert.equal(calls.at(-1).path, "/v1/images/edit");
    assert.equal(calls.at(-1).body.image_urls[0], `data:image/png;base64,${Buffer.from(await png.arrayBuffer()).toString("base64")}`);
    assert.equal(calls.at(-1).body.image_urls[1], "https://media.invalid/reference.png");
    await gateway.quoteDurableVideo({ image: true, duration: 5, ratio: "16:9" });
    await gateway.registerDurableVideoInput({ projectId: "project", localAssetId: "asset", sourceDependency: { artifactId: "owner-root", revisionId: "r1", path: "frame" } });
    await gateway.listDurableVideoRuns("project");
    await gateway.generateAudio({ mode: "voice", text: "Narration" });
    await gateway.generateAudio({ mode: "music", text: "Ocean", duration: 15 });
    assert.deepEqual(calls.slice(-5).map(call=>call.path), ["/v1/video-canvas/quote", "/v1/video-canvas/projects/project/inputs", "/v1/video-canvas/projects/project/runs", "/v1/audio/tts", "/v1/music/generate"]);
    assert.equal(calls.at(-4).body.source_dependency.artifactId, "owner-root");
    assert.equal(calls.at(-1).body.duration_s, 15);
  } finally { gateway.bindCanvasGatewayImpl(); gateway.bindCanvasFetchJson(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test("catalog capability descriptions have all UI locales", () => {
  assert.deepEqual(Object.keys(PW_VM_MESSAGES).sort(), [...LOCALES].sort());
  const keys = Object.keys(PW_VM_MESSAGES.zh);
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(PW_VM_MESSAGES[locale]), keys);
    for (const text of Object.values(PW_VM_MESSAGES[locale])) assert.ok(text.length > 5);
  }
});
