import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { blankWebsiteSource } from "../src/shell/website-local/blank-website-source.ts";
import { buildPluginPages, hasProPage } from "../src/shell/plugin-chrome/plugin-pages.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previous = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previous) require.cache[canvasEntry] = previous; else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/library", pretendToBeVisual: true });
for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node })) Object.defineProperty(globalThis, name, { configurable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ui = dataModule('const tt = text => text; export function useUI() { return tt; }');
const shell = dataModule('import React from "' + pathToFileURL(require.resolve('react')).href + '"; export function AdvancedWorkbenchShell({adapter}) { return React.createElement("main", null, adapter.stage); }');
const io = dataModule('export async function fetchMediaBlob() { return globalThis.__websiteRead(); }');
const refresh = dataModule('export async function refreshArtifactRendition() { throw new Error("unexpected write/refresh"); }');
const runtime = dataModule('export function WebsiteMaterialRuntimePreview({projectId}) { return "runtime:" + projectId; }');
const siteLoad = dataModule('export class SiteImageResolver { url(path) {return path;} subscribe(){return ()=>{};} snapshot(){return 0;} } export async function loadSiteDoc(_identity, envelope) {return envelope.entry;}');
const { WebsiteLocalRoute } = await import(await compileModule("src/shell/advanced-routes/WebsiteLocalRoute.tsx", {
  "../../i18n/ui/useUI": ui, "../AdvancedWorkbenchShell": shell,
  "../../lib/media-proxy": io, "../artifact-client": refresh,
  "../website-local/WebsiteMaterialRuntimePreview": runtime,
  "../website-local/website-site-load": siteLoad,
}));
const button = (container, text) => [...container.querySelectorAll('button')].find(entry => entry.textContent === text);
async function settle() { for (let i = 0; i < 5; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }
async function mount(item) {
 const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
 await act(async () => root.render(React.createElement(WebsiteLocalRoute, { item, onClose(){} })));
 return { container, async close(){ await act(async()=>root.unmount()); container.remove(); } };
}

// Hooks/runtime proof: mount the real changed route and viewer through loading,
// successful remote hydration, preview/source clicks, failure and explicit retry.
test("website source loads, shows rendered pages and escaped read-only source, and reloads failures", async () => {
 const errors = []; const oldError = console.error; console.error = (...args) => errors.push(args.join(' '));
 try {
  let finish; globalThis.__websiteRead = () => new Promise(resolve => { finish = resolve; });
  const source = blankWebsiteSource('Viewer source'); source.navigation.brand = 'Viewer source';
  const item = { key:'website:1', id:'1', title:'Viewer source', artifactId:'a1', revisionId:'r1', meta:{}, artifact:{renditions:{source:{url:'/v1/source/1'}}} };
  const view = await mount(item);
  assert.match(view.container.textContent, /正在读取/);
  await act(async () => finish(new Blob([JSON.stringify(source)]))); await settle();
  assert.match(view.container.textContent, /Viewer source/);
  assert.ok(view.container.querySelector('section'));
  assert.equal(view.container.querySelector('script, [contenteditable], textarea'), null);
  assert.deepEqual([...view.container.querySelectorAll('[role="tab"]')].map(x=>x.textContent), ['预览','源码']);
  await act(async () => button(view.container,'源码').click());
  assert.match(view.container.querySelector('pre code').textContent, /Viewer source/);
  assert.equal(view.container.querySelector('script, textarea'), null);
  await act(async () => button(view.container,'预览').click()); assert.ok(view.container.querySelector('section'));
  await view.close();
  globalThis.__websiteRead = async () => { throw new Error('HTTP 403'); };
  const failed = await mount({...item, key:'website:2'}); await settle();
  assert.match(failed.container.textContent,/HTTP 403/);
  globalThis.__websiteRead = async () => new Blob([JSON.stringify(source)]);
  const retry = [...failed.container.querySelectorAll('button')].find(x=>/重新|重试/.test(x.textContent)); assert.ok(retry);
  await act(async()=>retry.click()); await settle(); assert.ok(failed.container.querySelector('section'));
  await failed.close();
  assert.deepEqual(errors, []);
 } finally { console.error = oldError; }
});

test("stored site documents render real sections and code manifests use material preview mode", async () => {
 const doc = { siteName:'Real site', pages:[{ name:'Home', sections:[{id:'hero',type:'hero',content:{title:'Real heading',body:'<script>untrusted</script>'},style:{}}]}] };
 const site = await mount({key:'site:3',id:'3',title:'Site',meta:{},content:JSON.stringify(doc)}); await settle();
 assert.match(site.container.textContent,/Real heading/); assert.ok(site.container.querySelector('[data-testid="website-site-frame"]'));
 assert.equal(site.container.querySelector('[contenteditable],script'),null);
 await act(async()=>button(site.container,'源码').click()); assert.match(site.container.querySelector('code').textContent,/Real heading/); await site.close();
 const projectId='f75afb8a-954f-40bb-8bf8-d87689aefd50';
 const code=await mount({key:'code:4',id:'4',title:'Code',meta:{},content:JSON.stringify({projectSchema:'oceanleo.website-project.v1',projectId,files:[]})}); await settle();
 assert.match(code.container.textContent,new RegExp('runtime:'+projectId)); await code.close();
});

test("advanced pages and exports are gone; website loses pro editing while grid/PDF retain it", () => {
 for (const path of ['src/shell/AdvancedFeaturePages.tsx','src/shell/advanced-drafts.ts','src/shell/website-local/WebsitePuckStage.tsx','src/shell/website-local/WebsiteSiteWorkbench.tsx']) assert.equal(existsSync(path),false,path);
 assert.doesNotMatch(readFileSync('src/shell/index.ts','utf8'), /AdvancedFeatureCatalog|AdvancedFeatureRoute/);
 assert.equal(hasProPage('website'),false); assert.equal(hasProPage('grid'),true); assert.equal(hasProPage('pdf'),true);
 assert.deepEqual(buildPluginPages({pluginId:'website'}).map(page=>page.label),['预览']);
});

const runtimeApi = dataModule('export const websiteRuntimeApi = { async get(){return globalThis.__runtime;} };');
const picker = dataModule('export function WebsitePreviewPicker(){return "agent-reference-picker";}');
const { WebsiteMaterialRuntimePreview, isolatedWebsitePreviewUrl } = await import(await compileModule('src/shell/website-local/WebsiteMaterialRuntimePreview.tsx', {
 '../../api/website-runtime':runtimeApi, '../../i18n/ui/useUI':ui, '../website-platform/WebsitePreviewPicker':picker,
}));

test("UC-1/UC-3 material runtime stays isolated and retains point-to-agent reference", async () => {
 // docs/architecture/oceanleo-untrusted-content-isolation.md: user code never
 // receives the host origin or scripted same-origin access.
 const source = readFileSync('src/shell/website-local/WebsiteMaterialRuntimePreview.tsx','utf8');
 assert.match(source,/sandbox="allow-forms allow-modals allow-popups allow-presentation allow-scripts"/);
 assert.doesNotMatch(source,/allow-same-origin|srcDoc|dangerouslySetInnerHTML/);
 assert.equal(isolatedWebsitePreviewUrl('https://p1.oceanleo.app/?__oceanleo_owner=t'),'https://p1.oceanleo.app/?__oceanleo_owner=t');
 for(const raw of ['https://oceanleo.com','https://oceanleo.app','https://evil.oceanleo.app.evil.test','http://p1.oceanleo.app','https://user:pass@p1.oceanleo.app']) assert.equal(isolatedWebsitePreviewUrl(raw),'');
 globalThis.__runtime = { state:'running',preview_url:'https://p1.oceanleo.app/?__oceanleo_owner=t',node_id:'n1',started_at:'1' };
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 await act(async()=>root.render(React.createElement(WebsiteMaterialRuntimePreview,{projectId:'p1'})));await settle();
 assert.ok(container.querySelector('iframe')); assert.equal(container.querySelector('iframe').getAttribute('referrerpolicy'),'no-referrer');
 assert.doesNotMatch(container.textContent,/Dashboard|Database|Settings|专业编辑|仪表盘|数据库|设置/);
 await act(async()=>button(container,'点选元素').click()); assert.match(container.textContent,/agent-reference-picker/);
 await act(async()=>root.unmount());container.remove();
});

const fileApi=dataModule('export const websitePlatformApi={async files(){return {files:[{path:"index.html"},{path:"app.js"}]};},async file(_id,path){return {content: path === "index.html" ? "<script>website source</script>" : "console.log(1)"};}};export function websiteFileText(file){return {text:file.content,binary:false};}');
const { WebsiteCodeSourceViewer }=await import(await compileModule('src/shell/website-local/WebsiteCodeSourceViewer.tsx',{'../../lib/website-platform-api':fileApi,'../../i18n/ui/useUI':ui}));
test("code source view reads and switches real source files as escaped text",async()=>{
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 await act(async()=>root.render(React.createElement(WebsiteCodeSourceViewer,{projectId:'p1'})));await settle();
 assert.equal(container.querySelector('code').textContent,'<script>website source</script>');assert.equal(container.querySelector('script,textarea,[contenteditable]'),null);
 const select=container.querySelector('select');await act(async()=>{select.value='app.js';select.dispatchEvent(new window.Event('change',{bubbles:true}));});await settle();
 assert.equal(container.querySelector('code').textContent,'console.log(1)');
 await act(async()=>root.unmount());container.remove();
});

test("typed material share links point to the common Library and pin the revision", async()=>{
 const { libraryItemHref, advancedFeatureHref } = await import('../src/shell/advanced-features.ts');
 const item={id:'item-1',artifactId:'artifact-1',revisionId:'rev-1',meta:{}};
 assert.equal(libraryItemHref(item),'/library?item=artifact-1&revisionId=rev-1');
 assert.equal(advancedFeatureHref('website_finetuning',{item}),'/library?item=artifact-1&revisionId=rev-1');
 assert.equal(advancedFeatureHref('document_editing'),'/library');
});
