import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  assertBlobSource,
  binarySourceFormat,
  parseGltfDocument,
  parseVideoProjectEnvelope,
  rewriteGltfDependencyUris,
  sourceFormatForBlob,
} from "../src/shell/media-editors/source-integrity.mjs";

function mp4Bytes() {
  return Uint8Array.from([
    0, 0, 0, 24,
    0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d,
    0, 0, 0, 0,
    0x69, 0x73, 0x6f, 0x6d,
    0x6d, 0x70, 0x34, 0x32,
  ]);
}

function glbBytes() {
  const json = new TextEncoder().encode('{"asset":{"version":"2.0"}} ');
  const output = new Uint8Array(20 + json.length);
  output.set([0x67, 0x6c, 0x54, 0x46], 0);
  const view = new DataView(output.buffer);
  view.setUint32(4, 2, true);
  view.setUint32(8, output.length, true);
  view.setUint32(12, json.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  output.set(json, 20);
  return output;
}

test("source signatures reject renamed cross-kind payloads", async () => {
  assert.equal(binarySourceFormat(mp4Bytes()), "mp4");
  const truncatedMp4 = mp4Bytes();
  truncatedMp4[3] = 127;
  assert.equal(binarySourceFormat(truncatedMp4), "unknown");
  assert.equal(
    await sourceFormatForBlob(
      new Blob([Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0])], {
        type: "audio/mpeg",
      }),
    ),
    "mp3",
  );
  assert.equal(
    await sourceFormatForBlob(
      new Blob(["garbage\n%PDF-1.7\n"], { type: "application/octet-stream" }),
    ),
    "pdf",
  );
  assert.equal(await sourceFormatForBlob(new Blob([glbBytes()])), "glb");
  assert.equal(
    await sourceFormatForBlob(
      new Blob(['{"asset":{"version":"2.0"},"scenes":[]}'], {
        type: "model/gltf+json",
      }),
    ),
    "gltf",
  );
  assert.equal(
    await sourceFormatForBlob(
      new Blob([
        JSON.stringify({
          schema: "oceanleo.timeline.v1",
          version: 1,
          data: { width: 1920, height: 1080, fps: 30, tracks: [] },
        }),
      ]),
    ),
    "video-project",
  );

  const disguisedPng = new Blob([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
  ], { type: "model/gltf-binary" });
  await assert.rejects(
    () => assertBlobSource(disguisedPng, "model3d"),
    /源格式不匹配.*GLB 或 glTF.*PNG/,
  );
  await assert.rejects(
    () => assertBlobSource(new Blob(["not a PDF"], {
      type: "application/pdf",
    }), "pdf"),
    /源格式不匹配.*真实 PDF.*未知二进制/,
  );
});

test("glTF dependency closure keeps URI identity and routes every remote byte through proxy", () => {
  const sourceUrl =
    "https://cdn.example/models/scene.gltf?X-Amz-Signature=entry";
  const original = parseGltfDocument(JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ uri: "mesh.bin?X-Amz-Signature=mesh" }],
    images: [
      { uri: "textures/albedo.png?token=texture" },
      { uri: "https://images.example/normal.png?sig=normal" },
      { uri: "data:image/png;base64,AA==" },
    ],
  }));
  const proxied = rewriteGltfDependencyUris(
    original,
    sourceUrl,
    (url) => `https://api.oceanleo.com/v1/media/proxy?url=${encodeURIComponent(url)}`,
  );

  assert.equal(original.buffers[0].uri, "mesh.bin?X-Amz-Signature=mesh");
  const decoded = [...proxied.buffers, ...proxied.images]
    .filter((entry) => !entry.uri.startsWith("data:"))
    .map((entry) => new URL(entry.uri).searchParams.get("url"));
  assert.deepEqual(decoded, [
    "https://cdn.example/models/mesh.bin?X-Amz-Signature=mesh",
    "https://cdn.example/models/textures/albedo.png?token=texture",
    "https://images.example/normal.png?sig=normal",
  ]);
  assert.equal(proxied.images[2].uri, "data:image/png;base64,AA==");
});

test("glTF and video project parsers fail closed with diagnostic schema errors", () => {
  assert.throws(
    () => parseGltfDocument('{"asset":{"version":"1.0"}}'),
    /asset\.version 2\.x/,
  );
  assert.throws(
    () =>
      rewriteGltfDependencyUris(
        parseGltfDocument(JSON.stringify({
          asset: { version: "2.0" },
          buffers: [{ uri: "file:///tmp/mesh.bin" }],
        })),
        "https://cdn.example/scene.gltf",
        (url) => url,
      ),
    /依赖协议不受支持/,
  );
  assert.throws(
    () =>
      rewriteGltfDependencyUris(
        parseGltfDocument(JSON.stringify({
          asset: { version: "2.0" },
          images: [{ uri: "blob:https://example.test/stale" }],
        })),
        "https://cdn.example/scene.gltf",
        (url) => url,
      ),
    /不能引用.*blob URL/,
  );
  assert.throws(
    () =>
      parseVideoProjectEnvelope(
        '{"schema":"wrong","version":1,"data":{}}',
      ),
    /oceanleo\.timeline\.v1 version 1/,
  );
});

test("all five advanced editor paths enforce the shared source contract", async () => {
  const [
    video,
    timelineModel,
    audio,
    audioPersistence,
    pdfSource,
    pdfWorkbench,
    modelFiles,
    modelHook,
    modelLoader,
    modelRuntime,
    modelRoute,
  ] = await Promise.all([
    "src/shell/video-editor/use-video-timeline.ts",
    "src/shell/video-editor/timeline-model.ts",
    "src/shell/media-editors/AudioWorkbench.tsx",
    "src/shell/media-editors/use-audio-persistence.ts",
    "src/shell/media-editors/pdf-source.ts",
    "src/shell/media-editors/use-pdf-workbench.ts",
    "src/shell/media-editors/model3d-files.ts",
    "src/shell/media-editors/use-model3d-workbench.ts",
    "src/shell/media-editors/use-model3d-source-loader.ts",
    "src/shell/media-editors/model3d-runtime.mjs",
    "src/shell/advanced-routes/Model3DRoute.tsx",
  ].map((path) => readFile(resolve(path), "utf8")));

  assert.match(video, /assertBlobSource\(file, media\)/);
  assert.match(video, /assertBlobSource\(blob, "video-project"\)/);
  assert.match(video, /parseVideoProjectEnvelope/);
  assert.match(video, /assertTimelineMediaSources\(normalized\)/);
  assert.match(video, /if \(!probe\)[\s\S]*未加入时间线/);
  const videoAutosave = video.slice(
    video.indexOf("const saveDraft"),
    video.indexOf("const exportVideo"),
  );
  assert.match(videoAutosave, /durableTimelineSources/);
  assert.match(videoAutosave, /uploadDraft/);
  assert.doesNotMatch(videoAutosave, /renderTimeline/);
  assert.match(timelineModel, /timelineDocIssue/);
  assert.match(timelineModel, /缺少安全的 http\(s\) 媒体源/);

  assert.match(audio, /assertBlobSource\(blob, "audio"\)/);
  assert.match(audio, /assertBlobSource\(file, "audio"\)/);
  assert.match(audioPersistence, /assertBlobSource\(payload, "audio"\)/);

  assert.match(pdfSource, /assertBlobSource\(blob, "pdf"\)/);
  assert.match(pdfWorkbench, /assertBlobSource\(file, "pdf"\)/);

  assert.match(modelFiles, /prepareModelRuntimeSource/);
  assert.match(modelFiles, /rewriteGltfDependencyUris/);
  assert.match(modelHook, /useModel3DSourceLoader/);
  assert.doesNotMatch(modelHook, /importMediaUrl\(checkpointSource/);
  assert.match(modelLoader, /prepareModelRuntimeSource/);
  assert.match(modelLoader, /dependencyBaseUrl/);
  assert.match(modelRuntime, /resolveAssetUrl/);
  assert.match(modelRoute, /threeDSubtypeFor\(props\.item\)/);
  assert.match(modelRoute, /isModel3DSourceItem\(material\)/);
  assert.match(modelRoute, /HDRI 是环境光照素材，不能作为 3D 模型加载/);
});
