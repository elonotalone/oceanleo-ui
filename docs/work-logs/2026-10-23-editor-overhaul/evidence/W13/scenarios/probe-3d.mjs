// W13: open a 3D item, report the edit bar with nothing selected and with the cube selected.
// args: <artifactId> [shotPrefix]
import { clickStageCenter, editBarInfo, openModel, surfaceColors, watchSaveTraffic } from "./lib.mjs";

export default async function ({ page, log, shot, helpers, args }) {
  const [artifactId, prefix = "probe"] = args;
  if (!artifactId) throw new Error("usage: probe-3d.mjs <artifactId> [prefix]");
  watchSaveTraffic(page, log);
  await openModel(page, helpers, artifactId, log);
  await page.waitForTimeout(1500);
  await shot(`${prefix}-open`);
  log("bar-empty", JSON.stringify(await editBarInfo(page)));
  log("surfaces", JSON.stringify(await surfaceColors(page)));
  await clickStageCenter(page);
  await shot(`${prefix}-selected`);
  log("bar-selected", JSON.stringify(await editBarInfo(page)));
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30))
      .filter(Boolean),
  );
  log("buttons", JSON.stringify(buttons));
}
