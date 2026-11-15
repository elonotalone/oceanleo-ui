import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import {compileModule,dataModule} from "./module-bench.mjs";
const require=createRequire(import.meta.url);
const react=pathToFileURL(require.resolve("react")).href;
export const tabContextUrl=dataModule(`import {createContext} from ${JSON.stringify(react)};export const TabContext=createContext(null);`);
export const {TabContext}=await import(tabContextUrl);
const jsx=`import {jsx,jsxs} from ${JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href)};`;
const noop = (name) => dataModule(`export function ${name}(){return null;}`);
const stubs = {
  "../i18n/ui/useUI": dataModule('const tt=x=>x;export function useUI(){return tt;}'),
  "./AdvancedStageControls": noop("AdvancedStageControls"),
  "./AdvancedWorkbenchStage": dataModule(`${jsx} export function AdvancedWorkbenchStage({editorStage}){return jsx("div",{children:editorStage});}`),
  "./FloatingContextToolbar": dataModule('const toolbar={mode:"floating"};export function useFloatingContextToolbar(){return toolbar;}export function FloatingContextToolbar(){return null;}'),
  "./EditBarDockHost": noop("EditBarDockHost"),
  "./InlineAdvancedWorkbenchHeader": dataModule(`${jsx} export function InlineAdvancedWorkbenchHeader(p){return jsxs("div",{children:[jsx("button",{"data-close-editor":true,onClick:p.onClose,children:"close"}),jsx("button",{"data-back-editor":true,onClick:p.onBack,children:"back"}),jsx("span",{"data-save-state":p.autoSaveState,children:p.autoSaveError})]});}`),
  "./inline-editor-mine-panel": noop("InlineEditorMinePanel"),
  "./inline-advanced-workbench-drop": dataModule('const drop={dropMessage:"",performUpload:async()=>{},handleDrop(){}};export function useInlineAdvancedWorkbenchDrop(){return drop;}'),
  "./use-inline-advanced-panels": dataModule('const panels={floatingPanels:{active:null,subscribe(){return ()=>{};},snapshot(){return null;},close(){}},drawers:[],editBarDrawers:[],isPanelOpen(){return false;},activeDrawerId:"",openDrawer(){},openTransientPanel(){},updateTransientPanel(){},closeDetail(){},closeDrawer(){}};export function useInlineAdvancedPanels(){return panels;}'),
  "./inline-advanced-shell-parts": dataModule('export function HiddenUploadInput(){return null;}export function StageNoticeCorner(){return null;}export function useEditBarDockPresentation(){return {};}export function FallbackDetailAside(){return null;}export function SelectionPresenceProbe(p){return p.children;}const pages=[{id:"normal",kind:"main"}];export function usePluginPagesForAdapter(){return pages;}'),
  "./advanced-session-context": dataModule('export function useAdvancedSession(){return null;}'),
  "./workbench-material-provider": dataModule('export function useWorkbenchMaterials(){return null;}'),
  "./SplitWorkspace": dataModule('export function useRightPaneSlot(){return null;}export function useWorkspacePane(){return null;}'),
  "./plugin-theme": dataModule(`import {createContext} from ${JSON.stringify(react)};export const PluginThemePortalContext=createContext(null);export function PluginThemeScope({children}){return children;}export function usePluginThemePortal(){return null;}export function pluginThemeIdForAdapter(){return null;}export function pluginWorkbenchStyle(){return {};}const theme={};export function usePluginTheme(){return theme;}`),
  "./plugin-chrome/plugin-pages": dataModule('export function editBarVisibleOnPage(){return false;}'),
  "./plugin-chrome/plugin-page-store": dataModule('const page={pageId:"normal"};export function usePluginPage(){return page;}'),
};

/** Real shell and saver; only visual leaves and the test network boundary are replaced. */
export async function inlineSaveHost(hookUrl, authStubs, sharedPath) {
  return compileModule(sharedPath("src/shell/InlineAdvancedWorkbenchShell.tsx"), {
    ...stubs, ...authStubs,
    "./use-advanced-autosave": dataModule(`import {useContext} from ${JSON.stringify(react)};import {TabContext} from ${JSON.stringify(tabContextUrl)};import {useAdvancedAutoSave as useSave} from ${JSON.stringify(hookUrl)};export function useAdvancedAutoSave(input){const tab=useContext(TabContext);const useTabSave=tab?.useSave??useSave;const save=useTabSave(input);if(tab)tab.save=save;globalThis.__s3a.save=save;return save;}`),
  });
}
