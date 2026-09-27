// UC-3 / UC-6: docs/architecture/oceanleo-untrusted-content-isolation.md.
// This is a React/jsdom unit bench; it never loads Photopea or runs a browser.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import React, { act } from 'react';
import { compileModule } from './helpers/module-bench.mjs';
import { createPhotopeaSession } from '../src/shell/image-editor/photopea-session.ts';
import { persistPhotopeaDocument } from '../src/shell/advanced-routes/image-pro-handoff.ts';
import { PHOTOPEA_ORIGIN } from '../src/shell/image-editor/photopea-bridge.ts';
import { photopeaFrameSandbox } from '../src/shell/image-editor/photopea-mount.ts';
import { failedBackgroundSaveCount, retryAllFailed, snapshotBackgroundSaves, resetBackgroundSaverForTests } from '../src/shell/advanced-background-saver.ts';

const require=createRequire(import.meta.url);
const fabricRequire=createRequire(require.resolve('fabric/node'));
const canvas=fabricRequire.resolve('canvas');
const prior=require.cache[canvas];
require.cache[canvas]={id:canvas,filename:canvas,loaded:true,exports:{}};
const {JSDOM}=await import(pathToFileURL(fabricRequire.resolve('jsdom')).href);
if(prior) require.cache[canvas]=prior; else delete require.cache[canvas];
const dom=new JSDOM('<!doctype html><html><body></body></html>',{pretendToBeVisual:true,url:'https://image.dev.oceanleo.com/'});
for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,Event:dom.window.Event})) Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
test.after(()=>dom.window.close());
const {createRoot}=await import('react-dom/client');
const {ImagePhotopeaHost}=await import(await compileModule('src/shell/image-editor/ImagePhotopeaHost.tsx'));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64');
const original=`data:image/png;base64,${png.toString('base64')}`;
const bytes=(different=false)=>{const p=Uint8Array.from(png);if(different)p[45]^=1;return p.buffer;};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const settle=async()=>{await tick();await tick();};
const until=async(predicate)=>{
  const end=Date.now()+2000;
  while(!predicate() && Date.now()<end) await act(async()=>new Promise(resolve=>setTimeout(resolve,5)));
  assert.equal(Boolean(predicate()),true,'异步状态应在期限内完成');
};
const opened={key:'artifact:e11',id:'e11',source:'artifact',title:'Photopea',kind:'image',siteId:'image',favorite:false,artifactId:'e11',revisionId:'r1',artifactType:'single_file_image',artifact:{artifactId:'e11',revisionId:'r1',artifactType:'single_file_image'},meta:{}};
async function mount({save,recordSavedItem,timeout=2000,strict=false,item=opened}={}) {
  const calls=[];const saved=[];const scripts=[];
  const session=createPhotopeaSession({item,siteId:'image',recordSavedItem,exportTimeoutMs:timeout,onSaved:item=>saved.push(item),saveDocument:input=>persistPhotopeaDocument({...input,save:async args=>{calls.push(args);return save ? save(args) : {ok:true,item:{...item,revisionId:`r${calls.length+1}`},artifactId:item.artifactId,revisionId:`r${calls.length+1}`,url:'https://cdn.example/saved.png'};}})});
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  const content=React.createElement(ImagePhotopeaHost,{showPhotopea:true,session,documentDataUrl:original});
  await act(async()=>root.render(strict?React.createElement(React.StrictMode,null,content):content));
  const frame=[...document.querySelectorAll('[data-testid=image-photopea-frame]')].at(-1);
  assert.ok(frame);
  frame.contentWindow.postMessage=(script,origin)=>scripts.push({script,origin});
  const message=(data,origin=PHOTOPEA_ORIGIN,source=frame.contentWindow)=>window.dispatchEvent(new window.MessageEvent('message',{data,origin,source}));
  const reply=(data=bytes(true),index=scripts.length-1,origin=PHOTOPEA_ORIGIN,source=frame.contentWindow)=>{
    const script=scripts[index]?.script;
    assert.ok(script,'export script was sent');
    const marker=JSON.parse(script.match(/app\.echoToOE\(("[^"]+")\)/)[1]);
    message(marker,origin,source);message(data,origin,source);
  };
  message('done');
  let unmounted=false;
  const unmount=async()=>{if(unmounted)return;unmounted=true;await act(async()=>root.unmount());container.remove();await settle();};
  const finish=async()=>{await unmount();if(document.contains(frame)){reply();await settle();}await act(async()=>{resetBackgroundSaverForTests();});};
  const rerender=async()=>act(async()=>root.render(React.createElement(ImagePhotopeaHost,{showPhotopea:true,session,documentDataUrl:'data:image/png;base64,changed-projection'})));
  return {session,container,frame,calls,saved,scripts,message,reply,unmount,finish,rerender};
}

test('卸载中等待导出：保留同一个真实 iframe、同一个 window 和模块监听直到服务器回执',async()=>{
  let uploadDone;const bed=await mount({save:()=>new Promise(resolve=>{uploadDone=resolve;})});
  const parent=bed.frame.parentElement;const source=bed.frame.contentWindow;
  const leave=bed.session.leave();await bed.unmount();
  assert.equal(bed.container.isConnected,false,'React 树已卸载');
  assert.equal(document.contains(bed.frame),true);
  assert.equal(bed.frame.parentElement===parent,true,'不能移动 iframe 使浏览上下文重载');
  assert.equal(bed.frame.contentWindow===source,true,'不能 clone iframe 丢失编辑内容');
  bed.reply();await until(()=>bed.calls.length===1);
  assert.equal(bed.calls.length,1,'组件消失后回信仍然触发保存');
  assert.equal(document.contains(bed.frame),true,'服务器未确认前不能销毁 iframe');
  uploadDone({ok:true,item:{...opened,revisionId:'r2'},artifactId:'e11',revisionId:'r2',url:'https://cdn.example/new.png'});
  await leave;await until(()=>snapshotBackgroundSaves().length===0);
  assert.equal(document.contains(bed.frame),false);
  assert.equal(bed.saved[0].revisionId,'r2');
  assert.equal(bed.calls[0].item.artifactId,'e11');
  assert.equal(bed.calls[0].artifactRevision.artifactType,'single_file_image');
  assert.equal(snapshotBackgroundSaves().length,0);
  await bed.finish();
});

test('离开保存中更新素材投影不会重新显示正在冻结的 iframe',async()=>{
  const bed=await mount();const leaving=bed.session.leave();await bed.rerender();
  assert.equal(bed.frame.parentElement.style.visibility,'hidden');
  bed.reply();await leaving;await bed.finish();
});

test('UC-6：卸载后错误 origin 和错误 source 的回信均忽略',async()=>{
  const bed=await mount();await bed.unmount();
  bed.reply(bytes(true),0,'https://evil.example');
  bed.reply(bytes(true),0,PHOTOPEA_ORIGIN,window);
  await settle();assert.equal(bed.calls.length,0);
  bed.reply();await until(()=>bed.calls.length===1);
  await bed.finish();
});

test('换素材后旧图回信只写旧素材，新编辑器保持可用',async()=>{
  const old=await mount();await old.unmount();
  const fresh=await mount({item:{...opened,key:'artifact:e11-other',id:'e11-other',artifactId:'e11-other',artifact:{...opened.artifact,artifactId:'e11-other'}}});
  old.reply();await until(()=>!document.contains(old.frame));
  assert.equal(old.calls.length,1);assert.equal(old.calls[0].item.artifactId,'e11');
  assert.equal(fresh.calls.length,0);assert.equal(document.contains(fresh.frame),true);
  await fresh.unmount();fresh.reply();await until(()=>!document.contains(fresh.frame));
  assert.equal(fresh.calls[0].item.artifactId,'e11-other');await fresh.finish();await old.finish();
});

test('未修改原图直接关闭不会产生新版本',async()=>{
  const bed=await mount();await bed.unmount();bed.reply(bytes());await until(()=>!document.contains(bed.frame));
  assert.equal(bed.calls.length,0);assert.equal(document.contains(bed.frame),false);
  await bed.finish();
});

test('同一次保存并发调用共用回信；后续相同字节也不产生新版本',async()=>{
  const bed=await mount();const a=bed.session.save();const b=bed.session.save();
  assert.equal(a===b,true);assert.equal(bed.scripts.length,1);
  bed.reply();await a;assert.equal(bed.calls.length,1);
  assert.equal(bed.session.snapshot().phase,'unconfirmed','无 dirty 协议不得说最新已保存');
  const later=bed.session.leave();bed.reply();await later;
  assert.equal(bed.calls.length,1);await bed.finish();
});

test('关闭前已有可见面的导出：关闭后再取最终图片，覆盖上传中继续做的修改',async()=>{
  const bed=await mount();const earlier=bed.session.save();await bed.unmount();
  bed.reply(bytes());await earlier;await until(()=>bed.scripts.length===2);
  bed.reply(bytes(true));await until(()=>!document.contains(bed.frame));assert.equal(bed.calls.length,1);
  assert.equal(document.contains(bed.frame),false);await bed.finish();
});

test('导出超时留在专业面；关闭失败显示现有重试提示并可恢复',async()=>{
  const bed=await mount({timeout:30});
  await assert.rejects(bed.session.leave(),/还没确认保存/);
  assert.equal(document.contains(bed.frame),true);
  assert.equal(bed.frame.parentElement.style.visibility,'visible');
  assert.equal(bed.session.snapshot().phase,'error');
  await bed.unmount();await act(async()=>new Promise(resolve=>setTimeout(resolve,45)));
  assert.equal(failedBackgroundSaveCount(),1);
  assert.match(document.body.textContent,/还没保存上/);
  assert.ok(document.querySelector('[data-advanced-background-save-retry]'));
  let retry;await act(async()=>{retry=retryAllFailed();});
  // A late timed-out export must not satisfy the retry.
  bed.reply(bytes(true),0);await settle();assert.equal(bed.calls.length,0);
  bed.reply();await act(async()=>retry);
  assert.equal(failedBackgroundSaveCount(),0);assert.equal(bed.calls.length,1);
  await bed.finish();
});

for(const [name,data] of [['PSD',[0x38,0x42,0x50,0x53]],['未知',[1,2,3]]]) {
  test(`${name} 回信拒绝切回编辑，iframe 仍可继续操作`,async()=>{
    const bed=await mount();const result=bed.session.leave();bed.reply(Uint8Array.from(data).buffer);
    await assert.rejects(result,/可用的图片/);assert.equal(bed.calls.length,0);
    assert.equal(bed.frame.parentElement.style.visibility,'visible');
    const retry=bed.session.leave();bed.reply();await retry;await bed.finish();
  });
}

test('可见面保存失败后再编辑：重试必须重新导出，不能保存上次失败的旧字节',async()=>{
  let fail=true;
  const bed=await mount({save:async()=>fail?{ok:false,error:'服务器保存失败'}:{ok:true,item:{...opened,revisionId:'r2'},url:'https://cdn.example/new.png'}});
  const first=bed.session.leave();bed.reply();await assert.rejects(first,/服务器保存失败/);
  fail=false;
  const next=bed.session.leave();
  assert.equal(bed.scripts.length,2,'失败后重新可编辑，下一次离开必须重新导出');
  bed.reply(bytes());const result=await next;
  assert.equal(result.revisionId,'r1','用户撤回到原图，不得把旧失败图片存成新版本');
  assert.equal(bed.calls.length,1);await bed.finish();
});

test('服务器失败后关闭仍持有导出字节；后台重试无需重新打开 Photopea',async()=>{
  let fail=true;const bed=await mount({save:async()=>fail?{ok:false,error:'服务器保存失败'}:{ok:true,item:{...opened,revisionId:'r2'},url:'https://cdn.example/new.png'}});
  await bed.unmount();bed.reply();await until(()=>failedBackgroundSaveCount()===1);
  assert.equal(bed.session.snapshot().phase,'error');assert.equal(document.contains(bed.frame),true);
  fail=false;const count=bed.scripts.length;await act(async()=>retryAllFailed());
  assert.equal(bed.scripts.length,count);assert.equal(bed.calls.length,2);
  assert.equal(bed.calls[0].idempotencyKey,bed.calls[1].idempotencyKey);
  assert.equal(document.contains(bed.frame),false);await bed.finish();
});

test('后台会话回执失败可重试；图片不重复上传，成功才确认关闭',async()=>{
  let accepted=false;let recorded=0;
  const bed=await mount({recordSavedItem:async item=>{recorded++;assert.equal(item.revisionId,'r2');return accepted;}});
  await bed.unmount();bed.reply();await until(()=>failedBackgroundSaveCount()===1);
  assert.equal(bed.calls.length,1);assert.equal(bed.saved.length,0);
  accepted=true;await act(async()=>retryAllFailed());
  assert.equal(recorded,2);assert.equal(bed.calls.length,1);assert.equal(bed.saved.length,1);
  assert.equal(document.contains(bed.frame),false);await bed.finish();
});

test('页面隐藏/恢复仍保留编辑器，StrictMode 不重复创建 iframe 或保存',async()=>{
  const bed=await mount({strict:true});assert.equal(document.querySelectorAll('[data-testid=image-photopea-frame]').length,1);
  assert.equal(bed.calls.length,0);assert.equal(bed.scripts.length,0);
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
  await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));
  bed.reply();await until(()=>snapshotBackgroundSaves().length===0);assert.equal(bed.calls.length,1);assert.equal(document.contains(bed.frame),true);
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
  document.dispatchEvent(new window.Event('visibilitychange'));
  await bed.unmount();bed.reply();await until(()=>!document.contains(bed.frame));assert.equal(bed.calls.length,1);
  await bed.finish();
});

test('UC-3/UC-6：模块监听继续使用沙箱和精确 origin/source，React cleanup 不拆监听',()=>{
  const source=readFileSync('src/shell/image-editor/photopea-session.ts','utf8');
  const component=readFileSync('src/shell/image-editor/PhotopeaFrame.tsx','utf8');
  assert.match(source,/setAttribute\("sandbox", photopeaFrameSandbox\(\)\)/);
  assert.match(source,/isPhotopeaFrameSource\(event, frame\?\.contentWindow\)/);
  assert.match(source,/classifyPhotopeaMessage\(event\)/);
  assert.match(source,/postToPhotopea\(frame.contentWindow,[\s\S]*?PHOTOPEA_ORIGIN\)/);
  assert.equal(/cloneNode|appendChild\(frame\)/.test(source),false);
  assert.equal(/removeEventListener/.test(component),false);
  assert.equal(photopeaFrameSandbox().includes('allow-same-origin'),false);
});
