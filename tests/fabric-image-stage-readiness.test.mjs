// UC-NONE: readiness readback only, no permission or trust changes. Real component/inventory.
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const { FabricImageStage } = await import(await compileModule(
  "src/shell/image-editor/FabricImageStage.tsx",
  { "../../i18n/ui/useUI": dataModule("export function useUI(){return text=>text}") },
));

function render(sourceReady, { locked = false, background = false, loading = false } = {}) {
  return renderToStaticMarkup(React.createElement(FabricImageStage, { editor: {
    sourceReady, loading, layers: [{ id: "picture", kind: "image", locked,
      isBackground: background, visible: true }],
    selected: null, dirty: false, editRevision: 0, zoom: 1,
    doc: { width: 100, height: 100 }, cropping: false,
    stageContainerRef() {}, stageCanvasRef() {},
  } }));
}

test("native readback follows the production source-ready gate", () => {
  assert.match(render(true), /data-editor-source-ready="true"/);
  assert.match(render(false), /data-editor-source-ready="false"/);
  assert.match(render(undefined), /data-editor-source-ready="false"/);
});
test("a locked loaded image is ready even with no unlocked image layers", () => {
  const html = render(true, { locked: true });
  assert.match(html, /data-editor-unlocked-image-count="0"/);
  assert.match(html, /data-editor-source-ready="true"/);
});
test("a background or nonempty canvas cannot make a failed source ready", () => {
  const html = render(false, { background: true });
  assert.match(html, /data-editor-layer-count="1"/);
  assert.match(html, /data-editor-source-ready="false"/);
});
test("loading and source readiness remain independent host observations", () => {
  const html = render(false, { loading: true });
  assert.match(html, /data-editor-loading="true"/);
  assert.match(html, /data-editor-source-ready="false"/);
});
