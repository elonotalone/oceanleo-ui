import assert from "node:assert/strict";
import test from "node:test";
import {React,act,compileModule,dataModule,realModule,mount} from "./collab-media-sim.mjs";
import * as edits from "../src/shell/user-edit-session.ts";

const h=React.createElement,delay=ms=>new Promise(r=>setTimeout(r,ms));
const scene={json:{objects:[{type:"Rect",oceanleoId:"one",left:10}]},doc:{width:1024,height:768},canvasBackground:"#fff"};
globalThis.__responsiveScene=scene;
class Pixels {
  constructor(_fabric,_element,_container,callbacks){this.callbacks=callbacks;this.snapshot=structuredClone(globalThis.__responsiveScene);return new Proxy(this,{get:(o,k)=>k in o?o[k]:()=>{}});}
  getSnapshot(){return structuredClone(this.snapshot);}
  getDocument(){return {canvas:{toObject:()=>this.snapshot.json},doc:this.snapshot.doc};}
  flipTarget(){this.snapshot.json.objects[0].left++;this.callbacks.onDocumentChange();}
}
globalThis.__responsiveRaster=0;
globalThis.__responsivePublished=[];
const {useFabricImageEditor}=await import(await compileModule("src/shell/image-editor/use-fabric-image-editor.ts",{
  "../../i18n/ui/useUI":dataModule('export const useUI=()=>(s)=>s;'),
  "./fabric-controller":dataModule("export const FabricEditorController="+Pixels.toString()+";"),
  "../../lib/media-proxy":dataModule('export * from '+JSON.stringify(realModule("src/lib/media-proxy.ts"))+';export const canvasSafeUrl=u=>u;export const isFirstPartyMediaUrl=()=>true;export const fetchMediaBlob=async()=>new Blob();'),
  "./editor-objects":dataModule('export * from '+JSON.stringify(realModule("src/shell/image-editor/editor-objects.ts"))+';export async function exportDocBlob(canvas){globalThis.__responsiveRaster++;const until=performance.now()+80;while(performance.now()<until){}return new Blob([JSON.stringify(canvas.toObject())]);}'),
  "./image-publication":dataModule('export async function renderImagePublication(snapshot){await new Promise(r=>setTimeout(r,0));globalThis.__responsiveRaster++;if(globalThis.__responsiveFailOnce){globalThis.__responsiveFailOnce=false;throw Error("render failed");}return {preview:new Blob([JSON.stringify(snapshot.json)]),svg:undefined};}'),
  "./editor-persistence":dataModule('export * from '+JSON.stringify(realModule("src/shell/image-editor/editor-persistence.ts"))+';export const createFabricImageProject=snapshot=>({snapshot});export const createFabricImageWorkingCopy=createFabricImageProject;export const resolveFabricImageWorkingCopy=async p=>p;export const parseFabricImageProject=()=>null;export const downloadImageBlob=()=>{};export const persistCompositeImageProject=()=>{throw Error("unexpected composite");};export async function persistImageProject(snapshot,_item,_site,_key,_url,_messages,preview){globalThis.__responsivePublished.push({snapshot,preview:await (await preview()).text()});return {previewUrl:"https://media.test/p.png",projectUrl:"https://media.test/p.json",savedAt:"2026-11-15T00:00:00Z",versionId:"r2"};}'),
}));
async function clean(body){const before=console.error,errors=[];console.error=(...a)=>errors.push(a.map(String).join(" "));try{await body();}finally{console.error=before;}assert.deepEqual(errors,[]);}

test("run6 image publication preparation freezes JSON without raster work and survives close",async(t)=>clean(async()=>{
  let editor;globalThis.__responsiveRaster=0;globalThis.__responsivePublished=[];
  function Probe(){editor=useFabricImageEditor({id:"responsive",key:"responsive",title:"Picture",kind:"image",source:"creation",meta:{}},"image");return h("canvas",{ref:editor.stageCanvasRef});}
  const view=await mount(h(Probe));
  try {
    for(let i=0;!editor.sourceReady&&i<100;i++)await act(async()=>delay(2));
    assert.equal(editor.sourceReady,true);
    const started=performance.now(),publish=editor.prepareSave(),elapsed=performance.now()-started;
    assert.equal(globalThis.__responsiveRaster,0,"prepareSave rendered before returning the publication callback");
    assert.ok(elapsed<20,"preparation must leave the input task within20ms");
    await act(async()=>editor.flipTarget("x"));
    await view.unmount();
    assert.ok(await publish());
    assert.equal(globalThis.__responsivePublished[0].snapshot.json.objects[0].left,10);
    assert.equal(JSON.parse(globalThis.__responsivePublished[0].preview).objects[0].left,10);
    t.diagnostic("prepareSave "+elapsed.toFixed(3)+"ms; eager raster calls0");
  }finally{await view.unmount();}
}));

test("run6 telemetry retains pointer-down time through a delayed click, without inventing an edit",()=>{
  edits.resetUserEditSession();edits.bindActiveUserEditItem("picture");
  const button=document.createElement("button"),old=Object.getOwnPropertyDescriptor(window,"event");
  const down=performance.now()-600;
  try {
    assert.equal(typeof edits.rememberUserEditInput,"function");
    edits.rememberUserEditInput({isTrusted:true,timeStamp:down,target:button});
    assert.equal(edits.userMutationGeneration("artifact:picture"),0);
    Object.defineProperty(window,"event",{configurable:true,value:{isTrusted:true,type:"click",timeStamp:performance.now()-20,target:button}});
    edits.recordUserMutation("artifact:picture");
    assert.equal(edits.userMutationAt("artifact:picture"),down);
  }finally{if(old)Object.defineProperty(window,"event",old);else delete window.event;edits.resetUserEditSession();}
});

class Detached {
  constructor(){this.objects=[];globalThis.__tileTrace.canvas=this;}
  async loadFromJSON(value){this.meta=value;}
  add(object){this.objects.push(object);}
  getObjects(){return this.objects;}
  async dispose(){globalThis.__tileTrace.disposed=true;}
  toCanvasElement(_scale,box){
    const trace=globalThis.__tileTrace;
    trace.tiles.push({...box});
    if(trace.tiles.length===1)trace.onFirstTile?.();
    if(trace.fail&&trace.tiles.length===2)throw Error("raster unavailable");
    const stop=performance.now()+3;while(performance.now()<stop){}
    return {...box};
  }
}
const detachedFabric=dataModule('export const StaticCanvas='+Detached.toString()+';export const util={enlivenObjects:async values=>values.map(value=>({value,objectCaching:true,getObjects:()=>[]}))};');
const {renderImagePublication}=await import(await compileModule("src/shell/image-editor/image-publication.ts",{
  "fabric":detachedFabric,
  "./editor-persistence":dataModule('export const createFabricImageProject=snapshot=>({snapshot});export const resolveFabricImageWorkingCopy=async p=>structuredClone(p);'),
  "./vector-svg-scene":dataModule('export const exportVectorSvg=canvas=>JSON.stringify(canvas.getObjects().map(o=>o.value));'),
}));
const {WorkingCopySaver}=await import(await compileModule("src/shell/editor-working-copy.ts",{
  "../lib/telemetry/index":dataModule('export const emitTelemetry=()=>{};'),
}));
async function detached(body){
  const old=document.createElement.bind(document),trace={tiles:[],draws:[],disposed:false,output:null};
  globalThis.__tileTrace=trace;
  document.createElement=(tag,...args)=>{
    if(tag!=="canvas")return old(tag,...args);
    return trace.output={width:0,height:0,getContext:()=>({drawImage:(tile,left,top)=>trace.draws.push({left,top,width:tile.width,height:tile.height})}),
      toBlob:cb=>queueMicrotask(()=>cb(new Blob([JSON.stringify(trace.draws)])))};
  };
  try{await body(trace);}finally{document.createElement=old;delete globalThis.__tileTrace;}
}
test("run6 detached publication yields between bounded tiles so a working-copy PUT leaves within20ms",async(t)=>detached(async trace=>{
  let sentAt,inputAt,tilesAtSend;
  const saver=new WorkingCopySaver({schema:"image",baseRevision:null,capture:()=>({flipX:true}),restore:()=>true,
    transport:{get:async()=>null,put:async()=>{sentAt=performance.now();tilesAtSend=trace.tiles.length;return {ok:true,seq:1};}}});
  await saver.initialize();
  trace.onFirstTile=()=>{inputAt=performance.now();setTimeout(()=>saver.edit(inputAt),0);};
  try {
    const output=await renderImagePublication(structuredClone(scene),true);
    await saver.flush();
    assert.equal(saver.snapshot().state,"saved");
    assert.ok(sentAt-inputAt<20,"publication delayed the next edit's PUT");
    assert.ok(tilesAtSend<trace.tiles.length,"PUT must leave before rasterization finishes");
    assert.equal(trace.tiles.length,6);
    assert.ok(trace.tiles.every(tile=>tile.width*tile.height<=512*256));
    assert.deepEqual(trace.draws,[0,256,512].flatMap(top=>[0,512].map(left=>({left,top,width:512,height:256}))));
    assert.equal(JSON.parse(output.svg)[0].left,10);
    assert.equal(JSON.parse(await output.preview.text()).length,6);
    assert.equal(trace.canvas.getObjects()[0].objectCaching,false);
    assert.equal(trace.disposed,true);assert.equal(trace.output.width,0);
    t.diagnostic("input-to-PUT while rasterizing "+(sentAt-inputAt).toFixed(3)+"ms; tiles6, max128K pixels");
  }finally{saver.dispose();}
}));

test("run6 a failed detached render releases its canvas and output buffer",async()=>detached(async trace=>{
  trace.fail=true;
  await assert.rejects(renderImagePublication(structuredClone(scene)),/raster unavailable/);
  assert.equal(trace.disposed,true);assert.equal(trace.output.width,0);assert.equal(trace.output.height,0);
}));

test("run6 input timing cannot leak to another control, item or a later click",async()=>{
  edits.resetUserEditSession();edits.bindActiveUserEditItem("one");
  const first=document.createElement("button"),second=document.createElement("button"),old=Object.getOwnPropertyDescriptor(window,"event");
  const recent=performance.now()-5,earlier=recent-100;
  const click=target=>Object.defineProperty(window,"event",{configurable:true,value:{type:"click",isTrusted:true,timeStamp:recent,target}});
  try {
    edits.rememberUserEditInput({isTrusted:false,timeStamp:earlier,target:first});click(first);edits.recordUserMutation("one");assert.equal(edits.userMutationAt("one"),recent);
    edits.rememberUserEditInput({isTrusted:true,timeStamp:earlier,target:first});click(second);edits.recordUserMutation("one");assert.equal(edits.userMutationAt("one"),recent);
    click(first);edits.recordUserMutation("one");assert.equal(edits.userMutationAt("one"),earlier);
    await Promise.resolve();click(first);edits.recordUserMutation("one");assert.equal(edits.userMutationAt("one"),recent);
    edits.rememberUserEditInput({isTrusted:true,timeStamp:earlier,target:first});edits.bindActiveUserEditItem("two");click(first);edits.recordUserMutation("two");assert.equal(edits.userMutationAt("two"),recent);
  }finally{if(old)Object.defineProperty(window,"event",old);else delete window.event;edits.resetUserEditSession();}
});

test("run6 the real edit-bar hook records input before selection hold for pointer and keyboard",async()=>clean(async()=>{
  globalThis.__inputOrder=[];
  let renders=0;
  const {useEditBarSelectionSession}=await import(await compileModule("src/shell/edit-bar-selection-session.tsx",{
    "./user-edit-session":dataModule('export const rememberUserEditInput=()=>globalThis.__inputOrder.push("input");'),
  }));
  function Bar(){renders++;const session=useEditBarSelectionSession({id:"bitmap",kind:"image",revision:1},false,()=>globalThis.__inputOrder.push("hold"));
    return h("button",{onPointerDownCapture:session.onPointerDownCapture,onKeyDownCapture:session.onKeyDownCapture},"Flip");}
  const view=await mount(h(Bar));
  globalThis.__inputOrder=[];
  const before=renders;
  try {
    await act(async()=>view.container.querySelector("button").dispatchEvent(new window.PointerEvent("pointerdown",{bubbles:true,pointerType:"mouse"})));
    assert.deepEqual(globalThis.__inputOrder.slice(0,2),["input","hold"]);
    assert.equal(renders,before,"pointer-down must not synchronously rerender the whole toolbar before click");
    globalThis.__inputOrder=[];
    await act(async()=>view.container.querySelector("button").dispatchEvent(new window.KeyboardEvent("keydown",{bubbles:true,key:"Enter"})));
    assert.deepEqual(globalThis.__inputOrder.slice(0,2),["input","hold"]);
  }finally{await view.unmount();delete globalThis.__inputOrder;}
}));

test("run6 publication can retry a failed render without recapturing a newer scene",async()=>clean(async()=>{
  let editor;globalThis.__responsiveFailOnce=true;globalThis.__responsivePublished=[];
  function Probe(){editor=useFabricImageEditor({id:"retry",key:"retry",title:"Picture",kind:"image",source:"creation",meta:{}},"image");return h("canvas",{ref:editor.stageCanvasRef});}
  const view=await mount(h(Probe));
  try {
    for(let i=0;!editor.sourceReady&&i<100;i++)await act(async()=>delay(2));
    const publish=editor.prepareSave();let result;
    await act(async()=>{result=await publish();});assert.equal(result,null);
    await act(async()=>editor.flipTarget("x"));
    await act(async()=>{result=await publish();});assert.ok(result);
    assert.equal(globalThis.__responsivePublished[0].snapshot.json.objects[0].left,10);
  }finally{await view.unmount();delete globalThis.__responsiveFailOnce;}
}));

test("run6 edge tiles preserve the last row and column of a non-multiple document",async()=>detached(async trace=>{
  const doc={...structuredClone(scene),doc:{width:1025,height:769}};
  await renderImagePublication(doc);
  assert.equal(trace.draws.length,12);
  assert.deepEqual(trace.draws.at(-1),{left:1024,top:768,width:1,height:1});
  assert.equal(trace.draws.reduce((sum,tile)=>sum+tile.width*tile.height,0),1025*769);
}));
