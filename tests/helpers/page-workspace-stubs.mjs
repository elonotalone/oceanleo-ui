import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dataModule } from "./module-bench.mjs";

const require = createRequire(import.meta.url);
/** Body-only regressions; lc1-leochat-workspace runs the real shared shell. */
export const PAGE_WORKSPACE_STUBS = {
  "../../SplitWorkspace": dataModule("export function IconRightPanelToggle(){ return null; }"),
  "../../TaskWorkspaceShell": dataModule(`
    import { useState, createElement as h } from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)};
    export function useTaskWorkspaceState(){ const [rightOpen,setRightOpen]=useState(false); return {rightOpen,setRightOpen}; }
    export function TaskWorkspaceShell({left,state,canvas,ignoredWorkspaceTabs}){
      globalThis.__bayWorkspaceProps={canvas,ignoredWorkspaceTabs};
      return h('div',{'data-test-workspace-open':String(state.rightOpen)},left);
    }
  `),
};
