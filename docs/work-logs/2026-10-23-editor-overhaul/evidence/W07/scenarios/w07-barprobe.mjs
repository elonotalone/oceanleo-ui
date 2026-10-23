// W07: geometry of every edit-bar control for an image selection (invisible / clipped buttons).
// args: <artifactId> [type]
export default async function ({ page, log, shot, helpers, args }) {
  const [artifactId, type = "image"] = args;
  await helpers.gotoApp(page, `/library?item=${artifactId}`);
  await page.locator("[data-deck-thumbnail-rail], [data-workspace-save-launcher]").first().waitFor({ timeout: 150000 });
  await page.waitForTimeout(1500);
  if (!(await page.locator("[data-workspace-save-launcher]").count())) {
    const name = await page.evaluate(() =>
      [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.title || "").find((l) => /^编辑「|^Edit /.test(l)),
    );
    if (name) await page.getByRole("button", { name, exact: true }).first().click();
  }
  await page.locator("[data-deck-canvas]").first().waitFor({ timeout: 150000 });
  await page.waitForTimeout(3000);
  await page.locator(`[data-deck-canvas] [data-deck-element][data-element-type=${type}]`).first().click({ force: true });
  await page.waitForTimeout(1200);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("[data-selection-control-id]")].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return `${el.getAttribute("data-selection-control-id")} x=${Math.round(r.x)} w=${Math.round(r.width)} y=${Math.round(r.y)} vis=${cs.visibility} op=${cs.opacity} svg=${el.querySelector("svg") ? 1 : 0} txt=${el.textContent.trim().slice(0, 20)}`;
    }),
  );
  for (const row of rows) log("ctl", row);
  await shot(`barprobe-${type}`);
}
