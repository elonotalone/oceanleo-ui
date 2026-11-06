import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStub = dataModule(`
  const translate = (value, vars) => {
    if (!vars) return value;
    return String(value).replace(/\\{(\\w+)\\}/g, (_, key) => String(vars[key] ?? ""));
  };
  export function useUI() { return translate; }
`);

function classes(html, selector) {
  const host = document.createElement("div");
  host.innerHTML = html;
  const node = host.querySelector(selector);
  assert.ok(node, `rendered ${selector} must exist`);
  return node.getAttribute("class") || "";
}

async function staticRender(source, exportName, props, stubs = {}) {
  const mod = await import(await compileModule(source, stubs));
  return renderToStaticMarkup(React.createElement(mod[exportName], props));
}

test("R06 点名的通用页、数据库卡片、表格输入和开关恢复紧凑可见高度", async () => {
  const ui = await staticRender("src/ui/index.tsx", "Switch", {
    checked: false,
    onChange() {},
    label: "开关",
  }, {
    "../shell/anchored-popover": dataModule("export function ensureOverlayMotionStyles(){} export function lockBodyScroll(){return ()=>{}} export function runAfterOverlayExit(){} export function trapTabWithin(){} export function AnchoredPopover(){return null}"),
    "../i18n/ui/useUI": uiStub,
  });
  const switchClass = classes(ui, "button[role='switch']");
  assert.match(switchClass, /(?:^| )h-5(?: |$)/);
  assert.match(switchClass, /(?:^| )w-9(?: |$)/);
  assert.doesNotMatch(switchClass, /(?:^| )(?:h-11|w-12|size-11)(?: |$)/);

  const header = await staticRender("src/pages/PageHeader.tsx", "PageHeader", {
    title: "设置",
    onBack() {},
  }, { "../i18n/ui/useUI": uiStub });
  const headerClass = classes(header, "button[aria-label='返回']");
  assert.match(headerClass, /(?:^| )h-9(?: |$)/);
  assert.match(headerClass, /(?:^| )w-9(?: |$)/);
  assert.doesNotMatch(headerClass, /(?:^| )(?:h-11|w-11)(?: |$)/);

  const general = await staticRender("src/pages/GeneralPage.tsx", "GeneralSettingsBody", {
    labels: { appearance: "外观", language: "语言", theme: "主题" },
    themeLabels: { light: "浅色", dark: "深色", system: "自动" },
  }, {
    "next/navigation": dataModule("export function useRouter(){return {replace(){}}}"),
    "next-intl": dataModule("export function useLocale(){return 'zh-CN'}"),
    "../contracts/domain-family": dataModule("export function sharedCookieDomainFor(){return ''}"),
    "./PageHeader": dataModule("export function PageHeader(){return null}"),
    "../i18n/ui/useUI": uiStub,
    "../theme/ThemeProvider": dataModule("export function useTheme(){return {mode:'light',setMode(){}}}"),
    "../shell/LeoAssistant": dataModule("export function setLeoEnabled(){} export function useLeoEnabled(){return true}"),
  });
  const generalClass = classes(general, "button[role='switch']");
  assert.match(generalClass, /(?:^| )h-6(?: |$)/);
  assert.match(generalClass, /(?:^| )w-11(?: |$)/);
  assert.doesNotMatch(generalClass, /(?:^| )(?:h-11|w-14)(?: |$)/);

  const sheet = await staticRender("src/shell/AdvancedStructuredEditors.tsx", "SheetWorkbenchCanvas", {
    editor: { rows: [["A1"]], setCell() {} },
  }, {
    "../lib/database": dataModule("export async function uploadFile(){return {ok:false}} export async function saveCreations(){return {ok:false}}"),
    "../i18n/ui/useUI": uiStub,
    "./Markdown": dataModule("export function Markdown(){return null}"),
  });
  const sheetClass = classes(sheet, "input");
  assert.match(sheetClass, /(?:^| )h-9(?: |$)/);
  assert.doesNotMatch(sheetClass, /(?:^| )h-11(?: |$)/);

  const panel = await staticRender("src/shell/AgentHiringPolicyPanel.tsx", "AgentHiringPolicyPanel", {}, {
    "../i18n/ui/useUI": uiStub,
    "../lib/money": dataModule("export function useLedgerCurrency(){return 'USD'} export function formatFen(v){return String(v)}"),
    "../api/talent-handoff": dataModule(`
      export const DEFAULT_AGENT_HIRING_POLICY={enabled:false,max_per_request_fen:0,daily_cap_fen:0,allowed_categories:[],require_confirmation:true};
      export function fenFromYuanInput(){return 0} export function formatFen(v){return String(v)};
      export function normalizeAgentHiringPolicy(value){return value};
      export async function getAgentHiringPolicy(){return DEFAULT_AGENT_HIRING_POLICY};
      export async function listAgentHiringEvents(){return []}; export function listTalentCategories(){return []};
      export async function overrideAgentHiringEvent(){} export async function putAgentHiringPolicy(){};
    `),
  });
  const policyClass = classes(panel, "button[role='switch']");
  assert.match(policyClass, /(?:^| )h-6(?: |$)/);
  assert.match(policyClass, /(?:^| )w-11(?: |$)/);
  assert.doesNotMatch(policyClass, /(?:^| )(?:h-11|w-14)(?: |$)/);

});

test("r2 表内数据库删除键、Acp 设置控件、LeoBoard 控件和云电脑按钮由实际渲染检查", async () => {
  const database = await import(await compileModule("src/pages/MyDatabasePage.tsx", {
    "../lib/database": dataModule(`
      export const MEDIA_TYPE_LABEL={image:'图片'};
      export async function getDatabaseOverview(){return {ok:true,data:{counts:{works:1,assets:0,knowledge:0},works:[{id:'w1',url:'/w1.png',thumb_url:'/w1.png',title:'作品',media_type:'image'}],assets:[],knowledge:[]}}}
      export async function deleteCreation(){} export async function deleteAsset(){} export async function addKnowledge(){} export async function deleteKnowledge(){}
    `),
    "../shell/StorageCapacityStrip": dataModule("export function StorageCapacityStrip(){return null}"),
    "../i18n/ui/useUI": uiStub,
  }));
  const databaseHost = document.createElement("div");
  document.body.append(databaseHost);
  const databaseRoot = createRoot(databaseHost);
  await act(async () => {
    databaseRoot.render(React.createElement(database.MyDatabasePanel));
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
  }
  const deleteButton = databaseHost.querySelector("button[aria-label='删除']");
  assert.ok(deleteButton, "database item must render its delete button");
  assert.match(deleteButton.className, /(?:^| )h-6(?: |$)/);
  assert.match(deleteButton.className, /(?:^| )w-6(?: |$)/);
  assert.doesNotMatch(deleteButton.className, /(?:^| )(?:h-11|w-11)(?: |$)/);
  await act(async () => databaseRoot.unmount());
  databaseHost.remove();

  const settings = await staticRender("src/shell/cloud-computer/agent-dialog/AcpSettings.tsx", "AcpSettings", {
    open: true,
    computerId: "cc_1",
    program: "cursor",
    dialog: { models: [{ id: "m", name: "模型", usable: true }], selectedModel: "m", mode: { id: "mode", name: "模式", options: [{ value: "safe", name: "安全" }] }, selectedMode: "safe", configOptions: [], programs: [] },
    oceanleoStatus: null,
    onClose() {}, onRequestInstall() {}, onRequestLogin() {}, onRequestKey() {}, onOceanleoStatusChange() {},
  }, {
    "../../../lib/cloud-computer-api": dataModule("export async function getAgentSettings(){return {confirm_dangerous:true,oceanleo_tools:true,billing_paused:false}} export async function patchAgentSettings(){return {}} export async function uninstallOceanleoAgent(){return {}}"),
    "../../../i18n/ui/useUI": uiStub,
    "../../../ui": dataModule("export function ConfirmDialog(){return null}"),
    "./notice": dataModule("export function hiddenModelCopy(){return []} export function modelGroups(models){return [{label:'',models}]}"),
    "../server-page/tone": dataModule("export const tone={border:'',muted:'',input:'',hover:'',primary:'',danger:'',iconBtn:''}"),
  });
  const settingsHost = document.createElement("div");
  settingsHost.innerHTML = settings;
  const close = settingsHost.querySelector("[data-oceanleo-acp-settings-close]");
  assert.ok(close);
  assert.match(close.className, /(?:^| )h-8(?: |$)/);
  assert.doesNotMatch(close.className, /(?:^| )h-11(?: |$)/);
  const model = settingsHost.querySelector("[data-oceanleo-acp-settings-model]");
  const mode = settingsHost.querySelector("[data-oceanleo-acp-settings-mode]");
  assert.match(model.className, /(?:^| )h-8(?: |$)/);
  assert.match(mode.className, /(?:^| )h-8(?: |$)/);
  assert.doesNotMatch(`${model.className} ${mode.className}`, /(?:^| )h-11(?: |$)/);

  const acp = await staticRender("src/shell/cloud-computer/agent-dialog/AcpCard.tsx", "AcpCard", {
    computer: { id: "cc_1", name: "测试机" },
    initialProgram: "cursor",
    active: false,
  }, {
    "../../../lib/cloud-computer-api": dataModule("export async function getOceanleoAgent(){return null} export async function installOceanleoAgent(){return null}"),
    "../../../i18n/ui/useUI": uiStub,
    "../server-page/chrome-icons": dataModule("export function IconRefresh(){return null}"),
    "../server-page/url-state": dataModule("export function replaceServerPageUrl(){}"),
    "../server-page/ProgramStrip": dataModule("export function ProgramStrip(){return null}"),
    "../server-page/server-page-chrome": dataModule("export function ServerPageStripPortal({children}){return children}"),
    "../server-page/tone": dataModule("export const tone={border:'',muted:'',input:'',hover:'',primary:'',danger:'',iconBtn:''}"),
    "./AcpSettings": dataModule("export function AcpSettings(){return null}"),
    "./Composer": dataModule("export function Composer(){return null}"),
    "./InstallSheet": dataModule("export function InstallSheet(){return null}"),
    "./KeySheet": dataModule("export function KeySheet(){return null}"),
    "./LoginCard": dataModule("export function LoginCard(){return null}"),
    "./MessageList": dataModule("export function MessageList(){return null}"),
    "./useAgentDialogController": dataModule("export function useAgentDialog(){return {programs:[],busy:false,configOptions:[],sessions:[],sessionsSupported:false,requestSessions(){},newSession(){},openSession(){}}}"),
  });
  const refreshClass = classes(acp, "[data-oceanleo-acp-sessions-refresh]");
  assert.match(refreshClass, /(?:^| )size-7(?: |$)/);
  assert.doesNotMatch(refreshClass, /(?:^| )size-11(?: |$)/);

  const { ComputerDock } = await import(await compileModule("src/shell/cloud-computer/ComputerDock.tsx", {
    "../../lib/cloud-computer-api": dataModule("export const cloudComputerApi={}; export function readMountedComputerName(){return ''}"),
    "../../contracts/domain-family": dataModule("export function currentDomainFamily(){return 'com'} export function currentDomainProfile(){return {portalOrigin:'https://oceanleo.com'}}"),
    "../../i18n/ui/useUI": uiStub,
    "next/navigation": dataModule("export function useRouter(){return {push(){}}}"),
    "../anchored-popover": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function AnchoredPopover({open,children,attributes}){return open ? React.createElement('div',{...(attributes||{}),'data-anchored-popover':'1'},children) : null}`),
    "./ConnectServerDialog": dataModule("export function ConnectServerDialog(){return null}"),
    "./CreateComputerDialog": dataModule("export function CreateComputerDialog(){return null}"),
    "./useCloudComputers": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function useCloudComputers({computers=[]}){
        const connected=computers.filter((item)=>item.status==='running'||item.status==='active');
        const mounted=connected[0] || null;
        return {computers,mounted,mountedId:mounted?.id||null,rememberedId:null,setMountedId(){},refresh(){},loading:false};
      }
    `),
  }));
  const cloudComputer = (id, name) => ({ id, name, source: "aliyun", edition: "com", status: "running", enrolled_at: "2026-09-25T00:00:00Z", confirmed_at: "2026-09-25T00:00:00Z", node_online: true });
  const dockHost = document.createElement("div");
  document.body.append(dockHost);
  const dockRoot = createRoot(dockHost);
  await act(async () => dockRoot.render(React.createElement(ComputerDock, { computers: [] })));
  const connect = dockHost.querySelector("[data-oceanleo-cc-dock-empty]");
  assert.ok(connect);
  assert.doesNotMatch(connect.className, /(?:^| )min-h-11(?: |$)/);
  await act(async () => connect.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  const menuItems = [...dockHost.querySelectorAll("[role='menuitem']")];
  assert.ok(menuItems.length >= 2);
  assert.ok(menuItems.every((node) => !/(?:^| )min-h-11(?: |$)/.test(node.className)));
  await act(async () => dockRoot.render(React.createElement(ComputerDock, { computers: [cloudComputer("cc_1", "一号机"), cloudComputer("cc_2", "二号机")] })));
  const mounted = dockHost.querySelector("[data-oceanleo-cc-dock-mounted]");
  assert.ok(mounted);
  assert.doesNotMatch(mounted.className, /(?:^| )min-h-11(?: |$)/);
  const switchToggle = dockHost.querySelector("[data-oceanleo-cc-switch-toggle]");
  assert.ok(switchToggle);
  assert.doesNotMatch(switchToggle.className, /(?:^| )(?:min-h-11|min-w-11)(?: |$)/);
  await act(async () => switchToggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  const switchItems = [...dockHost.querySelectorAll("[data-oceanleo-cc-switch-item]")];
  assert.ok(switchItems.length >= 2);
  assert.ok(switchItems.every((node) => !/(?:^| )min-h-11(?: |$)/.test(node.className)));
  await act(async () => dockRoot.unmount());
  dockHost.remove();

  const { LocalFileTree } = await import(await compileModule("src/shell/LocalFileTree.tsx", {
    "../api/device-error-copy": dataModule("export function deviceErrorCopy(code){return String(code)}"),
    "./local-task-client": dataModule(`
      export function isInsideLocalRoot(){return true};
      export function joinLocalPath(root,name){return root + '/' + name};
      export function localActionOutcomeText(){return '完成'};
      export function startLocalAction(deviceId, action, payload, onTask){
        onTask({status:'succeeded',resultSummary:{files:[{name:'报告.txt',kind:'file',bytes:12}]}});
        return {stop(){},offline:false};
      }
    `),
  }));
  const treeHost = document.createElement("div");
  document.body.append(treeHost);
  const treeRoot = createRoot(treeHost);
  await act(async () => treeRoot.render(React.createElement(LocalFileTree, {
    deviceId: "cc_1",
    rootPath: "/授权目录",
    onSelectionChange() {},
  })));
  const rootToggle = treeHost.querySelector("[data-local-tree-root-toggle]");
  assert.ok(rootToggle);
  await act(async () => rootToggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  const fileCheckbox = treeHost.querySelector("input[type='checkbox']");
  assert.ok(fileCheckbox, "local tree file row must render after a real directory expansion");
  assert.match(fileCheckbox.className, /(?:^| )size-4(?: |$)/);
  assert.doesNotMatch(fileCheckbox.className, /(?:^| )size-11(?: |$)/);
  await act(async () => treeRoot.unmount());
  treeHost.remove();

  const { LeoBoard } = await import(await compileModule("src/shell/leo/LeoBoard.tsx", {
    "../../contracts/domain-family": dataModule("export function currentDomainProfile(){return {gatewayOrigin:'https://api.oceanleo.com'}}"),
    "../../i18n/ui/useUI": uiStub,
    "./host-input": dataModule("export function copyText(){} export function getHostText(){return ''} export function setHostValue(){}"),
  }));
  const leoHost = document.createElement("div");
  document.body.append(leoHost);
  const leoRoot = createRoot(leoHost);
  await act(async () => leoRoot.render(React.createElement(LeoBoard, {
    siteId: "site_1",
    docType: "text",
    context: { text: "原文", source: "input" },
    onContextChange() {},
    resolveHost() { return null; },
  })));
  await act(async () => {});
  const undo = leoHost.querySelector("button[aria-label='回退']");
  const redo = leoHost.querySelector("button[aria-label='前进']");
  assert.ok(undo && redo, "Leo board must mount undo and redo controls for a real context");
  assert.match(undo.className, /(?:^| )h-6(?: |$)/);
  assert.match(undo.className, /(?:^| )w-6(?: |$)/);
  assert.match(redo.className, /(?:^| )h-6(?: |$)/);
  assert.match(redo.className, /(?:^| )w-6(?: |$)/);
  assert.doesNotMatch(`${undo.className} ${redo.className}`, /(?:^| )(?:h-11|w-11)(?: |$)/);
  await act(async () => leoRoot.unmount());
  leoHost.remove();

  const { SettingsModal } = await import(await compileModule("src/pages/settings/SettingsModal.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "./SettingsHub": dataModule("export function SettingsHub(){return null}"),
  }));
  const settingsHost2 = document.createElement("div");
  document.body.append(settingsHost2);
  const settingsRoot = createRoot(settingsHost2);
  await act(async () => settingsRoot.render(React.createElement(SettingsModal, { open: true, onClose() {} })));
  const closeModal = document.body.querySelector("button[aria-label='关闭']");
  assert.ok(closeModal);
  assert.match(closeModal.className, /(?:^| )size-8(?: |$)/);
  assert.doesNotMatch(closeModal.className, /(?:^| )size-11(?: |$)/);
  await act(async () => settingsRoot.unmount());
  settingsHost2.remove();

});
