// R0/R1: D2 left panel — 素材库 / 我的库 in the /library?item= carrier, then /advanced/<featureId>.
// args[0]: title to open (default "[V01] sample.txt"); args[1]: title to switch to via 我的库 (default "[V01] sample.md").
import fs from "node:fs";
import path from "node:path";
import { guardProduction, setLocale, sleep, panelReport, openEditorByItem, EDITOR_HEADER, waitVisible } from "./_v01-lib.mjs";

export default async function ({ page, context, log, shot, helpers, args, outDir }) {
  await guardProduction(context, log);
  await setLocale(context, "zh");
  const title = args[0] || "[V01] sample.txt";
  const other = args[1] || "[V01] sample.md";
  const theme = process.env.THEME === "dark" ? "dark" : "light";
  const slug = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const out = { title, theme, steps: [] };
  const step = async (name, extra = {}) => {
    const rep = await panelReport(page);
    await shot(`panels-${slug}-${name}-${theme}`);
    out.steps.push({ name, ...extra, report: rep });
    log("STEP", name, JSON.stringify({ url: rep.url, pressed: rep.pressed, known: rep.known, ...extra }).slice(0, 900));
  };
  const opened = await openEditorByItem(page, helpers, title, log);
  await step("opened", { opened });
  for (const id of ["materials", "mine"]) {
    const btn = page.locator(`[data-workspace-library-panel=${id}]`).first();
    if (!(await btn.isVisible().catch(() => false))) {
      await step(`${id}-button-missing`);
      continue;
    }
    await btn.click();
    await sleep(4000);
    await step(`${id}-clicked`);
  }
  // 我的库 → another item: the editor should switch and the address bar follow.
  const before = page.url();
  const target = page.locator(`[data-inline-editor-mine-item]`).filter({ hasText: other }).first();
  if (await target.isVisible().catch(() => false)) {
    await target.click();
    await sleep(8000);
    await step("mine-switched", { before, after: page.url(), headerUp: await waitVisible(page, EDITOR_HEADER, 5000) });
  } else {
    await step("mine-target-missing", { before, other });
  }
  // Carrier /advanced/<featureId>
  await helpers.gotoApp(page, "/advanced/document_editing");
  await sleep(6000);
  await step("advanced-carrier", { landed: page.url() });
  fs.writeFileSync(path.join(outDir, `panels-${slug}-${theme}.json`), JSON.stringify(out, null, 2));
}
