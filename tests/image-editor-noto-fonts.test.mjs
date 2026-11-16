import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const load = () => import('../src/shell/image-editor/editor-fonts.ts');
test('font choices are Noto families with every required script and four real weights', async () => {
  const { EDITOR_FONT_MANIFEST, EDITOR_FONT_OPTIONS } = await load();
  assert.equal(EDITOR_FONT_OPTIONS.length, 2);
  for (const name of ['Noto Sans','Noto Serif','Noto Sans SC','Noto Sans TC','Noto Sans JP','Noto Sans KR','Noto Sans Arabic','Noto Sans Devanagari','Noto Sans Thai']) {
    const spec = EDITOR_FONT_MANIFEST.fonts.find(f => f.family === name);
    assert.deepEqual(spec.weights, [400,500,700,900]);
    assert.match(spec.source, /raw.githubusercontent.com\/google\/fonts\/[a-f0-9]{40}\/ofl\//);
  }
  const picker = readFileSync(new URL('../src/shell/AdvancedFontPicker.tsx', import.meta.url),'utf8');
  assert.match(picker, /EDITOR_FONT_OPTIONS/);
  assert.doesNotMatch(picker, /family: "(?:Inter|Aptos|PingFang|KaiTi|Georgia|Arial|Courier|Segoe)/);
});
test('loading waits, checks FontFaceSet results, retries failure and loads mixed script runs', async () => {
  const { loadEditorTextFonts } = await load();
  const calls=[]; let release; let finish;
  const gate=new Promise(r=>{release=r;});
  const fonts={add:f=>calls.push(['add',f.family]),load:async(f,text)=>{calls.push(['load',f,text]);return [{}];},ready:gate};
  class Face { constructor(family,url,desc){Object.assign(this,{family,url,desc});} async load(){calls.push(['face',this.family]);return this;} }
  const task=loadEditorTextFonts([{text:'Hello 中文 العربية हिन्दी ไทย',fontFamily:'Noto Sans SC, sans-serif',fontWeight:900}], {fonts,FontFace:Face});
  task.then(()=>{finish=true;});
  await new Promise(r=>setImmediate(r));
  assert.equal(finish,undefined);
  release(); await task;
  for(const name of ['Noto Sans','Noto Sans SC','Noto Sans Arabic','Noto Sans Devanagari','Noto Sans Thai']) assert.ok(calls.some(c=>c[0]==='face' && c[1]===name),name);
  const broken={...fonts,ready:Promise.resolve(),load:async()=>[]};
  await assert.rejects(loadEditorTextFonts([{text:'abc',fontFamily:'Noto Sans'}],{fonts:broken,FontFace:Face}),/字体/);
  broken.load=async()=>[{}];
  await loadEditorTextFonts([{text:'abc',fontFamily:'Noto Sans'}],{fonts:broken,FontFace:Face});
});
test('export gate finishes font loading and invalidates Fabric metrics before encoding', async () => {
  const { withEditorFonts } = await load();
  const calls=[];
  const node={text:'abc',fontFamily:'Noto Sans',fontWeight:700,initDimensions:()=>calls.push('measure'),setCoords:()=>calls.push('coords')};
  const fonts={add:()=>{},ready:Promise.resolve(),load:async()=>{calls.push('font');return [{}];}};
  class Face {async load(){return this;}}
  const result=await withEditorFonts({getObjects:()=>[node]},async()=>{calls.push('encode');return 12;},{fonts,FontFace:Face,clearFontCache:()=>calls.push('cache')});
  assert.equal(result,12); assert.ok(calls.indexOf('cache')<calls.indexOf('measure')); assert.ok(calls.indexOf('font')<calls.indexOf('measure')); assert.ok(calls.indexOf('measure')<calls.indexOf('encode'));
});
test('font requests time out and do not leave a picker waiting forever', async () => {
  const { loadEditorTextFonts }=await load();
  const fonts={add:()=>{},load:async()=>[{}],ready:Promise.resolve()};
  class Face {load(){return new Promise(()=>{});}}
  await assert.rejects(Promise.race([
    loadEditorTextFonts([{text:'abc',fontFamily:'Noto Sans'}],{fonts,FontFace:Face,timeoutMs:5}),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('missing timeout')),60)),
  ]),/字体/);
});
test('new font labels and failures have all sixteen non-Chinese translations', async () => {
  const {EDITOR_NOTO_FONT_COPY}=await import('../src/i18n/ui/messages/editor-noto-font-copy.ts');
  assert.equal(Object.keys(EDITOR_NOTO_FONT_COPY).length,16);
  for(const [locale,copy] of Object.entries(EDITOR_NOTO_FONT_COPY))for(const key of ['思源黑体','思源宋体','字体加载失败，请检查网络后重试。'])assert.ok(copy[key]?.trim(),`${locale}:${key}`);
});
