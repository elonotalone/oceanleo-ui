import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";
import { createVideoProject, addProjectNode, updateProjectNode, projectHead, parseVideoProject } from "../src/shell/video-canvas/engine/project-model.ts";
import { bindCanvasGatewayImpl, bindCanvasFetchJson } from "../src/shell/video-canvas/engine/canvas-gateway.ts";
import { durableUuid } from "../src/shell/video-canvas/engine/durable-video-adapter.ts";
import { hydrateVideoTimelineDoc } from "../src/shell/video-editor/video-timeline-source.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.CustomEvent = window.CustomEvent;
globalThis.CSS ||= { escape: value => String(value) };
const copy = dataModule("const tt=s=>s; export const useUI=()=>tt;");
const { default: Session } = await import(await compileModule("src/shell/video-canvas/LibraryVideoCanvasSession.tsx", {
  "../../i18n": copy, "../../i18n/ui/useUI": copy,
  "@xyflow/react": dataModule(`import React from ${JSON.stringify(realModule("node_modules/react/index.js"))};
    export const ReactFlowProvider=({children})=>children;
    export const Handle=()=>null, Background=()=>null, Controls=()=>null, MiniMap=()=>null;
    export const Position={Left:'left',Right:'right',Top:'top',Bottom:'bottom'}, BackgroundVariant={Dots:'dots'};
    export function ReactFlow({nodes,nodeTypes,children}) {const Node=nodeTypes['leovideo-media'];return React.createElement('div',{},nodes.map(n=>React.createElement(Node,{key:n.id,id:n.id,data:n.data,selected:false})),children);}`),
  "../AdvancedWorkbenchShell": dataModule("export const AdvancedWorkbenchShell=({adapter})=>{globalThis.__ruAdapter=adapter;return adapter.stage;};"),
  "../SelectionToolbar": dataModule("export const SelectionToolbar=()=>null;"),
  "../plugin-theme": dataModule("export const usePluginTheme=()=>({theme:'light'});"),
  "../workbench-material-provider": dataModule("export const useWorkbenchMaterialAdapter=()=>{};"),
  "../workbench-material-command": dataModule("export const withEditorHistoryCommand=a=>a;"),
  "../plugin-command": dataModule("export const usePluginCommandSurface=()=>{};"),
  "../workflow-carrier/use-video-project-media": dataModule("export const useVideoProjectMedia=(_doc,onMedia)=>{globalThis.__ruMedia=onMedia;};"),
  "../workflow-carrier/video-project-save": dataModule("export async function saveVideoProject(input){globalThis.__ruSaves.push(input.doc);return {ok:true,revisionId:'saved-revision',item:{...input.base,revisionId:'saved-revision'}};}"),
  "./engine/project-model": realModule("src/shell/video-canvas/engine/project-model.ts"),
  "./engine/canvas-gateway": realModule("src/shell/video-canvas/engine/canvas-gateway.ts"),
  "./engine/durable-video-adapter": realModule("src/shell/video-canvas/engine/durable-video-adapter.ts"),
  "../video-editor/render-client": dataModule(`export async function submitRenderJob(payload,_signal,id){globalThis.__ruRenders.push(payload);return id;}
    export async function getRenderJob(){return {status:'done',url:'https://files.example/film.mp4',artifact_id:'film',revision_id:'film-r1'};}
    export async function cancelRenderJob(){throw Error('unexpected cancellation');}`),
  "../../lib/agent": dataModule("export async function authed(path,init){globalThis.__ruHandoffs.push({path,body:JSON.parse(init.body)});return {ok:true,data:{artifact_id:'timeline',revision_id:'timeline-r1'}};}"),
  "../workspace-actions": dataModule("export function dispatchWorkspaceAction(action){globalThis.__ruOpens.push(action);}"),
  "./runtime": dataModule(""),
}));

const kinds = ["text", "image", "video", "audio", "script", "model", "subtitle", "composite", "delivery", "director", "storyboard", "timeline"];
function fixture(aliases) {
  let project = createVideoProject("Integrated film");
  const ids = {};
  for (const kind of kinds) { const added = addProjectNode(project, kind, { x: Object.keys(ids).length * 300, y: 0 }); project = added.project; ids[kind] = added.nodeId; }
  project = updateProjectNode(project, ids.script, "brief", { prompt: "Write an ocean scene" });
  project = updateProjectNode(project, ids.video, "shot", { shotId: projectHead(project).shots[0].shotId });
  const graph = project.versions[project.headVersionId].graph;
  graph.edges = [[ids.script,ids.image],[ids.image,ids.video]].map(([sourceNodeId,targetNodeId],i)=>({edgeId:`wire-${i}`,sourceNodeId,targetNodeId}));
  if (aliases) {
    const script = graph.nodes.find(n=>n.nodeId===ids.script), video = graph.nodes.find(n=>n.nodeId===ids.video);
    script.kind="prompt"; script.params={prompt:script.prompt}; delete script.prompt;
    video.kind="generate"; video.params={durationMs:5000,aspectRatio:"16:9"};
  }
  project.futureMetadata={preserved:true};
  return {project:parseVideoProject(JSON.stringify(project)),ids};
}
const workflow = () => globalThis.__ruAdapter.stage.props.workflow;
async function command(id,args={}) { let result; await act(async()=>{result=await workflow().dispatchCommand(id,args,"protocol");}); assert.ok(["succeeded","accepted"].includes(result.status),`${id}: ${result.status}: ${result.message}`); return result; }

for (const aliases of [false,true]) test(`merged Library v2 ${aliases?"official aliases":"workflow kinds"}: render all nodes, run wired generation, approve, compose and hand over`, async()=>{
  const {project,ids}=fixture(aliases);
  const calls=[];
  for (const name of ["Saves","Renders","Handoffs","Opens"]) globalThis[`__ru${name}`]=[];
  bindCanvasGatewayImpl({
    getDurableVideoCapabilities:async()=>({providers:{"bailian-video":{available:true,supported_operations:["video.generate.text","video.generate.image"]}}}),
    quoteDurableVideo:async()=>({provider:"bailian-video",provider_model:"wan2.7-i2v",amount:0.1,currency:"USD",cost:{estimated_cost_nano:100000000,currency:"USD_NANO",pricing_input:{}}}),
    generateScript:async(prompt)=>{assert.match(prompt,/ocean scene/);calls.push("script");return {text:"Ocean waves"};},
    generateImage:async(prompt)=>{assert.match(prompt,/Ocean waves/);calls.push("image");return {images:["https://files.example/frame.png"]};},
    generateAudio:async()=>({audio_url:"https://files.example/voice.mp3"}),
    createDurableVideoProject:async()=>({project_id:"remote-project",head_version_id:"remote-v1",head_epoch:1}),
    registerDurableVideoInput:async(input)=>{calls.push("input");return {asset_id:"registered-image",content_sha256:"a".repeat(64)};},
    promoteDurableVideoVersion:async(input)=>{assert.equal(input.graph.nodes[0].operation,"video.generate.image");return {project_id:"remote-project",head_version_id:"remote-v2",head_epoch:2};},
    createDurableVideoRun:async()=>{calls.push("video");return {run_id:"run",created:true};},
    listDurableVideoRuns:async()=>({items:[]}),
    getDurableVideoRun:async()=>({id:"run",project_id:"remote-project",project_version_id:"remote-v2",status:"succeeded",output_assets:[{id:"shot-video",node_id:durableUuid(ids.video),url:"https://files.example/shot.mp4",duration_ms:5000,mime_type:"video/mp4"}]}),
  });
  const item={id:"root",key:"root",artifactId:"root",revisionId:"r1",artifactType:"workflow",title:"Integrated film",meta:{}};
  const host=document.createElement("div"); document.body.append(host); const root=createRoot(host);
  try {
    await act(async()=>root.render(React.createElement(Session,{item,base:{current:item},initialProject:project,lock:{mayWrite:true,collab:{room:null}},onClose(){},onCommitted(){}})));
    for (const id of Object.values(ids)) assert.ok(host.querySelector(`[data-node-id="${id}"]`),`render ${id}`);
    await act(async()=>workflow().onNodeClick(ids.video));
    await command("canvas.chain.run");
    assert.deepEqual(calls,["script","image","input","video"]);
    let current=workflow().captureProject(), take=projectHead(current).takes[0];
    assert.equal(take.status,"candidate"); assert.equal(current.durable.runs[0].status,"succeeded");
    await command("canvas.take.approve",{takeId:take.takeId});
    await act(async()=>workflow().onNodeClick(ids.audio));
    await command("canvas.node.generate.voice",{prompt:"Ocean narration"});
    await act(async()=>workflow().openView("timeline"));
    assert.equal(host.querySelector('[data-command-id="canvas.timeline.final-render"]').disabled,false);
    await command("canvas.timeline.final-render");
    assert.equal(globalThis.__ruRenders.length,1);
    assert.equal(globalThis.__ruRenders[0].timeline.tracks[0].clips[0].source_url,"https://files.example/shot.mp4");
    assert.match(host.textContent,/成片已保存到我的库/);
    await act(async()=>host.querySelector('[data-command-id="canvas.timeline.handoff"]').click());
    assert.equal(globalThis.__ruHandoffs[0].path,"/v1/video/render-timeline/handoff");
    const handed=globalThis.__ruHandoffs[0].body.project;
    assert.equal(hydrateVideoTimelineDoc(JSON.stringify(handed)).tracks[0].clips[0].source_url,"https://files.example/shot.mp4");
    assert.equal(globalThis.__ruSaves.at(-1).timelineHandoff.artifactId,"timeline");
    assert.deepEqual(globalThis.__ruSaves.at(-1).futureMetadata,{preserved:true});
    assert.equal(globalThis.__ruOpens.at(-1).action.itemId,"timeline");
    if (aliases) assert.equal(projectHead(globalThis.__ruSaves.at(-1)).graph.nodes.find(n=>n.nodeId===ids.video).kind,"generate");
  } finally {await act(async()=>root.unmount());host.remove();bindCanvasGatewayImpl();bindCanvasFetchJson();}
});
