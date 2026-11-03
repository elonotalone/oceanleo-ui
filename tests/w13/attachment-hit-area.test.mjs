import { afterEach, beforeEach, describe, expect, test } from "vitest";
import React, { act } from "react";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { compileModule, dataModule } from "../helpers/module-bench.mjs";
import "../helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const require = createRequire(import.meta.url);
const reactURL = pathToFileURL(require.resolve("react")).href;
const stubs = {
  "../i18n/ui/useUI": dataModule("export function useUI(){return text=>text;}"),
  "../lib/attachment-url": dataModule("export function useAttachmentDisplayUrl(){return undefined;}"),
  "./WorkspaceLibrary": dataModule(`import {createElement as h} from ${JSON.stringify(reactURL)};
    export function WorkspaceLibrary({entries,onDetailOpenChange}){
      return h('div',{'data-local-viewer':true},
        h('img',{src:entries[0]?.libraryItem?.url}),
        h('button',{'data-close':true,onClick:()=>onDetailOpenChange(false)},'close'));
    }`),
};
const { UploadTile } = await import(/* @vite-ignore */ await compileModule("src/lib/upload/upload-tile.tsx", stubs));
const { AttachmentStrip } = await import(/* @vite-ignore */ await compileModule("src/shell/AttachmentStrip.tsx", stubs));
const { useTaskAttachmentOpener } = await import(/* @vite-ignore */ await compileModule("src/shell/task-attachment-open.ts", {
  "../i18n/ui/useUI": stubs["../i18n/ui/useUI"],
  "./SplitWorkspace": dataModule("export function useRightPaneSlot(){return null;}"),
  "./ResultCanvas": dataModule("export function ResultCanvas(){return null;}"),
  "./WorkspaceSession": dataModule("export function WorkspaceSessionProvider({children}){return children;}"),
  "./workspace-session-context": dataModule("export function useOptionalWorkspaceSession(){return null;}"),
  "./workbench-routes": dataModule("export function editorCapabilityFor(){return {available:false};}"),
  "./artifact-client": dataModule("export async function getArtifactItem(){throw Error('local preview must not fetch');}"),
}));

let roots = [], serial = 0, urls, revoked;
const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
const originalMatchMedia = window.matchMedia;
beforeEach(() => {
  urls = new Map(); revoked = [];
  URL.createObjectURL = file => { const url = `blob:w13c-${++serial}`; urls.set(url, file); return url; };
  URL.revokeObjectURL = url => { revoked.push(url); urls.delete(url); };
  window.matchMedia = () => ({matches:true,addEventListener(){},removeEventListener(){}});
});
afterEach(async () => {
  for (const app of roots.splice(0)) await app.close();
  URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  window.matchMedia = originalMatchMedia;
});
async function mount(element) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); let closed = false;
  const app = { container,
    async render(next) { await act(async () => root.render(next)); },
    async close() { if (closed) return; closed = true; await act(async () => root.unmount()); container.remove(); },
  };
  roots.push(app); await app.render(element); return app;
}
const h = React.createElement;
const file = (name = "fixture.png", type = "image/png") => new File([new Uint8Array([1,2,3])], name, {type});
const face = app => app.container.querySelector('[data-upload-tile] > button:not([data-upload-remove])');
const click = async element => act(async () => element.click());

// jsdom has no layout or native elementFromPoint. This explicit rectangular hit
// model uses the real rendered dimensions/offsets + the fixture's utility CSS.
// It checks component geometry/event wiring; V2 owns native browser acceptance.
function hitModel(tile) {
  const style = document.createElement("style");
  style.textContent = '.h-11{height:44px}.w-11{width:44px}'; document.head.append(style);
  const original = document.elementFromPoint;
  const size = parseFloat(tile.style.width);
  const remove = tile.querySelector('[data-upload-remove]');
  const css = window.getComputedStyle(remove);
  const width = parseFloat(css.width), height = parseFloat(css.height);
  const left = size - parseFloat(css.right) - width, top = parseFloat(css.top);
  const body = tile.querySelector('button:not([data-upload-remove])');
  document.elementFromPoint = (x, y) => {
    if (x >= left && x < left + width && y >= top && y < top + height) return remove;
    if (x >= 0 && x < size && y >= 0 && y < size) return body;
    return null;
  };
  return {width,height,left,top,size, restore(){ style.remove();
    if (original) document.elementFromPoint = original; else delete document.elementFromPoint;
  }};
}

describe("W13c attachment hit areas and pending preview", () => {
  test.each([[56,"hover"],[56,"focus"],[64,"hover"]])("%ipx %s leaves image center clickable and remove works", async (size, event) => {
    let opened = 0, removed = 0;
    const app = await mount(h(UploadTile, {name:"fixture.png",mime:"image/png",previewUrl:"blob:fixture",
      size,tt:s=>s,onOpen:()=>opened++,onRemove:()=>removed++}));
    const tile = app.container.querySelector('[data-upload-tile]');
    expect(Boolean(tile.querySelector('[data-upload-remove]'))).toBe(false);
    await act(async () => event === "focus" ? face(app).focus() : tile.dispatchEvent(new window.MouseEvent("mouseover",{bubbles:true})));
    expect(Boolean(tile.querySelector('[data-upload-remove]'))).toBe(true);
    const model = hitModel(tile);
    try {
      expect(model.width).toBe(44); expect(model.height).toBe(44);
      const center = document.elementFromPoint(size / 2, size / 2);
      expect(center?.getAttribute('aria-label')).toBe('fixture.png');
      await click(center); expect(opened).toBe(1); expect(removed).toBe(0);
      // All interior points except the visible top-right corner remain image.
      for (const [x,y] of [[1,1],[1,size-1],[size-1,size-1],[size/2,1],[size-1,size/2]]) {
        expect(document.elementFromPoint(x,y)?.hasAttribute('data-upload-remove')).toBe(false);
      }
      const remove = document.elementFromPoint(size,0);
      expect(remove?.getAttribute('aria-label')).toBe('移除');
      await click(remove); expect(removed).toBe(1); expect(opened).toBe(1);
    } finally { model.restore(); }
  });

  test("touch remove remains visible and calls the actual strip removal callback", async () => {
    window.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}});
    let removed;
    const app = await mount(h(AttachmentStrip,{attachments:[{id:'ready',name:'fixture.png',mime:'image/png',previewUrl:'blob:ready'}],onRemove:id=>{removed=id;}}));
    await click(app.container.querySelector('[data-upload-remove]')); expect(removed).toBe('ready');
    await app.render(h(AttachmentStrip,{attachments:[]}));
    expect(Boolean(app.container.querySelector('[data-upload-tile]'))).toBe(false);
  });

  // 2026-11-03 W2: the operator disallowed preview during compression/upload.
  // The former local-preview/handoff tests deliberately required that old behavior.
  test.each([['fixture.png','image/png'],['fixture.PNG','']])("compressing %s cannot open a viewer and releases its thumbnail", async (name,type) => {
    const original = file(name,type), shown = [], library = []; let open;
    function Host() {
      open = useTaskAttachmentOpener('oceanleo',target=>shown.push(target),action=>library.push(action));
      return h(AttachmentStrip,{attachments:[],pendingFiles:[original],onOpenAttachment:open});
    }
    const app = await mount(h(Host));
    expect(Boolean(app.container.querySelector('[data-upload-tile="compressing"]'))).toBe(true);
    expect(face(app)).toBe(null);
    expect(await open({id:'pending:blob:forged',name,type,previewUrl:'blob:forged'})).toBe(false);
    expect(shown).toEqual([]); expect(library).toEqual([]);
    await app.close(); expect(urls.size).toBe(0);
  });

  test("compression handoff never opens automatically; a ready tile opens by its stable identity", async () => {
    const original = file(), opened = [];
    const render = (attachments,pendingFiles) => h(AttachmentStrip,{attachments,pendingFiles,onOpenAttachment:att=>opened.push(att)});
    const app = await mount(render([], [original]));
    expect(face(app)).toBe(null);
    const uploading = {id:'stable-chip',name:'fixture.jpg',mime:'image/jpeg',previewUrl:'blob:uploaded',uploading:true};
    await app.render(render([uploading], []));
    expect(face(app)).toBe(null); expect(opened).toEqual([]); expect(urls.size).toBe(0);
    const ready = {...uploading, uploading:false};
    await app.render(render([ready], []));
    expect(opened).toEqual([]);
    await click(face(app)); expect(opened).toEqual([ready]);
  });

  test("same-name compression and upload chips never pick a preview by filename", async () => {
    const original = file(), opened = [];
    const old = {id:'old',name:'fixture.png',mime:'image/png',url:'blob:old'};
    const render = (attachments,pendingFiles) => h(AttachmentStrip,{attachments,pendingFiles,onOpenAttachment:att=>opened.push(att)});
    const app = await mount(render([old],[original]));
    expect(app.container.querySelector('[data-upload-tile="compressing"] button')).toBe(null);
    await app.render(render([old,{...old,id:'new1',uploading:true},{...old,id:'new2',uploading:true}],[]));
    expect(opened).toEqual([]); expect(urls.size).toBe(0);
    await click(face(app)); expect(opened).toEqual([old]);
  });

  test("local shared viewer cannot open while compressing; ready files retain the existing viewer", async () => {
    const app = await mount(h(AttachmentStrip,{attachments:[],pendingFiles:[file()]}));
    expect(face(app)).toBe(null);
    expect(app.container.querySelector('[data-local-viewer]')).toBe(null);
    await app.render(h(AttachmentStrip,{attachments:[{id:'ready',name:'fixture.png',mime:'image/png',url:'blob:ready'}]}));
    await click(face(app));
    expect(Boolean(app.container.querySelector('[data-local-viewer]'))).toBe(true);
    await click(app.container.querySelector('[data-close]'));
    expect(app.container.querySelector('[data-local-viewer]')).toBe(null);
    expect(urls.size).toBe(0);
  });

  test("pending non-image remains a non-clickable placeholder", async () => {
    const opened = [];
    const app = await mount(h(AttachmentStrip,{attachments:[],pendingFiles:[file('notes.pdf','application/pdf')],onOpenAttachment:att=>opened.push(att)}));
    expect(Boolean(app.container.querySelector('[data-upload-tile]'))).toBe(true);
    expect(Boolean(face(app))).toBe(false); expect(opened).toEqual([]); expect(urls.size).toBe(0);
  });
});
