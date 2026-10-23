// W10 grid acceptance. args: <mode> <artifactId> [tag]
//   probe   – open, screenshot, list edit-bar controls, select a styled cell, click bar buttons.
//   save    – type into two empty cells (save after each), reload, confirm both values are back.
//   offline – go offline, type, expect "error" (never "saved"), go online, retry, expect "saved".
const STAGE = "[data-grid-univer-stage]";

async function openGrid(page, helpers, id) {
  await helpers.gotoApp(page, `/library?item=${id}`);
  const stage = page.locator(`${STAGE} canvas >> visible=true`).first();
  if (!(await stage.isVisible().catch(() => false))) {
    // The detail viewer comes first; the pencil at the top right opens the editor.
    const edit = page.locator("button[aria-label*='编辑'], button[aria-label*='Edit'], button[title*='编辑'], button[title*='Edit']").last();
    await edit.waitFor({ timeout: 60000 });
    await edit.click();
  }
  await stage.waitFor({ timeout: 150000 });
  await page.waitForTimeout(5000);
}

/** Centre of a cell (0-based row/col) in normal mode: no ribbon, 46px row header, 20px col header. */
async function cellPoint(page, row, col) {
  const box = await page.locator(STAGE).first().boundingBox();
  return { x: box.x + 46 + 88 * col + 44, y: box.y + 20 + 24 * row + 12 };
}

async function clickCell(page, row, col) {
  const p = await cellPoint(page, row, col);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(500);
}

async function bar(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-selection-control-id]")].map((el) => {
      const b = el.querySelector("button, input, label");
      const pressed = el.querySelector("[aria-pressed]")?.getAttribute("aria-pressed");
      const value = el.querySelector("input[type=number], input[type=color]")?.value;
      return `${el.getAttribute("data-selection-control-id")}${pressed ? `[${pressed}]` : ""}${value ? `=${value}` : ""}:${(b?.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 16)}`;
    }),
  );
}

async function liveCells(page) {
  return page.evaluate(() => JSON.stringify(globalThis.__oceanleoGridUniverPaint?.liveCells || null).slice(0, 1500));
}

async function surfaces(page) {
  return page.evaluate(() => {
    const bg = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).backgroundColor : null;
    };
    return {
      html: document.documentElement.className.slice(0, 120),
      gridTheme: document.querySelector("[data-grid-univer-stage]")?.getAttribute("data-grid-univer-theme"),
      workbench: bg('[data-u-comp="workbench-layout"]'),
      bar: bg("[data-edit-bar-row]") || bg("[data-selection-kind]"),
      saveState: document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state"),
    };
  });
}

export default async function ({ page, context, log, shot, helpers, args }) {
  const [mode, id, tag = mode] = args;
  if (!id) throw new Error("artifact id required");
  await openGrid(page, helpers, id);
  log("surfaces", JSON.stringify(await surfaces(page)));
  log("liveCells@open", await liveCells(page));
  await shot(`${tag}-open`);

  if (mode === "probe") {
    await clickCell(page, 0, 0);
    log("bar A1", JSON.stringify(await bar(page)));
    await shot(`${tag}-a1`);
    await clickCell(page, 1, 0);
    log("bar A2", JSON.stringify(await bar(page)));
    await clickCell(page, 3, 1);
    log("bar B4", JSON.stringify(await bar(page)));
    // range select B3:C4 → merge toggle should appear
    const a = await cellPoint(page, 2, 1);
    const b = await cellPoint(page, 3, 2);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    log("bar B3:C4", JSON.stringify(await bar(page)));
    await shot(`${tag}-range`);
    return;
  }

  if (mode === "bar") {
    // Exercise each text-bar button on cell F2 (empty): type, then style it via the bar.
    await clickCell(page, 1, 5);
    await page.keyboard.type("W10-bar");
    await page.keyboard.press("Enter");
    await clickCell(page, 1, 5);
    for (const control of ["bold", "italic", "underline", "strike"]) {
      const btn = page.locator(`[data-selection-control-id="${control}"] button`).first();
      if (!(await btn.count())) {
        log("missing", control);
        continue;
      }
      await btn.click();
      await page.waitForTimeout(400);
      log("after", control, JSON.stringify((await bar(page)).filter((s) => s.startsWith(control))));
    }
    await shot(`${tag}-styled`);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(500);
    log("after undo", JSON.stringify((await bar(page)).filter((s) => s.startsWith("strike"))));
    await helpers.waitSaved(page, { timeout: 90000 }).catch((e) => log("waitSaved", String(e)));
    log("surfaces", JSON.stringify(await surfaces(page)));
    return;
  }

  if (mode === "save") {
    const stamp = String(Date.now()).slice(-5);
    await clickCell(page, 12, 4);
    await page.keyboard.type(`W10a${stamp}`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    log("state after edit 1", await helpers.saveState(page));
    await helpers.waitSaved(page, { timeout: 90000 });
    log("saved 1", page.url());
    await shot(`${tag}-saved1`);
    await clickCell(page, 12, 5);
    await page.keyboard.type(`W10b${stamp}`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    log("state after edit 2", await helpers.saveState(page));
    await helpers.waitSaved(page, { timeout: 90000 });
    log("saved 2", page.url());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(`${STAGE} canvas >> visible=true`).first().waitFor({ timeout: 150000 });
    await page.waitForTimeout(5000);
    const cells = await liveCells(page);
    log("liveCells@reload", cells);
    log("RESULT", cells.includes(`W10a${stamp}`) && cells.includes(`W10b${stamp}`) ? "both-present" : "MISSING", stamp);
    await shot(`${tag}-reopened`);
    return;
  }

  if (mode === "offline") {
    await context.setOffline(true);
    await clickCell(page, 13, 4);
    await page.keyboard.type("W10-offline");
    await page.keyboard.press("Enter");
    let sawSaved = false;
    let last = null;
    for (let i = 0; i < 60; i += 1) {
      last = await helpers.saveState(page);
      if (last === "saved") sawSaved = true;
      if (last === "error") break;
      await page.waitForTimeout(1000);
    }
    log("offline state", last, "sawSavedWhileOffline", sawSaved);
    await shot(`${tag}-offline`);
    await context.setOffline(false);
    const retry = page.getByRole("button", { name: /重试|Retry/ }).first();
    if (await retry.count()) await retry.click().catch(() => {});
    await helpers.waitSaved(page, { timeout: 90000 }).catch((e) => log("after-retry", String(e)));
    log("after retry", await helpers.saveState(page));
    await shot(`${tag}-online`);
  }
}
