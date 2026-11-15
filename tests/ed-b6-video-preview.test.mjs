import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  loadVideoCanvasSourcePreview,
  videoCanvasBitmapPreview,
} from "../src/shell/video-canvas/library-preview.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const SOURCE = "https://media.example.test/current.json";
const PREVIEW = "https://media.example.test/poster.png";
const project = () => ({
  schema: "oceanleo.video.project.v2", schemaVersion: 2, title: "工程中的标题", headVersionId: "current", assets: {},
  versions: {
    old: { graph: { nodes: [], edges: [] }, scenes: [{ sceneId: "old", title: "旧版内容" }], shots: [] },
    current: {
      graph: { nodes: [{ nodeId: "n1", kind: "director", title: "导演", position: { x: 0, y: 0 } }], edges: [] },
      scenes: [{ sceneId: "scene1", title: "开场场景", shotIds: ["shot2", "shot1"] }],
      shots: [
        { shotId: "shot1", sceneId: "scene1", title: "第一个镜头", intendedDurationSeconds: 4 },
        { shotId: "shot2", sceneId: "scene1", title: "第二个镜头", intendedDurationSeconds: 6 },
        { shotId: "shot3", sceneId: "missing", title: "独立镜头", intendedDurationSeconds: 2 },
      ],
      clips: [{ startSeconds: 0, durationSeconds: 6 }, { startSeconds: 9, durationSeconds: 3 }],
    },
  },
});
const item = patch => ({
  key: "video1", id: "video1", artifactId: "video1", revisionId: "r1", source: "artifact", artifactType: "workflow",
  title: "库中的标题", kind: "video_canvas", siteId: "video", url: SOURCE, favorite: false,
  meta: { source_format: "oceanleo.video.project.v2", source_url: SOURCE },
  ...patch,
});

const { LibraryItemViewer } = await import(await compileModule("src/shell/library-viewers.tsx", {
  "../i18n/ui/useUI": dataModule('export function useUI(){return text=>text;}'),
  "./Markdown": dataModule('export function Markdown(){return null;}'),
  "./WebsiteArtifactViewer": dataModule('export function WebsiteArtifactViewer(){return null;}'),
  "./artifact-client": dataModule(`
    export async function prepareArtifactForAction(){return {ok:true,data:null};}
    export async function refreshArtifactRendition(){return {ok:true,data:null};}
  `),
  "./material-detail-slot": dataModule(`
    export const useMaterialDetailTarget=item=>({status:"passthrough",item});
    export function MaterialDetailUnavailable(){return null;}
    export function GamePlayDetail(){return null;}
  `),
  "./ArtifactRendition": dataModule(`
    export const useArtifactRendition=item=>({url:item.url,purpose:"full",loading:false,error:"",resourceFailed(){}});
    export const withResolvedRendition=item=>item;
    export function ArtifactRenditionFailure(){return null;}
  `),
  "../lib/media-proxy": dataModule(`
    export const absoluteMediaUrl=url=>url;
    export const signedMediaRefreshPurpose=()=>"source";
    export async function fetchMediaBlobRefreshing(url,options){return globalThis.__edB6ReadSource(url,options);}
    export const fetchMediaBlob=fetchMediaBlobRefreshing;
  `),
}));

async function mount(initialItem, reader = async () => new Blob([JSON.stringify(project())])) {
  const originalError = console.error;
  const consoleErrors = [];
  console.error = (...args) => consoleErrors.push(args.map(String).join(" "));
  const reads = [];
  globalThis.__edB6ReadSource = async (url, options) => { reads.push({ url, signal: options.signal }); return reader(url, options); };
  const host = document.createElement("section"); document.body.append(host);
  const root = createRoot(host);
  const render = async next => {
    await act(async () => root.render(React.createElement(LibraryItemViewer, { item: next })));
    // The real visibility gate admits a jsdom viewer on the next timer turn.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  };
  try { await render(initialItem); }
  catch (error) { console.error = originalError; throw error; }
  return { host, reads, render, async close() {
    try { await act(async () => root.unmount()); assert.deepEqual(consoleErrors, [], "真实 viewer 的状态切换不得产生 React 错误"); }
    finally { host.remove(); console.error = originalError; delete globalThis.__edB6ReadSource; }
  } };
}

test("位图预览等待真实 load，成功后显示画面且不读取 JSON", async () => {
  const f = await mount(item({ previewUrl: PREVIEW }));
  try {
    const image = f.host.querySelector("img"); assert.ok(image);
    assert.equal(image.getAttribute("src"), PREVIEW);
    assert.equal(image.hidden, true);
    assert.ok(f.host.querySelector('[role="status"]'));
    await act(async () => image.dispatchEvent(new window.Event("load")));
    assert.equal(image.hidden, false);
    assert.equal(f.host.querySelector('[role="status"]'), null);
    assert.equal(f.reads.length, 0);
    assert.equal(f.host.querySelector("iframe"), null);
  } finally { await f.close(); }
});

test("位图 error 后读取当前 head，显示真实标题、场景、镜头顺序与时间线时长", async () => {
  const f = await mount(item({ previewUrl: PREVIEW, meta: { source_format: "oceanleo.video.project.v2", source_url: SOURCE, clips: [{ title: "过期 meta" }] } }));
  try {
    await act(async () => f.host.querySelector("img").dispatchEvent(new window.Event("error")));
    assert.deepEqual(f.reads.map(read => read.url), [SOURCE]);
    assert.equal(f.host.querySelector("img"), null);
    assert.match(f.host.textContent, /工程中的标题/);
    assert.match(f.host.textContent, /1 个场景 · 3 个镜头 · 12 秒/);
    assert.match(f.host.textContent, /1 个节点 · 0 条连线/);
    assert.match(f.host.textContent, /开场场景/);
    assert.deepEqual([...f.host.querySelectorAll("li")].map(li => li.textContent), ["第二个镜头6 秒", "第一个镜头4 秒", "独立镜头2 秒"]);
    assert.doesNotMatch(f.host.textContent, /旧版内容|过期 meta/);
    assert.equal(f.host.querySelector("iframe"), null);
  } finally { await f.close(); }
});

test("无 preview、缺少格式元数据的 video_canvas 仍把 JSON 解析成摘要", async () => {
  const f = await mount(item({ meta: {} }));
  try {
    assert.match(f.host.textContent, /工程中的标题/);
    assert.equal(f.host.querySelector("iframe"), null);
    assert.deepEqual(f.reads.map(read => read.url), [SOURCE]);
  } finally { await f.close(); }
});

test("kind=video_canvas 缺少格式声明且留有旧 clips/mediaUrl，也优先位图并回退工程", async () => {
  const f = await mount(item({ previewUrl: PREVIEW, meta: { clips: [{ title: "旧片段" }], video_url: "https://media.example.test/old.mp4" } }));
  try {
    assert.equal(f.host.querySelector("video"), null);
    assert.equal(f.host.querySelector("img").getAttribute("src"), PREVIEW);
    await act(async () => f.host.querySelector("img").dispatchEvent(new window.Event("error")));
    assert.match(f.host.textContent, /工程中的标题/);
    assert.doesNotMatch(f.host.textContent, /旧片段/);
    assert.equal(f.host.querySelector("iframe"), null);
  } finally { await f.close(); }
});

test("显式 v2 sourceFormat 即使旧 kind=canvas，也进入同一个只读工程摘要", async () => {
  const f = await mount(item({ kind: "canvas" }));
  try { assert.match(f.host.textContent, /工程中的标题/); assert.equal(f.host.querySelector("iframe"), null); }
  finally { await f.close(); }
});

test("损坏 JSON/无 source/网络失败给出可重试错误，重试成功恢复摘要", async () => {
  for (const [patch, firstRead] of [
    [{}, async () => new Blob(["{broken"])] ,
    [{ url: undefined, meta: { source_format: "oceanleo.video.project.v2" } }, async () => { throw new Error("不可调用"); }],
    [{}, async () => { throw new Error("network failure"); }],
  ]) {
    let recovered = false;
    const f = await mount(item(patch), async (...args) => recovered ? new Blob([JSON.stringify(project())]) : firstRead(...args));
    try {
      assert.ok(f.host.querySelector('[role="alert"]'));
      assert.equal(f.host.querySelector("iframe"), null);
      assert.doesNotMatch(f.host.textContent, /\{broken|network failure|headVersionId/);
      if (patch.url !== undefined || !Object.hasOwn(patch, "url")) {
        recovered = true;
        await act(async () => f.host.querySelector("button").dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
        assert.match(f.host.textContent, /工程中的标题/);
        assert.equal(f.host.querySelector('[role="alert"]'), null);
      }
    } finally { await f.close(); }
  }
});

test("切换条目会中止旧读取，迟到的旧工程不得覆盖新条目", async () => {
  let resolveOld;
  const f = await mount(item(), () => new Promise(resolve => { resolveOld = resolve; }));
  try {
    assert.match(f.host.textContent, /正在读取/);
    await f.render(item({ key: "new", artifactId: "new", previewUrl: PREVIEW }));
    assert.equal(f.reads[0].signal.aborted, true);
    await act(async () => resolveOld(new Blob([JSON.stringify(project())])));
    assert.ok(f.host.querySelector("img"));
    assert.doesNotMatch(f.host.textContent, /工程中的标题/);
  } finally { await f.close(); }
});

test("预览的 JSON 声明、JSON 后缀或未知 opaque 地址不冒充位图", () => {
  assert.equal(videoCanvasBitmapPreview(item({ previewUrl: PREVIEW, meta: { preview_media_type: "application/json" } })), "");
  assert.equal(videoCanvasBitmapPreview(item({ previewUrl: SOURCE, meta: { preview_media_type: "image/png" } })), "");
  assert.equal(videoCanvasBitmapPreview(item({ previewUrl: "https://media.example.test/opaque" })), "");
  assert.equal(videoCanvasBitmapPreview(item({ previewUrl: "https://media.example.test/opaque", meta: { preview_media_type: "image/png" } })), "https://media.example.test/opaque");
});

test("JSON 不能因 HTML 声明进入 iframe；网页分支必须有声明和实际 HTML 正文", async () => {
  const legacy = item({ artifactId: undefined, url: "https://media.example.test/legacy", meta: { content_type: "text/html" } });
  const json = await loadVideoCanvasSourcePreview(legacy, async () => JSON.stringify(project()));
  assert.equal(json.kind, "project");
  const markupInJson = { ...project(), title: "JSON 标题里的 <html> 仍是文字" };
  const embedded = await loadVideoCanvasSourcePreview(legacy, async () => JSON.stringify(markupInJson));
  assert.equal(embedded.kind, "project");
  const html = "<!doctype html><html><body><h1>Legacy workflow</h1></body></html>";
  assert.deepEqual(await loadVideoCanvasSourcePreview(legacy, async () => html), { kind: "web", url: legacy.url });
  await assert.rejects(loadVideoCanvasSourcePreview({ ...legacy, meta: {} }, async () => html), /JSON|视频画布/);
  await assert.rejects(loadVideoCanvasSourcePreview(item(), async () => html), /JSON|视频画布/);
  await assert.rejects(loadVideoCanvasSourcePreview({ ...legacy, url: "data:text/html,legacy" }, async () => html), /JSON|视频画布/);
  const f = await mount(legacy, async () => new Blob([JSON.stringify(markupInJson)]));
  try { assert.equal(f.host.querySelector("iframe"), null); assert.match(f.host.textContent, /JSON 标题里的 <html> 仍是文字/); }
  finally { await f.close(); }
});
