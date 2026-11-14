import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { React, act, compileModule, dataModule, mount, settle } from "./collab-media-sim.mjs";

// Real editor state/mutation/persistence and shared saver. Only media hardware,
// source loading, publication I/O and authentication are replaced.
globalThis.__mediaRepairReact = React;
const noop = () => {};
const ui = dataModule('export const useUI=()=>(s)=>s;');
const proxy = dataModule('export const isFirstPartyMediaUrl=()=>true;export const canvasSafeUrl=(u)=>u;export const fetchMediaBlob=async()=>new Blob();export const fetchMediaBlobRefreshing=fetchMediaBlob;export const importMediaUrl=async(u)=>u;export const importMediaAsset=async()=>({});');
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
const { useAudioMutations } = await import(await compileModule("src/shell/media-editors/use-audio-mutations.ts",boundary));
const { useAudioPersistence } = await import(await compileModule("src/shell/media-editors/use-audio-persistence.ts",boundary));
const saverBoundary = {
  "../lib/auth/client": dataModule('export const accessToken=async()=>"synthetic-test-auth";'),
  "../lib/auth/config": dataModule('export const GATEWAY_BASE="https://gateway.test";'),
  "../lib/telemetry/index": dataModule('export const emitTelemetry=()=>{};'),
};
const { useAdvancedAutoSave } = await import(await compileModule("src/shell/use-advanced-autosave.ts",saverBoundary));
const { WorkingCopySaver } = await import(await compileModule("src/shell/editor-working-copy.ts",saverBoundary));
const { resetBackgroundSaverForTests } = await import(await compileModule("src/shell/advanced-background-saver.ts",saverBoundary));
const { DEFAULT_MODEL3D_VIEW, EMPTY_MODEL3D_RUNTIME } = await import("../src/shell/media-editors/model3d-workbench-defaults.ts");
const { captureModel3DRouteSnapshot } = await import("../src/shell/media-editors/Model3DRouteHistory.ts");
globalThis.__repairModelDefaults = DEFAULT_MODEL3D_VIEW;
globalThis.__repairRuntimeDefaults = EMPTY_MODEL3D_RUNTIME;
class ImagePixels {
  constructor() {
    this.snapshot={json:{objects:[]},doc:{width:800,height:600},canvasBackground:"#fff"};
    return new Proxy(this,{get:(target,key)=>key in target?target[key]:()=>{}});
  }
  getSnapshot(){return structuredClone(this.snapshot);}
  async loadSnapshot(snapshot) {
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
const { useModel3DWorkbench } = await import(await compileModule("src/shell/media-editors/use-model3d-workbench.ts",{
  ...boundary,
  "./use-model3d-runtime": dataModule("export const useModel3DRuntime="+runtimeHook.toString()+";"),
  "./use-model3d-project-bootstrap": dataModule("export const useModel3DProjectBootstrap="+modelBootstrap.toString()+";"),
  "./use-model3d-source-loader": dataModule("export const useModel3DSourceLoader=()=>{};"),
  "./use-model3d-source-actions": dataModule("export const useModel3DSourceActions=()=>({});"),
  "./use-model3d-director": dataModule("export const useModel3DDirector=()=>({});"),
  "./use-model3d-save": dataModule("export const useModel3DSave=()=>({saving:false});"),
  "./use-model3d-media-actions": dataModule("export const useModel3DMediaActions=()=>({});"),
}));
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
  const state={copy:null,puts:[],gets:0,putTimes:[],ackTimes:[],savedInputs:[]};
  globalThis.fetch=async(url,options={})=>{
    assert.ok(String(url).includes("/editor-working-copies/"),"only working-copy traffic is permitted");
    if(options.method==="POST")return new Response("{}",{status:200});
    if(options.method==="GET") {
      state.gets++;
      return new Response(JSON.stringify(state.copy||{}),{status:state.copy?200:404});
    }
    assert.equal(options.method,"PUT");
    const capturedInput=state.captureWatermark?.();
    state.putTimes.push(performance.now());
    const text=options.headers?.["Content-Encoding"]==="gzip"
      ? await new Response(new Blob([options.body]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
      : options.body;
    const input=JSON.parse(text);
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

test("VS6 a pending waveform reload does not replace the saver or conflict with the next gain edit",async()=>cleanRender(async()=>{
  const gateway=fakeGateway();
  let editor,finishWave;
  function Harness(){
    const bufferRef=React.useRef(new AudioBufferFake()),sourceUrlRef=React.useRef("https://media.test/source.wav");
    const operationsRef=React.useRef([]),revisionRef=React.useRef(0);
    const [loading,setLoading]=React.useState(false),[dirty,setDirty]=React.useState(false);
    const options={item:ITEM,siteId:"audio",bufferRef,sourceUrlRef,operationsRef,revisionRef,
      undoOperationsRef:React.useRef([]),redoOperationsRef:React.useRef([]),undoRef:React.useRef([]),redoRef:React.useRef([]),
      workingHeadUrlRef:React.useRef(""),savingRef:React.useRef(false),setLoading,setDirty,
      setError:noop,setSavedUrl:noop,setSaving:noop,setCanUndo:noop,setCanRedo:noop,tt:s=>s,
      requiresExistingSource:true,reloadWaveform:()=>new Promise(resolve=>finishWave=resolve)};
    const persistence=useAudioPersistence(options),mutate=useAudioMutations(options);
    const admitted=admission.audioSourcePersistenceAdmitted({loading,capture:persistence.captureRecovery()});
    const save=useAdvancedAutoSave({key:ITEM.key,item:ITEM,editorId:"audio",session:null,dirty,revision:revisionRef.current,
      recovery:{draftSchema:"oceanleo.audio.edit.v1",key:ITEM.key,ready:admitted.ok,capture:persistence.captureRecovery,restore:persistence.restoreRecovery}});
    editor={mutate,save,loading};
    return h("span",{"data-save":save.state},save.errorMessage);
  }
  const mounted=await mount(h(Harness));
  try{
    await act(async()=>sleep(5));
    for(let i=0;i<2;i++){
      let pending;
      await act(async()=>{pending=editor.mutate({type:"gain",start:0,end:0.1,multiplier:0.8});await sleep(5);});
      assert.equal(editor.loading,true);
      assert.equal(gateway.state.puts.length,i+1,"PUT must not wait for waveform rebuilding");
      await act(async()=>{finishWave();await pending;await sleep(5);});
      assert.equal(editor.save.state,"saved",editor.save.errorMessage);
    }
    assert.equal(gateway.state.gets,1,"local edit processing must keep the original saver");
    assert.equal(gateway.state.copy.doc.operations.length,2);
  }finally{await mounted.unmount();gateway.restore();}
}));

test("VS7 current 3D exposure is captured before React commits, then agrees with Saved and restore",async()=>cleanRender(async()=>{
  const gateway=fakeGateway();globalThis.__repairModelRuntimeCalls=[];
  let editor,save,insideInput;
  function Harness(){
    editor=useModel3DWorkbench({...ITEM,kind:"model3d"},"threed");
    const capture=editor.captureRecovery||(()=>captureModel3DRouteSnapshot(editor));
    save=useAdvancedAutoSave({key:ITEM.key,item:ITEM,editorId:"threed",session:null,dirty:editor.dirty,revision:editor.editRevision,
      recovery:{draftSchema:"oceanleo.threed.edit.v1",key:ITEM.key,ready:editor.modelLoaded&&!editor.loading,capture,restore:editor.restoreRecovery}});
    return h("button",{onClick:()=>{
      editor.setExposure(1.1);editor.setExposure(1.25);
      insideInput=capture();
    }},"Exposure");
  }
  const mounted=await mount(h(Harness));
  try{
    await act(async()=>sleep(5));
    await act(async()=>{mounted.container.querySelector("button").click();await sleep(5);});
    assert.equal(insideInput.view.exposure,1.25,"capture read the preceding render");
    assert.equal(editor.exposure,1.25);
    assert.equal(save.state,"saved",save.errorMessage);
    assert.equal(gateway.state.copy.doc.view.exposure,1.25,"Saved must acknowledge the current exposure");
    await act(async()=>editor.restoreRecovery(gateway.state.copy.doc));
    assert.equal(editor.exposure,1.25);
  }finally{await mounted.unmount();gateway.restore();}
}));

test("VS1 an exposure-only runtime update does not rebuild orbit, shadows or a complete scene snapshot",async()=>{
  const {Model3DSceneRuntime}=await import("../src/shell/media-editors/model3d-runtime.mjs");
  const calls={orbit:0,shadows:0,snapshot:0};
  const runtime=Object.assign(Object.create(Model3DSceneRuntime.prototype),{
    view:{...DEFAULT_MODEL3D_VIEW},renderer:{toneMappingExposure:1},renderScene:{},orbit:{},
    applyOrbit:()=>calls.orbit++,applyShadows:()=>calls.shadows++,emitSnapshot:()=>calls.snapshot++,
  });
  runtime.setView({exposure:1.25},{emit:false});
  assert.equal(runtime.renderer.toneMappingExposure,1.25);
  assert.deepEqual(calls,{orbit:0,shadows:0,snapshot:0});
});

function useAudioMatrix(item) {
  const bufferRef=React.useRef(new AudioBufferFake()),sourceUrlRef=React.useRef("https://media.test/source.wav");
  const operationsRef=React.useRef([]),revisionRef=React.useRef(0);
  const [loading,setLoading]=React.useState(false),[dirty,setDirty]=React.useState(false);
  const options={item,siteId:"audio",bufferRef,sourceUrlRef,operationsRef,revisionRef,
    undoOperationsRef:React.useRef([]),redoOperationsRef:React.useRef([]),undoRef:React.useRef([]),redoRef:React.useRef([]),
    workingHeadUrlRef:React.useRef(""),savingRef:React.useRef(false),setLoading,setDirty,
    setError:noop,setSavedUrl:noop,setSaving:noop,setCanUndo:noop,setCanRedo:noop,tt:s=>s,
    requiresExistingSource:true,reloadWaveform:async()=>{}};
  const persistence=useAudioPersistence(options),mutate=useAudioMutations(options);
  return {capture:persistence.captureRecovery,restore:persistence.restoreRecovery,dirty,revision:revisionRef.current,
    ready:admission.audioSourcePersistenceAdmitted({loading,capture:persistence.captureRecovery()}).ok,
    edit:()=>mutate({type:"gain",start:0,end:0.1,multiplier:0.95})};
}
function useModelMatrix(item) {
  const editor=useModel3DWorkbench(item,"threed");
  const count=React.useRef(0);
  return {capture:editor.captureRecovery,restore:editor.restoreRecovery,dirty:editor.dirty,revision:editor.editRevision,
    ready:editor.modelLoaded&&!editor.loading,edit:()=>editor.setExposure(1.1+0.01*++count.current)};
}
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
for(const [kind,hook] of [["image",useFabricMatrix],["design",useFabricMatrix],["audio",useAudioMatrix],["video",useVideoMatrix],["model3d",useModelMatrix]]) {
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
