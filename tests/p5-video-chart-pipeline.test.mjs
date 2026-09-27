import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const LEAVE_PRO_LOCK = "专业编辑里的修改还没保存成功，请重试。";
const repoFile = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const require = createRequire(import.meta.url);
const fabric = createRequire(require.resolve("fabric/node"));
const canvas = fabric.resolve("canvas");
const previous = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabric.resolve("jsdom")).href);
if (previous) require.cache[canvas] = previous;
else delete require.cache[canvas];
const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://unit.dev.oceanleo.com",
  pretendToBeVisual: true,
});
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "localStorage",
  "sessionStorage",
]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: name === "window" ? dom.window : dom.window[name],
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.fetch = async () => {
  throw new Error("No network in P5 component tests");
};
after(() => dom.window.close());

const react = pathToFileURL(require.resolve("react")).href;
const jsx = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const noop = (...names) =>
  dataModule(names.map((n) => `export function ${n}(){return null}`).join("\n"));
const handoffUrl = await compileModule("src/shell/advanced-routes/editor-handoff.ts", {
  "../office-editor/useOfficeArtifactSource": dataModule(
    "export function useOfficeArtifactSource(){return {loading:false}}",
  ),
});
const handoff = await import(handoffUrl);
const sourceStub = dataModule(
  `export * from ${JSON.stringify(handoffUrl)}; export const useEditorHandoffSource=()=>globalThis.__p5.source;`,
);
const common = {
  "../advanced-routes/editor-handoff": sourceStub,
  "../advanced-routes/mode-switch-gate": dataModule(
    "export const useModeSwitchHandoff=()=>null; export const useModeSwitchReady=()=>{};",
  ),
  "../advanced-routes/w19-handoff-store": dataModule(`
    export const w19ItemKey=(plugin,item)=>plugin+':'+(item.artifactId||item.id||'');
    export const peekW19EnterHandoff=()=>null; export const resolveW19Handoff=(item,source)=>source||{kind:'empty'};
    export const applyW19HandoffToItem=item=>item; export const w19OfficeProbeItem=item=>item;
    export const reportW19ProSaved=(key,item)=>globalThis.__p5.reports.push(item);
    export const W19_PRO_SAVED_AS_NEW_VERSION='';`),
  "../AdvancedWorkbenchShell": dataModule(`import {jsx} from ${JSON.stringify(jsx)}; export function AdvancedWorkbenchShell({adapter}) {globalThis.__p5.adapter=adapter; return jsx('main',{children:adapter.stage});}`),
  "../advanced-recovery-store": dataModule('export const advancedRecoveryKey=()=>"test"'),
  "../advanced-session": dataModule(
    "export const advancedSavedItem=(item,patch)=>({...item,...patch});",
  ),
  "../plugin-command": noop("usePluginCommandSurface"),
  "../workbench-routes": dataModule(
    'export const editorToolLabel=()=>"test"; export const editorRouteFor=()=>({});',
  ),
  "../doc-editors/doc-io": dataModule(
    `export const saveProjectWorkingHead=input=>globalThis.__p5.save(input); export function downloadText(){}`,
  ),
  "../../lib/media-proxy": dataModule(
    "export const fetchMediaBlob=async()=>new Blob([new Uint8Array([1])]);",
  ),
};
const videoStubs = {
  ...common,
  "../SelectionToolbar": noop("SelectionToolbar"),
  "./preview-engine": dataModule(
    "export class TimelinePreviewEngine {attachCanvas(){} dispose(){} setDoc(){} play(){} pause(){}}",
  ),
  "./render-client": noop("renderTimeline"),
  "./designcombo-save-preview": dataModule(
    'export const createVideoDesigncomboPreview=()=>async()=>new Blob(["preview"]);',
  ),
  "./designcombo/timeline-host": noop("DesigncomboTimelineHost"),
  "./designcombo/inspector-host": noop("DesigncomboInspectorHost"),
};
const chartStubs = {
  ...common,
  "./use-chart-workbench": dataModule(`import {useState} from ${JSON.stringify(react)};
    export const chartEditorManifest=()=>({});
    export function useChartWorkbench(){
      const [revision,setRevision]=useState(0);const [dirty,setDirty]=useState(false);
      globalThis.__p5.edit=()=>{setRevision(n=>n+1);setDirty(true)};
      return {loading:false,sourceReady:true,carrierState:'ready',dirty,editRevision:revision,
        document:globalThis.__p5.chartDocument, table:{headers:[],rows:[]},
        save:async()=>{const r=await globalThis.__p5.save({revision}); if(!r.ok)return null;setDirty(false);return {...r,json:'{}'};}
      };
    }`),
  "./ChartContextToolbar": noop("ChartContextToolbar"),
  "./ChartControls": noop("ChartControls"),
  "./ChartStage": noop("ChartStage"),
  "./ChartOptionCodePanel": noop("ChartOptionCodePanel"),
  "./chart-command-surface": noop("createChartCommandSurface"),
};
const { VideoDesigncomboStage } = await import(
  await compileModule("src/shell/video-editor/VideoDesigncomboStage.tsx", videoStubs)
);
const { ChartNextStage } = await import(
  await compileModule("src/shell/chart-editor/ChartNextStage.tsx", chartStubs)
);
const { normalizeChartDocument } = await import("../src/shell/chart-editor/chart-schema.ts");
const { emptyOpenVideoProject } = await import("../src/shell/video-editor/designcombo/schema.ts");

async function mount(t, kind) {
  handoff.resetEditorHandoffForTests();
  const state = (globalThis.__p5 = {
    source: { status: "ready", source: { kind: "empty" } },
    reports: [],
    saved: [],
    chartDocument: normalizeChartDocument({
      option: {
        title: { text: "chart" },
        xAxis: { type: "category", data: ["A"] },
        yAxis: { type: "value" },
        series: [{ type: "bar", data: [1] }],
      },
    }),
  });
  state.item = {
    id: "asset",
    key: "asset",
    artifactId: "asset",
    revisionId: "r0",
    title: "test",
    kind,
    meta: {},
  };
  state.save = async (input) => {
    state.saved.push(input);
    return {
      ok: true,
      url: "https://fixture.invalid/saved",
      item: { ...state.item, revisionId: "r" + state.saved.length },
      versionId: "r" + state.saved.length,
    };
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let mounted = true;
  const Component = kind === "video-timeline" ? VideoDesigncomboStage : ChartNextStage;
  await act(async () => {
    root.render(React.createElement(Component, { item: state.item }));
  });
  state.unmount = async () => {
    if (mounted) {
      mounted = false;
      await act(async () => root.unmount());
      container.remove();
    }
  };
  t.after(state.unmount);
  state.container = container;
  state.mode = async (mode) =>
    act(async () => {
      await state.adapter.mode.setMode(mode);
    });
  state.flush = async () => {
    let result;
    await act(async () => {
      result = await state.adapter.persistence.flush();
    });
    return result;
  };
  return state;
}

test("owned video/chart sources share the edit schema and drop the leave-pro lock", () => {
  const videoRoute = repoFile("../src/shell/advanced-routes/VideoTimelineRoute.tsx");
  const videoLeaf = repoFile("../src/shell/video-editor/VideoDesigncomboStage.tsx");
  const chartRoute = repoFile("../src/shell/advanced-routes/ChartRoute.tsx");
  const chartLeaf = repoFile("../src/shell/chart-editor/ChartNextStage.tsx");
  assert.match(videoRoute, /draftSchema:\s*"oceanleo\.video-timeline\.edit\.v1"/);
  assert.match(videoLeaf, /draftSchema:\s*"oceanleo\.video-timeline\.edit\.v1"/);
  assert.match(chartRoute, /draftSchema:\s*"oceanleo\.chart\.edit\.v1"/);
  assert.match(chartLeaf, /draftSchema:\s*"oceanleo\.chart\.edit\.v1"/);
  for (const body of [videoRoute, videoLeaf, chartRoute, chartLeaf]) {
    assert.doesNotMatch(body, /oceanleo\.(?:video-timeline|chart)\.pro\.v1/);
    assert.doesNotMatch(body, /saveBeforeLeavePro/);
    assert.doesNotMatch(body, /专业编辑里的修改还没保存成功/);
    assert.doesNotMatch(body, /handoffItemKey=/);
  }
});

for (const kind of ["video-timeline", "chart-editor"]) {
  test(`P5 ${kind}: failed flush still switches to normal and never paints the lock copy`, async (t) => {
    const s = await mount(t, kind);
    await s.mode("pro");
    await act(async () => {
      if (kind === "chart-editor") s.edit();
      else s.adapter.persistence.recovery.restore(emptyOpenVideoProject());
    });
    assert.equal(s.adapter.persistence.dirty, true);
    assert.equal(
      s.adapter.persistence.recovery.draftSchema,
      kind === "chart-editor"
        ? "oceanleo.chart.edit.v1"
        : "oceanleo.video-timeline.edit.v1",
    );
    s.save = async () => ({ ok: false, error: "offline" });
    const flushed = await s.flush();
    assert.equal(flushed.ok, false);
    await s.mode("normal");
    assert.equal(s.adapter.mode.current, "normal");
    assert.equal(s.container.textContent.includes(LEAVE_PRO_LOCK), false);
    assert.equal(document.body.textContent.includes(LEAVE_PRO_LOCK), false);
  });

  test(`P5 ${kind}: a successful flush writes the same artifact identity`, async (t) => {
    const s = await mount(t, kind);
    await act(async () => {
      if (kind === "chart-editor") s.edit();
      else s.adapter.persistence.recovery.restore(emptyOpenVideoProject());
    });
    const flushed = await s.flush();
    assert.equal(flushed.ok, true);
    assert.equal(s.saved.length, 1);
    if (kind === "video-timeline") {
      assert.equal(s.saved[0].item.artifactId, "asset");
      assert.equal(s.saved[0].item.id, "asset");
      assert.equal(s.saved[0].artifactRevision.artifactType, "video");
    }
    assert.equal(s.reports[0].id, "asset");
    assert.equal(s.reports[0].artifactId, "asset");
  });
}
