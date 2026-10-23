// W14 R2: click-test the website edit bar on a site-document website and watch the save state.
// args: [rootId] [--no-save-wait]
import { openSite, barInfo, sectionStyle, FORK } from "./w14-site-probe.mjs";

async function control(page, id) {
  return page.locator(`[data-selection-control-id="${id}"]`).first();
}

async function pickOption(page, id, value, log) {
  const root = await control(page, id);
  const button = root.locator("button").first();
  await ((await button.count()) ? button : root).click();
  await page.waitForTimeout(500);
  const option = page.locator(`[role=listbox] [data-selection-option="${value}"]`).first();
  if (await option.count()) await option.click();
  else log("option-missing", id, value, JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("[data-selection-option]")].map((el) => el.getAttribute("data-selection-option")))));
  await page.waitForTimeout(800);
}

export default async function ({ page, log, shot, helpers, args }) {
  const rootId = args.find((a) => !a.startsWith("--")) || FORK;
  const responses = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (response.request().method() !== "POST" || !/\/v1\/artifacts\/[^/]+\/(revisions|staging)/.test(url)) return;
    const body = await response.json().catch(() => null);
    responses.push(`${response.status()} ${url.replace(/^https?:\/\/[^/]+/, "").slice(0, 80)} ${JSON.stringify(body?.code || body?.error || body?.detail || body?.revisionId || "").slice(0, 300)}`);
  });
  await page.addInitScript(() => { window.__W14_DEBUG__ = true; });
  page.on("console", (message) => {
    if (message.text().startsWith("[w14-debug]")) log("debug", message.text().slice(0, 600));
  });
  const ready = await openSite(page, log, helpers, rootId);
  log("ready", String(ready));
  if (!ready) return;
  await page.waitForTimeout(4000);
  const imgs = await page.evaluate(() => [...document.querySelectorAll("[data-w14-kind=image]")].map((el) => `${el.tagName}:${el.getAttribute("data-w14-image-state") || (el.complete && el.naturalWidth > 0 ? "loaded" : "pending")}`).slice(0, 8));
  log("images", JSON.stringify(imgs));
  await shot("01-open");

  // Text: colour + align + undo.
  const before = await sectionStyle(page, 1);
  await page.locator("[data-w14-section]").nth(1).locator("[data-w14-field=title]").click();
  await page.waitForTimeout(900);
  log("bar-text", JSON.stringify(await barInfo(page)));
  await (await control(page, "text-color")).locator("input[type=color]").fill("#c2410c");
  await page.waitForTimeout(800);
  const colored = await sectionStyle(page, 1);
  log("text-color", JSON.stringify(before), "→", JSON.stringify(colored));
  await pickOption(page, "align", "left", log);
  log("align", JSON.stringify(await sectionStyle(page, 1)));
  await shot("02-text-edited");
  await page.getByRole("button", { name: /^(Undo|撤销)$/ }).first().click();
  await page.waitForTimeout(800);
  log("undo-align", JSON.stringify(await sectionStyle(page, 1)));
  await page.getByRole("button", { name: /^(Redo|重做)$/ }).first().click();
  await page.waitForTimeout(800);
  log("redo-align", JSON.stringify(await sectionStyle(page, 1)));

  // Button link.
  await page.locator("[data-w14-section]").first().locator("[data-w14-field=primaryCtaLabel]").click();
  await page.waitForTimeout(900);
  log("bar-button", JSON.stringify(await barInfo(page)));

  // Image.
  const img = page.locator("[data-w14-section] [data-w14-kind=image]").first();
  await img.click({ force: true }).catch((e) => log("img-click", String(e).slice(0, 120)));
  await page.waitForTimeout(900);
  log("bar-image", JSON.stringify(await barInfo(page)));
  await shot("03-image-picked");

  // Section (shape bar): click section padding area.
  const sec = page.locator("[data-w14-section]").nth(2);
  const box = await sec.boundingBox();
  if (box) await page.mouse.click(box.x + 8, box.y + 8);
  await page.waitForTimeout(900);
  log("bar-section", JSON.stringify(await barInfo(page)));
  const order0 = await page.evaluate(() => [...document.querySelectorAll("[data-w14-section]")].map((el) => el.getAttribute("data-w14-section")).join(","));
  await pickOption(page, "arrange", "forward", log);
  const order1 = await page.evaluate(() => [...document.querySelectorAll("[data-w14-section]")].map((el) => el.getAttribute("data-w14-section")).join(","));
  log("arrange", order0, "→", order1, JSON.stringify(await barInfo(page)));
  await shot("04-arranged");

  if (!args.includes("--no-save-wait")) {
    const states = [];
    for (let i = 0; i < 16 && (await helpers.saveState(page)) === "saved"; i += 1) await page.waitForTimeout(500);
    for (let i = 0; i < 90; i += 1) {
      const state = await helpers.saveState(page);
      if (states[states.length - 1] !== state) states.push(state);
      if ((state === "saved" || state === "error" || state === "failed") && states.length > 1) break;
      await page.waitForTimeout(1000);
    }
    log("save-states", JSON.stringify(states));
    await shot("05-save");
  }
  log("responses", JSON.stringify(responses));
}
