// W07: after opening a deck, can the user get back to "nothing selected" (slide bar + drawers)?
// args: <artifactId> [tag]
export default async function ({ page, log, shot, helpers, args }) {
  const [artifactId, tag = "deselect"] = args;
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
  const read = async (label) => {
    const state = await page.evaluate(() => ({
      kind: document.querySelector("[data-selection-kind]")?.getAttribute("data-selection-kind") || null,
      drawers: [...document.querySelectorAll("[data-edit-bar-drawer]")].map((el) => el.getAttribute("data-edit-bar-drawer")),
      selected: [...document.querySelectorAll("[data-deck-canvas] [data-deck-element][data-selected='true'], [data-deck-canvas] [data-deck-element][aria-selected='true']")].length,
      editing: Boolean(document.querySelector("[data-deck-canvas] [contenteditable='true']")),
      focus: document.activeElement?.tagName + (document.activeElement?.getAttribute("data-deck-element") != null ? "[element]" : ""),
    }));
    log(label, JSON.stringify(state));
    return state;
  };
  await read("open");
  await shot(`${tag}-open`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await read("after-esc");
  const stage = await page.locator("[data-deck-preview-stage]").first().boundingBox();
  if (stage) {
    await page.mouse.click(stage.x + 20, stage.y + stage.height - 60);
    await page.waitForTimeout(600);
  }
  await read("after-stage-click");
  const canvas = await page.locator("[data-deck-canvas]").first().boundingBox();
  if (canvas) {
    await page.mouse.click(canvas.x + canvas.width - 12, canvas.y + canvas.height - 12);
    await page.waitForTimeout(600);
  }
  await read("after-canvas-corner-click");
  await shot(`${tag}-after`);
  const drawer = page.locator("[data-edit-bar-drawer]").first();
  if (await drawer.count()) {
    for (const id of ["deck-design", "deck-elements", "deck-draw", "deck-lines", "deck-notes"]) {
      const button = page.locator(`[data-edit-bar-drawer="${id}"]`).first();
      if (!(await button.count())) {
        log("drawer-missing", id);
        continue;
      }
      await button.click();
      await page.waitForTimeout(900);
      const pressed = await button.getAttribute("aria-pressed");
      const panel = await page.evaluate(() => {
        const aside = [...document.querySelectorAll("aside, [role=dialog], [data-inline-panel]")].find((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 150 && r.height > 150 && !el.hasAttribute("data-edit-bar-avoid");
        });
        return aside ? aside.textContent.replace(/\s+/g, " ").slice(0, 160) : null;
      });
      log("drawer", id, "pressed=", pressed, "panel=", panel);
      await shot(`${tag}-drawer-${id}`);
      await button.click();
      await page.waitForTimeout(500);
    }
  }
}
