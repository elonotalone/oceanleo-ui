// W12: open an audio item from My library, report the edit bar, select a region, report again.
// args: <cardNeedle> [shotPrefix]
import { audioReport, dragSelect, guardProduction, openFromLibrary, sleep } from "./_w12-lib.mjs";

export default async function ({ page, context, log, shot, helpers, args }) {
  const [needle = "[W12] sample.mp3", prefix = "probe"] = args;
  await guardProduction(context, log);
  await openFromLibrary(page, helpers, needle, log);
  await shot(`${prefix}-open`);
  log("report-open", JSON.stringify(await audioReport(page), null, 1));
  await dragSelect(page, 0.25, 0.55);
  await shot(`${prefix}-region`);
  log("report-region", JSON.stringify(await audioReport(page), null, 1));
  // Empty-state drawer buttons / tool launcher, whichever this shell build shows.
  const tools = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      })
      .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim())
      .filter(Boolean),
  );
  log("buttons", JSON.stringify(tools));
  await sleep(500);
}
