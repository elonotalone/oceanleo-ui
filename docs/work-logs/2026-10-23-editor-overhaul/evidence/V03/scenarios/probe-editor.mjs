// V03 R0 probe: open one library item in its editor, read the empty-state edit bar (D3),
// check bar coverage, and list stage markers for the selection recipes.
// args: <label> <artifactId>
import { openEditor, expandBar, barReport, coverage } from "./lib.mjs";

export default async function ({ page, log, shot, helpers, args }) {
  const [label, id] = args;
  const opened = await openEditor(page, helpers, log, id);
  log("opened", JSON.stringify(opened));
  await shot(`${label}-editor`);
  await expandBar(page);
  const report = await barReport(page);
  const { controls, ...rest } = report;
  log("bar", JSON.stringify(rest));
  log(
    "controls",
    controls
      .map((c) => `${c.section}:${c.controlId || c.actionId || "-"}:${c.dataIcon || c.icon}:${c.label || c.text}${c.disabled ? ":DISABLED" : ""}${c.toolsTrigger ? ":TOOLS" : ""}`)
      .join(" | "),
  );
  log("coverage", JSON.stringify(await coverage(page)));
  const markers = await page.evaluate(() => {
    const root = document.querySelector("[data-inline-editor]") || document.body;
    const counts = new Map();
    for (const el of root.querySelectorAll("*")) {
      for (const a of el.attributes) {
        if (!a.name.startsWith("data-")) continue;
        counts.set(a.name, (counts.get(a.name) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 120);
  });
  log("stage markers", JSON.stringify(markers));
  const header = await page.evaluate(() =>
    [...document.querySelectorAll("[data-global-row-slot], [data-workspace-library-panel], [data-plugin-page-row], [data-workspace-save-launcher]")]
      .map((el) => `${[...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => `${a.name}=${a.value}`).join(" ")}`.slice(0, 120)),
  );
  log("header", JSON.stringify(header));
  await shot(`${label}-editor-bar`);
}
