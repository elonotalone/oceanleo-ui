export default async function ({ page, log, helpers, args }) {
  const [artifactId] = args;
  await helpers.gotoApp(page, `/library?item=${artifactId}`);
  await page.locator("[data-deck-thumbnail-rail], [data-workspace-save-launcher]").first().waitFor({ timeout: 150000 });
  await page.waitForTimeout(1500);
  if (!(await page.locator("[data-workspace-save-launcher]").count())) {
    const name = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || "").find((l) => /^编辑「/.test(l)));
    if (name) await page.getByRole("button", { name, exact: true }).first().click();
  }
  await page.locator("[data-deck-canvas]").first().waitFor({ timeout: 150000 });
  await page.getByText(/Loading presentation|正在载入演示文稿/).first().waitFor({ state: "hidden", timeout: 150000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.locator("[data-deck-canvas] [data-deck-element][data-element-type=text]").first().click({ force: true });
  await page.waitForTimeout(800);
  for (const id of ["selection-inspector-link"]) {
    const all = page.locator(`[data-selection-control-id="${id}"]`); log("count", id, await all.count(), await page.evaluate(() => document.querySelector("[data-selection-kind]")?.getAttribute("data-selection-kind"))); const ctl = all.first();
    log("ctl-html", id, (await ctl.evaluate((el) => el.outerHTML.slice(0, 600))));
    const before = await page.evaluate(() => document.body.querySelectorAll("*").length);
    const color = ctl.locator("input[type=color]").first();
    if (await color.count()) {
      const before = await page.locator("[data-deck-canvas] [data-deck-element][data-element-type=text]").first().evaluate((el) => el.outerHTML);
      await color.fill("#e11d48");
      await page.waitForTimeout(700);
      const after = await page.locator("[data-deck-canvas] [data-deck-element][data-element-type=text]").first().evaluate((el) => el.outerHTML);
      log("color-diff", id, before === after ? "same" : "changed", after.slice(0, 400));
      continue;
    }
    await ctl.locator("button").first().click();
    await page.waitForTimeout(700);
    const info = await page.evaluate(() => {
      const open = [...document.querySelectorAll("[aria-expanded=true]")].map((b) => b.getAttribute("aria-controls"));
      const panels = open.map((id) => { const el = id && document.getElementById(id); return el ? `${id}: vis=${el.getBoundingClientRect().width}x${el.getBoundingClientRect().height} ${el.outerHTML.slice(0, 500)}` : `${id}: missing`; });
      return { open, panels };
    });
    await page.screenshot({ path: `/tmp/w07-pop/open-${id}.png` });
    log("after", id, JSON.stringify(info).slice(0, 1500));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
}
