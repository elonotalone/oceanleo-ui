import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { React, act, compileModule, dataModule, mount } from "./collab-media-sim.mjs";
import { DEFAULT_MODEL3D_VIEW } from "../src/shell/media-editors/model3d-workbench-defaults.ts";

// Render the REAL four routes. Graphics/media engines, collaboration rooms and
// shell chrome are boundary doubles. Real persistence hooks are tested in
// media-working-copies; here we prove route wiring and close preparation.
globalThis.__routeReact = React;
const h = React.createElement;
const noOp = () => {};
let control;
const Shell = ({adapter}) => {
  control.adapter = adapter;
  return h("main",null,
    h("span",{"data-dirty":String(adapter.persistence.dirty)},String(adapter.persistence.editRevision)),
    adapter.stage);
};
const Stage = () => h("button",{onClick:()=>control.edit()},"Edit document");
function useEditor() {
  const [revision,setRevision] = React.useState(0);
  const doc = {width:800,height:600,fps:30,tracks:[],sourceUrl:"https://media.test/source.wav",operations:[]};
  const capture = () => control.doc;
  const editor = new Proxy({
    ...DEFAULT_MODEL3D_VIEW,
    sourceUrl:"https://media.test/scene.glb",sourceProvenance:{},operationJournal:[],
    loading:false,loadingSource:false,sourceReady:true,sceneDiagnostic:null,
    modelLoaded:true,previewReady:true,dirty:revision>0,editRevision:revision,contentVersion:revision,
    error:"",notice:"",saving:false,savingDraft:false,exporting:false,aiBusy:false,
    layers:[],selected:null,selectedNode:null,selectedAnnotationId:"",openIdentity:"source",
    doc,canUndo:false,canRedo:false,annotations:[],
    collab:{ensureIds:noOp,snapshot:()=>null,readOnly:false,tick:0},
    captureRecovery:capture,captureRecoveryRevision:(rev)=>({revision:rev,payload:capture()}),
    restoreRecovery:async()=>true,
    prepareSave:()=>{
      control.preparedDoc=structuredClone(control.doc);
      return async()=>{control.publishes++;return {url:"https://media.test/output.png",versionId:"v2",sourceProvenance:{}};};
    },
    save:async()=>{control.publishes++;return {url:"https://media.test/out.png",projectUrl:"https://media.test/project.json",versionId:"v2",savedAt:"2026-11-15T00:00:00Z"};},
    saveCopy:async()=>{control.publishes++;return {url:"https://media.test/out.glb",versionId:"v2",sourceProvenance:{}};},
    saveDraft:async()=>{control.publishes++;return {url:"https://media.test/out.mp4",versionId:"v2"};},
  },{get:(o,k)=> k in o ? o[k] : noOp});
  control.doc = {...doc,operations:revision ? [{type:"gain",start:0,end:1,multiplier:0.5}] : []};
  control.edit = () => setRevision(n=>n+1);
  return editor;
}
const shared = {
  AdvancedWorkbenchShell:Shell,
  useUI:()=>s=>s,
  useEntityCollab:()=>({saveGate:true,readOnly:false,room:null,markSaved:noOp,
    history:{active:false,notice:"",canUndo:false,canRedo:false,undo:noOp,redo:noOp}}),
  useCollabSelections:()=>[],
  useWorkbenchMaterialAdapter:noOp,usePluginCommandSurface:noOp,
  guardPluginSurface:s=>s,withEditorHistoryCommand:s=>s,
  editorToolLabel:()=>"Editor",
  imageRouteChrome:()=>({}),
  visualDownloadFormats:()=>[{format:"mp4",label:"MP4"}],visualUploadAccept:()=>"",
  advancedRootItemId:item=>item.id,advancedSavedItem:(item,input)=>({...item,...input}),
  imageSaveReceiptItem:(item,_saved,meta,fallback)=>({...item,...fallback,meta}),
  threeDSubtypeFor:()=>"model",isModel3DSourceItem:()=>true,
  editorRouteFor:()=>({type:"video-timeline"}),
  VisualViewOnlyPanel:({children})=>children,
  FabricImageStage:Stage,AudioStage:Stage,Model3DStage:Stage,VideoTimelineStage:Stage,
  useFabricImageEditor:useEditor,useAudioWorkbench:useEditor,useModel3DWorkbench:useEditor,useVideoTimeline:useEditor,
};
globalThis.__routeMocks=shared;

async function loadRoute(name) {
  const filename = "src/shell/advanced-routes/"+name+"Route.tsx";
  const source = ts.createSourceFile(filename,readFileSync(filename,"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const overrides = {};
  const moduleExports = new Map();
  for(const node of source.statements) {
    if(!ts.isImportDeclaration(node)||!node.importClause||node.importClause.isTypeOnly)continue;
    const specifier=node.moduleSpecifier.text;
    if(!specifier.startsWith("."))continue;
    // Keep document snapshots, history and admission gates real.
    if(/Model3DRouteHistory|model3d-collab-snapshot|non-richdoc-source-gate|library-data|video-timeline-source/.test(specifier))continue;
    const named=node.importClause.namedBindings;
    if(!named||!ts.isNamedImports(named))continue;
    const exports=named.elements.filter(n=>!n.isTypeOnly).map(n=>(n.propertyName||n.name).text);
    if(!exports.length)continue;
    moduleExports.set(specifier,new Set([...(moduleExports.get(specifier)||[]),...exports]));
  }
  for(const [specifier,names] of moduleExports) overrides[specifier]=dataModule([...names].map(n=>"export const "+n+" = (...args) => globalThis.__routeMocks."+n+"?.(...args);").join("\n"));
  return (await import(await compileModule(filename,overrides)))[name+"Route"];
}

for(const name of ["Image","Audio","VideoTimeline","Model3D"]) {
  const Route=await loadRoute(name);
  test(name+": real route opens clean, click edit -> dirty -> complete capture, prepare publish before close", async()=>{
    control={publishes:0};
    const errors=[];
    const previous=console.error;
    console.error=(...args)=>errors.push(args.map(String).join(" "));
    let mounted;
    try {
      mounted=await mount(h(Route,{
        item:{id:"item",key:"item",title:"Work",kind:"video",source:"local",meta:{}},
        onClose:noOp,siteId:"oceanleo",
      }));
      assert.equal(control.adapter.persistence.dirty,false);
      const initialRevision=control.adapter.persistence.editRevision;
      await act(async()=>mounted.container.querySelector("button").click());
      assert.equal(control.adapter.persistence.dirty,true);
      assert.ok(control.adapter.persistence.editRevision>initialRevision);
      const persistence=control.adapter.persistence;
      assert.equal(typeof persistence.recovery.draftSchema,"string");
      assert.equal(persistence.recovery.ready,true);
      const doc=await persistence.recovery.capture();
      assert.ok(doc&&typeof doc==="object");
      assert.deepEqual(JSON.parse(JSON.stringify(doc)),doc);
      const publish=persistence.preparePublish();
      assert.ok(control.preparedDoc,"prepare captures before close");
      await mounted.unmount();mounted=null;
      assert.equal((await publish()).ok,true);
      assert.equal(control.publishes,1);
    } finally {
      if(mounted)await mounted.unmount();
      console.error=previous;
    }
    assert.deepEqual(errors,[],"route must never emit console.error");
  });
}
