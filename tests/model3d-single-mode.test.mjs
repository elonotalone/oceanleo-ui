/**
 * 3D 编辑器只有一个模式（native-editors W03）：three.js 工作台，没有 Pro 页，
 * 没有托管 three.js editor iframe，没有 Edit/Pro 切换。
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (relative) => readFileSync(new URL(relative, root), "utf8");
const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const route = read("src/shell/advanced-routes/Model3DRoute.tsx");
const routeCode = strip(route);

function model3dOwnedFiles() {
  const dir = new URL("src/shell/media-editors/", root);
  const files = readdirSync(dir)
    .filter((name) => /model3d|use-model3d/i.test(name))
    .map((name) => `src/shell/media-editors/${name}`);
  files.push(
    "src/shell/advanced-routes/Model3DRoute.tsx",
    "src/shell/collab/adapters/model3d.ts",
  );
  return files;
}

test("hosted three.js editor face and its protocol helpers are deleted", () => {
  for (const gone of [
    "src/shell/media-editors/Model3DHostedFrame.tsx",
    "src/shell/media-editors/model3d-hosted-embed.ts",
    "src/shell/media-editors/Model3DNextStage.tsx",
    "src/shell/media-editors/model3d-next-mode.ts",
  ]) {
    assert.equal(existsSync(new URL(gone, root)), false, `${gone} must stay deleted`);
  }
});

test("no 3D file imports the hosted frame, mode gate, mode store or Pro handoff", () => {
  for (const file of model3dOwnedFiles()) {
    const code = strip(read(file));
    assert.doesNotMatch(code, /Model3DHostedFrame|model3d-hosted-embed/, file);
    assert.doesNotMatch(code, /usePluginMode|PluginModeSwitchGate|useModeSwitchReady/, file);
    assert.doesNotMatch(code, /w19-handoff-store|use-pro-face-save|enterProRef/, file);
    assert.doesNotMatch(code, /<iframe|embedEditorFrameSandbox|postMessage\(/, file);
    assert.doesNotMatch(code, /mode\s*===\s*["']pro["']|showHostedEditor/, file);
    assert.doesNotMatch(code, /3d\.oceanleo\.app/, file);
  }
});

test("the route renders the single three.js workbench with no core flag or Pro page", () => {
  assert.doesNotMatch(routeCode, /resolveEditorCore|dynamic\(/);
  assert.match(route, /return <Model3DModelRoute \{\.\.\.props\} \/>/);
  assert.doesNotMatch(routeCode, /\bmode:\s*\{/);
  assert.doesNotMatch(routeCode, /\bpages:\s*\{/);
  assert.doesNotMatch(routeCode, /proLabel|setMode/);
});

test("kept surfaces: workbench, director, collab, recovery, command surface", () => {
  assert.match(route, /useModel3DWorkbench/);
  assert.match(route, /<Model3DControls[\s\S]*editor=\{(?:editor|view)\}/);
  assert.match(route, /<Model3DContextToolbar[\s\S]*editor=\{(?:editor|view)\}/);
  assert.match(route, /<Model3DStage[\s\S]*editor=\{(?:editor|view)\}/);
  assert.match(read("src/shell/media-editors/Model3DControls.tsx"), /Model3DDirectorPanel/);
  assert.match(
    read("src/shell/media-editors/Model3DDirectorPanel.tsx"),
    /export function Model3DDirectorPanel/,
  );
  assert.match(route, /useEntityCollab/);
  assert.match(route, /recovery:\s*\{/);
  assert.match(route, /createModel3DCommandSurface/);
  assert.match(
    route,
    /id:\s*"model3d-save-screenshot",[\s\S]{0,160}group:\s*"download"/,
  );
});
