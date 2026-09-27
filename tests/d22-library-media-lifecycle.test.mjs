import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvas = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvas] = previousCanvas;
else delete require.cache[canvas];
const { LibraryItemViewer } = await import(await compileModule("src/shell/library-viewers.tsx", {
  "../i18n/ui/useUI": dataModule('export function useUI(){ return value => value; }'),
  "./Markdown": dataModule('export function Markdown(){ return null; }'),
  "./WebsiteArtifactViewer": dataModule('export function WebsiteArtifactViewer(){ return null; }'),
  "./artifact-client": dataModule('export async function prepareArtifactForAction(){ return {ok:true,data:null}; } export async function refreshArtifactRendition(){ return {ok:true,data:null}; }'),
  "./material-detail-slot": dataModule('export function useMaterialDetailTarget(item){ return {status:"passthrough",item}; } export function MaterialDetailUnavailable(){return null;} export function GamePlayDetail(){return null;} export function gamePlayEmbedHref(){return "";}'),
  "./ArtifactRendition": dataModule(`
    export function useArtifactRendition(item){ return {url:item.url,loading:false,error:"",resourceFailed(){globalThis.__d22MediaErrors++;}}; }
    export function withResolvedRendition(item){return item;}
    export function ArtifactRenditionFailure(){return null;}
  `),
}));

async function fixture(kind, { active = true, strict = false, panel = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'https://p-test.dev.oceanleo.com/library' });
  const originals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  globalThis.__d22MediaErrors = 0;
  const states = new WeakMap();
  const events = [];
  const state = el => { if (!states.has(el)) states.set(el, { time: 0, ready: 0, duration: 30, paused: true, error: null }); return states.get(el); };
  const proto = dom.window.HTMLMediaElement.prototype;
  for (const [name, field] of [['currentTime','time'],['readyState','ready'],['duration','duration'],['paused','paused'],['error','error']]) {
    Object.defineProperty(proto, name, { configurable: true, get(){return state(this)[field];}, set(value){state(this)[field]=value;} });
  }
  proto.pause = function(){ events.push(['pause', this]); state(this).paused = true; };
  proto.play = function(){ events.push(['play', this]); state(this).paused = false; return Promise.resolve(); };
  proto.load = function(){ events.push(['load', this, this.getAttribute('src')]); state(this).ready = 0; state(this).time = 0; state(this).error = null; };
  const host = dom.window.document.createElement('section');
  if (panel) host.setAttribute('data-workspace-slot-panel', 'mine');
  host.setAttribute('data-workspace-slot-active', String(active));
  dom.window.document.body.append(host);
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(host);
  let item = { key: 'media-1', id: 'media-1', source: 'artifact', title: 'Sample', kind, url: `https://asset.oceanleo.com/sample.${kind === 'video' ? 'mp4' : 'mp3'}`, meta: {}, favorite: false };
  const render = async patch => { item = {...item, ...patch}; await act(async () => { const child = React.createElement(LibraryItemViewer, {item}); root.render(strict ? React.createElement(React.StrictMode, null, child) : child); }); };
  await render();
  const media = () => host.querySelector(kind);
  assert.ok(media(), '真实 LibraryItemViewer 必须渲染媒体');
  const toggle = async value => { await act(async () => {host.setAttribute('data-workspace-slot-active', String(value)); await Promise.resolve();}); };
  const metadata = async (el = media()) => { state(el).ready = 1; await act(async () => el.dispatchEvent(new dom.window.Event('loadedmetadata'))); };
  let unmounted = false;
  const unmount = async () => { if (!unmounted) { await act(async () => root.unmount()); unmounted = true; } };
  return { media, state, events, toggle, metadata, render, unmount, host, dom, url: item.url, async close(){ await unmount(); dom.window.close(); for(const [key, descriptor] of originals) { if(descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key]; } delete globalThis.__d22MediaErrors; } };
}

for (const kind of ['video','audio']) {
  test(`${kind}: 初始隐藏不加载，激活一次，重复通知不重载`, async () => {
    const f = await fixture(kind, {active:false});
    try {
      assert.equal(f.media().hasAttribute('src'), false, '隐藏库预览仍持有 src');
      assert.equal(f.events.length, 0);
      await f.toggle(true);
      assert.equal(f.media().getAttribute('src'), f.url);
      assert.equal(f.events.filter(e => e[0] === 'load').length, 1);
      await f.toggle(true);
      assert.equal(f.events.filter(e => e[0] === 'load').length, 1);
    } finally { await f.close(); }
  });
  test(`${kind}: 失活释放，恢复原位置且不自动播，不重复跳回`, async () => {
    const f = await fixture(kind);
    try {
      const el = f.media(); await f.metadata(); el.currentTime = 10.5; f.state(el).paused = false;
      const before = f.events.length;
      await f.toggle(false);
      assert.equal(el.hasAttribute('src'), false, '失活必须释放 src');
      assert.equal(el.paused, true);
      assert.deepEqual(f.events.slice(before).map(e=>[e[0],e[2]]), [['pause',undefined],['load',null]]);
      await f.toggle(false); assert.equal(f.events.length, before + 2);
      await f.toggle(true); await f.metadata();
      assert.equal(f.media(), el, '保留媒体 DOM 和库状态');
      assert.equal(el.currentTime, 10.5); assert.equal(el.paused, true);
      el.currentTime = 12; await f.metadata(); assert.equal(el.currentTime, 12, 'metadata 重复通知不应倒退');
      assert.equal(f.events.some(e=>e[0]==='play'), false);
    } finally { await f.close(); }
  });
  test(`${kind}: URL 刷新释放旧源并保留位置，换文件重置`, async () => {
    const f = await fixture(kind);
    try {
      const old = f.media(); await f.metadata(); old.currentTime = 8;
      const before = f.events.length;
      await f.render({url:f.url+'?refresh=2'});
      assert.ok(f.events.slice(before).some(e=>e[0]==='load' && e[2]===null), '换 URL 必须先释放旧源');
      await f.metadata(); assert.equal(f.media().currentTime, 8);
      await f.render({key:'media-2', id:'media-2', url:f.url+'?file=2'});
      await f.metadata(); assert.equal(f.media().currentTime, 0, '不同文件不能沿用位置');
    } finally { await f.close(); }
  });
  test(`${kind}: StrictMode 与卸载释放并断开监听`, async () => {
    const f = await fixture(kind, {strict:true});
    try {
      const el = f.media(); assert.equal(el.getAttribute('src'),f.url);
      await f.unmount(); assert.equal(el.hasAttribute('src'),false,'卸载仍持有 src');
      const count = f.events.length; await f.toggle(false); await f.toggle(true);
      assert.equal(f.events.length,count,'卸载后 observer 仍在工作');
    } finally { await f.close(); }
  });
  test(`${kind}: 主动清理不报错，真实媒体错误仍进入重签处理`, async () => {
    const f = await fixture(kind);
    try {
      const el = f.media();
      await act(async ()=>el.dispatchEvent(new f.dom.window.Event('error')));
      assert.equal(globalThis.__d22MediaErrors,0,'没有 MediaError 的清理事件不应触发重签');
      f.state(el).error={code:2,message:'network failed'};
      await act(async ()=>el.dispatchEvent(new f.dom.window.Event('error')));
      assert.equal(globalThis.__d22MediaErrors,1);
      await f.toggle(false);
      await act(async ()=>el.dispatchEvent(new f.dom.window.Event('error')));
      assert.equal(globalThis.__d22MediaErrors,1);
    } finally { await f.close(); }
  });
}
