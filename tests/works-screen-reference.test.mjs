// UC-NONE: controlled media geometry and optional screenshot handling in jsdom, no device/browser capture.
import assert from "node:assert/strict";
import test from "node:test";
import React,{act} from "react";
import "./helpers/w1-jsdom-window.mjs";
import {compileModule,dataModule} from "./helpers/module-bench.mjs";
const {createRoot}=await import("react-dom/client");globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {WebsitePreviewPicker}=await import(await compileModule("src/shell/website-platform/WebsitePreviewPicker.tsx",{
 "./website-preview-i18n":dataModule('export function useWebsiteUI(){return s=>s;}'),
 "../advanced-layout-context":dataModule('export function useAdvancedLayout(){return null;}'),
 "../SplitWorkspace":dataModule('export function useConsoleAgentFocus(){return null;}'),
 "./website-preview-reference":dataModule('export async function insertPreviewReferenceWhenReady(ref){globalThis.__uwReference=ref;return "inserted";}'),
}));
test("screen picker uses the contained picture’s native coordinates and grabs its existing video frame",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const video=document.createElement("video");
 Object.defineProperties(video,{videoWidth:{value:1920},videoHeight:{value:1080}});video.getBoundingClientRect=()=>({left:100,top:100,width:800,height:600});
 const originalContext=window.HTMLCanvasElement.prototype.getContext,originalBlob=window.HTMLCanvasElement.prototype.toBlob,originalFile=globalThis.File;const draws=[];
 window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(...args){draws.push(args);}});window.HTMLCanvasElement.prototype.toBlob=cb=>cb(new Blob(["pixel"],{type:"image/png"}));globalThis.File=window.File;
 try{
  await act(async()=>root.render(React.createElement(WebsitePreviewPicker,{workId:"w1",source:"screen",picture:()=>video,onClose(){}})));
  const picker=host.querySelector('[aria-label="指位置给 agent"]');
  // Top letterbox starts at 100px; the actual picture starts at 175px.
  await act(async()=>picker.dispatchEvent(new window.MouseEvent("click",{bubbles:true,clientX:300,clientY:125})));assert.equal(draws.length,0);
  await act(async()=>picker.dispatchEvent(new window.MouseEvent("click",{bubbles:true,clientX:300,clientY:325})));
  const ref=globalThis.__uwReference;assert.equal(ref.source,"screen");assert.equal(ref.workId,"w1");assert.equal(ref.x,480);assert.equal(ref.y,360);assert.equal(ref.width,1920);assert.equal(ref.height,1080);assert.equal(ref.screenshot.type,"image/png");assert.equal(draws[0][0],video);
 }finally{await act(async()=>root.unmount());host.remove();window.HTMLCanvasElement.prototype.getContext=originalContext;window.HTMLCanvasElement.prototype.toBlob=originalBlob;globalThis.File=originalFile;}
});
