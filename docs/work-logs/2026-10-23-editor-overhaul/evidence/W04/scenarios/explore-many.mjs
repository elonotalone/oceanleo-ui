// Open several library items in one browser and record each editor's visible controls.
// args: id:<artifactId> …
import { guardProduction, openFromLibrary, saveLauncher, visibleControls, writeJson } from "./_w04-lib.mjs";

export default async function ({ page, context, log, shot, helpers, args, outDir }) {
  await guardProduction(context, log);
  for (const [index, needle] of args.entries()) {
    try {
      await openFromLibrary(page, helpers, needle, log);
    } catch (error) {
      log("open failed", needle, String(error).slice(0, 200));
      await shot(`explore-${index}-failed`);
      continue;
    }
    await shot(`explore-${index}`);
    const editable = await page.evaluate(() =>
      [...document.querySelectorAll("[contenteditable=true], canvas, iframe")].map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, cls: String(el.className).slice(0, 60), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      }).filter((e) => e.w > 20 && e.h > 20),
    );
    const controls = await visibleControls(page);
    writeJson(outDir, `explore-${index}`, { needle, url: page.url(), save: await saveLauncher(page), editable, controls });
    log("explored", needle, "controls", controls.length, "editable", JSON.stringify(editable));
  }
}
