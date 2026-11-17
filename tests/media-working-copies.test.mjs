import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { React, act, compileModule, dataModule, mount, settle } from "./collab-media-sim.mjs";

// Real capture/restore/mutation/publish code. Browser media decoding, graphics
// devices and network boundaries are simulated; no server data is written.
const ui = dataModule('export const useUI = () => (s) => s;');
const io = dataModule('export const saveFileToLibrary = async (input) => globalThis.__mediaPublish(input); export const saveProjectWorkingHead = saveFileToLibrary;');
const proxy = dataModule('export const isFirstPartyMediaUrl = () => true; export const canvasSafeUrl = (u) => u; export const importMediaUrl = async () => {throw Error("unexpected import");}; export const importMediaAsset = async () => {throw Error("unexpected import");}; export const fetchMediaBlob = async () => new Blob();');
const stubs = {
  "../../i18n/ui/useUI": ui,
  "../../lib/media-proxy": proxy,
  "../../lib/database": dataModule('export const uploadFile = async () => {throw Error("unexpected upload");};'),
  "../doc-editors/doc-io": io,
  "../artifact-client": dataModule('export const createArtifactRevision = async () => {}; export const getCurrentArtifactItem = async () => {}; export const refreshArtifactRendition = async () => ({ok:false});'),
  "../doc-editors/editor-preview-raster": dataModule('export const renderAudioWaveformPng = async (buffer) => new Blob([String(buffer.length)]);'),
  "./source-integrity.mjs": dataModule('export const assertBlobSource = async () => "wav";'),
  "./audio-project-source": dataModule('export const artifactAccessIdentity = () => null; export const fetchAudioProjectSourceBlob = async () => new Blob(["audio"]);'),
  "./audio-delivery": dataModule('export const buildAudioDelivery = async ({buffer}) => ({file:new File([String(buffer.length)],"audio.wav",{type:"audio/wav"}),sourceFormat:"wav",sourceMediaType:"audio/wav"});'),
};
const image = await import(await compileModule("src/shell/image-editor/editor-persistence.ts", stubs));
const { FabricEditorCore } = await import(await compileModule("src/shell/image-editor/fabric-controller-core.ts",{...stubs,"./local-save-pixels":dataModule('export const collectPixelSources = () => {throw Error("not a local pixel export test");};')}));
const { captureSnapshot } = await import(await compileModule("src/shell/image-editor/editor-runtime.ts", stubs));
const timeline = await import(await compileModule("src/shell/video-editor/use-video-timeline.ts", {
  ...stubs,
  "./preview-engine": dataModule('export class TimelinePreviewEngine { constructor() {return new Proxy({playing:false}, {get(o,k){if(k in o)return o[k]; if(k==="isPlaying")return ()=>false; if(typeof k==="string"&&!k.startsWith("on"))return ()=>{};},set(o,k,v){o[k]=v;return true;}});} }'),
  "./persistence": dataModule('export const timelinePreviewRenditionPng = async () => new Blob(["preview"]); export const uploadCoverPng = async () => ({}); export const uploadDraft = async (...args) => globalThis.__timelinePublish(...args);'),
  "./render-client": dataModule('export const renderTimeline = async () => "https://media.test/video.mp4";'),
}));
const { normalizeTimelineDoc } = await import("../src/shell/video-editor/timeline-model.ts");
const timelinePersistence = await import(await compileModule("src/shell/video-editor/persistence.ts", stubs));

const h = React.createElement;
const ref = (current) => ({ current });
const noop = () => {};
const ITEM = { id:"media", key:"media", title:"Media", kind:"audio", artifactType:"audio", artifactId:"artifact", revisionId:"rev1", artifact:{artifactId:"artifact",revisionId:"rev1"}, source:"artifact", meta:{} };
class BufferMock {
  constructor({length=8000, numberOfChannels=1, sampleRate=8000}={}) {
    Object.assign(this,{length,numberOfChannels,sampleRate,duration:length/sampleRate});
    this.channels = Array.from({length:numberOfChannels},()=>new Float32Array(length));
  }
  getChannelData(c) {return this.channels[c];}
  copyToChannel(data,c) {this.channels[c].set(data);}
}
globalThis.AudioBuffer = BufferMock;
globalThis.AudioContext = class {async decodeAudioData(){return new BufferMock();} async close(){}};

async function withoutConsoleErrors(body) {
  const errors = [];
  const previous = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  try {await body();} finally {console.error = previous;}
  assert.deepEqual(errors, [], "React must render without console.error");
}

function measure(t, name, capture, budget=100) {
  capture();
  const times = [];
  let doc;
  for(let i=0;i<12;i++) {
    const start = performance.now();
    doc = capture();
    times.push(performance.now()-start);
  }
  times.sort((a,b)=>a-b);
  const bytes = Buffer.byteLength(JSON.stringify(doc));
  t.diagnostic(name + ": " + bytes + " bytes; p50 " + times[6].toFixed(3) + " ms; max " + times.at(-1).toFixed(3) + " ms (12 captures)");
  assert.ok(times[10] <= budget, name + " capture exceeds " + budget + " ms");
  return doc;
}

test("image: complete Fabric scene round trip; uploaded references; large capture", async (t) => {
  const { Rect } = await import("fabric");
  const objects = Array.from({length:1200},(_,i)=>new Rect({left:i%100,top:i%70,width:12,height:8,fill:"#aabbcc"}));
  const canvas = {toObject:()=>({objects:objects.map(o=>o.toObject())})};
  const controller=Object.assign(Object.create(FabricEditorCore.prototype),{
    currentSnapshot:captureSnapshot(canvas,{width:1920,height:1080},"#ffffff"),
  });
  const capture = () => image.createFabricImageWorkingCopy(controller.getSnapshot());
  const typical=Object.assign(Object.create(FabricEditorCore.prototype),{
    currentSnapshot:captureSnapshot({toObject:()=>({objects:objects.slice(0,100).map(o=>o.toObject())})},
      {width:1920,height:1080},"#fff"),
  });
  measure(t,"image 100 Fabric objects",()=>image.createFabricImageWorkingCopy(typical.getSnapshot()),30);
  const project = measure(t,"image 1,200 Fabric objects",capture);
  const restored = image.parseFabricImageProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(image.createFabricImageWorkingCopy(restored.snapshot),project);
  const bitmap = image.createFabricImageWorkingCopy({
    json:{objects:[{type:"Image",src:"blob:canvas-only",oceanleoDependency:{url:"https://media.test/layer.png"}}]},
    doc:{width:800,height:600},canvasBackground:"#fff",
  });
  assert.equal(bitmap.snapshot.json.objects[0].src,"https://media.test/layer.png");
  assert.throws(()=>image.createFabricImageWorkingCopy({...bitmap.snapshot,json:{objects:[{type:"Image",src:"data:image/png;base64,a"}]}}),/尚未上传/);
  assert.equal(typeof bitmap.snapshot.json.objects[0].src,"string");
});

const timelineDoc = (count=2) => normalizeTimelineDoc({width:1920,height:1080,fps:30,
  tracks:Array.from({length:Math.ceil(count/200)},(_,track)=>({
    id:"text"+track,kind:"text",clips:Array.from({length:Math.min(200,count-track*200)},(_,clip)=>({
      id:"clip"+(track*200+clip),start_ms:clip*1000,duration_ms:1000,text:"Clip "+clip,font_size:48,volume:1,speed:1,
    })),
  })),
});
test("video: real edits, selection, silent restore, capture and large timeline", async (t) => withoutConsoleErrors(async () => {
  let editor;
  const item = {id:"video",key:"video",title:"Video",source:"local",kind:"video",meta:{timeline_doc:timelineDoc()}};
  function Harness() {editor=timeline.useVideoTimeline(item,"video");return h("button",{onClick:()=>editor.patchClip("clip0",{text:"Edited"})},"edit");}
  const mounted = await mount(h(Harness));
  let closed=false;
  try {
    await act(async()=>mounted.container.querySelector("button").click());
    assert.equal(editor.editRevision,1);
    assert.equal(editor.dirty,true);
    const doc = structuredClone(editor.doc);
    await act(async()=>editor.selectClip("clip0"));
    assert.equal(editor.editRevision,1);
    await act(async()=>assert.equal(editor.restoreRecovery(JSON.parse(JSON.stringify(doc))),true));
    assert.deepEqual(editor.doc,doc);
    assert.equal(editor.editRevision,1);
    measure(t,"video 2 clips",()=>structuredClone(editor.doc),30);
    const large = timelineDoc(3200);
    await act(async()=>editor.restoreRecovery(large));
    measure(t,"video 3,200 clips / 16 tracks (supported limit)",()=>structuredClone(editor.doc));
    const snapshot = structuredClone(editor.doc);
    let finish;
    globalThis.__timelinePublish = (...args) => {assert.deepEqual(args[0],snapshot);return new Promise(resolve=>finish=resolve);};
    let pending;
    await act(async()=>{pending=editor.saveDraft();await settle(1);});
    await act(async()=>editor.patchClip("clip0",{text:"During publish"}));
    assert.equal(editor.editRevision,2);
    const nextPublish=editor.prepareSave();
    const latest=structuredClone(editor.doc);
    await act(async()=>{finish({url:"https://media.test/video.mp4",versionId:"v2"});await pending;});
    assert.equal(editor.dirty,true);
    assert.equal(editor.doc.tracks[0].clips[0].text,"During publish");
    await mounted.unmount();closed=true;
    globalThis.__timelinePublish=async (doc)=>{assert.deepEqual(doc,latest);return {url:"https://media.test/latest.mp4",versionId:"v3"};};
    assert.equal((await nextPublish()).versionId,"v3");
  } finally {if(!closed)await mounted.unmount();}
}));

test("video: automatic Library publication retains editable timeline and preview without a paid render", async () => {
  const doc = timelineDoc();
  let published;
  globalThis.__mediaPublish = async input => {published=input;return {ok:true,url:"https://media.test/project.json",versionId:"v2",projectSchema:input.project.schema};};
  const saved = await timelinePersistence.uploadDraft(doc,{...ITEM,kind:"video",artifactType:"video"},"Video","video","key","",s=>s,
    async()=>new Blob(["preview"]));
  assert.equal(saved.url,"https://media.test/project.json");
  assert.equal(published.deliveryUrl,undefined);
  assert.deepEqual(published.project.data,doc);
  assert.equal(await (await published.createPreview()).text(),"preview");
});

test("image: an inserted data/blob image uploads before its durable reference enters the document", async () => {
  const { openFabricImagePixels } = await import(await compileModule("src/shell/image-editor/fabric-image-open.ts",stubs));
  let uploaded;
  const pixels = await openFabricImagePixels({
    source:"data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path d="M0 0L2 2"/></svg>'),
    siteId:"image",title:"Signature",
    persistPng:async file=>{uploaded=file;return "https://media.test/signature.svg";},
  });
  assert.equal(uploaded.type,"image/svg+xml");
  assert.equal(pixels.canvasUrl,"https://media.test/signature.svg");
  assert.equal(pixels.dependency.url,"https://media.test/signature.svg");
  assert.match(pixels.dependency.digest,/^[a-f0-9]{64}$/);
});
