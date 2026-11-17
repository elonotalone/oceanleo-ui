import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {zipSync,strToU8} from 'fflate';
import {compileModule,dataModule} from './helpers/module-bench.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const mod=await import(await compileModule('src/shell/attachment-file-viewer.tsx',{
 '../i18n/ui/useUI':dataModule('export const useUI=()=>s=>s;'),
 '../lib/media-proxy':dataModule('export async function fetchMediaBlobRefreshing(url){if(!globalThis.__fileBlobs[url])throw new Error("offline");return globalThis.__fileBlobs[url];}'),
}));
const base={key:'file',id:'file',source:'creation',title:'File',kind:'file',siteId:'',favorite:false,meta:{}};
async function mount(item,mode,url){const host=document.createElement('div'),root=createRoot(host);await act(async()=>{root.render(React.createElement(mod.AttachmentFileViewer,{item,mode,url}));});return {host,root,close:()=>act(async()=>root.unmount())};}
async function settle(check){for(let i=0;i<40&&!check();i++)await act(async()=>new Promise(r=>setTimeout(r,5)));assert.ok(check());}
test('source code has visible line numbers and HTML stays inert text',async()=>{
 globalThis.__fileBlobs={'/text':new Blob(['<script>globalThis.pwned=true</script>\nline two'])};
 const b=await mount({...base,meta:{filename:'app.ts'}},'text','/text');try{
 await settle(()=>b.host.querySelector('code'));assert.match(b.host.textContent,/globalThis.pwned=true/);assert.equal(b.host.querySelector('script'),null);assert.equal(globalThis.pwned,undefined);
 assert.equal(b.host.querySelector('code span[aria-hidden]').textContent,'1');
 }finally{await b.close();}
});
test('notebook preview includes cell source only',()=>{
 assert.equal(mod.previewText(JSON.stringify({cells:[{cell_type:'code',source:['print(1)\n'],outputs:[{data:{'text/html':'<script>bad()</script>'}}]}]}),'sample.ipynb'),'# 1 [code]\nprint(1)\n');
});
test('ZIP tree opens text/images inline and offers binary file download',async()=>{
 const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64'));
 const archive=new Blob([zipSync({'note.txt':strToU8('inside archive'),'picture.png':png,'binary.bin':new Uint8Array([0,1,2])})]);
 globalThis.__fileBlobs={'/tree':new Blob([JSON.stringify({entries:[{name:'note.txt',size:14},{name:'picture.png',size:png.length},{name:'binary.bin',size:3}]})]),'/archive':archive};
 const b=await mount({...base,url:'/archive',meta:{filename:'archive.zip'}},'tree','/tree');try{
 await settle(()=>b.host.querySelector('[data-tree-path="note.txt"]'));
 await act(async()=>b.host.querySelector('[data-tree-path="note.txt"]').click());await settle(()=>b.host.textContent.includes('inside archive'));
 await act(async()=>b.host.querySelector('[data-tree-path="picture.png"]').click());await settle(()=>b.host.querySelector('[data-file-kind="image"] img'));
 await act(async()=>b.host.querySelector('[data-tree-path="binary.bin"]').click());await settle(()=>b.host.querySelector('[data-file-kind="binary"] button'));
 assert.equal(b.host.querySelector('[data-file-kind="binary"] button').textContent,'下载');
 }finally{await b.close();}
});
test('unknown format shows name, size, format, download without alert',async()=>{
 const node=document.createElement('div'),root=createRoot(node);await act(async()=>root.render(React.createElement(mod.DownloadOnlyFileCard,{item:{...base,title:'Design.indd',url:'/original',meta:{format:'indd',bytes:2048}}})));
 assert.match(node.textContent,/Design.indd/);assert.match(node.textContent,/INDD · 2.0 KB/);assert.equal(node.querySelector('a').getAttribute('href'),'/original');assert.equal(node.querySelector('[role="alert"]'),null);
 await act(async()=>root.unmount());
});
