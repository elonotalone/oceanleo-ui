import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  IMAGE_AI_PANEL_CAPABILITIES,
  IMAGE_DIRECT_COMMAND_REGISTRY,
  IMAGE_MAX_DIMENSION,
  classifyImageAiFailure,
  imageUpscalePreflight,
  startImageDirectCommand,
} from "../src/shell/image-editor/image-capability-engine.ts";
import {
  IMAGE_EDITOR_RETIRED_AI_IDS,
  imageEditorOfferedUiAiIds,
} from "../src/shell/image-editor/image-editor-ui-offerings.ts";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const PANEL = "../src/shell/image-editor/FabricImageCreationPanels.tsx";
const ROUTE = "../src/shell/advanced-routes/ImageRoute.tsx";

test("the image editor UI does not offer the retired AI panel capabilities", () => {
  assert.deepEqual([...IMAGE_AI_PANEL_CAPABILITIES], []);
  const offered = imageEditorOfferedUiAiIds();
  for (const id of IMAGE_EDITOR_RETIRED_AI_IDS) {
    assert.equal(offered.includes(id), false, `${id} leaked into the offered set`);
  }
  const panel = source(PANEL);
  assert.doesNotMatch(panel, /export function FabricImageAiPanel/);
  assert.doesNotMatch(panel, /补充说明（选填）/);
  assert.doesNotMatch(panel, /开始抠图|放大高清|人像精修|重新打光|扩展画面|全景延展/);
  const route = source(ROUTE);
  assert.doesNotMatch(route, /FabricImageAiPanel/);
  assert.doesNotMatch(route, /id: "image-ai"/);
  assert.doesNotMatch(route, /id: "image-cutout"/);
  assert.doesNotMatch(route, /抠图（背景变透明）/);
});

test("ordinary canvas panels remain after the AI panel is gone", () => {
  const panel = source(PANEL);
  assert.match(panel, /export function FabricImageBrushPanel/);
  assert.match(panel, /export function FabricImageShapePanel/);
  assert.match(panel, /export function FabricImageFilterPanel|export function FabricImageExportPanel/);
});

test("remove-bg stays an engine-only direct command, not a UI offering", () => {
  const cutout = IMAGE_DIRECT_COMMAND_REGISTRY.find((e) => e.id === "remove-bg");
  assert.ok(cutout);
  assert.equal(cutout.endpoint, "/v1/images/remove-bg");
  const route = source(ROUTE);
  assert.doesNotMatch(route, /\/v1\/images\/remove-bg/);
});

test("upscale math is not shown in the image editor UI", () => {
  assert.equal(IMAGE_MAX_DIMENSION, 8192);
  const tooBig = imageUpscalePreflight(4096, 4096, 4);
  assert.equal(tooBig.ok, false);
  const panel = source(PANEL);
  assert.doesNotMatch(panel, /imageUpscalePreflight/);
  assert.doesNotMatch(panel, /\{upscale\.width\}×/);
});

test("direct-command cancel and failure classification still work in the engine", async () => {
  let observedSignal = null;
  const executor = (_id, input) =>
    new Promise((_resolve, reject) => {
      observedSignal = input.signal;
      input.signal.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
    });
  const handle = startImageDirectCommand(
    executor,
    "remove-bg",
    { sourceUrl: "https://cdn.example.com/a.png" },
    {},
  );
  handle.cancel();
  const result = await handle.result;
  assert.equal(result.status, "canceled");
  assert.ok(observedSignal.aborted);
  const failure = classifyImageAiFailure(
    Object.assign(new Error("boom"), { status: 402 }),
  );
  assert.equal(failure.kind, "quota");
});
