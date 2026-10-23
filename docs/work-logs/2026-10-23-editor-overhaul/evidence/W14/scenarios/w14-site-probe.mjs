// W14 R2: open a site-document website (bundle site.json) in the editor, pick text / image / section,
// record the unified edit bar, flip Edit ↔ Pro edit and check the Puck instance survives.
// args[0] = artifact root id (default: acceptance fork of 「鞋靴资讯内容站」).
import { settle } from "./_w14-lib.mjs";

export const FORK = "5540f78f-81fd-455f-bd5c-2a4c29bb8355";

export async function openSite(page, log, helpers, rootId = FORK) {
  await helpers.gotoApp(page, `/library?item=${rootId}`);
  await settle(page, log);
  const stage = page.locator("[data-testid='website-site-stage']").first();
  const edit = page.locator('button[aria-label^="编辑「"], button[aria-label^="Edit "]').first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await stage.isVisible().catch(() => false)) break;
    await Promise.race([stage.waitFor({ timeout: 90000 }), edit.waitFor({ state: "attached", timeout: 90000 })]).catch(() => {});
    if (await stage.isVisible().catch(() => false)) break;
    if (await edit.count()) await edit.click({ force: true, timeout: 10000 }).catch(() => {});
    await stage.waitFor({ timeout: 90000 }).catch(() => {});
  }
  await page.locator("[data-w14-section]").first().waitFor({ timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return stage.isVisible().catch(() => false);
}

export async function barInfo(page) {
  return page.evaluate(() => {
    const bar = document.querySelector("[data-selection-kind]");
    const controls = [...document.querySelectorAll("[data-selection-control-id]")]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => el.getAttribute("data-selection-control-id"));
    return {
      kind: bar?.getAttribute("data-selection-kind") || null,
      visible: bar?.getAttribute("data-selection-visible-controls") || null,
      overflow: bar?.getAttribute("data-selection-overflow-controls") || null,
      controls: [...new Set(controls)],
      save: document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state") || null,
    };
  });
}

export async function sectionStyle(page, index = 0) {
  return page.evaluate((i) => {
    const el = document.querySelectorAll("[data-w14-section]")[i];
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { id: el.getAttribute("data-w14-section"), color: cs.color, bg: cs.backgroundColor, align: cs.textAlign, title: el.querySelector("[data-w14-field=title]")?.textContent?.trim() || "" };
  }, index);
}

export default async function ({ page, log, shot, helpers, args }) {
  const ready = await openSite(page, log, helpers, args[0] || FORK);
  log("ready", String(ready), page.url());
  await shot("01-open");
  if (!ready) return;
  const imgs = await page.evaluate(() => [...document.querySelectorAll("[data-w14-kind=image]")].map((el) => `${el.tagName}:${el.getAttribute("data-w14-image-state") || (el.complete && el.naturalWidth > 0 ? "loaded" : "pending")}`).slice(0, 8));
  log("images", JSON.stringify(imgs));
  log("section0", JSON.stringify(await sectionStyle(page, 0)));
  await page.locator("[data-w14-section] [data-w14-field=title]").first().click();
  await page.waitForTimeout(1200);
  log("bar-text", JSON.stringify(await barInfo(page)));
  await shot("02-text-picked");
  await page.locator("[data-w14-section] img[data-w14-kind=image]").first().click().catch((e) => log("img-click", String(e).slice(0, 120)));
  await page.waitForTimeout(1200);
  log("bar-image", JSON.stringify(await barInfo(page)));
  await shot("03-image-picked");
  await page.evaluate(() => { const el = document.querySelector("[data-testid=website-puck-stage]"); if (el) el.__w14mark = "same"; });
  const pro = page.getByRole("tab", { name: /^(Pro edit|专业编辑)$/ }).first();
  const proBtn = (await pro.count()) ? pro : page.getByRole("button", { name: /^(Pro edit|专业编辑)$/ }).first();
  await proBtn.click().catch((e) => log("pro-click", String(e).slice(0, 120)));
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => { const el = document.querySelector("[data-testid=website-puck-stage]"); return { face: el?.getAttribute("data-website-face"), mark: el?.__w14mark || null, sections: document.querySelectorAll("[data-w14-section]").length }; });
  log("pro", JSON.stringify(after), JSON.stringify(await barInfo(page)));
  await shot("04-pro");
}
