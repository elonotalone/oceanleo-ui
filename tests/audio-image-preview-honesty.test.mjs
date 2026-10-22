import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// 2026-10-22 U5: audio item 6cf6ec0a — the editor-saved revision has only a PNG
// `preview` (no `full` audio). The viewer used to hand that PNG to <audio>, which
// can never decode it, and the failure ladder then told the user the resource
// "本身取不到". It must not mount <audio> for a non-media rendition.

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvas = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvas] = previousCanvas;
else delete require.cache[canvas];

const mod = await import(await compileModule("src/shell/library-viewers.tsx", {
  "../i18n/ui/useUI": dataModule("export function useUI(){ return value => value; }"),
  "./Markdown": dataModule("export function Markdown(){ return null; }"),
  "./WebsiteArtifactViewer": dataModule("export function WebsiteArtifactViewer(){ return null; }"),
  "./artifact-client": dataModule("export async function prepareArtifactForAction(){ return {ok:true,data:null}; } export async function refreshArtifactRendition(){ return {ok:true,data:null}; }"),
  "./material-detail-slot": dataModule('export function useMaterialDetailTarget(item){ return {status:"passthrough",item}; } export function MaterialDetailUnavailable(){return null;} export function GamePlayDetail(){return null;} export function gamePlayEmbedHref(){return "";}'),
  "./ArtifactRendition": dataModule(`
    export function useArtifactRendition(item){
      const mediaType = globalThis.__renditionMediaType;
      return {url:item.url,purpose:"preview",rendition:mediaType===undefined?null:{purpose:"preview",mediaType,url:item.url},loading:false,error:"",resourceFailed(){globalThis.__mediaErrors++;}};
    }
    export function withResolvedRendition(item){return item;}
    export function ArtifactRenditionFailure(){return null;}
  `),
}));
const { LibraryItemViewer, renditionIsPlayableMedia } = mod;

test("renditionIsPlayableMedia: only explicit non-media types are refused", () => {
  assert.equal(renditionIsPlayableMedia("audio/mpeg"), true);
  assert.equal(renditionIsPlayableMedia("application/ogg"), true);
  assert.equal(renditionIsPlayableMedia(""), true);
  assert.equal(renditionIsPlayableMedia(undefined), true);
  assert.equal(renditionIsPlayableMedia("image/png"), false);
  assert.equal(renditionIsPlayableMedia("application/json"), false);
  assert.equal(renditionIsPlayableMedia("text/html"), false);
});

async function mount(mediaType) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://p-test.dev.oceanleo.com/library" });
  const originals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  globalThis.__renditionMediaType = mediaType;
  globalThis.__mediaErrors = 0;
  dom.window.HTMLMediaElement.prototype.load = function () {};
  dom.window.HTMLMediaElement.prototype.pause = function () {};
  const host = dom.window.document.createElement("section");
  dom.window.document.body.append(host);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host);
  const item = { key: "a-1", id: "a-1", source: "artifact", title: "The Accident", kind: "audio", url: "https://asset.oceanleo.com/preview.png", meta: {}, favorite: false };
  await act(async () => root.render(React.createElement(LibraryItemViewer, { item })));
  return {
    host,
    async close() {
      await act(async () => root.unmount());
      dom.window.close();
      for (const [key, d] of originals) { if (d) Object.defineProperty(globalThis, key, d); else delete globalThis[key]; }
      delete globalThis.__renditionMediaType;
      delete globalThis.__mediaErrors;
    },
  };
}

test("audio item whose selected rendition is image/png never mounts <audio>", async () => {
  const f = await mount("image/png");
  try {
    assert.equal(f.host.querySelector("audio"), null, "PNG 不能喂给 <audio>");
    const note = f.host.querySelector("[data-audio-no-playable-rendition]");
    assert.ok(note, "必须说明这一版没有可播放音频");
    assert.match(note.textContent, /没有可直接播放的音频文件/);
    assert.doesNotMatch(note.textContent, /取不到|打不开/);
    assert.equal(globalThis.__mediaErrors, 0);
  } finally { await f.close(); }
});

test("audio item with an audio/mpeg rendition still gets the player", async () => {
  const f = await mount("audio/mpeg");
  try {
    assert.ok(f.host.querySelector("audio"));
    assert.equal(f.host.querySelector("[data-audio-no-playable-rendition]"), null);
  } finally { await f.close(); }
});
