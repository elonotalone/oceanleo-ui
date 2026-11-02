import { afterEach, describe, expect, test } from "vitest";
import React, { act, useState } from "react";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { compileModule, dataModule } from "../helpers/module-bench.mjs";
import "../helpers/w1-jsdom-window.mjs";

// Real canvas, slot routing, Library detail and attachment opener. Network-backed
// shelves and unrelated editors/actions are leaves; image decoding is not tested.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const { createRoot } = await import("react-dom/client");
const require = createRequire(import.meta.url);
const jsx = `import { jsx, jsxs } from ${JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href)};`;
const nil = (name) => dataModule(`export function ${name}(){return null;}`);
const ui = dataModule("export function useUI(){return (s)=>s;}");
const linkUrl = await compileModule("src/shell/task-attachment-library-link.tsx", { "../i18n/ui/useUI": ui });
const ART = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";
const image = {
  key: `artifact:${ART}:${REV}`, source: "artifact", id: ART, artifactId: ART, revisionId: REV,
  title: "exact-attachment.png", kind: "image", artifactType: "single_file_image", siteId: "oceanleo", favorite: false,
  url: "https://example.test/exact-attachment.png", previewUrl: "https://example.test/exact-preview.png",
  artifact: { artifactId: ART, revisionId: REV, roles: [], provenance: { sourceKind: "generated" } }, meta: {},
};
const base = {
  "../i18n/ui/useUI": ui,
  "./task-attachment-library-link": linkUrl,
  "./SplitWorkspace": dataModule("export function useRightPaneSlot(){return null;} export function useWorkspacePane(){return null;}"),
  "./workspace-session-context": dataModule("export function useOptionalWorkspaceSession(){return null;}"),
  "./workbench-routes": dataModule("export function editorCapabilityFor(){return {available:false};}"),
};
const { useTaskAttachmentOpener } = await import(/* @vite-ignore */ await compileModule("src/shell/task-attachment-open.ts", {
  ...base,
  "./ResultCanvas": nil("ResultCanvas"),
  "./WorkspaceSession": dataModule("export function WorkspaceSessionProvider({children}){return children;}"),
  "./artifact-client": dataModule("export async function getArtifactItem(){throw new Error('fixture must open immediately');}"),
}));
const canvasUrl = await compileModule("src/shell/ResultCanvas.tsx", {
  ...base,
  "./guide-context": dataModule("export function useFunctionGuide(){return null;}"),
  "./NavigatorGuide": nil("NavigatorGuide"),
  "./MaterialLibrary": nil("MaterialLibrary"),
  "./CloudBrowserPanel": nil("CloudBrowserPanel"),
  "./MyLibrary": dataModule(`${jsx} export function MyLibrary({action}){return jsx('div',{'data-library-destination':action?.action.itemId,'data-library-filter':action?.action.filter||'all'});}`),
  "./bay/shell/bay-state": dataModule("export function useBayEnabled(){return false;}"),
  "./bay/panel": nil("BayPanel"),
  "./leochat/LeoChatPanel": nil("LeoChatPanel"),
  "./workspace-runtime-hydration": dataModule("export function useWorkspaceRuntimeHydration(){return null;}"),
  "./AdvancedContentWorkbench": nil("AdvancedContentWorkbench"),
  "./advanced-session": dataModule("export function inlineEditorItemsFromSession(){return [];} export function advancedRootItemId(item){return item.id;} export function savedEditorRevisionTransition(){return {ok:true};}"),
  "./workbench-material-provider": dataModule("const actions=[]; export function useWorkbenchMaterialActions(){return {actions,perform(){},canPerform(){return false;}};}"),
  "./ArtifactActions": dataModule("export function ArtifactActionButtons(){return null;} export function artifactActionMatrix(){return {insert:{available:false}};}"),
  // Deliberately return a newly projected item. The header must use the selected
  // preview object, which owns the WeakMap callback, rather than this projection.
  "./library-detail-app-actions": dataModule("export function MaterialOwningAppEdit(){return null;} export function MaterialOwningAppList(){return null;} export function useMaterialDetailAppPlan({entry}){return {item:entry?.libraryItem?{...entry.libraryItem}:null,apps:[],editRoute:'none'};}"),
  "./library-current-identity": dataModule("export function clearLibraryCurrentIdentity(){} export function matchLibraryIdentityEntry(){return false;} export function rememberOpenedLibraryItem(){} export function resolveLibraryCurrentIdentity(){return null;} export function setLibraryCurrentIdentity(){}"),
  "./library-viewers": dataModule(`${jsx} export function LibraryItemViewer({item}){globalThis.__w13bViewed.push(item); return jsx('img',{'data-viewed-image':true,src:item.url,alt:item.title});}`),
  "./workspace-library-thumbnail": nil("WorkspaceThumbnail"),
});
const { ResultCanvas } = await import(/* @vite-ignore */ canvasUrl);
const modelUrl = await compileModule("src/shell/workspace-library-model.ts");
const { workspaceEntryFromLibraryItem } = await import(/* @vite-ignore */ modelUrl);
const roots = [];
afterEach(async () => {
  for (const { root, container } of roots.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
  delete globalThis.__w13bViewed;
});

async function mount({ collision = true, uploaded = false } = {}) {
  globalThis.__w13bViewed = [];
  const picked = uploaded ? { ...image, artifact: { ...image.artifact, roles: ["user_upload"], provenance: { sourceKind: "user_upload" } } } : image;
  const stale = { ...picked, title: "stale-list-image.png", url: "https://example.test/stale-list-image.png" };
  const tabs = collision ? [{ id: "image-results", label: "Images", content: null,
    surface: { slot: "preview", role: "entry" }, entries: [workspaceEntryFromLibraryItem(stale)] }] : [];
  let openAttachment, dispatch, reopen;
  let serial = 0;
  let exact;
  function Host() {
    const [openItem, setOpenItem] = useState(null);
    const [action, setAction] = useState(null);
    dispatch = (next, nonce = `library-${++serial}`) => setAction({ nonce, action: next });
    reopen = () => setOpenItem({ nonce: `reopen-${++serial}`, item: exact, mode: "preview" });
    openAttachment = useTaskAttachmentOpener("oceanleo", (target) => {
      exact = target.item;
      setOpenItem({ nonce: `attachment-${++serial}`, ...target });
    }, dispatch);
    return React.createElement(ResultCanvas, { tabs, active: "preview", showTemplate: false, siteId: "oceanleo", openItem, action });
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => root.render(React.createElement(Host)));
  await act(async () => { expect(await openAttachment({ id: "attachment", libraryItem: picked })).toBe(true); });
  return { container, dispatch, reopen, exact: () => exact };
}
const foreground = (container) => container.querySelector("[data-result-canvas-foreground]");
function expectLibrary(container, filter) {
  expect(foreground(container)).toBeNull();
  const mine = container.querySelector('[data-workspace-slot-panel="mine"]');
  expect(mine.hidden).toBe(false);
  expect(mine.getAttribute("aria-hidden")).toBe("false");
  expect(mine.querySelector("[data-library-destination]").getAttribute("data-library-destination")).toBe(ART);
  expect(mine.querySelector("[data-library-filter]").getAttribute("data-library-filter")).toBe(filter);
}

describe("W13b attachment viewer integration", () => {
  test.each([true, false])("first viewer paint uses the exact attachment object (same-id collision=%s)", async (collision) => {
    const app = await mount({ collision });
    const viewer = foreground(app.container);
    expect(viewer).not.toBeNull();
    expect(viewer.querySelector("[data-viewed-image]").getAttribute("src")).toBe(image.url);
    expect(globalThis.__w13bViewed.length).toBeGreaterThan(0);
    expect(globalThis.__w13bViewed.every((item) => item === app.exact())).toBe(true);
    expect(viewer.querySelector("header [data-task-attachment-library-link]")?.textContent).toBe("在 Library 中查看");
  });

  test.each([false, true])("viewer Library action removes the foreground and opens mine (uploaded=%s)", async (uploaded) => {
    const app = await mount({ uploaded });
    const button = foreground(app.container).querySelector("header [data-task-attachment-library-link]");
    expect(button).not.toBeNull();
    await act(async () => button.click());
    expectLibrary(app.container, uploaded ? "uploaded" : "all");
  });

  test("legacy filter=uploaded without intent still clears the foreground", async () => {
    const app = await mount();
    await act(async () => app.dispatch({ version: 1, tab: "mine", filter: "uploaded", itemId: ART }));
    expectLibrary(app.container, "uploaded");
  });

  test("ordinary mine navigation and other-slot open actions preserve the foreground", async () => {
    const app = await mount();
    for (const action of [
      { version: 1, tab: "mine" },
      { version: 1, tab: "materials", intent: "open", itemId: ART },
    ]) {
      await act(async () => app.dispatch(action));
      expect(foreground(app.container)).not.toBeNull();
      expect(foreground(app.container).querySelector("[data-viewed-image]").getAttribute("src")).toBe(image.url);
    }
  });

  test("a consumed Library request does not close a newly reopened attachment", async () => {
    const app = await mount();
    const action = { version: 1, tab: "mine", intent: "open", itemId: ART };
    await act(async () => app.dispatch(action, "once-only"));
    expectLibrary(app.container, "all");
    await act(async () => app.reopen());
    expect(foreground(app.container)).not.toBeNull();
    await act(async () => app.dispatch({ ...action }, "once-only"));
    expect(foreground(app.container)).not.toBeNull();
  });

  test("the centralized Chinese and English dictionaries translate the viewer action", async () => {
    const { default: zh } = await import("../../src/i18n/ui/messages/zh.ts");
    const { default: en } = await import("../../src/i18n/ui/messages/en.ts");
    expect(zh["在 Library 中查看"]).toBe("在 Library 中查看");
    expect(en["在 Library 中查看"]).toBe("View in Library");
  });
});
