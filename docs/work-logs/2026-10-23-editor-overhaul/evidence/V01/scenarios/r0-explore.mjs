// R0 exploration: library -> card -> detail -> Edit; logs URLs, headers, buttons.
// args[0]: title needle (default "[V01] sample.txt")
import { guardProduction, setLocale, sleep, topBarReport, editBarReport } from "./_v01-lib.mjs";

export default async function ({ page, context, log, shot, helpers, args }) {
  await guardProduction(context, log);
  await setLocale(context, args[1] || "zh");
  const needle = args[0] || "[V01] sample.txt";
  const hosts = new Set();
  page.on("request", (req) => {
    try {
      hosts.add(new URL(req.url()).hostname);
    } catch {}
  });
  await helpers.gotoApp(page, "/library");
  await page.locator(`button[aria-label*="${needle}"]`).first().waitFor({ timeout: 90000 });
  await sleep(1500);
  await shot("explore-library");
  await page.locator(`button[aria-label*="${needle}"]`).first().click();
  await sleep(4000);
  log("after card click url", page.url());
  await shot("explore-detail");
  const detailButtons = await page.evaluate(() =>
    [...document.querySelectorAll("button, a[href]")]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30))
      .filter(Boolean)
      .slice(0, 80),
  );
  log("detail buttons", JSON.stringify(detailButtons));
  const edit = page.getByRole("button", { name: /^(编辑|Edit)$/ }).first();
  if (await edit.isVisible().catch(() => false)) {
    await edit.click();
    await sleep(8000);
    log("after edit url", page.url());
    await shot("explore-editor");
    log("topbar", JSON.stringify(await topBarReport(page)));
    log("editbar", JSON.stringify(await editBarReport(page)));
  } else {
    log("no Edit button visible");
  }
  log("hosts", JSON.stringify([...hosts]));
}
