// W11: open a library item in the video editor, select the first clip, report what is on screen.
// Usage: … run.mjs evidence/W11/scenarios/probe-open.mjs <rootId>
import { canvasStats, editBarControls, openVideoEditor, selectClip, watchApi } from "./w11-lib.mjs";

export default async function ({ page, log, shot, helpers, args }) {
  const rootId = args[0];
  if (!rootId) throw new Error("pass the root id");
  watchApi(page, log);
  await openVideoEditor(page, helpers, log, rootId);
  await shot("opened");
  const info = await page.evaluate(() => ({
    url: location.href,
    adapter: [...document.querySelectorAll("[data-editor-adapter]")].map((el) => el.getAttribute("data-editor-adapter")),
    pluginTheme: document.querySelector("[data-plugin-theme]")?.getAttribute("data-plugin-theme") || null,
    editBar: Boolean(document.querySelector("[data-workspace-edit-bar]")),
    saveState: document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state") || null,
    rows: document.querySelectorAll("[data-video-timeline-content] > div").length,
    clips: document.querySelectorAll("[data-video-timeline-content] .group").length,
  }));
  log("info", JSON.stringify(info));
  log("canvas", JSON.stringify(await canvasStats(page)));
  const selected = await selectClip(page, { trackIndex: 0, clipIndex: 0 });
  log("selected", selected);
  await page.waitForTimeout(1200);
  log("bar", JSON.stringify(await editBarControls(page)));
  await shot("selected");
}
