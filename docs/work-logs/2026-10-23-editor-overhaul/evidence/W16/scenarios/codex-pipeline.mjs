import assert from "node:assert/strict";
import { OWN_FORK, canvasInfo, openCanvas } from "./_w16-lib.mjs";

export default async function ({ page, log, shot, helpers, args }) {
  const kind = args.includes("--video") ? "video" : args.includes("--audio") ? "audio" : "image";
  const ext = kind === "video" ? "mp4" : kind === "audio" ? "mp3" : "png";
  const root = args.find(arg => !arg.startsWith("--")) || OWN_FORK;
  const mediaReady = id => {
    const media = document.querySelector(`[data-node-id="${id}"] img, [data-node-id="${id}"] video, [data-node-id="${id}"] audio`);
    return media?.tagName === "IMG" ? media.complete && media.naturalWidth > 0 : media?.readyState >= 1;
  };
  const commits = [];
  page.on("response", async response => {
    const url = new URL(response.url());
    if (response.request().method() !== "POST") return;
    if (/\/v1\/artifacts\/[^/]+\/(?:staging|revisions)$/.test(url.pathname)) {
      const body = await response.json().catch(() => ({}));
      log("write", url.pathname.endsWith("staging") ? "staging" : "revision", String(response.status()), body.code || "");
      if (url.pathname.endsWith("revisions") && response.ok()) commits.push(body.revisionId || body.revision_id);
    }
  });
  await helpers.uploadFiles(page, [`/tmp/[W16] private ${kind}.${ext}`]);
  await page.waitForTimeout(1500);
  await openCanvas(page, helpers, log, root);
  const before = await canvasInfo(page);
  await page.locator('[data-workspace-library-panel="materials"]').first().click();
  const shelf = page.locator("[data-inline-insertable-materials]");
  await shelf.waitFor({ timeout: 45000 });
  await shelf.getByRole("searchbox").fill(`[W16] private ${kind}`);
  const card = shelf.locator("[draggable=true]").first();
  await card.waitFor({ timeout: 60000 });
  await shot("01-material-shelf");
  const prior = commits.length;
  await card.click();
  await page.waitForFunction(count => document.querySelectorAll("[data-testid=video-canvas-node]").length === count + 1, before.nodes.length, { timeout: 60000 });
  const after = await canvasInfo(page);
  const added = after.nodes.find(node => !before.nodes.some(previous => previous.id === node.id));
  assert.ok(added);
  for (let n = 0; n < 200 && commits.length === prior; n++) await page.waitForTimeout(500);
  assert.equal(commits.length, prior + 1);
  await helpers.waitSaved(page, { timeout: 90000 });
  await shot("02-inserted-saved");
  // One undo removes both node and asset, redo restores the whole insertion.
  await page.getByRole("button", { name: /^(Undo|撤销)$/ }).click();
  assert.equal((await canvasInfo(page)).nodes.length, before.nodes.length);
  await page.getByRole("button", { name: /^(Redo|重做)$/ }).click();
  assert.equal((await canvasInfo(page)).nodes.length, before.nodes.length + 1);
  await page.waitForFunction(mediaReady, added.id, { timeout: 5000 });
  const nextPrior = commits.length;
  for (let n = 0; n < 200 && commits.length === nextPrior; n++) await page.waitForTimeout(500);
  assert.equal(commits.length, nextPrior + 1);
  await helpers.waitSaved(page, { timeout: 90000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await openCanvas(page, helpers, log, root);
  const reopened = await canvasInfo(page);
  assert.ok(reopened.nodes.some(node => node.id === added.id));
  await page.waitForFunction(mediaReady, added.id, { timeout: 45000 });
  await shot("03-reopened-media");
  log("PASS", JSON.stringify({ root, kind, node: added.id, nodes: [before.nodes.length, reopened.nodes.length], commits: commits.length }));
}
