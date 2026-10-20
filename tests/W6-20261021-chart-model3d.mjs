/**
 * W6: chart mutate / history and 3D local markDirty increment the shared
 * user-edit generation. Remote chart apply and 3D bootstrap do not.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  resetUserEditSession,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

function lightStubs(extra = {}) {
  return {
    "../../i18n/ui/useUI": dataModule(
      "const tt = (zh) => zh; export function useUI() { return tt; }",
    ),
    ...extra,
  };
}

const chart = await import(
  await compileModule(
    "src/shell/chart-editor/use-chart-workbench.ts",
    lightStubs(),
  )
);
const model3d = await import(
  await compileModule(
    "src/shell/media-editors/use-model3d-workbench.ts",
    lightStubs(),
  )
);

function itemFor(id) {
  return { key: `artifact:${id}:r1`, id };
}

test("chart mutate and history increment userMutationGeneration", () => {
  resetUserEditSession();
  const item = itemFor("chart-w6");
  assert.equal(userMutationGeneration(item.key), 0);
  assert.equal(chart.applyChartUserEditSession(item, "mutate"), 1);
  assert.equal(chart.applyChartUserEditSession(item, "history"), 2);
  assert.equal(userMutationGeneration(item.key), 2);
});

test("chart applyRemoteDocument / load / recovery do not record", () => {
  resetUserEditSession();
  const item = itemFor("chart-w6-remote");
  assert.equal(chart.applyChartUserEditSession(item, "remote-document"), 0);
  assert.equal(chart.applyChartUserEditSession(item, "applyRemoteDocument"), 0);
  assert.equal(chart.applyChartUserEditSession(item, "load"), 0);
  assert.equal(chart.applyChartUserEditSession(item, "recovery"), 0);
  chart.applyChartUserEditSession(item, "mutate");
  assert.equal(chart.applyChartUserEditSession(item, "remote-document"), 1);
  assert.equal(userMutationGeneration(item.key), 1);
});

test("3d local markDirty increments; bootstrap and recovery do not", () => {
  resetUserEditSession();
  const item = itemFor("model3d-w6");
  assert.equal(model3d.applyModel3dUserEditSession(item, "bootstrap"), 0);
  assert.equal(
    model3d.applyModel3dUserEditSession(item, "recovery-restore"),
    0,
  );
  assert.equal(model3d.applyModel3dUserEditSession(item, "local-dirty"), 1);
  assert.equal(model3d.applyModel3DUserEditSession(item, "local-dirty"), 2);
  assert.equal(model3d.applyModel3dUserEditSession(item, "bootstrap"), 2);
  assert.equal(userMutationGeneration(item.key), 2);
});
