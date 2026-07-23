import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const shellBarrel = source("../src/shell/index.ts");
const packageBarrel = source("../src/index.ts");
const workbenchBarrel = source("../src/facades/workbench.ts");

test("central package barrels aggregate only owner-controlled capability barrels", () => {
  for (const ownerBarrel of [
    "./video-editor/capabilities",
    "./media-editors/model3d-capabilities",
  ]) {
    assert.ok(
      shellBarrel.includes(`export * from "${ownerBarrel}";`),
      ownerBarrel,
    );
  }
  assert.match(packageBarrel, /export \* from "\.\/shell"/);
  assert.match(
    workbenchBarrel,
    /export \* from "\.\.\/shell\/video-editor\/capabilities"/,
  );
  assert.match(
    workbenchBarrel,
    /export \* from "\.\.\/shell\/media-editors\/model3d-capabilities"/,
  );
  assert.doesNotMatch(
    shellBarrel,
    /timeline-capability-engine|model3d-director(?:-runtime)?|model3d-playblast/,
  );
});

test("owner barrels expose timeline and director public contracts", async () => {
  const [timeline, director] = await Promise.all([
    import("../src/shell/video-editor/capabilities.ts"),
    import("../src/shell/media-editors/model3d-capabilities.ts"),
  ]);
  assert.equal(typeof timeline.createTimelineCompositeKernel, "function");
  assert.equal(typeof timeline.startTimelineSave, "function");
  assert.equal(typeof timeline.startTimelineRender, "function");
  assert.equal(typeof timeline.createGatewayTimelineRenderAdapter, "function");
  assert.equal(typeof director.createModel3DDirectorDocument, "function");
  assert.equal(typeof director.startModel3DPrevis, "function");
  assert.equal(typeof director.createModel3DPlayblastAdapter, "function");
});
