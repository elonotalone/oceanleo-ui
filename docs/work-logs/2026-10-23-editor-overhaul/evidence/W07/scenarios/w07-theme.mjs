// W07 theme pass: deck editor surfaces in the current THEME; text/image/shape bars, a panel, the "more" menu.
// args: <artifactId> [tag]
export default async function ({ page, log, shot, helpers, args }) {
  const [artifactId, tag = "theme"] = args;
  await helpers.gotoApp(page, `/library?item=${artifactId}`);
  await page.locator("[data-deck-thumbnail-rail], [data-workspace-save-launcher]").first().waitFor({ timeout: 150000 });
  await page.waitForTimeout(1500);
  if (!(await page.locator("[data-workspace-save-launcher]").count())) {
    const name = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .map((b) => b.getAttribute("aria-label") || b.title || "")
        .find((label) => /^编辑「|^Edit /.test(label)),
    );
    if (name) await page.getByRole("button", { name, exact: true }).first().click();
  }
  await page.locator("[data-deck-canvas]").first().waitFor({ timeout: 150000 });
  await page.getByText(/Loading presentation|正在载入演示文稿/).first().waitFor({ state: "hidden", timeout: 150000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const surfaces = await page.evaluate(() => {
    const bg = (selector) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el).backgroundColor : null;
    };
    return {
      html: document.documentElement.className.slice(0, 60),
      pluginTheme: document.querySelector("[data-plugin-theme]")?.getAttribute("data-plugin-theme") || null,
      rail: bg("aside[data-edit-bar-avoid]"),
      stage: bg("[data-deck-preview-stage]"),
      layout: bg("[data-deck-preview-layout]"),
      canvas: bg("[data-deck-canvas]"),
    };
  });
  log("surfaces", JSON.stringify(surfaces));
  await shot(`${tag}-empty`);
  for (const type of ["text", "image", "shape"]) {
    const target = page.locator(`[data-deck-canvas] [data-deck-element][data-element-type=${type}]`).first();
    if (!(await target.count())) continue;
    await target.click({ force: true });
    await page.waitForTimeout(900);
    const bar = await page.evaluate(() => {
      const root = document.querySelector("[data-selection-kind]");
      return `${root?.getAttribute("data-selection-visible-controls")} | more: ${root?.getAttribute("data-selection-overflow-controls")}`;
    });
    log(`bar-${type}`, bar);
    await shot(`${tag}-bar-${type}`);
    if (type === "text") {
      const stroke = page.locator('[data-selection-control-id="stroke"] button').first();
      if (await stroke.count()) {
        await stroke.click();
        await page.waitForTimeout(700);
        await shot(`${tag}-panel-stroke`);
        await page.keyboard.press("Escape");
      }
      const more = page.locator("[data-selection-kind] button[aria-haspopup=dialog]").last();
      if (await more.count()) {
        await more.click();
        await page.waitForTimeout(700);
        await shot(`${tag}-more`);
        await page.keyboard.press("Escape");
      }
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
}
