// W03: open an editor from My library, select each object type, record the unified edit bar.
// args: <artifactId> <deck|image> [tag]
// Per selection: control ids, canonical ids, icon names (svg data-icon), duplicate icons,
// tools-trigger count, and whether the expanded bar overlaps any [data-edit-bar-avoid] sidebar.
export default async function ({ page, log, shot, helpers, args }) {
  const [artifactId, mode = "deck", tag = "w03"] = args;
  if (!artifactId) throw new Error("artifact id required");
  await helpers.gotoApp(page, `/library?item=${artifactId}`);
  const ready = mode === "deck" ? "[data-deck-canvas]" : "[data-editor-loading='false']";
  for (let i = 0; i < 40; i += 1) {
    if (await page.locator(ready).count()) break;
    if (await page.locator("[data-library-retry]").count()) {
      await page.locator("[data-library-retry]").first().click().catch(() => {});
    }
    const preview = page.locator('button[aria-label^="预览「"], button[aria-label^="Preview"]').first();
    if (i === 6 && (await preview.count())) await preview.click().catch(() => {});
    const edit = page
      .locator('button[aria-label="编辑"], button[aria-label="Edit"], button[title="编辑"], button[title="Edit"]')
      .or(page.locator("button, a").filter({ hasText: /^(编辑|Edit)$/ }))
      .first();
    if (i >= 3 && i % 3 === 0 && (await edit.count())) await edit.click().catch(() => {});
    await page.waitForTimeout(3000);
  }
  await page.locator(ready).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
  await shot(`${tag}-open`);

  const barInfo = () =>
    page.evaluate(() => {
      const root = document.querySelector("[data-selection-kind]");
      const cells = [...document.querySelectorAll("[data-selection-control-id]")].filter(
        (cell) => !cell.closest("[data-selection-toolbar-measurements]"),
      );
      const controls = cells.map((cell) => ({
        id: cell.getAttribute("data-selection-control-id"),
        canon: cell.getAttribute("data-edit-bar-canon") || "",
        icon: cell.querySelector("svg[data-icon]")?.getAttribute("data-icon") || "",
        label:
          cell.querySelector("button, input")?.getAttribute("aria-label") ||
          (cell.textContent || "").trim().slice(0, 24),
      }));
      const icons = controls.map((control) => control.icon).filter(Boolean);
      const bar = document.querySelector("[data-workspace-edit-bar]")?.getBoundingClientRect();
      const overlaps = [...document.querySelectorAll("[data-edit-bar-avoid]")]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => bar && r.width > 0 && bar.left < r.right && bar.right > r.left && bar.top < r.bottom && bar.bottom > r.top)
        .map((r) => `${Math.round(r.left)}..${Math.round(r.right)}`);
      return {
        kind: root?.getAttribute("data-selection-kind") || null,
        bar: root?.getAttribute("data-edit-bar-bar") || null,
        visible: root?.getAttribute("data-selection-visible-controls") || "",
        overflow: root?.getAttribute("data-selection-overflow-controls") || "",
        triggers: document.querySelectorAll("[data-editor-tools-trigger]").length,
        duplicateIcons: icons.filter((icon, index) => icons.indexOf(icon) !== index),
        barRect: bar ? `${Math.round(bar.left)}..${Math.round(bar.right)} y${Math.round(bar.top)}` : null,
        overlapsAvoid: overlaps,
        controls,
      };
    });
  log("bar-empty", JSON.stringify(await barInfo()));

  const select = async (type) => {
    if (mode === "deck") {
      const target = page.locator(`[data-deck-canvas] [data-deck-element][data-element-type=${type}]`).first();
      if (!(await target.count())) return false;
      await target.click({ force: true });
    } else {
      const canvas = page.locator("[data-editor-loading] canvas.upper-canvas, [data-editor-loading] canvas").first();
      const box = await canvas.boundingBox();
      if (!box) return false;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await page.waitForTimeout(1500);
    return true;
  };
  for (const type of mode === "deck" ? ["text", "image", "shape"] : ["image"]) {
    if (!(await select(type))) {
      log(`no ${type}`);
      continue;
    }
    log(`bar-${type}`, JSON.stringify(await barInfo()));
    await shot(`${tag}-${type}`);
    const more = page.locator('button[aria-controls^="selection-more-"]').first();
    if (await more.count()) {
      await more.click().catch(() => {});
      await page.waitForTimeout(600);
      await shot(`${tag}-${type}-more`);
      log(`more-${type}`, JSON.stringify(await barInfo()));
      await page.keyboard.press("Escape");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
}
