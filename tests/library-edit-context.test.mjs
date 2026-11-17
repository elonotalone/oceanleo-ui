import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const targetStub = dataModule('export function pluginTargetForLibraryItem(item,editorId,editRevision){return {artifactId:item.artifactId,revisionId:item.revisionId,editorId,editRevision};}');
// compileModule is async; keep the dependency substitution explicit.
const rich = await import(await compileModule('src/shell/doc-editors/doc-family-commands.ts', {'../active-agent-file':targetStub}));
const image = await import(await compileModule('src/shell/image-editor/image-command-surface.ts', {'../active-agent-file':targetStub}));
const pdf = await import(await compileModule('src/shell/media-editors/pdf-command-surface.ts', {'../active-agent-file':targetStub}));
const grid = await import(await compileModule('src/shell/doc-editors/grid-univer/grid-command-surface.ts', {'../../active-agent-file':targetStub}));
const video = await import(await compileModule('src/shell/video-editor/video-command-surface.ts'));
const item = {id:'a',artifactId:'a',revisionId:'r1',title:'Workbook'};
const assertReadOnly = surface => { assert.equal(surface.run,undefined);assert.equal(surface.describe,undefined);assert.equal(typeof surface.selection,'function');assert.equal(typeof surface.agentContext,'function'); };
test('document selection keeps exact offsets and excerpt around the selected text',()=>{
 const calls=[];const editor={item,editRevision:7,loading:false,sourceReady:true,editor:{state:{selection:{empty:false,from:1500,to:1506},doc:{content:{size:5000},textBetween:(...args)=>{calls.push(args);return 'actual selected text'}}}}};
 const surface=rich.buildRichDocContext(editor);assertReadOnly(surface);assert.deepEqual(surface.selection(),{kind:'text',from:1500,to:1506});assert.match(JSON.stringify(surface.agentContext().content),/actual selected text/);assert.deepEqual(calls[0],[1500,1506,'\n']);
 editor.editor.state.selection.empty=true;assert.deepEqual(surface.selection(),{kind:'whole-file'});
});
test('deck context identifies active slide and element, without browser commands',()=>{
 const surface=rich.buildDeckContext({item,editRevision:5,loading:false,activeIndex:1,selectedElementId:'el-2',deck:{title:'Deck',slides:[{id:'s1'},{id:'s2',title:'Selected slide',elements:[{id:'el-2',text:'Edit this'}]}]}});
 assertReadOnly(surface);assert.deepEqual(surface.selection(),{kind:'slides',slideIds:['s2'],elementIds:['el-2']});assert.equal(surface.agentContext().content.slide.title,'Selected slide');
});
test('sheet context retains sheet identity, cell range, formulas and nearby values even far into the sheet',()=>{
 const range={startRow:499,endRow:500,startColumn:5,endColumn:6};
 const surface=grid.buildGridContext({item,revision:3,ready:true,selection:()=>({sheetId:'s2',range}),snapshot:()=>({sheets:{s1:{cellData:{0:{0:{v:'other sheet'}}}},s2:{name:'Budget',cellData:{0:{0:{v:'unrelated'}},499:{5:{v:21,f:'=SUM(F1:F499)'}}}}}})});
 assertReadOnly(surface);assert.deepEqual(surface.selection(),{kind:'cells',sheetId:'s2',range});const content=surface.agentContext().content;assert.equal(content.sheets.length,1);assert.deepEqual(JSON.parse(JSON.stringify(content.sheets[0].cells)),[{row:500,column:6,value:21,formula:'=SUM(F1:F499)'}]);
});
test('image selection carries object identity and region; excerpt excludes unselected objects and image bytes',()=>{
 const selected={id:'object-2',x:4,y:5,width:30,height:40};const surface=image.createImageContext({item,editor:{editRevision:1,sourceReady:true,loading:false,selected,captureRecovery:()=>({snapshot:{doc:{width:100,height:100},json:{objects:[{id:'object-1',text:'other'},{id:'object-2',text:'chosen',src:'private-bytes'}]}}})}});
 assertReadOnly(surface);assert.deepEqual(surface.selection(),{kind:'objects',objectIds:['object-2'],region:{x:4,y:5,width:30,height:40}});const encoded=JSON.stringify(surface.agentContext());assert.match(encoded,/chosen/);assert.doesNotMatch(encoded,/private-bytes|"other"/);
});
test('PDF selection preserves page, annotation and rectangular region without claiming full text',()=>{
 const surface=pdf.buildPdfContext({loading:false,currentPage:3,pageCount:5,editRevision:2,bridge:null,selected:{id:'ann-1',rect:{origin:{x:1,y:2},size:{width:30,height:40}}}},item);
 assertReadOnly(surface);assert.deepEqual(surface.selection(),{kind:'pdf',page:3,annotationIds:['ann-1'],region:{x:1,y:2,width:30,height:40}});assert.equal(surface.agentContext().content.pageCount,5);
});
test('timeline selection retains clip ids and playhead, with only selected clips in excerpt',()=>{
 const surface=video.createVideoContext({editor:{sourceReady:true,loadingSource:false,playheadMs:2500,selectedClipId:'c2',selected:{id:'c2'},doc:{tracks:[{id:'t',clips:[{id:'c1',text:'other'},{id:'c2',text:'chosen caption'}]}]}}});assertReadOnly(surface);assert.deepEqual(surface.selection(),{kind:'timeline',clipIds:['c2'],playheadMs:2500});assert.equal(surface.agentContext().content.tracks[0].clips.length,1);
});
test('all contexts are bounded valid JSON with explicit omission and credential redaction',async()=>{
 const {boundedAgentContent}=await import('../src/shell/plugin-command/bounded-agent-content.ts');const value={access_token:'secret',title:'Report',paragraphs:Array(100).fill('text'.repeat(1000))};value.cycle=value;const result=boundedAgentContent(value);assert.ok(result.ready);assert.ok(result.truncated);const text=JSON.stringify(result.content);assert.ok(text.length<=5500);assert.doesNotMatch(text,/secret/);assert.doesNotThrow(()=>JSON.parse(text));
});
test('new context registry has no mutating method and late unmount cannot remove the next editor',async()=>{
 const registry=await import('../src/shell/plugin-command/registry.ts');const a={editorId:'a'},b={editorId:'b',run:()=>{throw Error('must never escape')}};let notifications=0;const off=registry.subscribeEditorContext(()=>notifications++);const unmountA=registry.registerEditorContext(a);const unmountB=registry.registerEditorContext(b);unmountA();assert.equal(registry.currentEditorContext().editorId,b.editorId);assert.equal(registry.currentEditorContext().run,undefined);unmountB();assert.equal(registry.currentEditorContext(),null);off();assert.equal(notifications,3);assert.equal(registry.runPluginCommand,undefined);
});
test('old response mutation protocol and command parsers are absent from production sources',()=>{
 const paths=['src/lib/fn-agent.ts','src/lib/agent.ts','src/shell/FunctionAgentChat.tsx','src/shell/AgentChat.tsx','src/shell/plugin-command/registry.ts','src/shell/doc-editors/doc-family-commands.ts','src/shell/image-editor/image-command-surface.ts','src/shell/media-editors/pdf-command-surface.ts','src/shell/video-editor/video-command-surface.ts','src/shell/doc-editors/GridUniverStage.tsx'];for(const path of paths){const source=readFileSync(path,'utf8');assert.doesNotMatch(source,/oceanleo-editor-command|parseEditorCommandRequests|createEditorCommandSession|runGridAgentCommand|reportEditorCommandResult/,path)}
});
test('shared reload boundary remounts only on background revisions; engine readonly hooks cover all six editors',()=>{
 const host=readFileSync('src/shell/AdvancedContentWorkbench.tsx','utf8');assert.match(host,/useLibraryEditReload\(routeItem/);assert.match(host,/routeKey = .*aiReloadEpoch/);for(const file of ['RichDoc','Deck','Image','Pdf','VideoTimeline'])assert.match(readFileSync(`src/shell/advanced-routes/${file}Route.tsx`,'utf8'),/useLibraryEditReadOnly\(item\)/,file);assert.match(readFileSync('src/shell/doc-editors/GridUniverStage.tsx','utf8'),/sourceFailed \|\| aiReadOnly/);
});
test('new flow copy is registered in every locale without an untranslated fallback',async()=>{
 const {LOCALES}=await import('../src/i18n/config.ts');const source=readFileSync('src/shell/plugin-command/use-library-edit.tsx','utf8')+readFileSync('src/shell/plugin-command/LibraryEditEntry.tsx','utf8')+readFileSync('src/shell/plugin-command/library-edit-flow.ts','utf8');const keys=[...source.matchAll(/"([^"\n]*[\u4e00-\u9fff][^"\n]*)"/g)].map(match=>match[1]);for(const locale of LOCALES){const {default:dictionary}=await import(`../src/i18n/ui/messages/${locale}.ts`);for(const key of new Set(keys))assert.ok(dictionary[key],`${locale}: ${key}`)}
});
