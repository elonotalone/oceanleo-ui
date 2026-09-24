// W19：音频 / 3D / 视频时间线 / 图表 / PDF
// 快速面 ⇄ 专业面交接：未存改动或耐久素材 url 被清空时，专业面仍拿到同一份内容；
// 专业面保存确认后，快速面能读到新 revision。
//
// 跑法：
//   bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- \
//     node --import ./tests/helpers/assert-dom-guard.mjs \
//     --experimental-strip-types \
//     --experimental-loader ./tests/ts-extension-loader.mjs \
//     --test tests/eas-w19-five-editors-handoff.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  applyW19HandoffToItem,
  peekW19EnterHandoff,
  peekW19ProSaved,
  reportW19ProSaved,
  resetW19HandoffStore,
  resolveW19Handoff,
  stashW19EnterHandoff,
  w19ItemKey,
  w19PdfBytesFromHandoff,
} from "../src/i18n/ui/messages/eas-w19-copy.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function durableItem(over = {}) {
  return {
    id: "lib-1",
    artifactId: "art-1",
    revisionId: "rev-old",
    url: "",
    previewUrl: "https://cdn.example/thumb.png",
    meta: {},
    ...over,
  };
}

test("reset store between cases", () => {
  resetW19HandoffStore();
});

test("audio: durable empty url + quick-face wav handoff reaches pro non-empty", () => {
  resetW19HandoffStore();
  const item = durableItem();
  const empty = resolveW19Handoff(item, null);
  assert.equal(empty.kind, "empty");
  const handoff = {
    kind: "url",
    url: "blob:audio-edited",
    format: "wav",
    revision: "3",
  };
  const key = w19ItemKey("audio", item);
  stashW19EnterHandoff(key, handoff);
  const sourceForPro = resolveW19Handoff(item, peekW19EnterHandoff(key));
  assert.equal(sourceForPro.kind, "url");
  assert.equal(sourceForPro.url, "blob:audio-edited");
  assert.notEqual(sourceForPro.url, item.previewUrl);
});

test("audio: pro save confirmation → quick face sees new revision", () => {
  resetW19HandoffStore();
  const item = durableItem({ url: "https://cdn.example/old.wav" });
  const key = w19ItemKey("audio", item);
  reportW19ProSaved(key, {
    ...item,
    url: "https://cdn.example/new.wav",
    versionId: "ver-2",
    revisionId: "rev-new",
    meta: item.meta,
  });
  const saved = peekW19ProSaved(key);
  assert.equal(saved?.revisionId, "rev-new");
  assert.equal(saved?.url, "https://cdn.example/new.wav");
});

test("threed: durable empty url uses working head, not the poster preview", () => {
  resetW19HandoffStore();
  const item = durableItem({
    meta: { editor_working_head_url: "https://cdn.example/head.glb" },
  });
  const sourceForPro = resolveW19Handoff(item, null);
  assert.equal(sourceForPro.kind, "url");
  assert.equal(sourceForPro.url, "https://cdn.example/head.glb");
});

test("threed: pro save confirmation → quick face sees new revision", () => {
  resetW19HandoffStore();
  const item = durableItem({ url: "https://cdn.example/old.glb" });
  const key = w19ItemKey("threed", item);
  reportW19ProSaved(key, {
    ...item,
    url: "https://cdn.example/new.glb",
    versionId: "ver-2",
    revisionId: "rev-new",
    meta: item.meta,
  });
  assert.equal(peekW19ProSaved(key)?.revisionId, "rev-new");
});

test("video-timeline: quick-face timeline doc is the inline handoff pro receives", () => {
  resetW19HandoffStore();
  const item = durableItem();
  const doc = {
    tracks: [{ id: "v1", kind: "video", clips: [{ id: "c-edited" }] }],
  };
  const key = w19ItemKey("video-timeline", item);
  stashW19EnterHandoff(key, {
    kind: "inline",
    json: doc,
    revision: "local-4",
  });
  const sourceForPro = resolveW19Handoff(item, peekW19EnterHandoff(key));
  assert.equal(sourceForPro.kind, "inline");
  assert.equal(sourceForPro.json.tracks[0].clips[0].id, "c-edited");
});

test("video-timeline: pro save confirmation → quick face sees new revision", () => {
  resetW19HandoffStore();
  const item = durableItem({ url: "https://cdn.example/clip.mp4" });
  const key = w19ItemKey("video-timeline", item);
  reportW19ProSaved(key, {
    ...item,
    versionId: "ver-2",
    revisionId: "rev-new",
    meta: {
      editor_project_url: "https://cdn.example/project.json",
      editor_project_schema: "openvideo.project.v1",
    },
  });
  const saved = peekW19ProSaved(key);
  assert.equal(saved?.revisionId, "rev-new");
  assert.equal(
    saved?.meta.editor_project_url,
    "https://cdn.example/project.json",
  );
});

test("chart-editor: quick-face document is the inline handoff pro receives", () => {
  resetW19HandoffStore();
  const item = durableItem({ content: "" });
  const document = {
    title: { text: "改过的标题" },
    series: [{ id: "s1", data: [1, 2, 9] }],
  };
  const key = w19ItemKey("chart-editor", item);
  stashW19EnterHandoff(key, {
    kind: "inline",
    json: document,
    revision: "8",
  });
  const sourceForPro = resolveW19Handoff(item, peekW19EnterHandoff(key));
  const patched = applyW19HandoffToItem(item, sourceForPro);
  assert.match(String(patched.content), /改过的标题/);
  assert.match(String(patched.content), /"s1"/);
});

test("chart-editor: pro save confirmation → quick face sees new revision", () => {
  resetW19HandoffStore();
  const item = durableItem({ content: "{}" });
  const key = w19ItemKey("chart-editor", item);
  reportW19ProSaved(key, {
    ...item,
    content: '{"title":{"text":"专业面改的"}}',
    versionId: "ver-2",
    revisionId: "rev-new",
    meta: { editor_revision_id: "rev-new" },
  });
  const saved = peekW19ProSaved(key);
  assert.equal(saved?.revisionId, "rev-new");
  assert.match(String(saved?.content), /专业面改的/);
});

test("pdf: durable empty url stays empty without rendition; inline bytes reach pro", () => {
  resetW19HandoffStore();
  const item = durableItem();
  assert.equal(resolveW19Handoff(item, null).kind, "empty");
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const key = w19ItemKey("pdf", item);
  stashW19EnterHandoff(key, {
    kind: "inline",
    json: { pdfBytes: bytes },
    revision: "1",
  });
  const handed = peekW19EnterHandoff(key);
  assert.deepEqual(w19PdfBytesFromHandoff(handed), bytes);
});

test("pdf: pro save confirmation → quick face sees new revision", () => {
  resetW19HandoffStore();
  const item = durableItem({ url: "https://cdn.example/old.pdf" });
  const key = w19ItemKey("pdf", item);
  reportW19ProSaved(key, {
    ...item,
    url: "https://cdn.example/new.pdf",
    versionId: "ver-2",
    revisionId: "rev-new",
    meta: item.meta,
  });
  assert.equal(peekW19ProSaved(key)?.revisionId, "rev-new");
});

test("durable empty url does not fall back to preview/thumb", () => {
  const item = durableItem({
    previewUrl: "https://cdn.example/poster.png",
  });
  assert.equal(resolveW19Handoff(item, null).kind, "empty");
});

test("non-durable items may use previewUrl when url is empty", () => {
  const item = {
    id: "local-1",
    url: "",
    previewUrl: "https://cdn.example/clip.mp4",
    meta: {},
  };
  const sourceForPro = resolveW19Handoff(item, null);
  assert.equal(sourceForPro.kind, "url");
  assert.equal(sourceForPro.url, "https://cdn.example/clip.mp4");
});

test("routes pass beforeEnterPro and stages do not lead with item.url || previewUrl", () => {
  const audioRoute = source("src/shell/advanced-routes/AudioRoute.tsx");
  const audioStage = source("src/shell/media-editors/AudioPlaylistStage.tsx");
  const modelRoute = source("src/shell/advanced-routes/Model3DRoute.tsx");
  const modelStage = source("src/shell/media-editors/Model3DNextStage.tsx");
  const videoRoute = source("src/shell/advanced-routes/VideoTimelineRoute.tsx");
  const videoStage = source("src/shell/video-editor/VideoDesigncomboStage.tsx");
  const chartRoute = source("src/shell/advanced-routes/ChartRoute.tsx");
  const chartStage = source("src/shell/chart-editor/ChartNextStage.tsx");
  const pdfRoute = source("src/shell/advanced-routes/PdfRoute.tsx");
  const pdfStage = source("src/shell/media-editors/PdfNextStage.tsx");

  assert.match(audioRoute, /beforeEnterPro=/);
  assert.match(modelRoute, /beforeEnterPro=/);
  assert.match(videoRoute, /beforeEnterPro=/);
  assert.match(chartRoute, /beforeEnterPro=/);
  assert.match(pdfRoute, /beforeEnterPro=/);

  assert.match(audioStage, /resolveW19Handoff/);
  assert.match(modelStage, /resolveW19Handoff/);
  assert.match(videoStage, /resolveW19Handoff/);
  assert.match(chartStage, /resolveW19Handoff/);
  assert.match(pdfStage, /w19PdfBytesFromHandoff|peekW19EnterHandoff/);
  assert.match(audioStage, /useEditorHandoffSource/);
  assert.match(modelStage, /useEditorHandoffSource/);
  assert.match(videoStage, /useEditorHandoffSource/);
  assert.match(chartStage, /useEditorHandoffSource/);
  assert.match(pdfRoute, /useEditorHandoffSource/);

  assert.match(audioStage, /reportW19ProSaved/);
  assert.match(modelStage, /reportW19ProSaved/);
  assert.match(videoStage, /reportW19ProSaved/);
  assert.match(chartStage, /reportW19ProSaved/);
  assert.match(pdfRoute, /reportW19ProSaved/);

  assert.doesNotMatch(
    audioStage,
    /const url = item\.url \|\| item\.previewUrl/,
  );
  assert.doesNotMatch(
    modelStage,
    /const url = item\.url \|\| item\.previewUrl/,
  );
});
