import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { openEditorByItem } from "../../V01/scenarios/_v01-lib.mjs";
import { waitModelReady } from "./lib.mjs";

async function durable(context, root, outDir, name) {
  const encoded = (await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-kvrtcumcmhyqhmawpzyc-auth-token"))
    .sort((a, b) => a.name.localeCompare(b.name)).map((cookie) => cookie.value).join("");
  const session = JSON.parse(Buffer.from(encoded.replace(/^base64-/, ""), "base64url").toString());
  const base = "http://127.0.0.1:8008";
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const itemResponse = await fetch(`${base}/v1/library/items/${root}`, { headers });
  assert.equal(itemResponse.status, 200);
  const item = await itemResponse.json();
  const grantResponse = await fetch(`${base}/v1/artifacts/${root}/revisions/${item.revisionId}/renditions/source?mode=source`, { headers });
  assert.equal(grantResponse.status, 200);
  const grant = await grantResponse.json();
  const access = new URL(grant.accessUrl, base);
  const response = await fetch(`${base}${access.pathname}${access.search}`, { headers });
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  fs.writeFileSync(path.join(outDir, `${name}.glb`), bytes);
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  return { revisionId: item.revisionId, meshCount: doc.nodes.filter((node) => node.mesh !== undefined).length };
}

export default async function ({ page, context, helpers, log, shot, args, outDir }) {
  const root = args[0]; const writes = []; let uploads = 0;
  await context.route("**/v1/database/upload", (route) => { uploads++; return route.abort(); });
  page.on("response", (response) => {
    if (response.request().method() === "POST" && /\/revisions$/.test(new URL(response.url()).pathname)) {
      writes.push(response.status()); log("revision", response.status());
    }
  });
  const stage = page.locator('[data-testid="model3d-stage-backdrop"]');
  const open = async () => {
    assert.ok(await openEditorByItem(page, helpers, "[W13] sample.glb", log, { id: root }));
    await waitModelReady(page, log, 90000);
  };
  const settle = async (count, meshes) => {
    await page.waitForFunction(({ count, selector }) => Number(document.querySelector(selector)?.getAttribute("data-model3d-mesh-count")) === count,
      { count: meshes, selector: '[data-testid="model3d-stage-backdrop"]' }, { timeout: 45000 });
    const started = Date.now();
    while (writes.length < count && Date.now() - started < 90000) await page.waitForTimeout(250);
    assert.equal(writes.length, count); assert.ok(writes.every((status) => status === 200));
    await helpers.waitSaved(page, { timeout: 30000 });
    assert.equal(uploads, 0, "private shelf source was reuploaded through legacy public storage");
  };
  await open();
  const initial = Number(await stage.getAttribute("data-model3d-mesh-count"));
  assert.equal(initial, 2, "expected existing restored two-mesh fixture");
  await page.locator('[data-workspace-library-panel="materials"]').first().click();
  const shelf = page.locator("[data-inline-insertable-materials]");
  await shelf.waitFor(); await shelf.getByRole("searchbox").fill("[V01] sample.glb");
  const card = shelf.locator('[draggable="true"]').filter({ hasText: "[V01] sample.glb" }).first();
  await card.waitFor({ timeout: 45000 }); await shot("private-model-shelf");
  await card.click(); await settle(1, 1);
  const replaced = await durable(context, root, outDir, "replaced");
  assert.equal(replaced.meshCount, 1); log("durable replacement", JSON.stringify(replaced));
  await shot("scene-replaced");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settle(2, initial);
  const undone = await durable(context, root, outDir, "undo-replacement");
  assert.equal(undone.meshCount, initial); assert.notEqual(undone.revisionId, replaced.revisionId);
  await shot("replacement-undone");
  await page.reload({ waitUntil: "domcontentloaded" }); await open();
  assert.equal(Number(await stage.getAttribute("data-model3d-mesh-count")), initial);
  assert.equal(writes.length, 2); assert.equal(uploads, 0);
  await shot("replacement-undo-cold-reopened");
  log("PASS private scene replacement + typed save + Undo + cold reopen", JSON.stringify(writes));
}
