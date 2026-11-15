// UC-NONE: jsdom mount with a replacement remote panel; no real computer, consent grant, billing or media request.
import assert from "node:assert/strict";
import test from "node:test";
import React,{act} from "react";
import * as ReactDOM from "react-dom";
import "./helpers/w1-jsdom-window.mjs";
import {compileModule,dataModule} from "./helpers/module-bench.mjs";
const {createRoot}=await import("react-dom/client");globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__uwScreenReact=React;globalThis.__uwScreenDOM=ReactDOM;
const {WorkScreenPreview}=await import(await compileModule("src/shell/works-workbench/WorkScreenPreview.tsx",{
 "../website-platform/website-preview-i18n":dataModule('export function useWebsiteUI(){return s=>s;}'),
 "../../pages/devices/use-device-cloud-agent":dataModule('export function useDeviceCloudAgent(id){globalThis.__uwConsentId=id;return {consent:"ask",agent:{text:"AI is working"}};}'),
 "../../api/device-settings":dataModule('export const deviceSettingsClient={};'),
 "../../pages/RemoteDesktopPanel":dataModule('export function RemoteDesktopPanel(props){globalThis.__uwScreenProps=props;return globalThis.__uwScreenDOM.createPortal(globalThis.__uwScreenReact.createElement("div",{"data-oceanleo-remote-desktop":""},"Existing billing and consent notice"),document.getElementById("oceanleo-remote-desktop-screen"));}'),
 "../website-platform/WebsitePreviewPicker":dataModule('export function WebsitePreviewPicker(){return null;}'),
}));
test("screen source connects only after a click and reuses panel ticket/consent/agent, then cleans up",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);globalThis.__uwScreenProps=null;
 try{
  await act(async()=>root.render(React.createElement(WorkScreenPreview,{workId:"w",deviceId:"server",deviceName:"My server"})));
  assert.equal(globalThis.__uwScreenProps,null);assert.equal(globalThis.__uwConsentId,null);
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="连接服务器画面").click());
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,130));});
  const props=globalThis.__uwScreenProps;assert.equal(props.deviceId,"server");assert.equal(props.consent,"ask");assert.equal(props.agent.text,"AI is working");assert.ok(props.ticket);assert.equal(props.ticket.spent,false);
  assert.match(host.textContent,/Existing billing and consent notice/);assert.ok(host.querySelector('[data-oceanleo-remote-desktop]'));assert.match(host.textContent,/指位置给 agent/);
  await act(async()=>props.onClose());assert.equal(host.querySelector('[data-oceanleo-remote-desktop]'),null);assert.equal(globalThis.__uwConsentId,null);
 }finally{await act(async()=>root.unmount());host.remove();document.getElementById("oceanleo-remote-desktop-screen")?.remove();}
});
