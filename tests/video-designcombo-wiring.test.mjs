// W09 wiring gate — dual-core route, dynamic leaf, no Remotion, old core kept.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DEFAULT_EDITOR_CORE, setEditorCoreOverride } from "../src/shell/editor-core-flags.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  VIDEO_DESIGNCOMBO_DEFAULT_MODE,
  videoDesigncomboChrome,
} from "../src/shell/video-editor/designcombo/chrome.ts";
import {
  VIDEO_DESIGNCOMBO_INSTANCE_ID,
  applyVideoDesigncomboChromeDom,
  applyVideoDesigncomboMode as applyMode,
} from "../src/shell/video-editor/designcombo/stage-plan.ts";
import { videoToolsManifestChips } from "../src/shell/video-editor/designcombo/l4-chips.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const route = read("src/shell/advanced-routes/VideoTimelineRoute.tsx");
const leaf = read("src/shell/video-editor/VideoDesigncomboStage.tsx");
const routeCode = route
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
const leafCode = leaf
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

test("the dual-core flag is resolved once, at the top of the route", () => {
  assert.match(route, /if \(resolveEditorCore\("video-timeline"\) === "next"\)/);
  assert.doesNotMatch(route, /from "@openvideo\//);
  assert.doesNotMatch(route, /from "@remotion\//);
  assert.match(
    route,
    /dynamic\(\s*\(\) =>\s*import\("\.\.\/video-editor\/VideoDesigncomboStage"\)/,
  );
  assert.match(route, /\{ ssr: false, loading: \(\) => null \}/);
  assert.match(route, /<VideoDesigncomboStage \{\.\.\.props\} \/>/);
  assert.match(route, /function VideoTimelineLegacyRoute/);
  assert.match(route, /useVideoTimeline/);
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
});

test("第二行不报 aux；mode.setMode 交给壳（专业编辑页）", () => {
  assert.match(route, /pages:\s*\{\s*\}/);
  assert.doesNotMatch(route, /aux:\s*\[/);
  assert.match(route, /setMode:\s*setEditorMode/);
});

test("professional mode uses buildSetModeMessage without postMessage", () => {
  assert.equal(VIDEO_DESIGNCOMBO_DEFAULT_MODE, "normal");
  assert.equal(DEFAULT_EDITOR_MODE, "normal");
  assert.match(leaf, /applyVideoDesigncomboMode/);
  assert.match(leaf, /useState<EditorMode>\(DEFAULT_EDITOR_MODE\)/);
  assert.match(leaf, /mode: \{\s*\n\s*current: mode,/);
  assert.doesNotMatch(routeCode, /postMessage/);
  assert.doesNotMatch(leafCode, /postMessage/);
  assert.doesNotMatch(routeCode, /buildSetModeMessage/);

  const normal = applyMode(VIDEO_DESIGNCOMBO_INSTANCE_ID, "normal");
  assert.equal(normal.mode, "normal");
  assert.equal(normal.chrome.header, false);
  assert.equal(normal.chrome.inspector, false);
  assert.equal(normal.message.type, "set-mode");
  assert.equal(normal.message.mode, "normal");

  const pro = applyMode(VIDEO_DESIGNCOMBO_INSTANCE_ID, "pro");
  assert.equal(pro.mode, "pro");
  assert.equal(pro.chrome.header, true);
  assert.equal(pro.chrome.inspector, true);
  assert.equal(pro.chrome.timelineChrome, true);
});

test("create-time chrome stays mounted: hide by display, do not dispose the project", () => {
  const chrome = videoDesigncomboChrome("normal");
  const hidden = [];
  const root = {
    setAttribute() {},
    querySelectorAll(selector) {
      hidden.push(selector);
      return [{ style: { display: "" } }];
    },
  };
  applyVideoDesigncomboChromeDom(root, chrome);
  assert.ok(hidden.length >= 3);
  assert.match(leaf, /engine\.dispose\(\)/);
  const disposeCount = leaf.split("engine.dispose(").length - 1;
  assert.equal(disposeCount, 1);
  assert.doesNotMatch(leaf, /setMode[\s\S]{0,120}dispose/);
  assert.match(leaf, /applyVideoDesigncomboChromeDom/);
});

test("legacy timeline UI is still in the tree", () => {
  assert.match(route, /<VideoTimelineStage state=\{editor\}/);
  assert.match(route, /createVideoCommandSurface/);
});

test("the leaf does not import remotion or sonner", () => {
  assert.doesNotMatch(leaf, /@remotion/);
  assert.doesNotMatch(leaf, /from "sonner"/);
  assert.match(leaf, /renderTimeline/);
  assert.match(leaf, /OPENVIDEO_PROJECT_SCHEMA/);
});

test("tools-manifest v2 exposes eight chips", () => {
  const manifest = videoToolsManifestChips();
  assert.equal(manifest.manifestVersion, 2);
  assert.equal(manifest.chips.length, 8);
});

test("agent command surface proposes review and never commits", () => {
  const runStart = leaf.indexOf("run: (id, params)");
  assert.ok(runStart >= 0);
  const chunk = leaf.slice(runStart, runStart + 1600);
  assert.match(chunk, /buildVideoReviewProposal/);
  assert.doesNotMatch(chunk, /\bcommit\(/);
  assert.match(chunk, /接受前不会写入时间线/);
});

test("the next-core leaf has no static openvideo or remotion imports", () => {
  assert.doesNotMatch(leafCode, /from ["']@openvideo\//);
  assert.doesNotMatch(leafCode, /from ["']@remotion\//);
  assert.doesNotMatch(routeCode, /from ["']@openvideo\//);
});

// ---------------------------------------------------------------------------
// A-48 行为闸：真调用 VideoTimelineRoute。源码正则是辅闸，不能当唯一闸。
// V6 批 2b：保留 if 行、函数体 return null，上面那些正则仍全绿。
// jsdom 没有 layout —— 这里钉的是 Route 返回的元素 type / 必需 prop，
// 不假装验了可见像素。Native 件没有 iframe，不承诺 iframe 刀。
// ---------------------------------------------------------------------------
const VIDEO_DYNAMIC_KEY = "__W09_VIDEO_DYNAMIC";

function videoFnExports(names, extra = "") {
  return dataModule(
    `${names.map((name) => `export function ${name}(){ return null; }`).join("\n")}\n${extra}`,
  );
}

const videoRouteStubs = {
  "next/dynamic": dataModule(`
    export default function dynamic(loader, opts) {
      function VideoDesigncomboDynamic() { return null; }
      VideoDesigncomboDynamic.displayName = "VideoDesigncomboDynamic";
      globalThis.${VIDEO_DYNAMIC_KEY} = { loader, opts, Stage: VideoDesigncomboDynamic };
      return VideoDesigncomboDynamic;
    }
  `),
  "../video-editor/VideoDesigncomboStage": dataModule(`
    export function VideoDesigncomboStage() { return null; }
  `),
  "../AdvancedWorkbenchShell": videoFnExports(["AdvancedWorkbenchShell"]),
  "../advanced-recovery-store": dataModule(
    `export function advancedRecoveryKey(){ return ""; }`,
  ),
  "../advanced-session": dataModule(
    `export function advancedSavedItem(){ return null; }`,
  ),
  "../workbench-routes": dataModule(
    `export function editorRouteFor(){ return ""; }\nexport function editorToolLabel(){ return ""; }`,
  ),
  "../plugin-command": dataModule(
    `export function usePluginCommandSurface(){ return {}; }`,
  ),
  "../video-editor/video-command-surface": dataModule(
    `export function createVideoCommandSurface(){ return {}; }`,
  ),
  "../media-editors/visual-convert-client": dataModule(
    `export async function downloadConvertedFromUrl(){}`,
  ),
  "../media-editors/visual-import-normalize": dataModule(
    `export function normalizeVisualUploads(){ return []; }`,
  ),
  "../media-editors/visual-formats": dataModule(
    `export const visualDownloadFormats = [];\nexport const visualUploadAccept = "";`,
  ),
  "../video-editor": videoFnExports(
    [
      "VideoTimelineControls",
      "VideoTimelineContextToolbar",
      "VideoTimelineStage",
      "useVideoTimeline",
    ],
  ),
  "../workbench-material-provider": dataModule(
    `export function useWorkbenchMaterialAdapter(){ return {}; }`,
  ),
  "../video-editor/timeline-viewport": dataModule(
    `export function timelineMsAtClientPoint(){ return 0; }`,
  ),
};

let videoRouteModPromise;

function installVideoFlagStorage() {
  const map = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
    },
    addEventListener() {},
  };
}

async function loadVideoTimelineRoute() {
  if (!videoRouteModPromise) {
    videoRouteModPromise = compileModule(
      "src/shell/advanced-routes/VideoTimelineRoute.tsx",
      videoRouteStubs,
    ).then((url) => import(url));
  }
  return videoRouteModPromise;
}

function videoWorkbenchProps() {
  const item = {
    key: "video-wire",
    source: "creation",
    id: "video-wire",
    title: "gate",
    kind: "video",
    siteId: "site",
    favorite: false,
    meta: {},
  };
  const onClose = () => {};
  return { item, onClose, siteId: "site", accent: "#4f46e5" };
}

function assertVideoNextMounted(node, Stage, props) {
  assert.ok(
    node,
    "翻到 next 档用户必须看到新核。把 if 体改成 return null、保留 if 那行，就是 V6 批 2b 那个洞。",
  );
  assert.equal(
    node.type,
    Stage,
    "next 档必须挂 dynamic 叶子。改成恒假分支、换成 div、外包一层，用户仍停在旧核。",
  );
  assert.equal(
    node.props.item,
    props.item,
    "上层必须把这份 item 交给新核。传 null 或不再展开 props，时间线对不上那份素材。",
  );
  assert.equal(
    node.props.onClose,
    props.onClose,
    "上层必须把 onClose 交给新核。传 null 用户关不掉工作台。",
  );
  assert.notEqual(node.props.item, null);
  assert.notEqual(node.props.onClose, null);
  assert.notEqual(
    node.props.hidden,
    true,
    "新核根节点不能带 hidden。jsdom 没有 layout，只钉属性，不假装量了可见像素。",
  );
  assert.notEqual(node.props["aria-hidden"], true);
}

test("next flag mounts the designcombo leaf with required props", async () => {
  const previousWindow = globalThis.window;
  installVideoFlagStorage();
  try {
    const { VideoTimelineRoute } = await loadVideoTimelineRoute();
    const captured = globalThis[VIDEO_DYNAMIC_KEY];
    assert.ok(captured?.Stage, "next/dynamic 必须接到加载函数。");
    assert.equal(captured.opts?.ssr, false);
    const loaded = await captured.loader();
    assert.equal(
      typeof loaded,
      "function",
      "dynamic 加载函数必须给出 VideoDesigncomboStage，不能 return null。",
    );
    assert.equal(loaded.name, "VideoDesigncomboStage");

    assert.equal(DEFAULT_EDITOR_CORE, "legacy");
    const props = videoWorkbenchProps();
    const legacyNode = VideoTimelineRoute(props);
    assert.ok(legacyNode, "默认档必须仍是旧核，不能是空白。");
    assert.notEqual(
      legacyNode.type,
      captured.Stage,
      "默认档必须走旧核。修闸不是放行。",
    );

    setEditorCoreOverride("video-timeline", "next");
    const nextNode = VideoTimelineRoute(props);
    assertVideoNextMounted(nextNode, captured.Stage, props);
    setEditorCoreOverride("video-timeline", null);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
