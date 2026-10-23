// W02: where do /advanced/<featureId> and /workspace land on the portal slot, and is an editor host there?
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w02-hosts node harness/run.mjs evidence/W02/scenarios/probe-hosts.mjs /advanced/pdf /workspace
export default async function ({ page, log, shot, helpers, args }) {
  let n = 0;
  for (const route of args) {
    await helpers.gotoApp(page, route);
    await page.waitForTimeout(8000);
    n += 1;
    await shot(`host-${n}`);
    log("host", route, JSON.stringify(await page.evaluate(() => ({
      url: location.pathname + location.search,
      editor: document.querySelector("[data-inline-editor]")?.getAttribute("data-editor-adapter") || null,
      split: Boolean(document.querySelector("[data-workspace-split]")),
      libraryButtons: document.querySelectorAll("[data-workspace-library-panel]").length,
      headings: [...document.querySelectorAll("h1,h2")].slice(0, 5).map((h) => h.textContent.trim().slice(0, 60)),
    }))));
  }
}
