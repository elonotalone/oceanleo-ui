import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const require = createRequire(import.meta.url);
const fabric = createRequire(require.resolve('fabric/node'));
const canvas = fabric.resolve('canvas');
const previous = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabric.resolve('jsdom')).href);
if (previous) require.cache[canvas] = previous; else delete require.cache[canvas];
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://unit.dev.oceanleo.com', pretendToBeVisual: true });
for (const name of ['window','document','navigator','HTMLElement','Element','Node','Event','MouseEvent','localStorage','sessionStorage']) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.fetch = async () => { throw new Error('No network in E10 component tests'); };
globalThis.AudioContext = class {
  async decodeAudioData(bytes) { return { duration: 1, marker: new Uint8Array(bytes)[0] }; }
  async close() {}
};
after(() => dom.window.close());
const react = pathToFileURL(require.resolve('react')).href;
const jsx = pathToFileURL(require.resolve('react/jsx-runtime')).href;
const noop = (...names) => dataModule(names.map(n => `export function ${n}(){return null}`).join('\n'));
const handoffUrl = await compileModule('src/shell/advanced-routes/editor-handoff.ts', {
  '../office-editor/useOfficeArtifactSource': dataModule('export function useOfficeArtifactSource(){return {loading:false}}'),
});
const handoff = await import(handoffUrl);
const sourceStub = dataModule(`export * from ${JSON.stringify(handoffUrl)}; export const useEditorHandoffSource=()=>globalThis.__e10.source;`);
const common = {
  '../advanced-routes/editor-handoff': sourceStub,
  '../advanced-routes/mode-switch-gate': dataModule('export const useModeSwitchHandoff=()=>null; export const useModeSwitchReady=()=>{}; export const useModeSwitchFailure=()=>globalThis.__e10.fail;'),
  '../advanced-routes/w19-handoff-store': dataModule(`
    export const w19ItemKey=(plugin,item)=>plugin+':'+(item.artifactId||item.id||'');
    export const peekW19EnterHandoff=()=>null; export const resolveW19Handoff=(item,source)=>source||{kind:'empty'};
    export const applyW19HandoffToItem=item=>item; export const w19OfficeProbeItem=item=>item;
    export const reportW19ProSaved=(key,item)=>globalThis.__e10.reports.push(item);
    export const W19_PRO_SAVED_AS_NEW_VERSION='';`),
  '../AdvancedWorkbenchShell': dataModule(`import {jsx} from ${JSON.stringify(jsx)}; export function AdvancedWorkbenchShell({adapter}) {globalThis.__e10.adapter=adapter; return jsx('main',{children:adapter.stage});}`),
  '../advanced-recovery-store': dataModule('export const advancedRecoveryKey=()=>"test"'),
  '../advanced-session': dataModule('export const advancedSavedItem=(item,patch)=>({...item,...patch}); export const advancedCommittedRevisionItem=(item,saved)=>({...item,...saved});'),
  '../plugin-command': noop('usePluginCommandSurface'),
  '../agent-review': noop('rememberEditorChips'),
  '../workbench-routes': dataModule('export const editorToolLabel=()=>"test"; export const editorRouteFor=()=>({});'),
  '../doc-editors/doc-io': dataModule(`export const saveFileToLibrary=input=>globalThis.__e10.save(input); export const saveProjectWorkingHead=input=>globalThis.__e10.save(input); export function downloadText(){}`),
  '../../lib/media-proxy': dataModule('export const fetchMediaBlob=async()=>new Blob([new Uint8Array([1])]); export const absoluteMediaUrl=x=>x; export const canvasSafeUrl=x=>x;'),
  '../../lib/auth/client': dataModule('export const accessToken=async()=>"";'),
  '../../lib/auth/config': dataModule('export const GATEWAY_BASE="https://invalid.test";'),
  '../../lib/database': noop('uploadFile'),
};
const audioStubs = {
  ...common,
  './audio-playlist-mount': dataModule('export const mountWaveformPlaylist=async()=>({emit(){},getDuration:()=>1,getTimeSelection:()=>({start:0,end:1}),trackCount:()=>1});'),
  './audio-workbench-utils': dataModule('export const encodeWav=buffer=>{globalThis.__e10.encoded.push(buffer.marker);return new Blob([new Uint8Array([buffer.marker])])}; export const applyAudioOperation=buffer=>buffer; export const validAudioProject=value=>Boolean(value&&value.sourceUrl);'),
  './AudioPlaylistToolbar': noop('AudioPlaylistToolbar'), './AudioTranscriptPanel': noop('AudioTranscriptPanel'),
};
const modelStubs = {
  ...common,
  './model3d-source-cache': dataModule('export const preloadModel3DSource=async()=>({bytes:new Uint8Array([1]).buffer,format:"glb"});'),
  './Model3DNextToolbar': noop('Model3DNextToolbar'), './Model3DNextDirector': noop('Model3DNextDirector'), './Model3DViewerStage': noop('Model3DViewerStage'),
};
const videoStubs = {
  ...common,
  '../SelectionToolbar': noop('SelectionToolbar'),
  './preview-engine': dataModule('export class TimelinePreviewEngine {attachCanvas(){} dispose(){} setDoc(){} play(){} pause(){}}'),
  './render-client': noop('renderTimeline'),
  './designcombo-save-preview': dataModule('export const createVideoDesigncomboPreview=()=>async()=>new Blob(["preview"]);'),
  './designcombo/timeline-host': noop('DesigncomboTimelineHost'), './designcombo/inspector-host': noop('DesigncomboInspectorHost'),
};
const chartStubs = {
  ...common,
  './use-chart-workbench': dataModule(`import {useState} from ${JSON.stringify(react)};
    export const chartEditorManifest=()=>({});
    export function useChartWorkbench(){
      const [revision,setRevision]=useState(0);const [dirty,setDirty]=useState(false);
      globalThis.__e10.edit=()=>{setRevision(n=>n+1);setDirty(true)};
      return {loading:false,sourceReady:true,carrierState:'ready',dirty,editRevision:revision,
        document:globalThis.__e10.chartDocument, table:{headers:[],rows:[]},
        save:async()=>{const r=await globalThis.__e10.save({revision}); if(!r.ok)return null;setDirty(false);return {...r,json:'{}'};}
      };
    }`),
  './ChartContextToolbar': noop('ChartContextToolbar'), './ChartControls': noop('ChartControls'), './ChartStage': noop('ChartStage'), './ChartOptionCodePanel': noop('ChartOptionCodePanel'),
  './chart-command-surface': noop('createChartCommandSurface'),
};
const { AudioPlaylistStage } = await import(await compileModule('src/shell/media-editors/AudioPlaylistStage.tsx',audioStubs));
const { Model3DNextStage } = await import(await compileModule('src/shell/media-editors/Model3DNextStage.tsx',modelStubs));
const { VideoDesigncomboStage } = await import(await compileModule('src/shell/video-editor/VideoDesigncomboStage.tsx',videoStubs));
const { ChartNextStage } = await import(await compileModule('src/shell/chart-editor/ChartNextStage.tsx',chartStubs));
const { normalizeChartDocument } = await import('../src/shell/chart-editor/chart-schema.ts');
const { emptyOpenVideoProject } = await import('../src/shell/video-editor/designcombo/schema.ts');
const { EDITOR_PROTOCOL } = await import('../src/shell/editor-protocol.ts');

async function mount(t, kind) {
  handoff.resetEditorHandoffForTests();
  const state = globalThis.__e10 = {
    source: {status:'ready',source:kind==='audio'||kind==='threed'?{kind:'url',url:'https://fixture.invalid/input',format:kind==='audio'?'wav':'glb',revision:null}:{kind:'empty'}},
    fail:()=>{},reports:[],saved:[],encoded:[],posted:[],
    chartDocument: normalizeChartDocument({option:{title:{text:'chart'},xAxis:{type:'category',data:['A']},yAxis:{type:'value'},series:[{type:'bar',data:[1]}]}}),
  };
  state.item={id:'asset',key:'asset',artifactId:'asset',revisionId:'r0',title:'test',kind,meta:{}};
  state.save=async input=>{state.saved.push(input);return {ok:true,url:'https://fixture.invalid/saved',item:{...state.item,revisionId:'r'+state.saved.length},versionId:'r'+state.saved.length};};
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);let mounted=true;
  const Component={audio:AudioPlaylistStage,threed:Model3DNextStage,'video-timeline':VideoDesigncomboStage,'chart-editor':ChartNextStage}[kind];
  await act(async()=>{root.render(React.createElement(Component,{item:state.item}));});
  state.unmount=async()=>{if(mounted){mounted=false;await act(async()=>root.unmount());container.remove();}};
  t.after(state.unmount);
  state.key=kind+':asset';
  state.mode=async mode=>act(async()=>{await state.adapter.mode.setMode(mode)});
  state.enter=async()=>{
    await state.mode('pro');
    const frame=container.querySelector('iframe');
    assert.ok(frame,'professional frame exists');
    frame.contentWindow.postMessage=message=>state.posted.push(message);
    state.message=async data=>act(async()=>window.dispatchEvent(new window.MessageEvent('message',{source:frame.contentWindow,origin:kind==='audio'?'https://audio.oceanleo.app':'https://3d.oceanleo.app',data:{protocol:EDITOR_PROTOCOL,instanceId:new URL(frame.src).searchParams.get('instance'),...data}})));
    await state.message({type:'ready'});
    if(kind==='threed')await state.message({type:'dirty',dirty:true,revision:0});
  };
  state.dirty=async revision=>state.message({type:'dirty',dirty:true,revision});
  state.snapshot=async(marker,revision=1,request=state.posted.findLast(m=>m.type===(kind==='audio'?'save-request':'recovery-capture')))=>{
    assert.ok(request,'dirty proactively requests current snapshot');
    await state.message({type:'recovery-snapshot',ok:true,recoveryId:request.saveId||request.recoveryId,snapshot:{revision,payload:kind==='audio'?{audioBase64:Buffer.from([marker]).toString('base64'),mime:'audio/wav'}:{gltfBase64:Buffer.from([marker]).toString('base64'),format:'glb'}}});
  };
  state.flush=async()=>{let result;await act(async()=>{result=await state.adapter.persistence.flush()});return result;};
  return state;
}

for(const kind of ['chart-editor','video-timeline']) {
  test(`E10 ${kind}: real Stage registers save, clean leave skips upload, dirty leave kicks flush without waiting`,async t=>{
    const s=await mount(t,kind);
    assert.equal(await handoff.saveBeforeLeavePro(s.key),true);assert.equal(s.saved.length,0);
    await act(async()=>{if(kind==='chart-editor')s.edit();else s.adapter.persistence.recovery.restore(emptyOpenVideoProject());});
    assert.equal(s.adapter.persistence.dirty,true);
    let finish;const base=s.save;s.save=input=>new Promise(resolve=>{finish=async()=>resolve(await base(input))});
    let done=false;let pending;
    await act(async()=>{pending=handoff.saveBeforeLeavePro(s.key).then(result=>{done=true;return result});await Promise.resolve();});
    assert.equal(await pending,true);assert.equal(done,true);
    assert.equal(typeof finish,'function','leave must invoke the same professional save');
    await act(async()=>{await finish();});
    assert.equal(s.saved.length,1);
    await s.unmount();assert.equal((await s.adapter.persistence.flush()).ok,true);assert.equal(s.saved.length,1);
  });
  test(`E10 ${kind}: local normal switch leaves pro even after failed save`,async t=>{
    const s=await mount(t,kind);await s.mode('pro');
    await act(async()=>{if(kind==='chart-editor')s.edit();else s.adapter.persistence.recovery.restore(emptyOpenVideoProject());});
    s.save=async()=>({ok:false,error:'offline'});await s.mode('normal');assert.equal(s.adapter.mode.current,'normal');
    assert.equal(s.adapter.persistence.recovery.draftSchema, kind==='chart-editor' ? 'oceanleo.chart.edit.v1' : 'oceanleo.video-timeline.edit.v1');
    assert.equal(document.body.textContent.includes('专业编辑里的修改还没保存成功，请重试。'), false);
  });
}

test('E10 audio: trusted dirty requests latest bytes; no stale encoding; two commits keep artifact identity',async t=>{
  const s=await mount(t,'audio');await s.enter();s.encoded.length=0;
  await s.dirty(1);assert.equal(s.adapter.persistence.dirty,true);
  assert.equal((await s.flush()).ok,false);assert.equal(s.encoded.length,0);assert.equal(s.saved.length,0);
  await s.snapshot(7);assert.equal((await s.flush()).ok,true);
  await s.dirty(2);await s.snapshot(8,2);await s.unmount();assert.equal((await s.adapter.persistence.flush()).ok,true);
  assert.deepEqual(s.encoded,[7,8]);assert.equal(s.saved.length,2);
  for(const input of s.saved){assert.equal(input.artifactRevision.artifactType,'audio');assert.equal(input.artifactRevision.editor,'audio-editor');assert.equal(input.item.artifactId,'asset')}
  assert.equal(s.saved[1].item.revisionId,'r1');assert.equal(s.reports[1].revisionId,'r2');
});
test('E10 audio: outdated request/revision snapshots and local mode switch cannot discard dirty edits',async t=>{
  const s=await mount(t,'audio');await s.enter();await s.dirty(1);
  const old=s.posted.findLast(m=>m.type==='save-request');await s.dirty(2);await s.snapshot(3,1,old);
  assert.equal((await s.flush()).ok,false);await s.mode('normal');assert.equal(s.adapter.mode.current,'normal');
  assert.equal(String(s.adapter.status || '').includes('专业编辑里的修改还没保存成功'), false);
  await s.snapshot(9,1);assert.equal((await s.flush()).ok,false);
});

test('E10 3D: dirty cached latest snapshot survives actual Stage unmount',async t=>{
  const s=await mount(t,'threed');await s.enter();await s.dirty(1);await s.snapshot(9);
  await s.unmount();assert.equal((await s.adapter.persistence.flush()).ok,true);
  assert.equal(new Uint8Array(await (await s.saved[0].createFile()).arrayBuffer())[0],9);
});
test('E10 3D: old snapshot cannot masquerade as latest after unmount',async t=>{
  const s=await mount(t,'threed');await s.enter();await s.dirty(1);await s.snapshot(4);await s.dirty(2);
  await s.unmount();assert.equal((await s.adapter.persistence.flush()).ok,false);assert.equal(s.saved.length,0);
});

test('E10 3D: a reply to the previous generation requests another capture and never replaces latest bytes',async t=>{
  const s=await mount(t,'threed');await s.enter();await s.dirty(1);
  const old=s.posted.findLast(m=>m.type==='recovery-capture');await s.dirty(2);await s.snapshot(3,1,old);
  const latest=s.posted.findLast(m=>m.type==='recovery-capture');assert.notEqual(latest.recoveryId,old.recoveryId);
  await s.snapshot(8,2,latest);await s.unmount();assert.equal((await s.adapter.persistence.flush()).ok,true);
  assert.equal(new Uint8Array(await (await s.saved[0].createFile()).arrayBuffer())[0],8);
});

for(const kind of ['audio','threed','video-timeline']) {
  test(`E10 ${kind}: an edit during upload stays dirty and the retry uses the committed base`,async t=>{
    const s=await mount(t,kind);
    if(kind!=='video-timeline'){await s.enter();await s.dirty(1);await s.snapshot(5)}
    else await act(async()=>s.adapter.persistence.recovery.restore(emptyOpenVideoProject()));
    let finish;const base=s.save;s.save=input=>new Promise(resolve=>{finish=async()=>resolve(await base(input))});
    let first;
    await act(async()=>{first=s.adapter.persistence.flush();await Promise.resolve()});
    if(kind!=='video-timeline')await s.dirty(2);
    else await act(async()=>s.adapter.persistence.recovery.restore(emptyOpenVideoProject()));
    await act(async()=>{await finish();assert.equal((await first).ok,false)});
    assert.equal(s.adapter.persistence.dirty,true);assert.equal(s.reports.length,0);
    s.save=base;if(kind!=='video-timeline')await s.snapshot(8,2);
    assert.equal((await s.flush()).ok,true);assert.equal(s.saved[1].item.revisionId,'r1');
    assert.equal(s.saved[1].item.artifactId,'asset');
  });
}
for(const kind of ['audio','threed']) {
  test(`E10 ${kind}: local switch leaves pro even after failed save and shares the same flush`,async t=>{
    const s=await mount(t,kind);await s.enter();await s.dirty(1);await s.snapshot(7);
    const base=s.save;s.save=async()=>({ok:false,error:'offline'});await s.mode('normal');
    assert.equal(s.adapter.mode.current,'normal');
    assert.equal(String(s.adapter.status || '').includes('专业编辑里的修改还没保存成功'), false);
    s.save=base;assert.equal((await s.flush()).ok,true);assert.equal(s.saved.length,1);
    assert.equal(s.saved[0].item.artifactId,'asset');
  });
}

test('E10 audio: older asynchronous decoding cannot overwrite the newer audio buffer',async t=>{
  const s=await mount(t,'audio');await s.enter();await s.dirty(1);
  const normal=globalThis.AudioContext;let finish;
  globalThis.AudioContext=class {decodeAudioData(){return new Promise(resolve=>finish=resolve)} async close(){}};
  t.after(()=>{globalThis.AudioContext=normal});
  await s.snapshot(3);assert.equal(typeof finish,'function');
  globalThis.AudioContext=normal;await s.dirty(2);await s.snapshot(8,2);
  await act(async()=>finish({duration:1,marker:3}));s.encoded.length=0;
  assert.equal((await s.flush()).ok,true);assert.deepEqual(s.encoded,[8]);
});
