// W07 button pass (_EDITOR.md A.4): click every visible edit-bar control for a text / image / shape
// selection, record whether the slide changed or a panel opened, then undo from the top bar and check
// the slide is back. args: <artifactId> [types=text,image,shape]
export default async function ({ page, log, shot, helpers, args }) {
  const [artifactId, typeArg = "text,image,shape"] = args;
  await helpers.gotoApp(page, `/library?item=${artifactId}`);
  await page.locator("[data-deck-thumbnail-rail], [data-workspace-save-launcher]").first().waitFor({ timeout: 150000 });
  await page.waitForTimeout(1500);
  // Dev API flake: 「暂时无法加载我的库」 banner covers the toolbar; retry it before looking for Edit.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const retry = page.locator("[data-library-retry]:visible").first();
    if (!(await retry.count())) break;
    log("library-retry", attempt);
    await retry.click().catch(() => {});
    await page.waitForTimeout(8000);
  }
  if (!(await page.locator("[data-workspace-save-launcher]").count())) {
    const name = await page.evaluate(() =>
      [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.title || "").find((l) => /^编辑「|^Edit /.test(l)),
    );
    if (name) await page.getByRole("button", { name, exact: true }).first().click();
  }
  await page.locator("[data-deck-canvas]").first().waitFor({ timeout: 150000 });
  await page.getByText(/Loading presentation|正在载入演示文稿/).first().waitFor({ state: "hidden", timeout: 150000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const signature = () =>
    page.evaluate(() => {
      const canvas = document.querySelector("[data-deck-canvas]");
      if (!canvas) return "none";
      return [...canvas.querySelectorAll("[data-deck-element]")]
        .map((el) => el.outerHTML.replace(/data-selected="[^"]*"|aria-pressed="[^"]*"|tabindex="[^"]*"/g, ""))
        .join("\n");
    });
  const undoButton = page.locator('button[aria-label*="撤销"], button[aria-label*="Undo"]').first();
  const results = [];
  for (const type of typeArg.split(",")) {
    const target = () => page.locator(`[data-deck-canvas] [data-deck-element][data-element-type=${type}]`).first();
    if (!(await target().count())) {
      log("skip-type", type);
      continue;
    }
    await target().click({ force: true });
    await page.waitForTimeout(900);
    const ids = await page.evaluate(() =>
      (document.querySelector("[data-selection-kind]")?.getAttribute("data-selection-visible-controls") || "").split(" ").filter(Boolean),
    );
    for (const id of ids) {
      if (id === "delete" || id === "duplicate") continue; // handled below (they move the selection)
      await target().click({ force: true });
      await page.waitForTimeout(500);
      const before = await signature();
      const control = page.locator(`[data-selection-control-id="${id}"]:visible`).first();
      if (!(await control.count())) {
        results.push(`${type}:${id} not-visible`);
        continue;
      }
      const button = control.locator("button").first();
      const clickable = (await button.count()) ? button : control;
      const colorInput = control.locator('input[type=color]').first();
      const numberInput = control.locator('input[type=number], input[inputmode=decimal], input[inputmode=numeric]').first();
      if (await colorInput.count()) {
        await colorInput.fill("#e11d48").catch(() => {});
        await page.waitForTimeout(700);
        const after = await signature();
        let undone = "";
        if (after !== before) {
          await undoButton.click().catch(() => {});
          await page.waitForTimeout(600);
          undone = (await signature()) === before ? "undo-ok" : "undo-MISMATCH";
        }
        results.push(`${type}:${id} ${after !== before ? "changed" : "no-change"} (color) ${undone}`);
        continue;
      }
      if (await numberInput.count()) {
        await numberInput.fill("12").catch(() => {});
        await page.keyboard.press("Enter");
        await page.waitForTimeout(700);
        const after = await signature();
        let undone = "";
        if (after !== before) {
          await undoButton.click().catch(() => {});
          await page.waitForTimeout(600);
          undone = (await signature()) === before ? "undo-ok" : "undo-MISMATCH";
        }
        results.push(`${type}:${id} ${after !== before ? "changed" : "no-change"} (number) ${undone}`);
        continue;
      }
      await clickable.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      const panelId = await clickable.getAttribute("aria-controls").catch(() => null);
      const panel = panelId ? page.locator(`[id="${panelId}"]`) : null;
      const opened = Boolean(panel && (await panel.count()) && (await panel.first().isVisible().catch(() => false)));
      let picked = "";
      if (opened) {
        const scope = panel.first();
        const option = scope.locator('[role=option], [role=menuitem], [role=menuitemradio]').nth(1);
        const range = scope.locator('input[type=range]').first();
        const number = scope.locator('input[type=number]').first();
        const text = scope.locator('input[type=text], input[type=url], input:not([type])').first();
        const buttons = scope.locator('button');
        if (await option.count()) {
          picked = "option";
          await option.click().catch(() => {});
        } else if (await range.count()) {
          picked = "range";
          await range.focus();
          for (let i = 0; i < 6; i += 1) await page.keyboard.press("ArrowLeft");
        } else if (await number.count()) {
          picked = "number";
          await number.focus();
          for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowUp");
          await page.keyboard.press("Enter");
        } else if (await text.count()) {
          picked = "text";
          await text.fill("https://example.com/");
          await page.keyboard.press("Enter");
        } else if ((await buttons.count()) > 2) {
          picked = "button";
          await buttons.nth(2).click().catch(() => {});
        } else {
          picked = "empty";
        }
        await page.waitForTimeout(600);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      }
      const after = await signature();
      const changed = after !== before;
      let undone = "";
      if (changed) {
        await undoButton.click().catch(() => {});
        await page.waitForTimeout(600);
        undone = (await signature()) === before ? "undo-ok" : "undo-MISMATCH";
      }
      results.push(`${type}:${id} ${changed ? "changed" : "no-change"}${opened ? ` opened(${picked})` : ""} ${undone}`);
    }
    // duplicate / delete: element count moves, undo restores it.
    for (const id of ["duplicate", "delete"]) {
      await target().click({ force: true });
      await page.waitForTimeout(500);
      const count = () => page.locator("[data-deck-canvas] [data-deck-element]").count();
      const before = await count();
      const control = page.locator(`[data-selection-control-id="${id}"]:visible`).first();
      if (!(await control.count())) {
        // overflow: open More and click the item there
        const more = page.locator('[data-selection-kind] button[aria-controls^="selection-more-"]:visible').first();
        if (await more.count()) {
          await more.click();
          await page.waitForTimeout(500);
        }
      }
      const item = page.locator(`[data-selection-control-id="${id}"]:visible`).first();
      if (!(await item.count())) {
        results.push(`${type}:${id} not-found`);
        await page.keyboard.press("Escape");
        continue;
      }
      await (((await item.locator("button").count()) ? item.locator("button").first() : item)).click().catch(() => {});
      await page.waitForTimeout(700);
      const after = await count();
      await undoButton.click().catch(() => {});
      await page.waitForTimeout(700);
      const undone = await count();
      results.push(`${type}:${id} ${before}->${after} undo->${undone}`);
    }
    await shot(`buttons-${type}`);
  }
  for (const row of results) log("result", row);
  await helpers.waitSaved(page, { timeout: 120000 }).then(
    () => log("final-saved"),
    (error) => log("final-not-saved", String(error)),
  );
}
