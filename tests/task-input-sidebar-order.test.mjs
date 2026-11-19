import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// Reuse the real task-page/network harness. This file additionally mounts the
// real LeoComposer, Tiptap editor and HistoryInlineList in the same React root.
await import("./agent-chat-conversations.test.mjs");
const { mount, settle, cloudTask, computerTask, session, posts, acpFramesUrl, uiStub } = globalThis.__agentChatHarness;
const require = createRequire(import.meta.url);
const reactUrl = JSON.stringify(pathToFileURL(require.resolve("react")).href);
for (const name of ["Text", "DOMParser", "MutationObserver", "getComputedStyle"]) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: window[name] });
}
for (const name of ["innerHeight", "innerWidth", "scrollX", "scrollY"]) {
  Object.defineProperty(globalThis, name, { configurable: true, get: () => window[name] });
}
window.document.elementFromPoint = () => null;
window.Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
window.Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
const nil = (name) => dataModule(`export function ${name}(){ return null; }`);
const tiptap = Object.fromEntries([
  "@tiptap/react", "@tiptap/core", "@tiptap/pm/state", "@tiptap/extension-document", "@tiptap/extension-paragraph",
  "@tiptap/extension-text", "@tiptap/extension-placeholder", "@tiptap/extension-history",
].map((name) => [name, import.meta.resolve(name)]));
const { LeoComposer } = await import(await compileModule("src/shell/LeoComposer.tsx", {
  ...tiptap,
  "../i18n/ui/useUI": uiStub,
  "../lib/acp-frames-api": acpFramesUrl,
  "./LeoEntryButton": nil("LeoEntryButton"),
  "./guide-context": dataModule("export function useFillNonce(){return 0;} export function useFillTemplate(){return null;}"),
  "./mobile-native-actions": dataModule(`
    export function useNativeAttachActions(){return [];}
    export function useNativeHandoffEntry(){return {action:null,panel:null};}
    export function useNativeTaskNotifications(){} export function requestTaskNotificationsOnce(){}
  `),
  "./workspace-runtime-hydration": dataModule("export function useWorkspaceRuntimeHydration(){return null;}"),
  "./ModelPicker": nil("ModelGroupPicker"),
  "./PluginsPopover": nil("PluginsPopover"),
  "./mcp-apps": nil("ComposerAppsBar"),
  "./cloud-computer/ComputerDock": nil("ComputerDock"),
  "./composer-skill-slash": dataModule("export function composerSlashAdapter(){} export function useComposerSkillSlash(){return {onKeyDown(){return false;},popover:null};}"),
}));
const { HistoryInlineList } = await import(await compileModule("src/shell/HistoryMasterDetail.tsx", {
  "../i18n/ui/useUI": uiStub,
  "next/navigation": dataModule(`
    export function usePathname(){return '/tasks/t1';}
    export function useSearchParams(){return new URLSearchParams();}
    export function useRouter(){return {push(){},replace(){},prefetch(){}};}
  `),
  "./AgentChat": nil("AgentChat"),
  "./WorkspaceSelection": dataModule(`import React from ${reactUrl}; export function useWorkspaceSelection(){return React.useState(null);}`),
  "./library-task-history": nil("LibraryTaskHistoryWorkspace"),
  "./WorkspaceSession": dataModule("export function WorkspaceSessionProvider({children}){return children;}"),
  "./HistoryRowActions": dataModule("export function HistoryRowMenu(){return null;} export function MoveTaskProjectDialog(){return null;}"),
  "../ui": dataModule("export function ConfirmDialog(){return null;} export function SkeletonCard(){return null;} export function SkeletonLine(){return null;}"),
  "../lib/auth/client": dataModule("export function browserClient(){return null;} export async function accessToken(){return null;}"),
  "../lib/agent": dataModule(`
    export async function listTasks(){globalThis.__sidebarReads++; return {ok:true,data:{items:globalThis.__sidebarTasks}};}
    export async function getTask(){return {ok:false,status:404};}
    export async function deleteTask(){return {ok:true};} export function taskCostYuan(){return 0;}
  `),
  "../lib/app-session": dataModule(`
    export function isAppSessionApiUnavailableStatus(status){return status===404;}
    export async function listAppSessions(){return {ok:true,data:{items:globalThis.__sidebarSessions}};}
    export async function getAppSession(){return {ok:false,status:404};}
    export async function deleteAppSession(){return {ok:true};}
    export async function updateAppSessionMetadata(){return {ok:true};}
  `),
}));

const oldTime = "2026-11-17T10:00:00Z";
const newerTime = "2026-11-18T10:00:00Z";
const row = (id, time, extra = {}) => ({
  id, title: id, mode: "agent", status: "done", site_id: "oceanleo", created_at: oldTime, updated_at: time, ...extra,
});
const order = (view) => [...view.host.querySelectorAll("[data-history-row]")].map((node) => node.getAttribute("data-history-row"));
async function refresh(view, expected) {
  const before = globalThis.__sidebarReads;
  await act(async () => window.dispatchEvent(new Event("oceanleo:history-changed")));
  await settle();
  assert.ok(globalThis.__sidebarReads > before, "a real list refresh completed");
  assert.deepEqual(order(view), expected);
}

for (const pane of ["cloud", "acp"]) {
  for (const failure of ["missing migration", "offline"]) {
    test(`${pane}: unsent typing ranks its sidebar row first through ${failure}, refresh and two-minute expiry`, async () => {
      globalThis.__sidebarReads = 0;
      // Cloud uses a bound session row; computer uses a task row. Neither server
      // response knows last_input_at, as on a gateway before migration 0592.
      globalThis.__sidebarTasks = [row("newer", newerTime, { pinned: true, working: true, open_turn: true, status: "running" }),
        row("t1", oldTime, pane === "cloud" ? { session_id: "s1" } : { mode: "computer" })];
      globalThis.__sidebarSessions = pane === "cloud" ? [{
        id: "s1", task_id: "t1", title: "Cloud session", site_id: "oceanleo", app_id: "home-agent", status: "active",
        snapshot: {}, schema_version: 1, revision: 1, created_at: oldTime, updated_at: oldTime,
      }] : [];
      const target = pane === "cloud" ? "s1" : "t1";
      let showSidebar;
      function Sidebar(props) {
        const [visible, setVisible] = React.useState(true);
        showSidebar = setVisible;
        return visible ? React.createElement(HistoryInlineList, props) : null;
      }
      const view = await mount({ taskId: "t1" }, {
        task: pane === "cloud" ? cloudTask() : computerTask(),
        sessions: pane === "acp" ? [session("cts_generic", "acp", "codex")] : [],
        Composer: LeoComposer, Sidebar,
        acpRoute: (path) => path.endsWith("/input-activity") ? failure === "offline"
          ? { status: 503, body: { detail: "offline" } }
          : { body: { available: false, last_input_at: null } } : null,
      });
      const realNow = Date.now;
      try {
        assert.deepEqual(order(view), ["newer", target]);
        const editor = view.host.querySelector(`[data-agent-stream="${pane}"] [role="textbox"]`);
        assert.ok(editor?.editor, "the actual task-page Tiptap editor mounted");
        assert.equal(editor.getAttribute("contenteditable"), "true");
        assert.equal(posts("/input-activity").length, 0, "opening does not record input");
        await act(async () => editor.editor.commands.insertContent("unsent sidebar draft"));
        assert.deepEqual(order(view), [target, "newer"], "typing wins over the pinned, working row without Send");
        await settle(2_050);
        assert.equal(posts("/input-activity").length, 1, "debounced activity POST used the task id");
        assert.equal(posts("/input-activity")[0].path, "/v1/agent/tasks/t1/input-activity");
        assert.equal(posts("/input-activity")[0].body, null, "draft text never leaves the composer");
        assert.equal(posts("/send").length, 0);
        assert.equal(globalThis.__followUps.length, 0);
        assert.equal(editor.textContent, "unsent sidebar draft");
        await refresh(view, [target, "newer"]);
        const later = realNow() + 121_000;
        Date.now = () => later;
        await refresh(view, [target, "newer"]);
        // Rail/sidebar layout changes unmount the list without ending the page
        // session. Reopening it must also keep the local unsent-input clock.
        await act(async () => showSidebar(false));
        await act(async () => showSidebar(true));
        await settle();
        assert.deepEqual(order(view), [target, "newer"]);
        assert.equal(editor.textContent, "unsent sidebar draft");
      } finally {
        Date.now = realNow;
        await view.unmount();
        sessionStorage.clear();
      }
    });
  }
}
