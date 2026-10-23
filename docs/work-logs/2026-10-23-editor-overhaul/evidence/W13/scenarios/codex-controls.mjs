import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { waitModelReady, clickStageCenter, editBarInfo, surfaceColors } from "./lib.mjs";
import { openEditorByItem } from "../../V01/scenarios/_v01-lib.mjs";

export default async function ({ page, helpers, log, shot, args, outDir }) {
  const writes = [];
  const sources = [];
  const settle = async (count) => {
    const started = Date.now();
    while (writes.length < count && Date.now() - started < 90000) await page.waitForTimeout(250);
    assert.equal(writes.length, count); assert.ok(writes.every((status) => status === 200));
    await helpers.waitSaved(page, { timeout: 30000 });
  };
  page.on("response", (r) => {
    const request = r.request();
    if (request.method() === "POST" && /\/revisions$/.test(new URL(r.url()).pathname)) writes.push(r.status());
    if (request.method() === "GET" && /gltf-binary|octet-stream/.test(r.headers()["content-type"] || "")) {
      sources.push(r.body().then((b) => {
        if (b.length > 20 && b.toString("ascii", 0, 4) === "glTF") {
          fs.writeFileSync(path.join(outDir, "source.glb"), b);
          const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
          log("GLB", b.length, JSON.stringify({ nodes: json.nodes, materials: json.materials }));
          const color = json.materials.find((m) => m.name === "Orange").pbrMetallicRoughness.baseColorFactor;
          [0.95, 0.5, 0.2, 1].forEach((value, i) => assert.ok(Math.abs(value - color[i]) < 0.001, "authored material changed"));
          return true;
        }
        return false;
      }).catch((error) => { log("GLB read", error.message); return false; }));
    }
  });
  assert.ok(await openEditorByItem(page, helpers, "[W13] sample.glb", log, { id: args[0] }));
  await waitModelReady(page, log, 90000);
  await page.waitForTimeout(2000);
  assert.equal((await editBarInfo(page)).kind, null);
  await clickStageCenter(page);
  const control = (id) => page.locator(`[data-selection-control-id="${id}"] button:visible`).first();
  await control("selection-inspector-model-material").click();
  await page.getByRole("textbox", { name: "基础色 HEX", exact: true }).waitFor();
  await shot("material-inspector");
  log("material HEX", await page.getByRole("textbox", { name: "基础色 HEX", exact: true }).inputValue());
  // Toggle the same inspector off without sending Escape to the entire editor.
  await control("selection-inspector-model-material").click();
  log("bar", JSON.stringify(await editBarInfo(page)), "surfaces", JSON.stringify(await surfaceColors(page)));
  await shot("canonical-theme");
  if (args[1] !== "read-only") {
    const stage = page.locator('[data-testid="model3d-stage-backdrop"]');
    const selected = await stage.getAttribute("data-model3d-selected-node");
    const before = JSON.parse(await stage.getAttribute("data-model3d-selected-transform"));
    await control("duplicate").click();
    assert.notEqual(await stage.getAttribute("data-model3d-selected-node"), selected);
    const copy = JSON.parse(await stage.getAttribute("data-model3d-selected-transform"));
    assert.ok(copy.position[0] > before.position[0]);
    await settle(1);
    await shot("duplicated");
    await control("delete").click();
    await settle(2);
    assert.equal(await stage.getAttribute("data-model3d-selected-node"), "");
    await shot("deleted");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await settle(3);
    await shot("undo-delete");
  }
  const extracted = (await Promise.all(sources)).some(Boolean);
  assert.ok(extracted, "no independently parsed source GLB");
  log("PASS canonical material/duplicate/delete/theme, authored GLB color", JSON.stringify(writes));
}
