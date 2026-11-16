import assert from 'node:assert/strict';
import test from 'node:test';
import { React, act, compileModule, dataModule, realModule, mount } from './collab-media-sim.mjs';
import { createFabricImageProject } from '../src/shell/image-editor/editor-persistence.ts';
import { advancedEditorSourceFor } from '../src/shell/advanced-features.ts';

const h = React.createElement;
const blank = {json:{objects:[{type:'Rect',oceanleoRole:'docbg',width:1080,height:1080}]},doc:{width:1080,height:1080},canvasBackground:'#fff'};
const artwork = {json:{objects:[{type:'Path',oceanleoId:'art',path:[['M',0,0],['L',40,30]]}]},doc:{width:160,height:90},canvasBackground:'#fff'};
class Controller {
  constructor(_f,el,_c,callbacks){this.snapshot=structuredClone(globalThis.__img.initial);this.callbacks=callbacks;this.el=el;globalThis.__img.controllers.push(this);}
  async loadSnapshot(s){this.snapshot=structuredClone(s);return true;}
  getSnapshot(){return structuredClone(this.snapshot);}
  getCollabSnapshot(){return this.getSnapshot();}
  getDocument(){return {canvas:{},doc:this.snapshot.doc};}
  setReadOnly(v){this.readOnly=v;}
  ensureObjectIds(){}
  async applyRemote(s){this.snapshot=structuredClone(s);this.callbacks.onRemoteApplied('remote');return true;}
  dispose(){this.disposed=true;}
}
const {useFabricImageEditor}=await import(await compileModule('src/shell/image-editor/use-fabric-image-editor.ts',{
  '../../i18n/ui/useUI':dataModule('export const useUI=()=>(s)=>s;'),
  './fabric-controller':dataModule('export const FabricEditorController='+Controller.toString()+';'),
  '../../lib/media-proxy':dataModule('export * from '+JSON.stringify(realModule('src/lib/media-proxy.ts'))+';export const canvasSafeUrl=u=>u;export const isFirstPartyMediaUrl=()=>true;export async function fetchMediaBlob(url){globalThis.__img.svgReads.push(url);if(globalThis.__img.fail)throw Error("SVG decode failed");return new Blob(["<svg/>"]);}'),
  './vector-svg-scene':dataModule('export * from '+JSON.stringify(realModule('src/shell/image-editor/vector-svg-scene.ts'))+';export class VectorSvgError extends Error{};export const isVectorImageItem=i=>i.artifactType==="vector_image";export async function vectorSvgToSnapshot(){globalThis.__img.svgParsed++;return {snapshot:globalThis.__img.scene,losses:[],removed:0};}'),
}));
function item(meta={}){return {id:'image',key:'artifact:image',artifactId:'image',revisionId:'r1',artifactType:'vector_image',kind:'image',title:'SVG',url:'https://media.invalid/source.svg',meta,artifact:{artifactId:'image',revisionId:'r1',artifactType:'vector_image',sourceFormat:'svg',editability:'editable',editorCapability:'vector-editor',renditions:{source:{url:'https://media.invalid/source.svg',revisionId:'r1',digest:'a'.repeat(64)}}}};}
async function opened(options,body){
  const trace=globalThis.__img={initial:blank,scene:artwork,controllers:[],svgReads:[],svgParsed:0,...options.trace};
  let editor;function Probe({second=false,absent=false}){editor=useFabricImageEditor(options.item||item(),'image',options.options||{});return absent?null:h('canvas',{key:second?'two':'one',ref:editor.stageCanvasRef});}
  const old=globalThis.fetch;globalThis.fetch=async url=>{(trace.projectReads||=[]).push(url);return Response.json(createFabricImageProject(trace.project||artwork));};
  const view=await mount(h(Probe));
  try{for(let n=0;editor.loading&&n<100;n++)await act(async()=>new Promise(r=>setTimeout(r,2)));assert.equal(editor.loading,false);await body(()=>editor,trace,view,Probe);}finally{await view.unmount();globalThis.fetch=old;}
}
test('7c6d376a: structured vector SVG reads SVG bytes without a Fabric URL',async()=>{
  assert.equal(advancedEditorSourceFor(item()).structured,true);
  await opened({},async(e,t)=>{assert.equal(e().sourceReady,true);assert.deepEqual(t.svgReads,['https://media.invalid/source.svg']);assert.equal(t.svgParsed,1);assert.deepEqual(t.projectReads||[],[]);});
});
test('7c6d376a: a persisted fabric_document_url opens the project instead of SVG',async()=>{
  await opened({item:item({fabric_document_url:'https://media.invalid/project.json'})},async(e,t)=>{assert.equal(e().sourceReady,true);assert.equal(t.svgParsed,0);assert.deepEqual(t.projectReads,['https://media.invalid/project.json']);});
});
test('failed SVG load never exports a default background to collaboration or local save',async()=>{
  await opened({trace:{fail:true}},async(e)=>{assert.equal(e().sourceReady,false);assert.equal(e().collab.snapshot(),null);assert.equal(await e().captureLocalSave(),null);let publish;await act(async()=>{publish=e().prepareSave();});assert.equal(await publish(),null);assert.equal(e().error,'SVG decode failed');});
});
test('historical room seed cannot replace real source with a ready/savable default canvas',async()=>{
  await opened({},async(e,t)=>{await act(async()=>e().collab.applyRemote(blank));assert.equal(e().sourceReady,false);assert.match(e().error,/空白/);assert.deepEqual(t.controllers.at(-1).snapshot,artwork);assert.equal(e().collab.snapshot(),null);assert.equal(await e().captureLocalSave(),null);});
});
test('blank persisted Fabric project cannot become source ready',async()=>{
  await opened({item:item({fabric_document_url:'https://media.invalid/project.json'}),trace:{project:blank}},async(e)=>{assert.equal(e().sourceReady,false);assert.match(e().error,/空白/);});
});
test('blank native project is refused before it can hide the real source',async()=>{
  await opened({options:{localProject:createFabricImageProject(blank)}},async(e)=>{assert.equal(e().sourceReady,false);assert.match(e().error,/空白/);});
});
test('blank recovery cannot replace an admitted source',async()=>{
  await opened({},async(e,t)=>{let result;await act(async()=>{result=await e().restoreRecovery(createFabricImageProject(blank));});assert.equal(result,false);assert.deepEqual(t.controllers.at(-1).snapshot,artwork);});
});

test('a replacement canvas is unready until its own source finishes, even in the same session',async()=>{
  await opened({},async(e,t,view,Probe)=>{
    t.fail=true;
    await view.rerender(h(Probe,{second:true}));
    for(let n=0;e().loading&&n<100;n++)await act(async()=>new Promise(r=>setTimeout(r,2)));
    assert.equal(t.controllers.length,2);
    assert.equal(e().sourceReady,false);
    assert.equal(e().collab.snapshot(),null);
    assert.equal(await e().captureLocalSave(),null);
  });
});

test('every non-Chinese locale loads all new source error messages',async()=>{
  const {LOCALES}=await import('../src/i18n/config.ts');
  const {loadUiMessages}=await import('../src/i18n/ui/messages/load.ts');
  const {IMAGE_SOURCE_MESSAGES}=await import('../src/i18n/ui/messages/image-source-copy.ts');
  for(const locale of LOCALES.filter(l=>l!=='zh')){
    const messages=await loadUiMessages(locale);
    for(const key of Object.keys(IMAGE_SOURCE_MESSAGES.zh)){
      assert.equal(messages[key],IMAGE_SOURCE_MESSAGES[locale][key],locale+': '+key);
      assert.ok(messages[key]&&messages[key]!==key,locale+': '+key);
    }
  }
});


test('removing the canvas revokes readiness and all snapshot/save handles',async()=>{
  await opened({},async(e,t,view,Probe)=>{
    await view.rerender(h(Probe,{absent:true}));
    assert.equal(e().sourceReady,false);
    assert.equal(e().collab.snapshot(),null);
    assert.equal(await e().captureLocalSave(),null);
  });
});
