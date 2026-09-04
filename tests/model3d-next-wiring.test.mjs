/**
 * 3D 换核接线闸（W11）。
 *
 * 纯模块内容在 model3d-next-core / roundtrip。这里只问：有没有真接到
 * Model3DRoute、flag 是否顶层判一次、iframe 是否只在专业模式、旧核还在不在。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DEFAULT_EDITOR_CORE } from "../src/shell/editor-core-flags.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
import {
  UNTRUSTED_FRAME_SANDBOX,
  embedEditorFrameSandbox,
} from "../src/shell/editor-sandbox-origin.ts";
import {
  MODEL3D_NEXT_DEFAULT_MODE,
  applyModel3DNextMode,
} from "../src/shell/media-editors/model3d-next-mode.ts";
import { model3dToolsManifestChips } from "../src/shell/media-editors/model3d-next-l4-chips.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const route = read("src/shell/advanced-routes/Model3DRoute.tsx");
const leaf = read("src/shell/media-editors/Model3DNextStage.tsx");
const frame = read("src/shell/media-editors/Model3DHostedFrame.tsx");
const controls = read("src/shell/media-editors/Model3DControls.tsx");
const director = read("src/shell/media-editors/Model3DDirectorPanel.tsx");
const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const routeCode = strip(route);
const leafCode = strip(leaf);
const frameCode = strip(frame);

test("the dual-core flag is resolved once, at the top of the route", () => {
  assert.match(route, /if \(resolveEditorCore\("threed"\) === "next"\)/);
  assert.doesNotMatch(route, /from "@google\/model-viewer"/);
  assert.doesNotMatch(route, /from "three"/);
  assert.doesNotMatch(routeCode, /@google\/model-viewer/);
  assert.match(
    route,
    /dynamic\(\s*\(\) =>\s*import\("\.\.\/media-editors\/Model3DNextStage"\)/,
  );
  assert.match(route, /\{ ssr: false, loading: \(\) => null \}/);
  assert.match(route, /<Model3DNextStage \{\.\.\.props\} \/>/);
  assert.match(route, /function Model3DLegacyRoute/);
  assert.match(route, /function Model3DModelRoute/);
  assert.match(route, /useModel3DWorkbench/);
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
});

test("legacy kernel remains in the same route file", () => {
  assert.match(route, /adapter=\{\{/);
  assert.match(route, /flush:/);
  assert.match(route, /<Model3DControls[\s\S]*editor=\{editor\}/);
  assert.match(route, /<Model3DContextToolbar[\s\S]*editor=\{editor\}/);
  assert.match(route, /<Model3DStage[\s\S]*editor=\{editor\}/);
  assert.match(controls, /Model3DDirectorPanel/);
  assert.match(director, /export function Model3DDirectorPanel/);
});

test("default mode is normal; hosted iframe only appears in pro", () => {
  assert.equal(MODEL3D_NEXT_DEFAULT_MODE, "normal");
  assert.equal(MODEL3D_NEXT_DEFAULT_MODE, DEFAULT_EDITOR_MODE);
  const normal = applyModel3DNextMode("oceanleo-model3d-next", "normal");
  const pro = applyModel3DNextMode("oceanleo-model3d-next", "pro");
  assert.equal(normal.showHostedEditor, false);
  assert.equal(pro.showHostedEditor, true);
  assert.match(leaf, /useState<EditorMode>\(DEFAULT_EDITOR_MODE\)/);
  assert.match(leaf, /applyModel3DNextMode/);
  assert.match(leaf, /showHostedEditor/);
  assert.match(leaf, /frameMounted/);
  assert.match(leaf, /Model3DHostedFrame/);
  assert.match(leaf, /postModel3DSetMode/);
  assert.match(leaf, /postModel3DRecoveryCapture/);
  assert.match(leaf, /data-model3d-hosted-visible/);
  assert.doesNotMatch(routeCode, /postMessage/);
  assert.doesNotMatch(leafCode, /postMessage\(/);
});

test("hosted iframe sandbox is the untrusted hosted set, no same-origin", () => {
  assert.equal(
    embedEditorFrameSandbox("https://3d.oceanleo.app"),
    UNTRUSTED_FRAME_SANDBOX,
  );
  assert.doesNotMatch(UNTRUSTED_FRAME_SANDBOX, /allow-same-origin/);
  assert.match(frame, /embedEditorFrameSandbox/);
  assert.match(frame, /asHostToEditorMessage/);
  assert.match(frame, /isValidEditorTargetOrigin/);
  assert.doesNotMatch(frameCode, /allow-same-origin/);
  assert.doesNotMatch(frameCode, /postMessage\([^,]+,\s*["']\*["']/);
  assert.match(frame, /referrerPolicy="no-referrer"/);
});

test("L4 chips are wired into the next leaf", () => {
  assert.equal(model3dToolsManifestChips().chips.length, 8);
  assert.match(leaf, /model3dToolsManifestChips/);
  assert.match(leaf, /buildModel3DReviewProposal/);
  assert.match(leaf, /rememberEditorChips\("threed"/);
  assert.match(leaf, /rememberEditorChips\("model3d"/);
});

test("legacy conversion is an explicit button, not a load side effect", () => {
  assert.match(leaf, /planModel3DLegacyConversion/);
  assert.match(leaf, /转换为新 3D 工程/);
  assert.match(leaf, /MODEL3D_LEGACY_READONLY_NOTICE/);
  assert.match(leaf, /nextModel3DConversionState/);
});
