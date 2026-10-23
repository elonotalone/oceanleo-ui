// W11: open each edit-bar panel for the selected video clip and dump its controls.
import { editBarControls, openVideoEditor, selectClip, watchApi } from "./w11-lib.mjs";

export default async function ({ page, log, shot, helpers, args }) {
  watchApi(page, log);
  await openVideoEditor(page, helpers, log, args[0]);
  await selectClip(page, { trackIndex: 0, clipIndex: 0 });
  const bar = await editBarControls(page);
  log("bar", JSON.stringify(bar));
  const topButtons = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((el) => ({
        label: el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent?.trim() || "",
        disabled: el.disabled,
      }))
      .filter((entry) => /撤销|重做|Undo|Redo|保存|Saved|Save/i.test(entry.label)),
  );
  log("history buttons", JSON.stringify(topButtons));
  for (const id of bar.visible.filter((entry) => entry.startsWith("selection-inspector-"))) {
    await page.locator(`[data-selection-control-id="${id}"] button`).first().click();
    await page.waitForTimeout(900);
    const dump = await page.evaluate(() => {
      const panel = document.querySelector("[data-selection-inspector]");
      if (!panel) return null;
      const host = panel.closest("aside, [data-workspace-pane], [role=dialog]");
      return {
        host: host ? `${host.tagName}.${host.getAttribute("data-left-panel") || host.getAttribute("data-workspace-pane") || host.getAttribute("role") || ""}` : null,
        inputs: [...panel.querySelectorAll("input, textarea, select, button")].map((el) => ({
          tag: el.tagName,
          type: el.getAttribute("type") || "",
          label: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || "",
          value: "value" in el ? String(el.value).slice(0, 30) : "",
        })),
      };
    });
    log("panel", id, JSON.stringify(dump));
    await shot(`panel-${id.replace("selection-inspector-", "")}`);
  }
}
