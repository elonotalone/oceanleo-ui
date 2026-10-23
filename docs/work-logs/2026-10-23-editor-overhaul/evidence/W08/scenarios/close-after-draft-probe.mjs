// W08 probe: an edit that is only in the server draft ("Saved" via the draft tier)
// when the editor is closed — does the hand-off publish it as a revision?
// Usage:
//   bash harness/mint.sh | OUT_DIR=/tmp/w08-close THEME=light \
//     node harness/run.mjs evidence/W08/scenarios/close-after-draft-probe.mjs <artifactId> <label> [edits=1]
const BODY = ".oleo-richdoc";
const LAUNCHER = "[data-workspace-save-launcher]";

export default async function ({ page, log, shot, helpers, args }) {
  const [id, label = "doc"] = args;
  page.on("console", (message) => {
    if (message.type() === "error" || /save|保存|draft|草稿|version/i.test(message.text())) {
      log("console", message.type(), message.text().slice(0, 300));
    }
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.request().method() !== "GET" && /artifacts|upload|sessions/.test(path)) {
      log("res", response.request().method(), String(response.status()), path.slice(0, 110));
    }
  });
  await helpers.gotoApp(page, `/library?item=${encodeURIComponent(id)}`);
  const body = page.locator(BODY).first();
  if (!(await body.waitFor({ state: "visible", timeout: 25000 }).then(() => true, () => false))) {
    await page.locator("button, a").filter({ hasText: /^(编辑|Edit)$/ })
      .or(page.getByRole("button", { name: /^(编辑|Edit)/ })).first().click({ timeout: 30000 });
    await body.waitFor({ state: "visible", timeout: 120000 });
  }
  await page.locator("[role=region][aria-busy=false]").first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const marker = `W08-close-${Date.now().toString(36).slice(-4)}`;
  const edits = Number(args[2] || 1);
  for (let n = 1; n <= edits; n += 1) {
    await body.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(` ${marker}-${n}`, { delay: 25 });
    const started = Date.now();
    let state = "";
    while (Date.now() - started < 60000) {
      await page.waitForTimeout(300);
      const now = await page.locator(LAUNCHER).first().getAttribute("data-save-state").catch(() => null);
      if (now !== state) log(`edit${n}`, String(now), `${((Date.now() - started) / 1000).toFixed(1)}s`);
      state = String(now);
      if (state === "saved" && Date.now() - started > 1500) break;
    }
  }
  log("closing", new Date().toISOString());
  await page.locator("[data-global-row-slot='close'] button").first().click().catch((e) => log("warn", String(e)));
  await page.waitForTimeout(45000);
  await shot(`${label}-closed-45s`);
  log("marker", marker);
}
