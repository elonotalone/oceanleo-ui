import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { Doc } from "yjs";
import { React, act, compileModule, dataModule, mount, settle } from "./collab-media-sim.mjs";

// Real editor state/mutation/persistence and shared saver. Only media hardware,
// source loading, publication I/O and authentication are replaced.
globalThis.__mediaRepairReact = React;
const noop = () => {};
const ui = dataModule('export const useUI=()=>(s)=>s;');
const proxy = dataModule('export const isFirstPartyMediaUrl=()=>true;export const canvasSafeUrl=(u)=>u;export const fetchMediaBlob=async()=>globalThis.__mediaRepairBlob||new Blob();export const fetchMediaBlobRefreshing=fetchMediaBlob;export const importMediaUrl=async(u)=>u;export const importMediaAsset=async()=>({});');
const io = dataModule('export const saveFileToLibrary=async()=>({ok:false});export const saveProjectWorkingHead=saveFileToLibrary;');
const boundary = {
  "../../i18n/ui/useUI": ui,
  "../../lib/media-proxy": proxy,
  "../doc-editors/doc-io": io,
  "../../lib/database": dataModule('export const uploadFile=async()=>{throw Error("unexpected upload");};'),
  "../artifact-client": dataModule('export const createArtifactRevision=async()=>{};export const getCurrentArtifactItem=async()=>{};export const refreshArtifactRendition=async()=>({ok:false});'),
};
const image = await import(await compileModule("src/shell/image-editor/editor-persistence.ts",boundary));
const admission = await import(await compileModule("src/shell/advanced-routes/non-richdoc-source-gate.ts",boundary));
const saverBoundary = {
  "../lib/auth/client": dataModule('export const accessToken=async()=>{globalThis.__mediaRepairAuthCalls=(globalThis.__mediaRepairAuthCalls||0)+1;if(globalThis.__mediaRepairAuthDelay)await new Promise(r=>setTimeout(r,globalThis.__mediaRepairAuthDelay));return "synthetic-test-auth";};export const cachedAccessToken=()=>"synthetic-test-auth";'),
  "../lib/auth/config": dataModule('export const GATEWAY_BASE="https://gateway.test";'),
  "../lib/telemetry/index": dataModule('export const emitTelemetry=()=>{};'),
};
// Optional read-only sibling source lets the parent verify the combined shared
// saver repair without copying or committing another unit's implementation.
const sharedPath=path=>process.env.S3B_SHARED_SAVE_ROOT ? process.env.S3B_SHARED_SAVE_ROOT+"/"+path : path;
const { useAdvancedAutoSave } = await import(await compileModule(sharedPath("src/shell/use-advanced-autosave.ts"),saverBoundary));
const { WorkingCopySaver } = await import(await compileModule(sharedPath("src/shell/editor-working-copy.ts"),saverBoundary));
const { resetBackgroundSaverForTests } = await import(await compileModule(sharedPath("src/shell/advanced-background-saver.ts"),saverBoundary));
class ImagePixels {
  constructor(_fabric,_canvas,_container,callbacks) {
    this.callbacks=callbacks;
    this.snapshot=structuredClone(globalThis.__imageRepairSeedSnapshot||{json:{objects:[]},doc:{width:800,height:600},canvasBackground:"#fff"});
    return new Proxy(this,{get:(target,key)=>key in target?target[key]:()=>{}});
  }
  getSnapshot(){return structuredClone(this.snapshot);}
  flipTarget(axis) {
    const key=axis==="x"?"flipX":"flipY",object=this.snapshot.json.objects[0];
    object[key]=!object[key];this.callbacks.onDocumentChange();
  }
  async loadSnapshot(snapshot) {
    globalThis.__imageRepairLoads=(globalThis.__imageRepairLoads||0)+1;
    if(JSON.stringify(snapshot).includes("/artifact-renditions/access/"))throw Error("Fabric received an expired access ticket");
    this.snapshot=structuredClone(snapshot);
    return true;
  }
}

const { useFabricImageEditor }=await import(await compileModule("src/shell/image-editor/use-fabric-image-editor.ts",{
  ...boundary,
  "./fabric-controller":dataModule("export const FabricEditorController="+ImagePixels.toString()+";"),
  "../artifact-client":dataModule('export const createArtifactRevision=async()=>{};export const getCurrentArtifactItem=async()=>{};export const getArtifactItem=async()=>({ok:false});export const refreshArtifactRendition=async()=>globalThis.__imageRepairRefresh();'),
}));
function runtimeHook({runtimeRef}) {
  const R=globalThis.__mediaRepairReact;
  const [runtimeState,setRuntimeState]=R.useState({...globalThis.__repairRuntimeDefaults,loaded:true});
  if(!runtimeRef.current)runtimeRef.current=new Proxy({
    gestureActive:false,getOperationJournal:()=>[],
    setView:(...args)=>globalThis.__repairModelRuntimeCalls.push(args),
  },{get:(target,key)=>key in target?target[key]:()=>{}});
  return {runtimeState,setRuntimeState,runtimeReady:true,canvasRef:()=>{}};
}
function modelBootstrap({loadedSourceRef,applyView,setSourceUrl,setSourceProvenance,setSourceLoading}) {
  globalThis.__mediaRepairReact.useEffect(()=>{
    const url="https://media.test/scene.glb";
    loadedSourceRef.current=url;
    applyView({...globalThis.__repairModelDefaults,sourceUrl:url,exposure:1.1});
    setSourceUrl(url);
    setSourceProvenance({sourceUrl:url,dependencyBaseUrl:url,format:"glb",identity:url,artifactId:"",revisionId:"",sourceDigest:""});
    setSourceLoading(false);
  },[]);
}
const { FabricEditorCore } = await import(await compileModule("src/shell/image-editor/fabric-controller-core.ts",{
  ...boundary,"./local-save-pixels":dataModule("export const collectPixelSources=()=>[];"),
}));
const { captureSnapshot } = await import(await compileModule("src/shell/image-editor/editor-runtime.ts",boundary));
const { useVideoTimeline } = await import(await compileModule("src/shell/video-editor/use-video-timeline.ts",{
  ...boundary,
  "./preview-engine":dataModule('export class TimelinePreviewEngine {constructor(){return new Proxy({isPlaying:()=>false},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});}}'),
  "./render-client":dataModule('export const renderTimeline=async()=>{throw Error("working-copy save must not render");};'),
  "./persistence":dataModule('export const uploadCoverPng=async()=>{};export const timelinePreviewRenditionPng=async()=>{throw Error("working-copy save must not create a poster");};export const uploadDraft=async()=>{};'),
}));
const ITEM={id:"media-repair",key:"media-repair",title:"Media",kind:"audio",source:"local",meta:{}};
const h=React.createElement;
class AudioBufferFake {
  constructor({length=800,numberOfChannels=1,sampleRate=8000}={}) {
    Object.assign(this,{length,numberOfChannels,sampleRate,duration:length/sampleRate});
    this.channels=Array.from({length:numberOfChannels},()=>new Float32Array(length).fill(0.25));
  }
  getChannelData(i){return this.channels[i];}
  copyToChannel(data,i){this.channels[i].set(data);}
}
globalThis.AudioBuffer=AudioBufferFake;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function cleanRender(body) {
  const errors=[],previous=console.error,debug=console.debug;
  console.error=(...args)=>errors.push(args.map(String).join(" "));
  console.debug=()=>{};
  try{await body();}finally{resetBackgroundSaverForTests();console.error=previous;console.debug=debug;}
  assert.deepEqual(errors,[],"real hooks must render without console errors");
}
function fakeGateway(latency=0) {
  const previous=globalThis.fetch;
  const state={copy:null,puts:[],gets:0,putTimes:[],ackTimes:[],savedInputs:[],ifSeqs:[],offline:false};
  globalThis.fetch=async(url,options={})=>{
    assert.ok(String(url).includes("/editor-working-copies/"),"only working-copy traffic is permitted");
    if(state.offline)throw TypeError("Failed to fetch");
    if(options.method==="POST")return new Response("{}",{status:200});
    if(options.method==="GET") {
      state.gets++;
      if(state.getBarrier)await state.getBarrier;
      return new Response(JSON.stringify(state.copy||{}),{status:state.copy?200:404});
    }
    assert.equal(options.method,"PUT");
    const capturedInput=state.captureWatermark?.();
    state.putTimes.push(performance.now());
    const text=options.headers?.["Content-Encoding"]==="gzip"
      ? await new Response(new Blob([options.body]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
      : options.body;
    const input=JSON.parse(text);
    state.ifSeqs.push(input.if_seq);
    if(latency)await sleep(latency);
    if(input.if_seq!==(state.copy?.seq??null))return new Response("{}",{status:409});
    const seq=(state.copy?.seq??0)+1;
    state.copy={schema:input.schema,base_revision_id:input.base_revision_id,published_seq:0,seq,saved_at:new Date().toISOString(),doc:input.doc};
    state.puts.push(structuredClone(input.doc));
    state.ackTimes.push(performance.now());
    state.savedInputs.push(capturedInput);
    return new Response(JSON.stringify({ok:true,seq,saved_at:state.copy.saved_at,server_ms:1}),{status:200});
  };
  return {state,restore:()=>{globalThis.fetch=previous;}};
}
function expiredImage() {
  // Synthetic, already-expired input; assert failures never print the value.
  const locator="https://gateway.test/v1/artifact-renditions/access/"+Buffer.from(JSON.stringify({
    artifact:"source-artifact",revision:"source-revision",purpose:"full",exp:1,
  })).toString("base64url")+".synthetic";
  return {json:{objects:[{type:"Image",oceanleoId:"bitmap",src:locator,flipX:true,
    oceanleoDependency:{id:"bitmap",kind:"image",required:true,url:locator,digest:"a".repeat(64),
      artifactId:"source-artifact",revisionId:"source-revision",renditionPurpose:"full",expiresAt:"1970-01-01T00:00:01Z"}}]},
    doc:{width:800,height:600},canvasBackground:"#fff"};
}

test("VS5 image/design capture stores a stable asset identity, not a five-minute ticket",()=>{
  const doc=image.createFabricImageWorkingCopy(expiredImage());
  assert.equal(JSON.stringify(doc).includes("/artifact-renditions/access/"),false,"working copy retained an expiring URL");
  const dependency=doc.snapshot.json.objects[0].oceanleoDependency;
  assert.equal(dependency.artifactId,"source-artifact");
  assert.equal(dependency.revisionId,"source-revision");
  assert.equal(dependency.expiresAt,undefined);
});

test("VS5 stable and legacy-expired image documents resolve fresh URLs before Fabric restore",async()=>{
  assert.equal(typeof image.resolveFabricImageWorkingCopy,"function","restore needs to resolve stable references");
  let calls=0;
  const refresh=async(identity,purpose)=>{
    calls++;
    assert.deepEqual(identity,{artifactId:"source-artifact",revisionId:"source-revision"});
    assert.equal(purpose,"full");
    return {ok:true,data:{url:"https://media.test/fresh.png",revisionId:"source-revision",digest:"a".repeat(64)}};
  };
  for(const project of [image.createFabricImageWorkingCopy(expiredImage()),image.createFabricImageProject(expiredImage())]){
    const restored=await image.resolveFabricImageWorkingCopy(project,refresh);
    assert.equal(restored.snapshot.json.objects[0].src,"https://media.test/fresh.png");
    assert.equal(restored.snapshot.json.objects[0].flipX,true);
  }
  assert.equal(calls,2);
});

test("VS5 actual Fabric hook silently reopens an old expired working copy through the shared saver",async()=>cleanRender(async()=>{
  const gateway=fakeGateway();
  gateway.state.copy={schema:"oceanleo.fabric-image.edit.v1",seq:3,published_seq:0,base_revision_id:null,
    saved_at:new Date().toISOString(),doc:image.createFabricImageProject(expiredImage())};
  let editor,save,refreshes=0;
  globalThis.__imageRepairRefresh=()=>{
    refreshes++;
    return {ok:true,data:{url:"https://media.test/fresh.png",revisionId:"source-revision",digest:"a".repeat(64)}};
  };
  const item={...ITEM,kind:"image"};
  function Harness() {
    editor=useFabricImageEditor(item,"image");
    save=useAdvancedAutoSave({key:item.key,item,editorId:"image",session:null,dirty:editor.dirty,revision:editor.editRevision,
      flush:async()=>({ok:true,item:{...item,revisionId:"published"}}),
      recovery:{draftSchema:"oceanleo.fabric-image.edit.v1",key:item.key,ready:editor.sourceReady&&!editor.loading,
        capture:editor.captureRecovery,restore:editor.restoreRecovery}});
    return h("canvas",{ref:editor.stageCanvasRef});
  }
  const mounted=await mount(h(Harness));
  try {
    await savedWhen(()=>editor.sourceReady&&save.state==="saved");
    assert.equal(refreshes,1);
    assert.equal(editor.editRevision,0,"restoration is not a user edit");
    assert.equal(editor.captureRecovery().snapshot.json.objects[0].flipX,true);
    assert.equal(gateway.state.puts.length,0,"restoring acknowledged data does not make a duplicate save");
    assert.equal(editor.notice,"","restoration is silent");
  }finally{await mounted.unmount();resetBackgroundSaverForTests();gateway.restore();}
}));

test("VS5 duplicate bitmaps refresh once and a changed revision or digest fails closed",async()=>{
  const project=image.createFabricImageWorkingCopy(expiredImage());
  project.snapshot.json.objects.push(structuredClone(project.snapshot.json.objects[0]));
  let calls=0;
  await image.resolveFabricImageWorkingCopy(project,async()=>{
    calls++;
    return {ok:true,data:{url:"https://media.test/fresh.png",revisionId:"source-revision",digest:"a".repeat(64)}};
  });
  assert.equal(calls,1);
  for(const data of [{revisionId:"wrong-revision",digest:"a".repeat(64)},
    {revisionId:"source-revision",digest:"b".repeat(64)}]) {
    await assert.rejects(()=>image.resolveFabricImageWorkingCopy(project,async()=>({ok:true,data:{url:"https://media.test/fresh.png",...data}})),
      /图片工程读取失败/);
  }
});

test("VS5 unreadable working copies report saved modifications without the retired draft tier",async()=>{
  for(const schema of ["other","image"]) {
    const saver=new WorkingCopySaver({schema,capture:()=>({}),restore:()=>false,
      transport:{get:async()=>({schema:"image",seq:1,published_seq:0,doc:{}})},
    });
    try {
      await saver.initialize();
      assert.equal(saver.snapshot().error,"保存的修改暂时无法读取，请重新载入");
      assert.notEqual(saver.snapshot().state,"saved");
    }finally{saver.dispose();}
  }
});
const VIDEO_ITEM={...ITEM,kind:"video",meta:{timeline_doc:{width:1280,height:720,fps:30,
  tracks:[{id:"text",kind:"text",clips:[{id:"caption",text:"Initial",start_ms:0,duration_ms:6000}]}]}}};
function useVideoMatrix() {
  const editor=useVideoTimeline(VIDEO_ITEM,"video");
  const count=React.useRef(0);
  return {capture:()=>structuredClone(editor.doc),restore:editor.restoreRecovery,dirty:editor.dirty,revision:editor.editRevision,
    ready:editor.sourceReady&&!editor.loadingSource,edit:()=>editor.patchClip("caption",{text:"Edit "+ ++count.current})};
}
const { Rect }=await import("fabric");
function useFabricMatrix(item) {
  const [revision,setRevision]=React.useState(0);
  const controller=React.useRef(null);
  if(!controller.current) {
    const objects=Array.from({length:item.kind==="design"?100:20},(_,i)=>new Rect({left:i*2,top:i,width:20,height:10,fill:"#336699"}));
    const canvas={getObjects:()=>objects,toObject:()=>({objects:objects.map(o=>o.toObject())}),moveObjectTo:noop,requestRenderAll:noop};
    const doc={width:1280,height:720},canvasBackground="#ffffff";
    controller.current=Object.assign(Object.create(FabricEditorCore.prototype),{
      canvas,doc,canvasBackground,currentSnapshot:captureSnapshot(canvas,doc,canvasBackground),undoStack:[],redoStack:[],
      gestureBase:null,destroyed:false,restoring:false,readOnly:false,emit:noop,
      callbacks:{onDocumentChange:()=>setRevision(n=>n+1)},
    });
  }
  const capture=()=>image.createFabricImageWorkingCopy(controller.current.getSnapshot());
  return {capture,restore:()=>true,dirty:revision>0,revision,ready:true,edit:()=>{
    const object=controller.current.canvas.getObjects()[0];object.flipX=!object.flipX;controller.current.commit();
  }};
}
async function savedWhen(predicate) {
  const start=performance.now();
  while(!predicate()) {
    assert.ok(performance.now()-start<1000,"the working copy did not acknowledge the edit");
    await act(async()=>sleep(4));
  }
}
for(const [kind,hook] of [["image",useFabricMatrix],["design",useFabricMatrix],["video",useVideoMatrix]]) {
  test("VS1 jsdom "+kind+": 20 isolated edits + 3 ten-edit bursts in native and 150ms RTT",async(t)=>cleanRender(async()=>{
    const isolated=[],bursts=[],beforePut=[];
    let totalEdits=0;
    for(const latency of [0,150]) {
      const modeIsolated=[],modeBursts=[],modeBeforePut=[];
      const gateway=fakeGateway(latency),item={...ITEM,kind};
      const inputTimes=[];
      let capturedInputs=0;
      gateway.state.captureWatermark=()=>capturedInputs;
      let editor,save;
      globalThis.__repairModelRuntimeCalls=[];
      function Harness() {
        editor=hook(item);
        save=useAdvancedAutoSave({key:item.key,item,editorId:kind,session:null,dirty:editor.dirty,revision:editor.revision,
          flush:async()=>({ok:true,item:{...item,revisionId:"published"}}),
          recovery:{draftSchema:"test."+kind,key:item.key,ready:editor.ready,capture:()=>{
            capturedInputs=inputTimes.length;return editor.capture();
          },restore:editor.restore}});
        return h("button",{onClick:()=>{inputTimes.push(performance.now());void editor.edit();}},"Edit");
      }
      const mounted=await mount(h(Harness));
      try {
        await savedWhen(()=>editor.ready&&save.state==="saved");
        for(let i=0;i<20;i++) {
          const started=performance.now(),previous=gateway.state.puts.length;
          await act(async()=>mounted.container.querySelector("button").click());
          await savedWhen(()=>save.state==="saved"&&gateway.state.puts.length>previous);
          const ms=performance.now()-started;
          isolated.push(ms);beforePut.push(gateway.state.putTimes.at(-1)-started);
          modeIsolated.push(ms);modeBeforePut.push(gateway.state.putTimes.at(-1)-started);
          assert.ok(ms<=500,kind+" isolated edit exceeded 500ms");
          totalEdits++;
        }
        for(let burst=0;burst<3;burst++) {
          let lastInput;
          for(let i=0;i<10;i++) {
            lastInput=performance.now();
            await act(async()=>mounted.container.querySelector("button").click());
            if(i<9)await act(async()=>sleep(65));
            totalEdits++;
          }
          await savedWhen(()=>save.state==="saved");
          const ms=performance.now()-lastInput;
          bursts.push(ms);
          modeBursts.push(ms);
          assert.ok(ms<=500,kind+" final burst input exceeded 500ms");
        }
        const latest=editor.capture();
        assert.deepEqual(gateway.state.copy.doc.snapshot||gateway.state.copy.doc,latest.snapshot||latest,
          "Saved matches the latest editable document");
        assert.equal(gateway.state.gets,1,"the editor kept one saver throughout all edits");
        const allInputs=inputTimes.map((started,i)=>{
          const acknowledged=gateway.state.savedInputs.findIndex(n=>n>=i+1);
          assert.ok(acknowledged>=0,"every input reached an acknowledged document");
          const ms=gateway.state.ackTimes[acknowledged]-started;
          assert.ok(ms<=500,kind+" input "+(i+1)+" exceeded 500ms");
          return ms;
        });
        const stats=values=>{
          const sorted=[...values].sort((a,b)=>a-b);
          return {p50:+sorted[Math.floor(sorted.length/2)].toFixed(2),
            p95:+sorted[Math.ceil(sorted.length*0.95)-1].toFixed(2),max:+sorted.at(-1).toFixed(2)};
        };
        t.diagnostic(JSON.stringify({kind,rttMs:latency,isolated:stats(modeIsolated),
          bursts:stats(modeBursts),allInputs:stats(allInputs),clientBeforePut:stats(modeBeforePut)}));
      } finally {await mounted.unmount();resetBackgroundSaverForTests();gateway.restore();}
    }
    t.diagnostic(JSON.stringify({kind,isolated:isolated.length,bursts:bursts.length,inputs:totalEdits,
      maxEditToAckMs:+Math.max(...isolated).toFixed(2),maxBurstAckMs:+Math.max(...bursts).toFixed(2),
      maxClientBeforePutMs:+Math.max(...beforePut).toFixed(2)}));
  }));
}

test("R3 design working-copy digest does not change when an unchanged scene is captured again",async()=>{
  const first=image.createFabricImageWorkingCopy(expiredImage());
  await sleep(5);
  const second=image.createFabricImageWorkingCopy(expiredImage());
  assert.equal(JSON.stringify(first)===JSON.stringify(second),true,"capture-only metadata changed the saved document");
  assert.equal(typeof image.createFabricImageProject(expiredImage()).updatedAt,"string","published projects retain their timestamp");
});

test("R3 identical image restoration recognizes the bitmap despite a refreshed URL",async()=>cleanRender(async()=>{
  const snapshot=expiredImage();
  const object=snapshot.json.objects[0];
  object.src=object.oceanleoDependency.url="https://media.test/current.png";
  globalThis.__imageRepairSeedSnapshot=snapshot;
  globalThis.__imageRepairLoads=0;
  let editor;
  globalThis.__imageRepairRefresh=()=>({ok:true,data:{url:"https://media.test/refreshed.png",digest:"a".repeat(64)}});
  function Harness(){editor=useFabricImageEditor({...ITEM,kind:"image"},"image");return h("canvas",{ref:editor.stageCanvasRef});}
  const mounted=await mount(h(Harness));
  try {
    await savedWhen(()=>editor.sourceReady);
    let restored;
    await act(async()=>{restored=await editor.restoreRecovery(image.createFabricImageWorkingCopy(structuredClone(snapshot)));});
    assert.equal(restored,"unchanged","same bitmap identity and pixels must not reload the scene");
    assert.equal(globalThis.__imageRepairLoads,0);
    assert.equal(editor.editRevision,0);
    assert.equal(editor.dirty,false);
  }finally{await mounted.unmount();delete globalThis.__imageRepairSeedSnapshot;delete globalThis.__imageRepairLoads;}
}));

test("R3 image comparison still distinguishes authored edits and unidentified bitmap URLs",async()=>{
  const {sameImageContent}=await import("../src/shell/image-editor/image-remote-delta.ts");
  const first=expiredImage(),next=structuredClone(first);
  next.json.objects[0].src="https://media.test/new.png";
  assert.equal(sameImageContent(first,next),true);
  next.json.objects[0].flipX=false;
  assert.equal(sameImageContent(first,next),false);
  next.json.objects[0].flipX=true;
  next.json.objects[0].oceanleoDependency.digest="b".repeat(64);
  assert.equal(sameImageContent(first,next),false);
  delete first.json.objects[0].oceanleoDependency;
  delete next.json.objects[0].oceanleoDependency;
  assert.equal(sameImageContent(first,next),false,"unidentified image URLs remain content");
});

test("R3 real image hook opens seq86 through room hydration without conflict, then edits with that seq",async()=>cleanRender(async()=>{
  const snapshot=expiredImage(),object=snapshot.json.objects[0];
  object.src=object.oceanleoDependency.url="https://media.test/current.png";
  globalThis.__imageRepairSeedSnapshot=snapshot;
  const room={doc:new Doc(),isSaver:true,status:"synced"},gateway=fakeGateway();
  let release;
  gateway.state.getBarrier=new Promise(resolve=>release=resolve);
  gateway.state.copy={schema:"oceanleo.fabric-image.edit.v1",seq:86,published_seq:0,base_revision_id:null,
    saved_at:new Date().toISOString(),doc:image.createFabricImageWorkingCopy(structuredClone(snapshot))};
  let editor,save;
  const item={...ITEM,kind:"image"};
  function Harness(){
    editor=useFabricImageEditor(item,"image");
    save=useAdvancedAutoSave({key:item.key,item,editorId:"image",session:null,room,writer:true,dirty:editor.dirty,revision:editor.editRevision,
      recovery:{key:item.key,draftSchema:"oceanleo.fabric-image.edit.v1",ready:editor.sourceReady&&!editor.loading,
        capture:editor.captureRecovery,restore:editor.restoreRecovery}});
    return h("main",null,h("canvas",{ref:editor.stageCanvasRef}),h("button",{onClick:()=>editor.flipTarget("x")},"Flip"));
  }
  const mounted=await mount(h(Harness));
  try {
    await savedWhen(()=>editor.sourceReady&&gateway.state.gets===1);
    await act(async()=>{room.doc.transact(()=>room.doc.getMap("image").set("hydrated",true),room);});
    await act(async()=>{release();await sleep(25);});
    assert.equal(save.state,"saved",save.errorMessage);
    assert.equal(gateway.state.puts.length,0,"opening an existing image must not write");
    assert.equal(editor.editRevision,0);
    await act(async()=>{mounted.container.querySelector("button").click();});
    await savedWhen(()=>save.state==="saved"&&gateway.state.puts.length===1);
    assert.deepEqual(gateway.state.ifSeqs,[86]);
    assert.equal(gateway.state.copy.doc.snapshot.json.objects[0].flipX,false);
  }finally{release();await mounted.unmount();resetBackgroundSaverForTests();gateway.restore();room.doc.destroy();delete globalThis.__imageRepairSeedSnapshot;}
}));
