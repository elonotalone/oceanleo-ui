import assert from "node:assert/strict";
import { OWN_FORK, canvasInfo, openCanvas } from "./_w16-lib.mjs";

export default async function ({ page, context, log, shot, helpers, args }) {
  const isPublic = args.includes("--public");
  const initial = isPublic ? "9a864741-f446-49ba-8b8c-f33f69d776f1" : args[0] || OWN_FORK;
  const commits = [];
  let forks = 0;
  page.on("response", async response => {
    const url = new URL(response.url());
    if (response.request().method() !== "POST") return;
    if (/(?:\/|:)fork$/.test(url.pathname) && response.ok()) forks++;
    if (/\/v1\/artifacts\/[^/]+\/revisions$/.test(url.pathname)) {
      const body = await response.json().catch(() => ({}));
      log("revision", String(response.status()), body.revisionId || body.code || "");
      if (response.ok()) commits.push({ root: url.pathname.split("/")[3], revision: body.revisionId });
    }
  });
  await openCanvas(page, helpers, log, initial);
  const root = new URL(page.url()).searchParams.get("item") || initial;
  await page.waitForTimeout(2000);
  assert.equal(commits.length, 0, "open-only must not create a revision");
  const before = await canvasInfo(page);
  log("theme", JSON.stringify({ canvas: before.canvasTheme, bg: before.canvasBg, node: before.nodeBg }));
  await shot("01-open");
  const savedAfter = async mutate => {
    const count = commits.length;
    await mutate();
    for (let n = 0; n < 200 && commits.length === count; n++) await page.waitForTimeout(500);
    assert.equal(commits.length, count + 1, "one completed change must create one real revision");
    await helpers.waitSaved(page, { timeout: 90000 });
  };
  const stamp = `W16-${Date.now()}`;
  const rename = async (id, text) => {
    await page.keyboard.press("Escape");
    await page.locator(`[data-testid=video-canvas-node][data-node-id="${id}"]`).click({ force: true });
    await page.locator('[data-selection-control-id="selection-inspector-video-node-params"] button').first().click();
    const input = page.locator("[data-selection-inspector] textarea").first();
    await input.fill(text);
    await input.blur();
    await page.keyboard.press("Escape");
  };
  await savedAfter(() => rename("brief", `${stamp}-A`));
  await savedAfter(() => rename("shot-2", `${stamp}-B`));
  await page.reload({ waitUntil: "domcontentloaded" });
  await openCanvas(page, helpers, log, root);
  const reopened = await canvasInfo(page);
  assert.ok(reopened.nodes.some(node => node.text.includes(`${stamp}-A`)));
  assert.ok(reopened.nodes.some(node => node.text.includes(`${stamp}-B`)));
  log("reopen", "both changes retained");
  await shot("02-reopen");
  await context.setOffline(true);
  await rename("shot-2", `${stamp}-C`);
  for (let n = 0; n < 120 && (await helpers.saveState(page)) !== "error"; n++) await page.waitForTimeout(500);
  assert.equal(await helpers.saveState(page), "error");
  await shot("03-offline-error");
  const prior = commits.length;
  await context.setOffline(false);
  if ((await helpers.saveState(page)) === "error") {
    await page.locator("[data-workspace-save-launcher]").click();
    const retry = page.locator('[data-workspace-save-action-id="retry"]');
    if (await retry.isVisible().catch(() => false)) await retry.click();
  }
  for (let n = 0; n < 200 && commits.length === prior; n++) await page.waitForTimeout(500);
  assert.equal(commits.length, prior + 1);
  await helpers.waitSaved(page, { timeout: 90000 });
  assert.equal(new Set(commits.map(commit => commit.root)).size, 1, "saves stay on one root");
  if (isPublic) { assert.notEqual(root, initial); assert.equal(forks, 1); }
  await shot("04-retry-saved");
  log("PASS", JSON.stringify({ root, commits: commits.length, forks, public: isPublic }));
}
