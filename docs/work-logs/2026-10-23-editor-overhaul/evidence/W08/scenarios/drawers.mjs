// W08: open the empty-state drawers (Insert / Comments) of the document editor and capture them.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w08-drawers THEME=light node harness/run.mjs evidence/W08/scenarios/drawers.mjs <artifactId> <label>
const BODY = ".oleo-richdoc";

export default async function ({ page, log, shot, helpers, args }) {
  const [id, label = "doc"] = args;
  await helpers.gotoApp(page, `/library?item=${encodeURIComponent(id)}`);
  const body = page.locator(BODY).first();
  if (!(await body.waitFor({ state: "visible", timeout: 25000 }).then(() => true, () => false))) {
    await page.locator("button, a").filter({ hasText: /^(编辑|Edit)$/ })
      .or(page.getByRole("button", { name: /^(编辑|Edit)/ })).first().click({ timeout: 30000 });
    await body.waitFor({ state: "visible", timeout: 120000 });
  }
  await page.locator("[role=region][aria-busy=false]").first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await shot(`${label}-editor`);
  for (const name of [/^(插入|Insert)$/, /^(批注|Comments)$/]) {
    const button = page.locator("button").filter({ hasText: name }).first();
    if (!(await button.isVisible().catch(() => false))) {
      log("missing", String(name));
      continue;
    }
    log("drawer-button", String(name), "disabled", String(await button.isDisabled()));
    await button.click();
    await page.waitForTimeout(1500);
    const panelText = await page.evaluate(() => {
      const panels = [...document.querySelectorAll("aside, [role=complementary], [data-inline-advanced-panel], [data-advanced-panel]")];
      return panels.map((el) => (el.innerText || "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" || ").slice(0, 1200);
    });
    log("panel", String(name), panelText);
    await shot(`${label}-drawer-${String(name).includes("插入") ? "insert" : "comments"}`);
    await button.click().catch(() => {});
    await page.waitForTimeout(600);
  }
}
