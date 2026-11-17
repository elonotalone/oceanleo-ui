import './helpers/w1-jsdom-window.mjs';
import test from 'node:test';
import {compileModule,realModule} from './helpers/module-bench.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const fontsModule = await import('../src/shell/image-editor/editor-fonts.ts');
const { exportFrozenImageDocument } = await import('../src/shell/image-editor/image-document-contract.ts');
const { vectorSvgToSnapshot } = await import('../src/shell/image-editor/vector-svg-scene.ts');

function environment({ fail = false, gate = Promise.resolve() } = {}) {
  const events = [];
  class Face {
    constructor(family, source, descriptors) { Object.assign(this, {family, source, descriptors}); events.push(['face',family,source,descriptors]); }
    async load() { await gate; if (fail) throw Error('offline'); events.push(['loaded',this.family]); return this; }
  }
  const fonts = { add() {}, load: async (font,text) => { events.push(['check',font,text]); return [{}]; }, ready: Promise.resolve() };
  Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
  globalThis.FontFace = Face;
  return { events, fonts, FontFace: Face, timeoutMs: 10, clearFontCache() { events.push(['cache']); } };
}

test('FONT: SVG awaits fonts (including CSS inheritance and tspans) before Fabric first measures', async () => {
  let release; const env = environment({ gate: new Promise(r => {release = r;}) });
  let parsed = false;
  const fabric = { ...await import('fabric'), cache: { clearFontCache() {} }, loadSVGFromString: async () => {
    parsed = true;
    return { options: {width:100,height:100}, objects:[{toObject:()=>({type:'Text',text:'中文'})}] };
  }};
  const opening = vectorSvgToSnapshot(fabric, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><style>.title {font-family: Noto Serif SC; font-weight: 900;}</style><g class="title"><text x="0" y="20">中<tspan>文</tspan></text></g></svg>');
  await new Promise(r => setImmediate(r));
  assert.equal(parsed, false, 'SVG parsed before its fonts finished');
  release(); await opening;
  assert.ok(env.events.some(e => e[0] === 'face' && e[1] === 'Noto Serif SC'));
});

test('FONT: PNG/JPG/WebP wait for fonts and remeasure before reading pixels', async () => {
  for (const format of ['png','jpeg','webp']) {
    const env = environment();
    const text = {text:'中文', fontFamily:'Noto Sans SC', initDimensions() {env.events.push(['measure']);},setCoords(){}};
    const canvas = {getObjects:()=>[text],viewportTransform:[2,0,0,2,3,4],setViewportTransform(){},requestRenderAll(){},
      toCanvasElement() { env.events.push(['raster']); return {toBlob: callback => callback(new Blob(['pixels']))}; }};
    assert.ok(await exportFrozenImageDocument(canvas,{width:100,height:100},{format,quality:1,multiplier:1}));
    assert.ok(env.events.findIndex(e=>e[0]==='loaded') >= 0);
    assert.ok(env.events.findIndex(e=>e[0]==='measure') < env.events.findIndex(e=>e[0]==='raster'));
  }
});

test('FONT: offline or hung fonts fall back and still encode, without erasing saved family intent', async () => {
  const env = environment({fail:true});
  const text={text:'中文',fontFamily:'Noto Sans SC, sans-serif',initDimensions(){},setCoords(){}};
  const result = await fontsModule.withEditorFonts({getObjects:()=>[text]},async()=>42,env);
  assert.equal(result,42);
  assert.equal(text.fontFamily,'Noto Sans SC, sans-serif');
});

test('FONT: font assets are owned WOFF2 subsets with exact source hashes, license and weight axes', () => {
  const manifest = fontsModule.EDITOR_FONT_MANIFEST;
  assert.match(manifest.prefix ?? '', /^assets\/fonts\/noto\//);
  for(const font of manifest.fonts) {
    assert.match(font.sourceSha256 ?? '', /^[a-f0-9]{64}$/);
    assert.equal(font.licenseCode,'OFL-1.1');
    assert.ok(font.axes.wght[0]<=400 && font.axes.wght[2]>=900);
    for(const s of font.subsets) {assert.match(s.path,/\.woff2$/);assert.match(s.sha256,/^[a-f0-9]{64}$/);assert.match(s.unicodeRange,/^U\+/);}
    if(/ (SC|TC|JP|KR)$/.test(font.family)) assert.ok(font.subsets.length>10);
  }
});

test('FONT: project restore and detached publication preload before enlivening', () => {
  for(const [path,encoding] of [['fabric-controller-core.ts','this.canvas.loadFromJSON(snapshot.json'],['image-publication.ts','fabric.util.enlivenObjects']]) {
    const src=read('src/shell/image-editor/'+path);
    const start=src.indexOf(path==='fabric-controller-core.ts'?'private async restore(':'export async function renderImagePublication');
    const body=src.slice(start);
    assert.ok(body.indexOf('await prepareEditorFonts(')>=0, path+' missing preload');
    assert.ok(body.indexOf('await prepareEditorFonts(')<body.indexOf(encoding),path+' preloads too late');
  }
});

test('FONT: default text and signature use the pan-language Noto stacks', async () => {
  const {createTextbox,createSignatureText}=await import('../src/shell/image-editor/editor-objects.ts');
  class Text { constructor(text,options){this.text=text;Object.assign(this,options);} set(key,value){if(typeof key==='object')Object.assign(this,key);else this[key]=value;return this;} }
  const fabric={Textbox:Text,IText:Text};
  assert.equal(createTextbox(fabric,{width:100,height:100},'中文',0).fontFamily,fontsModule.NOTO_SANS_STACK);
  assert.equal(createSignatureText(fabric,{width:100,height:100},0).fontFamily,fontsModule.NOTO_SERIF_STACK);
});

test('FONT: 400/500/700/900 weights reach the selected text through the toolbar command', async () => {
  const {dispatchFabricImageCommand}=await import('../src/shell/image-editor/fabric-image-commands.ts');
  const patches=[]; const editor={selected:{id:'t'},layers:[{id:'t',locked:false}],selectLayer(){},setSelectedText:p=>patches.push(p)};
  for(const value of [400,500,700,900])dispatchFabricImageCommand(editor,{selectionId:'t',controlId:'font-weight',value});
  assert.deepEqual(patches,[400,500,700,900].map(fontWeight=>({fontWeight})));
});

test('FONT: subset selection follows the saved CSS stack, including regional Latin; no whole CJK download', async () => {
 const env=environment();
 await fontsModule.loadEditorTextFonts([{text:'NEW中文',fontFamily:'Noto Sans SC, sans-serif',fontWeight:900}],env);
 const faces=env.events.filter(e=>e[0]==='face');
 assert.ok(faces.length>0 && faces.length<10);
 assert.ok(faces.every(e=>e[1]==='Noto Sans SC' && /\.woff2/.test(e[2])));
 assert.ok(faces.every(e=>e[3].unicodeRange));
 assert.ok(env.events.some(e=>e[0]==='check' && e[1].startsWith('900 ')));
});

test('FONT: late network completion after timeout never installs a stale face', async () => {
 let release;const env=environment({gate:new Promise(r=>{release=r;})});
 let additions=0;env.fonts.add=()=>additions++;
 await assert.rejects(fontsModule.loadEditorTextFonts([{text:'中文',fontFamily:'Noto Sans SC'}],env),/字体/);
 release();await new Promise(r=>setTimeout(r,20));
 assert.equal(additions,0);
 await fontsModule.loadEditorTextFonts([{text:'中文',fontFamily:'Noto Sans SC'}],env);
 assert.ok(additions>0,'timed-out faces must be retryable');
});

test('FONT: public font URLs retain the existing CN/com/ws mapping and reject path escapes', async () => {
 const {resolvePublicFontAsset,PUBLIC_ASSET_ORIGIN}=await import('../src/lib/asset-delivery.ts');
 const key='assets/fonts/noto/version-v1/noto-sans-sc/001.woff2';
 assert.equal(resolvePublicFontAsset(key,'cn'),PUBLIC_ASSET_ORIGIN+'/'+key);
 for(const family of ['com','ws'])assert.equal(resolvePublicFontAsset(key,family),'https://assets.oceanleo.com/'+key);
 for(const bad of ['../private/a.woff2','https://evil.test/a.woff2','assets/fonts/noto/v1/../a.woff2'])assert.throws(()=>resolvePublicFontAsset(bad));
});

test('FONT: grouped text remeasures child bounds and parent layout before encoding', async () => {
 const env=environment(),events=[];
 const child={text:'中文',fontFamily:'Noto Sans SC',initDimensions(){events.push('text');},setCoords(){}};
 const group={getObjects:()=>[child],triggerLayout(){events.push('group');},setCoords(){}};
 await fontsModule.withEditorFonts({getObjects:()=>[group]},async()=>events.push('encode'),env);
 assert.deepEqual(events,['text','group','encode']);
 assert.equal(group.dirty,true);
});

test('FONT: default font source list keeps CDN mapping and an owned OSS fallback for new objects', async () => {
 const env=environment();
 await fontsModule.loadEditorTextFonts([{text:'中文',fontFamily:'Noto Sans SC'}],env);
 const faces=env.events.filter(e=>e[0]==='face');
 assert.ok(faces.length);
 for(const face of faces){assert.match(face[2],/assets\.oceanleo\.com\/assets\/fonts\/noto\//);assert.match(face[2],/oceanleo-assets\.oss-cn-guangzhou\.aliyuncs\.com\/assets\/fonts\/noto\//);}
});

test('FONT: persisted restore waits before loadFromJSON and remains usable offline', async () => {
 const {FabricEditorCore}=await import(await compileModule('src/shell/image-editor/fabric-controller-core.ts',{'./editor-fonts':realModule('src/shell/image-editor/editor-fonts.ts')}));
 const snapshot={json:{objects:[{type:'IText',text:'中文',fontFamily:'Noto Sans SC'}]},doc:{width:100,height:100},canvasBackground:'#fff'};
 let release;environment({gate:new Promise(r=>{release=r;})});
 const core=Object.create(FabricEditorCore.prototype),errors=[];let loaded=0;
 Object.assign(core,{fabric:await import('fabric'),canvas:{async loadFromJSON(){loaded++;},getObjects:()=>[],requestRenderAll(){}},
  currentSnapshot:snapshot,callbacks:{onError:error=>errors.push(error)},emit(){},resizeViewportForContainer(){},selectPreferredUnlockedImage(){}});
 const opening=core.loadSnapshot(snapshot);
 await new Promise(r=>setImmediate(r));assert.equal(loaded,0);assert.equal(core.restoring,true);
 release();assert.equal(await opening,true);assert.equal(core.restoring,false);assert.equal(loaded,1);
 environment({fail:true});assert.equal(await core.loadSnapshot(snapshot),true);assert.equal(loaded,2);assert.deepEqual(errors,[]);
});

test('FONT: clearing text formatting restores the editor Noto default', async()=>{
 const {CLEARED_TEXT_PROPS}=await import('../src/shell/image-editor/fabric-style-ops.ts');
 assert.equal(CLEARED_TEXT_PROPS.fontFamily,fontsModule.NOTO_SANS_STACK);
});
