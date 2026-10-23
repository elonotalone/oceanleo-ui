// W11 save protocol (00-dispatch §5) for the video timeline.
// args: <rootId> [offline=1]
// 1) edit A (flip-x) → saved → edit B (mute) → saved → leave → reopen: both present → reload: both present.
// 4) offline edit → "error" + retry → back online → retry → saved.
import { editBarControls, openVideoEditor, selectClip, watchApi } from "./w11-lib.mjs";

async function waitCycle(page, helpers, log, label, { timeout = 90000 } = {}) {
  const started = Date.now();
  let left = false;
  let last = "";
  while (Date.now() - started < timeout) {
    last = (await helpers.saveState(page)) || "";
    if (last !== "saved") left = true;
    if (left && last === "saved") break;
    if (last === "error") break;
    await page.waitForTimeout(400);
  }
  log("save-cycle", label, last, `${Math.round((Date.now() - started) / 100) / 10}s`);
  return last;
}

async function pressed(page, id) {
  return page
    .locator(`[data-selection-control-id="${id}"] button`)
    .first()
    .getAttribute("aria-pressed")
    .catch(() => null);
}

async function clipText(page) {
  return page.evaluate(() => document.querySelector("[data-video-timeline-content] .group")?.innerText || "");
}

async function verify(page, log, label) {
  await selectClip(page, { trackIndex: 0, clipIndex: 0 });
  const state = {
    flipX: await pressed(page, "flip-x"),
    clip: (await clipText(page)).replace(/\s+/g, " "),
    bar: (await editBarControls(page)).visible.length,
  };
  log("verify", label, JSON.stringify(state));
  return state;
}

export default async function ({ page, context, log, shot, helpers, args }) {
  watchApi(page, log);
  const [rootId, offline = "1"] = args;
  page.on("response", async (response) => {
    const url = response.url();
    if (response.request().method() === "POST" && /\/v1\/artifacts\/[^/]+\/revisions/.test(url)) {
      const body = await response.text().catch(() => "");
      log("revision-post", response.status(), body.slice(0, 400));
    }
  });
  await openVideoEditor(page, helpers, log, rootId);
  log("initial save state", await helpers.saveState(page));
  await verify(page, log, "before");

  // edit A: flip-x
  await page.locator('[data-selection-control-id="flip-x"] button').first().click();
  await waitCycle(page, helpers, log, "A flip-x");
  await shot("save-after-A");
  // edit B: mute
  await selectClip(page, { trackIndex: 0, clipIndex: 0 });
  await page.locator('[data-selection-control-id="muted"] button').first().click();
  await waitCycle(page, helpers, log, "B muted");
  await shot("save-after-B");
  const url = page.url();
  log("url after saves", url.replace(/token=[^&]+/, "token=…"));

  // leave and reopen
  await helpers.gotoApp(page, "/library");
  await page.waitForTimeout(2000);
  await openVideoEditor(page, helpers, log, rootId);
  await verify(page, log, "reopen");
  await shot("save-reopen");
  await page.reload();
  await page.waitForTimeout(3000);
  await openVideoEditor(page, helpers, log, rootId);
  await verify(page, log, "reload");

  if (offline === "1") {
    await context.setOffline(true);
    await selectClip(page, { trackIndex: 0, clipIndex: 0 });
    await page.locator('[data-selection-control-id="flip-y"] button').first().click();
    const offlineState = await waitCycle(page, helpers, log, "C offline", { timeout: 60000 });
    await shot("save-offline");
    const saveText = await page
      .locator("[data-workspace-save-launcher]")
      .first()
      .innerText()
      .catch(() => "");
    log("offline launcher", offlineState, saveText.replace(/\s+/g, " ").slice(0, 80));
    await context.setOffline(false);
    await page.waitForTimeout(1500);
    const launcher = page.locator("[data-workspace-save-launcher]").first();
    await launcher.click().catch(() => {});
    await page.waitForTimeout(800);
    const retry = page.getByRole("button", { name: /重试|Retry/ }).first();
    if (await retry.isVisible().catch(() => false)) {
      await retry.click();
      log("clicked retry");
    }
    await waitCycle(page, helpers, log, "C retry", { timeout: 90000 });
    await shot("save-after-retry");
  }
}
