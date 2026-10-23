import assert from "node:assert/strict";

export async function openDeck(page, helpers, id) {
  await helpers.gotoApp(page, `/library?item=${id}`);
  const start = Date.now();
  while (!(await page.locator("[data-workspace-save-launcher]").count())) {
    const edit = page.locator("[data-artifact-action=edit]").first();
    if (await edit.isEnabled().catch(() => false)) await edit.click({ timeout: 5000 }).catch(() => {});
    if (Date.now() - start > 150000) throw new Error("deck editor never mounted");
    await page.waitForTimeout(1000);
  }
  await page.locator("[data-deck-canvas] [data-deck-element]").first().waitFor({ timeout: 150000 });
  await page.getByText(/Loading presentation|正在载入演示文稿/).first().waitFor({ state: "hidden", timeout: 150000 });
  await page.waitForTimeout(2000);
}

export default async function ({ page, helpers, log, shot, args }) {
  const writes = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && /\/revisions$/.test(url.pathname)) {
      writes.push(url.pathname);
      const body = request.postDataJSON();
      log("UNEXPECTED revision", url.pathname, "provenance", JSON.stringify(body.provenance || {}));
    }
  });
  await openDeck(page, helpers, args[0]);
  await page.waitForTimeout(12000);
  await shot("open-only");
  log("opened", await helpers.saveState(page), await page.locator("[data-deck-canvas]").getAttribute("data-deck-edit-revision"), await page.locator("[data-deck-canvas]").getAttribute("data-deck-dirty"));
  await page.locator("button[aria-label*='Close']:visible,button[aria-label*='关闭']:visible").first().click();
  await page.waitForTimeout(5000);
  await openDeck(page, helpers, args[0]);
  await page.waitForTimeout(10000);
  await shot("reopened-only");
  await page.reload({ waitUntil: "domcontentloaded" });
  await openDeck(page, helpers, args[0]);
  await page.waitForTimeout(10000);
  await shot("reloaded-only");
  log("revision-posts", writes.length);
  assert.equal(writes.length, 0, "opening, closing and reloading must not publish a revision");
}
