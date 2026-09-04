/**
 * V9-red-4 / A-94 / W29：一键转换必须带走旧工程的相机方位。
 *
 * 夹具数字来自 `tests/model3d-next-core.test.mjs` 的 LEGACY_PROJECT.view
 * （azimuth 12 / elevation 40 / zoom 120）。默认视角是 35 / 65 / 110。
 * 既有闸只锁「能转、会点名丢掉 operation journal」，不断言转换后的 view。
 *
 * 把方位角改成默认 35、或只改 elevation / zoom，闸都要红：
 * 用户转过去之后镜头朝向变了。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { planModel3DLegacyConversion } from "../src/shell/media-editors/model3d-next-conversion.ts";
import { DEFAULT_MODEL3D_VIEW } from "../src/shell/media-editors/model3d-workbench-defaults.ts";

const LEGACY_PROJECT = {
  schema: "oceanleo.three-editor@2",
  data: {
    provenance: { sourceUrl: "https://asset.oceanleo.com/user/model.glb" },
    operations: [{ id: "op-1" }, { id: "op-2" }],
    view: { azimuth: 12, elevation: 40, zoom: 120, autoRotate: true },
  },
};

const LENS_MOVED = "用户转过去之后镜头朝向变了";

test("一键转换后的相机方位必须等于旧工程，不能换成默认视角", () => {
  assert.equal(
    LEGACY_PROJECT.data.view.azimuth,
    12,
    "本闸用的必须是既有夹具的方位角 12，不是另造的默认视角",
  );
  assert.notEqual(
    LEGACY_PROJECT.data.view.azimuth,
    DEFAULT_MODEL3D_VIEW.azimuth,
    "夹具方位角若等于默认 35，这条闸会自问自答，锁不住「带走旧值」",
  );
  assert.notEqual(LEGACY_PROJECT.data.view.elevation, DEFAULT_MODEL3D_VIEW.elevation);
  assert.notEqual(LEGACY_PROJECT.data.view.zoom, DEFAULT_MODEL3D_VIEW.zoom);

  const planned = planModel3DLegacyConversion(LEGACY_PROJECT);
  assert.equal(planned.ok, true, "旧工程带源地址时转换必须成功，否则用户走不到新核");
  if (!planned.ok) return;

  const view = planned.data.view;
  assert.equal(view.azimuth, LEGACY_PROJECT.data.view.azimuth, LENS_MOVED);
  assert.equal(view.elevation, LEGACY_PROJECT.data.view.elevation, LENS_MOVED);
  assert.equal(view.zoom, LEGACY_PROJECT.data.view.zoom, LENS_MOVED);
});
